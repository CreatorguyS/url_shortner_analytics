/**
 * Jest test setup for URL Service.
 *
 * Mocks all external dependencies (MongoDB, Redis) so tests run
 * without real infrastructure.
 */

"use strict";

// ── Mock Redis Cluster ────────────────────────────────────────────────────────
jest.mock("redis", () => {
  const mockClient = {
    isOpen: false,
    connect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue("OK"),
    del: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue(undefined),
    on: jest.fn()
  };
  return {
    createCluster: jest.fn(() => mockClient),
    createClient: jest.fn(() => mockClient)
  };
});

// ── Mock Mongoose ─────────────────────────────────────────────────────────────
jest.mock("mongoose", () => {
  const mockModel = {
    findOne: jest.fn(),
    find: jest.fn().mockReturnThis(),
    create: jest.fn(),
    findOneAndUpdate: jest.fn(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([]),
    select: jest.fn().mockReturnThis()
  };

  const modelMock = jest.fn(() => mockModel);
  modelMock.findOne = mockModel.findOne;
  modelMock.find = mockModel.find;
  modelMock.create = mockModel.create;
  modelMock.findOneAndUpdate = mockModel.findOneAndUpdate;

  return {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    Schema: jest.fn().mockImplementation(function (def, opts) {
      this.pre = jest.fn();
      this.post = jest.fn();
      this.index = jest.fn();
    }),
    model: jest.fn(() => modelMock),
    connection: {
      collection: jest.fn(() => ({
        find: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([])
      }))
    }
  };
});

// ── Mock prom-client ──────────────────────────────────────────────────────────
jest.mock("prom-client", () => ({
  Counter: jest.fn().mockImplementation(() => ({ inc: jest.fn() })),
  Histogram: jest.fn().mockImplementation(() => ({ startTimer: jest.fn(() => jest.fn()), observe: jest.fn() })),
  collectDefaultMetrics: jest.fn(),
  register: { metrics: jest.fn().mockResolvedValue(""), contentType: "text/plain" }
}));

// ── Silence console logs in tests ─────────────────────────────────────────────
beforeAll(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});
