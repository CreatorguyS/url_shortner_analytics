/**
 * MongoDB shard router for the URL Service.
 *
 * Creates and caches Mongoose models bound to sharded collections.
 * Each shard is a separate collection in the same MongoDB database:
 *   urls_shard_0, urls_shard_1, urls_shard_2
 *
 * Note: models are cached by collection name to avoid Mongoose
 * "Cannot overwrite model once compiled" errors.
 */

"use strict";

const mongoose = require("mongoose");
const { getCollectionName, getAllCollectionNames } = require("@url-shortener/shared/shard");
const urlSchema = require("../models/url.model");

// Model cache: collectionName → Mongoose Model
const modelCache = new Map();

/**
 * Get (or create) a Mongoose Model bound to the shard collection for `shortCode`.
 * @param {string} shortCode
 * @returns {import('mongoose').Model}
 */
function getShardModel(shortCode) {
  const collectionName = getCollectionName(shortCode);
  return getModelForCollection(collectionName);
}

/**
 * Get a Mongoose Model for a specific collection name.
 * @param {string} collectionName
 * @returns {import('mongoose').Model}
 */
function getModelForCollection(collectionName) {
  if (modelCache.has(collectionName)) {
    return modelCache.get(collectionName);
  }
  // Create a new model bound to this collection
  const model = mongoose.model(collectionName, urlSchema, collectionName);
  modelCache.set(collectionName, model);
  return model;
}

/**
 * Get models for ALL shards (for scatter-gather queries like "list all").
 * @returns {import('mongoose').Model[]}
 */
function getAllShardModels() {
  return getAllCollectionNames().map(getModelForCollection);
}

module.exports = { getShardModel, getAllShardModels };
