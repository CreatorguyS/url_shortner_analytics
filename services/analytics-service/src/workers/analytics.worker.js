/**
 * Analytics Worker — BullMQ consumer.
 *
 * Processes click events from the 'analytics-queue'.
 * Batches DB writes: accumulates jobs for 100ms then bulk-inserts.
 * Concurrency: 20 parallel jobs.
 *
 * Also updates the denormalized `clicks` counter in the URL shard collection.
 */

"use strict";

const Redis = require("ioredis");
const { Worker, MetricsTime } = require("bullmq");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Click = require("../models/analytics.model");
const { createLogger } = require("@url-shortener/shared/logger");
const { getCollectionName } = require("@url-shortener/shared/shard");
const { Counter, Histogram } = require("prom-client");

const logger = createLogger("analytics-worker");

const MONGO_URI = process.env.MONGO_URI || "mongodb://mongo:27017/url-shortener?replicaSet=rs0";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const BATCH_INTERVAL_MS = parseInt(process.env.ANALYTICS_BATCH_MS || "100", 10);
const WORKER_CONCURRENCY = parseInt(process.env.ANALYTICS_CONCURRENCY || "20", 10);

const jobsProcessed = new Counter({ name: "analytics_jobs_processed_total", help: "Total click jobs processed" });
const batchInsertDuration = new Histogram({
  name: "analytics_batch_insert_ms",
  help: "Duration of batch click insert (ms)",
  buckets: [1, 5, 10, 25, 50, 100, 250, 500]
});

// Hash IP for privacy
function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

// Accumulator for batch writing
let batch = [];
let batchTimer = null;

async function flushBatch() {
  if (batch.length === 0) return;

  const toInsert = batch.splice(0, batch.length);
  const timer = batchInsertDuration.startTimer();

  try {
    await Click.insertMany(toInsert, { ordered: false });
    logger.debug(`Batch inserted ${toInsert.length} click events`);

    // Update click counters per shortCode in URL shards
    const countsByCode = toInsert.reduce((acc, doc) => {
      acc[doc.shortCode] = (acc[doc.shortCode] || 0) + 1;
      return acc;
    }, {});

    await Promise.all(
      Object.entries(countsByCode).map(([shortCode, count]) => {
        const col = getCollectionName(shortCode);
        return mongoose.connection.collection(col).updateOne(
          { shortCode },
          { $inc: { clicks: count } }
        );
      })
    );
  } catch (err) {
    logger.error("Batch insert failed", { error: err.message, count: toInsert.length });
    // Re-queue failed items? For now: log and discard (analytics is non-critical)
  } finally {
    timer();
  }
}

// Connect to MongoDB
mongoose.connect(MONGO_URI, { maxPoolSize: 10 })
  .then(() => logger.info("Analytics worker: MongoDB connected"))
  .catch((err) => {
    logger.error("MongoDB connect failed", { error: err.message });
    process.exit(1);
  });

// BullMQ worker
const worker = new Worker(
  "{analytics-queue}",
  async (job) => {
    const { shortCode, ip, userAgent, referer, timestamp } = job.data;

    batch.push({
      shortCode,
      timestamp: new Date(timestamp || Date.now()),
      ipHash:    hashIp(ip),
      userAgent: userAgent || null,
      referer:   referer   || null
    });

    jobsProcessed.inc();

    // Schedule batch flush
    if (!batchTimer) {
      batchTimer = setTimeout(async () => {
        batchTimer = null;
        await flushBatch();
      }, BATCH_INTERVAL_MS);
    }
  },
  {
    connection: new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      tls: REDIS_URL.startsWith("rediss://") ? {} : undefined
    }),
    concurrency: WORKER_CONCURRENCY,
    metrics: { maxDataPoints: MetricsTime.ONE_WEEK }
  }
);

worker.on("failed", (job, err) => {
  logger.warn("Analytics job failed", { jobId: job?.id, error: err.message });
});

worker.on("error", (err) => {
  logger.error("Analytics worker error", { error: err.message });
});

// Flush on exit
process.on("SIGTERM", async () => {
  clearTimeout(batchTimer);
  await flushBatch();
  await worker.close();
  process.exit(0);
});

logger.info(`Analytics worker started (concurrency: ${WORKER_CONCURRENCY})`);

module.exports = worker;
