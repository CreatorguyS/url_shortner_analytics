"use strict";

const authService = require("../services/auth.service");

// Middleware to check admin JWT
const requireAdmin = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Bearer token required" });
  }
  try {
    const payload = authService.verifyJwt(auth.slice(7));
    if (payload.role !== "admin") return res.status(403).json({ error: "Admin only" });
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

// POST /auth/token — get admin JWT
const getToken = async (req, res) => {
  try {
    const { adminToken } = req.body;
    const token = authService.issueAdminJwt(adminToken);
    res.json({ token });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

// GET /auth/validate — validate X-API-Key (called by gateway)
const validateKey = async (req, res) => {
  const key = req.headers["x-api-key"];
  const result = await authService.validateApiKey(key);
  if (!result.valid) return res.status(401).json({ error: "Invalid API key" });
  res.json(result);
};

// POST /auth/keys — generate a new API key (admin only)
const createKey = async (req, res, next) => {
  try {
    const { name, rateLimit } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    const result = await authService.generateApiKey(name, rateLimit, "admin");
    res.status(201).json(result);
  } catch (err) { next(err); }
};

// GET /auth/keys — list all keys (admin only)
const listKeys = async (_req, res, next) => {
  try {
    const keys = await authService.listApiKeys();
    res.json({ keys });
  } catch (err) { next(err); }
};

// DELETE /auth/keys/:id — revoke key (admin only)
const revokeKey = async (req, res, next) => {
  try {
    const ok = await authService.revokeApiKey(req.params.id);
    if (!ok) return res.status(404).json({ error: "Key not found" });
    res.json({ message: "Key revoked" });
  } catch (err) { next(err); }
};

module.exports = { getToken, validateKey, createKey, listKeys, revokeKey, requireAdmin };
