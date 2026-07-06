/**
 * Redis client for URL Service.
 * Provides L2 caching (URL lookups, rate limiting).
 * Supports both Upstash (rediss://) and local Redis (redis://).
 */

"use strict";

const { createClient } = require("redis");
const { createLogger } = require("@url-shortener/shared/logger");

const logger = createLogger("url-service:redis");

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const client = createClient({
  url: REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) return new Error("Redis: max retries exceeded");
      return Math.min(100 * Math.pow(2, retries), 5000);
    },
    tls: REDIS_URL.startsWith("rediss://")
  }
});

client.on("error", (err) => {
  logger.error("Redis error", { error: err.message });
});

(async () => {
  try {
    await client.connect();
    logger.info("Redis connected (URL Service)");
  } catch (err) {
    logger.error("Redis connection failed — running without cache", { error: err.message });
    // Non-fatal: service degrades to DB-only mode
  }
})();

module.exports = client;
