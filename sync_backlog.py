from dotenv import load_dotenv
load_dotenv()

import os
import re
import sys
from copy import copy

import requests
from openpyxl import load_workbook
from openpyxl.formatting.formatting import ConditionalFormattingList
from openpyxl.utils import get_column_letter, range_boundaries

# ============================================================
# SETTINGS
# ============================================================
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_PROJECT_TOKEN = os.getenv("GITHUB_PROJECT_TOKEN")  # classic token, read:project only
GITHUB_REPO  = "shanxg/maestro-stack-ai-integration-api"   # owner/repo
EXCEL_FILE   = "security_plan_maestro_api.xlsx"
SHEET_NAME   = "Security Remediation Backlog"
HEADER_ROW   = 1  # Row that holds the column headers
PROJECT_OWNER  = "shanxg"
PROJECT_NUMBER = 2  # https://github.com/users/shanxg/projects/2


# Column map (1-based indexes, as used by openpyxl)
COL = {
    "ID":             1,
    "PRIORITY":       2,
    "CATEGORY":       3,
    "IMPROVEMENT":    4,
    "LOCATION":       5,
    "FIX":            6,
    "REFERENCE":      7,
    "ALIGNMENT":      8,
    "DECISION":       9,
    "EFFORT":         10,
    "IMPACT":         11,
    "STATUS":         12,
    "EVIDENCE":       13,
    "ISSUE_NUMBER":   14,
    "ISSUE_URL":      15,
}

HEADERS = {
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}

# ============================================================
# HELPERS
# ============================================================
def normalize_label(text):
    """Turns 'Front-end / session' into 'front-end-session'."""
    if not text:
        return None
    import unicodedata
    text = unicodedata.normalize("NFKD", str(text))
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower().replace(" ", "-").replace("/", "-")
    return "-".join(filter(None, text.split("-")))[:50]

def build_title(id_, improvement):
    """E.g. '[1.01] JWT stored in localStorage, readable by any XSS'."""
    title = f"[{id_}] {improvement or 'Untitled'}"
    return title[:250]  # GitHub caps titles at 256 characters

def build_body(row):
    """Builds the issue body in Markdown from the relevant columns."""
    def v(col_name):
        val = row[COL[col_name] - 1].value
        return str(val).strip() if val is not None else "—"

    return f"""## 📌 Plan item
- **ID:** {v("ID")}
- **Priority:** {v("PRIORITY")}
- **Category:** {v("CATEGORY")}

## 🔍 Finding
- **Decision:** {v("DECISION")}
- **Improvement:** {v("IMPROVEMENT")}


**Location:** `{v("LOCATION")}`

## 🛠️ Proposed fix
{v("FIX")}

## 📚 Reference
{v("REFERENCE")}

## 🎯 Role alignment
{v("ALIGNMENT")}

## ⚖️ Estimates
- **Effort:** {v("EFFORT")}
- **Impact:** {v("IMPACT")}

---
_Issue created automatically from the `{EXCEL_FILE}` spreadsheet._
"""

def build_labels(row):
    """Builds the issue labels from the spreadsheet."""
    labels   = ["backlog"]
    priority = row[COL["PRIORITY"] - 1].value
    category = row[COL["CATEGORY"] - 1].value
    effort   = row[COL["EFFORT"] - 1].value
    impact   = row[COL["IMPACT"] - 1].value

    if priority: labels.append(f"priority:{str(priority).lower()}")
    if category: labels.append(normalize_label(category))
    if effort:   labels.append(f"effort:{normalize_label(effort)}")
    if impact:   labels.append(f"impact:{normalize_label(impact)}")
    return labels

# ============================================================
# GITHUB API
# ============================================================
def create_issue(title, body, labels):
    url = f"https://api.github.com/repos/{GITHUB_REPO}/issues"
    payload = {"title": title, "body": body, "labels": labels}
    r = requests.post(url, headers=HEADERS, json=payload, timeout=30)
    if r.status_code == 201:
        data = r.json()
        return data["number"], data["html_url"]
    print(f"   ❌ Error {r.status_code}: {r.text[:200]}")
    return None, None

PROJECT_STATUS_QUERY = """
query($login: String!, $number: Int!, $field: String!) {
    user(login: $login) {
        projectV2(number: $number) {
            items(first: 100) {
                pageInfo { hasNextPage }
                nodes {
                    content{ ... on Issue {number}}
                    fieldValueByName(name: $field) { ... on ProjectV2ItemFieldSingleSelectValue { name } }
                }
            }
        }
    }
}
"""
def list_project_statuses():
    """Returns {issue_number: status} from the GitHub Projects board."""
    payload = {
        "query": PROJECT_STATUS_QUERY,
        "variables": {"login": PROJECT_OWNER, "number": PROJECT_NUMBER, "field": "Status"},
    }
    headers = {"Authorization": f"Bearer {GITHUB_PROJECT_TOKEN}"}
    r = requests.post("https://api.github.com/graphql", headers=headers, json=payload, timeout=30)
    data = r.json() if r.status_code == 200 else {}
    # GraphQL answers 200 even when the query fails, so the "errors" key must be checked too
    if r.status_code != 200 or "errors" in data:
        print(f"❌ Failed to read the project board: {r.status_code} {r.text[:200]}")
        return {}

    items = data["data"]["user"]["projectV2"]["items"]
    if items["pageInfo"]["hasNextPage"]:
        print("   ⚠️  The board has more than 100 items; only the first 100 were read.")

    statuses = {}
    for node in items["nodes"]:
        number = (node["content"] or {}).get("number")         # PRs and drafts have no issue number
        status = (node["fieldValueByName"] or {}).get("name")  # cards without a Status are skipped
        if number and status:
            statuses[number] = status
    return statuses

ISSUE_STATUS_QUERY = """
query($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
        issue(number: $number) {
            projectItems(first: 10) {
                nodes {
                    project { number }
                    fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
                }
            }
        }
    }
}
"""
def issue_board_status(number):
    """Returns the board Status of one issue, read from the issue side.

    A card added to the board a few minutes ago can be missing from the board listing that
    list_project_statuses() reads, while the issue already shows it, so imported rows use this.
    """
    owner, repo = GITHUB_REPO.split("/")
    payload = {
        "query": ISSUE_STATUS_QUERY,
        "variables": {"owner": owner, "repo": repo, "number": number},
    }
    headers = {"Authorization": f"Bearer {GITHUB_PROJECT_TOKEN}"}
    r = requests.post("https://api.github.com/graphql", headers=headers, json=payload, timeout=30)
    data = r.json() if r.status_code == 200 else {}
    if r.status_code != 200 or "errors" in data:
        print(f"   ⚠️  Could not read the board status of issue #{number}: {r.status_code}")
        return None

    for node in data["data"]["repository"]["issue"]["projectItems"]["nodes"]:
        if node["project"]["number"] == PROJECT_NUMBER:
            return (node["fieldValueByName"] or {}).get("name")
    return None

def list_issues():
    """Returns {number: issue} for every issue in the repository (pull requests excluded)."""
    issues = {}
    page = 1
    while True:
        url = (f"https://api.github.com/repos/{GITHUB_REPO}/issues"
               f"?state=all&per_page=100&page={page}")
        r = requests.get(url, headers=HEADERS, timeout=30)
        if r.status_code != 200:
            print(f"❌ Failed to list issues: {r.status_code} {r.text[:200]}")
            return {}
        batch = r.json()
        for item in batch:
            # The issues endpoint also returns pull requests; they are not backlog items
            if "pull_request" not in item:
                issues[item["number"]] = item
        if len(batch) < 100:
            break
        page += 1
    return issues

# ============================================================
# ISSUE → ROW (inverse of build_title / build_body)
# ============================================================
TITLE_ID = re.compile(r"^\[(\d+\.\d+)\]\s*(.*)$")  # "[2.11] Improvement text"

# Single-line fields written by build_body(), as "- **Label:** value"
BODY_FIELDS = {
    "ID":          r"^- \*\*ID:\*\* (.+)$",
    "PRIORITY":    r"^- \*\*Priority:\*\* (.+)$",
    "CATEGORY":    r"^- \*\*Category:\*\* (.+)$",
    "DECISION":    r"^- \*\*Decision:\*\* (.+)$",
    "IMPROVEMENT": r"^- \*\*Improvement:\*\* (.+)$",
    "LOCATION":    r"^\*\*Location:\*\* `(.+)`$",
    "EFFORT":      r"^- \*\*Effort:\*\* (.+)$",
    "IMPACT":      r"^- \*\*Impact:\*\* (.+)$",
}
# Multi-line sections written by build_body(), as "## <emoji> Heading" followed by the text
BODY_SECTIONS = {
    "FIX":       "Proposed fix",
    "REFERENCE": "Reference",
    "ALIGNMENT": "Role alignment",
}

def parse_issue(issue):
    """Reads the spreadsheet values back from an issue that follows the build_body() template."""
    body = (issue.get("body") or "").replace("\r\n", "\n")
    values = {}
    for col, pattern in BODY_FIELDS.items():
        match = re.search(pattern, body, re.MULTILINE)
        if match:
            values[col] = match.group(1).strip()
    for col, heading in BODY_SECTIONS.items():
        # Everything after the heading line, up to the next "## " heading or the "---" footer
        match = re.search(rf"^##[^\n]*{heading}[ \t]*\n(.*?)(?=^## |^---|\Z)",
                          body, re.MULTILINE | re.DOTALL)
        if match:
            values[col] = match.group(1).strip()

    # Fall back to the title when the body does not follow the template
    title = TITLE_ID.match(issue["title"])
    if title:
        values.setdefault("ID", title.group(1))
        values.setdefault("IMPROVEMENT", title.group(2))

    # build_body() writes "—" for empty cells
    return {col: value for col, value in values.items() if value and value != "—"}

# ============================================================
# SHEET LAYOUT
# ============================================================
def last_data_row(ws):
    """Returns the last row that has an ID (formatted empty rows do not count)."""
    last = HEADER_ROW
    for r in range(HEADER_ROW + 1, ws.max_row + 1):
        if ws.cell(r, COL["ID"]).value:
            last = r
    return last

def grow_range(ref, old_last, new_last):
    """Turns 'L2:L34' into 'L2:L36' when the range ends at old_last; other ranges stay."""
    grown = []
    for part in str(ref).split():
        min_col, min_row, max_col, max_row = range_boundaries(part)
        if max_row == old_last:
            max_row = new_last
        grown.append(f"{get_column_letter(min_col)}{min_row}:{get_column_letter(max_col)}{max_row}")
    return " ".join(grown)

def extend_backlog_ranges(wb, old_last, new_last):
    """Grows every fixed range that ends at the old last data row, so appended rows keep the
    Status dropdown, the conditional formatting and the filter, and the Summary sheet counts them."""
    ws = wb[SHEET_NAME]

    for validation in ws.data_validations.dataValidation:
        validation.sqref = grow_range(validation.sqref, old_last, new_last)

    # openpyxl cannot edit a conditional formatting range in place, so the list is rebuilt
    rebuilt = ConditionalFormattingList()
    for formatting in ws.conditional_formatting:
        for rule in formatting.rules:
            rebuilt.add(grow_range(formatting.sqref, old_last, new_last), rule)
    ws.conditional_formatting = rebuilt

    if ws.auto_filter.ref:
        ws.auto_filter.ref = grow_range(ws.auto_filter.ref, old_last, new_last)

    # Formulas such as COUNTIF('Security Remediation Backlog'!$B$2:$B$34, ...) on any sheet
    reference = re.compile(rf"('{re.escape(SHEET_NAME)}'!\$?[A-Z]+\$?\d+:\$?[A-Z]+\$?){old_last}\b")
    for sheet in wb.worksheets:
        for row in sheet.iter_rows():
            for cell in row:
                if isinstance(cell.value, str) and cell.value.startswith("="):
                    cell.value = reference.sub(rf"\g<1>{new_last}", cell.value)

# ============================================================
# SYNC
# ============================================================
def github_issues_to_excel():
    """Adds a row for every backlog issue that was created on GitHub and is not in the sheet.

    Runs before excel_to_github(): when a row with the same ID exists without an issue number,
    it is linked to the issue instead, so excel_to_github() does not create a duplicate.
    """
    print("\n📥 [1/3] GitHub Issues → Excel (import issues created on GitHub)")
    issues = list_issues()
    if not issues:
        print("   ℹ️  No issues found in the repository.")
        return

    wb = load_workbook(EXCEL_FILE)
    ws = wb[SHEET_NAME]

    # Index the sheet: issue numbers already present, and ID → row
    known_numbers = set()
    rows_by_id = {}
    for r in range(HEADER_ROW + 1, ws.max_row + 1):
        id_ = ws.cell(r, COL["ID"]).value
        number = ws.cell(r, COL["ISSUE_NUMBER"]).value
        if id_:
            rows_by_id[str(id_).strip()] = r
        if number:
            try:
                known_numbers.add(int(number))
            except (TypeError, ValueError):
                pass

    old_last = last_data_row(ws)
    next_row = old_last + 1
    added = linked = 0

    for number in sorted(issues):
        if number in known_numbers:
            continue
        issue = issues[number]
        values = parse_issue(issue)
        id_ = values.get("ID")

        # Only backlog items ("[1.01] ..." titles) belong in the sheet
        if not id_:
            print(f"   ⏭️  Skipping #{number}: the title has no [ID] prefix.")
            continue

        existing = rows_by_id.get(id_)
        if existing:
            if ws.cell(existing, COL["ISSUE_NUMBER"]).value:
                print(f"   ⚠️  Skipping #{number}: ID {id_} is already linked to another issue.")
                continue
            # The row was typed in the sheet and the issue was opened on GitHub: link them
            ws.cell(existing, COL["ISSUE_NUMBER"], number)
            ws.cell(existing, COL["ISSUE_URL"], issue["html_url"])
            print(f"   🔗 Linked row {id_} to issue #{number}.")
            linked += 1
            continue

        # Copy the style of the last data row so the new row looks like the others
        for c in range(1, ws.max_column + 1):
            ws.cell(next_row, c)._style = copy(ws.cell(old_last, c)._style)
        ws.row_dimensions[next_row].height = ws.row_dimensions[old_last].height

        for col, value in values.items():
            ws.cell(next_row, COL[col], value)
        ws.cell(next_row, COL["STATUS"], issue_board_status(number))
        ws.cell(next_row, COL["ISSUE_NUMBER"], number)
        ws.cell(next_row, COL["ISSUE_URL"], issue["html_url"])

        print(f"   → Added row {id_} for issue #{number}: {str(values.get('IMPROVEMENT', ''))[:60]}...")
        rows_by_id[id_] = next_row
        next_row += 1
        added += 1

    if added:
        extend_backlog_ranges(wb, old_last, next_row - 1)
    if added or linked:
        wb.save(EXCEL_FILE)
        print(f"   ✅ {added} row(s) added and {linked} row(s) linked. Spreadsheet updated.")
    else:
        print("   ℹ️  No new issues to import.")
    wb.close()


def excel_to_github():
    """Creates issues for rows whose Issue Number is empty."""
    print("\n🚀 [2/3] Excel → GitHub (create new issues)")
    wb = load_workbook(EXCEL_FILE)
    ws = wb[SHEET_NAME]

    created = 0
    for r in range(HEADER_ROW + 1, ws.max_row + 1):
        id_          = ws.cell(r, COL["ID"]).value
        improvement  = ws.cell(r, COL["IMPROVEMENT"]).value
        issue_number = ws.cell(r, COL["ISSUE_NUMBER"]).value
        issue_url    = ws.cell(r, COL["ISSUE_URL"]).value

        # Skip empty rows and rows that are already synced
        if not id_ or not improvement:
            continue
        if issue_number and issue_url:
            continue

        row    = [ws.cell(r, c) for c in range(1, ws.max_column + 1)]
        title  = build_title(id_, improvement)
        body   = build_body(row)
        labels = build_labels(row)

        print(f"   → Creating issue [{id_}]: {str(improvement)[:60]}...")
        number, url = create_issue(title, body, labels)

        if number:
            ws.cell(r, COL["ISSUE_NUMBER"], number)
            ws.cell(r, COL["ISSUE_URL"], url)
            created += 1
        else:
            print(f"   ⚠️  Failed to create the issue for ID {id_}")

    if created:
        wb.save(EXCEL_FILE)
        print(f"   ✅ {created} issue(s) created. Spreadsheet updated.")
    else:
        print("   ℹ️  No new issues to create.")
    wb.close()


def github_to_excel():
    """Updates the Status column (L) from the GitHub Projects board."""
    print("\n🔄 [3/3] GitHub Projects → Excel (sync status)")
    statuses = list_project_statuses()
    if not statuses:
        print("   ℹ️  No status found on the project board.")
        return

    wb = load_workbook(EXCEL_FILE)
    ws = wb[SHEET_NAME]
    updated = 0

    for r in range(HEADER_ROW + 1, ws.max_row + 1):
        number = ws.cell(r, COL["ISSUE_NUMBER"]).value
        if not number:
            continue
        try:
            number = int(number)
        except (TypeError, ValueError):
            continue

        # The board owns Status; rows whose issue is not on the board are left as they are
        board_status = statuses.get(number)
        if board_status and board_status != ws.cell(r, COL["STATUS"]).value:
            ws.cell(r, COL["STATUS"], board_status)
            updated += 1

    if updated:
        wb.save(EXCEL_FILE)
        print(f"   ✅ {updated} row(s) with an updated status.")
    else:
        print("   ℹ️  No status to update.")
    wb.close()


# ============================================================
# MAIN
# ============================================================
if __name__ == "__main__":
    for name, value in (("GITHUB_TOKEN", GITHUB_TOKEN), ("GITHUB_PROJECT_TOKEN", GITHUB_PROJECT_TOKEN)):
        if not value:
            print(f"❌ ERROR: {name} is not set.")
            print("   Add it to the local .env file (gitignored). Avoid exporting it in the")
            print("   shell: it stays in the shell history (see CRED-01 in the remediation log).")
            sys.exit(1)

    if not os.path.exists(EXCEL_FILE):
        print(f"❌ ERROR: file '{EXCEL_FILE}' not found in the current folder.")
        sys.exit(1)

    print("=" * 60)
    print(" SYNC — Maestro Stack AI Integration API")
    print("=" * 60)

    github_issues_to_excel()
    excel_to_github()
    github_to_excel()

    print("\n✨ Sync complete.")
