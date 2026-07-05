/**
 * URL Service routes.
 */

"use strict";

const express = require("express");
const { createUrl, getUrlInfo, deleteUrl, listUrls } = require("../controllers/url.controller");

const router = express.Router();

router.post("/",          createUrl);
router.get("/",           listUrls);
router.get("/:shortCode", getUrlInfo);
router.delete("/:shortCode", deleteUrl);

module.exports = router;
