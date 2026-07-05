/**
 * Auth Service — business logic.
 */

"use strict";

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const ApiKey = require("../models/apiKey.model");
const { createLogger } = require("@url-shortener/shared/logger");

const logger = createLogger("auth-service:service");

const JWT_SECRET  = process.env.JWT_SECRET  || "change-me-in-production";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "24h";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "admin-secret";

/**
 * Generate a new API key.
 * @param {string} name
 * @param {number} rateLimit
 * @param {string} createdBy
 * @returns {Promise<{key: string, id: string, name: string, rateLimit: number}>}
 */
async function generateApiKey(name, rateLimit = 1000, createdBy = "system") {
  // Generate cryptographically random key
  const key = crypto.randomBytes(32).toString("base64url");
  const keyHash = ApiKey.hashKey(key);

  const doc = await ApiKey.create({ keyHash, name, rateLimit, createdBy });

  logger.info("API key created", { keyId: doc._id.toString(), name });

  return {
    key,          // shown ONCE — never stored in plaintext
    id:        doc._id.toString(),
    name:      doc.name,
    rateLimit: doc.rateLimit,
    createdAt: doc.createdAt
  };
}

/**
 * Validate an API key.
 * @param {string} key
 * @returns {Promise<{valid: boolean, id?: string, rateLimit?: number}>}
 */
async function validateApiKey(key) {
  if (!key) return { valid: false };

  const keyHash = ApiKey.hashKey(key);
  const doc = await ApiKey.findOne({ keyHash, active: true }).lean();

  if (!doc) return { valid: false };

  // Update lastUsedAt asynchronously
  ApiKey.updateOne({ _id: doc._id }, { lastUsedAt: new Date() }).catch(() => {});

  return {
    valid:     true,
    id:        doc._id.toString(),
    rateLimit: doc.rateLimit
  };
}

/**
 * Issue a JWT for admin operations.
 * @param {string} token - admin secret token
 * @returns {string} JWT
 */
function issueAdminJwt(token) {
  if (token !== ADMIN_TOKEN) throw Object.assign(new Error("Invalid admin token"), { status: 401 });

  return jwt.sign(
    { role: "admin", iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

/**
 * Verify a JWT.
 * @param {string} token
 * @returns {object} decoded payload
 */
function verifyJwt(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * List all API keys (without key hashes).
 */
async function listApiKeys() {
  return ApiKey.find({}, { keyHash: 0 }).sort({ createdAt: -1 }).lean();
}

/**
 * Revoke an API key.
 * @param {string} id
 */
async function revokeApiKey(id) {
  const result = await ApiKey.findByIdAndUpdate(id, { active: false }, { new: true });
  if (result) logger.info("API key revoked", { keyId: id });
  return !!result;
}

module.exports = { generateApiKey, validateApiKey, issueAdminJwt, verifyJwt, listApiKeys, revokeApiKey };
