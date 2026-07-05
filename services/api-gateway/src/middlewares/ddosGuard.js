/**
 * DDoS Guard — Token Bucket per IP.
 *
 * Algorithm: Each IP has a bucket of BURST_LIMIT tokens.
 * Tokens replenish at BURST_LIMIT per WINDOW_MS.
 * If a bucket empties, the IP is blocked for BLOCK_DURATION_MS.
 *
 * Uses a Redis Lua script for atomic token-bucket operations.
 * Falls back gracefully if Redis is unavailable (fail-open).
 */

"use strict";

const redis = require("redis");
const { createLogger } = require("@url-shortener/shared/logger");
const { Counter } = require("prom-client");

const logger = createLogger("api-gateway:ddos-guard");

const BURST_LIMIT    = parseInt(process.env.DDOS_BURST_LIMIT    || "500",   10);
const WINDOW_SEC     = parseInt(process.env.DDOS_WINDOW_SEC     || "1",     10);
const BLOCK_DURATION = parseInt(process.env.DDOS_BLOCK_DURATION || "60",    10); // seconds

const blockedCounter = new Counter({
  name: "ddos_blocked_total",
  help: "Total number of requests blocked by DDoS guard",
  labelNames: ["ip"]
});

let redisClient = null;

function getRedis() {
  if (!redisClient) {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || "redis://redis-node-1:6379"
    });
    redisClient.connect().catch((err) =>
      logger.error("DDoS guard Redis error", { error: err.message })
    );
  }
  return redisClient;
}

/**
 * Lua script: atomic token-bucket decrement.
 * Returns 1 if request is allowed, 0 if blocked.
 */
const TOKEN_BUCKET_LUA = `
local block_key = KEYS[1]
local bucket_key = KEYS[2]
local burst_limit = tonumber(ARGV[1])
local window_sec = tonumber(ARGV[2])
local block_duration = tonumber(ARGV[3])

-- Check if IP is in the blocked set
if redis.call('EXISTS', block_key) == 1 then
  return 0
end

local count = redis.call('INCR', bucket_key)
if count == 1 then
  redis.call('EXPIRE', bucket_key, window_sec)
end

if count > burst_limit then
  redis.call('SET', block_key, 1, 'EX', block_duration)
  redis.call('DEL', bucket_key)
  return 0
end

return 1
`;

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = forwarded ? forwarded.split(",")[0].trim() : req.socket.remoteAddress;
  return raw.replace("::ffff:", "");
}

module.exports = async function ddosGuard(req, res, next) {
  // Skip metrics and health endpoints
  if (req.path === "/metrics" || req.path === "/health") return next();

  const ip = getClientIp(req);
  const blockKey  = `ddos:block:${ip}`;
  const bucketKey = `ddos:bucket:${ip}`;

  try {
    const client = getRedis();
    if (!client.isOpen) return next(); // fail-open

    const result = await client.eval(TOKEN_BUCKET_LUA, {
      keys: [blockKey, bucketKey],
      arguments: [
        BURST_LIMIT.toString(),
        WINDOW_SEC.toString(),
        BLOCK_DURATION.toString()
      ]
    });

    if (result === 0) {
      blockedCounter.inc({ ip });
      logger.warn(`DDoS block: ${ip}`, { correlationId: req.correlationId });
      return res.status(429).json({
        error: "Too many requests — your IP has been temporarily blocked",
        retryAfter: BLOCK_DURATION
      });
    }

    next();
  } catch (err) {
    logger.error("DDoS guard error", { error: err.message });
    next(); // fail-open
  }
};
