const { Queue } = require("bullmq");

const analyticsQueue = new Queue("analytics-queue", {
  connection: {
    host: "127.0.0.1",
    port: 6379
  }
});

module.exports = analyticsQueue;
