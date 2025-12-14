const redis = require("redis");

const redisClient = redis.createClient(
    {
        socket: {
    host: "127.0.0.1",
    port: 6379
  }
    }
);

(async () => {
  try {
    await redisClient.connect();
    console.log("Redis connected");
  } catch (error) {
    console.error("Redis connection failed:", error);
  }
})();

module.exports = redisClient;
