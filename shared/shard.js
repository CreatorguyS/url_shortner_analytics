/**
 * Logical hash sharding for MongoDB.
 *
 * Strategy: CRC32-like hash of shortCode → shard index (0 .. NUM_SHARDS-1)
 * Each shard maps to a MongoDB collection: urls_shard_0, urls_shard_1, ...
 *
 * This gives O(1) shard determination at query time — no scatter-gather needed
 * for single-key lookups (which are >99% of redirect traffic).
 */

"use strict";

const NUM_SHARDS = parseInt(process.env.NUM_SHARDS || "3", 10);

/**
 * Simple djb2 hash (fast, deterministic, good distribution).
 * @param {string} str
 * @returns {number} unsigned 32-bit integer
 */
function djb2Hash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0; // keep unsigned 32-bit
  }
  return hash;
}

/**
 * Get shard index for a given shortCode.
 * @param {string} shortCode
 * @returns {number} 0 .. NUM_SHARDS-1
 */
function getShardIndex(shortCode) {
  return djb2Hash(shortCode) % NUM_SHARDS;
}

/**
 * Get the collection name for a given shortCode.
 * @param {string} shortCode
 * @returns {string} e.g. "urls_shard_1"
 */
function getCollectionName(shortCode) {
  return `urls_shard_${getShardIndex(shortCode)}`;
}

/**
 * Get all collection names (for scatter-gather queries like "list all URLs").
 * @returns {string[]}
 */
function getAllCollectionNames() {
  return Array.from({ length: NUM_SHARDS }, (_, i) => `urls_shard_${i}`);
}

module.exports = { getShardIndex, getCollectionName, getAllCollectionNames, NUM_SHARDS };
