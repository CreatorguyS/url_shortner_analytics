/**
 * URL Service — HTTP controller.
 */

"use strict";

const urlService = require("../services/url.service");
const { createLogger } = require("@url-shortener/shared/logger");

const logger = createLogger("url-service:controller");

const BASE_URL = process.env.BASE_URL || "http://localhost";

/**
 * POST /api/url
 * Body: { longUrl, expiresAt? }
 */
const createUrl = async (req, res, next) => {
  try {
    const { longUrl, expiresAt } = req.body;

    if (!longUrl || typeof longUrl !== "string") {
      return res.status(400).json({ error: "longUrl is required and must be a string" });
    }

    const createdBy = req.headers["x-user-id"] || "public";
    const expiry    = expiresAt ? new Date(expiresAt) : null;

    const url = await urlService.createShortUrl(longUrl, createdBy, expiry);

    res.status(201).json({
      shortUrl:  `${BASE_URL}/${url.shortCode}`,
      shortCode: url.shortCode,
      longUrl:   url.longUrl,
      createdAt: url.createdAt
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
};

/**
 * GET /api/url/:shortCode
 */
const getUrlInfo = async (req, res, next) => {
  try {
    const { shortCode } = req.params;
    const url = await urlService.getUrlInfo(shortCode);

    if (!url) return res.status(404).json({ error: "URL not found" });

    res.json({
      shortCode: url.shortCode,
      longUrl:   url.longUrl,
      clicks:    url.clicks,
      createdAt: url.createdAt,
      expiresAt: url.expiresAt,
      isActive:  url.isActive
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/url/:shortCode
 */
const deleteUrl = async (req, res, next) => {
  try {
    const { shortCode } = req.params;
    const requesterId = req.headers["x-user-id"] || "public";

    const deleted = await urlService.deleteUrl(shortCode, requesterId);

    if (!deleted) {
      return res.status(404).json({ error: "URL not found or not owned by you" });
    }

    res.json({ message: "URL deactivated successfully" });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/url
 * List URLs for the authenticated API key owner.
 */
const listUrls = async (req, res, next) => {
  try {
    const createdBy = req.headers["x-user-id"] || "public";
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
    const skip  = parseInt(req.query.skip || "0", 10);

    const urls = await urlService.listUrlsByOwner(createdBy, limit, skip);
    res.json({ urls, count: urls.length });
  } catch (err) {
    next(err);
  }
};

module.exports = { createUrl, getUrlInfo, deleteUrl, listUrls };
