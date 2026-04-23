# NexaSetu Orchestration Engine (Backend)

[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)

### The System Problem
Traditional project management backends are passive data stores. They function as simple CRUD wrappers that rely on constant human intervention to maintain accuracy. When code activity happens in the real world (GitHub), the system stays silent until a human manually bridges the gap.

### The Pain
High latency between action and record. Stale project health metrics. API blocking during complex AI computations. Fragmented logs that track *what* changed, but never *why* or by which autonomous process.

### The Insight
A backend for modern engineering shouldn't just store data; it should be an **Event-Driven Orchestrator**. It must react to the heartbeat of the development lifecycle and manage state transitions autonomously through specialized service agents, ensuring the core API remains non-blocking and highly available.

### The Solution
NexaSetu Orchestration Engine is a high-performance backend built on Node.js and Express 5. It utilizes a **Queued Agent Architecture** powered by Redis and BullMQ to handle natural language directives, GitHub webhooks, and cascading project shifts asynchronously. It transforms a passive database into a proactive execution partner.

### The Outcome
Deterministic autonomous synchronization. Ultra-low latency responses. Hardened enterprise-grade security. A transparent AI audit trail that explains every autonomous decision made by the system.

---

## One-Line Core Idea
A high-performance event orchestrator that transforms project management from passive storage to autonomous execution.

---

## Key Features

- **Autonomous Agent Fleet:**
    - **AgentOrchestrator:** The central nervous system that dispatches system events to specialized agents.
    - **Harvester Agent:** Ingests external activity (GitHub) and maps it to internal task states.
    - **Scheduler Agent:** Calculates project timeline shifts and resolves cascading dependency conflicts.
- **Magic Bar Service:** A high-velocity NLP engine that parses unstructured prompts into actionable system triggers.
- **Background Execution Pipeline:** Offloads heavy AI and synchronization tasks to **BullMQ** workers to maintain zero-latency API responsiveness.
- **Engineering Performance Indicators (EPI):** A specialized service layer for calculating deep-space metrics like PR velocity and code churn.
- **Idempotency Layer:** System-wide protection against duplicate requests and race conditions in distributed environments.

---

## Tech Stack

- **Runtime:** Node.js (v18+)
- **Framework:** Express 5 (Next-gen request handling)
- **Primary Database:** MongoDB (Mongoose 9 ODM)
- **In-Memory Store:** Redis (Caching, Rate-limiting, and Queueing)
- **Job Orchestration:** BullMQ (Durable background processing)
- **Security:** Helmet, bcryptjs, JWT, rate-limit-redis
- **Validation:** Zod (Type-safe schema enforcement)
- **Logging:** Winston (Structured JSON logging)

---

## Architecture Overview

NexaSetu uses a **Layered Service Architecture** with an asynchronous execution core:

1.  **Request Layer:** Express handles incoming REST/Socket requests.
2.  **Middleware Layer:** Enforces Auth, Security, Idempotency, and Rate-limiting.
3.  **Controller Layer:** Routes requests to the appropriate domain service.
4.  **Service Layer (The Brain):** Domain logic where agents and normalizers operate.
5.  **Queue Layer:** Heavy/Long-running tasks are pushed to Redis for background execution.
6.  **Persistence Layer:** MongoDB stores the relational project graph and AI audit logs.

---

## Folder Structure

```text
src/
├── config/             # DB, Redis, and environment orchestration
├── controllers/        # Request-response lifecycle management
├── models/             # Mongoose data schemas (Domain Models)
├── routes/             # RESTful API & Versioned endpoint definitions
├── services/           # Business logic & Autonomous AI Agents
├── queues/             # BullMQ workers and job definitions
├── middleware/         # Security, Auth, Telemetry, and Validation
├── validations/        # Zod schema definitions for API inputs
├── utils/              # System-wide helpers (Logger, Normalizers)
├── jobs/               # Recurring system maintenance (Cron)
├── socket.js           # Real-time event orchestration bridge
└── app.js              # Server initialization and middleware mounting
```

---

## API Documentation

- **Auth Hub:** `POST /api/v1/auth/login`, `POST /api/v1/auth/register` (HttpOnly Cookie JWT)
- **Project Engine:** `GET /api/v1/projects`, `POST /api/v1/projects` (Includes health scoring)
- **Task Orchestrator:** `GET /api/v1/tasks`, `PATCH /api/v1/tasks/:id` (Triggers agent events)
- **Magic Command:** `POST /api/v1/magic/execute` (Natural language intent parsing)
- **Engineering Analytics:** `GET /api/v1/epi/metrics` (Performance indicators)
- **System Audit:** `GET /api/v1/admin/ai-logs` (Transparent AI logic trees)

---

## Database Design

The system utilizes MongoDB for its flexibility in handling evolving project graphs:
- **Workspace/Project/Task:** The core hierarchical structure.
- **AILog:** High-fidelity record of every autonomous agent decision.
- **ActionRequest:** A staging area for AI-suggested changes requiring human approval.
- **AuditLog:** System-wide telemetry of all human and automated mutations.

---

## Security Practices

- **Zero-Trust Auth:** Stateful JWT implementation via `HttpOnly` cookies to mitigate XSS.
- **Distributed Rate Limiting:** Redis-backed throttling to prevent DDoS and brute-force attacks.
- **CSP & Hardening:** Implementation of **Helmet** with strict Content Security Policies.
- **Input Sanitization:** Deep cleansing of all incoming data via `Zod` and `express-mongo-sanitize`.
- **Logic Isolation:** Agents run in isolated service contexts with strict `ExecutionPolicy` enforcement.

---

## Performance Optimizations

- **Non-Blocking Architecture:** Offloading AI and sync tasks to **BullMQ** prevents event-loop starvation.
- **Distributed Caching:** Redis caches pre-calculated EPI metrics and project health scores.
- **Pre-flight Caching:** 24h CORS pre-flight results to minimize latency on cross-origin requests.
- **Connection Pooling:** Robust Mongoose and IORedis connection management with automatic retries.

---

## Code Quality Review

- **Modularity:** High. Service-based architecture allows for independent scaling of domain logic.
- **Observability:** Centralized logging with **Winston** and telemetry middleware for real-time monitoring.
- **Resilience:** Redis fallback mechanisms ensure the system remains operational even during cache outages.
- **Maintainability:** Consistent use of versioned routing and standardized error responses.

---

## Limitations / Improvements

- **CPU-Intensive Agents:** As the number of active agents grows, they should be decoupled into microservices to avoid monolith resource contention.
- **Database Scaling:** While MongoDB handles the project graph well, high-volume time-series data for EPIs may eventually require a specialized store.
- **Real-time Latency:** Socket events are currently processed in-process; for large-scale deployments, a Redis Pub/Sub adapter would be required.

---

## Conclusion
The NexaSetu Orchestration Engine is built for the high-velocity requirements of modern engineering. By moving away from passive CRUD patterns toward an event-driven agent architecture, it provides the reliability and autonomy needed to manage the next generation of software projects.
