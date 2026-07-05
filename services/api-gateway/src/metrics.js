/**
 * Prometheus metrics middleware for the API Gateway.
 * Tracks request duration per upstream target.
 */

"use strict";

const { Histogram, Counter, collectDefaultMetrics, register } = require("prom-client");

collectDefaultMetrics({ prefix: "gateway_" });

const httpDuration = new Histogram({
  name: "gateway_http_request_duration_ms",
  help: "Duration of HTTP requests proxied by the gateway (ms)",
  labelNames: ["method", "route", "status_code", "upstream"],
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]
});

const requestCount = new Counter({
  name: "gateway_http_requests_total",
  help: "Total number of HTTP requests through the gateway",
  labelNames: ["method", "route", "status_code", "upstream"]
});

/**
 * Returns a middleware that records timing for a specific upstream.
 * @param {string} upstream - e.g. "http://url-service:3001"
 */
module.exports = function metricsMiddleware(upstream) {
  return (req, res, next) => {
    const start = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - start;
      const route = req.route?.path || req.path || "unknown";
      const labels = {
        method:      req.method,
        route,
        status_code: res.statusCode.toString(),
        upstream
      };
      httpDuration.observe(labels, duration);
      requestCount.inc(labels);
    });

    next();
  };
};

module.exports.register = register;
