# Portal de Afiliação: diagnóstico inicial (05/11/2026)

## O que existe hoje

| Item | Estado observado |
|---|---|
| Projeto | `Poker-crypto` (repo `diegokbsa/clube-suprema-lp`), ficha `PRJ-lp-clube-suprema` no vault Suprema-360 |
| Stack | Node 24 (`engines` 22.x), sem framework e sem dependências npm; ES modules |
| Banco | `data/db.json` (arquivo JSON via `lib/store.js`); planilha Google por webhook Apps Script |
| Hospedagem | Render free, autodeploy do `main`; domínio suprema.blog |
| Funcionalidades | LP do Clube Suprema (ID 10001, agente 1439098), jornada guiada Fichas 24h com teste A/B, blog com posts automáticos (`lib/blog.js`), grade de torneios, bot Telegram, ferramentas de Instagram/YouTube, vigia, IndexNow |
| Mensuração | GA4, Meta Pixel e Clarity no front (`public/app.js`), eventos com `jornada` |
| Automação | Tarefas agendadas fazem `git push` do `main` (posts 12/15/18h, grade 9h, vigia 22h, resumo domingo) |
| Planner | Plane em `https://planner.kbsa.app`, cliente em `00-SYSTEM/scripts/plane_sync.py`, chave em `C:\AgentSetup\secrets\plane.env` |
| Agentes | `ordens.py nova <codex|kimi|big>`: Codex via `codex exec` (cwd = HOME), Kimi via `kimi.ps1` ou automação do app, Big = Claude (`claude -p`, autorizado em 05/11 em `controle-orquestracao.json`) |
| Servidor 24 h | Bigue (`kbsa.app/<projeto>` e `<projeto>.kbsa.app`, túnel Cloudflare `kbsa-bigue` + Caddy) |

## Decisões

1. **O portal nasce em `portal/`, dentro do mesmo repo, na branch `portal-afiliacao`** (worktree `Desktop\portal-afiliacao`).
   A LP do suprema.blog continua intacta e no ar. O main recebe o portal só depois do OK do Kbsa, porque as tarefas agendadas publicam o main.
2. **Node 24 + `node:sqlite` embutido, sem dependências.** Mantém o padrão do repo e roda igual no Render, no Bigue e no PC.
   Trocar para Postgres depois é só trocar `lib/db.mjs` (todas as consultas passam pelo repositório com escopo de operação).
3. **Multi-tenant por coluna `tenant_id` obrigatória**, com acesso só pelo repositório com escopo (`lib/repo.mjs`), que sempre filtra e grava o tenant.
   Permissões são checadas no servidor em toda rota `/api/t/:tenant/...`.
4. **Módulos plugáveis**: cada módulo é `lib/modules/<nome>.mjs` (rotas) + `lib/schema/<nn>-<nome>.sql` (tabelas) + `public/admin/modules/<nome>.js` (tela).
   O servidor carrega tudo sozinho, então agentes diferentes trabalham em arquivos diferentes sem conflito.
5. **Templates são JSON** (`portal/templates/*.json`) com páginas e blocos de um catálogo fixo (`lib/blocks.mjs`).
   Ao criar o site, os blocos são copiados para a página: atualizar o template nunca sobrescreve personalização.
6. **Nicho é configuração** (`lib/niches.mjs`): termos ("Clube", "Parceiro", "Loja", "Criador"), campos, eventos de conversão, templates e regra de comissão padrão.
7. **Atribuição**: último clique válido dentro da janela da operação (padrão 30 dias), cookie primário por operação; conversão só gera crédito
   com evento verificável (webhook assinado HMAC ou integração), deduplicado por `(tenant, source, external_id)`. Comissão nunca dispara pagamento.
8. **Integrações mostram estado real**: sem credencial, ficam "pendente de configuração". Segredos só no servidor, nunca no front nem em log.
9. **Campanhas Meta nascem em rascunho/pausadas**; publicar exige orçamento definido e confirmação explícita da operação.
10. **Coordenação**: orquestrador Python em `portal/orquestrador/` usa o `ordens.py` real e o Plane real (projeto "Portal de Afiliação", estados próprios,
    sem a coluna "Big - A fazer" para não ser pego pelo worker da caixa).

## Preservar, ampliar, corrigir

- **Preservar:** LP e jornada A/B do suprema.blog, blog automático, grade de torneios, bot Telegram, ferramentas de redes, identidade (logo S, verde feltro e dourado).
- **Ampliar:** o Clube Suprema vira a operação 10001 do portal (site legado apontando para suprema.blog); o modelo "Clube de poker premium" reaproveita a estrutura da LP.
- **Corrigir depois (fora do portal):** `lib/blog.js` tem a pior nota de saúde (2.83/10); `data/db.json` não serve para vários clientes.
