/**
 * Analytics queue — fire-and-forget click event publisher.
 * Uses BullMQ connected to Redis Cluster.
 *
 * CRITICAL: This is called on every redirect. Errors must NEVER throw.
 * All errors are silently swallowed so redirect latency is unaffected.
 */

"use strict";

const Redis = require("ioredis");
const { Queue } = require("bullmq");
const { createLogger } = require("@url-shortener/shared/logger");

const logger = createLogger("redirect-service:queue");

const REDIS_CLUSTER_NODES = process.env.REDIS_CLUSTER_NODES || "redis-node-1:6379,redis-node-2:6379,redis-node-3:6379";

let analyticsQueue = null;
let redisClusterConnection = null;

function getRedisConnection() {
  if (!redisClusterConnection) {
    const nodes = REDIS_CLUSTER_NODES.split(",").map((node) => {
      const [host, port] = node.split(":");
      return { host, port: parseInt(port, 10) };
    });
    redisClusterConnection = new Redis.Cluster(nodes, {
      redisOptions: {
        maxRetriesPerRequest: null
      }
    });
    redisClusterConnection.on("error", (err) => {
      logger.error("Redis cluster connection error", { error: err.message });
    });
  }
  return redisClusterConnection;
}

function getQueue() {
  if (!analyticsQueue) {
    analyticsQueue = new Queue("{analytics-queue}", {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 3,
        backoff: { type: "exponential", delay: 500 }
      }
    });
    analyticsQueue.on("error", (err) => {
      logger.warn("Analytics queue error (non-fatal)", { error: err.message });
    });
  }
  return analyticsQueue;
}

/**
 * Emit a click event. Fire-and-forget — never awaited in hot path.
 * @param {string} shortCode
 * @param {object} meta - ip, userAgent, referer
 */
function emitClickEvent(shortCode, meta) {
  // No await — genuinely fire-and-forget
  getQueue()
    .add("click", { shortCode, ...meta, timestamp: Date.now() })
    .catch((err) => logger.warn("Failed to enqueue click", { error: err.message, shortCode }));
}

module.exports = { emitClickEvent };
