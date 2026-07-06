const express = require("express");
const urlController = require("./controllers/url.controller");
const urlRoutes = require("./routes/url.routes");
const rateLimiter = require("./middlewares/rateLimiter");

const app = express();

app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "server is working fine"
  });
});

// API routes
app.use("/api", urlRoutes);

app.get('/', (req, res) => {
    res.status(200).json({
        message: "URL Shortener API is running!",
        database: "MongoDB Connected"
    });
});

// 🔥 SHORT URL REDIRECT (RATE LIMITED) — must be last
app.get("/:shortCode", rateLimiter, urlController.redirectUrl);

module.exports = app;
