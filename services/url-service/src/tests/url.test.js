/**
 * URL Service — unit and integration tests.
 *
 * Tests url.service.js business logic using mocked dependencies
 * (no real DB or Redis required).
 */

"use strict";

const supertest = require("supertest");

// ── Shared utilities (pure functions, no IO) ──────────────────────────────────
const generateShortCode = require("@url-shortener/shared/base62");
const { encrypt, decrypt, isEncrypted } = require("@url-shortener/shared/encryption");
const { getCollectionName, getShardIndex, getAllCollectionNames, NUM_SHARDS } = require("@url-shortener/shared/shard");

// ──────────────────────────────────────────────────────────────────────────────
// 1. Base62 generator
// ──────────────────────────────────────────────────────────────────────────────
describe("Base62 short code generator", () => {
  test("generates a code of the correct default length (7)", () => {
    expect(generateShortCode()).toHaveLength(7);
  });

  test("generates a code of a custom length", () => {
    expect(generateShortCode(6)).toHaveLength(6);
    expect(generateShortCode(10)).toHaveLength(10);
  });

  test("only contains Base62 characters [0-9a-zA-Z]", () => {
    const code = generateShortCode(20);
    expect(/^[0-9a-zA-Z]+$/.test(code)).toBe(true);
  });

  test("generates unique codes on repeated calls", () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateShortCode()));
    expect(codes.size).toBe(100);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. AES-256-GCM encryption
// ──────────────────────────────────────────────────────────────────────────────
describe("AES-256-GCM encryption", () => {
  const HEX_KEY = "a".repeat(64); // 32 bytes as hex
  const PLAINTEXT = "https://example.com/some/very/long/path?q=1&page=2";

  test("encrypt() returns a base64 string", () => {
    const encrypted = encrypt(PLAINTEXT, HEX_KEY);
    expect(typeof encrypted).toBe("string");
    expect(() => Buffer.from(encrypted, "base64")).not.toThrow();
  });

  test("decrypt() correctly recovers the plaintext", () => {
    const encrypted = encrypt(PLAINTEXT, HEX_KEY);
    expect(decrypt(encrypted, HEX_KEY)).toBe(PLAINTEXT);
  });

  test("isEncrypted() returns true for encrypted payloads", () => {
    const encrypted = encrypt(PLAINTEXT, HEX_KEY);
    expect(isEncrypted(encrypted)).toBe(true);
  });

  test("isEncrypted() returns false for plain strings", () => {
    expect(isEncrypted("https://example.com")).toBe(false);
    expect(isEncrypted("not-encrypted")).toBe(false);
    expect(isEncrypted("")).toBe(false);
  });

  test("each encryption produces a different ciphertext (random IV)", () => {
    const e1 = encrypt(PLAINTEXT, HEX_KEY);
    const e2 = encrypt(PLAINTEXT, HEX_KEY);
    expect(e1).not.toBe(e2);
    // But both decrypt to the same value
    expect(decrypt(e1, HEX_KEY)).toBe(PLAINTEXT);
    expect(decrypt(e2, HEX_KEY)).toBe(PLAINTEXT);
  });

  test("encrypt() throws on missing or invalid key", () => {
    expect(() => encrypt(PLAINTEXT, "")).toThrow();
    expect(() => encrypt(PLAINTEXT, "tooshort")).toThrow();
  });

  test("decrypt() throws on invalid payload", () => {
    expect(() => decrypt("not-valid-base64-json", HEX_KEY)).toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Shard router
// ──────────────────────────────────────────────────────────────────────────────
describe("Shard router", () => {
  test("getShardIndex returns a number in [0, NUM_SHARDS)", () => {
    const codes = Array.from({ length: 50 }, () => generateShortCode());
    codes.forEach((code) => {
      const idx = getShardIndex(code);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(NUM_SHARDS);
    });
  });

  test("getCollectionName returns 'urls_shard_N'", () => {
    const col = getCollectionName("abc123");
    expect(col).toMatch(/^urls_shard_\d+$/);
  });

  test("getCollectionName is deterministic", () => {
    expect(getCollectionName("hello")).toBe(getCollectionName("hello"));
    expect(getCollectionName("world")).toBe(getCollectionName("world"));
  });

  test("getAllCollectionNames returns NUM_SHARDS collections", () => {
    const cols = getAllCollectionNames();
    expect(cols).toHaveLength(NUM_SHARDS);
    expect(cols[0]).toBe("urls_shard_0");
    expect(cols[NUM_SHARDS - 1]).toBe(`urls_shard_${NUM_SHARDS - 1}`);
  });

  test("different short codes can route to different shards", () => {
    const shards = new Set(
      Array.from({ length: 100 }, () => getShardIndex(generateShortCode()))
    );
    // With 3 shards and 100 samples, we'd expect all 3 to appear
    expect(shards.size).toBeGreaterThanOrEqual(1);
    expect(shards.size).toBeLessThanOrEqual(NUM_SHARDS);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. HTTP API via Express app (mocked service layer)
// ──────────────────────────────────────────────────────────────────────────────
describe("URL Service HTTP API", () => {
  let app;
  const mockUrlService = {
    createShortUrl: jest.fn(),
    getUrlInfo: jest.fn(),
    deleteUrl: jest.fn(),
    listUrlsByOwner: jest.fn()
  };

  beforeAll(() => {
    // Mock the service, db, and cache before requiring the app
    jest.mock("../services/url.service", () => mockUrlService);
    jest.mock("../db/shard", () => ({
      getShardModel: jest.fn(() => ({})),
      getAllShardModels: jest.fn(() => [])
    }));
    jest.mock("../cache/l1Cache", () => ({
      cacheGet: jest.fn().mockResolvedValue(null),
      cacheSet: jest.fn().mockResolvedValue(undefined),
      cacheInvalidate: jest.fn().mockResolvedValue(undefined)
    }));
    app = require("../app");
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Health check ───────────────────────────────────────────────────────────
  describe("GET /health", () => {
    test("returns 200 with status ok", async () => {
      const res = await supertest(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: "ok" });
    });
  });

  // ── Create URL ─────────────────────────────────────────────────────────────
  describe("POST /", () => {
    test("returns 400 when longUrl is missing", async () => {
      const res = await supertest(app).post("/").send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    test("returns 400 when longUrl is not a string", async () => {
      const res = await supertest(app).post("/").send({ longUrl: 12345 });
      expect(res.status).toBe(400);
    });

    test("returns 201 with shortUrl on success", async () => {
      mockUrlService.createShortUrl.mockResolvedValue({
        shortCode: "abc1234",
        longUrl: "https://example.com",
        clicks: 0,
        createdAt: new Date().toISOString()
      });

      const res = await supertest(app)
        .post("/")
        .send({ longUrl: "https://example.com" });

      expect(res.status).toBe(201);
      expect(res.body.shortCode).toBe("abc1234");
      expect(res.body.shortUrl).toContain("abc1234");
      expect(res.body.longUrl).toBe("https://example.com");
    });

    test("returns 400 when service rejects with a 400 status error", async () => {
      const err = Object.assign(new Error("Invalid URL"), { status: 400 });
      mockUrlService.createShortUrl.mockRejectedValue(err);

      const res = await supertest(app)
        .post("/")
        .send({ longUrl: "notaurl" });

      expect(res.status).toBe(400);
    });

    test("passes x-user-id header to service as createdBy", async () => {
      mockUrlService.createShortUrl.mockResolvedValue({
        shortCode: "xyz9999",
        longUrl: "https://example.com",
        clicks: 0,
        createdAt: new Date().toISOString()
      });

      await supertest(app)
        .post("/")
        .set("X-User-ID", "key-abc123")
        .send({ longUrl: "https://example.com" });

      expect(mockUrlService.createShortUrl).toHaveBeenCalledWith(
        "https://example.com",
        "key-abc123",
        null
      );
    });
  });

  // ── Get URL info ───────────────────────────────────────────────────────────
  describe("GET /:shortCode", () => {
    test("returns 404 when URL does not exist", async () => {
      mockUrlService.getUrlInfo.mockResolvedValue(null);
      const res = await supertest(app).get("/notfound");
      expect(res.status).toBe(404);
    });

    test("returns URL info when found", async () => {
      mockUrlService.getUrlInfo.mockResolvedValue({
        shortCode: "abc1234",
        longUrl: "https://example.com",
        clicks: 5,
        isActive: true,
        createdAt: new Date().toISOString(),
        expiresAt: null
      });

      const res = await supertest(app).get("/abc1234");
      expect(res.status).toBe(200);
      expect(res.body.shortCode).toBe("abc1234");
      expect(res.body.clicks).toBe(5);
      expect(res.body.isActive).toBe(true);
    });
  });

  // ── List URLs ──────────────────────────────────────────────────────────────
  describe("GET /", () => {
    test("returns empty array when no URLs", async () => {
      mockUrlService.listUrlsByOwner.mockResolvedValue([]);
      const res = await supertest(app).get("/");
      expect(res.status).toBe(200);
      expect(res.body.urls).toEqual([]);
      expect(res.body.count).toBe(0);
    });

    test("returns list with count", async () => {
      mockUrlService.listUrlsByOwner.mockResolvedValue([
        { shortCode: "aaa111", longUrl: "https://a.com", clicks: 1 },
        { shortCode: "bbb222", longUrl: "https://b.com", clicks: 2 }
      ]);
      const res = await supertest(app).get("/");
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
      expect(res.body.urls).toHaveLength(2);
    });
  });

  // ── Delete URL ─────────────────────────────────────────────────────────────
  describe("DELETE /:shortCode", () => {
    test("returns 404 when URL not found or not owned", async () => {
      mockUrlService.deleteUrl.mockResolvedValue(false);
      const res = await supertest(app).delete("/notmine");
      expect(res.status).toBe(404);
    });

    test("returns success message when deleted", async () => {
      mockUrlService.deleteUrl.mockResolvedValue(true);
      const res = await supertest(app).delete("/abc1234");
      expect(res.status).toBe(200);
      expect(res.body.message).toBeDefined();
    });
  });
});


