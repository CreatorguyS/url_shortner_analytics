const Url = require("../models/url.model");
const generateShortCode = require("../utils/base62");
const redisClient = require("../cache/redis.client");

const CACHE_TTL = 60 * 60; // 1 hour

const createShortUrl = async (longUrl) => {
  if (
    !longUrl.startsWith("http://") &&
    !longUrl.startsWith("https://")
  ) {
    longUrl = "https://" + longUrl;
  }

  const shortCode = generateShortCode();

  const url = await Url.create({
    shortCode,
    longUrl,
    clicks: 0
  });

  return url;
};

// PHASE 4: READ ONLY
const getLongUrl = async (shortCode) => {
  // 1️⃣ Try Redis
  try {
    if (redisClient.isOpen) {
      const cachedLongUrl = await redisClient.get(shortCode);
      if (cachedLongUrl) {
        console.log("CACHE HIT");
        return { longUrl: cachedLongUrl };
      }
    }
  } catch (err) {
    console.warn("Redis error, fallback to DB");
  }

  console.log("CACHE MISS");

  // 2️⃣ MongoDB read ONLY
  const url = await Url.findOne({ shortCode });
  if (!url) return null;

  // 3️⃣ Cache refill
  try {
    if (redisClient.isOpen) {
      await redisClient.set(shortCode, url.longUrl, {
        EX: CACHE_TTL
      });
    }
  } catch (err) {
    console.warn("Redis set failed");
  }

  return url;
};

module.exports = {
  createShortUrl,
  getLongUrl
};
