/**
 * Circuit Breaker — per-upstream state machine.
 *
 * States:
 *   CLOSED     → Normal operation. Failures are counted.
 *   OPEN       → Upstream is down. All requests rejected immediately.
 *   HALF_OPEN  → Probe request allowed. If it succeeds → CLOSED; if fails → OPEN.
 *
 * State is stored in Redis so all gateway replicas share the same breaker state.
 */

"use strict";

const redis = require("redis");
const { createLogger } = require("@url-shortener/shared/logger");

const logger = createLogger("api-gateway:circuit-breaker");

const THRESHOLD = parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || "5", 10);
const TIMEOUT_MS = parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || "30", 10) * 1000;
const WINDOW_MS = 60_000; // 60s failure counting window

// Reuse single Redis client for circuit breaker state
let redisClient = null;

function getRedis() {
  if (!redisClient) {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || "redis://redis-node-1:6379"
    });
    redisClient.connect().catch((err) =>
      logger.error("Circuit breaker Redis connect error", { error: err.message })
    );
  }
  return redisClient;
}

const STATE = {
  CLOSED: "CLOSED",
  OPEN: "OPEN",
  HALF_OPEN: "HALF_OPEN"
};

/**
 * Creates a circuit breaker for a named upstream service.
 * @param {string} serviceName
 */
function circuitBreakerFactory(serviceName) {
  const stateKey    = `cb:${serviceName}:state`;
  const openUntilKey = `cb:${serviceName}:openUntil`;
  const failCountKey = `cb:${serviceName}:failures`;

  // Local cache to avoid Redis calls on every request (refresh every 500ms)
  let localState = STATE.CLOSED;
  let lastRefresh = 0;

  async function refreshState() {
    const now = Date.now();
    if (now - lastRefresh < 500) return; // use cached value
    lastRefresh = now;

    try {
      const client = getRedis();
      const [state, openUntil] = await Promise.all([
        client.get(stateKey),
        client.get(openUntilKey)
      ]);

      if (state === STATE.OPEN) {
        if (openUntil && now >= parseInt(openUntil, 10)) {
          // Timeout expired — try HALF_OPEN
          await client.set(stateKey, STATE.HALF_OPEN);
          localState = STATE.HALF_OPEN;
        } else {
          localState = STATE.OPEN;
        }
      } else {
        localState = state || STATE.CLOSED;
      }
    } catch {
      // Redis down — default to CLOSED (fail-open for circuit breaker itself)
      localState = STATE.CLOSED;
    }
  }

  // Start background refresh
  setInterval(refreshState, 500).unref();

  return {
    /** Returns true if requests should be forwarded to the upstream. */
    isAvailable() {
      return localState !== STATE.OPEN;
    },

    async recordFailure() {
      try {
        const client = getRedis();
        const failures = await client.incr(failCountKey);
        await client.expire(failCountKey, Math.ceil(WINDOW_MS / 1000));

        if (localState === STATE.HALF_OPEN || failures >= THRESHOLD) {
          const openUntil = Date.now() + TIMEOUT_MS;
          await client.set(stateKey, STATE.OPEN);
          await client.set(openUntilKey, openUntil.toString());
          localState = STATE.OPEN;
          logger.warn(`Circuit OPENED for ${serviceName}`, { failures, openUntil });
        }
      } catch (err) {
        logger.error("recordFailure Redis error", { error: err.message });
      }
    },

    async recordSuccess() {
      if (localState === STATE.HALF_OPEN) {
        try {
          const client = getRedis();
          await client.set(stateKey, STATE.CLOSED);
          await client.del(failCountKey);
          await client.del(openUntilKey);
          localState = STATE.CLOSED;
          logger.info(`Circuit CLOSED (recovered) for ${serviceName}`);
        } catch (err) {
          logger.error("recordSuccess Redis error", { error: err.message });
        }
      }
    }
  };
}

module.exports = circuitBreakerFactory;
