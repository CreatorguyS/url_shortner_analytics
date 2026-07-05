/**
 * Redirect Service routes.
 */

"use strict";

const express = require("express");
const { handleRedirect } = require("../services/redirect.service");

const router = express.Router();

// The ONLY route this service handles — must be as fast as possible
router.get("/:shortCode", handleRedirect);

module.exports = router;
