/**
 * Analytics click event schema.
 */

"use strict";

const mongoose = require("mongoose");

const clickSchema = new mongoose.Schema(
  {
    shortCode: { type: String, required: true, index: true },
    timestamp: { type: Date,   required: true, index: true },
    // Privacy: store hashed IP (SHA-256), never raw
    ipHash:    { type: String },
    userAgent: { type: String },
    referer:   { type: String },
    country:   { type: String, default: null } // reserved for geo-IP
  },
  {
    timeseries: {
      timeField: "timestamp",
      granularity: "seconds"
    }
  }
);

// Compound index for time-range queries per URL
clickSchema.index({ shortCode: 1, timestamp: -1 });

module.exports = mongoose.model("Click", clickSchema, "clicks");
