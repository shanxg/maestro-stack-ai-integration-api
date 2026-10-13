\# Remediation Log



Registro de achados de segurança, causa raiz, correção aplicada e evidência

de fechamento. Cada entrada deve referenciar o PR, o teste de regressão e a

ferramenta que detectou o problema.



\---



\## \[1.04 / 4.02] Hardcoded JWT secret in Kubernetes manifest



\*\*Data:\*\* 2026-10-13

\*\*Detectado por:\*\* Gitleaks (regras `kubernetes-secret-yaml`, `generic-api-key`)

\*\*Severidade:\*\* Alta

\*\*Referências:\*\* CWE-798, OWASP A02:2021



\*\*Achado:\*\*

O arquivo `k8s/secret.yaml` estava versionado no repositório público com o

valor do JWT secret em Base64 (`bWFlc3Ryb19zZWNyZXRfa2V5XzIwMjZfc3VwZXJfc2VjdXJl`),

exposto nos commits `7c18d84d` e anteriores.



\*\*Causa raiz:\*\*

Manifesto Kubernetes commitado diretamente com o valor do segredo, sem uso

de Sealed Secrets, External Secrets ou variáveis de ambiente.



\*\*Correção aplicada:\*\*

\- Valor do JWT secret rotacionado (novo valor gerado com CSPRNG).

\- `k8s/secret.yaml` removido do versionamento e adicionado ao `.gitignore`.

\- Criado `k8s/secret.yaml.example` com placeholder `REPLACE\_ME`.

\- Histórico do repositório reescrito com `git filter-repo` para eliminar o

&#x20; commit `7c18d84d`; force push aplicado (`de01357..ed58f20`).

\- Criado `.gitleaks.toml` com allowlist para placeholders e arquivos locais.



\*\*Teste de regressão:\*\*

\- `gitleaks detect --source . --verbose` retorna `no leaks found`.

\- Commit bloqueado pelo pre-commit hook se um segredo for reintroduzido.



\*\*Evidência:\*\*

\- Commit `ed58f20` — remoção do arquivo.

\- Commit `757f7e3` — `.gitignore` atualizado e `sync\_backlog.py` adicionado.

\- Force push: `de01357..ed58f20 main -> main (forced update)`.



\---



\## \[5.01] Ausência de verificação de segredos no commit



\*\*Data:\*\* 2026-10-13

\*\*Detectado por:\*\* Revisão manual / Gitleaks

\*\*Severidade:\*\* Média

\*\*Referências:\*\* OWASP A05:2021, CWE-540



\*\*Achado:\*\*

Sem verificação automatizada de segredos antes do commit, qualquer

descuido (como o do item acima) entra no histórico sem barreira.



\*\*Causa raiz:\*\*

Ausência de hook de pré-commit e de pipeline de secret scanning.



\*\*Correção aplicada:\*\*

\- `.pre-commit-config.yaml` com Gitleaks `v8.30.1` (roda em todo `git commit`).

\- `pre-commit install` registrado em `.git/hooks/pre-commit`.

\- `.gitleaks.toml` com allowlist para placeholders didáticos.



\*\*Teste de regressão:\*\*

\- Tentar commitar um arquivo com string `ghp\_xxx` deve falhar no hook.



\*\*Evidência:\*\*

\- `.pre-commit-config.yaml`, `.gitleaks.toml`.



\---



\## \[1.06] Placeholder `YOUR\_TOKEN\_HERE` no README (falso positivo)



\*\*Data:\*\* 2026-10-13

\*\*Detectado por:\*\* Gitleaks (regra `curl-auth-header`)

\*\*Severidade:\*\* Informativa

\*\*Referências:\*\* —



\*\*Achado:\*\*

O README contém exemplo de `curl` com `Authorization: Bearer YOUR\_TOKEN\_HERE`,

o que dispara a regra `curl-auth-header`.



\*\*Causa raiz:\*\*

Falso positivo: string é um placeholder didático, não um segredo real.



\*\*Correção aplicada:\*\*

Allowlist no `.gitleaks.toml` (`regexes` e `paths`).



\*\*Teste de regressão:\*\*

`gitleaks detect --source . --verbose` não reporta mais o README.



\*\*Evidência:\*\*

`.gitleaks.toml`, seção `\[allowlist]`.

