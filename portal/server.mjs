// Portal de Afiliação: painel central + operações + construtor + sites públicos. `node portal/server.mjs`
// Variáveis: PORTAL_PORT (3400), PORTAL_DATA_DIR (portal/data), PORTAL_ORIGIN (http://localhost:3400), PORTAL_SECRET_KEY,
//            PORTAL_ADMIN_EMAIL / PORTAL_ADMIN_PASSWORD (primeiro superadmin; sem elas a senha gerada vai para data/credenciais-iniciais.txt).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openDb, parse, now } from './lib/db.mjs';
import { scoped, registerTable } from './lib/repo.mjs';
import { HttpError, compile, parseCookies, cookie, readBody, decodeBody, send, rateLimiter, clientIp } from './lib/http.mjs';
import { readSession, createSession, dropSession, membership, can, checkPassword, createUser, hmac, safeEqualHex, vault } from './lib/auth.mjs';
import { coreRoutes } from './lib/core.mjs';
import { audit as writeAudit, createTenant } from './lib/tenants.mjs';
import { renderPage, sitemapXml, robotsTxt } from './lib/site.mjs';
import { cookieName, recordClick, recordConversion, pickUtm, windowDaysOf } from './lib/attribution.mjs';
import { createSeo } from './lib/seo.mjs';
import { createMcp, aiRoutes } from './lib/mcp.mjs';
import { edition, buildEditions } from './lib/edition.mjs';
import { upsertContact } from './lib/migrations.mjs';
import { insightRoutes } from './lib/insights.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2' };
const SESSION_COOKIE = 'pa_sess';

const ADMIN_CSP = "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const SITE_CSP = "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' https://www.googletagmanager.com https://connect.facebook.net; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://www.facebook.com; frame-src https://www.googletagmanager.com; frame-ancestors 'self'; base-uri 'none'; form-action 'self'";

export async function createApp({ db, origin = 'http://localhost:3400', secretKey = 'dev-only-change-me', modulesDir = path.join(HERE, 'lib', 'modules'), fetchImpl, editionId, serviceToken,
  origins = {}, portEditions = {} } = {}) {
  // as duas edições no mesmo servidor e no mesmo banco: a edição vem do endereço (Host) ou da porta local
  const eds = buildEditions({ origins, fallbackOrigin: origin, defaultId: editionId || process.env.PORTAL_EDITION || 'geral', portEditions });
  origin = eds.default.origin;
  const secure = origin.startsWith('https://');
  const loginLimit = rateLimiter(10, 15 * 60_000);
  const formLimit = rateLimiter(20, 10 * 60_000);
  const hookLimit = rateLimiter(600, 60_000);
  const app = { db, origin, vault: vault(secretKey), moduleNav: [], publicRoutes: [], rootRoutes: [], prePublish: [], mcpTools: [], sitemapExtras: [], paginasProprias: [], onLead: [], aiRoutines: {}, fetchImpl,
    edition: eds.default, editions: eds.editions, editionFor: (req) => eds.forRequest(req), serviceToken: serviceToken || null };
  app.originOf = (editionId) => (eds.editions[editionId] || eds.default).origin;
  app.tenantOrigin = (tenantId) => app.originOf(db.prepare('SELECT edition FROM tenants WHERE id = ?').get(tenantId)?.edition);
  app.seo = createSeo(app, { secretKey, fetchImpl });

  // ---------- módulos ----------
  const routes = [...coreRoutes, ...aiRoutes, ...insightRoutes].map((r) => ({ ...r, match: compile(r.path) }));
  if (fs.existsSync(modulesDir)) {
    for (const f of fs.readdirSync(modulesDir).filter((n) => n.endsWith('.mjs')).sort()) {
      const mod = await import(pathToFileURL(path.join(modulesDir, f)).href);
      for (const t of mod.tables || []) registerTable(t);
      for (const r of mod.routes || []) routes.push({ ...r, match: compile(r.path) });
      for (const r of mod.publicRoutes || []) app.publicRoutes.push({ ...r, match: compile(r.path) });
      for (const r of mod.rootRoutes || []) app.rootRoutes.push({ ...r, match: compile(r.path) }); // páginas públicas na raiz da edição (ex.: /migrar na SX)
      if (typeof mod.prePublish === 'function') app.prePublish.push(mod.prePublish); // trava antes de publicar página: lança HttpError para impedir
      if (mod.nav) app.moduleNav.push(...[].concat(mod.nav));
      if (mod.mcpTools) app.mcpTools.push(...mod.mcpTools);          // ferramentas que a IA do usuário pode usar
      if (mod.sitemapEntries) app.sitemapExtras.push(mod.sitemapEntries); // ({ site, tenant, repo }) => [{ path, lastmod }]
      if (typeof mod.paginaPropria === 'function') app.paginasProprias.push(mod.paginaPropria); // ({ req, site, repo, rest }) => resposta | null
      if (typeof mod.onLead === 'function') app.onLead.push(mod.onLead); // ({ app, db, tenant, site, repo, lead }) => Promise, depois de gravar o lead
      if (mod.aiRoutines) Object.assign(app.aiRoutines, mod.aiRoutines);  // rotinas automáticas por serviço (noticias_blog, instagram...)
      if (typeof mod.init === 'function') await mod.init(app);
    }
  }
  const mcps = Object.fromEntries(Object.values(eds.editions).map((e) => [e.id, createMcp(app, e)])); // OAuth e /mcp com o endereço de cada edição

  // ---------- sessão ----------
  app.login = async ({ req, res, body }) => {
    const ip = clientIp(req);
    const email = String(body.email || '').trim().toLowerCase();
    if (!loginLimit(`${ip}|${email}`)) throw new HttpError(429, 'Muitas tentativas. Espere 15 minutos.');
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!u || !checkPassword(body.password, u.pass)) throw new HttpError(401, 'E-mail ou senha incorretos.');
    const s = createSession(db, u.id);
    writeAudit(db, { userId: u.id, action: 'sessao.entrar', data: { ip } });
    res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, s.token, { maxAge: s.maxAge, secure, sameSite: 'Strict' }));
    return { ok: true, csrf: s.csrf };
  };
  app.logout = ({ req, res }) => {
    dropSession(db, parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, '', { maxAge: 0, secure, sameSite: 'Strict' }));
    return { ok: true };
  };
  app.preview = ({ repo, tenant, params }) => {
    const page = repo.get('pages', params.id);
    if (!page) throw new HttpError(404, 'Página não encontrada.');
    const site = repo.get('sites', page.site_id);
    const html = renderPage({ site, page, blocks: parse(page.draft, []), tenant, base: `/s/${site.slug}`, origin: app.originOf(tenant.edition), preview: true,
      pages: repo.all('pages', { site_id: site.id }, { order: 'position ASC' }) });
    return { status: 200, body: html, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': SITE_CSP.replace("frame-ancestors 'self'", "frame-ancestors 'self'") } };
  };

  // ---------- site público ----------
  const siteBySlug = (slug) => db.prepare('SELECT * FROM sites WHERE slug = ?').get(slug);
  const siteByHost = (host) => (host ? db.prepare('SELECT * FROM sites WHERE domain = ?').get(String(host).split(':')[0].toLowerCase()) : null);
  const tenantOf = (site) => db.prepare('SELECT * FROM tenants WHERE id = ?').get(site.tenant_id);

  function servePublicSite(req, res, site, rest, base) {
    const tenant = tenantOf(site);
    if (!tenant || tenant.status !== 'ativa') return send(res, 404, 'Site não encontrado.');
    if (site.external_url) return send(res, 302, '', { Location: site.external_url });
    const repo = scoped(db, tenant.id);
    const pages = repo.all('pages', { site_id: site.id }, { order: 'position ASC' });
    const siteOrigin = site.domain && !base ? `https://${site.domain}` : app.originOf(tenant.edition);
    if (rest === 'sitemap.xml') return send(res, 200, sitemapXml(siteOrigin, base, pages, app.sitemapExtras.flatMap((fn) => { try { return fn({ site, tenant, repo }) || []; } catch { return []; } })), { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=600' });
    if (rest === 'robots.txt') return send(res, 200, robotsTxt(siteOrigin, base), { 'Cache-Control': 'public, max-age=3600' });
    if (rest === `${app.seo.key(site)}.txt`) return send(res, 200, app.seo.key(site), { 'Cache-Control': 'public, max-age=86400' }); // chave IndexNow
    for (const fn of app.paginasProprias) { // HTML próprio do site (raiz e páginas extras) vence o construtor
      const out = fn({ req, site, tenant, repo, rest, base, origin: siteOrigin });
      if (out) return send(res, out.status, req.method === 'HEAD' ? '' : out.body, out.headers);
    }
    for (const r of app.publicRoutes) {
      const params = r.match(`/${rest}`);
      if (params) return r.handler({ req, res, db, app, site, tenant, repo, base, params, pages, origin: siteOrigin, send });
    }
    if (req.method !== 'GET') return send(res, 405, 'Método não permitido.');
    const slug = String(rest || '').replace(/\/$/, '');
    const page = pages.find((p) => p.slug === slug);
    if (!page || !page.published) return send(res, 404, renderNotFound(site), { 'Content-Type': 'text/html; charset=utf-8' });
    const html = renderPage({ site, page, blocks: parse(page.published, []), tenant, base, origin: siteOrigin, pages });
    return send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': SITE_CSP, 'Cache-Control': 'public, max-age=60' });
  }

  async function submitLead(req, res, siteId) {
    const ip = clientIp(req);
    const json = String(req.headers.accept || '').includes('application/json');
    const raw = await readBody(req, 20_000);
    const body = decodeBody(raw, req.headers['content-type']);
    const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId);
    if (!site) return send(res, 404, { error: 'Site não encontrado.' });
    const tenant = tenantOf(site);
    const back = (ok, msg) => (json ? send(res, ok ? 201 : 400, ok ? { ok: true } : { error: msg })
      : send(res, 303, '', { Location: `/s/${site.slug}/${String(body.page || '').replace(/[^a-z0-9-]/g, '')}?${ok ? 'enviado=1' : 'erro=1'}#contato` }));
    if (body.website) return back(true); // armadilha para robôs: finge sucesso e não grava
    if (!formLimit(`${ip}|${site.id}`)) return back(false, 'Muitos envios. Tente de novo em alguns minutos.');
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email) || email.length > 120) return back(false, 'Confira o e-mail.');
    if (!body.consent) return back(false, 'Marque o consentimento para enviar.');
    const repo = scoped(db, tenant.id);
    const clickId = parseCookies(req.headers.cookie)[cookieName(tenant.slug)] || null;
    const click = clickId ? repo.get('clicks', String(clickId)) : null;
    const fresh = click && (Date.now() - Date.parse(click.created_at)) / 864e5 <= windowDaysOf(tenant);
    const utm = { ...(click ? parse(click.utm, {}) : {}), ...pickUtm(body) };
    if (/^[0-9a-f-]{36}$/.test(String(body.journey_id || '')) && /^[a-h]$/.test(String(body.variant || ''))) Object.assign(utm, { jornada_id: body.journey_id, variante: body.variant }); // teste A/B
    const contactId = upsertContact(db, { email, phone: body.phone, name: body.name }); // base única de clientes
    const lead = repo.insert('leads', { contact_id: contactId, site_id: site.id, page_slug: String(body.page || '').slice(0, 60), email, name: String(body.name || '').trim().slice(0, 80) || null,
      phone: String(body.phone || '').replace(/[^\d+]/g, '').slice(0, 20) || null, utm: JSON.stringify(utm), click_id: fresh ? click.id : null,
      affiliate_id: fresh ? click.affiliate_id : null, consent: 1, stage: 'novo', demo: tenant.demo });
    repo.insert('lead_events', { lead_id: lead.id, kind: 'criado', data: JSON.stringify({ origem: utm.utm_source || (fresh ? 'afiliado' : 'direto'), pagina: lead.page_slug, referer: String(req.headers.referer || '').slice(0, 200) }) });
    for (const fn of app.onLead) { // ganchos de módulo (ex.: e-mail de boas-vindas): rodam depois da resposta e nunca derrubam o envio
      setImmediate(() => { Promise.resolve().then(() => fn({ app, db, tenant, site, repo, lead })).catch((e) => console.error(`[portal] gancho de lead: ${e.message}`)); });
    }
    return back(true);
  }

  function trackClick(req, res, tenantSlug, code, url) {
    const tenant = db.prepare('SELECT * FROM tenants WHERE slug = ?').get(tenantSlug);
    if (!tenant) return send(res, 404, 'Link inválido.');
    const repo = scoped(db, tenant.id);
    const site = repo.all('sites', {}, { order: 'created_at ASC', extra: "status != 'rascunho' OR external_url IS NOT NULL" })[0] || repo.all('sites', {}, { order: 'created_at ASC' })[0];
    const to = String(url.searchParams.get('to') || '').replace(/[^a-z0-9-]/g, '');
    const affiliate = repo.get('affiliates', { code: String(code).toLowerCase() });
    const click = recordClick(repo, affiliate, { siteId: site?.id, landing: to, utm: Object.fromEntries(url.searchParams) });
    const headers = {};
    if (click) headers['Set-Cookie'] = cookie(cookieName(tenant.slug), click.id, { maxAge: windowDaysOf(tenant) * 86400, secure, sameSite: 'Lax' });
    const qs = new URLSearchParams(pickUtm(Object.fromEntries(url.searchParams))).toString();
    const dest = site?.external_url || (site ? `/s/${site.slug}/${to}` : '/');
    headers.Location = `${dest}${qs ? `${dest.includes('?') ? '&' : '?'}${qs}` : ''}`;
    return send(res, 302, '', headers);
  }

  async function conversionHook(req, res, tenantSlug) {
    if (!hookLimit(tenantSlug)) return send(res, 429, { error: 'limite de eventos por minuto' });
    const tenant = db.prepare('SELECT * FROM tenants WHERE slug = ?').get(tenantSlug);
    const raw = await readBody(req, 50_000);
    if (!tenant) return send(res, 404, { error: 'operação não encontrada' });
    const sig = String(req.headers['x-portal-signature'] || '').replace(/^sha256=/, '');
    if (!safeEqualHex(sig, hmac(tenant.webhook_secret, raw))) {
      writeAudit(db, { tenantId: tenant.id, action: 'webhook.assinatura_invalida', data: { ip: clientIp(req) } });
      return send(res, 401, { error: 'assinatura inválida' });
    }
    let payload;
    try { payload = JSON.parse(raw.toString('utf8')); } catch { return send(res, 400, { error: 'JSON inválido' }); }
    try {
      const { created, conversion } = recordConversion(scoped(db, tenant.id), tenant, payload, { verified: true });
      return send(res, created ? 201 : 200, { ok: true, duplicate: !created, id: conversion.id, affiliate: Boolean(conversion.affiliate_id) });
    } catch (e) {
      return send(res, e.status || 500, { error: e.status ? e.message : 'erro interno' });
    }
  }

  function serveStatic(res, file) {
    const full = path.normalize(path.join(PUBLIC, file));
    if (!full.startsWith(PUBLIC) || !fs.existsSync(full) || !fs.statSync(full).isFile()) return send(res, 404, 'Não encontrado.');
    const ext = path.extname(full);
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-store' : 'no-cache', 'X-Content-Type-Options': 'nosniff' };
    if (ext === '.html') Object.assign(headers, { 'Content-Security-Policy': ADMIN_CSP, 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' });
    res.writeHead(200, headers);
    fs.createReadStream(full).pipe(res);
  }

  // ---------- API ----------
  async function handleApi(req, res, url) {
    const route = routes.find((r) => r.method === req.method && r.match(url.pathname));
    if (!route) throw new HttpError(404, 'Rota não encontrada.');
    const params = route.match(url.pathname);
    const raw = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req) : Buffer.alloc(0);
    const body = decodeBody(raw, req.headers['content-type'] || '');
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    const session = readSession(db, token);
    const ed = app.editionFor(req);
    const ctx = { req, res, url, params, query: Object.fromEntries(url.searchParams), body, raw, db, app, edition: ed, origin: ed.origin, user: session?.user || null, csrf: session?.csrf || null };
    if (route.auth !== false) {
      if (!ctx.user) throw new HttpError(401, 'Entre para continuar.');
      if (req.method !== 'GET' && req.headers['x-csrf'] !== session.csrf) throw new HttpError(403, 'Sessão expirada. Recarregue a página.');
    }
    if (route.super && !ctx.user?.is_super) throw new HttpError(403, 'Só o superadministrador pode fazer isso.');
    if (params.tenant) {
      const t = db.prepare('SELECT * FROM tenants WHERE id = ? OR slug = ?').get(params.tenant, params.tenant);
      const role = t ? membership(db, ctx.user, t.id) : null;
      if (!t || (!ctx.user.is_super && !role) || t.edition !== ed.id) throw new HttpError(404, 'Operação não encontrada.'); // não revela operações de outros nem da outra edição
      if (route.perm && !can(ctx.user, role, route.perm)) throw new HttpError(403, 'Seu papel nesta operação não permite isso.');
      ctx.tenant = t;
      ctx.role = role;
      ctx.repo = scoped(db, t.id);
    }
    ctx.audit = (action, target = null, data = {}) => writeAudit(db, { tenantId: ctx.tenant?.id || null, userId: ctx.user?.id || null, action, target, data });
    const out = await route.handler(ctx);
    if (res.headersSent) return;
    if (out && typeof out === 'object' && 'status' in out && 'body' in out) return send(res, out.status, out.body, out.headers);
    return send(res, 200, out ?? { ok: true });
  }

  async function handle(req, res) {
    const url = new URL(req.url, origin);
    try {
      const p = url.pathname;
      if (p === '/healthz') return send(res, 200, { ok: true, at: now() });
      if (p.startsWith('/api/hooks/') && req.method === 'POST') {
        const m = /^\/api\/hooks\/([^/]+)\/conversion\/?$/.exec(p);
        if (m) return await conversionHook(req, res, decodeURIComponent(m[1]));
      }
      if (await mcps[app.editionFor(req).id].handle(req, res, url)) return;
      if (p.startsWith('/api/')) return await handleApi(req, res, url);
      const hostSite = siteByHost(req.headers.host);
      if (hostSite) {
        if (p.startsWith('/assets/')) return serveStatic(res, p.replace('/assets/', 'assets/'));
        if (p.startsWith('/f/') && req.method === 'POST') return await submitLead(req, res, p.slice(3));
        return servePublicSite(req, res, hostSite, p.slice(1), '');
      }
      if (p === '/' ) return send(res, 302, '', { Location: '/admin/' });
      if (p === '/admin' ) return send(res, 302, '', { Location: '/admin/' });
      if (p.startsWith('/admin/')) return serveStatic(res, p === '/admin/' ? 'admin/index.html' : p.slice(1));
      if (p.startsWith('/assets/')) return serveStatic(res, p.slice(1));
      let m = /^\/s\/([a-z0-9-]+)(?:\/(.*))?$/.exec(p);
      if (m && (req.method === 'GET' || (req.method === 'POST' && app.publicRoutes.length))) { // POST só chega às rotas públicas de módulos (ex.: eventos da jornada)
        const site = siteBySlug(m[1]);
        if (!site) return send(res, 404, 'Site não encontrado.');
        if (m[2] === undefined) return send(res, 301, '', { Location: `/s/${m[1]}/${url.search}` });
        return servePublicSite(req, res, site, m[2], `/s/${site.slug}`);
      }
      if ((m = /^\/f\/([0-9a-f-]{36})$/.exec(p)) && req.method === 'POST') return await submitLead(req, res, m[1]);
      if ((m = /^\/r\/([a-z0-9-]+)\/([A-Za-z0-9_-]+)$/.exec(p)) && req.method === 'GET') return trackClick(req, res, m[1], m[2], url);
      // rotas públicas de módulo na raiz: { method, path, editions?: ['sx'], handler }. Edição fora da lista cai no 404 abaixo.
      const ed = app.editionFor(req);
      for (const r of app.rootRoutes) {
        if ((r.method || 'GET') !== req.method || (r.editions && !r.editions.includes(ed.id))) continue;
        const params = r.match(p);
        if (params) return await r.handler({ req, res, url, params, db, app, edition: ed, origin: ed.origin, send });
      }
      return send(res, 404, 'Não encontrado.');
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error('[portal]', req.method, url.pathname, e);
      return send(res, status, { error: status >= 500 ? 'Erro interno. Tente de novo.' : e.message, ...(e.extra || {}) });
    }
  }

  return { app, handle };
}

function renderNotFound(site) {
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Página não encontrada</title><link rel="stylesheet" href="/assets/site.css"><body class="mode-escuro"><main class="b b-text"><div class="wrap narrow"><h1>Página não encontrada</h1><p>Esta página de ${String(site.name).replace(/[<>&"]/g, '')} não existe ou ainda não foi publicada.</p></div></main></body></html>`;
}

/** Primeiro superadmin e o clube 10001 da edição SX (Clube Suprema, site atual em suprema.blog). */
export function seed(db, dataDir, ed = edition()) {
  if (db.prepare('SELECT COUNT(*) n FROM users').get().n) return null;
  const email = (process.env.PORTAL_ADMIN_EMAIL || 'admin@portal.local').toLowerCase();
  const password = process.env.PORTAL_ADMIN_PASSWORD || `${randomBytes(9).toString('base64url')}7k`;
  const u = createUser(db, { email, name: 'Superadministrador', password, isSuper: true });
  if (!process.env.PORTAL_ADMIN_PASSWORD) {
    const f = path.join(dataDir, 'credenciais-iniciais.txt');
    fs.writeFileSync(f, `${ed.name} — primeiro acesso\nE-mail: ${email}\nSenha: ${password}\nTroque a senha depois de entrar.\n`, { mode: 0o600 });
    console.log(`[portal] superadmin criado; credenciais em ${f}`);
  }
  if (!db.prepare("SELECT 1 FROM tenants WHERE slug = 'clube-10001'").get()) {
    createTenant(db, { name: 'Clube Suprema', number: '10001', niche: 'poker', slug: 'clube-10001', externalUrl: 'https://suprema.blog', edition: 'sx',
      settings: { app: 'Suprema Poker', agentId: '1439098', whatsapp: '5511952138293', chipsUrl: 'https://app.fichas24horas.com.br/signup' } }, { userId: u.id });
  }
  return u;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  // PORTAL_PORT aceita várias portas com a edição de cada uma: "3400:geral,3401:sx" (um processo, um banco)
  const portSpec = String(process.env.PORTAL_PORT || process.env.PORT || 3400).split(',').map((s) => s.trim()).filter(Boolean);
  const ports = portSpec.map((s) => Number(s.split(':')[0]));
  const portEditions = Object.fromEntries(portSpec.filter((s) => s.includes(':')).map((s) => [Number(s.split(':')[0]), s.split(':')[1]]));
  const port = ports[0];
  const dataDir = process.env.PORTAL_DATA_DIR || path.join(HERE, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  let secretKey = process.env.PORTAL_SECRET_KEY;
  if (!secretKey) {
    const kf = path.join(dataDir, '.chave-do-cofre');
    if (!fs.existsSync(kf)) fs.writeFileSync(kf, randomBytes(32).toString('base64url'), { mode: 0o600 });
    secretKey = fs.readFileSync(kf, 'utf8').trim();
  }
  const db = openDb(path.join(dataDir, 'portal.db'));
  const ed = edition();
  seed(db, dataDir, ed);
  const origin = process.env.PORTAL_ORIGIN || `http://localhost:${port}`;
  const origins = Object.fromEntries(['geral', 'sx'].map((k) => [k, process.env[`PORTAL_ORIGIN_${k.toUpperCase()}`]]).filter(([, v]) => v));
  // token de serviço: o pesquisador de IA (outra máquina) manda insights com ele. Fica no arquivo da pasta de dados.
  const tf = path.join(dataDir, 'token-servico.txt');
  if (!process.env.PORTAL_SERVICE_TOKEN && !fs.existsSync(tf)) fs.writeFileSync(tf, `pa_svc_${randomBytes(32).toString('base64url')}`, { mode: 0o600 });
  const serviceToken = process.env.PORTAL_SERVICE_TOKEN || fs.readFileSync(tf, 'utf8').trim();
  // tokens antigos ainda aceitos (ex.: o da edição SX quando os bancos foram juntados), um por linha
  const tfx = path.join(dataDir, 'token-servico-extra.txt');
  const serviceTokensExtra = fs.existsSync(tfx) ? fs.readFileSync(tfx, 'utf8').split(/\s+/).filter(Boolean) : [];
  console.log(`[portal] edição padrão ${ed.id}; origens ${JSON.stringify(origins)}; portas ${JSON.stringify(portEditions)}`);
  const { handle, app } = await createApp({ db, origin, secretKey, editionId: ed.id, serviceToken, origins, portEditions });
  app.serviceTokensExtra = serviceTokensExtra;
  const host = process.env.PORTAL_HOST || undefined; // no servidor: 127.0.0.1 (só o túnel e o Caddy chegam)
  // cada porta mostra a origem da própria edição (3401 -> sx.kbsa.app), não a origem padrão
  const origemDa = (p) => (portEditions[p] && origins?.[portEditions[p]]) || origin;
  for (const p of ports) http.createServer(handle).listen(p, host, () => console.log(`[portal] no ar em ${origemDa(p)} (painel: ${origemDa(p)}/admin/) · ouvindo ${host || 'todas as interfaces'}:${p}${portEditions[p] ? ` (${portEditions[p]})` : ''}`));
}
