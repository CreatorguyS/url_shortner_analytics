const express = require("express");
const urlController = require("./controllers/url.controller");
const urlRoutes = require("./routes/url.routes");
const rateLimiter = require("./middlewares/rateLimiter");

const app = express();

app.use(express.json());

// API routes
app.use("/api", urlRoutes);

// 🔥 SHORT URL ROUTE (RATE LIMITED)
app.get("/:shortCode", rateLimiter, urlController.redirectUrl);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "server is working fine"
  });
});

module.exports = app;
