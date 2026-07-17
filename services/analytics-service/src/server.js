"use strict";
require("dotenv").config();

const express = require("express");
const helmet  = require("helmet");
const compression = require("compression");
const mongoose = require("mongoose");
const analyticsRoutes = require("./routes/analytics.routes");
const { createLogger } = require("@url-shortener/shared/logger");
const { collectDefaultMetrics, register } = require("prom-client");

collectDefaultMetrics({ prefix: "analytics_service_" });
const logger = createLogger("analytics-service");

const MONGO_URI = process.env.MONGO_URI || "mongodb://mongo:27017/url-shortener?replicaSet=rs0";
const PORT = process.env.PORT || process.env.ANALYTICS_SERVICE_PORT || 3003;

const app = express();
app.use(helmet());
app.use(compression());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", service: "analytics-service" }));
app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.use("/", analyticsRoutes);

app.use((err, _req, res, _next) => {
  logger.error("Unhandled error", { error: err.message });
  res.status(500).json({ error: "Internal Server Error" });
});

mongoose.connect(MONGO_URI, { maxPoolSize: 10 })
  .then(() => {
    logger.info("MongoDB connected (analytics-service)");
    const server = app.listen(PORT, "0.0.0.0", () => logger.info(`Analytics Service listening on port ${PORT}`));
    server.keepAliveTimeout = 120_000;
    server.headersTimeout   = 121_000;
  })
  .catch((err) => { logger.error("MongoDB connect failed", { error: err.message }); process.exit(1); });

module.exports = app;
