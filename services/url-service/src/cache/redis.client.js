/**
 * Redis Cluster client for URL Service.
 * Provides L2 caching (URL lookups, rate limiting).
 */

"use strict";

const { createCluster } = require("redis");
const { createLogger } = require("@url-shortener/shared/logger");

const logger = createLogger("url-service:redis");

const CLUSTER_NODES = (process.env.REDIS_CLUSTER_NODES || "redis-node-1:6379,redis-node-2:6379,redis-node-3:6379")
  .split(",")
  .map((node) => {
    const [host, port] = node.trim().split(":");
    return { host, port: parseInt(port, 10) };
  });

const cluster = createCluster({
  rootNodes: CLUSTER_NODES,
  defaults: {
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) return new Error("Redis Cluster: max retries exceeded");
        return Math.min(100 * Math.pow(2, retries), 5000);
      }
    }
  }
});

cluster.on("error", (err) => {
  logger.error("Redis Cluster error", { error: err.message });
});

(async () => {
  try {
    await cluster.connect();
    logger.info("Redis Cluster connected (URL Service)");
  } catch (err) {
    logger.error("Redis Cluster connection failed", { error: err.message });
    // Non-fatal: service degrades to DB-only mode
  }
})();

module.exports = cluster;
