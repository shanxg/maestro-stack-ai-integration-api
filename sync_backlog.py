import os
import sys
import requests
from openpyxl import load_workbook

# ============================================================
# CONFIGURAÇÕES
# ============================================================
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_REPO  = "shanxg/maestro-stack-ai-integration-api"   # usuario/repo
EXCEL_FILE   = "plano_melhorias_maestro_api.xlsx"
SHEET_NAME   = "Plano de Melhorias"
HEADER_ROW   = 1  # Linha em que estão os cabeçalhos

# Mapeamento de colunas (índices 1-based no openpyxl)
COL = {
    "ID":             1,
    "PRIORIDADE":     2,
    "CATEGORIA":      3,
    "MELHORIA":       4,
    "ONDE":           5,
    "CORRECAO":       6,
    "REFERENCIA":     7,
    "ALINHAMENTO":    8,
    "ESFORCO":        9,
    "IMPACTO":        10,
    "STATUS":         11,
    "EVIDENCIA":      12,
    "ISSUE_NUMBER":   13,  
    "ISSUE_URL":      14,  
}

HEADERS = {
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}

# ============================================================
# HELPERS
# ============================================================
def normalizar_label(texto):
    """Transforma 'Front-end / sessão' em 'front-end-sessao'."""
    if not texto:
        return None
    import unicodedata
    texto = unicodedata.normalize("NFKD", str(texto))
    texto = texto.encode("ascii", "ignore").decode("ascii")
    texto = texto.lower().replace(" ", "-").replace("/", "-")
    return "-".join(filter(None, texto.split("-")))[:50]

def montar_titulo(id_, melhoria):
    """Ex: '[1.01] JWT guardado em localStorage, legível por qualquer XSS'."""
    titulo = f"[{id_}] {melhoria or 'Sem título'}"
    return titulo[:250]  # GitHub limita a 256 chars

def montar_corpo(row):
    """Monta o corpo da issue em Markdown com todas as colunas relevantes."""
    def v(col_name):
        val = row[COL[col_name] - 1].value
        return str(val).strip() if val is not None else "—"

    return f"""## 📌 Item do plano
- **ID:** {v("ID")}
- **Prioridade:** {v("PRIORIDADE")}
- **Categoria:** {v("CATEGORIA")}

## 🔍 O que foi encontrado
{v("MELHORIA")}

**Onde:** `{v("ONDE")}`

## 🛠️ Correção proposta
{v("CORRECAO")}

## 📚 Referência
{v("REFERENCIA")}

## 🎯 Alinhamento com a vaga
{v("ALINHAMENTO")}

## ⚖️ Estimativas
- **Esforço:** {v("ESFORCO")}
- **Impacto:** {v("IMPACTO")}

---
_Issue criada automaticamente a partir da planilha `{EXCEL_FILE}`._
"""

def montar_labels(row):
    """Gera as labels da issue a partir da planilha."""
    labels = ["backlog"]
    prio   = row[COL["PRIORIDADE"] - 1].value
    cat    = row[COL["CATEGORIA"] - 1].value
    esf    = row[COL["ESFORCO"] - 1].value
    imp    = row[COL["IMPACTO"] - 1].value

    if prio: labels.append(f"priority:{str(prio).lower()}")
    if cat:  labels.append(normalizar_label(cat))
    if esf:  labels.append(f"effort:{normalizar_label(esf)}")
    if imp:  labels.append(f"impact:{normalizar_label(imp)}")
    return labels

# ============================================================
# GITHUB API
# ============================================================
def criar_issue(titulo, corpo, labels):
    url = f"https://api.github.com/repos/{GITHUB_REPO}/issues"
    payload = {"title": titulo, "body": corpo, "labels": labels}
    r = requests.post(url, headers=HEADERS, json=payload, timeout=30)
    if r.status_code == 201:
        data = r.json()
        return data["number"], data["html_url"]
    print(f"   ❌ Erro {r.status_code}: {r.text[:200]}")
    return None, None

def listar_issues():
    """Retorna {numero: {state, ...}} de todas as issues do repositório."""
    issues = {}
    page = 1
    while True:
        url = (f"https://api.github.com/repos/{GITHUB_REPO}/issues"
               f"?state=all&per_page=100&page={page}")
        r = requests.get(url, headers=HEADERS, timeout=30)
        if r.status_code != 200:
            print(f"❌ Erro ao listar issues: {r.status_code} {r.text[:200]}")
            return {}
        batch = r.json()
        if not batch:
            break
        for it in batch:
            # Ignora pull requests (a API mistura PRs e issues)
            if "pull_request" in it:
                continue
            issues[it["number"]] = it
        if len(batch) < 100:
            break
        page += 1
    return issues

# ============================================================
# SINCRONIZAÇÃO
# ============================================================
def excel_para_github():
    """Cria issues para linhas cujo Issue Number está vazio."""
    print("\n🚀 [1/2] Excel → GitHub (criar issues novas)")
    wb = load_workbook(EXCEL_FILE)
    ws = wb[SHEET_NAME]

    criadas = 0
    for r in range(HEADER_ROW + 1, ws.max_row + 1):
        id_       = ws.cell(r, COL["ID"]).value
        melhoria  = ws.cell(r, COL["MELHORIA"]).value
        numero    = ws.cell(r, COL["ISSUE_NUMBER"]).value
        url_col   = ws.cell(r, COL["ISSUE_URL"]).value

        # Pula linhas vazias ou já sincronizadas
        if not id_ or not melhoria:
            continue
        if numero and url_col:
            continue

        row = [ws.cell(r, c) for c in range(1, ws.max_column + 1)]
        titulo = montar_titulo(id_, melhoria)
        corpo  = montar_corpo(row)
        labels = montar_labels(row)

        print(f"   → Criando issue [{id_}]: {str(melhoria)[:60]}...")
        num, url = criar_issue(titulo, corpo, labels)

        if num:
            ws.cell(r, COL["ISSUE_NUMBER"], num)
            ws.cell(r, COL["ISSUE_URL"], url)
            criadas += 1
        else:
            print(f"   ⚠️  Falha ao criar issue para ID {id_}")

    if criadas:
        wb.save(EXCEL_FILE)
        print(f"   ✅ {criadas} issue(s) criada(s). Planilha atualizada.")
    else:
        print("   ℹ️  Nenhuma issue nova para criar.")
    wb.close()


def github_para_excel():
    """Atualiza a coluna Status (K) com base no estado das issues no GitHub."""
    print("\n🔄 [2/2] GitHub → Excel (sincronizar status)")
    issues = listar_issues()
    if not issues:
        print("   ℹ️  Nenhuma issue encontrada no repositório.")
        return

    wb = load_workbook(EXCEL_FILE)
    ws = wb[SHEET_NAME]
    atualizadas = 0

    for r in range(HEADER_ROW + 1, ws.max_row + 1):
        numero = ws.cell(r, COL["ISSUE_NUMBER"]).value
        if not numero:
            continue
        try:
            numero = int(numero)
        except (TypeError, ValueError):
            continue

        if numero not in issues:
            continue

        gh_state   = issues[numero]["state"]          # "open" | "closed"
        status_atual = ws.cell(r, COL["STATUS"]).value or "A fazer"

        # Regra de sincronização:
        # - Se a issue está fechada → "Concluído"
        # - Se a issue está aberta e o status local era "Concluído" → volta para "A fazer"
        # - Caso contrário → não mexe (respeita "Em andamento" e "A fazer" locais)
        if gh_state == "closed" and status_atual != "Concluído":
            ws.cell(r, COL["STATUS"], "Concluído")
            atualizadas += 1
        elif gh_state == "open" and status_atual == "Concluído":
            ws.cell(r, COL["STATUS"], "A fazer")
            atualizadas += 1

    if atualizadas:
        wb.save(EXCEL_FILE)
        print(f"   ✅ {atualizadas} linha(s) com status atualizado.")
    else:
        print("   ℹ️  Nenhum status para atualizar.")
    wb.close()


# ============================================================
# MAIN
# ============================================================
if __name__ == "__main__":
    if not GITHUB_TOKEN:
        print("❌ ERRO: variável de ambiente GITHUB_TOKEN não definida.")
        print("   Linux/macOS : export GITHUB_TOKEN='ghp_...'")
        print("   PowerShell  : $env:GITHUB_TOKEN='ghp_...'")
        sys.exit(1)

    if not os.path.exists(EXCEL_FILE):
        print(f"❌ ERRO: arquivo '{EXCEL_FILE}' não encontrado na pasta atual.")
        sys.exit(1)

    print("=" * 60)
    print(" SINCRONIZADOR — Maestro Stack AI Integration API")
    print("=" * 60)

    excel_para_github()
    github_para_excel()

    print("\n✨ Sincronização concluída.")