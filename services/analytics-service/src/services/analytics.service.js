/**
 * Analytics Service — aggregation queries.
 */

"use strict";

const Click = require("../models/analytics.model");
const mongoose = require("mongoose");
const { getAllCollectionNames } = require("@url-shortener/shared/shard");
const { createLogger } = require("@url-shortener/shared/logger");

const logger = createLogger("analytics-service:service");

/**
 * Get click stats for a short URL.
 * @param {string} shortCode
 * @param {number} [days=7]
 */
async function getStats(shortCode, days = 7) {
  const since = new Date(Date.now() - days * 86_400_000);

  const [totalClicks, clicksByDay, topReferers] = await Promise.all([
    Click.countDocuments({ shortCode, timestamp: { $gte: since } }),
    Click.aggregate([
      { $match: { shortCode, timestamp: { $gte: since } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$timestamp" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    Click.aggregate([
      { $match: { shortCode, timestamp: { $gte: since }, referer: { $ne: null } } },
      { $group: { _id: "$referer", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ])
  ]);

  return {
    shortCode,
    period:    `${days}d`,
    totalClicks,
    clicksByDay: clicksByDay.map((d) => ({ date: d._id, count: d.count })),
    topReferers: topReferers.map((r) => ({ referer: r._id, count: r.count }))
  };
}

/**
 * Get the top-N most-clicked URLs (scatter-gather from all URL shards).
 * @param {number} [limit=10]
 */
async function getTopUrls(limit = 10) {
  const collectionNames = getAllCollectionNames();

  const results = await Promise.all(
    collectionNames.map((col) =>
      mongoose.connection.collection(col)
        .find({ isActive: true }, { shortCode: 1, clicks: 1, _id: 0 })
        .sort({ clicks: -1 })
        .limit(limit)
        .toArray()
    )
  );

  return results
    .flat()
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, limit);
}

module.exports = { getStats, getTopUrls };
