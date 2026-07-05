"use strict";
require("dotenv").config();

const express = require("express");
const helmet  = require("helmet");
const compression = require("compression");
const mongoose = require("mongoose");
const authRoutes = require("./routes/auth.routes");
const { createLogger } = require("@url-shortener/shared/logger");
const { collectDefaultMetrics, register } = require("prom-client");

collectDefaultMetrics({ prefix: "auth_service_" });
const logger = createLogger("auth-service");

const MONGO_URI = process.env.MONGO_URI || "mongodb://mongo:27017/url-shortener?replicaSet=rs0";
const PORT = process.env.AUTH_SERVICE_PORT || 3004;

const app = express();
app.use(helmet());
app.use(compression());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", service: "auth-service" }));
app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.use("/", authRoutes);

app.use((err, _req, res, _next) => {
  logger.error("Unhandled error", { error: err.message });
  res.status(500).json({ error: "Internal Server Error" });
});

mongoose.connect(MONGO_URI, { maxPoolSize: 5 })
  .then(() => {
    logger.info("MongoDB connected (auth-service)");
    app.listen(PORT, () => logger.info(`Auth Service listening on port ${PORT}`));
  })
  .catch((err) => { logger.error("MongoDB connect failed", { error: err.message }); process.exit(1); });

module.exports = app;
