/**
 * Sliding Window Rate Limiter — per IP using Redis Sorted Sets.
 *
 * More accurate than fixed-window: uses ZADD / ZREMRANGEBYSCORE / ZCARD
 * to maintain a sliding window of request timestamps per IP.
 *
 * Default: 100 requests per 10-second window.
 * Per-API-key limits (injected by authMiddleware) can override the default.
 */

"use strict";

const redis = require("redis");
const { createLogger } = require("@url-shortener/shared/logger");
const { Counter } = require("prom-client");

const logger = createLogger("api-gateway:rate-limiter");

const WINDOW_SEC  = parseInt(process.env.RATE_LIMIT_WINDOW || "10",  10);
const MAX_DEFAULT = parseInt(process.env.RATE_LIMIT_MAX    || "100", 10);

const rateLimitedCounter = new Counter({
  name: "rate_limited_total",
  help: "Total number of rate-limited requests",
  labelNames: ["key_type"]
});

let redisClient = null;

function getRedis() {
  if (!redisClient) {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || "redis://redis-node-1:6379"
    });
    redisClient.connect().catch((err) =>
      logger.error("Rate limiter Redis error", { error: err.message })
    );
  }
  return redisClient;
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = forwarded ? forwarded.split(",")[0].trim() : req.socket.remoteAddress;
  return raw.replace("::ffff:", "");
}

/**
 * Sliding window rate limit Lua script.
 * KEYS[1]: Redis sorted set key
 * ARGV[1]: current timestamp (ms)
 * ARGV[2]: window start timestamp (ms)
 * ARGV[3]: max requests
 * ARGV[4]: window duration (seconds)
 * Returns: current count after adding this request
 */
const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_start = tonumber(ARGV[2])
local max = tonumber(ARGV[3])
local window_sec = tonumber(ARGV[4])

redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)
local count = redis.call('ZCARD', key)

if count >= max then
  return count
end

redis.call('ZADD', key, now, now .. '-' .. math.random(100000))
redis.call('EXPIRE', key, window_sec)
return count + 1
`;

module.exports = async function rateLimiter(req, res, next) {
  if (req.path === "/metrics" || req.path === "/health") return next();

  const ip = getClientIp(req);
  const keyType = req.apiKeyId ? "api_key" : "ip";
  const identifier = req.apiKeyId || ip;
  const key = `rl:${identifier}`;
  const maxRequests = req.rateLimit || MAX_DEFAULT;

  try {
    const client = getRedis();
    if (!client.isOpen) return next(); // fail-open

    const now = Date.now();
    const windowStart = now - WINDOW_SEC * 1000;

    const count = await client.eval(SLIDING_WINDOW_LUA, {
      keys: [key],
      arguments: [
        now.toString(),
        windowStart.toString(),
        maxRequests.toString(),
        WINDOW_SEC.toString()
      ]
    });

    res.setHeader("X-RateLimit-Limit",     maxRequests);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - count));
    res.setHeader("X-RateLimit-Reset",     Math.ceil((now + WINDOW_SEC * 1000) / 1000));

    if (count > maxRequests) {
      rateLimitedCounter.inc({ key_type: keyType });
      return res.status(429).json({
        error: "Rate limit exceeded",
        retryAfter: WINDOW_SEC
      });
    }

    next();
  } catch (err) {
    logger.error("Rate limiter error", { error: err.message });
    next(); // fail-open
  }
};
