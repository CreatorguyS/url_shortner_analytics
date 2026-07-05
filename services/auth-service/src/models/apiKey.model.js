/**
 * API Key model.
 * Keys are stored hashed (SHA-256) — plaintext is never persisted.
 */

"use strict";

const mongoose = require("mongoose");
const crypto = require("crypto");

const apiKeySchema = new mongoose.Schema(
  {
    keyHash: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    rateLimit: {
      type: Number,
      default: 1000,  // requests per window (overrides gateway default)
      min: 1,
      max: 100000
    },
    active: {
      type: Boolean,
      default: true,
      index: true
    },
    lastUsedAt: {
      type: Date,
      default: null
    },
    createdBy: {
      type: String, // admin user ID
      default: "system"
    }
  },
  { timestamps: true }
);

/**
 * Hash an API key for storage.
 * @param {string} key
 * @returns {string}
 */
apiKeySchema.statics.hashKey = function (key) {
  return crypto.createHash("sha256").update(key).digest("hex");
};

module.exports = mongoose.model("ApiKey", apiKeySchema, "api_keys");
