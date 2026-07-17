/**
 * API Key authentication middleware.
 *
 * Validates X-API-Key header by calling the Auth Service.
 * Results are cached in Redis for 5 minutes to avoid inter-service calls on every request.
 *
 * Behavior:
 *  - No X-API-Key → public request (allowed, but default rate limit applies)
 *  - Valid X-API-Key → injects req.apiKeyId and req.rateLimit (per-key overrides)
 *  - Invalid X-API-Key → 401 Unauthorized
 */

"use strict";

const redis = require("redis");
const { createLogger } = require("@url-shortener/shared/logger");

const logger = createLogger("api-gateway:auth");

const AUTH_SERVICE_URL    = process.env.AUTH_SERVICE_URL    || "http://auth-service:3004";
const AUTH_CACHE_TTL_SEC  = 300; // 5 minutes

let redisClient = null;

function getRedis() {
  if (!redisClient) {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || "redis://redis-node-1:6379"
    });
    redisClient.connect().catch((err) =>
      logger.error("Auth middleware Redis error", { error: err.message })
    );
  }
  return redisClient;
}

module.exports = async function authMiddleware(req, res, next) {
  const apiKey = req.headers["x-api-key"];

  // No API key provided → treat as public request
  if (!apiKey) return next();

  const cacheKey = `auth:key:${apiKey}`;

  try {
    // 1. Check Redis cache first
    const client = getRedis();
    if (client.isOpen) {
      const cached = await client.get(cacheKey);
      if (cached !== null) {
        if (cached === "INVALID") {
          return res.status(401).json({ error: "Invalid API key" });
        }
        const data = JSON.parse(cached);
        req.apiKeyId  = data.id;
        req.rateLimit = data.rateLimit;
        return next();
      }
    }

    // 2. Call Auth Service (30s timeout — Render free tier cold-start)
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    let response;
    try {
      response = await fetch(`${AUTH_SERVICE_URL}/validate`, {
        method: "GET",
        headers: {
          "X-API-Key":        apiKey,
          "X-Correlation-ID": req.correlationId || "",
          "Content-Type":     "application/json"
        },
        signal: ctrl.signal
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // Cache negative result
      if (client.isOpen) await client.set(cacheKey, "INVALID", { EX: AUTH_CACHE_TTL_SEC });
      return res.status(401).json({ error: "Invalid API key" });
    }

    const data = await response.json();

    // Cache positive result
    if (client.isOpen) {
      await client.set(cacheKey, JSON.stringify(data), { EX: AUTH_CACHE_TTL_SEC });
    }

    req.apiKeyId  = data.id;
    req.rateLimit = data.rateLimit;
    next();
  } catch (err) {
    logger.error("Auth middleware error", { error: err.message, correlationId: req.correlationId });
    // Fail-open: allow the request but without elevated permissions
    next();
  }
};
