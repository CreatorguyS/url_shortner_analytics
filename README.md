# 🔗 URL Shortener – High Level Design (HLD)

## 📌 Project Overview

This project is a **URL Shortener backend service** that converts long URLs into short, unique URLs and redirects users back to the original URL when accessed. The project is designed following **clean architecture principles** with a clear separation of concerns using Controller, Service, and Database layers.

This repository focuses on demonstrating **system design fundamentals (HLD)** along with a clean and scalable backend structure.

---

## 🚀 Features

* Generate short URLs for long URLs
* Redirect short URLs to original URLs
* Unique short code generation (Base62)
* Input validation and proper error handling
* RESTful API design
* Scalable and modular backend architecture

---

## 🏗️ High Level Architecture

```
Client (Browser / API Client)
        ↓
Controller Layer (Request & Response Handling)
        ↓
Service Layer (Business Logic)
        ↓
Database (URL Mapping Storage)
```

> Optional: A caching layer (Redis) can be added between Service and Database for faster redirection at scale.

---

## 🧩 Components Description

### 1️⃣ Controller Layer

**Responsibility:**

* Handles HTTP requests and responses
* Validates request inputs
* Calls appropriate service layer functions

**Example Responsibilities:**

* Creating short URLs
* Redirecting short URLs to long URLs

> Controllers do **not** contain business logic or database queries.

---

### 2️⃣ Service Layer (Business Logic)

**Responsibility:**

* Generates unique short codes using Base62
* Contains core application rules
* Manages interaction between controller and database

**Why Service Layer?**

* Keeps controllers thin
* Improves maintainability
* Makes business rules easy to modify
* Enables better testing

---

### 3️⃣ Database Layer

**Responsibility:**

* Stores the mapping between short URLs and long URLs
* Provides persistent storage

**Sample Schema:**

| Field     | Type            | Description          |
| --------- | --------------- | -------------------- |
| shortCode | String (unique) | Short URL identifier |
| longUrl   | String          | Original URL         |
| createdAt | Date            | Creation timestamp   |

---

## 🔄 Request Flow

### 🔹 Create Short URL Flow

```
Client
 → POST /url
 → Controller validates input
 → Service generates short code
 → Database stores (shortCode, longUrl)
 → Short URL returned to client
```

---

### 🔹 Redirect URL Flow

```
Browser
 → GET /:shortCode
 → Controller extracts shortCode
 → Service fetches longUrl
 → HTTP 302 Redirect to original URL
```

---

## ⚙️ Technology Stack

* **Backend:** Node.js, Express.js
* **Database:** MongoDB (Mongoose)
* **Short Code Generation:** Base62 Encoding
* **Architecture Pattern:** MVC + Service Layer

---

## 📈 Scalability Considerations

* Horizontal scaling using multiple API instances
* Load balancer in front of API servers
* Redis cache for faster URL redirection
* Collision handling during short code generation

---

## 🧠 Key Design Decisions

* Separation of concerns using layered architecture
* Asynchronous operations using `async/await`
* RESTful API standards
* Clean and readable codebase

---

## 📝 Future Enhancements

* URL expiration feature
* Click analytics
* Custom short URLs
* Rate limiting
* Authentication and authorization

---

## 📌 Summary

This URL Shortener project demonstrates a **well-structured backend system design** with a strong focus on High Level Design (HLD). It showcases scalability, clean architecture, and industry-standard backend practices, making it suitable for interviews and real-world applications.
