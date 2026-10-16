# Dynamic application security testing (DAST)

## 2026-10-15 — OWASP ZAP API scan (issue #66)

- **Tool:** OWASP ZAP `zap-api-scan.py`, Docker image `ghcr.io/zaproxy/zaproxy:stable`, driven by `openapi.yaml`.
- **Target:** the API running locally from this repository with `NODE_ENV=production`, plus PostgreSQL, Redis and RabbitMQ from `docker-compose.yml`. It is not a deployed environment.
- **Scope:** `/auth/login`, `/users`, `/users/{id}`, `/api/v1/users`, `/ai/chat` and `/graphql` (12 URLs imported from the spec, 49 after the spider). `/events` was left out of the scan copy of the spec, because the scanner would hang on the open Server-Sent Events stream.
- **Authentication:** every request carried the JWT of a throwaway local account through ZAP's `ZAP_AUTH_HEADER_VALUE` variable. The token is not in the reports.
- **Rules:** passive and active. The active scan sends attack payloads, so it also created a test account in the local database.
- **Local-only change:** the scan process raised the rate limits before starting the server (see "How to run it again"), because the scanner would otherwise get `429` after 100 requests. The limiters themselves are covered by the test suite. No repository code was changed for the scan.

### Results

| Run | Code | High | Medium | Low | Informational | Rules passed |
| :-- | :-- | :-: | :-: | :-: | :-: | :-: |
| [Before the fix](zap-api-scan-2026-10-15-before.md) | `508ce24` | 0 | 0 | 3 | 3 | 118 |
| [After the fix](zap-api-scan-2026-10-15-after.md) | `e46501e` | 0 | 0 | 2 | 3 | 118 |

The passed rules include SQL injection (several engines, time based included), reflected and persistent cross-site scripting, OS command injection, path traversal, server-side template injection, XML external entities, CRLF injection, Log4Shell and Spring4Shell, and the response header checks (anti-clickjacking, `X-Content-Type-Options`, `Strict-Transport-Security`, CSP, `X-Powered-By`).

### Triage

| ZAP alert | Risk | Where | Decision |
| :-- | :-- | :-- | :-- |
| 100001 Unexpected Content-Type | Low | 23 unknown paths answered `text/html` (Express's default 404 page) | **Fixed** in `e46501e`: unknown routes answer `404 NOT_FOUND` in the JSON error envelope. Gone in the second run; regression test `GET /unknown -> returns 404 with the JSON error envelope`. |
| 100000 Server Error response | Low | `POST /ai/chat` answered `500` | **Environment:** no local model server (Ollama) was running, so the AI call failed. The body is the generic error envelope. Answering `503` with a timeout when the model server is unreachable belongs to issue #43. |
| 90022 Application Error Disclosure | Low | `POST /ai/chat` | **False positive:** the evidence is the status line `HTTP/1.1 500 Internal Server Error`. The body is `{"error":{"code":"INTERNAL_SERVER_ERROR","message":"..."}}` with no stack trace or internal detail. |
| 100000 Client Error response | Informational | `400`, `401` and `404` answers | Expected. |
| 10111 Authentication Request Identified | Informational | `POST /auth/login`, `POST /api/v1/users` | Expected. |
| 10049 Non-Storable Content | Informational | Authenticated responses | Expected: responses to requests with an `Authorization` header are not stored by shared caches. |

### How to run it again

1. Start the infrastructure: `docker compose up -d`.
2. Start the API in production mode with the rate limits raised for the scan only. A launcher outside the repository changes `settings` before the server starts:

   ```ts
   // scan-server.mts, run from the repository root: NODE_ENV=production npx tsx <path>/scan-server.mts
   import { pathToFileURL } from 'node:url';
   const root = '<repository path>/';
   const { settings } = await import(pathToFileURL(root + 'src/config.ts').href);
   for (const limit of Object.values(settings.rateLimits) as Array<{ max: number }>) {
     limit.max = 1_000_000;
   }
   await import(pathToFileURL(root + 'src/server.ts').href);
   ```

3. Register a throwaway account with `POST /api/v1/users`, log in with `POST /auth/login`, and write `ZAP_AUTH_HEADER_VALUE=Bearer <token>` to an env file. Do not pass the token on the command line, where it would stay in the shell history.
4. Copy `openapi.yaml` to the scan folder, set `servers` to `http://host.docker.internal:3000`, and remove `/events`.
5. Run the scan:

   ```bash
   docker run --rm --env-file <scan folder>/zap.env -v <scan folder>:/zap/wrk:rw ghcr.io/zaproxy/zaproxy:stable zap-api-scan.py -t /zap/wrk/openapi-scan.yaml -f openapi -w zap-api-report.md -J zap-api-report.json -T 30 -z "-config scanner.maxScanDurationInMins=20"
   ```

6. Stop the API and delete the test accounts the scan created.
