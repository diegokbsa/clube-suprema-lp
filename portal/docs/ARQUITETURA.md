# Portal de Afiliação: contrato de arquitetura

Leia isto antes de mexer no portal. Vale para Claude, Codex e Kimi.

## Rodar

```bash
npm run portal          # http://localhost:3400/admin/  (credenciais do 1º acesso em portal/data/credenciais-iniciais.txt)
npm run portal:test     # node --test "portal/test/*.test.mjs"
npm run portal:modelos  # valida portal/templates/*.json
```

Node 24, ES modules, **sem dependências npm** (não adicione nenhuma sem aprovação do coordenador). Banco: `node:sqlite`.

## Mapa

| Caminho | O que é |
|---|---|
| `portal/server.mjs` | `createApp({ db, origin, secretKey })` → `{ app, handle }`; carrega `lib/modules/*.mjs` sozinho |
| `portal/lib/schema/NN-nome.sql` | tabelas; rodam em ordem de nome a cada início (`CREATE TABLE IF NOT EXISTS`) |
| `portal/lib/repo.mjs` | `scoped(db, tenantId)`: **única** forma de ler/gravar dados de operação |
| `portal/lib/auth.mjs` | papéis, `can(user, role, perm)`, senhas, sessões, `vault(secret).seal/open` para segredos |
| `portal/lib/core.mjs` | rotas do núcleo (exemplo de tudo) |
| `portal/lib/blocks.mjs` | catálogo de blocos do construtor (`BLOCKS`) |
| `portal/lib/templates.mjs` | carrega e valida modelos |
| `portal/lib/niches.mjs` | nichos (termos, campos, conversões, comissão padrão) |
| `portal/lib/attribution.mjs` | cliques, último clique, conversões idempotentes |
| `portal/public/admin/` | painel (JS puro, rotas por hash) |
| `portal/public/assets/` | CSS/JS dos sites públicos |

## Regras que não se quebram

1. **Toda tabela de dado de operação tem `tenant_id TEXT NOT NULL`** e é registrada no módulo (`export const tables = ['posts']`).
   Leitura e escrita só por `ctx.repo` (já vem com o escopo da operação). Nunca `db.prepare(...)` direto em tabela de operação dentro de rota `/api/t/:tenant`.
2. **Permissão no servidor**: toda rota `/api/t/:tenant/...` declara `perm` (lista em `auth.mjs` → `PERMISSIONS`). Precisa de permissão nova? Adicione em `auth.mjs` e nos papéis certos, e avise na entrega.
3. **Segredos** (tokens de Telegram, Meta, Google): gravar só `app.vault.seal(token)` na coluna `secret` de `integrations`; nunca devolver ao front (no máximo `mask()`), nunca em log, nunca em erro.
4. **Estado real**: integração sem credencial = `pendente`. Nada aparece como conectado, publicado ou enviado sem ter acontecido.
5. **Dinheiro**: campanhas nascem `PAUSED`/rascunho; comissão só de conversão `verified = 1`; nenhum pagamento automático.
6. **Idempotência**: tudo que roda em agenda ou chega por webhook tem chave única (`idem_key`, `(tenant_id, source, external_id)`) e reexecutar não duplica.
7. **Textos em português do Brasil**, inclusive erros da API.
8. **Não edite** `server.mjs`, `lib/core.mjs`, `lib/repo.mjs` e `lib/auth.mjs` sem combinar com o coordenador; se precisar de um gancho novo, peça na entrega.

## Como escrever um módulo

`portal/lib/modules/<nome>.mjs`:

```js
export const tables = ['posts'];                       // tabelas com tenant_id criadas em lib/schema/20-blog.sql
export const nav = { id: 'blog', label: 'Blog', perm: 'blog.read' };   // item no menu do painel → /admin/modules/blog.js
export const routes = [
  { method: 'GET', path: '/api/t/:tenant/posts', perm: 'blog.read', handler: ({ repo }) => ({ posts: repo.all('posts') }) },
  { method: 'POST', path: '/api/t/:tenant/posts', perm: 'blog.edit', handler: ({ repo, body, audit }) => { /* ... */ return { status: 201, body: {} }; } },
];
// Rotas públicas dentro do site da operação: /s/<site>/blog e /s/<site>/blog/<slug> (ou no domínio próprio)
export const publicRoutes = [
  { path: '/blog', handler: ({ res, send, site, tenant, repo, base, pages }) => send(res, 200, '<html>...</html>', { 'Content-Type': 'text/html; charset=utf-8' }) },
];
export async function init(app) { /* agendadores do módulo, se precisar; use app.db */ }
```

Página pública na raiz da edição (PA-140): `export const rootRoutes = [{ method: 'GET', path: '/migrar', editions: ['sx'], handler: ({ req, res, url, params, db, app, edition, origin, send }) => ... }]`.
Edição fora de `editions` cai no 404 do servidor. Item de menu só de uma edição: `nav.editions = ['sx']`.

Trava antes de publicar página (PA-140): `export function prePublish({ repo, tenant, page, user }) { ... }`. Roda em `POST /api/t/:tenant/pages/:id/publish`
antes de gravar; para impedir, lance `HttpError` (ex.: 409 "Esta página espera a revisão do Kbsa"). Não grave nada no gancho: ele só decide.

`ctx` das rotas: `{ req, res, url, params, query, body, raw, user, role, tenant, repo, db, app, audit(action, target, data) }`.
Retorne um objeto (JSON 200) ou `{ status, body, headers }`. Erro: `throw new HttpError(400, 'mensagem')` (de `lib/http.mjs`).

Tela: `portal/public/admin/modules/<id>.js` com `export async function render(el, { api, S, esc, toast, can, route, fmtDate })`.
Use as classes do `admin.css` (`card`, `kpis`, `table-wrap`, `pill ok|warn|bad`, `btn primary`, `field`, `empty`).

Testes: `portal/test/<nome>.test.mjs` usando `startPortal()` e `client()` de `test/helpers.mjs`. Teste sempre o isolamento (outra operação não vê) e a permissão (papel sem `perm` recebe 403).

## Como escrever um modelo de site

`portal/templates/<id>.json` (o nome do arquivo é o id):

```json
{ "id": "torneios-agenda", "name": "Clube focado em torneios", "order": 2, "version": 1, "category": "Poker · torneios",
  "niches": ["poker"], "description": "…", "inspiredBy": null,
  "theme": { "mode": "escuro", "bg": "#…", "surface": "#…", "text": "#…", "muted": "#…", "primary": "#…", "primaryText": "#…", "accent": "#…", "border": "#…", "font": "Manrope", "fontHead": "Sora", "radius": 14 },
  "seo": { "title": "{{name}} · …", "description": "…" },
  "pages": [ { "slug": "", "title": "Início", "blocks": [ { "type": "navbar", "props": { … } } ] }, { "slug": "agenda", "title": "Agenda", "blocks": [ … ] } ] }
```

- Blocos e campos válidos: `BLOCKS` em `lib/blocks.mjs` (ou `GET /api/meta` → `blocks`). Valor de `select` tem que ser uma das opções.
- Fontes: lista `FONTS` em `lib/templates.mjs`. `niches`: `poker`, `saas`, `loja`, `criador` ou `"*"` (genérico).
- Placeholders preenchidos com os dados da operação: `{{name}} {{number}} {{unit}} {{unitLabel}} {{customer}} {{customers}} {{partner}} {{whatsapp}} {{whatsappLink}} {{telegram}} {{instagram}} {{email}} {{tagline}} {{logo}} {{disclaimer}}`
  e os campos do nicho (poker: `{{app}} {{agentId}} {{inviteLink}} {{chipsUrl}}`).
- Pelo menos uma página interna além do início. Composição da página inicial diferente dos outros modelos (o validador recusa cópia).
- **Nada de número, depoimento ou resultado inventado como real.** Número de exemplo: bloco `stats` com `"demo": true`.
- Links internos começam com `/` (viram relativos ao site); âncoras com `#` + prop `anchor` no bloco de destino.

## Atribuição (resumo)

Último clique válido dentro da janela da operação (`settings.attributionWindowDays`, padrão 30). Clique em `/r/<operação>/<código>` grava cookie `pa_<operação>`.
Lead herda o clique. Conversão por `POST /api/hooks/<operação>/conversion` com `X-Portal-Signature: sha256=<HMAC-SHA256 do corpo com o segredo da operação>`;
corpo `{ source, external_id, kind, value_cents, occurred_at?, lead_id? | email?, click_id? }`. Reenvio do mesmo `(source, external_id)` devolve 200 `duplicate: true`.

## Git

Cada tarefa num worktree e branch próprios, a partir de `portal-afiliacao`:

```bash
git -C "C:\Users\Administrator\Desktop\portal-afiliacao" worktree add -b portal/PA-010 "C:\Users\Administrator\Desktop\portal-wt\PA-010" portal-afiliacao
```

Commits pequenos, mensagem em português. **Nunca** commit ou push no `main`, nunca `git push --force`, nunca publicar nada fora do PC.
O coordenador (Claude) revisa e faz o merge em `portal-afiliacao`.

## Edições e base única de clientes (06/11/2026)

- **Um processo, um banco, duas edições.** A edição vem do endereço (`portal.kbsa.app` = geral, `sx.kbsa.app` = sx) ou da porta local
  (`PORTAL_PORT=3400:geral,3401:sx`). Nas rotas use `ctx.edition` e `ctx.origin`; nunca `app.edition`/`app.origin` (são só o padrão).
- **Operação tem edição** (`tenants.edition`). Rota `/api/t/:tenant` de outra edição responde 404. Links públicos usam `app.originOf(tenant.edition)`.
- **Cliente é uma pessoa só** (`contacts`, sem `tenant_id`): e-mail normalizado manda, telefone completa (`upsertContact` em `lib/migrations.mjs`).
  O relacionamento com a operação é o lead (`leads.contact_id`). Toda tabela nova de CRM (conversas, mensagens, tarefas) tem `tenant_id` **e** `contact_id`.
- **Isolamento:** a operação só lê pessoas que tenham lead nela (ver `lib/modules/clientes.mjs`); a base inteira é só para o superadmin, por edição.
- **Mudança de esquema em banco existente:** acrescente em `lib/migrations.mjs` (só adiciona coluna/índice, idempotente). Nunca apague.

## Recursos vindos do suprema.blog (PA-152, 06/11/2026)

- **Cadastro no app + Fichas 24h guiado** (`lib/modules/cadastro.mjs`, tabela `cadastros`): passos `conta_app`, `entrar_clube` e
  `fichas24h` no catálogo de jornadas e o modelo `cadastro-app-fichas24h` (A = app primeiro, B = fichas primeiro). Rotas públicas do site:
  `POST /cad/<jornada>/inicio`, `GET /cad/<id>/status` (a página consulta a cada 1,2 s), `POST /cad/<id>/id-app`. Cada cadastro vira lead
  (variante + UTMs) e roda os ganchos `onLead`. A senha fica só na memória (30 min); CPF, celular e nascimento ficam só no aparelho.
  Configurações da operação usadas: `inviteLink`, `chipsUrl`, `chipsHomeUrl`, `chipsClubName`, `agentId`, número do clube.
- **Planilha do Google** (`lib/modules/planilha.mjs`, integração `google_sheets`): URL do app da Web do Apps Script no cofre; gancho `onLead`
  manda cada lead uma vez (mesmos campos do `lib/sheets.js` antigo, `jornada-a/b` na indicação). Cartão em Integrações.
- **Clarity e Google Ads** por site (`tracking.mjs`: `clarity`, `ads`, `adsLabel`; `site.js` e `medicao.js` só carregam depois do consentimento).
- **Vídeos curtos** (`lib/modules/videos.mjs`, tabelas `videos` e `video_envios`): fila por operação e API do executor com o token de serviço
  (`/api/service/videos/*`). Envio de arquivo pelo painel em `PUT /envio-video/<operação>/<vídeo>` (fora de `/api`, por causa do tamanho).
  Guia do executor: `docs/executor-videos.md`.
