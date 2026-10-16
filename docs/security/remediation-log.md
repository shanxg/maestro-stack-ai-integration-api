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
> - 🔵 for Low/Informational
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

## 🔵 [1.06] `YOUR_TOKEN_HERE` placeholder in README (false positive)

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

## 🔵 [REDIR-01] Open redirect review: no redirect takes its target from user input (not applicable)

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
