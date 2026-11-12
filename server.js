// Servidor da LP: entrega a página e a API do cadastro único. Sem dependências: `node server.js`.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, testMode } from './config.js';
import { store } from './lib/store.js';
import * as flow from './lib/orchestrator.js';
import { createLead, recordLeadEvent, leadsOverview } from './lib/leads.js';
import { validateSignup, validateLead } from './public/shared/validate.js';
import { comBigLinks } from './lib/biglinks.js';
import { renderBlogIndex, renderBlogPost, renderNotFound, renderSitemap, renderFeed, renderLlms, renderLlmsFull, renderAbout, renderTorneios, renderTorneiosTxt } from './lib/blog.js';
import { getGrade } from './lib/torneios.js';
import { announceNewPosts, shareNewPosts, shareDailyGrade } from './lib/novos-posts.js';
import { startBot, botStatus } from './lib/telegram-bot.js';

const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 20_000) throw new HttpError(413, 'Dados grandes demais.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

// Atrás de túnel ou hospedagem (Cloudflare, Railway, Render), o visitante chega pelo proxy:
// o IP real vem nos cabeçalhos, e a conexão parece local mesmo sem ser.
const PROXY_HEADERS = ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip', 'forwarded'];
const viaProxy = (req) => PROXY_HEADERS.some((h) => req.headers[h]);

function clientIp(req) {
  const forwarded = req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress;
}

const isLoopback = (req) => !viaProxy(req) && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

function requireAdmin(req, url) {
  if (config.adminToken) {
    const token = req.headers['x-admin-token'] || url.searchParams.get('token');
    if (token !== config.adminToken) throw new HttpError(401, 'Token do painel inválido.');
  } else if (!isLoopback(req)) {
    throw new HttpError(403, 'O painel só abre neste computador. Defina ADMIN_TOKEN para liberar em outros.');
  }
}

const hits = new Map();
function rateLimit(req, key, limit, windowMs = 60_000) {
  const id = `${key}:${clientIp(req)}`;
  const nowMs = Date.now();
  const recent = (hits.get(id) || []).filter((t) => nowMs - t < windowMs);
  if (recent.length >= limit) throw new HttpError(429, 'Muitas tentativas. Espere um minuto e tente de novo.');
  recent.push(nowMs);
  hits.set(id, recent);
}

function signupOr404(id) {
  const signup = store.getSignup(id);
  if (!signup) throw new HttpError(404, 'Cadastro não encontrado.');
  return signup;
}

const cleanUtm = (utm) => Object.fromEntries(
  Object.entries(utm ?? {}).filter(([, v]) => typeof v === 'string').slice(0, 12).map(([k, v]) => [k.slice(0, 40), v.slice(0, 200)]),
);

const publicConfig = () => ({
  flow: config.flow,
  club: config.club,
  supportWhatsapp: config.supportWhatsapp,
  deposit: config.deposit,
  links: config.links,
  f24h: { guided: config.modes.fichas24h === 'guiado', clubName: config.fichas24h.clubName, signupUrl: config.fichas24h.signupUrl, homeUrl: config.fichas24h.homeUrl },
  tracking: config.tracking,
  testMode,
});

const routes = [
  ['GET', /^\/api\/config$/, () => publicConfig()],
  ['GET', /^\/api\/robo$/, () => botStatus()],

  ['POST', /^\/api\/lead$/, async ({ req }) => {
    rateLimit(req, 'lead', 10);
    const body = await readJson(req);
    const { ok, errors, data } = validateLead(body);
    if (!ok) throw new HttpError(422, 'Confira os campos destacados.', { errors });
    const lead = createLead(data, { utm: cleanUtm(body.utm) });
    return [201, { id: lead.id, email: lead.email }];
  }],

  ['POST', /^\/api\/lead\/([\w-]+)\/event$/, async ({ req, params }) => {
    rateLimit(req, 'lead-event', 60);
    const { type } = await readJson(req);
    if (!/^[\w-]{10,64}$/.test(params[0]) || !recordLeadEvent(params[0], type)) throw new HttpError(404, 'Não encontrado.');
    return { ok: true };
  }],

  ['POST', /^\/api\/signup$/, async ({ req }) => {
    rateLimit(req, 'signup', 10);
    const body = await readJson(req);
    const { ok, errors, data } = validateSignup(body);
    if (!ok) throw new HttpError(422, 'Confira os campos destacados.', { errors });
    const signup = flow.createSignup(data, { utm: cleanUtm(body.utm) });
    return [201, flow.publicSignup(signup)];
  }],

  ['GET', /^\/api\/signup\/([\w-]+)$/, ({ params }) => flow.publicSignup(signupOr404(params[0]))],

  ['POST', /^\/api\/signup\/([\w-]+)\/email-code$/, async ({ req, params }) => {
    rateLimit(req, 'code', 15);
    signupOr404(params[0]);
    const { code } = await readJson(req);
    const result = await flow.submitEmailCode(params[0], code);
    if (!result.ok) throw new HttpError(400, result.error);
    return result;
  }],

  ['POST', /^\/api\/signup\/([\w-]+)\/resend-code$/, async ({ req, params }) => {
    rateLimit(req, 'resend', 5);
    signupOr404(params[0]);
    const result = await flow.resendEmailCode(params[0]);
    if (!result.ok) throw new HttpError(400, result.error);
    return result;
  }],

  ['POST', /^\/api\/signup\/([\w-]+)\/suprema-id$/, async ({ req, params }) => {
    rateLimit(req, 'sid', 10);
    signupOr404(params[0]);
    const { supremaId } = await readJson(req);
    const result = await flow.submitSupremaId(params[0], supremaId);
    if (!result.ok) throw new HttpError(400, result.error);
    return result;
  }],

  ['POST', /^\/api\/signup\/([\w-]+)\/f24h-code$/, async ({ req, params }) => {
    rateLimit(req, 'f24h-code', 15);
    signupOr404(params[0]);
    const { code } = await readJson(req);
    const result = await flow.submitF24hCode(params[0], code);
    if (!result.ok) throw new HttpError(400, result.error);
    return result;
  }],

  ['POST', /^\/api\/signup\/([\w-]+)\/f24h-resend$/, async ({ req, params }) => {
    rateLimit(req, 'f24h-resend', 5);
    signupOr404(params[0]);
    const result = await flow.resendF24hCode(params[0]);
    if (!result.ok) throw new HttpError(400, result.error);
    return result;
  }],

  ['POST', /^\/api\/signup\/([\w-]+)\/validation$/, async ({ req, params }) => {
    rateLimit(req, 'validation', 10);
    signupOr404(params[0]);
    const { value } = await readJson(req);
    const result = await flow.submitValidationValue(params[0], value);
    if (!result.ok) throw new HttpError(400, result.error);
    return result;
  }],

  ['POST', /^\/api\/signup\/([\w-]+)\/payer$/, async ({ req, params }) => {
    rateLimit(req, 'payer', 10);
    signupOr404(params[0]);
    const result = flow.submitPayer(params[0], await readJson(req));
    if (result.errors) throw new HttpError(422, 'Confira os campos destacados.', { errors: result.errors });
    if (!result.ok) throw new HttpError(400, result.error);
    return result;
  }],

  ['POST', /^\/api\/signup\/([\w-]+)\/retry$/, ({ params }) => {
    signupOr404(params[0]);
    const result = flow.retry(params[0]);
    if (!result.ok) throw new HttpError(400, result.error);
    return result;
  }],

  ['POST', /^\/api\/signup\/([\w-]+)\/deposit$/, async ({ req, params }) => {
    rateLimit(req, 'deposit', 12);
    signupOr404(params[0]);
    const { amount } = await readJson(req);
    const result = await flow.createDeposit(params[0], amount);
    if (!result.ok) throw new HttpError(400, result.error);
    return [201, result.deposit];
  }],

  ['GET', /^\/api\/signup\/([\w-]+)\/deposits$/, ({ params }) => {
    signupOr404(params[0]);
    return store.depositsOf(params[0]).map(flow.publicDeposit);
  }],

  ['GET', /^\/api\/deposit\/([\w-]+)$/, async ({ params }) => {
    const deposit = await flow.refreshDeposit(params[0]);
    if (!deposit) throw new HttpError(404, 'Depósito não encontrado.');
    return flow.publicDeposit(deposit);
  }],

  ['POST', /^\/api\/deposit\/([\w-]+)\/simulate-paid$/, ({ params }) => {
    if (!testMode) throw new HttpError(404, 'Não encontrado.');
    if (!flow.simulateDepositPaid(params[0])) throw new HttpError(400, 'Não foi possível simular este pagamento.');
    return { ok: true };
  }],

  ['GET', /^\/api\/admin\/overview$/, ({ req, url }) => {
    requireAdmin(req, url);
    return { mode: config.flow, ...flow.adminOverview(), leads: leadsOverview() };
  }],

  ['POST', /^\/api\/admin\/signups\/([\w-]+)\/retry$/, ({ req, url, params }) => {
    requireAdmin(req, url);
    signupOr404(params[0]);
    const result = flow.retry(params[0]);
    if (!result.ok) throw new HttpError(400, result.error);
    return result;
  }],
];

// Link único do app (/baixar): cada aparelho vai para o lugar certo.
// Celular -> link oficial do clube (abre o app ou a loja já com clube e agente).
// Windows -> download para Windows. Mac/Linux -> site oficial com todas as opções.
function appTarget(userAgent) {
  const ua = String(userAgent || '');
  if (/android/i.test(ua)) return ['android', config.links.clubInvite];
  if (/iphone|ipad|ipod/i.test(ua)) return ['ios', config.links.clubInvite];
  if (/windows/i.test(ua)) return ['desktop', config.links.windows];
  return ['desktop', config.links.apk];
}

function redirectToApp(req, res, url) {
  const [platform, target] = appTarget(req.headers['user-agent']);
  const leadId = url.searchParams.get('l');
  if (leadId && /^[\w-]{10,64}$/.test(leadId)) {
    recordLeadEvent(leadId, 'invite_click');
    recordLeadEvent(leadId, `app_${platform}`);
  }
  res.writeHead(302, { Location: target, 'Cache-Control': 'no-store' });
  res.end();
}

function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400);
    return res.end();
  }
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/admin') pathname = '/admin.html';
  // Versões da LP com motion sempre ligado: /fichas (ficha 3D) e /spin (rolo do Spin Suprema)
  if (/^[/](fichas|spin)$/.test(pathname)) pathname = '/index.html';
  const file = path.join(PUBLIC_DIR, path.normalize(pathname));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(renderNotFound());
    }
    // Fontes não mudam de nome; imagens podem ser refeitas com o mesmo nome (cache de 30 dias). HTML, CSS e JS sempre revalidam.
    const cache = pathname.startsWith('/fonts/') ? 'public, max-age=31536000, immutable'
      : pathname.startsWith('/img/') ? 'public, max-age=2592000, stale-while-revalidate=86400'
        : 'no-cache';
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': cache });
    // páginas do site ganham o contador de visitas; o painel (admin.html) e a verificação do Google não
    const pagina = path.extname(file) === '.html' && !/^[/](admin|google[0-9a-f]+)\.html$/.test(pathname);
    res.end(pagina ? comVisitas(buf.toString('utf8'), url.pathname) : buf);
  });
}

// Contador de visitas sem cookie do Portal (portal/lib/modules/visitas.mjs, pedido do Kbsa em 09/11/2026: "liga").
// Script inline de ~650 bytes, depois do "load": manda um sendBeacon para /pa/v, que este servidor repassa ao Portal no mesmo Bigue.
// Sem cookie, sem IP gravado; o GA4 e o Clarity continuam como estão.
const PORTAL_VISITAS = process.env.PORTAL_VISITAS_URL || 'http://127.0.0.1:3400/pa/v';
const SCRIPT_VISITAS = '<script>(function(){var n=navigator,d=document,l=location,K="suprema.blog",E="/pa/v";if(n.webdriver||d.visibilityState=="prerender")return;'
  + 'function s(t,x){var q=new URLSearchParams(l.search),j=JSON.stringify({k:K,t:t,p:l.pathname,r:t=="v"?d.referrer:"",'
  + 'u:[q.get("utm_source"),q.get("utm_medium"),q.get("utm_campaign")],w:innerWidth,x:x});'
  + 'try{n.sendBeacon?n.sendBeacon(E,j):fetch(E,{method:"POST",body:j,keepalive:!0})}catch(_){}}'
  + 'function v(){setTimeout(function(){s("v")},400)}d.readyState=="complete"?v():addEventListener("load",v);'
  + 'd.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");'
  + 'a&&a.host&&a.host!=l.host&&/^http/.test(a.protocol)&&s("c",(a.host+a.pathname).slice(0,120))},!0)})()</script>';
// Minilytics (mini.kbsa.app, fork sem cookie, pedido do Kbsa 09/11/2026): tag defer com o id do suprema.blog.
const SCRIPT_MINILYTICS = '<script defer data-website-id="94260f12380fdbaa" src="https://mini.kbsa.app/js/script.js"></script>';
// BigLinks na saída (lib/biglinks.js): botões de conversão por l.kbsa.app com src=suprema_<página>.
const comVisitas = (html, pathname = '/') => {
  const s = comBigLinks(html, pathname);
  const i = s.toLowerCase().lastIndexOf('</body>');
  const tags = SCRIPT_VISITAS + SCRIPT_MINILYTICS;
  return i < 0 ? s + tags : s.slice(0, i) + tags + s.slice(i);
};

async function repassarVisita(req, res) {
  res.writeHead(204, { 'Cache-Control': 'no-store' });
  res.end();
  try {
    const chunks = [];
    let size = 0;
    for await (const c of req) { size += c.length; if (size > 4000) return; chunks.push(c); }
    const h = { 'Content-Type': 'text/plain;charset=UTF-8', 'User-Agent': String(req.headers['user-agent'] || '') };
    if (req.headers.origin) h.Origin = String(req.headers.origin);
    h['CF-Connecting-IP'] = String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '');
    if (req.headers['cf-ipcountry']) h['CF-IPCountry'] = String(req.headers['cf-ipcountry']);
    await fetch(PORTAL_VISITAS, { method: 'POST', headers: h, body: Buffer.concat(chunks), signal: AbortSignal.timeout(3000) });
  } catch { /* o Portal fora do ar não pode afetar a LP */ }
}

// Páginas geradas no servidor: blog, sitemap, feed e llms.txt (ver lib/blog.js).
function servePage(req, res, url) {
  const send = (body, type, status = 200, cache = 'public, max-age=300') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': cache });
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  };
  const html = (body, status) => send(comVisitas(body, url.pathname), 'text/html; charset=utf-8', status);
  const p = url.pathname;
  if (p === '/blog') return html(renderBlogIndex());
  if (p === '/blog/feed.xml') return send(renderFeed(), 'application/rss+xml; charset=utf-8');
  if (p === '/sitemap.xml') return send(renderSitemap(), 'application/xml; charset=utf-8');
  if (p === '/sobre') return html(renderAbout());
  if (p === '/llms.txt') return send(renderLlms(), 'text/plain; charset=utf-8');
  if (p === '/llms-full.txt') return send(renderLlmsFull(), 'text/plain; charset=utf-8');
  const post = p.match(/^[/]blog[/]([a-z0-9-]+)$/);
  if (post) {
    const page = renderBlogPost(post[1]);
    return page ? html(page) : html(renderNotFound(), 404);
  }
  return false;
}

// Grade de torneios da Liga Suprema (lib/torneios.js guarda 10 min em memória); cache curto porque o "late aberto" muda.
async function serveTorneios(req, res, txt = false) {
  const grade = await getGrade();
  const page = txt ? renderTorneiosTxt(grade) : renderTorneios(grade);
  res.writeHead(200, { 'Content-Type': txt ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=120' });
  res.end(req.method === 'HEAD' ? undefined : (txt ? page : comVisitas(page, '/torneios')));
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Base fixa e uma barra só no começo: "//" ou um Host estranho faziam o new URL quebrar e derrubar o servidor.
  let url;
  try {
    url = new URL(req.url.replace(/^[/]{2,}/, '/'), 'http://localhost');
  } catch {
    res.writeHead(400);
    return res.end();
  }

  if (req.method === 'POST' && url.pathname === '/pa/v') return repassarVisita(req, res);
  if (!url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      return res.end();
    }
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(req.method === 'HEAD' ? undefined : 'ok');
    }
    // Um endereço só por página: sem barra no fim e sem /index.html (a busca e as UTMs vão junto).
    const canonicalPath = url.pathname === '/index.html' ? '/'
      : url.pathname.length > 1 && url.pathname.endsWith('/') ? url.pathname.replace(/[/]+$/, '') || '/' : null;
    if (canonicalPath) {
      res.writeHead(301, { Location: canonicalPath + url.search, 'Cache-Control': 'public, max-age=86400' });
      return res.end();
    }
    if (url.pathname === '/baixar') return redirectToApp(req, res, url);
    if (url.pathname === '/torneios') return serveTorneios(req, res);
    if (url.pathname === '/torneios.txt') return serveTorneios(req, res, true);
    if (servePage(req, res, url)) return;
    return serveStatic(req, res, url);
  }

  // Na versão convite, as rotas do cadastro completo ficam desligadas.
  const fullFlowRoute = /^\/api\/(signup|deposit)(\/|$)/.test(url.pathname);
  const route = (!fullFlowRoute || config.flow === 'completo') && routes.find(([method, re]) => method === req.method && re.test(url.pathname));
  if (!route) return sendJson(res, 404, { error: 'Rota não encontrada.' });

  try {
    const params = url.pathname.match(route[1]).slice(1);
    const out = await route[2]({ req, res, url, params });
    const [status, body] = Array.isArray(out) && typeof out[0] === 'number' ? out : [200, out];
    sendJson(res, status, body);
  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message, ...err.extra });
    console.error(err);
    sendJson(res, 500, { error: 'Erro inesperado. Tente de novo em instantes.' });
  }
});

server.listen(config.port, config.host, () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  console.log('');
  console.log(`  LP:      http://localhost:${config.port}`);
  if (lan) console.log(`  Celular: http://${lan}:${config.port}  (mesma rede Wi-Fi)`);
  console.log(`  Painel:  http://localhost:${config.port}/admin`);
  if (config.flow === 'convite') {
    console.log('  Fluxo:   convite (e-mail + link oficial do clube + Fichas 24h)');
  } else {
    console.log(`  Fluxo:   completo · Suprema=${config.modes.suprema} · Fichas 24h=${config.modes.fichas24h}${testMode ? '  (TESTE: nada é criado de verdade)' : ''}`);
  }
  console.log('');
});

// Plano free do Render: o serviço dorme após 15 min sem visitas e a 1ª visita seguinte espera 20 s a 1 min.
// O servidor visita o próprio endereço público a cada 10 min para não dormir. RENDER_EXTERNAL_URL vem do Render;
// fora dele (localhost) fica desligado.
const keepAliveUrl = process.env.KEEPALIVE_URL || process.env.RENDER_EXTERNAL_URL;
if (keepAliveUrl) {
  setInterval(() => fetch(new URL('/healthz', keepAliveUrl)).catch(() => {}), 10 * 60 * 1000).unref();
}

// Depois de cada deploy (no Render, ou no Bigue com TAREFAS_FUNDO=1): IndexNow dos posts novos/atualizados e post novo no Telegram e no Bluesky.
// Espera 1 min para o endereço público já responder com a versão nova.
if (config.tarefasFundo) {
  setTimeout(() => announceNewPosts().catch((err) => console.warn(`[novos-posts] ${err.message}`)), 60_000).unref();
  setInterval(() => shareNewPosts().catch((err) => console.warn(`[novos-posts] ${err.message}`)), 30 * 60_000).unref();
  // Grade de torneios: a partir das 9h, 1 vez por dia (IndexNow, Telegram e Bluesky). Confere a cada 10 min.
  setTimeout(() => shareDailyGrade().catch((err) => console.warn(`[novos-posts] grade: ${err.message}`)), 90_000).unref();
  setInterval(() => shareDailyGrade().catch((err) => console.warn(`[novos-posts] grade: ${err.message}`)), 10 * 60_000).unref();
  // Robô dos grupos: /torneios, /clube e a grade das 9h em quem adicionar (lib/telegram-bot.js).
  startBot();
}
