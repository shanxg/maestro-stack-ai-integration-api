# Security Policy

## About this project

This repository is a **technical demonstration** of a distributed API
integrating a Next.js front-end, an Express/Node.js back-end, RabbitMQ,
Redis, PostgreSQL, and a local LLM (Ollama / Llama 3). It is not a
production service and does not hold real user data.

Security practices are nevertheless applied end-to-end because the
project also serves as a **portfolio of application security (AppSec)
remediation work**. Every finding, root cause, fix, and regression test
is documented in [`docs/security/remediation-log.md`](docs/security/remediation-log.md).

## Supported versions

| Version                  | Supported          |
| :----------------------- | :----------------- |
| `main` branch            | :white_check_mark: |
| Any fork or older commit | :x:                |

## Reporting a vulnerability

If you find a security issue in this repository, please **do not open a
public GitHub issue**. Instead, report it privately:

1. Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
   (Security tab → "Report a vulnerability").
2. Include: description, steps to reproduce, affected component
   (front-end, back-end, AI service, infrastructure), and any suggested
   mitigation.
3. If you prefer, you can also open a minimal GitHub issue requesting
   a private channel — without disclosing the finding.

Because this is a portfolio project maintained by a single developer,
there is no formal SLA. Reports will be acknowledged within a reasonable
timeframe and triaged on a best-effort basis.

## Scope

In scope:

- Source code in `src/` (Express back-end, services).
- Source code in `frontend/` (Next.js / React).
- Infrastructure files: `Dockerfile`, `docker-compose.yml`, `k8s/`.
- CI/CD workflows under `.github/workflows/`.
- Configuration files that ship secrets, tokens, or cryptographic keys.
- Prompt handling and LLM interaction paths in `AIService.ts`.

Out of scope:

- Findings that require physical access to the developer's machine.
- Social engineering against the maintainer.
- Denial of service through resource exhaustion against local
  development containers.
- Vulnerabilities in third-party dependencies that already have a
  published CVE and a pending fix upstream — please report those to the
  upstream project; the repository tracks them via Dependabot.

## Security controls in place

| Layer                | Control                                                                                                                                                                                                                                  |
| :------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Secrets**          | Local `.env` only (never committed). Gitleaks runs locally (pre-commit hook) and in CI on every push and pull request. Only documentation placeholders are allowlisted, so `.env` and `k8s/secret.yaml` are blocked even if force-added. |
| **Authentication**   | JWT-based. Tokens are signed with a secret loaded from the environment; the API refuses to start without it, and there is no hardcoded fallback. One module signs and verifies every token, pinning HS256, the issuer and the audience (`src/auth/accessToken.ts`).                                                                                         |
| **Authorization**    | One ADMIN role, stored in the `users` table and carried in the JWT; every other account is USER. Only admins list users; a regular account reads only its own record (`GET /users/me` or its own id) and gets 403 for any other id, existing or not. Rules in `src/auth/userPolicy.ts`. Admins are promoted directly in the database (`UPDATE users SET role = 'ADMIN' WHERE email = '...';`) and get the role at their next login. |
| **Input validation** | Zod schemas on REST user creation, `GET /users` pagination (whole numbers, page size capped at 100), login and the AI chat prompt (1 to 2000 characters).                                            |
| **Redirects**        | Every client-side navigation goes to a fixed internal route (`/login`, `/chat`, `/register`); no route reads a return URL from the request. A future `returnTo` must be checked against an allowlist of relative paths (CWE-601).        |
| **HTTP hardening**   | Helmet security headers on the API, with its CSP enforced in every environment. The Next.js frontend sends a static CSP (only its own origin and the API; no framing, no plugins), X-Frame-Options, nosniff, a strict Referrer-Policy and a Permissions-Policy on every route (`frontend/security-headers.ts`). Rate limiting: 100 req/15 min global, 5 login attempts/5 min per IP and 10 AI prompts/min per account, counted in Redis so every replica shares the limits.                                    |
| **LLM interaction**  | System prompt and user input sent as separate messages; the model gets no user data and no tools; answers capped at 512 tokens with a 60 s timeout (503 when the model server is unavailable); the model's answer is rendered as text (React escapes it), never as HTML, and ESLint's `react/no-danger` rule keeps raw HTML out of the frontend.                                                                                                                          |
| **Dependencies**     | Dependabot alerts and weekly version-update PRs (npm, GitHub Actions, Docker).                                                                                                                                                           |
| **DAST**             | OWASP ZAP API scan of the local API, driven by `openapi.yaml` (passive and active rules); reports and triage in `docs/security/dast/`. Not run in CI.                                                                                    |
| **Container**        | Runs as the unprivileged `node` user; Node 24 LTS base image; dependencies installed from the lockfile (`npm ci`). An allowlist `.dockerignore` keeps `.env`, `node_modules` and `frontend/` out of the build context.                   |
| **Infrastructure**   | Kubernetes manifests do not carry secrets — `secret.yaml` is gitignored and only `secret.yaml.example` is committed. PostgreSQL, RabbitMQ and Redis all require credentials from the environment, and the local Redis port is published on 127.0.0.1 only.                                                                                                                     |

A full list of remediations performed on this codebase is kept in
[`docs/security/remediation-log.md`](docs/security/remediation-log.md),
with detected-by, severity, root cause, fix, regression test, and
evidence for each entry.

## References

- [OWASP Top 10:2025](https://top10.owasp.org/2025/en/)
- [OWASP API Security Top 10 (2023)](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)
- [OWASP Top 10 for LLM Applications 2026](https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/)
- [CWE Top 25 (2025)](https://cwe.mitre.org/top25/archive/2025/2025_cwe_top25.html)
