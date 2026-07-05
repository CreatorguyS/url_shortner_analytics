/**
 * Correlation ID middleware.
 * Injects a unique X-Correlation-ID on every request for distributed tracing.
 */

"use strict";

const { v4: uuidv4 } = require("uuid");

module.exports = function correlationId(req, res, next) {
  const id = req.headers["x-correlation-id"] || uuidv4();
  req.correlationId = id;
  res.setHeader("X-Correlation-ID", id);
  next();
};
