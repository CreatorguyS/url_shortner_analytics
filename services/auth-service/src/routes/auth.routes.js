"use strict";
const express = require("express");
const { getToken, validateKey, createKey, listKeys, revokeKey, requireAdmin } = require("../controllers/auth.controller");

const router = express.Router();

router.post("/token",          getToken);
router.get("/validate",        validateKey);
router.post("/keys",           requireAdmin, createKey);
router.get("/keys",            requireAdmin, listKeys);
router.delete("/keys/:id",     requireAdmin, revokeKey);

module.exports = router;
