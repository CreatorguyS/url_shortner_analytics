/**
 * URL model with AES-256-GCM encryption via Mongoose hooks.
 *
 * Mongoose pre('save') hook encrypts longUrl before persisting.
 * Mongoose post('find*') hooks decrypt longUrl after reading.
 *
 * Schema has separate iv, authTag fields alongside the encrypted ciphertext.
 */

"use strict";

const mongoose = require("mongoose");
const { encrypt, decrypt, isEncrypted } = require("@url-shortener/shared/encryption");

function getEncryptionKey() {
  const key = process.env.URL_ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error("URL_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). Run: node scripts/generate-env.js");
  }
  return key;
}

const urlSchema = new mongoose.Schema(
  {
    shortCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
      minlength: 6,
      maxlength: 12
    },
    // Stored encrypted: base64 JSON payload { iv, authTag, ciphertext }
    longUrl: {
      type: String,
      required: true
    },
    clicks: {
      type: Number,
      default: 0,
      min: 0
    },
    createdBy: {
      type: String, // API key ID or 'public'
      default: "public",
      index: true
    },
    expiresAt: {
      type: Date,
      default: null,
      index: { expireAfterSeconds: 0, sparse: true }
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  { timestamps: true }
);

// ── Compound index for per-user URL listing ───────────────────────────────────
urlSchema.index({ createdBy: 1, createdAt: -1 });

// ── Encrypt longUrl before saving ────────────────────────────────────────────
urlSchema.pre("save", async function () {
  if (this.isModified("longUrl") && !isEncrypted(this.longUrl)) {
    this.longUrl = encrypt(this.longUrl, getEncryptionKey());
  }
});

// ── Decrypt after single document reads ──────────────────────────────────────
function decryptDoc(doc) {
  if (doc && doc.longUrl && isEncrypted(doc.longUrl)) {
    try {
      doc.longUrl = decrypt(doc.longUrl, getEncryptionKey());
    } catch {
      // If decryption fails, leave as-is (migration edge case)
    }
  }
}

urlSchema.post("save",        function (doc)  { decryptDoc(doc); });
urlSchema.post("findOne",     function (doc)  { decryptDoc(doc); });
urlSchema.post("find",        function (docs) { docs.forEach(decryptDoc); });
urlSchema.post("findOneAndUpdate", function (doc)  { decryptDoc(doc); });

module.exports = urlSchema;
