/**
 * Analytics Service — controller.
 */

"use strict";

const analyticsService = require("../services/analytics.service");

const getStats = async (req, res, next) => {
  try {
    const { shortCode } = req.params;
    const days = Math.min(parseInt(req.query.days || "7", 10), 90);
    const stats = await analyticsService.getStats(shortCode, days);
    res.json(stats);
  } catch (err) { next(err); }
};

const getTopUrls = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "10", 10), 50);
    const urls = await analyticsService.getTopUrls(limit);
    res.json({ urls });
  } catch (err) { next(err); }
};

module.exports = { getStats, getTopUrls };
