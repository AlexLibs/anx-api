var _ = require('lodash');
var url = require('url');
var query = require('qs');
var Promise = require('es6-promise').Promise;
var errors = require('./errors');
var deprecated = require('./deprecated');
var packageJson = require('../package.json');
var axiosAdapter = require('./axiosAdapter');
var rateLimitAdapter = require('./rateLimitAdapter');
var concurrencyAdapter = require('./concurrencyAdapter');

function _hasValue(value) {
	return !(_.isNull(value) || _.isUndefined(value));
}

function _isInteger(value) {
	return parseInt(value, 10) === +value;
}

function _normalizeOpts(opts, extendOpts) {
	var newOpts = _.isString(opts) ? {
		uri: opts
	} : opts || {};
	return _.assign({}, newOpts, extendOpts);
}

function _statusOk(body) {
	return !!body && !!body.response && body.response.status === 'OK';
}

function request(opts) {
	var _self = this;
	return new Promise(function requestPromise(resolve, reject) {
		var params;
		var startTime = new Date().getTime();

		if (_.isEmpty(_self._config.target)) {
			return reject(new errors.TargetError('Target not set'));
		}

		// Validate Opts
		_.forEach(_.pick(opts, ['startElement', 'numElements']), function validate(value, opt) {
			if (_hasValue(value) && !_isInteger(value)) {
				return reject(new Error('invalid ' + opt + ': ' + value));
			}
		});

		// Configure Options
		var reqOpts = _.assign({}, {
			rejectUnauthorized: false,
			headers: _.assign({}, _self._config.headers)
		});

		reqOpts.method = (opts.method || 'GET').toUpperCase();
		reqOpts.params = _.assign({}, opts.params);
		reqOpts.body = opts.body;

		if (_self._config.userAgent) {
			reqOpts.headers['User-Agent'] = _self._config.userAgent;
		}

		if (!opts.noAuth && !opts.auth && _self._config.token) {
			reqOpts.headers.Authorization = _self._config.token;
		}

		if (opts.mimeType) {
			reqOpts.headers.Accept = opts.mimeType;
			if (opts.method === 'POST' || opts.method === 'PUT') {
				reqOpts.headers['Content-Type'] = opts.mimeType;
			}
		} else {
			// Default Accept to application/json
			reqOpts.headers.Accept = _.get(opts, 'headers.Accept', 'application/json');

			// Default Content-Type to application/json for POSTs and PUTs
			if (reqOpts.method === 'POST' || reqOpts.method === 'PUT') {
				reqOpts.headers['Content-Type'] = _.get(opts, 'headers.Content-Type', 'application/json');
			}
		}

		reqOpts.headers = _.assign({}, reqOpts.headers, opts.headers);

		reqOpts.uri = url.resolve(_self._config.target, _.trimStart(opts.uri, '/'));

		// Configure Parameters
		if (_hasValue(opts.startElement)) {
			reqOpts.params.start_element = +opts.startElement;
		}
		if (_hasValue(opts.numElements)) {
			reqOpts.params.num_elements = +opts.numElements;
			reqOpts.params.start_element = +opts.startElement || reqOpts.params.start_element || 0; // startElement is required if numElements is set
		}

		params = decodeURIComponent(query.stringify(reqOpts.params));

		if (params !== '') {
			reqOpts.uri += (opts.uri.indexOf('?') === -1) ? '?' : '&';
			reqOpts.uri += params;
		}

		if (_self._config.beforeRequest) {
			var beforeRequestOpts = _self._config.beforeRequest(reqOpts);
			if (beforeRequestOpts) {
				reqOpts = _.assign({}, reqOpts, beforeRequestOpts);
			}
		}

		return _self._config.request(reqOpts).then(function success(res) {
			var newRes = res;

			newRes.requestTime = new Date().getTime() - startTime;

			if (_self._config.afterRequest) {
				var afterRequestRes = _self._config.afterRequest(newRes);
				if (afterRequestRes) {
					newRes = _.assign({}, newRes, afterRequestRes);
				}
			}

			if (newRes instanceof Error || newRes.statusCode >= 400) {
				return reject(errors.buildError(newRes));
			}

			// Temporary fix
			var errorId;
			var errorCode;
			if (newRes.body && newRes.body.response && newRes.body.response) {
				errorId = newRes.body.response.error_id;
				errorCode = newRes.body.response.error_code;
			}
			if (errorId === 'SYSTEM' && errorCode === 'SERVICE_UNAVAILABLE') {
				return reject(errors.buildError(newRes));
			}
			if (errorId === 'SYSTEM' && errorCode === 'UNKNOWN') {
				return reject(errors.buildError(newRes));
			}

			return resolve(newRes);
		}).catch(function failure(err) {
			var newErr;
			if (_self._config.afterRequest) {
				newErr = _self._config.afterRequest(err);
			}
			return reject(newErr || err);
		});
	});
}

function AnxApi(config) {
	this._config = _.defaults({}, config, {
		request: axiosAdapter,
		userAgent: 'anx-api/' + packageJson.version,
		headers: {},
		target: null,
		token: null
	});

	this.request = request.bind(this);

	this.request = this._config.rateLimiting ? rateLimitAdapter({
		request: this.request
	}) : this.request;

	this.request = this._config.concurrencyLimit ? concurrencyAdapter({
		limit: this._config.concurrencyLimit,
		request: this.request
	}) : this.request;
}

// Bind error types on the AnxApi namespace
_.assign(AnxApi, errors);

AnxApi.prototype._request = function __request(opts) {
	var _self = this;
	return _self.request(opts);
};

AnxApi.prototype.request = function _request(opts, extendOpts) {
	var newOpts = _normalizeOpts(opts, extendOpts);
	return this._request(newOpts);
};

AnxApi.prototype.requestJson = function _requestJson(opts, extendOpts) {
	deprecated.method('requestJson', 'AnxApi', 'request');
	return this._request(opts, extendOpts);
};

AnxApi.prototype.get = function _get(opts, extendOpts) {
	var newOpts = _normalizeOpts(opts, extendOpts);
	newOpts.method = 'GET';
	return this._request(newOpts);
};

AnxApi.prototype.getJson = function _getJson(opts, extendOpts) {
	deprecated.method('getJson', 'AnxApi', 'get');
	return this.get(opts, extendOpts);
};

AnxApi.prototype.getAll = function _getAll(opts, extendOpts) {
	var _self = this;
	var newOpts = _normalizeOpts(opts, extendOpts);
	var numElements = opts.num_elements || 100;

	return new Promise(function getAllPromise(resolve, reject) {
		var objs = [];
		var totalTime = 0;

		function _getJson(startElement) {
			newOpts.startElement = startElement;

			return _self.get(newOpts).then(function success(res) {
				var response = res.body.response;
				var outputTerm = response.dbg_info.output_term;

				totalTime += response.dbg_info.time || 0;
				objs = objs.concat(response[outputTerm]);
				if (response.count <= startElement + numElements) {
					// Modify response
					response.start_element = 0;
					response.num_elements = objs.length;
					response.dbg_info.time = totalTime;
					response[outputTerm] = objs;
					return resolve(res);
				} else {
					return _getJson(startElement + numElements);
				}
			}).catch(reject);
		}

		return _getJson(0);
	});
};

AnxApi.prototype.getAllJson = function _getAllJson(opts, extendOpts) {
	deprecated.method('getAllJson', 'AnxApi', 'getAll');
	return this.getAll(opts, extendOpts);
};

AnxApi.prototype.post = function _post(opts, payload, extendOpts) {
	var newOpts = _normalizeOpts(opts, extendOpts);
	newOpts.method = 'POST';
	if (payload) {
		newOpts.body = payload;
	}
	return this._request(newOpts);
};

AnxApi.prototype.postJson = function _postJson(opts, payload, extendOpts) {
	deprecated.method('postJson', 'AnxApi', 'post');
	return this.post(opts, payload, extendOpts);
};

AnxApi.prototype.put = function _put(opts, payload, extendOpts) {
	var newOpts = _normalizeOpts(opts, extendOpts);
	newOpts.method = 'PUT';
	if (payload) {
		newOpts.body = payload;
	}
	return this._request(newOpts);
};

AnxApi.prototype.putJson = function _putJson(opts, payload, extendOpts) {
	deprecated.method('putJson', 'AnxApi', 'put');
	return this.put(opts, payload, extendOpts);
};

AnxApi.prototype.delete = function _delete(opts, extendOpts) {
	var newOpts = _normalizeOpts(opts, extendOpts);
	newOpts.method = 'DELETE';
	return this._request(newOpts);
};

AnxApi.prototype.deleteJson = function _deleteJson(opts, extendOpts) {
	deprecated.method('deleteJson', 'AnxApi', 'delete');
	return this.delete(opts, extendOpts);
};

AnxApi.prototype.login = function _login(username, password) {
	var _self = this;
	return _self.post('/auth', {
		auth: {
			username: username,
			password: password
		}
	}).then(function success(res) {
		if (res.statusCode === 200 && AnxApi.statusOk(res.body)) {
			_self._config.token = res.body.response.token;
			return _self._config.token;
		} else {
			throw AnxApi.buildError(res);
		}
	});
};

AnxApi.prototype.switchUser = function _switchUser(userId) {
	var _self = this;
	return _self.post('/auth', {
		auth: {
			switch_to_user: userId
		}
	});
};

AnxApi.statusOk = _statusOk;

module.exports = AnxApi;
