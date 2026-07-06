# 🔗 URL Shortener — Production-Grade Microservice Architecture

[![Node.js](https://img.shields.io/badge/Node.js-20+-brightgreen)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue)](https://www.docker.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-7-green)](https://www.mongodb.com)
[![Redis](https://img.shields.io/badge/Redis-7-red)](https://redis.io)

A **production-ready, horizontally scalable URL shortener** built on a microservice architecture with multi-tier caching, AES-256-GCM encryption, distributed rate limiting, circuit breakers, and Prometheus observability.

---

## 🏗️ Architecture Overview

```
Internet
    │
    ▼
[NGINX] — TLS termination, gzip, rate limiting (nginx zones)
    │
    ▼
[API Gateway :3000] ×3 replicas
    ├── DDoS Guard (token-bucket, per-IP, Redis-backed)
    ├── Sliding Window Rate Limiter (Redis sorted-sets, per-IP / per-API-key)
    ├── API Key Auth (X-API-Key → Auth Service, cached 5 min in Redis)
    ├── Circuit Breakers (per-upstream, Redis-shared state across replicas)
    └── Correlation ID injection (distributed tracing)
         │
         ├──► [URL Service :3001] ×2 replicas (cluster mode)
         │        ├── L1 LRU cache (per-process, 10k entries, 60s TTL)
         │        ├── L2 Redis Cluster (~0.5ms reads)
         │        └── MongoDB shard (primary writes, AES-256-GCM encrypted longUrls)
         │
         ├──► [Redirect Service :3002] ×5 replicas (cluster mode)
         │        ├── L1 LRU cache (50k entries, 1μs, per-process)
         │        ├── L2 Redis Cluster (~0.5ms reads)
         │        ├── MongoDB secondary reads (read preference: secondaryPreferred)
         │        └── Fire-and-forget analytics events → BullMQ
         │
         ├──► [Analytics Service :3003] ×2 replicas
         │        └── Aggregation queries (clicks/day, top URLs, referers)
         │
         └──► [Auth Service :3004]
                  └── API key management + JWT issuance

[Analytics Worker] ×2 (BullMQ consumers)
    ├── Batched writes (100ms batch window, 20 concurrent jobs)
    └── Updates click counters in MongoDB shards

[MongoDB Replica Set]  mongo-primary + mongo-secondary-1 + mongo-secondary-2
[Redis Cluster]        redis-node-1 + redis-node-2 + redis-node-3
```

---

## ✨ Key Features

| Feature | Implementation |
|---------|---------------|
| **URL Shortening** | Base62 (7-char, 3.5 trillion combos), cryptographically random |
| **Encryption** | AES-256-GCM on all stored `longUrl` values |
| **Multi-tier cache** | L1 LRU (in-process) → L2 Redis Cluster → MongoDB |
| **Sharding** | 3 MongoDB collections (djb2 hash) for horizontal scaling |
| **Rate Limiting** | Sliding-window per IP + per-API-key (Redis sorted-sets + Lua) |
| **DDoS Protection** | Token-bucket burst detection, IP blocking (Redis, atomic Lua) |
| **Circuit Breaker** | Per-upstream, Redis-shared state, CLOSED/OPEN/HALF_OPEN |
| **Analytics** | BullMQ queue, 100ms batch inserts, timeseries collection |
| **Auth** | API keys (SHA-256 hashed), JWT admin tokens |
| **Observability** | Prometheus metrics + correlation IDs on every request |
| **TLS** | Auto self-signed cert on startup (production: replace with Let's Encrypt) |

---

## 🚀 Quick Start

### Prerequisites
- Docker Desktop
- Node.js 20+

### 1. Generate secrets
```bash
node scripts/generate-env.js
```
This creates `.env` with cryptographically secure keys. **Never commit `.env`!**

### 2. Start all services
```bash
npm run dev
# or
docker-compose up --build
```

### 3. Get an admin JWT
```bash
curl -k -X POST https://localhost/auth/token \
  -H "Content-Type: application/json" \
  -d '{"adminToken": "<ADMIN_TOKEN from .env>"}'
```

### 4. Create a short URL
```bash
curl -k -X POST https://localhost/api/url \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT>" \
  -d '{"longUrl": "https://example.com/very/long/path"}'
```

### 5. Use your short URL
```bash
curl -kL https://localhost/<shortCode>
```

---

## 📁 Project Structure

```
url-shortener/
├── docker-compose.yml          # Full stack orchestration
├── nginx/nginx.conf            # TLS, rate limiting, upstream routing
├── scripts/
│   ├── generate-env.js         # Secret generation
│   └── migrate-encrypt.js      # Idempotent URL encryption migration
├── shared/                     # Shared utilities (npm workspace)
│   ├── base62.js               # Crypto-secure short code generation
│   ├── encryption.js           # AES-256-GCM encrypt/decrypt
│   ├── logger.js               # Winston logger factory
│   └── shard.js                # djb2 hash shard routing
└── services/
    ├── api-gateway/            # Entry point — auth, rate limit, circuit breaker
    ├── url-service/            # CRUD + encryption + caching
    ├── redirect-service/       # Hot path — 5 replicas, L1+L2 cache
    ├── analytics-service/      # Click aggregation API
    └── auth-service/           # API key management + JWT
```

---

## 🔌 API Reference

### Auth Service
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/token` | Get admin JWT (`{ adminToken }`) |
| GET | `/auth/validate` | Validate API key (called by gateway) |
| POST | `/auth/keys` | Create API key (admin JWT required) |
| GET | `/auth/keys` | List API keys (admin JWT required) |
| DELETE | `/auth/keys/:id` | Revoke API key (admin JWT required) |

### URL Service
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/url` | Create short URL (`{ longUrl, expiresAt? }`) |
| GET | `/api/url` | List your URLs (`?limit=20&skip=0`) |
| GET | `/api/url/:shortCode` | Get URL info + stats |
| DELETE | `/api/url/:shortCode` | Soft-delete (deactivate) URL |

### Analytics Service
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/analytics/:shortCode` | Click stats (`?days=7`) |
| GET | `/api/analytics/top` | Top-N URLs (`?limit=10`) |

### Redirect (hot path)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/:shortCode` | 302 redirect to original URL |

---

## 🔐 Security

- **URL encryption**: All `longUrl` values are AES-256-GCM encrypted before storage
- **API keys**: SHA-256 hashed in DB (plaintext shown only once on creation)
- **IP hashing**: Analytics stores only first 16 chars of SHA-256(IP) — GDPR-friendly
- **Rate limiting**: 100 req/10s per IP by default; per-key limits configurable
- **DDoS protection**: Token-bucket burst detection, configurable IP block duration
- **TLS**: HTTPS-only in production (HTTP redirects to HTTPS)
- **Security headers**: HSTS, X-Content-Type-Options, X-Frame-Options via helmet

---

## 🧪 Running Tests

```bash
# URL service unit tests (no infrastructure required)
cd services/url-service
npm test

# All workspace tests
npm test --workspaces --if-present
```

---

## 📈 Scaling

The system is designed to scale each component independently:

- **Redirect Service**: 5 replicas by default (reads are ~99% of traffic)
- **URL Service**: 2 replicas with cluster mode (one process per CPU)
- **API Gateway**: 3 replicas behind NGINX least-conn
- **Analytics Workers**: 2 replicas consuming from BullMQ queue
- **MongoDB**: Primary + 2 secondaries; redirect reads from secondaries only
- **Redis**: 3-node cluster with LRU eviction

---

## 🔄 Data Flow

### Create Short URL
```
POST /api/url
→ API Gateway (auth + rate limit)
→ URL Service
→ Generate Base62 shortCode
→ Encrypt longUrl (AES-256-GCM)
→ Write to MongoDB shard (djb2(shortCode) % 3)
→ Prime L1 + L2 cache
→ Return shortUrl
```

### Redirect (hot path, p99 < 5ms)
```
GET /:shortCode
→ API Gateway (DDoS + rate limit only)
→ Redirect Service
→ L1 LRU cache? → return (< 1μs)
→ Redis Cluster? → warm L1 + return (< 1ms)
→ MongoDB secondary → warm L1 + L2 + return (< 10ms)
→ BullMQ: fire-and-forget click event (never blocks)
→ 302 redirect
```

### Analytics (async, non-blocking)
```
BullMQ "click" event
→ Analytics Worker
→ Batches 100ms of events
→ insertMany to MongoDB timeseries collection
→ $inc clicks counter in URL shard collection
```
