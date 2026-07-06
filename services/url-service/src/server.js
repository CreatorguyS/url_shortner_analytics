/**
 * URL Service — cluster mode server.
 * Forks one worker process per CPU core for horizontal scaling.
 */

"use strict";

require("dotenv").config();

const cluster = require("cluster");
const os = require("os");
const { createLogger } = require("@url-shortener/shared/logger");

const logger = createLogger("url-service");
const PORT = process.env.URL_SERVICE_PORT || 3001;
const NUM_WORKERS = parseInt(process.env.URL_SERVICE_WORKERS || os.cpus().length, 10);

if (cluster.isPrimary) {
  logger.info(`URL Service master starting ${NUM_WORKERS} workers`);

  for (let i = 0; i < NUM_WORKERS; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
    cluster.fork();
  });
} else {
  const app = require("./app");
  const connectDB = require("./db/mongo");

  connectDB().then(() => {
    const server = app.listen(PORT, () => {
      logger.info(`URL Service worker ${process.pid} listening on port ${PORT}`);
    });

    // Graceful shutdown
    process.on("SIGTERM", () => {
      logger.info(`Worker ${process.pid} received SIGTERM, shutting down...`);
      server.close(() => {
        logger.info(`Worker ${process.pid} HTTP server closed`);
        process.exit(0);
      });
    });
  });
}
