/**
 * Redirect Service — cluster mode server.
 * ALL CPU cores are dedicated to redirect handling (the hot path).
 * Tuned keep-alive timeouts to match NGINX upstream settings.
 */

"use strict";

require("dotenv").config();

const cluster = require("cluster");
const os = require("os");
const { createLogger } = require("@url-shortener/shared/logger");

const logger = createLogger("redirect-service");
const PORT = process.env.REDIRECT_SERVICE_PORT || 3002;

// Use all available CPUs — this service handles the most traffic
const NUM_WORKERS = parseInt(process.env.REDIRECT_WORKERS || os.cpus().length, 10);

if (cluster.isPrimary) {
  logger.info(`Redirect Service master starting ${NUM_WORKERS} workers`);

  for (let i = 0; i < NUM_WORKERS; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    logger.warn(`Redirect worker ${worker.process.pid} died (${signal || code}). Restarting...`);
    cluster.fork();
  });

} else {
  const app     = require("./app");
  const connectDB = require("./db/mongo");

  connectDB().then(() => {
    const server = app.listen(PORT, () => {
      logger.info(`Redirect Service worker ${process.pid} listening on port ${PORT}`);
    });

    // Tuned for high-throughput: match NGINX keepalive_timeout (65s)
    server.keepAliveTimeout = 65_000;
    server.headersTimeout   = 66_000;

    process.on("SIGTERM", () => {
      server.close(() => process.exit(0));
    });
  });
}
