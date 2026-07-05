const redis = require("redis");
require("dotenv").config();

// Render provides a full URL (redis://...). 
// If it's not present, we fallback to our local instance.
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || "redis://127.0.0.1:6379"
});

(async () => {
  try {
    await redisClient.connect();
    console.log("✅ Redis connected successfully");
  } catch (error) {
    console.error("❌ Redis connection failed:", error);
  }
})();

module.exports = redisClient;