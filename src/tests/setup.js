const mongoose = require("mongoose");

beforeAll(async () => {
  await mongoose.connect("mongodb://127.0.0.1:27017/url_shortener_test");
});

afterAll(async () => {
  await mongoose.connection.close();
});
