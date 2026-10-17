# Remediation Log

##### Each entry must include:

### [SEVERITY] [LOG-ID] - [Identifier/Standard]: [What and Where the Finding is]

> Title Elements:
>
> For dynamic and agile reading, visual severity indicators can be adopted:
>
> - 🚨 for Critical
> - 🔴 for High
> - 🟡 for Medium
> - 🔵 for Low
> - ℹ️ for Informational
>
> 1. `[LOG-ID]`: A sequential indexer (e.g., `SEC-01`, `REM-003`) so the security committee or the final client can reference the item in meetings (_"Lucas, regarding item `SEC-01`..."_).
> 2. `[SEVERITY]`: The risk classification in uppercase to create quick visual contrast.
> 3. `[Identifier/Standard]`: The direct mapping to the vulnerability using the applicable regulatory standard (**CWE, OWASP Top 10** or the tool identifier such as **Snyk** or **Gitleaks**).
> 4. `[What and Where]`: A short, purely technical phrase without adjectives, indicating which component or file was affected.

- **Date:** _`2026-10-13`_

> The date remediation was completed (not the date the finding was discovered). ISO format `YYYY-MM-DD`. If the finding was discovered earlier, mention that in the "Finding" text.

- **Detected by:** _`E.g.: Gitleaks (rules kubernetes-secret-yaml, generic-api-key).`_

> The tool, person, or process that identified the issue. This helps the reviewer understand how it was detected.
>
> - Tool: `Gitleaks`, `Semgrep`, `OWASP ZAP`, `Snyk`, `CodeQL`, `npm audit`.
> - Person: `Author (self-reported)`, `PR #42 reviewer`, `AppSec team`.
> - Process: `Threat modeling`, `code review`, `external penetration test`.

- **Severity:** _`High`_

> Risk classification. Use a consistent scale across all entries:
>
> | Level         |                                 Criteria                                 |
> | :------------ | :----------------------------------------------------------------------: |
> | Critical      |  _Trivial exploitation + high impact (e.g., RCE, complete auth bypass)_  |
> | High          | _Viable exploitation + significant impact (e.g., exposed secret, IDOR)_  |
> | Medium        | _Conditional exploitation + moderate impact (e.g., reflected XSS, CSRF)_ |
> | Low           | _Difficult to exploit or limited impact (e.g., minor information leak)_  |
> | Informational |                _False positive, good practice, hardening_                |
>
> The reviewer expects severity to align with CVSS or the OWASP Risk Rating. For additional precision, include the CVSS score in parentheses: `High (CVSS 7.5)`.

- **References:** _If there is no direct reference, write `—` (do not make one up)_

> Formal identifiers that tie the entry to recognized standards. Never leave this blank when a reference exists; this is what distinguishes a professional report from an amateur one.
>
> - _CWE: `CWE-798` (hardcoded credentials), `CWE-79` (XSS), `CWE-89` (SQL injection)._
> - _OWASP Top 10 (Web): `OWASP A04:2025`, `A07:2025`._
> - _OWASP API Top 10: `API1:2023 (BOLA)`, `API2:2023 (Broken Authentication)`._
> - _OWASP LLM Top 10: `LLM01:2026 (Prompt Injection)`. Always include the edition year: IDs change between editions._
> - _NIST / ISO: `NIST 800-53 IA-5`, `ISO 27001 A.9.4.3`._

- **Finding:**

> _E.g.:_
> _"The `k8s/secret.yaml` file was tracked with the Base64-encoded JWT secret, exposed in commit `7c18d84d`."_
>
> An objective description of the issue in one or two sentences. The reviewer reads this field first to decide whether to continue.  
> _`Rules: no adjectives, no alarmism, and include concrete evidence (file, line, commit, URL).`_

- **Root cause:**

> Why the issue existed. This helps prevent recurrence and goes beyond "what happened":
>
> - ❌ Don't: "the secret was hardcoded" (that is the finding).
> - ✅ Do: "Kubernetes manifest committed with the secret directly in stringData, without using Sealed Secrets or External Secrets" (that is the cause).
>
> If the root cause is procedural (lack of policy, no review, haste), say so:
> _`E.g.: No automated secret scanning before commit.`_

- **Remediation applied:**

> List the concrete actions taken, in the order they were performed. Each item must be verifiable:
>
> - Secret rotated (how was it generated?)
> - File removed from version control (which command?)
> - New file created (what name?)
> - Rule added (which configuration?)
> - History rewritten (which tool?)
>
> If the remediation is a stopgap (it does not address the root cause), state that explicitly.
> _E.g.: `"Stopgap remediation: secret rotated; the root cause (tracked manifest) will be addressed in item 4.02 using Sealed Secrets."`_

- **Regression test:**

> How to prove the issue will not recur. Without this, the entry is documentation only, not verified remediation.
>
> - Command run: _`gitleaks git . --verbose --redact`_.
> - Expected result: _`no leaks found`_.
> - Test case added: _`tests/auth.spec.ts › 'rejects token when no secret is configured'`_.
> - Verified behavior: _"commit is blocked by the pre-commit hook if a string matching `ghp_` is detected"\_.
>
> If the test is manual, explain how to reproduce it. If automated, reference the file and test name.

- **Evidence:**

> Closure evidence
>
> Links and references proving that the remediation was applied and is present in the repository:

> - Commits (`ed58f20`, `757f7e3`).
> - PRs (`PR #12`).
> - GitHub logs (`Security log`).
> - Tool output (screenshot of a passing pipeline).
> - Issue URLs (when applicable).

> Suggested format: _"Commit `abc1234` — description; PR #42; `.github/workflows/secret-scan.yml` workflow passing"_.

## Security Findings Log

---

## 🔴 [1.04 / 4.02] Hardcoded JWT secret in Kubernetes manifest

**Date:** 2026-10-13

**Detected by:** Gitleaks (rules `kubernetes-secret-yaml`, `generic-api-key`)

**Severity:** High

**References:** CWE-798, CWE-321, OWASP A07:2025, A04:2025

**Finding:**

The `k8s/secret.yaml` file was tracked in the public repository with the Base64-encoded JWT secret (value redacted; rotated), exposed in commit `7c18d84d` and earlier commits.

**Root cause:**

The Kubernetes manifest was committed with the secret value directly in it, without using Sealed Secrets, External Secrets, or environment variables.

**Remediation applied:**

- JWT secret rotated (new value generated with a CSPRNG).

- `k8s/secret.yaml` removed from version control and added to `.gitignore`.

- Created `k8s/secret.yaml.example` with the `REPLACE_ME` placeholder.

- Repository history rewritten with `git filter-repo` to remove commit `7c18d84d`; force push applied (`de01357..ed58f20`).

- Created `.gitleaks.toml` with an allowlist for placeholders and local files. _(Superseded by [SCAN-01].)_

**Regression test:**

- `gitleaks git . --verbose --redact` returns `no leaks found`.

- Commit is blocked by the pre-commit hook if a secret is reintroduced.

**Evidence:**

- Commit `ed58f20` — file removal.

- Commit `757f7e3` — `.gitignore` updated and `sync_backlog.py` added.

- Force push: `de01357..ed58f20 main -> main (forced update)`.

---

## 🟡 [5.01] No secret scanning before commit

**Date:** 2026-10-13

**Detected by:** Manual review / Gitleaks

**Severity:** Medium

**References:** OWASP A01:2025, CWE-540

**Finding:**

Without automated secret scanning before commit, any oversight (such as the one described above) can enter the repository history unchecked.

**Root cause:**

No pre-commit hook or secret-scanning pipeline was in place.

**Remediation applied:**

- `.pre-commit-config.yaml` configured with Gitleaks `v8.30.1` (runs on every `git commit`).

- `pre-commit install` registered in `.git/hooks/pre-commit`.

- `.gitleaks.toml` configured with an allowlist for instructional placeholders.

**Regression test:**

- Attempting to commit a file containing the string `ghp_xxx` should fail in the hook.

**Evidence:**

- `.pre-commit-config.yaml`, `.gitleaks.toml`.

---

## ℹ️ [1.06] `YOUR_TOKEN_HERE` placeholder in README (false positive)

**Date:** 2026-10-13

**Detected by:** Gitleaks (rule `curl-auth-header`)

**Severity:** Informational

**References:** —

**Finding:**

The **README** contains a `curl` example with `Authorization: Bearer YOUR_TOKEN_HERE`, which triggers the `curl-auth-header` rule.

**Root cause:**

- False positive: the string is an instructional placeholder, not a real secret.

**Remediation applied:**

- Allowlist added to `.gitleaks.toml` (`regexes` and `paths`). _(Superseded by [SCAN-01]: the `paths` allowlist was removed.)_

**Regression test:**

- `gitleaks git . --verbose --redact` no longer reports the README.

**Evidence:**

- `.gitleaks.toml`, `[allowlist]` section.

---

## 🚨 [CRED-01] Personal Access Token exposed in a chat channel

**Date:** 2026-10-13

**Detected by:** Author (immediate self-report)

**Severity:** Critical

**References:** CWE-522, OWASP A06:2025

**Finding:**
A GitHub Personal Access Token (prefix `ghp_xmVX...`) was accidentally pasted into a
chat channel, exposing the credential in
plain text. Because the token had the `repo` scope, it granted read and write access
to all 15 of the author's repositories.

**Root cause:**
There was no clear process for handling secrets during automation tasks.
The `.env` file had been created, but the token was manually entered
in a shared context instead of being added directly in the editor.

**Remediation applied:**

- Token revoked on GitHub immediately after detection.
- New token generated with the minimum required scope (`repo`). _(Superseded by [CRED-03]: `repo` was not the minimum; replaced by a fine-grained token.)_
- New token stored only in the local `.env` file, which is listed in `.gitignore`.
- `python-dotenv` integrated into `sync_backlog.py`, eliminating the need
  to export the variable in the shell (where it persists in PowerShell history).

**Regression test:**

- `git check-ignore -v .env` confirms that the file is not tracked.
- The Gitleaks pre-commit hook (`.pre-commit-config.yaml`) blocks commits
  containing strings in the `ghp_` format.
- `gitleaks git . --verbose --redact` returns `no leaks found`.

**Evidence:**

- Old token: revoked (GitHub Settings → Security log).
- New token: stored only in the local `.env` file, never committed.
- Commit `757f7e3` — `sync_backlog.py` added.
- Commit `2abc4fc` — `.gitleaks.toml` and `.pre-commit-config.yaml` added.

---

## 🟡 [SCAN-01] Gitleaks path allowlist skipped files that hold real secrets

**Date:** 2026-10-14

**Detected by:** Author (configuration review)

**Severity:** Medium

**References:** CWE-540, OWASP A01:2025

**Finding:**

`.gitleaks.toml` allowlisted by path `.env`, `k8s/secret.yaml`, `README.md`, `.env.example`, `secret.yaml.example` and `frontend/.next/`. A commit that force-added `.env` or `k8s/secret.yaml`, or pasted a real token into a README or example file, passed both the pre-commit hook and CI.

**Root cause:**

Placeholder false positives (see [1.06]) were silenced by excluding whole files instead of matching the placeholder values themselves.

**Remediation applied:**

- Removed the `paths` allowlist from `.gitleaks.toml`.
- Placeholder regexes anchored (`^...$`) and matched against the extracted secret only (`regexTarget = "secret"`).

**Regression test:**

- In a throwaway clone, fake secrets were staged in `.env` and `k8s/secret.yaml` (`git add -f`), `README.md` and `k8s/secret.yaml.example`. With `gitleaks git --pre-commit --staged`, the old config reported 0 findings and the new config reported 6.
- `gitleaks git . --verbose --redact` on the full history (39 commits) returns `no leaks found`.

**Evidence:**

- Commit `479a9ff` — `.gitleaks.toml`; merged in PR #67.

---

## 🟡 [CRED-02] Hardcoded fallback JWT secret in the authentication middleware

**Date:** 2026-10-14

**Detected by:** Author (review of `SECURITY.md` claims against the code). Not flagged by Gitleaks.

**Severity:** Medium

**References:** CWE-798, OWASP A07:2025

**Finding:**

`src/middlewares/authMiddleware.ts` (line 16) fell back to a hardcoded secret when `JWT_SECRET` was unset. `src/app.ts` already aborts startup without the variable, so the fallback was not reachable through the normal entry point. Any other code path that loaded the middleware without the variable would verify tokens with a secret published in the repository.

**Root cause:**

The secret check lived only in `app.ts`; the middleware kept its own default value instead of failing closed.

**Remediation applied:**

- Fallback removed; the middleware throws at load time if `JWT_SECRET` is missing.
- The removed value remains in git history and must be treated as public. It must never be used as a real secret.

**Regression test:**

- Importing `authMiddleware.ts` without `JWT_SECRET` fails with `JWT_SECRET is not set`; with the variable set, it loads.
- `npx tsc --noEmit` passes.

**Evidence:**

- Commit `7595ba4` — `src/middlewares/authMiddleware.ts`; merged in PR #67.

---

## 🟡 [CONT-01] API container ran as root on an end-of-life Node.js image

**Date:** 2026-10-14

**Detected by:** Author (review of `SECURITY.md` claims against the code)

**Severity:** Medium

**References:** CWE-250, CWE-1104, OWASP A03:2025

**Finding:**

The `Dockerfile` had no `USER` instruction, so the API ran as `root`, and both stages used `node:20-alpine`, which reached end of life on 2026-04-30. `SECURITY.md` claimed a non-root user and a pinned base image. There was also no `.dockerignore`, so the whole project directory, including `.env`, was sent to the build context and copied into the builder stage.

**Root cause:**

The container controls in `SECURITY.md` described the intended setup and were never checked against the `Dockerfile`.

**Remediation applied:**

- Base image updated to `node:24-alpine` (Active LTS) in both stages.
- `npm install` replaced by `npm ci`, so dependencies come exactly from the lockfile.
- `USER node` added to the runtime stage.
- Allowlist `.dockerignore` added: only `package.json`, `package-lock.json`, `tsconfig.json` and `src/` reach the build context.

**Regression test:**

- `docker run --rm maestro-api:test sh -c "whoami && node --version"` prints `node` and `v24.x`.
- `docker build --target builder` followed by `ls -A /app` lists only `dist`, `node_modules`, `package-lock.json`, `package.json`, `src` and `tsconfig.json`.

**Evidence:**

- Commit `984d903` — `Dockerfile` and `.dockerignore`.

---

## 🔵 [VAL-01] GraphQL `createUser` mutation skipped input validation

**Date:** 2026-10-14

**Detected by:** Author (review of `SECURITY.md` claims against the code)

**Severity:** Low

**References:** CWE-20, CWE-521, OWASP A05:2025, A07:2025

**Finding:**

The GraphQL `createUser` mutation passed its arguments straight to `UserService.createUser`. The REST route `POST /api/v1/users` validates the same fields with `createUserSchema` (name of at least 3 characters, valid email, password of at least 8 characters), so GraphQL was an alternate path around those rules, including the password length policy. The mutation requires an authenticated user.

**Root cause:**

Validation was implemented as Express middleware on the REST route only; GraphQL resolvers do not pass through that middleware.

**Remediation applied:**

- The resolver reuses `createUserSchema` (`safeParse` on the `body` shape), so both entry points enforce the same rules.
- Invalid input returns a `GraphQLError` with code `BAD_USER_INPUT` and per-field details.

**Regression test:**

- Manual (scratch script, not yet an automated test): calling the resolver with name `Al`, email `bad` and password `123` returns `BAD_USER_INPUT` on `name`, `email` and `password`; valid input reaches the service. _(Superseded by the automated test below.)_
- Automated: `tests/userResolvers.spec.ts` calls the resolver directly; invalid input must raise `BAD_USER_INPUT` on `name`, `email` and `password` without reaching `UserService`, and valid input must reach it unchanged.

**Evidence:**

- Commit `dff3d15` — `src/graphql/userResolvers.ts`; merged in PR #67.
- Commit `46aef35` — `tests/userResolvers.spec.ts` (automated regression test).

---

## 🟡 [CRED-03] `sync_backlog.py` token could write to every repository of the account

**Date:** 2026-10-14

**Detected by:** Author (review of CRED-01 against the principle of least privilege)

**Severity:** Medium

**References:** CWE-250

**Finding:**

The classic token created in CRED-01 for `sync_backlog.py` had the `repo` scope, which grants read and write access to every repository of the account, including private repositories and their Actions secrets. The script only needs to read and create issues in this repository.

**Root cause:**

Classic tokens only offer broad scopes, and CRED-01 assumed `repo` was the minimum.

**Remediation applied:**

- Classic token replaced by a fine-grained token limited to `shanxg/maestro-stack-ai-integration-api`, with only Issues: Read and write (plus the mandatory Metadata: Read-only) and an expiration date.
- Old token revoked on GitHub and removed from `.env`.
- Planned: reading the GitHub Projects board will use a separate classic token with only `read:project`, because fine-grained tokens are not documented for user-owned projects. _(Done 2026-10-15: `GITHUB_PROJECT_TOKEN`.)_

**Regression test:**

- With the new token, `sync_backlog.list_issues()` returns the 33 issues.
- With the new token, `GET /repos/shanxg/maestro-stack-ai-integration-api/actions/secrets` returns `403 Resource not accessible by personal access token`, a call the `repo` scope allows.
- 2026-10-15: with the board token, `GET /rate_limit` returns `X-OAuth-Scopes: read:project` (no other scope), and `list_project_statuses()` returns the 33 board cards.

**Evidence:**

- Old token: deleted (GitHub Settings → Developer settings → Tokens (classic)).
- New token: stored only in the local `.env` file, which is gitignored.
- Board token: classic, `read:project` only, stored only in the local `.env` file; used by `list_project_statuses()` in commit `7eb8081`.

---

## 🔵 [DEP-01] Vulnerable `handlebars` and `sprintf-js` in the development dependency tree

**Date:** 2026-10-14

**Detected by:** Dependabot alerts #2, #3, #4 and #5 (`package-lock.json`)

**Severity:** Low (upstream advisories rate `handlebars` two Critical and one Medium, and `sprintf-js` Medium; both packages were development-only and never reached the runtime image)

**References:** CWE-1395, OWASP A03:2025; GHSA-8r5x-fm3f-whwj (CVE-2026-106446), GHSA-p8wg-vrv2-v86f (CVE-2026-106445), GHSA-xw65-4hp5-5hc7 (CVE-2026-106444), GHSA-hp3w-g68c-fv3c (CVE-2026-97058)

**Finding:**

`package-lock.json` resolved `handlebars@4.7.9` (JavaScript injection advisories, fixed in 4.7.10) through `ts-jest`, and `sprintf-js@1.0.3` (denial of service through unbounded precision specifiers, no fixed release) through `jest` → `babel-plugin-istanbul` → `@istanbuljs/load-nyc-config` → `js-yaml@3` → `argparse@1`. Both were development dependencies: the runtime stage of the `Dockerfile` installs with `npm ci --omit=dev`, and no project code imports either package.

**Root cause:**

`ts-jest` stayed in `devDependencies` after the SWC transform replaced it, kept only for its ESM preset, and the coverage tooling still depends on the `js-yaml` 3 line. Dependency alerts were only enabled on 2026-10-14.

**Remediation applied:**

- `ts-jest` removed from `devDependencies`; `jest.config.ts` replaces its `default-esm` preset with `extensionsToTreatAsEsm: ['.ts']`. This removes `handlebars` from the tree.
- An `overrides` entry in `package.json` resolves `js-yaml` to `^4.1.1` for `@istanbuljs/load-nyc-config`, which only calls `js-yaml.load()`. `js-yaml` 4 depends on `argparse` 2, which does not use `sprintf-js`, so the package leaves the tree. The override can be removed once `@istanbuljs/load-nyc-config` depends on `js-yaml` 4 itself.

**Regression test:**

- `npm ls handlebars sprintf-js` returns an empty tree.
- `npm audit` reports `found 0 vulnerabilities`.
- `npm test`, which collects coverage and therefore loads `@istanbuljs/load-nyc-config`, passes: 3 suites, 19 tests.

**Evidence:**

- Commit `9112edd` — `package.json`, `package-lock.json`, `jest.config.ts`.

---

## 🔵 [CONT-02] Unpinned images in `docker-compose.yml` and no `securityContext` in the Kubernetes deployment

**Date:** 2026-10-15

**Detected by:** Author (backlog item 3.08, issue #63)

**Severity:** Low

**References:** CWE-250, OWASP A02:2025, A03:2025

**Finding:**

`docker-compose.yml` pulled `postgres:latest` and `redis:latest`, so the first `docker compose up` after a new major release would run a different major version; a new PostgreSQL major cannot open the previous data directory. `k8s/deployment.yaml` set no `securityContext`, so the cluster did not enforce a non-root user, did not block privilege escalation or Linux capabilities, and left the root filesystem writable. The `USER node` instruction from CONT-01 was the only control, and it lived in the image, not in the deployment.

**Root cause:**

CONT-01 hardened the `Dockerfile` only; the compose file and the Kubernetes manifest were not reviewed in the same pass.

**Remediation applied:**

- `docker-compose.yml` pins the majors already in use: `postgres:18`, `redis:8` and `rabbitmq:3.13-management`.
- `k8s/deployment.yaml` adds a Pod `securityContext` (`runAsNonRoot`, `runAsUser`/`runAsGroup` 1000, `seccompProfile: RuntimeDefault`) and a container `securityContext` (`allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, `capabilities.drop: ["ALL"]`).

**Regression test:**

- `docker compose up -d` recreated the three containers on the pinned tags; PostgreSQL 18.6 reopened the existing data directory and the `users` table.
- No cluster was available, so the manifest was checked by parsing it (both `securityContext` blocks sit at the expected paths) and by running `maestro-api:v1` with the equivalent flags (`--read-only --cap-drop ALL --security-opt no-new-privileges --user 1000:1000`) on the compose network: the API connected to PostgreSQL and RabbitMQ, answered `401` on `GET /users`, and `touch` in `/app` and `/tmp` failed with `Read-only file system`.

**Evidence:**

- Commit `6b811bb` — `docker-compose.yml`.
- Commit `f9a18b3` — `k8s/deployment.yaml`.

---

## 🟡 [CRED-04] Hardcoded default PostgreSQL password and unvalidated environment configuration

**Date:** 2026-10-15

**Detected by:** Author (backlog item 1.04, issue #37)

**Severity:** Medium

**References:** CWE-259, CWE-1392, OWASP A07:2025

**Finding:**

`src/repositories/UserRepository.ts` connected with `POSTGRES_PASSWORD || 'secret'`, and `docker-compose.yml` created the local container with `POSTGRES_PASSWORD: secret`. `k8s/deployment.yaml` did not set `POSTGRES_PASSWORD`, so a cluster deployment would also connect with the value published in the repository. Six modules read `process.env` with their own fallbacks, so a missing or malformed variable (for example a non-numeric port) was not reported at startup. The JWT secret fallback had already been removed in CRED-02.

**Root cause:**

Each module read the environment on its own with a local default; no single place declared which variables are required or validated them at boot. CRED-02 fixed only the JWT secret.

**Remediation applied:**

- `src/config.ts` validates the environment with Zod when the API starts. `JWT_SECRET` (at least 32 characters, RFC 7518 section 3.2) and `POSTGRES_PASSWORD` are required, ports must be integers between 1 and 65535, and `OPENAI_BASE_URL` must be a URL. On failure it lists only the variable names and the broken rule, never the values. It also holds the fixed limits: rate limits, users cache TTL, bcrypt cost and token lifetime.
- Every module reads `env` and `settings` from `src/config.ts`. No `process.env` remains in `src/` outside `config.ts` and the deprecated blueprint files.
- `docker-compose.yml` reads `POSTGRES_PASSWORD` from `.env` and stops if it is unset. `k8s/deployment.yaml` injects it from the `maestro-api-secret` Secret (new `postgres-password` key). `.env.example` and `k8s/secret.yaml.example` document it as required.
- Local environment: the `pg_integrated` password was rotated with `ALTER USER` to a random 48-character hex value, stored only in `.env`.
- The value `secret` remains in git history and in any database created with it, so it must be treated as public.

**Regression test:**

- `tests/userRoutes.spec.ts` › `POST /auth/login -> returns 429 after the configured number of attempts` reads the limit from `settings.rateLimits.login`; it fails when the login limiter is pointed at `settings.rateLimits.global`.
- `tests/setupEnv.ts` supplies random test-only values, so the suite runs without a `.env`. In a clone without `.env` and without this file, the suites that load the application failed at import with `Invalid environment configuration`.
- Loading `src/config.ts` without `POSTGRES_PASSWORD` stops with `POSTGRES_PASSWORD: Invalid input: expected string, received undefined`.
- `docker compose --env-file <empty file> config` fails with `required variable POSTGRES_PASSWORD is missing a value`.
- After `docker compose up -d` recreated `pg_integrated` on the same volume, a login with the `.env` password succeeded and a login with `secret` failed (`28P01 password authentication failed`). The API started with the real `.env`, validated the `users` table and answered `401` on `GET /users` without a token.
- `npx tsc --noEmit` passes; `npm test` passes (3 suites, 20 tests).

**Evidence:**

- Commit `71f2547` — `src/config.ts`.
- Commit `d05c05d` — `tests/setupEnv.ts`, `jest.config.ts`.
- Commit `705c1ba` — modules read `src/config.ts`.
- Commit `04aae5a` — login rate-limit test.
- Commit `07c42a1` — `.env.example`, `docker-compose.yml`, `k8s/deployment.yaml`, `k8s/secret.yaml.example`.
- Issue #37.

---

## 🟡 [CRED-05] RabbitMQ connection used the broker's default `guest` account

**Date:** 2026-10-15

**Detected by:** Author (found while moving the RabbitMQ settings to `src/config.ts` for CRED-04; issue #96)

**Severity:** Medium

**References:** CWE-1392, OWASP A07:2025

**Finding:**

`src/services/EventBrokerService.ts` connected to `amqp://host:port` without credentials, so amqplib logged in as `guest:guest`. Neither `docker-compose.yml` nor `k8s/deployment.yaml` set RabbitMQ credentials. The official `rabbitmq` image ships `loopback_users.guest = false`, so `guest` (tagged `administrator`) was accepted from any host, and compose published ports 5672 and 15672 (management UI) on all interfaces. Anyone who reached those ports could read the `user_events` queue or publish registration events to it.

**Root cause:**

The broker was used with its built-in defaults; no account was defined for the API, and the environment had no variables for broker credentials.

**Remediation applied:**

- `src/config.ts` requires `RABBIT_USER` and `RABBIT_PASSWORD` and rejects `guest` as the user.
- `EventBrokerService` connects with an options object built from them, so the password is never part of a URL or of the logged address.
- `docker-compose.yml` passes them to `RABBITMQ_DEFAULT_USER` and `RABBITMQ_DEFAULT_PASS`, so the broker creates that account on its first start and never creates `guest`; compose stops if they are unset. `k8s/deployment.yaml` injects both from the `maestro-api-secret` Secret (new `rabbit-user` and `rabbit-password` keys). `.env.example` documents them as required.
- Local environment: `rabbit_integrated` was recreated with a `maestro` account and a random 48-character hex password, stored only in `.env`.
- The deprecated blueprint modules (`src/queue/rabbit-deprecated.ts`, `src/worker-deprecated.ts`) still connect without credentials; the API does not load them, and they no longer reach a broker without `guest`.

**Regression test:**

- `tests/eventBroker.spec.ts` › `connects with RABBIT_USER and RABBIT_PASSWORD and never logs the password`: it checks the connection options and the log output, and it fails when the connection goes back to the credential-less URL.
- `docker compose --env-file <empty file> config` fails with `required variable RABBIT_USER is missing a value`.
- After `docker compose up -d` recreated `rabbit_integrated`, `rabbitmqctl list_users` listed only `maestro`. An AMQP login with the `.env` account succeeded, `guest:guest` was refused (`403 ACCESS_REFUSED`), and the management API answered `401` to `guest:guest`.
- The API started with the real `.env`, declared the `user_events` queue, and its log did not contain the password.
- `npx tsc --noEmit` passes; `npm test` passes (4 suites, 21 tests).

**Evidence:**

- Commit `92dffb0` — `src/config.ts`, `src/services/EventBrokerService.ts`, `tests/setupEnv.ts`, `tests/eventBroker.spec.ts`.
- Commit `d342708` — `.env.example`, `docker-compose.yml`, `k8s/deployment.yaml`, `k8s/secret.yaml.example`.
- Issue #96.

---

## 🔵 [VAL-02] `GET /users` accepted unvalidated and unbounded pagination

**Date:** 2026-10-15

**Detected by:** Author (backlog item 1.11, issue #44; confirmed while documenting the routes in `openapi.yaml` for issue #61)

**Severity:** Low

**References:** CWE-1284, CWE-770, OWASP API4:2023

**Finding:**

`UserController.getUsers` converted `limit` and `offset` with `parseInt` and only raised values below the minimum (`Math.max`). A non-numeric value such as `limit=abc` became `NaN`; the PostgreSQL query failed inside `UserRepository.findAll`, which logs the error and returns an empty list, so the route answered `200 []` instead of `400`. There was no upper bound on `limit`, so any authenticated user could fetch the whole `users` table in one response (for example, `limit=1000000`).

**Root cause:**

The route had no input schema. The controller parsed the query string by hand and silently corrected some invalid values instead of rejecting them.

**Remediation applied:**

- `src/config.ts` holds the page size in `settings.pagination` (`defaultLimit` 10, `maxLimit` 100).
- `listUsersSchema` in `src/schemas/userSchema.ts` (Zod) requires whole numbers: `limit` from 1 to `maxLimit` and `offset` from 0. Missing values fall back to the defaults.
- The route runs `authMiddleware` and then `validateMiddleware(listUsersSchema)`, so invalid values get `400 VALIDATION_FAILURE` naming the failing field before the service or the database is reached. Callers without a token still get `401` first.
- The controller reads the converted numbers with `listUsersSchema.shape.query.parse(req.query)`; `parseInt` and `Math.max` were removed. Zero and negative values are now rejected instead of being raised to the minimum.
- `openapi.yaml` documents `minimum`, `maximum` and the `400` response; the known-issue notes about issue #44 were removed.

**Regression test:**

- `tests/userRoutes.spec.ts` › `GET /users -> returns 400 when limit or offset is not a whole number in range`: `limit` set to `abc`, `2.5`, `0` or `101`, and `offset` set to `-1`, must each get `400 VALIDATION_FAILURE` naming the failing field, and the service must never be called. Run against the previous route and controller (with only `settings.pagination` added), it failed with `Expected: 400, Received: 200`.
- `tests/userRoutes.spec.ts` › `GET /users -> passes the cap and the default page to the service as numbers`: `limit=100&offset=20` reaches the service as `{ limit: 100, offset: 20 }`, and a request without parameters as `{ limit: 10, offset: 0 }`.
- `npx tsc --noEmit` passes; `npm test` passes (4 suites, 23 tests).

**Evidence:**

- Commit `1c61f92` — `src/config.ts`, `src/schemas/userSchema.ts`, `src/app.ts`, `src/controllers/UserController.ts`, `tests/userRoutes.spec.ts`.
- Commit `65c7005` — `openapi.yaml`.
- Issue #44.

---

## 🟡 [AUTH-01] Login response time revealed which accounts exist, and a non-text username crashed the route

**Date:** 2026-10-15

**Detected by:** Author (backlog item 1.07, issue #40; the crash was also documented as a known issue in `openapi.yaml` for issue #61)

**Severity:** Medium

**References:** CWE-208, CWE-1287, OWASP A07:2025

**Finding:**

`POST /auth/login` in `src/app.ts` returned the generic `401` at once when the e-mail had no account, and ran `bcrypt.compare` (cost 12) only when the account existed. The response body was the same in both cases, but the response time was not, so anyone could tell registered e-mails from unknown ones by timing the public login route. The handler also called `username.trim()` without checking the type: a numeric `username`, or a body that is not JSON, threw a `TypeError` and the route answered `500` instead of `400`.

**Root cause:**

The "unknown account" branch returned early to skip work, and the input was checked by hand for presence only, not for type.

**Remediation applied:**

- `loginSchema` in `src/schemas/authSchema.ts` (Zod) requires `username` as non-blank text (trimmed) and `password` as text with at least one non-space character (not trimmed, because registration stores the password unchanged).
- The route runs `authBruteForceLimiter`, then `validateMiddleware(loginSchema)`, so malformed bodies get `400 VALIDATION_FAILURE` and still count toward the login rate limit. The handler reads the values with `loginSchema.shape.body.parse(req.body)`.
- `createApp` computes a dummy bcrypt hash once, from a random value and with `settings.bcryptSaltRounds`. `bcrypt.compare` always runs: against the stored hash, or against the dummy hash when the account does not exist. The two `401` branches became one, so the body and the work done are the same for unknown e-mails and wrong passwords. The dummy hash cannot be used to log in, because the route still answers `401` when there is no account.
- `openapi.yaml` documents the `400` response and the constant-cost comparison; the known-issue notes about issue #40 were removed.

**Regression test:**

- `tests/userRoutes.spec.ts` › `POST /auth/login -> returns 400 when username or password is missing, blank or not text`: a numeric `username`, an array `password`, a blank `username` and an empty body must each get `400 VALIDATION_FAILURE`, and the user lookup must never run. Against the previous code it failed with `Expected: 400, Received: 500`.
- `tests/userRoutes.spec.ts` › `POST /auth/login -> runs bcrypt with the configured cost when the e-mail is unknown`: a login with an unknown e-mail must answer `401` and call `bcrypt.compare` once, against a hash whose cost (`bcrypt.getRounds`) equals `settings.bcryptSaltRounds`. The test checks the work done instead of measuring time, so it is not flaky. Against the previous code it failed with `Expected number of calls: 1, Received number of calls: 0`.
- `npx tsc --noEmit` passes; `npm test` passes (4 suites, 25 tests).

**Evidence:**

- Commit `2ab4006` — `src/schemas/authSchema.ts`, `src/app.ts`, `tests/userRoutes.spec.ts`.
- Commit `67847da` — `openapi.yaml`.
- Issue #40.

---

## ℹ️ [REDIR-01] Open redirect review: no redirect takes its target from user input (not applicable)

**Date:** 2026-10-15

**Detected by:** Author (backlog item 4.01, issue #64; open redirects are listed in the job posting this project supports)

**Severity:** Informational

**References:** CWE-601

**Finding:**

Review of every redirect in the API and the Next.js frontend. The frontend navigates only to fixed internal routes: `router.replace('/login')` in `app/page.tsx` and `app/chat/page.tsx`, `router.push('/chat')` and `router.push('/register')` in `app/login/page.tsx`, and `router.push('/login')` in `app/register/page.tsx`. No page reads `searchParams` or a `returnTo`/`next`/`callbackUrl` value, no link or `window.location` call takes a dynamic target, and there is no Next.js middleware or `redirects()` entry in `next.config.ts`. The API never calls `res.redirect` or sets a `Location` header. No redirect target comes from the request, so there is no open redirect today.

**Root cause:**

- Not applicable: the application has no redirect with a user-controlled destination.

**Remediation applied:**

- No code change. `SECURITY.md` now has a Redirects row that records the rule: navigation goes only to fixed internal routes, and a future `returnTo` must be checked against an allowlist of relative paths before it is used.

**Regression test:**

- None automated: the frontend has no test framework yet. The review above was done with `grep` over `frontend/app` and `src` for `router.push`, `router.replace`, `redirect(`, `window.location`, `searchParams`, `returnTo`, dynamic `href` values and `res.redirect`. If a `returnTo` is ever added, it needs a `safeRedirect()` helper with its own test (issue #64 proposal).

**Evidence:**

- Commit `03a4ab2` — `SECURITY.md` (Redirects row).
- Issue #64.

---

## 🔵 [RATE-01] Rate-limit counters were not shared between API replicas

**Date:** 2026-10-15

**Detected by:** Author (backlog item 4.02, issue #65)

**Severity:** Low

**References:** CWE-770, CWE-307, OWASP API4:2023

**Finding:**

The three `express-rate-limit` limiters in `src/app.ts` (global, login and AI chat) used the default in-memory store, so each API process kept its own counters. `k8s/deployment.yaml` runs two replicas behind one Service, so a client spread across both replicas could send twice the configured limits: 10 login attempts every 5 minutes instead of 5, and 200 requests every 15 minutes instead of 100.

**Root cause:**

The limiters were written for a single process; the counters were never moved to shared storage when the deployment was scaled to two replicas.

**Remediation applied:**

- `src/middlewares/redisRateLimitStore.ts` implements the `express-rate-limit` store contract on Redis (`ioredis`, already a dependency). Each hit runs one `MULTI`/`EXEC` transaction: `SET key 0 PX <window> NX` creates the counter with the window as its expiry, `INCR` adds the hit and keeps the expiry, and `PTTL` gives the reset time. A counter found without an expiry gets one, so a client can never be blocked forever.
- Each limiter has its own key prefix (`rl:global:`, `rl:login:`, `rl:ai-chat:`), so global hits never count as login attempts.
- While Redis is unavailable, the store counts in the process's memory and logs the outage once (and the recovery once). The limits then apply per replica, as before, and no request fails because of the outage. The Redis client has no offline queue, so commands fail at once instead of holding requests.
- The `rate-limit-redis` package was considered and not used: it loads a Lua script once when the limiter is created, and if Redis is unreachable at that moment (for example, while the cluster is still starting), the failed load stays cached and the limiter keeps failing until the API restarts.
- `openapi.yaml` (`TooManyRequests`) and the HTTP hardening row of `SECURITY.md` describe the shared counters; the known-issue note about issue #65 was removed.

**Regression test:**

- `tests/userRoutes.spec.ts` › `POST /auth/login -> two replicas share one login limit through Redis`: two app instances share an in-memory fake Redis; 5 wrong logins split between them get `401`, and the next attempt on each instance gets `429 AUTH_FLOOD_DETECTED`. Against the previous code it failed with `Expected: 429, Received: 401`.
- `tests/redisRateLimitStore.spec.ts` (5 tests): stores on different replicas share one counter; the counter expires with the limiter window; different prefixes stay apart; a Redis outage falls back to in-memory counting and logs once; a counter without an expiry gets one.
- Manual, against the local `redis_integrated` container: two stores with separate clients counted `1, 2, 3` for the same client key, and the key had a TTL of about 60 seconds. With Redis unreachable, the store counted `1, 2, 3` in memory and logged one warning.
- `npx tsc --noEmit` passes; `npm test` passes (5 suites, 31 tests).

**Evidence:**

- Commit `46e6acc` — `src/middlewares/redisRateLimitStore.ts`, `src/app.ts`, `tests/helpers/fakeRedis.ts`, `tests/redisRateLimitStore.spec.ts`, `tests/userRoutes.spec.ts`.
- Commit `93f430a` — `openapi.yaml`, `SECURITY.md`.
- Issue #65.

---

## 🔵 [DAST-01] First dynamic scan (OWASP ZAP API scan): unknown routes answered with an HTML page

**Date:** 2026-10-15

**Detected by:** OWASP ZAP `zap-api-scan.py` (backlog item 4.03, issue #66)

**Severity:** Low

**References:** OWASP ZAP alerts 100001, 100000 and 90022

**Finding:**

The project had no dynamic scan report. A ZAP API scan, driven by `openapi.yaml`, ran against the API started locally with `NODE_ENV=production`, authenticated with the JWT of a throwaway account, with passive and active rules. It found no High or Medium alerts and passed 118 rules, including SQL injection, cross-site scripting, OS command injection, path traversal, server-side template injection and XML external entities. It raised three Low alerts: 23 unknown paths answered with Express's default `text/html` 404 page instead of the API's JSON error envelope (alert 100001), and `POST /ai/chat` answered `500` (alerts 100000 and 90022).

**Root cause:**

- The application had no handler for unknown routes, so Express's default HTML page answered them.
- The `/ai/chat` alerts come from the scan environment: no local model server (Ollama) was running, so the AI call failed. The response body is the generic error envelope, without a stack trace or internal detail, so alert 90022 (evidence: the `HTTP/1.1 500 Internal Server Error` status line) is a false positive.

**Remediation applied:**

- `src/app.ts` registers a final handler after every route, GraphQL included, that answers unknown paths with `404` and `{"error":{"code":"NOT_FOUND",...}}`.
- Answering `503` with a timeout when the model server is unreachable stays with issue #43.
- `docs/security/dast/` holds both reports (before and after the fix), the scope, the triage of every alert and the steps to run the scan again; `SECURITY.md` has a DAST row.
- Scan-only conditions, documented in `docs/security/dast/README.md`: the rate limits were raised in the scan process, so the scanner was not answered with `429`; `/events` was left out because the scanner would hang on the open stream. No repository code was changed for the scan.

**Regression test:**

- `tests/userRoutes.spec.ts` › `GET /unknown -> returns 404 with the JSON error envelope`: an unknown path must answer `404` with `application/json` and `error.code` `NOT_FOUND`. Against the previous code it failed with `Received string: "text/html; charset=utf-8"`.
- A second ZAP API scan, after the fix, no longer raised alert 100001 (0 High, 0 Medium, 2 Low, 118 rules passed).
- `npx tsc --noEmit` passes; `npm test` passes (5 suites, 32 tests).

**Evidence:**

- Commit `e46501e` — `src/app.ts`, `tests/userRoutes.spec.ts`.
- Commit `d92627d` — `docs/security/dast/README.md`, `docs/security/dast/zap-api-scan-2026-10-15-before.md`, `docs/security/dast/zap-api-scan-2026-10-15-after.md`, `SECURITY.md`.
- Issue #66.

---

## 🟡 [PWD-01] A password shaped like a bcrypt hash was stored without hashing

**Date:** 2026-10-15

**Detected by:** Author (backlog item 1.08, issue #41; the GraphQL validation half of the issue was fixed earlier as VAL-01)

**Severity:** Medium

**References:** CWE-916, CWE-256, OWASP A04:2025

**Finding:**

`UserService.createUser` treated any password matching `/^\$2[aby]\$/` as a ready-made bcrypt hash and stored it without hashing. The shortcut existed for the registration queue: `UserController` hashed the password before publishing the event, and the RabbitMQ consumer called `createUser` with that hash. The GraphQL `createUser` mutation, open to any authenticated user, calls the same method with the password it receives, so a caller could:

- store a hash of their choice with a cheap work factor (for example `$2a$04$...`), far below the configured cost of 12;
- get around the 8-character password rule, because the 60-character hash of a one-letter password passes it;
- have a real password that happens to start with `$2b$` stored as plaintext (and then fail to log in with it).

The REST route was not exposed: `UserController` always hashed the input before queueing it.

**Root cause:**

One method served two kinds of input: untrusted passwords from the API and trusted hashes from the queue. It told them apart by the shape of the string, which a caller controls.

**Remediation applied:**

- `UserService.createUser` always runs bcrypt; the regular expression shortcut was removed.
- `UserService.hashPassword()` is the single place that hashes passwords, with `settings.bcryptSaltRounds`. `UserController` uses it before publishing to the queue, so the plaintext still never travels through RabbitMQ, and its own bcrypt import and work-factor copy were removed.
- `UserService.createUserWithPasswordHash()` is the trusted path, used only by the queue consumer (`EventBrokerService`) and the deprecated worker. It accepts only a complete bcrypt hash (`^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$`) whose cost, read with `bcrypt.getRounds`, is at least the configured one, so a forged queue message cannot store plaintext or a cheap hash. The full pattern is needed because `bcrypt.getRounds('$2b$12$short')` returns 12 without checking the rest of the string.

**Regression test:**

- `src/services/UserService.spec.ts` › `hashes a password from outside even when it already looks like a bcrypt hash`: `createUser` with a `$2a$04$...` password must store a different value, with the configured cost, that `bcrypt.compare` matches against the input. Against the previous code it failed with `Expected: not "$2a$04$..."`.
- `src/services/UserService.spec.ts` › `stores a bcrypt hash with the configured cost unchanged through createUserWithPasswordHash` and `rejects plaintext, malformed and low-cost hashes in createUserWithPasswordHash`.
- `tests/eventBroker.spec.ts` › `passes the queued hash to createUserWithPasswordHash, never to createUser`: a `user_created` message reaches the trusted path and is acknowledged. Against the previous code it failed, because the consumer called `createUser`.
- `tests/userRoutes.spec.ts`: the deprecated worker tests now expect `createUserWithPasswordHash`, and `POST /api/v1/users` still queues only a bcrypt hash.
- `npx tsc --noEmit` passes; `npm test` passes (5 suites, 36 tests).

**Evidence:**

- Commit `cb0a619` — `src/services/UserService.ts`, `src/controllers/UserController.ts`, `src/services/EventBrokerService.ts`, `src/worker-deprecated.ts`, `src/services/UserService.spec.ts`, `tests/eventBroker.spec.ts`, `tests/userRoutes.spec.ts`.
- Issue #41.

---

## 🔵 [ERR-01] Internal error messages and stack traces reached API clients

**Date:** 2026-10-16

**Detected by:** Author (backlog item 1.06, issue #39; the malformed JSON case was found while fixing it)

**Severity:** Low

**References:** CWE-209, OWASP A10:2025, OWASP API8:2023

**Finding:**

Error responses carried internal information:

- The three `UserController` routes (`GET /users`, `GET /users/{id}` and `POST /api/v1/users`) answered `500` with `error.details` set to the caught error's message, in every environment. A PostgreSQL, Redis or bcrypt failure could reach the client as the library's own text, such as a connection error that names the database address.
- `authMiddleware` put the `jsonwebtoken` error in the `401` body (`invalid signature`, `jwt expired`, `jwt malformed`), telling the caller which check rejected a forged token.
- A request body that `express.json()` could not parse fell through to Express's default error handler. Whenever `NODE_ENV` was not `production`, it answered with an HTML page holding the full stack trace and the server's file paths (`...\node_modules\body-parser\...`).
- Every route built its own `500`, with different messages, one of them in English.

**Root cause:**

The API had no central error handling. Each handler caught its own errors and decided what to send, and nothing replaced Express's default handler for errors raised before a route ran.

**Remediation applied:**

- `src/middlewares/errorHandler.ts`, registered last in `createApp`, answers every error with the shared envelope `{ error: { code, message } }`. Unexpected errors are logged in full on the server and answered with a fixed `500 INTERNAL_SERVER_ERROR` message, without details. Bodies that `express.json()` rejects keep their 4xx status, with code `INVALID_REQUEST_BODY` and a fixed message.
- `src/errors/AppError.ts` is the class for expected failures, with a status, a code and a message written for the client. `POST /api/v1/users` now throws `AppError(503, 'SERVICE_UNAVAILABLE', ...)` when the broker refuses the event, instead of answering `500`.
- The `try/catch` blocks that built `500` responses were removed from `UserController`, `AIController` and the login route, because Express 5 forwards rejected promises to the error handler. `validateMiddleware` passes errors that are not validation failures on with `next(error)`.
- `authMiddleware` answers every rejected token with the same `401 INVALID_TOKEN` body, without `details`.
- `openapi.yaml` documents `error.details` as validation-only, points the REST `500` responses to a shared `InternalError` response, adds `503` to `POST /api/v1/users` and describes `INVALID_REQUEST_BODY` on the routes that take a JSON body.
- GraphQL errors are formatted by Apollo Server and were not changed here.

**Regression test:**

- `tests/userRoutes.spec.ts` › `UserController routes -> return a generic 500 without the internal error message`: the service fails on each route with an error that carries a database address; the body must contain neither that text nor `details`, and the server log must still receive the error. Against the previous code it failed with `Received: "connect ECONNREFUSED 10.0.0.5:5432 (pg_integrated)"`.
- `tests/userRoutes.spec.ts` › `GET /users -> returns 401 without the JWT verification error`: a token signed with another secret. Against the previous code it failed with `Received: "invalid signature"`.
- `tests/userRoutes.spec.ts` › `POST /api/v1/users -> returns 400 in JSON, without a stack trace, for a malformed body`. Against the previous code it failed with `Received string: "text/html; charset=utf-8"`.
- `tests/userRoutes.spec.ts` › `POST /api/v1/users -> returns 503 when the broker refuses the event`. Against the previous code it failed with `Expected: 503` and `Received: 500`.
- `npx tsc --noEmit` passes; `npm test` passes (5 suites, 40 tests).

**Evidence:**

- Commit `2ef400a` — `src/errors/AppError.ts`, `src/middlewares/errorHandler.ts`, `src/app.ts`, `src/controllers/UserController.ts`, `src/controllers/AIController.ts`, `src/middlewares/authMiddleware.ts`, `src/middlewares/validateMiddleware.ts`, `tests/userRoutes.spec.ts`.
- Commit `7beb733` — `openapi.yaml`.
- Issue #39.

---

## 🟡 [LLM-01] `/ai/chat` had no bound on prompt size, answer length or waiting time

**Date:** 2026-10-16

**Detected by:** Author (backlog item 1.10, issue #43)

**Severity:** Medium

**References:** CWE-770, OWASP API4:2023, OWASP LLM10:2025

**Finding:**

Every call to `POST /ai/chat` costs model compute (a local Llama 3 on CPU by default, or a paid cloud model), and none of it was bounded:

- the `prompt` field accepted text of any size, up to the 100 KB JSON body limit;
- the request to the model set no `max_tokens`, so one prompt could keep the model generating a long answer;
- the OpenAI SDK waited up to its default of 10 minutes for the model server and retried twice, so one failing request could hold a connection for about half an hour while adding load to a server that was already struggling;
- the rate limit (10 prompts per minute) counted per IP address: users behind one shared IP blocked each other, while one account could multiply its budget by switching networks;
- the model name was hardcoded as `llama3`, and an unreachable model server answered a generic `500`.

**Root cause:**

The AI route was written for a single local user and relied only on the per-IP rate limit; the model call used the SDK's defaults.

**Remediation applied:**

- `src/schemas/aiSchema.ts`: `chatSchema` trims the prompt and accepts 1 to `settings.aiChat.maxPromptLength` (2000) characters. The route runs `authMiddleware` → limiter → `validateMiddleware(chatSchema)` → handler.
- `src/services/AIService.ts`: every call sends `max_tokens` (`settings.aiChat.maxTokens`, 512), a timeout of `settings.aiChat.timeoutMs` (60 s, enforced by the SDK with an `AbortController`) and `maxRetries: 0`. An unreachable or timed-out model server becomes `503 AI_SERVICE_UNAVAILABLE` through `AppError` (ERR-01); the connection details stay in the server log.
- `src/app.ts`: the AI limiter keys on the user id from the verified JWT (`user:<id>`), with the IP only as a fallback for a token without an id.
- `src/config.ts`: `OPENAI_MODEL` (default `llama3`) selects the model; `.env.example` lists it.
- `README.md` documents the LLM security boundaries: the model receives only the fixed system prompt and the user's own prompt, with no user data and no tools (LLM01:2025 and LLM02:2025), and the answer must be displayed as text (LLM05:2025, issue #42). The migration snippet now uses the real variable names.
- `openapi.yaml` documents the prompt length, the answer and time ceilings, the `503` response and the per-account limit.

**Regression test:**

- `tests/userRoutes.spec.ts` › `POST /ai/chat -> returns 400 for a prompt over the length limit, without calling the model`. Against the previous code it failed with `Expected: 400` and `Received: 200`.
- `tests/userRoutes.spec.ts` › `POST /ai/chat -> sends max_tokens, the configured model, a timeout and no retries to the model`. Against the previous code it failed with `Expected path: "max_tokens"` and `Received path: []`.
- `tests/userRoutes.spec.ts` › `POST /ai/chat -> returns 503 when the model server cannot be reached`. Against the previous code it failed with `Expected: 503` and `Received: 500`.
- `tests/userRoutes.spec.ts` › `POST /ai/chat -> limits each account separately, even from the same IP`. Against the previous code it failed with `Expected: 200` and `Received: 429` for the second account.
- `npx tsc --noEmit` passes; `npm test` passes (5 suites, 44 tests).

**Evidence:**

- Commit `304e6ef` — `src/config.ts`, `src/schemas/aiSchema.ts`, `src/services/AIService.ts`, `src/controllers/AIController.ts`, `src/app.ts`, `tests/userRoutes.spec.ts`, `.env.example`.
- Commit `b809786` — `openapi.yaml`, `README.md`.
- Issue #43.

---

## 🟡 [CRED-06] Redis ran without a password and was published on every network interface

**Date:** 2026-10-16

**Detected by:** Author (backlog item 1.14, issue #106; found while verifying the shared rate-limit store, RATE-01)

**Severity:** Medium

**References:** CWE-306, OWASP A02:2025

**Finding:**

The `redis` service in `docker-compose.yml` set no password and published port 6379 on all interfaces (`0.0.0.0` and `[::]`). In the running container `requirepass` was empty and `protected-mode` was `no`, so any client that reached the port was accepted. The API could not have used a password anyway: `src/config.ts` had no Redis password, both `ioredis` clients connected without one, and `k8s/deployment.yaml` passed only `REDIS_HOST`. Redis holds the `GET /users` cache (id, name and e-mail) and, since RATE-01, the rate-limit counters, so anyone who reached it could read the cached users, delete the `rl:login:*` keys to reset the brute-force limit, or flush everything.

**Root cause:**

Redis was treated as an internal cache that needed no credentials, while PostgreSQL and RabbitMQ were already moved to environment credentials (CRED-04, CRED-05).

**Remediation applied:**

- `src/config.ts`: `REDIS_PASSWORD` is required, with no default, so the API refuses to start without it. A shared `redisConnection` object (host, port and password) is the only way the code builds Redis clients: the users cache in `UserController` and the rate-limit client in `src/app.ts`.
- `docker-compose.yml`: `redis-server` starts with `--requirepass` from `REDIS_PASSWORD` in `.env`. The variable is expanded inside the container, so the value is written neither in the file nor in the container command. Port 6379 is published on `127.0.0.1` only.
- `k8s/deployment.yaml` passes `REDIS_PASSWORD` from `maestro-api-secret`; `k8s/secret.yaml.example` and `.env.example` document it. `SECURITY.md` was updated.
- The local container was recreated with a random password kept only in `.env`.

**Regression test:**

- `tests/userRoutes.spec.ts` › `Redis clients -> connect with the REDIS_PASSWORD from src/config.ts`: the fake Redis records the options of every client created (the cache and one per `createApp`), and each must carry the password. Against the previous code it failed with `Received: undefined`.
- `tests/config.spec.ts` › `rejects a missing or empty REDIS_PASSWORD` (new suite): the environment schema must reject both cases on that variable. Against the previous code the suite could not run, because the schema had no such rule and was not exported.
- Manual check against the recreated container: `redis-cli ping` without a password answers `NOAUTH Authentication required`, with the container's password answers `PONG`; a client built from `redisConnection` gets `PONG`, an anonymous one gets `NOAUTH`; `docker port` shows `127.0.0.1:6379`.
- `npx tsc --noEmit` passes; `npm test` passes (6 suites, 47 tests).

**Evidence:**

- Commit `d49c239` — `src/config.ts`, `src/app.ts`, `src/controllers/UserController.ts`, `tests/userRoutes.spec.ts`, `tests/config.spec.ts`, `tests/helpers/fakeRedis.ts`, `tests/setupEnv.ts`.
- Commit `17499b7` — `docker-compose.yml`, `k8s/deployment.yaml`, `k8s/secret.yaml.example`, `.env.example`.
- Commit `91e1924` — `SECURITY.md`.
- Issue #106.

---

## 🟡 [SURFACE-01] Unused GraphQL endpoint duplicated every REST security rule

**Date:** 2026-10-16

**Detected by:** Author (backlog item 1.12, issue #45)

**Severity:** Medium

**References:** OWASP API9:2023, ADR 0001 (`docs/adr/0001-retire-the-graphql-endpoint.md`)

**Finding:**

The API served a GraphQL endpoint (`/graphql`, Apollo Server) next to the REST routes, over the same user domain: the `users` and `user(id)` queries and the `createUser` mutation. No client used it (the frontend calls only REST, and the README never documented it), yet every edge rule had to be implemented twice, once in the Express middleware chain and again in the Apollo context and resolvers. Two earlier findings came from that drift: the mutation skipped the Zod validation (VAL-01) and could store a password shaped like a bcrypt hash without hashing it (PWD-01). The two paths still behaved differently: the mutation wrote straight to PostgreSQL instead of going through the RabbitMQ registration queue; its pagination was fixed at 100 instead of `settings.pagination`; and a request without a token answered `500` with the message `Context creation failed: UNAUTHORIZED: ...`, plus a stack trace with server file paths outside production, instead of `401`. GraphQL also needed controls of its own that were missing: aliases let one HTTP request run many `createUser` operations (each one a bcrypt hash with cost 12) past the per-request rate limits, and the Apollo Sandbox page required the Content Security Policy to be turned off outside production.

**Root cause:**

GraphQL was added in the first version to evaluate a flexible query interface, and it stayed after that without a consumer or an owner of its security rules.

**Remediation applied:**

- GraphQL was retired, as recorded in ADR 0001: `src/app.ts` no longer creates or mounts Apollo Server; the schema, the resolvers and their tests were removed, together with the `@apollo/server`, `@as-integrations/express5` and `graphql` dependencies, the schema copy in the `Dockerfile` and the Dependabot exception for `graphql` 17.
- Helmet's Content Security Policy now applies in every environment.
- The legacy Socket.IO blueprint moved from `src/graphql/` to `src/realtime/`, with only its comments updated.
- `openapi.yaml`, `SECURITY.md` and the Kubernetes comments describe a REST-only API; the README links the ADR.
- The application core stays independent of the delivery mechanism (controllers, `UserService`, `UserRepository` behind `IUserRepository`), so a GraphQL adapter can be added back if a client needs one, reusing the shared token verification and service-level authorization.

**Regression test:**

- No automated test could fail against the previous code: it mounted `/graphql` only when `NODE_ENV` was not `test`, so the suites never saw the endpoint. Two contract tests now guard the inventory instead, in `tests/userRoutes.spec.ts`:
  - `every Express route is in openapi.yaml and every documented operation is served`: the route list of the Express app and the operations in `openapi.yaml` must be the same set (OWASP API9:2023), so an undocumented endpoint cannot be added without updating the spec.
  - `every operation documented as protected answers 401 without a token`.
- Manual check with the API started in development against the local containers: before the change, `POST /graphql` without a token answered `500` with a stack trace and `GET /graphql` served the Apollo Sandbox page (`200 text/html`); after it, both answer `404` with the JSON error envelope, and `GET /users` still answers `401`.
- `npm ls @apollo/server @as-integrations/express5 graphql` lists nothing.
- `npx tsc --noEmit` passes; `npm test` passes (5 suites, 47 tests; the GraphQL resolver suite was removed with the code it tested).

**Evidence:**

- Commit `ebf0c0f` — `src/app.ts`, `src/graphql/` (removed), `src/realtime/socket-deprecated.ts`, `src/worker-deprecated.ts`, `src/server.ts`, `src/services/UserService.ts`, `src/services/UserService.spec.ts`, `tests/userResolvers.spec.ts` (removed), `tests/userRoutes.spec.ts`, `package.json`, `package-lock.json`.
- Commit `9f1be1e` — `Dockerfile`, `.dockerignore`, `k8s/deployment.yaml`, `k8s/service.yaml`, `.github/dependabot.yml`.
- Commit `fe2a4d1` — `docs/adr/0001-retire-the-graphql-endpoint.md`, `README.md`, `openapi.yaml`, `SECURITY.md`.
- Issue #45.

---

## 🟡 [AUTH-02] JWTs were verified without a pinned algorithm, issuer or audience

**Date:** 2026-10-16

**Detected by:** Author (backlog item 1.05, issue #38)

**Severity:** Medium

**References:** CWE-347, OWASP API2:2023

**Finding:**

`POST /auth/login` signed tokens with only a lifetime (`jwt.sign(payload, secret, { expiresIn })`), and every consumer verified them on its own with `jwt.verify(token, secret)`: `authMiddleware`, the Apollo context of the GraphQL endpoint and the WebSocket blueprint. No call pinned the algorithm, the issuer or the audience, so any HMAC algorithm signed with the secret (HS384, HS512) was accepted, and so was any token signed with the same secret for another purpose or service. The duplicated verification had already drifted: on `/graphql` a missing or invalid token answered `500` instead of `401` (reported in issue #38).

**Root cause:**

Token handling was written inline at each entry point instead of in one module, so the verification rules were whatever each call happened to pass to `jsonwebtoken`.

**Remediation applied:**

- `src/auth/accessToken.ts` is the single place that signs and verifies access tokens. `signAccessToken()` signs with `settings.jwt` (HS256, issuer and audience `maestro-api`, 1 hour); `verifyAccessToken()` accepts only `algorithms: ['HS256']` with that issuer and audience (and, as before, a valid signature and an unexpired `exp`), and rejects a token whose payload is not a JSON object.
- `POST /auth/login` signs through it; `authMiddleware` and the WebSocket blueprint (`src/realtime/socket-deprecated.ts`) verify through it, so every entry point applies the same rules and answers the same generic `401 INVALID_TOKEN` (ERR-01). `req.user` is typed with the token claims.
- The GraphQL half of the issue (the `500` on a missing token) no longer applies: the endpoint was retired (SURFACE-01, ADR 0001).
- Tokens issued before this change carry no issuer or audience and are rejected; users log in again (tokens lasted at most 1 hour anyway).
- `openapi.yaml` and `SECURITY.md` describe the pinned rules.

**Regression test:**

- `tests/userRoutes.spec.ts` › `POST /auth/login -> issues an HS256 token with the issuer and audience from src/config.ts`. Against the previous code it failed with `Received: undefined` for the `iss` claim.
- `tests/userRoutes.spec.ts` › `GET /users -> returns 401 for tokens without iss/aud, with another algorithm or for another audience`: three tokens signed with the real secret. Against the previous code the first one (no issuer or audience, like every token issued before) was accepted with `200` instead of `401`.
- The AI chat and WebSocket tests now sign their tokens with `signAccessToken()`.
- `npx tsc --noEmit` passes; `npm test` passes (5 suites, 49 tests).

**Evidence:**

- Commit `4158a01` — `src/auth/accessToken.ts`, `src/app.ts`, `src/config.ts`, `src/middlewares/authMiddleware.ts`, `src/realtime/socket-deprecated.ts`, `tests/userRoutes.spec.ts`.
- Commit `0532e62` — `openapi.yaml`, `SECURITY.md`.
- Issue #38.

---

## 🔴 [AUTHZ-01] Any logged-in account could list every user and read any record by id

**Date:** 2026-10-16

**Detected by:** Author (backlog item 1.03, issue #36)

**Severity:** High

**References:** CWE-639, OWASP API1:2023, OWASP API5:2023

**Finding:**

The user routes checked only that a token was valid. Any account, including one created a minute earlier through the public registration route, could call `GET /users` to page through every account (id, name and e-mail; up to 100 per request) and `GET /users/{id}` to read any record by its id. The login always wrote `role: 'USER'` into the token and no route read it, so there was no way to tell an administrator from a regular user. The GraphQL `users`, `user` and `createUser` operations had the same gap; that endpoint was retired in SURFACE-01.

**Root cause:**

Authentication was treated as authorization: the routes had no rule about who may see which record, and the data model had no access level.

**Remediation applied:**

- The `users` table has a `role` column (`USER` by default, `ADMIN` allowed by a `CHECK` constraint), added at startup with `ADD COLUMN IF NOT EXISTS`, so existing tables are upgraded and the statement is safe to run on every boot. The login reads the role and copies it into the JWT (AUTH-02 keeps the token verified).
- `src/auth/userPolicy.ts` holds the rules as pure functions over the verified claims: `canListUsers()` (admins only, OWASP API5:2023) and `canReadUser()` (the owner or an admin, OWASP API1:2023). There is no generic RBAC.
- `GET /users` answers `403 FORBIDDEN` to a non-admin before the Redis cache is read, so a cached page is never served to an account that may not see it. `GET /users/{id}` answers `403` to another account's id before the database lookup, so the answer is the same whether that account exists or not.
- New `GET /users/me` reads the caller's own record, with the id taken from the verified token.
- Admins are promoted directly in the database (`UPDATE users SET role = 'ADMIN' WHERE email = '...';`) and get the role at their next login; `SECURITY.md` documents it. `openapi.yaml` documents the rules, the shared `Forbidden` response and `/users/me`.

**Regression test:**

- `tests/userRoutes.spec.ts` › `GET /users -> returns 403 for a regular account and 200 for an admin`. Against the previous code it failed with `Expected: 403` and `Received: 200`.
- `tests/userRoutes.spec.ts` › `GET /users/:id -> returns 403 for another account and 200 for its own id`. Against the previous code another account's id `abc-777` answered `200`.
- `tests/userRoutes.spec.ts` › `GET /users/me -> returns the record of the account in the token`. Against the previous code `/users/me` was read as the id `me` (`Received: "me"`).
- `tests/userRoutes.spec.ts` › `POST /auth/login -> puts the account role from the database in the token`. Against the previous code the token always said `USER`.
- The contract tests (SURFACE-01) caught the new route until it was added to `openapi.yaml`, and they check that `/users/me` answers `401` without a token.
- Manual check against the local PostgreSQL: after the API started, the `users` table has `role character varying DEFAULT 'USER'` with the `CHECK (role IN ('USER', 'ADMIN'))` constraint, and a second start leaves exactly one such constraint.
- `npx tsc --noEmit` passes; `npm test` passes (5 suites, 53 tests).

**Evidence:**

- Commit `1db218f` — `src/auth/userPolicy.ts`, `src/auth/accessToken.ts`, `src/models/User.ts`, `src/repositories/UserRepository.ts`, `src/controllers/UserController.ts`, `src/app.ts`, `tests/userRoutes.spec.ts`.
- Commit `c37aab3` — `openapi.yaml`, `SECURITY.md`.
- Issue #36.

---

## 🟡 [XSS-01] The chat page injected the model's answer as HTML, and the frontend sent no security headers

**Date:** 2026-10-16

**Detected by:** Author (backlog item 1.09, issue #42)

**Severity:** Medium

**References:** CWE-79, CWE-1021, OWASP LLM05:2025

**Finding:**

The chat page (`frontend/app/chat/page.tsx`) passed every message, including the model's answer, through DOMPurify and then into the page with `dangerouslySetInnerHTML`. The model's answer is untrusted: a user can steer it with prompt injection, and a cloud model is a third party. Protection against cross-site scripting therefore depended on the sanitizer's allowlist and on DOMPurify keeping up with every bypass, while the feature never needed HTML. The Next.js app also sent no security headers: no Content Security Policy to limit what an injected script could load or call, no protection against being framed by another site (clickjacking), no `nosniff` and no Referrer-Policy.

**Root cause:**

The answer was treated as rich content to sanitize instead of as text to display, and the frontend kept Next.js's default response headers.

**Remediation applied:**

- The chat page renders every message as text: React escapes it, so HTML in an answer shows up as literal characters and never runs. The DOMPurify helper (`frontend/app/utils/security.ts`) and the `dompurify` dependency were removed.
- `frontend/security-headers.ts` builds the headers that `next.config.ts` sends on every route: a static Content Security Policy following the "Without Nonces" setup of the Next.js guide (`default-src 'self'`, `connect-src` limited to the app and the API origin, `object-src 'none'`, `base-uri` and `form-action 'self'`, `frame-ancestors 'none'`; `'unsafe-eval'` only in development and `upgrade-insecure-requests` only in production), plus `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and a `Permissions-Policy` that turns off camera, microphone and geolocation. Next.js still needs inline scripts and styles, so `'unsafe-inline'` stays; nonces and Trusted Types were left out on purpose.
- `frontend/eslint.config.mjs` makes `react/no-danger` an error, so the HTML sink cannot come back unnoticed.
- `SECURITY.md` and the README describe the change.

**Regression test:**

- `tests/frontendSecurity.spec.ts` (new suite in the API tests, because the frontend has no test runner):
  - `next.config.ts -> sends the CSP and the other security headers on every route`: loads the real config and checks the headers for `/:path*`. Against the previous code it failed with `Expected: "function"` and `Received: "undefined"` (no `headers()`).
  - `security-headers.ts -> keeps unsafe-eval out of production and upgrades requests there`.
  - `frontend/app -> no component uses dangerouslySetInnerHTML`. Against the previous code it failed listing `chat/page.tsx`.
- `npm run lint` in `frontend/` passes, and the same linter rejects a component that uses `dangerouslySetInnerHTML` (`react/no-danger`).
- Manual check with the production build (`next build` and `next start`): every route answers with the five headers; in the browser, the chat page hydrates and renders under the policy, a `fetch()` to another origin is blocked by `connect-src`, the call to the API at `http://localhost:3000` is allowed and not upgraded, and a message containing `<img src=x onerror=...><b>negrito</b>` is shown as literal text, with no `img` or `b` element created and the handler never run.
- `npx tsc --noEmit` passes; `npm test` passes (6 suites, 56 tests).

**Evidence:**

- Commit `e02b6ab` — `frontend/app/chat/page.tsx`, `frontend/app/utils/security.ts` (removed), `frontend/security-headers.ts`, `frontend/next.config.ts`, `frontend/eslint.config.mjs`, `frontend/package.json`, `frontend/package-lock.json`, `tests/frontendSecurity.spec.ts`.
- Commit `2fc0d73` — `SECURITY.md`, `README.md`.
- Issue #42.

---

## 🔴 [SESSION-01] JWT readable by page scripts, unauthenticated event stream and permissive CORS

**Date:** 2026-10-16

**Detected by:** Author (backlog items 1.01 and 1.02, issues #34 and #35, fixed together as the backlog planned)

**Severity:** High

**References:** CWE-352, CWE-942, CWE-306, OWASP API3:2023, OWASP API8:2023

**Finding:**

- **Token storage (issue #34):** `POST /auth/login` returned the JWT in the response body, and the frontend stored it in `localStorage` and sent it as a Bearer header. Any script running on the page, an XSS payload included, could read the token and use it from anywhere until it expired.
- **Event stream (issue #35):** `GET /events` had no authentication. It answered with `Access-Control-Allow-Origin: *`, so any website could read it from a visitor's browser, and every `user_created` event carried the new user's name and e-mail, information that regular accounts may not otherwise read (AUTHZ-01).
- **CORS:** besides the `cors` middleware, a hand-written `OPTIONS /*splat` handler echoed any `Origin` (or `*`). The middleware answered preflights first, so the handler was unreachable in practice, but it was a permissive policy one change away from being live.

The backlog item for issue #34 cites CWE-922; its MITRE mapping status is ALLOWED-WITH-REVIEW, so it is not used as a mapping here.

**Root cause:**

The session was designed for a token held by JavaScript, and the stream was added for a local demo without the API's authentication and CORS rules.

**Remediation applied:**

- `POST /auth/login` puts the token in the `maestro_session` cookie (`HttpOnly`, `SameSite=Strict`, `Secure` in production, `Path=/`, `Max-Age` equal to the token's 1-hour lifetime) and returns only the account details; `POST /auth/logout` clears the cookie with the same attributes. `authMiddleware` reads the cookie, or a Bearer header for API clients (`src/auth/sessionCookie.ts`).
- Cross-site request forgery: besides `SameSite=Strict`, `src/middlewares/originCheck.ts` rejects state-changing requests whose `Origin` is not in `settings.allowedOrigins` with `403 CSRF_ORIGIN_REJECTED`. Requests without an `Origin` header come from non-browser clients, which carry no victim cookies.
- CORS reads the same `settings.allowedOrigins` list (also used by the WebSocket blueprint), with credentials; the hand-written `OPTIONS` handler was removed.
- `GET /events` runs `authMiddleware` (the browser's `EventSource` sends the cookie with `withCredentials: true`); `EventBrokerService` no longer sets `Access-Control-Allow-Origin: *`, and the `user_created` event carries only the new account's id. Unknown queue actions are no longer forwarded to the stream.
- The frontend sends `credentials: 'include'`, keeps only a non-sensitive "signed in" flag in `localStorage` (removing any JWT stored there by earlier versions), clears it on `401`, and logs out through the API.
- `openapi.yaml` (a `SessionCookie` scheme next to `BearerAuth`, the login's `Set-Cookie`, `/auth/logout`, a shared `ForeignOrigin` 403, the protected stream), the README (curl with a cookie jar), `SECURITY.md` and the DAST rerun steps describe the new session.

**Regression test:**

- `tests/userRoutes.spec.ts`, against the previous code:
  - `POST /auth/login -> sets an HttpOnly, SameSite=Strict session cookie and keeps the token out of the body`: no cookie was set (`Expected: not ""`).
  - `GET /users/me -> accepts the session cookie without an Authorization header`: `Received: 401`.
  - `POST /auth/login -> returns 403 for a foreign Origin and accepts the frontend origin`: `Expected: 403`, `Received: 200`.
  - `GET /events -> returns 401 without a session and opens the stream with the session cookie`: `Expected: 401`, `Received: 200`.
  - `POST /auth/logout -> clears the session cookie`: `Expected: 204`, `Received: 404`.
  - `OPTIONS preflight -> echoes only an allowed origin` passes on both versions (the middleware answered first); it guards the policy from now on.
  - The other route tests read the token from the cookie now, so against the previous code they also fail with `401`.
- `tests/eventBroker.spec.ts`, against the previous code: `opens the event stream without a wildcard Access-Control-Allow-Origin header` and `broadcasts user_created with the new id only, never the name or e-mail` both failed.
- Manual end-to-end check with the API (development) and the production build of the frontend, in the browser: registration through the queue, then login redirects to the chat; `document.cookie` does not show the session, and `localStorage` holds only the flag; `GET /users/me` answers `200` through the cookie; an `EventSource` with credentials opens the stream; a prompt reaches the AI route (which answered `503` because no local model was running); a regular account gets `403` on `GET /users`; after logout the page returns to `/login`, `localStorage` is empty, `GET /users/me` answers `401` and the stream is refused. The throwaway account `e2e-cookie-53a062@maestro.test` was left in the local database.
- `npx tsc --noEmit` passes; `npm test` passes (6 suites, 64 tests); `npm run lint` passes in `frontend/`.

**Evidence:**

- Commit `2c41ac2` — `src/app.ts`, `src/config.ts`, `src/auth/sessionCookie.ts`, `src/middlewares/authMiddleware.ts`, `src/middlewares/originCheck.ts`, `src/services/EventBrokerService.ts`, `src/realtime/socket-deprecated.ts`, `tests/userRoutes.spec.ts`, `tests/eventBroker.spec.ts`.
- Commit `6b650f1` — `frontend/app/login/page.tsx`, `frontend/app/chat/page.tsx`, `frontend/app/utils/session.ts`.
- Commit `7fd5bc6` — `openapi.yaml`, `README.md`, `SECURITY.md`, `docs/security/dast/README.md`.
- Issues #34 and #35.

---

## 🔵 [NET-01] PostgreSQL and RabbitMQ were published on every network interface

**Date:** 2026-10-16

**Detected by:** Author (backlog item 1.15, issue #119; found while closing #106)

**Severity:** Low

**References:** CWE-1327, OWASP A02:2025

**Finding:**

`docker-compose.yml` published PostgreSQL as `"5433:5432"` and RabbitMQ as `"5672:5672"` and `"15672:15672"`, with no host address, so Docker bound them to every interface: `docker ps` showed `0.0.0.0` and `[::]` on 5433, 5672 and 15672 (the RabbitMQ management web UI). Any machine on the same network could reach the database and the broker and try passwords against them. Both already require credentials from `.env` (CRED-04, CRED-05), which keeps the severity low; Redis had been moved to `127.0.0.1` in CRED-06, and these two services were left as they were.

**Root cause:**

The short port syntax in Compose binds to all interfaces when no address is given, and the local services were never meant to be reached from other machines.

**Remediation applied:**

- `docker-compose.yml` publishes `127.0.0.1:5433`, `127.0.0.1:5672` and `127.0.0.1:15672`, like `127.0.0.1:6379` for Redis.
- `tests/dockerCompose.spec.ts` reads `docker-compose.yml` and fails if any published port has no host address or a non-loopback one, so a new service cannot be exposed by accident.
- The local containers were recreated with `docker compose up -d postgres rabbitmq`. Compose reattached their existing volumes (created on 2026-10-14): the `users` table kept its row and the `maestro` broker account was still there. RabbitMQ needed a second start because the old container had not released port 15672 yet.
- `SECURITY.md` covers every local port.

**Regression test:**

- `tests/dockerCompose.spec.ts` › `publishes every port on 127.0.0.1 only`. Against the previous code it failed listing `postgres` `5433:5432`, `rabbitmq` `5672:5672` and `rabbitmq` `15672:15672` as bound to all interfaces.
- Manual check after the recreation: `docker ps` shows only `127.0.0.1` bindings; the management UI answers `200` on `127.0.0.1:15672`, while connections to the machine's network address on 15672 and 5433 are refused.
- `npx tsc --noEmit` passes; `npm test` passes (7 suites, 65 tests).

**Evidence:**

- Commit `0eb0aa4` — `docker-compose.yml`, `tests/dockerCompose.spec.ts`.
- Commit `f6d6ead` — `SECURITY.md`.
- Issue #119.

---

## 🔵 [CORS-01] Trusted browser origins were hardcoded and not validated

**Date:** 2026-10-16

**Detected by:** Author (backlog item 2.12, issue #120; found while closing #34 and #35)

**Severity:** Low

**References:** CWE-942

**Finding:**

`settings.allowedOrigins` in `src/config.ts` was a fixed list of four `http://localhost` and `http://127.0.0.1` origins. Since SESSION-01 it drives both the CORS allowlist, with credentials, and the CSRF Origin check. A deployed frontend on any other origin needed a code change, and the quick workaround (widening the list by hand, or reflecting any origin) would undo both protections. Nothing validated the entries: a `*`, a path or a typo would have been accepted.

**Root cause:**

The list was written for local development and kept in the fixed settings, while it depends on the environment the API runs in.

**Remediation applied:**

- `src/config.ts` reads `ALLOWED_ORIGINS`, a comma-separated list validated by Zod at boot: each entry must be a bare `http` or `https` origin, exactly as browsers send the `Origin` header. A wildcard (`*` or a `*.example.com` host), a path, a trailing slash, another scheme or an empty list stops the boot with an error on `ALLOWED_ORIGINS`. Without the variable, only the local development origins are trusted, so a deployment that forgets it fails closed.
- CORS in `src/app.ts`, `src/middlewares/originCheck.ts` and the WebSocket blueprint read `env.ALLOWED_ORIGINS`.
- `.env.example` and `k8s/deployment.yaml` show how to set the deployed frontend's origin; `SECURITY.md` and the `ForeignOrigin` response in `openapi.yaml` name the variable.

**Regression test:**

- `tests/config.spec.ts` › `reads ALLOWED_ORIGINS as a list of origins`. Against the previous code it failed with `Received: undefined`.
- `tests/config.spec.ts` › `rejects wildcards, paths, trailing slashes, other schemes and an empty list in ALLOWED_ORIGINS`. Against the previous code the schema accepted them (`"success": true`).
- `tests/config.spec.ts` › `trusts only the local development origins when ALLOWED_ORIGINS is not set`. Against the previous code it failed with `Received: undefined`.
- Manual boot check through `src/config.ts`: `ALLOWED_ORIGINS='*'` stops the boot with the validation message, a custom origin is accepted, and no variable gives the local list.
- `npx tsc --noEmit` passes; `npm test` passes (7 suites, 68 tests).

**Evidence:**

- Commit `04515c7` — `src/config.ts`, `src/app.ts`, `src/middlewares/originCheck.ts`, `src/realtime/socket-deprecated.ts`, `src/services/EventBrokerService.ts`, `tests/config.spec.ts`, `tests/userRoutes.spec.ts`.
- Commit `17b0776` — `.env.example`, `k8s/deployment.yaml`, `SECURITY.md`, `openapi.yaml`.
- Issue #120.

---

## 🔵 [CI-01] README sync workflow relied on an unresolvable third-party action, and its commits skipped secret scanning

**Date:** 2026-10-16

**Detected by:** Author (review of the `sync-readme` workflow added in `218a40e`)

**Severity:** Low

**References:** CWE-829, OWASP A03:2025

**Finding:**

The `sync-readme` workflow, added to copy `SECURITY.md` and this log into the README, had two problems:

- It used `devops-roast/readme-weaver@v1`, a third-party action from a repository with 3 stars and one day of activity, with `contents: write` on this repository and pinned only by a tag. The tag `v1` did not even exist (only `v0.1.0` and `v0.1.1`), so both runs failed before any step ran; had it resolved, code outside this repository's review would have run with permission to push to `main`.
- Once replaced, the job pushed its README commit with the workflow's `GITHUB_TOKEN`. GitHub does not start other workflows for such pushes, so that commit (`fe250cc`) had no Secret Scanning run, unlike every other push to `main`.

**Root cause:**

The workflow delegated a write-capable step to an unvetted external action, and the token rule that prevents workflow loops also skipped the secret scan for the job's own commits.

**Remediation applied:**

- `scripts/sync-readme.mjs`, a dependency-free script kept in this repository, replaced the external action. It copies each `md:include` file into the README, moves the copied headings two levels down, rewrites relative links and refuses any path that is not a Markdown file of the repository, so a marker cannot publish a file such as `.env`.
- The workflow has read-only permissions by default; only the sync job gets `contents: write`, runs are serialized, and the job commits only when the README changed.
- When the job pushes, it starts Secret Scanning on `main` with `workflow_dispatch` (the event GitHub still allows for the workflow token; the job gets `actions: write` for that), so its commit is scanned like any other. A full-history Gitleaks scan, which is what a dispatched run performs, is clean.
- `SECURITY.md` gained a CI/CD row describing these controls.

**Regression test:**

- `tests/syncReadme.spec.ts`: the copy and its idempotency, link rewriting, code fences, and the refused paths (`.env`, a parent folder, an absolute path).
- First run of the new workflow on `main` (run 38984141448): the README was filled and pushed as `fe250cc`, which then showed no checks; this entry's merge exercises the secret-scan dispatch.
- Local full-history scan: `gitleaks git --config .gitleaks.toml` found no leaks in 140 commits.
- `npx tsc --noEmit` passes; `npm test` passes (8 suites, 71 tests).

**Evidence:**

- Commit `e63aa62` — `scripts/sync-readme.mjs`, `tests/syncReadme.spec.ts`, `.github/workflows/sync-readme.yml`.
- Commit `313d939` — `.github/workflows/sync-readme.yml`.
- Commit `f4f9279` — `SECURITY.md`.
- Pull requests #123 and #124.

---

## 🔵 [ERR-02] Database failures were reported as empty results, missing users or wrong passwords

**Date:** 2026-10-16

**Detected by:** Author (backlog item 2.11, issue #93; found while documenting the routes for #61)

**Severity:** Low

**References:** CWE-392, CWE-248, OWASP A10:2025

**Finding:**

`UserRepository.findAll`, `findById` and `findByEmail` caught every database error, logged it and returned `[]` or `null`. Callers could not tell an outage from an empty result:

- `GET /users` answered `200 []` and stored that empty page in Redis for 60 seconds, so the API kept serving it after PostgreSQL came back.
- `GET /users/{id}` and `GET /users/me` answered `404`, as if the account did not exist.
- `POST /auth/login` answered `401` "invalid credentials", so users were told their password was wrong during an outage.

The connection pool also had no listener for its `error` event. When PostgreSQL restarts, `pg` emits that event for its idle connections, and Node.js turns an unhandled `error` event into an uncaught exception that stops the process. The pool had no connection timeout either, so a database host that did not answer held each request until the operating system's TCP timeout.

**Root cause:**

The read methods treated "the database failed" and "nothing was found" as the same result, and the pool lifecycle events were left to Node.js defaults.

**Remediation applied:**

- `src/repositories/databaseErrors.ts` classifies each failure. No answer from the server (refused or reset connection, pool timeout, terminated connection) or a PostgreSQL error of SQLSTATE class 08, 53 or 57 becomes `AppError 503 DATABASE_UNAVAILABLE`, with the cause logged on the server without query values. Any other SQL error is rethrown and the central error handler answers its generic 500.
- The three read methods rethrow instead of returning `[]` or `null`; `create()` already did. The failure stops `GET /users` before the cache write, so no failed query is cached.
- The pool logs and discards a broken idle connection (`pool.on('error')`), and `settings.database` in `src/config.ts` holds the pool size, the idle timeout and a 5-second connection timeout.
- `openapi.yaml` documents the `DatabaseUnavailable` response on `POST /auth/login`, `GET /users`, `GET /users/me` and `GET /users/{id}`.

**Regression test:**

- `tests/userRepository.spec.ts` runs the real repository, service and routes over a fake `pg` driver. Against the previous code all five tests failed:
  - TEST 1 (each read method rejects with 503 for a refused connection, a pool timeout and SQLSTATE 57P01): `findAll` resolved with `[]`.
  - TEST 2 (a SQL error such as 42P01 is rethrown unchanged): `Received promise resolved instead of rejected`.
  - TEST 3 (the four routes answer 503 and nothing is cached): `GET /users` answered `200`.
  - TEST 4 (the pool's `error` event is handled): `emit('error')` threw `Unhandled error`.
  - TEST 5 (the pool gets the size and timeouts from `src/config.ts`): `settings.database` did not exist.
- `npx tsc --noEmit` passes; `npm test` passes (9 suites, 77 tests).

**Evidence:**

- Commit `86a15e9` — `src/repositories/databaseErrors.ts`, `src/repositories/UserRepository.ts`, `src/config.ts`, `src/controllers/UserController.ts`, `tests/userRepository.spec.ts`.
- Commit `6f691e4` — `openapi.yaml`.
- Issue #93.

---

## ℹ️ [DTO-01] User routes returned whatever columns the query selected

**Date:** 2026-10-16

**Detected by:** Author (backlog item 2.03, issue #48)

**Severity:** Informational

**References:** CWE-201, OWASP API3:2023

**Finding:**

`GET /users`, `GET /users/{id}` and `GET /users/me` sent the service's records to the client as they were, and `GET /users` also stored them in Redis. No response carried the password hash at the time of the review, but only because `findAll` and `findById` happened to select `id, name, email`. `findByEmail` already selects the bcrypt hash and the role for the login, so reusing it in a route, or adding a column to one of the other queries, would have published that data with no other change.

**Root cause:**

There was no explicit public shape for a user: the response contract was a side effect of each SQL query.

**Remediation applied:**

- `src/dtos/userResponse.ts` defines the public view of a user and `toUserResponse()`, an allowlist that copies only `id`, `name` and `email`.
- The three user routes map every record through it, and `GET /users` caches the mapped page, so cache hits replay data that was already filtered.
- The `User` schema in `openapi.yaml` is closed to those three fields (`additionalProperties: false`), and `SECURITY.md` gained a "Response data" row.

**Regression test:**

- `tests/userRoutes.spec.ts` › TEST 34 `GET /users, /users/:id and /users/me -> answer only the public fields of a user`: the service returns records with a bcrypt hash, the role and a timestamp column, and each route must answer exactly `id`, `name` and `email`. Against the previous code it failed: the responses held `password`, `role` and `created_at`.
- `npx tsc --noEmit` passes; `npm test` passes (9 suites, 78 tests).

**Evidence:**

- Commit `f7f8972` — `src/dtos/userResponse.ts`, `src/controllers/UserController.ts`, `tests/userRoutes.spec.ts`.
- Commit `ff794bb` — `openapi.yaml`.
- Commit `78bf618` — `SECURITY.md`.
- Issue #48.

---

## 🟡 [LOG-01] Login attempts and new accounts were logged with their e-mail addresses

**Date:** 2026-10-16

**Detected by:** Author (backlog item 2.08, issue #53)

**Severity:** Medium

**References:** CWE-532, OWASP A09:2025

**Finding:**

The API logged with `console.*` and interpolated personal data into the messages:

- `POST /auth/login` printed the e-mail of every attempt, including failed ones, so the log kept a list of the addresses people tried, valid or not.
- The queue consumer printed the e-mail of every new account before creating it.
- Failures were printed with whole error objects. A duplicate registration fails in PostgreSQL with a `detail` field that quotes the e-mail (`Key (email)=(...) already exists.`), which ended up in the log as well.

Logs are kept longer, copied to more systems and read by more people than the database, so personal data there widens its exposure.

**Root cause:**

There was no logging policy: each module wrote free text to the console, and nothing kept personal fields out.

**Remediation applied:**

- `src/logger.ts` creates one pino logger for the whole API. Lines are JSON with a `service` and a `component` field instead of emoji text prefixes. The level comes from `LOG_LEVEL`, validated in `src/config.ts`.
- Every `console.*` call in `src/` now goes through it, and messages identify accounts by id only.
- A redaction list replaces `password`, `email`, `username`, `name`, `token`, `authorization`, `cookie` and PostgreSQL error `detail` fields with `[REDACTED]` if a call ever passes them, at the top level or one level deep.
- `SECURITY.md` gained a "Logging" row; `.env.example` documents `LOG_LEVEL`.

**Regression test:**

- `tests/userRoutes.spec.ts` › TEST 35 `POST /auth/login and POST /api/v1/users -> log no e-mail, name or password`: a failed login, a successful login and a registration must leave no personal value in any logger or console call.
- `tests/eventBroker.spec.ts` › TEST 5 `logs the account created from the queue without its e-mail or name`.
- Against the previous code (no logger module, so the same checks were run on the console output alone), both failed: the login output held `nobody@maestro.test`, and the consumer printed `Persistent entity write initiated for: lucas.fila@maestro.com`.
- `tests/logging.spec.ts` › TEST 1: a registration body, a nested user, request headers and a duplicate-key error are written as `[REDACTED]`. It cannot run against the previous code, which had no logger.
- `npx tsc --noEmit` passes; `npm test` passes (10 suites, 81 tests).

**Evidence:**

- Commit `1f377bd` — `src/logger.ts`, `src/config.ts`, `package.json`, `package-lock.json`, `.env.example`, `tests/setupEnv.ts`, `tests/logging.spec.ts`.
- Commit `a914b86` — every module in `src/` that logged, `tests/helpers/logCapture.ts`, `tests/userRoutes.spec.ts`, `tests/eventBroker.spec.ts`, `tests/userRepository.spec.ts`, `tests/redisRateLimitStore.spec.ts`.
- Commit `ae8c774` — `SECURITY.md`.
- Issue #53.

---

## 🔵 [CACHE-01] Every registration ran a blocking `KEYS` scan on Redis, at the wrong time

**Date:** 2026-10-16

**Detected by:** Author (backlog item 2.07, issue #52)

**Severity:** Low

**References:** OWASP API4:2023 (no CWE assigned: the closest entries, CWE-405 and CWE-407, are marked "Allowed-with-Review" by MITRE)

**Finding:**

`POST /api/v1/users`, a public route, ran `redis.keys('users:*')` and deleted the matches to invalidate the cached `GET /users` pages. `KEYS` walks the whole keyspace in one command, and Redis runs commands one at a time, so the scan blocks every other client while it runs. The same Redis holds the rate-limit counters, one key per client IP and limiter, so the cost of each registration grew with the number of clients and stalled the counters of every API replica.

The invalidation also ran when the API answered `202`, before the queue consumer saved the account. The next `GET /users` cached a page without the new account, and that page was served for the full 60-second TTL.

**Root cause:**

Cache invalidation was implemented as a pattern scan, and it was placed in the HTTP route instead of after the write it depends on.

**Remediation applied:**

- `src/cache/usersCache.ts` keeps a version counter (`users:cache-version`) and puts it in every page key (`users:v<N>:limit=..:offset=..`). Invalidating is one `INCR` (O(1)); old pages are never read again and expire with their TTL.
- `GET /users` reads the version once, before the query, and stores the page under that version, so a page computed during an invalidation can never be served as current.
- The queue consumer (`EventBrokerService`) invalidates right after it saves the account; the registration route no longer touches the cache.
- The cache is best effort: its Redis client fails fast while Redis is down (no offline queue), reads fall back to PostgreSQL, and failed writes or invalidations only log a warning.
- `openapi.yaml` describes the cache lifetime and invalidation on `GET /users`.

**Regression test:**

- `tests/userRoutes.spec.ts` › TEST 36 `POST /api/v1/users -> queues the registration without a KEYS scan of Redis`. Against the previous code it failed: `keys` was called once.
- `tests/userRoutes.spec.ts` › TEST 37 `GET /users -> serves the cached page, and reads the database again after the version changes`. Against the previous code it failed: the page stayed cached (`getAllUsers` called 1 time instead of 2).
- `tests/eventBroker.spec.ts` › TEST 6 `invalidates the users cache after saving a queued account, and not when saving fails`. Against the previous code it failed: the consumer never invalidated (0 calls).
- `tests/usersCache.spec.ts` › TEST 1-3: one `INCR` and no `KEYS` per invalidation, a page stored after an invalidation stays under the old version, and a Redis outage never throws. It cannot run against the previous code, which had no such module.
- `npx tsc --noEmit` passes; `npm test` passes (11 suites, 87 tests).

**Evidence:**

- Commit `04dac84` — `src/cache/usersCache.ts`, `src/controllers/UserController.ts`, `src/services/EventBrokerService.ts`, `src/app.ts`, `tests/helpers/fakeRedis.ts`, `tests/usersCache.spec.ts`, `tests/userRoutes.spec.ts`, `tests/eventBroker.spec.ts`.
- Commit `d231c42` — `openapi.yaml`.
- Issue #52.

---

## 🟡 [MSG-01] Failed registrations were deleted from the queue, and duplicate e-mails failed silently

**Date:** 2026-10-16

**Detected by:** Author (backlog item 2.05, issue #50)

**Severity:** Medium

**References:** CWE-390, OWASP A10:2025

**Finding:**

`POST /api/v1/users` answers `202` and publishes the registration to RabbitMQ; the queue consumer saves the account later. When saving failed, the consumer logged the error and rejected the message with `nack(requeue=false)`. The `user_events` queue had no dead-letter exchange, so RabbitMQ deleted the message: the client had been told its request was accepted, and the registration was gone without a trace.

- `UserRepository.create()` turned every database error into the same generic `Error`, so a registration for an e-mail that already had an account (a normal outcome of an asynchronous flow) was handled exactly like a database outage, and both were dropped.
- The consumer passed the output of `JSON.parse` (typed `any`) straight to the service, so a message published by anything else that could reach the queue was not checked before the save.

**Root cause:**

The consumer detected failures but had no outcome for them other than deletion, and the repository erased the information needed to tell an expected duplicate from a real failure.

**Remediation applied:**

- `src/queue/topology.ts` declares `user_events` with the dead-letter exchange `user_events.dlx`, bound to the durable queue `user_events.dead`. The API and the legacy worker blueprint share this declaration.
- The consumer validates every message with Zod (`userCreatedEventSchema`: the REST name and e-mail rules and a complete bcrypt hash). A message that is not JSON, fails validation or cannot be saved is rejected without requeue and kept in the dead-letter queue for an operator, instead of being deleted or redelivered forever.
- `UserRepository.create()` throws `DuplicateEmailError` for `unique_violation` (SQLSTATE 23505) and keeps the cause of any other failure. The consumer acknowledges a duplicate without changing the existing account, the cache or the event stream. The registration route still answers the same `202` for a new and an existing e-mail, so it does not reveal which e-mails have accounts (CWE-204).
- A broker that already has `user_events` without these arguments refuses the new declaration (`PRECONDITION_FAILED`); the old queue is deleted once, after checking it is empty. The local broker was migrated this way.
- `openapi.yaml` describes the `202` behavior and `SECURITY.md` gained a "Messaging" row.

**Regression test:**

- `tests/eventBroker.spec.ts`:
  - TEST 9 `declares user_events with a dead-letter exchange bound to user_events.dead`. Against the previous code it failed: no exchange was declared.
  - TEST 10 `acknowledges a duplicate e-mail registration and changes nothing`. Against the previous code it failed: the error class did not exist and the message was rejected.
  - TEST 11 `dead-letters malformed registrations without calling the service`. Against the previous code it failed: the service was called with an invalid e-mail.
  - TEST 12 `dead-letters a registration whose save fails`: the rejection itself is unchanged, and TEST 9 makes it a dead-letter instead of a deletion.
- `tests/userRepository.spec.ts` › TEST 6 `create() throws DuplicateEmailError for unique_violation and keeps other failures distinct`. Against the previous code it failed.
- Local run against the Docker services: the same registration sent twice got `202` both times; one account was created, the second message was acknowledged as a duplicate, `user_events.dead` stayed empty, `user_events` carried `x-dead-letter-exchange`, and no log line held the e-mail.
- `npx tsc --noEmit` passes; `npm test` passes (13 suites, 106 tests).

**Evidence:**

- Commit `421656f` — `src/queue/topology.ts`, `src/schemas/eventSchema.ts`, `src/errors/DuplicateEmailError.ts`, `src/services/EventBrokerService.ts`, `src/repositories/UserRepository.ts`, `src/services/UserService.ts`, `src/queue/rabbit-deprecated.ts`, `tests/eventBroker.spec.ts`, `tests/userRepository.spec.ts`, `tests/userRoutes.spec.ts`.
- Commit `fac192f` — `openapi.yaml`, `SECURITY.md`.
- Issue #50.

---

## ℹ️ [TEST-01] Missing regression tests for JWT edge cases and outdated route names

**Date:** 2026-10-17

**Detected by:** Author (backlog item 3.01, issue #56)

**Severity:** Informational

**References:** CWE-347, CWE-209, OWASP API2:2023, OWASP A07:2025

**Finding:**

The test suite lacked explicit regression tests for two JWT edge cases: a token signed with the correct key but expired, and an unsigned token with `alg: none`. Test names also referenced old routes (`POST /users`) instead of the routes the API serves.

This was a coverage gap, not a vulnerability: `verifyAccessToken` (`src/auth/accessToken.ts`, AUTH-02) already pinned HS256, the issuer and the audience, and `jsonwebtoken` already rejected expired and unsigned tokens. Without tests, though, a later change (for example an `ignoreExpiration` option, or `jwt.decode` used where `jwt.verify` belongs) would have passed the suite unnoticed.

**Root cause:**

Tests were written primarily for feature delivery. When the JWT verification was centralized and pinned to HS256 (AUTH-02), edge cases for cryptographic failures (expiry, an unsigned token) were not added to the automated test suite.

**Remediation applied:**

- Added TEST 40 in `tests/userRoutes.spec.ts`: an expired JWT signed with the correct secret, algorithm, issuer and audience gets `401 INVALID_TOKEN`, so the expiry is the only check that can fail.
- Added TEST 41: a hand-built JWT with `alg: none` and an empty signature gets `401 INVALID_TOKEN`. With a secret configured, `jsonwebtoken` rejects it with "jwt signature is required" before comparing the algorithm with the pinned HS256.
- Both tokens carry the `ADMIN` role, so the tests show that even the highest role gets nothing once its token is expired or unsigned. Both also check that the response has no details and no "expired", "signature" or "algorithm" text (CWE-209), and that the request never reaches the service.
- Verified that all test names reference the real routes (`/api/v1/...`) since issue #49, superseding the old `POST /users` naming.
- Documented that XSS coverage is provided by static checks in `tests/frontendSecurity.spec.ts` (no `dangerouslySetInnerHTML`, CSP and security headers on every route), because the frontend has no component-test runtime.
- Coverage map for the cases issue #56 asked for: tampered JWT, TEST 18 (another key) and TEST 23 (no issuer or audience, HS512, another audience); expired JWT, TEST 40; `alg: none`, TEST 41; ownership (IDOR), TEST 25; admin-only listing, TEST 24; event stream without a session, TEST 32; login with a non-text field, TEST 13; XSS on render, `tests/frontendSecurity.spec.ts`.

**Regression test:**

- `tests/userRoutes.spec.ts` › TEST 40 `GET /api/v1/users -> returns 401 for an expired token signed with the correct key`.
- `tests/userRoutes.spec.ts` › TEST 41 `GET /api/v1/users -> returns 401 for an unsigned token with alg "none"`.
- Both pass against the previous code by design, since the protections already existed. Mutation check, to show they would catch a regression: with `ignoreExpiration: true` added to `verifyAccessToken`, TEST 40 failed (`Expected: 401`, `Received: 200`); with `jwt.decode` in place of `jwt.verify`, both tests failed the same way.
- `npx tsc --noEmit` passes; `npm test` passes (13 suites, 108 tests).

**Evidence:**

- Commit `fb4c3fe` — `tests/userRoutes.spec.ts` (TEST 40 and TEST 41 added).
- Commit `d4e514f` — `tests/userRoutes.spec.ts` (TEST 40 and TEST 41 aligned with the suite and hardened).
- Pull requests #134 and #135.
- Issue #56.
