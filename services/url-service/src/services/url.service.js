/**
 * URL Service — business logic.
 *
 * Uses multi-tier caching (L1 LRU → L2 Redis Cluster → MongoDB shard).
 * Encryption is transparent via Mongoose hooks on url.model.js.
 */

"use strict";

const generateShortCode = require("@url-shortener/shared/base62");
const { getShardModel, getAllShardModels } = require("../db/shard");
const { cacheGet, cacheSet, cacheInvalidate } = require("../cache/l1Cache");
const { createLogger } = require("@url-shortener/shared/logger");

const logger = createLogger("url-service:service");

const CACHE_PREFIX = "url:";

/**
 * Normalize a URL by ensuring it has a scheme.
 * @param {string} url
 * @returns {string}
 */
function normalizeUrl(url) {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return "https://" + url;
  }
  return url;
}

/**
 * Validate a URL string.
 * @param {string} url
 * @returns {boolean}
 */
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a new short URL.
 * Retries with a new code on collision (extremely rare with 7-char Base62).
 * @param {string} longUrl
 * @param {string} [createdBy='public']
 * @param {Date|null} [expiresAt=null]
 * @returns {Promise<{shortCode: string, longUrl: string, clicks: number, createdAt: Date}>}
 */
async function createShortUrl(longUrl, createdBy = "public", expiresAt = null) {
  longUrl = normalizeUrl(longUrl);
  if (!isValidUrl(longUrl)) throw Object.assign(new Error("Invalid URL"), { status: 400 });

  let shortCode;
  let Model;
  let attempts = 0;

  // Retry loop for collision avoidance
  while (attempts < 5) {
    shortCode = generateShortCode(7);
    Model = getShardModel(shortCode);

    const exists = await Model.findOne({ shortCode }).select("shortCode").lean();
    if (!exists) break;

    attempts++;
    logger.warn("Short code collision, retrying", { shortCode, attempt: attempts });
  }

  if (attempts >= 5) throw new Error("Failed to generate unique short code");

  const url = await Model.create({
    shortCode,
    longUrl,   // encrypted by pre('save') hook
    createdBy,
    expiresAt
  });

  // Prime the cache immediately (L1 + L2)
  await cacheSet(`${CACHE_PREFIX}${shortCode}`, longUrl);

  logger.info("Short URL created", { shortCode, createdBy });

  return {
    shortCode: url.shortCode,
    longUrl:   url.longUrl, // decrypted by post('find') hook
    clicks:    url.clicks,
    createdAt: url.createdAt
  };
}

/**
 * Get the long URL for a shortCode.
 * Cache-aside pattern: L1 → L2 → DB shard.
 * @param {string} shortCode
 * @returns {Promise<string|null>}
 */
async function getLongUrl(shortCode) {
  const cacheKey = `${CACHE_PREFIX}${shortCode}`;

  // 1. Multi-tier cache
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  // 2. DB fallback (correct shard via hash)
  const Model = getShardModel(shortCode);
  const url = await Model.findOne({ shortCode, isActive: true }).lean();

  if (!url) return null;
  if (url.expiresAt && url.expiresAt < new Date()) return null;

  // 3. Cache refill
  await cacheSet(cacheKey, url.longUrl);

  return url.longUrl;
}

/**
 * Get full URL document with stats.
 * @param {string} shortCode
 * @returns {Promise<object|null>}
 */
async function getUrlInfo(shortCode) {
  const Model = getShardModel(shortCode);
  return Model.findOne({ shortCode }).lean();
}

/**
 * Soft-delete (deactivate) a URL.
 * @param {string} shortCode
 * @param {string} requesterId
 * @returns {Promise<boolean>}
 */
async function deleteUrl(shortCode, requesterId) {
  const Model = getShardModel(shortCode);
  const result = await Model.findOneAndUpdate(
    { shortCode, createdBy: requesterId },
    { isActive: false },
    { new: true }
  );

  if (result) {
    await cacheInvalidate(`${CACHE_PREFIX}${shortCode}`);
    logger.info("URL deactivated", { shortCode, requesterId });
  }

  return !!result;
}

/**
 * List URLs created by a specific API key (scatter-gather all shards).
 * @param {string} createdBy
 * @param {number} [limit=20]
 * @param {number} [skip=0]
 * @returns {Promise<object[]>}
 */
async function listUrlsByOwner(createdBy, limit = 20, skip = 0) {
  const models = getAllShardModels();
  const results = await Promise.all(
    models.map((M) =>
      M.find({ createdBy, isActive: true })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    )
  );
  return results.flat().sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

module.exports = { createShortUrl, getLongUrl, getUrlInfo, deleteUrl, listUrlsByOwner };
