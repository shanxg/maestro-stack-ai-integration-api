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

- Source code in `src/` (Express back-end, GraphQL resolvers, services).
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

| Layer                | Control                                                                                                                |
| :------------------- | :--------------------------------------------------------------------------------------------------------------------- |
| **Secrets**          | Local `.env` only (never committed). Gitleaks runs locally (pre-commit hook) and in CI on every push and pull request. |
| **Authentication**   | JWT-based. Tokens are signed with a rotating secret loaded from environment.                                           |
| **Input validation** | Zod schemas applied at the controller layer for REST and GraphQL.                                                      |
| **Transport**        | Helmet for HTTP headers; rate limiting on sensitive endpoints.                                                         |
| **LLM interaction**  | Input/output separation, output rendered through DOMPurify on the client.                                              |
| **Dependencies**     | Dependabot alerts and automated update PRs.                                                                            |
| **Container**        | Non-root user (see `Dockerfile`); pinned base image.                                                                   |
| **Infrastructure**   | Kubernetes manifests do not carry secrets — `secret.yaml` is gitignored and only `secret.yaml.example` is committed.   |

A full list of remediations performed on this codebase is kept in
[`docs/security/remediation-log.md`](docs/security/remediation-log.md),
with detected-by, severity, root cause, fix, regression test, and
evidence for each entry.

## References

- [OWASP Top 10 (2021)](https://owasp.org/Top10/)
- [OWASP API Security Top 10 (2023)](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)
- [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- [CWE Top 25](https://cwe.mitre.org/top25/archive/2023/2023_top25_list.html)
