/**
 * Redirect Service — DB shard router (read-only mirror of url-service shard.js).
 */

"use strict";

const mongoose = require("mongoose");
const { getCollectionName } = require("@url-shortener/shared/shard");

// Minimal schema for redirect — only fields needed for fast lookups
const redirectSchema = new mongoose.Schema(
  {
    shortCode: { type: String, index: true },
    longUrl:   { type: String },
    isActive:  { type: Boolean },
    expiresAt: { type: Date }
  },
  { strict: false, timestamps: true }
);

const modelCache = new Map();

function getShardModel(shortCode) {
  const col = getCollectionName(shortCode);
  if (!modelCache.has(col)) {
    const model = mongoose.model(`redirect_${col}`, redirectSchema, col);
    modelCache.set(col, model);
  }
  return modelCache.get(col);
}

module.exports = { getShardModel };
