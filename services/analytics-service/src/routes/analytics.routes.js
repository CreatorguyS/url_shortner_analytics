"use strict";
const express = require("express");
const { getStats, getTopUrls } = require("../controllers/analytics.controller");
const router = express.Router();

router.get("/top",         getTopUrls);
router.get("/:shortCode",  getStats);

module.exports = router;
