/**
 * Redirect Service — Express app.
 * Intentionally lean: no body parser, minimal middleware, pure redirect throughput.
 */

"use strict";

const express = require("express");
const helmet  = require("helmet");
const redirectRoutes = require("./routes/redirect.routes");
const { createLogger } = require("@url-shortener/shared/logger");
const { collectDefaultMetrics, register } = require("prom-client");

collectDefaultMetrics({ prefix: "redirect_service_" });

const logger = createLogger("redirect-service");
const app = express();

// Minimal security headers — no body parsing needed for redirect
app.use(helmet({ contentSecurityPolicy: false }));

// Health check — must be fast
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "redirect-service", ts: new Date().toISOString() });
});

// Prometheus metrics
app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// Redirect routes — the only real route in this service
app.use("/", redirectRoutes);

// Error handler
app.use((err, req, res, _next) => {
  logger.error("Redirect error", {
    error: err.message,
    correlationId: req.headers["x-correlation-id"]
  });
  res.status(500).json({ error: "Internal Server Error" });
});

module.exports = app;
