/**
 * Winston logger factory — shared across all microservices.
 * Usage: const logger = require('@url-shortener/shared/logger').createLogger('url-service');
 */

"use strict";

const { createLogger: winstonCreateLogger, format, transports } = require("winston");

const { combine, timestamp, json, colorize, printf, errors } = format;

const isProd = process.env.NODE_ENV === "production";

/**
 * Create a service-scoped logger.
 * @param {string} serviceName - e.g. 'api-gateway', 'url-service'
 * @returns {import('winston').Logger}
 */
function createLogger(serviceName) {
  const devFormat = combine(
    colorize({ all: true }),
    timestamp({ format: "HH:mm:ss" }),
    errors({ stack: true }),
    printf(({ timestamp, level, message, correlationId, ...meta }) => {
      const cid = correlationId ? ` [${correlationId}]` : "";
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
      return `${timestamp} [${serviceName}]${cid} ${level}: ${message}${metaStr}`;
    })
  );

  const prodFormat = combine(
    timestamp(),
    errors({ stack: true }),
    json()
  );

  return winstonCreateLogger({
    level: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),
    defaultMeta: { service: serviceName },
    format: isProd ? prodFormat : devFormat,
    transports: [new transports.Console()],
    exitOnError: false
  });
}

module.exports = { createLogger };
