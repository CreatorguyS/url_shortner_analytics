/**
 * API Gateway — main entry point.
 *
 * Responsibilities:
 *  - Inject Correlation ID on every request
 *  - DDoS guard (token-bucket burst detection)
 *  - Sliding-window rate limiter (per-IP)
 *  - API key authentication (optional, via X-API-Key header)
 *  - Circuit breaker per upstream service
 *  - Reverse proxy to upstream microservices
 *  - Prometheus /metrics endpoint
 */

"use strict";

require("dotenv").config();

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const compression = require("compression");

const { createLogger } = require("@url-shortener/shared/logger");
const correlationId = require("./middlewares/correlationId");
const ddosGuard = require("./middlewares/ddosGuard");
const rateLimiter = require("./middlewares/rateLimiter");
const authMiddleware = require("./middlewares/authMiddleware");
const { createProxyMiddleware } = require("http-proxy-middleware");
const circuitBreakerFactory = require("./circuitBreaker");
const metricsMiddleware = require("./metrics");
const { register } = require("prom-client");

const logger = createLogger("api-gateway");

/**
 * fetch() with a timeout — compatible with all Node.js versions.
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} [ms=5000]
 */
async function fetchWithTimeout(url, options, ms = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const app = express();
app.set("trust proxy", 1);

// ─── Security & Compression ──────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https://*"],
      connectSrc: ["'self'", "https://*", "wss://*", "http://*", "ws://*"]
    }
  }
}));
app.use(compression());

// ─── Correlation ID (inject before everything else) ──────────────────────────
app.use(correlationId);

// ─── Request logging ─────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`, { correlationId: req.correlationId });
  next();
});

// ─── DDoS Guard (burst detection, IP-level blocking) ─────────────────────────
app.use(ddosGuard);

// ─── Sliding Window Rate Limiter ──────────────────────────────────────────────
app.use(rateLimiter);

// ─── Prometheus Metrics Endpoint ─────────────────────────────────────────────
app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api-gateway", ts: new Date().toISOString() });
});

// ─── Circuit Breaker instances per upstream ───────────────────────────────────
const urlCB       = circuitBreakerFactory("url-service");
const redirectCB  = circuitBreakerFactory("redirect-service");
const analyticsCB = circuitBreakerFactory("analytics-service");
const authCB      = circuitBreakerFactory("auth-service");

// ─── Upstream URLs ────────────────────────────────────────────────────────────
const URL_SERVICE_TARGET       = process.env.URL_SERVICE_URL       || "http://url-service:3001";
const REDIRECT_SERVICE_TARGET  = process.env.REDIRECT_SERVICE_URL  || "http://redirect-service:3002";
const ANALYTICS_SERVICE_TARGET = process.env.ANALYTICS_SERVICE_URL || "http://analytics-service:3003";
const AUTH_SERVICE_TARGET      = process.env.AUTH_SERVICE_URL      || "http://auth-service:3004";

/**
 * Build a proxy middleware wrapped with circuit breaker.
 */
function makeProxy(target, cb, pathRewrite) {
  return [
    metricsMiddleware(target),
    (req, res, next) => {
      if (!cb.isAvailable()) {
        logger.warn(`Circuit OPEN for ${target}`, { correlationId: req.correlationId });
        return res.status(503).json({ error: "Service temporarily unavailable", retryAfter: 30 });
      }
      next();
    },
    createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite,
      on: {
        error: (err, req, res) => {
          cb.recordFailure();
          logger.error(`Proxy error → ${target}`, { error: err.message, correlationId: req.correlationId });
          if (!res.headersSent) {
            res.status(502).json({ error: "Bad Gateway" });
          }
        },
        proxyReq: (proxyReq, req) => {
          // Forward correlation ID and real IP to upstream
          proxyReq.setHeader("X-Correlation-ID", req.correlationId || "");
          proxyReq.setHeader("X-Real-IP", req.ip || "");
          if (req.userId) proxyReq.setHeader("X-User-ID", req.userId);
        },
        proxyRes: (_proxyRes, _req) => {
          cb.recordSuccess();
        }
      }
    })
  ];
}

// ─── Quickstart: auto-provision an API key without exposing admin token ───────
app.post("/quickstart", async (req, res) => {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) return res.status(500).json({ error: "Server not configured." });

  try {
    const tokenResp = await fetchWithTimeout(`${AUTH_SERVICE_TARGET}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminToken })
    }, 60000); // 60s — Render free tier cold-start can take 30-60s

    if (!tokenResp.ok) return res.status(401).json({ error: "Auth failed." });
    const { token: jwt } = await tokenResp.json();

    const keyResp = await fetchWithTimeout(`${AUTH_SERVICE_TARGET}/keys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwt}`
      },
      body: JSON.stringify({ name: "User Key" })
    }, 60000); // 60s — Render free tier cold-start can take 30-60s

    if (!keyResp.ok) return res.status(500).json({ error: "Could not create key." });
    const { key } = await keyResp.json();

    res.json({ key });
  } catch (err) {
    logger.error("Quickstart error", { error: err.message });
    res.status(500).json({ error: "Internal error." });
  }
});

// ─── Auth routes (no auth required to reach auth service itself) ──────────────
app.use("/auth", ...makeProxy(AUTH_SERVICE_TARGET, authCB, {}));

// ─── URL creation & management (optional API key auth) ───────────────────────
app.use("/api/url",      authMiddleware, ...makeProxy(URL_SERVICE_TARGET, urlCB, {}));
app.use("/api/analytics", authMiddleware, ...makeProxy(ANALYTICS_SERVICE_TARGET, analyticsCB, {}));

// Serve static frontend dashboard (CSS, JS, images)
app.use(express.static(path.join(__dirname, "../public")));

// Serve the dashboard UI at root
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// ─── Redirect hot path (public, no auth — just rate limit + DDoS) ────────────
// Only match short-code paths (alphanumeric slugs), not root or API paths
app.use("/", ...makeProxy(REDIRECT_SERVICE_TARGET, redirectCB, {}));

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || process.env.API_GATEWAY_PORT || 3000;
app.listen(PORT, () => {
  logger.info(`API Gateway listening on port ${PORT}`);
});

module.exports = app;
