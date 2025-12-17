const { Worker } = require("bullmq");
const Url = require("../models/url.model");
const connectMongo = require("../db/mongo");

connectMongo(); // 👈 now worker connects to DB

console.log("✅ Analytics worker starting...");

const analyticsWorker = new Worker(
  "analytics-queue",
  async (job) => {
    const { shortCode } = job.data;

    console.log("📥 Job received:", shortCode);

    const result = await Url.updateOne(
      { shortCode },
      { $inc: { clicks: 1 } }
    );

    console.log("🧾 Mongo update result:", result);
  },
  {
    connection: {
      host: "127.0.0.1",
      port: 6379
    }
  }
);
