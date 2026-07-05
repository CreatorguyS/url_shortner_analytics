/**
 * Redirect Service — core redirect logic.
 *
 * Fast path:
 *  1. L1 LRU (in-process, ~1μs)
 *  2. L2 Redis Cluster (~0.5ms)
 *  3. MongoDB secondary (~3-10ms) — rare on warm cache
 *  4. Fire-and-forget analytics event (never blocks redirect)
 */

"use strict";

const { getCachedUrl, setCachedUrl } = require("../cache/l1Cache");
const { getShardModel } = require("../db/shard");
const { emitClickEvent } = require("../queue/analytics.queue");
const { decrypt, isEncrypted } = require("@url-shortener/shared/encryption");
const { createLogger } = require("@url-shortener/shared/logger");
const { Histogram, Counter } = require("prom-client");

const logger = createLogger("redirect-service:service");

const redirectDuration = new Histogram({
  name: "redirect_duration_ms",
  help: "Time taken to resolve a redirect (ms)",
  buckets: [0.1, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500]
});

const redirectSource = new Counter({
  name: "redirect_source_total",
  help: "Where the longUrl was resolved from",
  labelNames: ["source"]  // l1, l2, db, not_found
});

function getEncryptionKey() {
  return process.env.URL_ENCRYPTION_KEY;
}

/**
 * Resolve shortCode → longUrl (the hot path).
 * @param {string} shortCode
 * @returns {Promise<string|null>}
 */
async function resolveLongUrl(shortCode) {
  const timer = redirectDuration.startTimer();

  // 1. Cache check (L1 + L2 inside getCachedUrl)
  const cached = await getCachedUrl(shortCode);
  if (cached) {
    const source = cached._source || "l2"; // l1Cache sets this internally
    redirectSource.inc({ source });
    timer();
    return cached;
  }

  // 2. MongoDB shard fallback
  try {
    const Model = getShardModel(shortCode);
    const doc = await Model.findOne(
      { shortCode, isActive: true },
      { longUrl: 1, expiresAt: 1 }
    ).lean();

    if (!doc) {
      redirectSource.inc({ source: "not_found" });
      timer();
      return null;
    }

    // Check TTL
    if (doc.expiresAt && doc.expiresAt < new Date()) {
      redirectSource.inc({ source: "expired" });
      timer();
      return null;
    }

    // Decrypt if needed
    let longUrl = doc.longUrl;
    if (isEncrypted(longUrl) && getEncryptionKey()) {
      try {
        longUrl = decrypt(longUrl, getEncryptionKey());
      } catch (err) {
        logger.error("Decryption failed", { shortCode, error: err.message });
        return null;
      }
    }

    // Cache-refill
    await setCachedUrl(shortCode, longUrl);

    redirectSource.inc({ source: "db" });
    timer();
    return longUrl;
  } catch (err) {
    logger.error("DB lookup failed", { shortCode, error: err.message });
    timer();
    return null;
  }
}

/**
 * Handle a redirect request.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function handleRedirect(req, res) {
  const { shortCode } = req.params;

  if (!shortCode || shortCode.length < 6 || shortCode.length > 12) {
    return res.status(400).json({ error: "Invalid short code" });
  }

  const longUrl = await resolveLongUrl(shortCode);

  if (!longUrl) {
    return res.status(404).json({ error: "URL not found or expired" });
  }

  // Fire-and-forget analytics (no await — never block redirect)
  emitClickEvent(shortCode, {
    ip:        req.headers["x-real-ip"] || req.ip,
    userAgent: req.headers["user-agent"],
    referer:   req.headers["referer"] || req.headers["referrer"] || null
  });

  // 302 temporary redirect (allows analytics to keep counting)
  res.redirect(302, longUrl);
}

module.exports = { handleRedirect, resolveLongUrl };
