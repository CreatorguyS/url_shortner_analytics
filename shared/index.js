/**
 * Shared utilities barrel export.
 * Each module is also accessible via its individual subpath export
 * (see "exports" in package.json).
 *
 * Usage (individual — preferred):
 *   const { createLogger } = require('@url-shortener/shared/logger');
 *   const generateShortCode = require('@url-shortener/shared/base62');
 *
 * Usage (barrel — legacy fallback):
 *   const { createLogger, generateShortCode } = require('@url-shortener/shared');
 */

"use strict";

module.exports = {
  ...require("./logger"),
  generateShortCode: require("./base62"),
  ...require("./encryption"),
  ...require("./shard")
};
