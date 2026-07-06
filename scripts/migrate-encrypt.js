#!/usr/bin/env node
/**
 * Migration script: encrypt existing plaintext longUrl values in MongoDB.
 *
 * Safe to run multiple times (idempotent via isEncrypted check).
 *
 * Usage:
 *   node scripts/migrate-encrypt.js
 *
 * Requires: URL_ENCRYPTION_KEY in .env (or environment)
 */

"use strict";

require("dotenv").config();

const mongoose = require("mongoose");
const { encrypt, isEncrypted } = require("../shared/encryption");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/url-shortener";
const NUM_SHARDS = parseInt(process.env.NUM_SHARDS || "3", 10);
const KEY = process.env.URL_ENCRYPTION_KEY;

if (!KEY || KEY.length !== 64) {
  console.error("❌ URL_ENCRYPTION_KEY must be set (64-char hex). Run: node scripts/generate-env.js");
  process.exit(1);
}

// Collection names to migrate
const collections = [
  // Legacy single collection (original monolith)
  "urls",
  // New sharded collections
  ...Array.from({ length: NUM_SHARDS }, (_, i) => `urls_shard_${i}`)
];

async function migrateCollection(col) {
  const collection = mongoose.connection.collection(col);

  let count = 0;
  let total = 0;

  const exists = await mongoose.connection.db.listCollections({ name: col }).hasNext();
  if (!exists) {
    console.log(`   ⏭️  Collection '${col}' does not exist — skipping`);
    return { migrated: 0, total: 0 };
  }

  const cursor = collection.find({ longUrl: { $exists: true } });

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    total++;

    if (isEncrypted(doc.longUrl)) continue; // already encrypted

    const encrypted = encrypt(doc.longUrl, KEY);
    await collection.updateOne(
      { _id: doc._id },
      { $set: { longUrl: encrypted } }
    );
    count++;
  }

  return { migrated: count, total };
}

async function run() {
  console.log("🔐 URL Encryption Migration\n");
  console.log(`   MONGO_URI: ${MONGO_URI}`);
  console.log(`   Collections to migrate: ${collections.join(", ")}\n`);

  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected to MongoDB\n");

  let totalMigrated = 0;
  let totalDocs = 0;

  for (const col of collections) {
    process.stdout.write(`   Migrating '${col}'... `);
    const { migrated, total } = await migrateCollection(col);
    console.log(`${migrated}/${total} documents encrypted`);
    totalMigrated += migrated;
    totalDocs += total;
  }

  console.log(`\n✅ Migration complete: ${totalMigrated}/${totalDocs} documents encrypted`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("❌ Migration failed:", err.message);
  process.exit(1);
});
