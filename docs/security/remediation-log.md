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
> - _OWASP Top 10 (Web): `OWASP A02:2021`, `A07:2021`._
> - _OWASP API Top 10: `API1:2023 (BOLA)`, `API2:2023 (Broken Authentication)`._
> - _OWASP LLM Top 10: `LLM01 (Prompt Injection)`, `LLM10 (Unbounded Consumption)`._
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
> - Command run: _`gitleaks detect --source . --verbose`_.
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

**References:** CWE-798, OWASP A02:2021

**Finding:**

The `k8s/secret.yaml` file was tracked in the public repository with the Base64-encoded JWT secret (`bWFlc3Ryb19zZWNyZXRfa2V5XzIwMjZfc3VwZXJfc2VjdXJl`), exposed in commit `7c18d84d` and earlier commits.

**Root cause:**

The Kubernetes manifest was committed with the secret value directly in it, without using Sealed Secrets, External Secrets, or environment variables.

**Remediation applied:**

- JWT secret rotated (new value generated with a CSPRNG).

- `k8s/secret.yaml` removed from version control and added to `.gitignore`.

- Created `k8s/secret.yaml.example` with the `REPLACE\_ME` placeholder.

- Repository history rewritten with `git filter-repo` to remove commit `7c18d84d`; force push applied (`de01357..ed58f20`).

- Created `.gitleaks.toml` with an allowlist for placeholders and local files.

**Regression test:**

- `gitleaks detect --source . --verbose` returns `no leaks found`.

- Commit is blocked by the pre-commit hook if a secret is reintroduced.

**Evidence:**

- Commit `ed58f20` — file removal.

- Commit `757f7e3` — `.gitignore` updated and `sync\_backlog.py` added.

- Force push: `de01357..ed58f20 main -> main (forced update)`.

---

## 🟡 [5.01] No secret scanning before commit

**Date:** 2026-10-13

**Detected by:** Manual review / Gitleaks

**Severity:** Medium

**References:** OWASP A05:2021, CWE-540

**Finding:**

Without automated secret scanning before commit, any oversight (such as the one described above) can enter the repository history unchecked.

**Root cause:**

No pre-commit hook or secret-scanning pipeline was in place.

**Remediation applied:**

- `.pre-commit-config.yaml` configured with Gitleaks `v8.30.1` (runs on every `git commit`).

- `pre-commit install` registered in `.git/hooks/pre-commit`.

- `.gitleaks.toml` configured with an allowlist for instructional placeholders.

**Regression test:**

- Attempting to commit a file containing the string `ghp\_xxx` should fail in the hook.

**Evidence:**

- `.pre-commit-config.yaml`, `.gitleaks.toml`.

---

## 🔵 [1.06] `YOUR\_TOKEN\_HERE` placeholder in README (false positive)

**Date:** 2026-10-13

**Detected by:** Gitleaks (rule `curl-auth-header`)

**Severity:** Informational

**References:** —

**Finding:**

The **README** contains a `curl` example with `Authorization: Bearer YOUR\_TOKEN\_HERE`, which triggers the `curl-auth-header` rule.

**Root cause:**

- False positive: the string is an instructional placeholder, not a real secret.

**Remediation applied:**

- Allowlist added to `.gitleaks.toml` (`regexes` and `paths`).

**Regression test:**

- `gitleaks detect --source . --verbose` no longer reports the README.

**Evidence:**

- `.gitleaks.toml`, `\[allowlist]` section.

## 🚨 [CRED-01] Personal Access Token exposed in a chat channel

**Date:** 2026-10-13

**Detected by:** Author (immediate self-report)

**Severity:** Critical

**References:** CWE-522, OWASP A07:2021

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
- New token generated with the minimum required scope (`repo`).
- New token stored only in the local `.env` file, which is listed in `.gitignore`.
- `python-dotenv` integrated into `sync_backlog.py`, eliminating the need
  to export the variable in the shell (where it persists in PowerShell history).

**Regression test:**

- `git check-ignore -v .env` confirms that the file is not tracked.
- The Gitleaks pre-commit hook (`.pre-commit-config.yaml`) blocks commits
  containing strings in the `ghp_` format.
- `gitleaks detect --source . --verbose` returns `no leaks found`.

**Evidence:**

- Old token: revoked (GitHub Settings → Security log).
- New token: stored only in the local `.env` file, never committed.
- Commit `757f7e3` — `sync_backlog.py` added.
- Commit `2abc4fc` — `.gitleaks.toml` and `.pre-commit-config.yaml` added.
