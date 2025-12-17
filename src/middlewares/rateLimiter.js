const redisClient = require("../cache/redis.client");

const WINDOW_SIZE = 10; // seconds
const MAX_REQUESTS = 5;

const rateLimiter = async (req, res, next) => {
  console.log("🚦 RATE LIMITER HIT", req.originalUrl);

  try {
    const rawIp =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress;

    const ip = rawIp.replace("::ffff:", "");
    const key = `rate:${ip}`;

    let count = await redisClient.get(key);

    if (count === null) {
      await redisClient.set(key, 1, { EX: WINDOW_SIZE });
      return next();
    }

    if (parseInt(count) >= MAX_REQUESTS) {
      return res.status(429).json({
        error: "Too many requests, please try after some time"
      });
    }

    // 🔥 FIXED LINE
    await redisClient.incr(key);

    next();
  } catch (err) {
    console.error("Rate limiter error:", err);
    next(); // fail-open
  }
};

module.exports = rateLimiter;
