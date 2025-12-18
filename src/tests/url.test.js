const request = require("supertest");
const app = require("../app");

describe("URL Shortener API", () => {
  let shortCode;

  test("POST /api/url - create short URL", async () => {
    const res = await request(app)
      .post("/api/url")
      .send({ longUrl: "https://example.com" });

    expect(res.statusCode).toBe(201);
    expect(res.body.shortUrl).toBeDefined();

    shortCode = res.body.shortUrl.split("/").pop();
  });

  test("GET /:shortCode - redirect works", async () => {
    const res = await request(app).get(`/${shortCode}`);
    expect(res.statusCode).toBe(302);
  });
});
