/**
 * URL Service — Express application.
 */

"use strict";

const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const urlRoutes = require("./routes/url.routes");
const { createLogger } = require("@url-shortener/shared/logger");
const { collectDefaultMetrics, register } = require("prom-client");

collectDefaultMetrics({ prefix: "url_service_" });

const logger = createLogger("url-service");

const app = express();

app.use(helmet());
app.use(compression());
app.use(express.json({ limit: "1mb" }));

// Request logger
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`, { correlationId: req.headers["x-correlation-id"] });
  next();
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "url-service", ts: new Date().toISOString() });
});

// Prometheus metrics
app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// Routes
app.use("/", urlRoutes);

// Global error handler
app.use((err, req, res, _next) => {
  logger.error("Unhandled error", {
    error: err.message,
    stack: err.stack,
    correlationId: req.headers["x-correlation-id"]
  });
  res.status(500).json({ error: "Internal Server Error" });
});

module.exports = app;
