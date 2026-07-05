/**
 * L1 In-Process LRU Cache + L2 Redis Cluster facade.
 *
 * Cache waterfall:
 *   L1 (LRU, in-memory, ~1μs) → L2 (Redis Cluster, ~0.5ms) → miss
 *
 * L1 is per-process (not shared between workers), so it's warmed independently.
 * L2 is shared across all service replicas and workers.
 */

"use strict";

const { LRUCache } = require("lru-cache");
const redisCluster = require("./redis.client");
const { createLogger } = require("@url-shortener/shared/logger");
const { Counter } = require("prom-client");

const logger = createLogger("url-service:cache");

const L1_TTL_MS = parseInt(process.env.L1_CACHE_TTL_SEC  || "60",  10) * 1000;
const L2_TTL_SEC = parseInt(process.env.L2_CACHE_TTL_SEC || "3600", 10); // 1 hour
const L1_MAX     = parseInt(process.env.L1_CACHE_MAX      || "10000", 10);

const l1HitCounter = new Counter({ name: "url_service_l1_cache_hits_total",   help: "L1 cache hits" });
const l2HitCounter = new Counter({ name: "url_service_l2_cache_hits_total",   help: "L2 cache hits" });
const missCounter  = new Counter({ name: "url_service_cache_misses_total",     help: "Cache misses (DB fallback)" });

const l1 = new LRUCache({
  max: L1_MAX,
  ttl: L1_TTL_MS,
  allowStale: false,
  updateAgeOnGet: false
});

/**
 * Get a value from the cache (L1 → L2).
 * @param {string} key
 * @returns {string|null}
 */
async function cacheGet(key) {
  // L1 check
  const l1Val = l1.get(key);
  if (l1Val !== undefined) {
    l1HitCounter.inc();
    return l1Val;
  }

  // L2 check
  try {
    if (redisCluster.isOpen) {
      const l2Val = await redisCluster.get(key);
      if (l2Val !== null) {
        l2HitCounter.inc();
        l1.set(key, l2Val); // warm L1
        return l2Val;
      }
    }
  } catch (err) {
    logger.warn("L2 cache get error", { error: err.message, key });
  }

  missCounter.inc();
  return null;
}

/**
 * Set a value in both L1 and L2 caches.
 * @param {string} key
 * @param {string} value
 * @param {number} [ttlSec]
 */
async function cacheSet(key, value, ttlSec = L2_TTL_SEC) {
  l1.set(key, value);
  try {
    if (redisCluster.isOpen) {
      await redisCluster.set(key, value, { EX: ttlSec });
    }
  } catch (err) {
    logger.warn("L2 cache set error", { error: err.message, key });
  }
}

/**
 * Invalidate a key from both L1 and L2.
 * @param {string} key
 */
async function cacheInvalidate(key) {
  l1.delete(key);
  try {
    if (redisCluster.isOpen) {
      await redisCluster.del(key);
    }
  } catch (err) {
    logger.warn("L2 cache delete error", { error: err.message, key });
  }
}

module.exports = { cacheGet, cacheSet, cacheInvalidate };
