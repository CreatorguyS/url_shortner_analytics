/**
 * MongoDB connection for URL Service.
 * Connects to replica set for read/write operations.
 */

"use strict";

const mongoose = require("mongoose");
const { createLogger } = require("@url-shortener/shared/logger");

const logger = createLogger("url-service:mongo");

const MONGO_URI = process.env.MONGO_URI || "mongodb://mongo:27017/url-shortener?replicaSet=rs0";

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI, {
      maxPoolSize:         20,
      minPoolSize:          5,
      socketTimeoutMS:  45_000,
      serverSelectionTimeoutMS: 10_000
    });
    logger.info("MongoDB connected (URL Service)");
  } catch (err) {
    logger.error("MongoDB connection failed", { error: err.message });
    process.exit(1);
  }
}

module.exports = connectDB;
