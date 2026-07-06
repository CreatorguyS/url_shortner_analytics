/**
 * AES-256-GCM encryption/decryption utility.
 * Uses Node.js built-in crypto — no external dependencies.
 *
 * Key: 32-byte hex string from process.env.URL_ENCRYPTION_KEY
 * Output format (stored in MongoDB):  { iv, authTag, ciphertext }  → base64 JSON string
 */

"use strict";

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // bytes
const AUTH_TAG_LENGTH = 16; // bytes

/**
 * Encrypt plaintext using AES-256-GCM.
 * @param {string} plaintext
 * @param {string} hexKey - 32-byte hex string
 * @returns {string} base64-encoded JSON payload { iv, authTag, ciphertext }
 */
function encrypt(plaintext, hexKey) {
  if (!plaintext) throw new Error("encrypt: plaintext is required");
  if (!hexKey || hexKey.length !== 64)
    throw new Error("encrypt: hexKey must be a 64-char (32-byte) hex string");

  const key = Buffer.from(hexKey, "hex");
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  const payload = {
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: encrypted.toString("base64")
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/**
 * Decrypt an AES-256-GCM encrypted payload.
 * @param {string} encryptedPayload - base64-encoded JSON payload
 * @param {string} hexKey - 32-byte hex string
 * @returns {string} decrypted plaintext
 */
function decrypt(encryptedPayload, hexKey) {
  if (!encryptedPayload) throw new Error("decrypt: encryptedPayload is required");
  if (!hexKey || hexKey.length !== 64)
    throw new Error("decrypt: hexKey must be a 64-char (32-byte) hex string");

  const key = Buffer.from(hexKey, "hex");

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encryptedPayload, "base64").toString("utf8"));
  } catch {
    throw new Error("decrypt: invalid payload format");
  }

  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}

/**
 * Check whether a stored value is an encrypted payload.
 * Useful for migration: detects if the value is already encrypted.
 * @param {string} value
 * @returns {boolean}
 */
function isEncrypted(value) {
  if (!value || typeof value !== "string") return false;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64").toString("utf8"));
    return !!(parsed.iv && parsed.authTag && parsed.ciphertext);
  } catch {
    return false;
  }
}

module.exports = { encrypt, decrypt, isEncrypted };
