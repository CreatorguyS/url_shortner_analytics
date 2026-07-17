/**
 * Redirect Service — MongoDB connection (reads from secondaries only).
 * Read preference = 'secondaryPreferred' to offload primary.
 */

"use strict";

const mongoose = require("mongoose");
const { createLogger } = require("@url-shortener/shared/logger");

const logger = createLogger("redirect-service:mongo");

const MONGO_URI = process.env.MONGO_URI_SECONDARY ||
  process.env.MONGO_URI ||
  "mongodb://mongo:27017/url-shortener?replicaSet=rs0&readPreference=secondaryPreferred";

async function connectDB() {
  try {
    const isReplicaSet = MONGO_URI.includes("replicaSet=");
    
    await mongoose.connect(MONGO_URI, {
      maxPoolSize: 30,         // higher pool for read-heavy workload
      minPoolSize:  5,
      socketTimeoutMS: 30_000,
      serverSelectionTimeoutMS: 8_000,
      ...(isReplicaSet && { readPreference: "secondaryPreferred" })
    });
    logger.info(`MongoDB connected (redirect-service${isReplicaSet ? ", secondaryPreferred" : ""})`);
  } catch (err) {
    logger.error("MongoDB connect failed", { error: err.message });
    process.exit(1);
  }
}

module.exports = connectDB;
