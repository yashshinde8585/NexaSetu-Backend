# 🛰️ NexaSetu Backend — AI-Driven Orchestration API

[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)

**NexaSetu Backend** is the high-performance nucleus of the NexaSetu ecosystem. It provides the secure infrastructure, autonomous agents, and AI intent-parsing engine required to orchestrate complex project management workflows at scale.

---

## 🔗 Ecosystem Links

- **Frontend UI:** [GitHub Repository](https://github.com/yashshinde88585/NexaSetu-frontend-.git)

---

## 🔥 Key Technical Capabilities

### 🧠 AI Orchestration & Intent Engine
The core intelligence layer that powers the **Magic Bar** and autonomous features.
- **Intent Parsing:** High-velocity NLP mapping from unstructured strings into actionable system triggers.
- **Staged Action Execution:** Complex AI-suggested actions are staged, validated against `ExecutionPolicy`, and held for human approval.
- **Autonomous Agent Fleet:** Specialized agents (`Portfolio`, `Harvester`, `Scheduler`) perform continuous health checks and resource optimization.

### 🛡️ Secure Session Infrastructure
Designed for enterprise-grade security and zero-trust environments.
- **Stateful JWT Auth:** Secure `HttpOnly` cookie-based sessions, mitigating XSS and session hijacking.
- **Rate-Limiting & Protection:** Integrated `express-rate-limit` and `helmet` headers for hardening.
- **Squad Provisioning Engine:** High-velocity multi-user creation with instant, email-based temporary credentials.

### 📊 Real-Time Project Insights
Data-driven analytics that move beyond basic CRUD operations.
- **Project Health Algorithms:** Automatically detects at-risk projects based on task velocity and resource bottlenecks.
- **Unified Activity Stream:** Aggregates both human and AI-generated events into a single, searchable audit log.
- **GitHub Syncing:** Seamless repository integration using **Octokit** to track development activity alongside project metrics.

---

## 🚀 Tech Stack

- **Server:** Node.js (Runtime) & Express 5 (Framework)
- **Database:** MongoDB with Mongoose (ODM)
- **Authentication:** JSON Web Tokens (JWT) & Cookie-Parser
- **AI Integration:** Hugging Face Inference API / Multi-agent services
- **Version Control API:** Octokit (GitHub REST & GraphQL API)
- **Security:** Helmet, BcryptJS, Express Rate Limit
- **Testing:** Jest & Supertest

---

## 🛠️ Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.x or higher)
- [MongoDB](https://www.mongodb.com/try/download/community) (Local or Atlas)
- Hugging Face Access Token
- GitHub Personal Access Token (for Octokit)

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/nexasetu-backend.git
cd nexasetu-backend
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/nexasetu
JWT_SECRET=your_super_secret_key
HF_TOKEN=your_huggingface_token
GITHUB_TOKEN=your_github_token
NODE_ENV=development
```

### 4. Run the Server
```bash
# Development (with nodemon)
npm run dev

# Production
npm start
```

---

## 📁 Source Overview

```text
src/
├── config/         # Database and environment configurations
├── controllers/    # Request handling logic (MagicBar, Dashboard, Auth)
├── middleware/     # Auth, Error handling, and Rate-limiting
├── models/         # Mongoose schemas (User, Project, Task, Activity)
├── routes/         # API endpoint definitions
├── services/       # Core business logic (Agents, ML services, Action Executor)
├── utils/          # Shared helper functions
└── app.js          # Express app initialization
```

---

## 🧪 Testing

The backend includes a comprehensive suite of unit and integration tests using Jest.
```bash
npm test
```

---

## 🤝 Contributing

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

