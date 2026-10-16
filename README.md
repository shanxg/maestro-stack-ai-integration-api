# Maestro Stack AI Integration API 🎼🧠

Developed by **Lucas Rivaldo**.

An enterprise-grade, high-performance distributed architecture designed to demonstrate seamless integration between modern asynchronous back-end pipelines, reactive front-end interfaces, and localized private Artificial Intelligence agents.

---

## 🏗️ Architectural Core & System Design

The application follows the **12-Factor App** methodology and microservices isolation principles to deliver maximum resilience and horizontal scalability.

### Technology Stack & Backing Services

- **Back-end Runtime:** Node.js v24+ with TypeScript and Express.
- **Database (Source of Truth):** PostgreSQL (isolated containerized instance).
- **Caching & Session State:** Redis Cluster for sub-millisecond data fetching.
- **Message Broker (Event-Driven Pipeline):** RabbitMQ for decoupled asynchronous tasks.
- **Private AI Engine:** Ollama running Llama 3 locally via specialized OpenAI SDK routing hooks.
- **Front-end Interface:** Next.js 16+ leveraging Turbopack, Tailwind CSS, and React 19 Client Components.

---

## ⚙️ Advanced Engineering Highlights

### 1. Unified AI Abstraction & Polymorphism

Thanks to interface abstraction, the back-end integrates the official `openai` NPM SDK but injects a custom `baseURL` pointing to the localized Ollama port (`11434/v1`). The code remains 100% cloud-compatible, meaning switching from the offline local **Llama 3** engine to a production enterprise cloud provider requires zero lines of code changes, satisfying strict **GDPR/LGPD data privacy compliance**.

### 2. High-Performance Front-end Hydration (React 19 & Next.js)

To mitigate the performance pitfalls of synchronous `setState` rendering cascades within React effects, the secure chat console subscribes to the browser storage layer using the advanced **`useSyncExternalStore`** API hook. This eliminates redundant rendering passes, ensures flawless state synchronization across context boundaries, and prevents client-side hydration mismatches caused by browser extensions or asynchronous UI paint cycles.

### 3. Bulletproof JWT Firewall & OWASP Safeguards

Every endpoint within the AI orchestration layer is guarded by a cryptographic JWT validation firewall. The stack implements strict **Rate Limiting** to shield backing services from Distributed Denial of Service (DDoS) attempts, integrates **Helmet** for HTTP header obfuscation, and applies **Zod schema runtime validation** to prevent Malformed Payloads and SQL/Command Injection vectors (addressing OWASP API Security Top 10 vulnerabilities).

### 4. Real-Time Reactive Pipeline: RabbitMQ & Server-Sent Events (SSE)

To meet microservices decoupling standards, the user registration process operates entirely asynchronously through an event-driven architecture, avoiding bottlenecks in the primary thread:

- **The Producer (Express API):** When a client hits `POST /users`, the payload is instantly validated via Zod. Instead of opening a blocking I/O stream directly to the database, the `UserController` serializes the metadata and publishes a persistent event packet (`user_created`) to the RabbitMQ broker, immediately returning an **`HTTP 202 Accepted`** response to the client within milliseconds.
- **The Consumer (Background Worker):** An autonomous worker thread continuously polls the RabbitMQ `user_events` queue. Once an event is intercepted, it decodes the binary buffer, processes the domain logic, and safely persists the record into the **PostgreSQL** cluster.
- **The Stream (Server-Sent Events):** Upon successful database write, the worker hands the data to the `EventBrokerService`'s internal SSE bridge. The server loops through the active pool of connection channels (`GET /events`) and pushes the notification to all active browser interfaces via a memory-efficient, unidirectional text-event stream, causing the front-end to reactively paint the updated state without repetitive HTTP polling loops.

### 5. LLM Security Boundaries (OWASP Top 10 for LLM Applications 2025)

`POST /ai/chat` treats the model as an untrusted, expensive dependency:

- **Unbounded consumption (LLM10:2025):** the prompt is limited to 2000 characters (Zod), the answer to 512 tokens (`max_tokens`), and the model server gets 60 seconds, without automatic retries, before the API answers `503 AI_SERVICE_UNAVAILABLE`. Each account may send 10 prompts per minute. The values live in `src/config.ts` (`settings.aiChat` and `settings.rateLimits.aiChat`).
- **Prompt injection (LLM01:2025):** a user can always try to override the system prompt. The model holds no data and has no tools or function calls, so a successful injection can only change the text of the answer returned to that same user.
- **Sensitive information disclosure (LLM02:2025):** the model receives only the fixed system prompt and the user's own prompt; no database records, other users' data or secrets are sent to it.
- **Improper output handling (LLM05:2025):** the answer is untrusted text, so the chat page renders it as text, never as HTML: React escapes it, ESLint's `react/no-danger` rule keeps raw HTML out of the frontend, and a static Content Security Policy limits what a page could load or call.

---

## 🐳 Local Infrastructure Setup & Backing Services

The environment is fully dockerized to ensure absolute environment parity between development and cluster orchestration topologies.

### 📥 1. Dribbling Disk Space Constraints: Custom Ollama Pathing (Drive D:\)

By default, the Windows Ollama daemon locks and downloads heavy LLM layers inside the primary OS partition (`C:\`), which can compromise system stability. To bypass this infrastructure constraint and direct the **4.7 GB Llama 3 model** strictly into a spacious secondary partition, execute the following PowerShell sequence as Administrator before initializing the daemon:

```powershell
# Force the global environment variable directly into the machine's registry
[Environment]::SetEnvironmentVariable("OLLAMA_MODELS", "D:\OllamaModels", "Machine")

# Close any background Ollama zombie processes near the Windows taskbar tray, then boot the server:
ollama serve
```

Open a secondary terminal and download the localized brain:

```bash
ollama run llama3
```

_The daemon will automatically structure the model blobs under `D:\OllamaModels\`, keeping your primary drive entirely untouched and secure._

### 🔌 Scalability Blueprint: Switching from Local Ollama to Cloud OpenAI API

The architecture leverages **Interface Abstraction** within the `AIService.ts` orchestration layer. Because the local **Ollama** daemon mimics the official OpenAI REST API specification, the entire platform is decoupled from the underlying LLM provider.

Migrating the application from the localized offline **Llama 3** engine to enterprise cloud-grade production engines requires **zero code changes**, satisfying corporate compliance and architectural elasticity.

<details close>

   <summary style="font-size: 20px; margin: 25px; font-weight: bold"> 
   🛠️ Step-by-Step Production Migration: <span style="font-style: italic; font-size: 16px;"> (click to open) </span> 
   </summary>

1. **Acquire a Production API Key:**
   Sign in to your enterprise cloud account (e.g., OpenAI Platform) and generate a secure API token (e.g., `sk-proj-...`).

2. **Update the Environment Infrastructure (`.env`):**
   Modify the backing service environment variables inside your root `.env` file to swap the internal routing hooks:

   ```env
   # ❌ LOCAL OFFLINE TOPOLOGY (the defaults in src/config.ts)
   # OPENAI_API_KEY="ollama"
   # OPENAI_MODEL="llama3"
   # OPENAI_BASE_URL="http://localhost:11434/v1"

   # 🚀 ENTERPRISE CLOUD PRODUCTION TOPOLOGY
   OPENAI_API_KEY="sk-proj-YOUR_AUTHENTICATED_PRODUCTION_KEY_HERE"
   OPENAI_MODEL="gpt-4o" # Or any target production model layer
   OPENAI_BASE_URL="https://api.openai.com/v1"
   ```

3. **Hot-Reload the Ecosystem:**
   Restart your Express application compiler. The `AIService` will read the new environment registry from memory on boot, instantly routing all secure prompts from the Next.js chat console into the global high-availability cloud infrastructure with zero friction.

</details>

### 🚀 2. Booting the Core Eco-system

Ensure your Docker Desktop environment is active. From the project's root folder, run the automated infrastructure script to spawn the Postgres, Redis, and RabbitMQ containers:

```bash
# Spin up background backing services
npm run infra:up

# Install dependencies using peer parities overrides
npm install --legacy-peer-deps

# Spin up the Back-end compiler in development watch mode (Port 3000)
npm run dev
```

### 🌐 3. Launching the Next.js Front-end

Open a secondary terminal, migrate to the UI folder, and trigger the Turbopack engine:

```bash
cd frontend
npm run dev
```

_The reactive client console will notice port 3000 is securely held by the Express REST API and will automatically map its visual endpoints onto `http://localhost:3001`._

---

## 📡 API Authentication Testing Vector

To test the security handshake and chat orchestration via terminal loops, capture a valid session pass:

```powershell
# 1. Acquire an authenticated signature token
curl.exe -i -X POST http://127.0.0 -H "Content-Type: application/json" -d "{\""username\"": \""admin\"", \""password\"": \""secret123\""}"

# 2. Fire an authenticated prompt request into the local Llama 3 core (Replace token placeholder)
curl.exe -i -X POST http://127.0.0 -H "Authorization: Bearer YOUR_TOKEN_HERE" -H "Content-Type: application/json" -d "{\""prompt\"": \""Hello Maestro, explain the benefits of distributed caching.\""}"
```

---

## 🛠️ Developer Tooling: Backlog Synchronization Pipeline

To keep the security remediation backlog auditable, the repository includes a Python tool that keeps a local Excel plan, GitHub Issues and the GitHub Projects board in sync.

### `sync_backlog.py`

The script runs three steps:

1. **GitHub Issues → Excel:** every issue whose title starts with a backlog ID (for example `[2.11] ...`) and that is not in the `Security Remediation Backlog` sheet yet gets a new row at the bottom. The columns are read back from the issue body, which follows the same template the script uses to create issues; if the body does not follow it, only the ID and the title are filled in. The initial `Status` comes from the board. If a row with the same ID already exists without an issue number, the script links that row to the issue instead of adding a new one. Issues without an ID in the title are skipped.
2. **Excel → GitHub Issues:** for every row without an issue number, it creates an issue (title, body and labels built from the row) and writes the issue number and URL back into the sheet. It runs after step 1, so a row that was just linked does not produce a duplicate issue.
3. **GitHub Projects → Excel:** it reads the `Status` field of every card on the project board ([shanxg #2](https://github.com/users/shanxg/projects/2)) through the GraphQL API and copies it into the sheet's `Status` column.

The board owns the status and the spreadsheet owns the content. The `Status` column uses the board's columns: `Backlog`, `Ready`, `In progress`, `In review`, `Done`. Rows whose issue is not on the board are left unchanged.

**Spreadsheet layout:** `security_plan_maestro_api.xlsx` is a local file (gitignored). The script reads columns A (`ID`) and D (`Improvement / finding`) to build the issues, writes column L (`Status`), and stores the issue in columns N (`Issue Number`) and O (`Issue URL`). Imported rows fill every column except M (`Evidence`), copy the format of the row above, and extend the ranges that ended at the previous last row (the `Status` and estimate dropdowns, the conditional formatting, the filter and the `Summary` formulas), so the new rows are counted.

**Setup:**

1. Create a virtual environment and install the pinned dependencies:

   ```bash
   python -m venv .venv
   .venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy `.env.example` to `.env` and fill in two tokens, each with the minimum access it needs (see CRED-03 in the remediation log):
   - `GITHUB_TOKEN`: fine-grained token limited to this repository, with **Issues: Read and write**. Used to list and create issues.
   - `GITHUB_PROJECT_TOKEN`: classic token with only the **`read:project`** scope. Used to read the board (fine-grained tokens are not documented for user-owned projects).

   The `.env` file is ignored by Git. Tokens are loaded with `python-dotenv`, so they are never hardcoded or exported to the shell history.

3. Close the spreadsheet in Excel (Windows locks open files), then run:
   ```bash
   python sync_backlog.py
   ```

The script checks both tokens before doing anything and is idempotent: issues already in the sheet are not imported again, rows that already have an issue are skipped, and the spreadsheet is only saved when a step actually changed something.

### Secret Scanning: Gitleaks + pre-commit

The repository enforces secret scanning at two layers, both using the same `.gitleaks.toml`:

- **Local:** a `pre-commit` hook runs Gitleaks on every `git commit` and blocks the commit if a secret is detected. `pre-commit` is installed by `requirements.txt`; register the hook once with:
  ```bash
  pre-commit install
  ```
- **CI:** the `Secret Scanning` workflow (`.github/workflows/secret-scan.yml`) runs Gitleaks on every push to `main` and on every pull request.

`.gitleaks.toml` extends the default ruleset and only allowlists documentation placeholders (e.g. `YOUR_TOKEN_HERE`, `REPLACE_ME`), matched against the detected value. There is no file allowlist, so `.env` or `k8s/secret.yaml` are blocked even if force-added (see SCAN-01).

Every remediation performed on this repository is logged in [`docs/security/remediation-log.md`](docs/security/remediation-log.md), with root cause, fix, regression test, and evidence.

---

## ☁️ Architectural Evolution: Hybrid Cloud Foundations

The repository intentionally preserves the core files `socket-deprecated.ts`, `rabbit-deprecated.ts`, and `worker-deprecated.ts` inside the codebase. These elements serve as a pedagogical and architectural blueprint, showcasing the platform's initial topology, which was designed for high-availability cloud consumption under enterprise paradigms.

### AWS Cloud Integration Vector:

- **Asynchronous Message Ingestion:** The decoupled ingestion pipe originally targeted an **AWS MQ (Managed RabbitMQ)** cluster or standalone **Amazon SQS (Simple Queue Service)** instance, validating enterprise-grade message persistence and durable delivery guarantees across cloud network boundaries.
- **Persistent Data Storage:** Cloud persistence layers were anchored using **Amazon RDS for PostgreSQL**, enforcing automated connection pooling, encrypted storage classes via **AWS KMS (Key Management Service)**, and multi-Availability Zone (Multi-AZ) failover strategies.
- **Real-Time Push Topology:** Push telemetries were decoupled from standard HTTP pipelines using managed WebSockets or edge notification triggers, proving proficiency in stateful connection management under continuous network load.

_These legacy assets are not wired into the running API. They follow the current message contract and security rules (JWT handshake, CORS allowlist, hashed passwords only), are covered by isolated tests in `tests/userRoutes.spec.ts`, and the worker runs on its own with `npx tsx src/worker-deprecated.ts`. They demonstrate production-ready capabilities in migrating mission-critical applications between Hybrid Cloud (AWS) and fully sovereign localized (On-Premise) data privacy topologies._

### Architecture Decision Records

Decisions that change the shape of the API are recorded in [`docs/adr/`](docs/adr/). [ADR 0001](docs/adr/0001-retire-the-graphql-endpoint.md) retired the GraphQL endpoint that shipped with the first version: no client used it, and keeping two delivery mechanisms in step doubled the surface to secure. REST, described by `openapi.yaml`, is the single API contract, and a test checks that every route the API serves is documented there.

---

## ⚖️ Architectural Trade-offs: CAP Theorem Dynamics

The Maestro architecture deliberately prioritizes **Availability & Partition Tolerance (AP)** within its streaming communication layer. Rather than holding the critical HTTP request pipeline hostage to complex analytical writes, data signals are dispatched asynchronously into **RabbitMQ** event queues. The platform favors **Eventual Consistency**, allowing backing consumers to batch write telemetries and auditing data blocks without adding a single millisecond of overhead to the user experience.
