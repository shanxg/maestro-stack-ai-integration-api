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
