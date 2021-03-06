# Change Log

## v3.1.2

* Deprecated `getAllJson` in favor of `getAll`
* 'getAllJson' no longer designated as experimental.
* Fixed paging in `getAllJson`

## v3.1.1

* Temporary fix for FireFox not supporting `Error.captureStackTrace`
* Fixed various bugs with error handling.
* Added `DNSLookupError`

## v3.1.0

* Added `concurrencyLimit` option to the constructor
* Updated `qs`

## v3.0.0

* Added `rateLimiting` option to the constructor
* Added `mimeType` option to requests
* Setting `opts.headers.Accept` and `opts.headers['Contenty-Type']` overrides json defaults
* Fixed bug where `get` and `delete` set `Contenty-Type`
* Replaced `q` with `es6-promise`
* Added error type `RateLimitExceededError`
* Added `afterRequest` config function to transform response objects
* Replaced `gulp` with npm scripts
* Replaced `jshint` for `eslint`
* Methods now allow the format .method(url[string], opts[object]);
* Added error types `SystemServiceUnavailableError` and `SystemServiceUnavailableError`
* `getJson`, `postJson`, `putJson`, and `deleteJson` are deprecated
* Replaced `request` with `axios` adapter to make `anx-api` isomorphic

## v2.2.0

* Updated `qs` and `lodash`
* Allows null or undefined urls
* Allows unsetting 'User-Agent' with config.userAgent = null
* Added `beforeRequest` config function to transform request options
* Added ability to set default headers in the config.
* Added change log

## v2.x

* Methods return promises and callbacks are removed.
