/**
 * Redirect Service — L1 LRU Cache (50k entries, hot path optimized).
 * L2: Redis single-node (compatible with Upstash rediss://)
 */

"use strict";

const { LRUCache } = require("lru-cache");
const { createClient } = require("redis");
const { createLogger } = require("@url-shortener/shared/logger");
const { Counter } = require("prom-client");

const logger = createLogger("redirect-service:cache");

const L1_MAX    = parseInt(process.env.REDIRECT_L1_CACHE_MAX    || "50000", 10);
const L1_TTL_MS = parseInt(process.env.REDIRECT_L1_CACHE_TTL_SEC || "60",   10) * 1000;
const L2_TTL_SEC = parseInt(process.env.L2_CACHE_TTL_SEC         || "3600",  10);

const l1HitCounter = new Counter({ name: "redirect_l1_cache_hits_total",  help: "Redirect L1 hits" });
const l2HitCounter = new Counter({ name: "redirect_l2_cache_hits_total",  help: "Redirect L2 hits" });
const missCounter  = new Counter({ name: "redirect_cache_misses_total",    help: "Redirect cache misses" });

// L1: large in-process LRU
const l1 = new LRUCache({
  max: L1_MAX,
  ttl: L1_TTL_MS,
  allowStale: false
});

// L2: Redis (Upstash compatible)
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const redisClient = createClient({
  url: REDIS_URL,
  socket: {
    reconnectStrategy: (retries) =>
      retries > 10 ? new Error("max retries") : Math.min(100 * Math.pow(2, retries), 5000),
    tls: REDIS_URL.startsWith("rediss://")
  }
});

redisClient.on("error", (err) => logger.error("Redis error", { error: err.message }));

(async () => {
  try {
    await redisClient.connect();
    logger.info("Redis connected (redirect-service)");
  } catch (err) {
    logger.error("Redis connect failed — L2 cache disabled", { error: err.message });
  }
})();

const CACHE_PREFIX = "url:";

/**
 * Get a long URL from cache (L1 → L2).
 * @param {string} shortCode
 * @returns {Promise<string|null>}
 */
async function getCachedUrl(shortCode) {
  const key = `${CACHE_PREFIX}${shortCode}`;

  // L1 — in-process, ~1μs
  const l1Val = l1.get(key);
  if (l1Val !== undefined) {
    l1HitCounter.inc();
    return l1Val;
  }

  // L2 — Redis, ~0.5ms
  try {
    if (redisClient.isOpen) {
      const l2Val = await redisClient.get(key);
      if (l2Val) {
        l2HitCounter.inc();
        l1.set(key, l2Val); // warm L1
        return l2Val;
      }
    }
  } catch (err) {
    logger.warn("L2 cache get error", { error: err.message });
  }

  missCounter.inc();
  return null;
}

/**
 * Store a long URL in both cache tiers.
 * @param {string} shortCode
 * @param {string} longUrl
 */
async function setCachedUrl(shortCode, longUrl) {
  const key = `${CACHE_PREFIX}${shortCode}`;
  l1.set(key, longUrl);
  try {
    if (redisClient.isOpen) {
      await redisClient.set(key, longUrl, { EX: L2_TTL_SEC });
    }
  } catch (err) {
    logger.warn("L2 cache set error", { error: err.message });
  }
}

module.exports = { getCachedUrl, setCachedUrl };
