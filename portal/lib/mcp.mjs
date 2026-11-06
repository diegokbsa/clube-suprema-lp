// Conector MCP do portal: a IA do usuário (Claude, ChatGPT, Kimi, Codex...) usa as ferramentas do portal com o login dele.
//
//   POST /mcp                                   MCP por HTTP (Streamable HTTP, respostas JSON), autenticação Bearer
//   GET  /.well-known/oauth-protected-resource  RFC 9728: diz qual servidor de autorização vale para /mcp
//   GET  /.well-known/oauth-authorization-server RFC 8414
//   POST /oauth/register                        RFC 7591: registro dinâmico (o Claude e o ChatGPT se registram sozinhos)
//   GET|POST /oauth/authorize                   login + escolha da operação + consentimento (PKCE S256 obrigatório)
//   POST /oauth/token                           código -> tokens; refresh com rotação
//
// Cada conexão fica presa a UMA operação e ao papel do usuário nela: a ferramenta checa `can(user, role, perm)` a cada chamada,
// então tirar o acesso da pessoa derruba a IA dela na hora. Nada publica sozinho: a IA cria rascunhos; publicar é no painel.
import { createHash, randomBytes } from 'node:crypto';
import { id as newId, now, parse } from './db.mjs';
import { scoped, registerTable } from './repo.mjs';
import { can, checkPassword, createSession, readSession, membership, permsOf, ROLES } from './auth.mjs';
import { esc } from './blocks.mjs';
import { blockSchema, cleanBlocks } from './blocks.mjs';
import { publicTenant, audit as writeAudit } from './tenants.mjs';
import { unitLabel } from './niches.mjs';
import { affiliateLink } from './attribution.mjs';
import { seoChecklist } from './seo.mjs';
import { readBody, decodeBody, parseCookies, cookie, send, rateLimiter, clientIp, HttpError } from './http.mjs';

registerTable('ai_keys');
registerTable('ai_services');

export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const ACCESS_TTL = 3600;
const REFRESH_TTL = 30 * 86400;
const PAT_TTL = 90 * 86400;
const sha = (t) => createHash('sha256').update(String(t)).digest('hex');
const token = (prefix) => `${prefix}_${randomBytes(32).toString('base64url')}`;
const b64url = (buf) => Buffer.from(buf).toString('base64url');

// ---------------------------------------------------------------- tokens

export function issueTokens(db, { clientId, userId, tenantId, name, family = newId(), pat = false }) {
  const t = Date.now();
  const ins = db.prepare('INSERT INTO oauth_tokens (id, token_hash, kind, client_id, user_id, tenant_id, name, family, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  if (pat) {
    const access = token('pa_pat');
    ins.run(newId(), sha(access), 'pat', null, userId, tenantId, name, family, t + PAT_TTL * 1000, now());
    return { access_token: access, token_type: 'Bearer', expires_in: PAT_TTL, family };
  }
  const access = token('pa_at');
  const refresh = token('pa_rt');
  ins.run(newId(), sha(access), 'access', clientId, userId, tenantId, name, family, t + ACCESS_TTL * 1000, now());
  ins.run(newId(), sha(refresh), 'refresh', clientId, userId, tenantId, name, family, t + REFRESH_TTL * 1000, now());
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL, refresh_token: refresh, scope: 'portal', family };
}

export function revokeFamily(db, userId, tenantId, family) {
  return db.prepare('UPDATE oauth_tokens SET revoked = 1 WHERE user_id = ? AND tenant_id = ? AND family = ?').run(userId, tenantId, family).changes;
}

/** Bearer -> { user, tenant, role, tok } ou null. */
export function authBearer(db, header) {
  const m = /^Bearer\s+(\S+)$/i.exec(String(header || ''));
  if (!m) return null;
  const tok = db.prepare("SELECT * FROM oauth_tokens WHERE token_hash = ? AND kind IN ('access', 'pat')").get(sha(m[1]));
  if (!tok || tok.revoked || (tok.expires_at && tok.expires_at < Date.now())) return null;
  const user = db.prepare('SELECT id, email, name, is_super FROM users WHERE id = ?').get(tok.user_id);
  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tok.tenant_id);
  if (!user || !tenant || tenant.status !== 'ativa') return null;
  const role = membership(db, user, tenant.id);
  if (!user.is_super && !role) return null; // acesso à operação foi retirado
  if (!can(user, role, 'ai.connect')) return null;
  if (!tok.last_used_at || Date.now() - Date.parse(tok.last_used_at) > 60_000) db.prepare('UPDATE oauth_tokens SET last_used_at = ? WHERE id = ?').run(now(), tok.id);
  return { user, tenant, role, tok };
}

// ---------------------------------------------------------------- ferramentas

const S = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });

function myAffiliate(repo, user) {
  return repo.all('affiliates', { user_id: user.id }, { limit: 1 })[0] || repo.all('affiliates', { email: user.email }, { limit: 1 })[0] || null;
}
const fail = (msg) => { throw Object.assign(new Error(msg), { toolError: true }); };

export const CORE_TOOLS = [
  {
    name: 'resumo_da_operacao', perm: ['tenant.read', 'affiliate.self'],
    description: 'Mostra a operação conectada (nome, nicho, termos, contatos) e o seu papel e permissões nela. Use primeiro para saber o que você pode fazer.',
    inputSchema: S({}),
    handler: ({ tenant, user, role }) => ({ operacao: publicTenant(tenant), papel: user.is_super ? 'superadministrador' : ROLES[role], permissoes: permsOf(user, role) }),
  },
  {
    name: 'catalogo_de_blocos', perm: 'site.read',
    description: 'Lista os tipos de bloco do construtor de páginas e os campos de cada um. Consulte antes de montar ou alterar blocos.',
    inputSchema: S({}),
    handler: () => ({ blocos: blockSchema() }),
  },
  {
    name: 'listar_paginas', perm: 'site.read',
    description: 'Lista os sites e as páginas da operação, com situação (publicada, rascunho, com alterações).',
    inputSchema: S({}),
    handler: ({ repo }) => ({ sites: repo.all('sites', {}, { order: 'created_at ASC' }).map((s) => ({ id: s.id, nome: s.name, endereco: `/s/${s.slug}/`, externo: s.external_url || null,
      paginas: repo.all('pages', { site_id: s.id }, { order: 'position ASC' }).map((p) => ({ id: p.id, titulo: p.title, endereco: `/${p.slug}`, publicada: Boolean(p.published), alteracoes_nao_publicadas: Boolean(p.published) && p.published !== p.draft })) })) }),
  },
  {
    name: 'ler_pagina', perm: 'site.read',
    description: 'Lê o rascunho de uma página (lista de blocos com os textos) e o checklist de SEO.',
    inputSchema: S({ pagina_id: str('id da página (de listar_paginas)') }, ['pagina_id']),
    handler: ({ repo, args }) => {
      const p = repo.get('pages', String(args.pagina_id || '')) || fail('Página não encontrada nesta operação.');
      const site = repo.get('sites', p.site_id);
      return { id: p.id, titulo: p.title, endereco: `/${p.slug}`, seo: parse(p.seo, {}), blocos: parse(p.draft, []), checklist_seo: seoChecklist({ page: p, blocks: parse(p.draft, []), site }) };
    },
  },
  {
    name: 'atualizar_rascunho_da_pagina', perm: 'site.edit',
    description: 'Substitui os blocos do RASCUNHO de uma página (não publica). Mande a lista completa de blocos no formato de ler_pagina. Publicar é feito por uma pessoa no painel.',
    inputSchema: S({ pagina_id: str('id da página'), blocos: { type: 'array', description: 'lista completa de blocos { type, props }', items: { type: 'object' } }, titulo: str('novo título da página (opcional)') }, ['pagina_id', 'blocos']),
    handler: ({ repo, args, user }) => {
      const p = repo.get('pages', String(args.pagina_id || '')) || fail('Página não encontrada nesta operação.');
      let blocks;
      try { blocks = cleanBlocks(args.blocos); } catch (e) { fail(`Blocos inválidos: ${e.message}. Consulte catalogo_de_blocos.`); }
      repo.insert('page_versions', { page_id: p.id, blocks: p.draft, note: 'antes da edição pela IA', created_by: user.id });
      const out = repo.update('pages', p.id, { draft: JSON.stringify(blocks), ...(args.titulo ? { title: String(args.titulo).slice(0, 80) } : {}) });
      return { ok: true, pagina: out.id, blocos: blocks.length, aviso: 'Rascunho salvo. A versão anterior ficou guardada. Para ir ao ar, alguém com permissão publica no painel.' };
    },
  },
  {
    name: 'checklist_seo', perm: 'site.read',
    description: 'Checklist de SEO de uma página (título, descrição, H1, links internos, volume de texto, imagem de compartilhamento).',
    inputSchema: S({ pagina_id: str('id da página') }, ['pagina_id']),
    handler: ({ repo, args }) => {
      const p = repo.get('pages', String(args.pagina_id || '')) || fail('Página não encontrada nesta operação.');
      return { checklist: seoChecklist({ page: p, blocks: parse(p.draft, []), site: repo.get('sites', p.site_id) }) };
    },
  },
  {
    name: 'listar_calendario', perm: 'calendar.read',
    description: 'Itens do calendário editorial (Instagram, YouTube, blog, Telegram) nos próximos dias, com situação.',
    inputSchema: S({ dias: { type: 'integer', minimum: 1, maximum: 60, description: 'quantos dias a partir de hoje (padrão 7)' } }),
    handler: ({ repo, args, tenant }) => {
      const ate = new Date(Date.now() + (Number(args.dias) || 7) * 864e5).toISOString();
      const s = parse(tenant.settings, {});
      return { meta_por_dia: s.postsPerDay ?? 3, horarios: s.postTimes, fuso: s.timezone,
        itens: repo.all('calendar', {}, { order: 'scheduled_at ASC', extra: 'scheduled_at >= ? AND scheduled_at <= ?', extraParams: [new Date(Date.now() - 864e5).toISOString(), ate] })
          .map((c) => ({ id: c.id, canal: c.channel, quando: c.scheduled_at, legenda: c.caption, situacao: c.status })) };
    },
  },
  {
    name: 'criar_rascunho_no_calendario', perm: 'calendar.edit',
    description: 'Cria um RASCUNHO de publicação no calendário (instagram, youtube, blog ou telegram). Nada é publicado: fica para revisão e aprovação no painel. Repetir com a mesma chave não duplica.',
    inputSchema: S({ canal: { type: 'string', enum: ['instagram', 'youtube', 'blog', 'telegram'] }, quando: str('data e hora ISO 8601, com fuso (ex.: 2026-11-07T12:00:00-03:00)'),
      legenda: str('texto da publicação (legenda, roteiro ou resumo)'), chave: str('chave para não duplicar (opcional; padrão: canal + horário)') }, ['canal', 'quando', 'legenda']),
    handler: ({ repo, args }) => {
      if (!['instagram', 'youtube', 'blog', 'telegram'].includes(args.canal)) fail('Canal inválido.');
      const t = Date.parse(args.quando);
      if (Number.isNaN(t)) fail('Data inválida: use ISO 8601 com fuso.');
      const quando = new Date(t).toISOString();
      const key = String(args.chave || `${args.canal}|${quando}`).slice(0, 120);
      const existing = repo.get('calendar', { idem_key: key });
      if (existing) return { ok: true, duplicado: true, id: existing.id, situacao: existing.status };
      const row = repo.insert('calendar', { channel: args.canal, scheduled_at: quando, caption: String(args.legenda).slice(0, 5000), status: 'rascunho', idem_key: key });
      return { ok: true, id: row.id, situacao: 'rascunho', aviso: 'Rascunho criado. Publicação só depois da aprovação no painel e com a conta do canal conectada.' };
    },
  },
  {
    name: 'listar_leads', perm: 'leads.read',
    description: 'Leads recentes do CRM com etapa e origem (UTM e afiliado). Dados pessoais: use só para atendimento.',
    inputSchema: S({ etapa: str('filtrar por etapa (novo, contato, qualificado, convertido, perdido)'), limite: { type: 'integer', minimum: 1, maximum: 100 } }),
    handler: ({ repo, args }) => ({ leads: repo.all('leads', args.etapa ? { stage: String(args.etapa) } : {}, { order: 'created_at DESC', limit: Number(args.limite) || 20 })
      .map((l) => ({ id: l.id, nome: l.name, email: l.email, etapa: l.stage, origem: parse(l.utm, {}), quando: l.created_at })) }),
  },
  {
    name: 'meu_link_de_afiliado', perm: 'affiliate.self',
    description: 'Gera o seu link de afiliado com UTM padronizada para um canal e campanha (ex.: instagram, youtube, telegram).',
    inputSchema: S({ canal: str('canal onde o link vai ser usado (padrão: link)'), campanha: str('nome da campanha (opcional)'), pagina: str('endereço da página de destino, ex.: torneios (opcional)') }),
    handler: ({ repo, args, user, tenant, app }) => {
      const a = myAffiliate(repo, user) || fail('Você ainda não tem cadastro de afiliado nesta operação. Peça ao administrador.');
      return { codigo: a.code, link: affiliateLink(app.originOf ? app.originOf(tenant.edition) : app.origin, tenant.slug, a.code, { to: String(args.pagina || '').replace(/[^a-z0-9-]/g, ''), medium: String(args.canal || 'link').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'link', campaign: String(args.campanha || '').slice(0, 60) }) };
    },
  },
  {
    name: 'meus_resultados', perm: 'affiliate.self',
    description: 'Seus cliques, leads e conversões verificadas como afiliado nesta operação.',
    inputSchema: S({}),
    handler: ({ repo, user }) => {
      const a = myAffiliate(repo, user) || fail('Você ainda não tem cadastro de afiliado nesta operação.');
      return { codigo: a.code, cliques: repo.count('clicks', { affiliate_id: a.id }), leads: repo.count('leads', { affiliate_id: a.id }), conversoes_verificadas: repo.count('conversions', { affiliate_id: a.id, verified: 1 }) };
    },
  },
];

function allowed(tool, user, role) {
  return [].concat(tool.perm).some((p) => can(user, role, p));
}

// ---------------------------------------------------------------- páginas do OAuth

const PAGE_CSP = "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'";

function oauthPage(title, inner) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap"><link rel="stylesheet" href="/admin/admin.css"><meta name="robots" content="noindex"></head>
<body><div class="login"><form method="post" action="/oauth/authorize">${inner}</form></div></body></html>`;
}

const hidden = (q) => ['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'scope', 'resource', 'response_type']
  .map((k) => (q[k] != null ? `<input type="hidden" name="${k}" value="${esc(q[k])}">` : '')).join('');

const logo = '<div class="logo"><span class="logo-mark">S</span><div>Portal de Afiliação<small>Conectar sua IA</small></div></div>';

// ---------------------------------------------------------------- servidor

export function createMcp(app, ed = app.edition) {
  const ORIGIN = ed?.origin || ORIGIN;
  const { db } = app;
  const loginLimit = rateLimiter(10, 15 * 60_000);
  const regLimit = rateLimiter(30, 60 * 60_000);
  const secure = ORIGIN.startsWith('https://');
  const mcpUrl = `${ORIGIN}/mcp`;
  const tools = () => [...CORE_TOOLS, ...(app.mcpTools || [])];
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id' };
  const unauthorized = (res) => send(res, 401, { error: 'invalid_token', error_description: 'Conecte pelo login do portal.' },
    { ...cors, 'WWW-Authenticate': `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource"` });

  const protectedResource = { resource: mcpUrl, authorization_servers: [ORIGIN], bearer_methods_supported: ['header'], scopes_supported: ['portal'], resource_name: 'Portal de Afiliação' };
  const authServer = { issuer: ORIGIN, authorization_endpoint: `${ORIGIN}/oauth/authorize`, token_endpoint: `${ORIGIN}/oauth/token`,
    registration_endpoint: `${ORIGIN}/oauth/register`, response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'], scopes_supported: ['portal'] };

  function validRedirect(u) {
    try {
      const x = new URL(u);
      if (x.hash) return false;
      return x.protocol === 'https:' || (x.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(x.hostname));
    } catch { return false; }
  }

  function register(req, res, body) {
    if (!regLimit(clientIp(req))) return send(res, 429, { error: 'too_many_requests' }, cors);
    const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
    if (!uris.length || uris.length > 5 || !uris.every(validRedirect)) return send(res, 400, { error: 'invalid_redirect_uri', error_description: 'redirect_uris precisa de 1 a 5 endereços https (ou http://localhost).' }, cors);
    const id = `cli_${randomBytes(12).toString('base64url')}`;
    const name = String(body.client_name || 'Cliente MCP').slice(0, 80);
    db.prepare('INSERT INTO oauth_clients (id, name, redirect_uris, created_at) VALUES (?, ?, ?, ?)').run(id, name, JSON.stringify(uris), now());
    return send(res, 201, { client_id: id, client_name: name, redirect_uris: uris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'], client_id_issued_at: Math.floor(Date.now() / 1000) }, cors);
  }

  function checkAuthorizeParams(q) {
    const client = db.prepare('SELECT * FROM oauth_clients WHERE id = ?').get(String(q.client_id || ''));
    if (!client) return { error: 'Cliente desconhecido. Remova e adicione o conector de novo na sua IA.' };
    if (!parse(client.redirect_uris, []).includes(q.redirect_uri)) return { error: 'Endereço de retorno não registrado para este cliente.' };
    if (q.response_type !== 'code') return { error: 'response_type precisa ser "code".', redirect: true };
    if (!q.code_challenge || q.code_challenge_method !== 'S256') return { error: 'PKCE S256 é obrigatório.', redirect: true };
    return { client };
  }

  function errorRedirect(res, q, error, description) {
    const u = new URL(q.redirect_uri);
    u.searchParams.set('error', error);
    if (description) u.searchParams.set('error_description', description);
    if (q.state) u.searchParams.set('state', q.state);
    return send(res, 302, '', { Location: u.toString() });
  }

  function loginForm(res, q, msg = '') {
    return send(res, 200, oauthPage('Entrar · conectar sua IA', `${logo}<p class="muted">Entre com a sua conta do portal para conectar a sua IA.</p>${hidden(q)}<input type="hidden" name="action" value="login">
      <label class="field">E-mail<input name="email" type="email" autocomplete="username" required></label>
      <label class="field">Senha<input name="password" type="password" autocomplete="current-password" required></label>
      <p class="err">${esc(msg)}</p><button class="btn primary" type="submit">Entrar</button>`), { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': PAGE_CSP, 'X-Frame-Options': 'DENY' });
  }

  function consentForm(res, q, client, session, extraHeaders = {}, msg = '') {
    const user = session.user;
    const edId = ed?.id || 'geral';
    const rows = user.is_super ? db.prepare('SELECT *, NULL role FROM tenants WHERE status = ? AND edition = ? ORDER BY created_at').all('ativa', edId)
      : db.prepare("SELECT t.*, m.role FROM memberships m JOIN tenants t ON t.id = m.tenant_id WHERE m.user_id = ? AND t.status = 'ativa' AND t.edition = ? ORDER BY t.created_at").all(user.id, edId);
    const options = rows.filter((t) => can(user, t.role, 'ai.connect'));
    if (!options.length) return send(res, 403, oauthPage('Sem operação', `${logo}<p>Sua conta não tem nenhuma operação onde possa conectar uma IA.</p>`), { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': PAGE_CSP, ...extraHeaders });
    return send(res, 200, oauthPage('Permitir acesso', `${logo}<h2>Permitir que <strong>${esc(client.name)}</strong> use o portal?</h2>
      <p class="muted">A IA vai agir como <strong>${esc(user.name)}</strong> (${esc(user.email)}), só na operação escolhida e só com as permissões do seu papel. Ela cria rascunhos; publicar continua sendo no painel.</p>
      ${hidden(q)}<input type="hidden" name="csrf" value="${esc(session.csrf)}">
      <label class="field">Operação<select name="tenant">${options.map((t) => `<option value="${esc(t.id)}">${esc(unitLabel(t.niche_id, t.number))} · ${esc(t.name)}${t.role ? ` (${esc(ROLES[t.role])})` : ''}</option>`).join('')}</select></label>
      <p class="err">${esc(msg)}</p><div class="row end"><button class="btn" name="action" value="deny" type="submit">Recusar</button><button class="btn primary" name="action" value="approve" type="submit">Permitir</button></div>`),
    { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': PAGE_CSP, 'X-Frame-Options': 'DENY', ...extraHeaders });
  }

  async function authorize(req, res, url) {
    const isPost = req.method === 'POST';
    const body = isPost ? decodeBody(await readBody(req, 20_000), req.headers['content-type'] || '') : {};
    const q = isPost ? body : Object.fromEntries(url.searchParams);
    const chk = checkAuthorizeParams(q);
    if (chk.error && !chk.redirect) return send(res, 400, oauthPage('Erro', `${logo}<p class="err">${esc(chk.error)}</p>`), { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': PAGE_CSP });
    if (chk.error) return errorRedirect(res, q, 'invalid_request', chk.error);
    const sessToken = parseCookies(req.headers.cookie).pa_sess;
    let session = readSession(db, sessToken);
    if (isPost && body.action === 'login') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!loginLimit(`${clientIp(req)}|${email}`)) return loginForm(res, q, 'Muitas tentativas. Espere 15 minutos.');
      const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (!u || !checkPassword(body.password, u.pass)) return loginForm(res, q, 'E-mail ou senha incorretos.');
      const s = createSession(db, u.id);
      session = { user: { id: u.id, email: u.email, name: u.name, is_super: u.is_super }, csrf: s.csrf };
      return consentForm(res, q, chk.client, session, { 'Set-Cookie': cookie('pa_sess', s.token, { maxAge: s.maxAge, secure, sameSite: 'Strict' }) });
    }
    if (!session) return loginForm(res, q);
    if (!isPost) return consentForm(res, q, chk.client, session);
    if (body.csrf !== session.csrf) return consentForm(res, q, chk.client, session, {}, 'Sessão expirada. Tente de novo.');
    if (body.action === 'deny') return errorRedirect(res, q, 'access_denied', 'O usuário recusou.');
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(String(body.tenant || ''));
    const role = tenant ? membership(db, session.user, tenant.id) : null;
    if (!tenant || tenant.edition !== (ed?.id || 'geral') || (!session.user.is_super && !role) || !can(session.user, role, 'ai.connect')) return consentForm(res, q, chk.client, session, {}, 'Escolha uma operação sua.');
    const code = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO oauth_codes (code_hash, client_id, user_id, tenant_id, redirect_uri, challenge, scope, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(sha(code), chk.client.id, session.user.id, tenant.id, q.redirect_uri, q.code_challenge, 'portal', Date.now() + 10 * 60_000);
    writeAudit(db, { tenantId: tenant.id, userId: session.user.id, action: 'ia.conectar', target: chk.client.id, data: { cliente: chk.client.name } });
    const u = new URL(q.redirect_uri);
    u.searchParams.set('code', code);
    if (q.state) u.searchParams.set('state', q.state);
    return send(res, 302, '', { Location: u.toString() });
  }

  async function tokenEndpoint(req, res) {
    const body = decodeBody(await readBody(req, 20_000), req.headers['content-type'] || 'application/x-www-form-urlencoded');
    const bad = (error, d) => send(res, 400, { error, error_description: d }, { ...cors, 'Cache-Control': 'no-store' });
    const ok = (t) => { const { family, ...out } = t; return send(res, 200, out, { ...cors, 'Cache-Control': 'no-store', Pragma: 'no-cache' }); };
    if (body.grant_type === 'authorization_code') {
      const row = db.prepare('SELECT * FROM oauth_codes WHERE code_hash = ?').get(sha(body.code || ''));
      if (row) db.prepare('DELETE FROM oauth_codes WHERE code_hash = ?').run(row.code_hash); // uso único
      if (!row || row.expires_at < Date.now()) return bad('invalid_grant', 'Código inválido ou expirado.');
      if (row.client_id !== body.client_id || row.redirect_uri !== body.redirect_uri) return bad('invalid_grant', 'Cliente ou endereço de retorno não confere.');
      if (b64url(createHash('sha256').update(String(body.code_verifier || '')).digest()) !== row.challenge) return bad('invalid_grant', 'PKCE não confere.');
      const client = db.prepare('SELECT name FROM oauth_clients WHERE id = ?').get(row.client_id);
      return ok(issueTokens(db, { clientId: row.client_id, userId: row.user_id, tenantId: row.tenant_id, name: client?.name || 'Cliente MCP' }));
    }
    if (body.grant_type === 'refresh_token') {
      const row = db.prepare("SELECT * FROM oauth_tokens WHERE token_hash = ? AND kind = 'refresh'").get(sha(body.refresh_token || ''));
      if (!row || row.expires_at < Date.now() || (body.client_id && body.client_id !== row.client_id)) return bad('invalid_grant', 'Refresh inválido.');
      if (row.revoked) { // reuso de refresh já trocado = vazamento provável: derruba a conexão inteira
        db.prepare('UPDATE oauth_tokens SET revoked = 1 WHERE family = ?').run(row.family);
        return bad('invalid_grant', 'Refresh já usado; conecte de novo.');
      }
      db.prepare("UPDATE oauth_tokens SET revoked = 1 WHERE family = ? AND kind IN ('access', 'refresh')").run(row.family);
      return ok(issueTokens(db, { clientId: row.client_id, userId: row.user_id, tenantId: row.tenant_id, name: row.name, family: row.family }));
    }
    return bad('unsupported_grant_type', 'Use authorization_code ou refresh_token.');
  }

  async function mcpEndpoint(req, res) {
    if (req.method === 'GET') return send(res, 405, { error: 'Este servidor responde em JSON por POST; não abre fluxo SSE.' }, { ...cors, Allow: 'POST' });
    if (req.method === 'DELETE') return send(res, 204, '', cors);
    const ctx = authBearer(db, req.headers.authorization);
    if (!ctx || (ed && ctx.tenant.edition && ctx.tenant.edition !== ed.id)) return unauthorized(res); // token da outra edição não vale aqui
    let msg;
    try { msg = JSON.parse((await readBody(req, 2_000_000)).toString('utf8')); } catch { return send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } }, cors); }
    if (Array.isArray(msg)) return send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Lotes não são aceitos.' } }, cors);
    const reply = (result) => send(res, 200, { jsonrpc: '2.0', id: msg.id, result }, cors);
    const error = (code, message) => send(res, 200, { jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } }, cors);
    if (msg.id === undefined) return send(res, 202, '', cors); // notificação (ex.: notifications/initialized)
    const repo = scoped(db, ctx.tenant.id);
    switch (msg.method) {
      case 'initialize': {
        const asked = msg.params?.protocolVersion;
        return reply({ protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0], capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'portal-afiliacao', title: 'Portal de Afiliação', version: '1.0.0' },
          instructions: `Você está conectado à operação ${unitLabel(ctx.tenant.niche_id, ctx.tenant.number)} · ${ctx.tenant.name}, como ${ctx.user.name}. Comece por resumo_da_operacao. Tudo o que você cria fica como rascunho para uma pessoa revisar e publicar.` });
      }
      case 'ping': return reply({});
      case 'tools/list': return reply({ tools: tools().filter((t) => allowed(t, ctx.user, ctx.role)).map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
      case 'tools/call': {
        const t = tools().find((x) => x.name === msg.params?.name);
        if (!t || !allowed(t, ctx.user, ctx.role)) return error(-32602, `Ferramenta indisponível para o seu papel: ${msg.params?.name}`);
        try {
          const result = await t.handler({ args: msg.params?.arguments || {}, user: ctx.user, role: ctx.role, tenant: ctx.tenant, repo, db, app });
          writeAudit(db, { tenantId: ctx.tenant.id, userId: ctx.user.id, action: 'ia.ferramenta', target: t.name, data: { cliente: ctx.tok.name } });
          return reply({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result, isError: false });
        } catch (e) {
          if (!e.toolError) console.error('[mcp]', t.name, e);
          return reply({ content: [{ type: 'text', text: e.toolError ? e.message : 'Erro interno na ferramenta.' }], isError: true });
        }
      }
      default: return error(-32601, `Método não suportado: ${msg.method}`);
    }
  }

  /** Devolve true se a requisição era do MCP/OAuth (e já respondeu). */
  async function handle(req, res, url) {
    const p = url.pathname;
    const mine = p === '/mcp' || p.startsWith('/oauth/') || p.startsWith('/.well-known/oauth-');
    if (!mine) return false;
    if (req.method === 'OPTIONS') { send(res, 204, '', cors); return true; }
    if (p.startsWith('/.well-known/oauth-protected-resource')) { send(res, 200, protectedResource, cors); return true; }
    if (p.startsWith('/.well-known/oauth-authorization-server')) { send(res, 200, authServer, cors); return true; }
    if (p === '/oauth/register' && req.method === 'POST') { register(req, res, decodeBody(await readBody(req, 20_000), 'application/json')); return true; }
    if (p === '/oauth/authorize') { await authorize(req, res, url); return true; }
    if (p === '/oauth/token' && req.method === 'POST') { await tokenEndpoint(req, res); return true; }
    if (p === '/mcp') { await mcpEndpoint(req, res); return true; }
    send(res, 404, { error: 'não encontrado' }, cors);
    return true;
  }

  return { handle, mcpUrl, tools };
}

// ---------------------------------------------------------------- rotas do painel: "Conectar sua IA"

export const AI_PROVIDERS = {
  anthropic: { label: 'Claude (Anthropic)', test: (key) => ['https://api.anthropic.com/v1/models', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } }], consoleUrl: 'https://console.anthropic.com/settings/keys' },
  openai: { label: 'ChatGPT (OpenAI)', test: (key) => ['https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } }], consoleUrl: 'https://platform.openai.com/api-keys' },
  moonshot: { label: 'Kimi (Moonshot)', test: (key) => ['https://api.moonshot.ai/v1/models', { headers: { Authorization: `Bearer ${key}` } }], consoleUrl: 'https://platform.moonshot.ai/console/api-keys' },
  google: { label: 'Gemini (Google)', test: (key) => [`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, {}], consoleUrl: 'https://aistudio.google.com/apikey' },
};

export const AI_SERVICES = {
  noticias_blog: { label: 'Notícias no blog', what: 'Pesquisa notícias do nicho, escreve o post com SEO e deixa como rascunho para revisão; ao publicar, o portal avisa os buscadores.', needs: ['blog'] },
  instagram: { label: 'Posts no Instagram', what: 'Legenda, CTA e link de afiliado para os horários do calendário (meta de 3 por dia), como rascunho para aprovar.', needs: ['calendario'] },
  youtube: { label: 'YouTube (Shorts e vídeos)', what: 'Roteiro, título, descrição com link e tags para o calendário, como rascunho.', needs: ['calendario'] },
  criativos: { label: 'Criativos', what: 'Peças 1:1, 4:5 e 9:16 com a identidade da operação, para aprovar e exportar.', needs: ['criativos'] },
};

function serviceStatus(app, svc, { hasConnection, key }) {
  const tools = [...CORE_TOOLS, ...(app.mcpTools || [])].map((t) => t.name);
  const byMcp = { noticias_blog: tools.some((n) => /post|blog/.test(n)), instagram: tools.includes('criar_rascunho_no_calendario'), youtube: tools.includes('criar_rascunho_no_calendario'), criativos: tools.some((n) => /criativo/.test(n)) }[svc];
  const routine = Boolean(app.aiRoutines?.[svc]);
  return {
    pelaIa: !hasConnection ? 'Conecte sua IA para usar' : byMcp ? 'Disponível: peça para a sua IA' : 'Aguardando o módulo deste serviço no portal',
    automatico: !key ? 'Precisa de chave de API (opcional) para rodar sozinho' : key.status !== 'valida' ? 'Chave não validada' : routine ? 'Rotina ativa nos horários da operação' : 'Aguardando a rotina automática deste serviço no portal',
    pronto: { pelaIa: hasConnection && byMcp, automatico: Boolean(key && key.status === 'valida' && routine) },
  };
}

export const aiRoutes = [
  {
    method: 'GET', path: '/api/t/:tenant/ai', perm: 'ai.connect', handler: ({ db, repo, user, role, tenant, app, origin }) => {
      const rows = db.prepare('SELECT family, kind, name, client_id, created_at, last_used_at, expires_at FROM oauth_tokens WHERE user_id = ? AND tenant_id = ? AND revoked = 0 ORDER BY created_at DESC').all(user.id, tenant.id);
      const fam = new Map();
      for (const r of rows) {
        if (r.expires_at && r.expires_at < Date.now() && r.kind !== 'refresh') continue;
        const f = fam.get(r.family) || { family: r.family, name: r.name, kind: r.kind === 'pat' ? 'token pessoal' : 'conector (OAuth)', createdAt: r.created_at, lastUsedAt: null };
        if (r.last_used_at && (!f.lastUsedAt || r.last_used_at > f.lastUsedAt)) f.lastUsedAt = r.last_used_at;
        fam.set(r.family, f);
      }
      const keys = repo.all('ai_keys', { user_id: user.id });
      const services = repo.all('ai_services', { user_id: user.id });
      const conns = [...fam.values()];
      return {
        mcpUrl: `${origin}/mcp`, connections: conns,
        providers: Object.entries(AI_PROVIDERS).map(([id, p]) => { const k = keys.find((x) => x.provider === id); return { id, label: p.label, consoleUrl: p.consoleUrl, connected: Boolean(k), status: k?.status || null, model: k?.model || '', lastError: k?.last_error || null }; }),
        services: Object.entries(AI_SERVICES).map(([id, s]) => {
          const row = services.find((x) => x.service === id);
          const key = row?.provider ? keys.find((k) => k.provider === row.provider) : keys.find((k) => k.status === 'valida');
          return { id, ...s, enabled: Boolean(row?.enabled), provider: row?.provider || key?.provider || null, status: serviceStatus(app, id, { hasConnection: conns.length > 0, key }) };
        }),
        tools: [...CORE_TOOLS, ...(app.mcpTools || [])].filter((t) => allowed(t, user, role)).map((t) => ({ name: t.name, description: t.description })),
      };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/ai/tokens', perm: 'ai.connect', handler: ({ db, user, tenant, body, audit }) => {
      const name = String(body.name || 'Token pessoal').slice(0, 60);
      const t = issueTokens(db, { userId: user.id, tenantId: tenant.id, name, pat: true });
      audit('ia.token_pessoal', t.family, { name });
      return { status: 201, body: { token: t.access_token, expiresInDays: PAT_TTL / 86400, note: 'Copie agora: este token não é mostrado de novo.' } };
    },
  },
  {
    method: 'DELETE', path: '/api/t/:tenant/ai/tokens/:family', perm: 'ai.connect', handler: ({ db, user, tenant, params, audit }) => {
      const n = revokeFamily(db, user.id, tenant.id, params.family);
      if (!n) throw new HttpError(404, 'Conexão não encontrada.');
      audit('ia.desconectar', params.family);
      return { ok: true };
    },
  },
  {
    method: 'PUT', path: '/api/t/:tenant/ai/keys/:provider', perm: 'ai.connect', handler: async ({ repo, user, params, body, app, audit }) => {
      const p = AI_PROVIDERS[params.provider];
      if (!p) throw new HttpError(400, 'Provedor desconhecido.');
      const key = String(body.key || '').trim();
      if (key.length < 20 || key.length > 300 || /\s/.test(key)) throw new HttpError(400, 'Cole a chave de API inteira.');
      let status = 'nao_testada';
      let lastError = null;
      try {
        const [url, init] = p.test(key);
        const r = await (app.fetchImpl || fetch)(url, { ...init, signal: AbortSignal.timeout(12000) });
        status = r.status === 200 ? 'valida' : 'erro';
        if (r.status !== 200) lastError = r.status === 401 || r.status === 403 ? 'O provedor recusou a chave.' : `O provedor respondeu HTTP ${r.status}.`;
      } catch (e) { status = 'erro'; lastError = 'Sem resposta do provedor.'; }
      const sealed = app.vault.seal(key);
      const existing = repo.get('ai_keys', { user_id: user.id, provider: params.provider });
      const model = String(body.model || '').slice(0, 80) || null;
      if (existing) repo.update('ai_keys', existing.id, { secret: sealed, model, status, last_error: lastError });
      else repo.insert('ai_keys', { user_id: user.id, provider: params.provider, secret: sealed, model, status, last_error: lastError });
      audit('ia.chave_api', params.provider, { status }); // nunca a chave
      return { provider: params.provider, status, lastError };
    },
  },
  {
    method: 'DELETE', path: '/api/t/:tenant/ai/keys/:provider', perm: 'ai.connect', handler: ({ repo, user, params, audit }) => {
      const k = repo.get('ai_keys', { user_id: user.id, provider: params.provider });
      if (!k) throw new HttpError(404, 'Chave não encontrada.');
      repo.remove('ai_keys', k.id);
      audit('ia.chave_removida', params.provider);
      return { ok: true };
    },
  },
  {
    method: 'PUT', path: '/api/t/:tenant/ai/services/:service', perm: 'ai.connect', handler: ({ repo, user, params, body, audit }) => {
      if (!AI_SERVICES[params.service]) throw new HttpError(400, 'Serviço desconhecido.');
      const provider = body.provider && AI_PROVIDERS[body.provider] ? body.provider : null;
      const row = repo.get('ai_services', { user_id: user.id, service: params.service });
      const patch = { enabled: body.enabled ? 1 : 0, provider, config: JSON.stringify(body.config && typeof body.config === 'object' ? body.config : {}), updated_at: now() };
      if (row) repo.update('ai_services', row.id, patch); else repo.insert('ai_services', { user_id: user.id, service: params.service, ...patch });
      audit('ia.servico', params.service, { ligado: Boolean(body.enabled) });
      return { ok: true };
    },
  },
];
