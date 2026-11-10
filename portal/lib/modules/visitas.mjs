// Contador de visitas próprio, sem cookie, para os 12 sites (10 blogs, hotpoker.club e suprema.blog). Pedido do Kbsa em 09/11/2026: "liga".
// Modelo do Plausible: nada de cookie, de IP gravado nem de identificador que dure mais que o dia. O visitante único é um hash de
// IP + navegador + site + dia, com um sal que troca todo dia e só existe na memória do processo (nunca vai para o disco).
// Por isso não precisa do aviso de cookies da LGPD, e o GA4 (que depende do aceite) continua como está, sem mudança.
//
// Como funciona:
//   1. montar() (paginas.mjs) põe no fim da página um script inline de ~650 bytes (scriptVisitas). Ele espera o "load" e manda um
//      navigator.sendBeacon para <base>/pa/v. Clique em link para fora do site manda outro beacon (tipo "c"), para o funil.
//   2. server.mjs passa todo POST que termina em /pa/v para app.registrarVisita (aqui), antes de qualquer outra rota.
//   3. Robô não conta: User-Agent de robô ou de navegador sem tela, curl e afins são descartados; sem beacon JS também não há linha.
//      A nossa rede (189.97.25.183 e 192.168.16.x) é gravada com interno = 1 e fica fora das contas do painel.
//   4. A cada 10 min o processo grava <dados>/visitas-resumo.json (ontem e hoje), que o relatório das 8h lê.
// Painel: /admin/#/m/visitas (só o superadministrador), com o funil visita → clique → venda (vendas pelo resumo do BigLinks).
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { readBody, rateLimiter, clientIp, send } from '../http.mjs';

export const nav = { id: 'visitas', label: 'Visitas (sem cookie)', perm: 'tenant.manage' };

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS visitas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  criado_em TEXT NOT NULL,          -- ISO em UTC
  dia TEXT NOT NULL,                -- AAAA-MM-DD no horário de Brasília
  site TEXT NOT NULL,               -- domínio do site (fornecedores.blog, hotpoker.club, suprema.blog, kbsa.app/milhas)
  tipo TEXT NOT NULL DEFAULT 'v',   -- v = visita (página vista) · c = clique em link para fora do site
  caminho TEXT NOT NULL,
  destino TEXT,                     -- só no clique: domínio + caminho do link (ex.: l.kbsa.app/ck-prime-box-pro)
  referer TEXT,                     -- só o domínio de quem mandou o visitante; vazio = direto
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT,
  aparelho TEXT,                    -- celular | tablet | computador
  pais TEXT,                        -- CF-IPCountry do Cloudflare
  visitante TEXT,                   -- hash do dia (sal diário que nunca é gravado); não liga dias diferentes
  interno INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS visitas_dia_site ON visitas (dia, site, tipo);
`;

// ---------------------------------------------------------------- filtros

/** Robôs, navegadores sem tela e ferramentas (inclusive as das nossas sessões: Lighthouse, Playwright, curl, python). */
export const UA_ROBO = /bot\b|bot[/;)-]|crawl|spider|slurp|yandex|bingpreview|mediapartners|adsbot|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|headless|phantom|selenium|puppeteer|playwright|webdriver|curl|wget|python|aiohttp|httpx|node-fetch|undici|axios|go-http|java\/|okhttp|libwww|httpclient|scrapy|facebookexternalhit|whatsapp|telegrambot|preview|embedly|quora link|vkshare|w3c_validator|dataprovider|ahrefs|semrush|mj12|petalbot|bytespider|gptbot|claudebot|ccbot|perplexity|^mozilla\/5\.0$/i;
export const ehRobo = (ua) => { const u = String(ua || '').trim(); return u.length < 20 || UA_ROBO.test(u.replace(/cubot/gi, '')); }; // Cubot é marca de celular

/** IP da nossa rede: o IP público do escritório e a rede local do Bigue/PC GPT (e o próprio servidor). */
export const REDE_INTERNA = ['189.97.25.183'];
export const ehInterno = (ip) => {
  const i = String(ip || '').replace(/^::ffff:/, '');
  return !i || REDE_INTERNA.includes(i) || /^192\.168\.16\./.test(i) || /^127\./.test(i) || i === '::1';
};

export const aparelhoDe = (ua, largura) => {
  const u = String(ua || '');
  if (/iPad|Tablet|PlayBook|Silk|Kindle|(Android(?!.*Mobile))/i.test(u)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Windows Phone|Opera Mini/i.test(u)) return 'celular';
  if (Number(largura) > 0 && Number(largura) < 600) return 'celular';
  return 'computador';
};

const semWww = (h) => String(h || '').toLowerCase().replace(/^www\./, '');
/** Só o domínio de quem mandou (nunca o caminho nem a busca): "https://www.google.com/search?q=x" → "google.com". */
export const dominioDe = (ref) => { try { const u = new URL(String(ref)); return /^https?:$/.test(u.protocol) || u.protocol === 'android-app:' ? semWww(u.hostname) : null; } catch { return null; } };

// ---------------------------------------------------------------- dia, sal e hash

const FUSO = 'America/Sao_Paulo';
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
export const diaDe = (d = new Date()) => fmtDia.format(d); // AAAA-MM-DD em Brasília
const sais = new Map(); // dia -> sal; só na memória. Reiniciar o servidor troca o sal (o mesmo visitante pode contar 2 vezes no dia).
function salDo(dia) {
  if (!sais.has(dia)) { sais.set(dia, randomBytes(32)); for (const k of sais.keys()) if (k < dia) sais.delete(k); }
  return sais.get(dia);
}
export const hashVisitante = (ip, ua, site, dia) => createHash('sha256').update(salDo(dia)).update(`${ip}|${ua}|${site}|${dia}`).digest('hex').slice(0, 16);

// ---------------------------------------------------------------- script do navegador

/** Chave do site e endereço do beacon. "kbsa.app/milhas" manda para /milhas/pa/v (o Caddy reescreve para /s/<slug>/...). */
export function chaveDoSite(site) {
  if (!site || typeof site !== 'object') return null;
  const dom = String(site.domain || '').toLowerCase();
  if (dom) { const m = /^([a-z0-9.-]+)(\/[a-z0-9-]+)?$/.exec(dom); if (m) return { chave: m[1] + (m[2] || ''), base: m[2] || '' }; }
  if (site.slug && /^[a-z0-9-]+$/.test(site.slug)) return { chave: `s/${site.slug}`, base: `/s/${site.slug}` };
  return null;
}

/** Script inline (< 1 KB), executado só depois do "load": não pesa no carregamento nem na nota do PageSpeed. */
export function scriptVisitas(chave, endpoint = '/pa/v') {
  const k = JSON.stringify(String(chave)).replace(/</g, '\\u003c');
  const e = JSON.stringify(String(endpoint)).replace(/</g, '\\u003c');
  return `<script>(function(){var n=navigator,d=document,l=location,K=${k},E=${e};if(n.webdriver||d.visibilityState=="prerender")return;`
    + 'function s(t,x){var q=new URLSearchParams(l.search),j=JSON.stringify({k:K,t:t,p:l.pathname,r:t=="v"?d.referrer:"",'
    + 'u:[q.get("utm_source"),q.get("utm_medium"),q.get("utm_campaign")],w:innerWidth,x:x});'
    + 'try{n.sendBeacon?n.sendBeacon(E,j):fetch(E,{method:"POST",body:j,keepalive:!0})}catch(_){}}'
    + 'function v(){setTimeout(function(){s("v")},400)}d.readyState=="complete"?v():addEventListener("load",v);'
    + 'd.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");'
    + 'a&&a.host&&a.host!=l.host&&/^http/.test(a.protocol)&&s("c",(a.host+a.pathname).slice(0,120))},!0)})()</script>';
}

/** Tag pronta para o site (vazia quando o site não tem domínio nem slug). Usada por montar() em paginas.mjs. */
export function tagVisitas(site) {
  const c = chaveDoSite(site);
  return c ? scriptVisitas(c.chave, `${c.base}/pa/v`) : '';
}

// ---------------------------------------------------------------- registro

const limite = rateLimiter(120, 60_000);
const descartes = { robo: 0, origem: 0, invalido: 0, limite: 0 }; // desde que o processo subiu (só na memória)
const corta = (v, n) => { const s = String(v ?? '').trim(); return s ? s.slice(0, n) : null; };
const limpaUtm = (v) => { const s = corta(v, 80); return s ? s.toLowerCase().replace(/[^\w.:+-]+/g, '_') : null; };

/** Domínios aceitos: os sites do banco (domain), suprema.blog e as chaves s/<slug>; renovado a cada 5 min. */
function aceitos(db) {
  const agora = Date.now();
  if (aceitos.cache && agora - aceitos.em < 300_000) return aceitos.cache;
  const set = new Set(['suprema.blog']);
  try {
    for (const s of db.prepare('SELECT slug, domain FROM sites').all()) {
      const c = chaveDoSite(s);
      if (c) set.add(c.chave);
      if (s.slug) set.add(`s/${s.slug}`);
    }
  } catch { /* banco sem a tabela sites (teste) */ }
  aceitos.cache = set; aceitos.em = agora;
  return set;
}

/** POST <qualquer base>/pa/v. Responde sempre 204 (o navegador não espera nada) e só grava o que passar nos filtros. */
export async function registrarVisita(db, req, res, { agora = new Date() } = {}) {
  const fim = () => send(res, 204, '', { 'Cache-Control': 'no-store' });
  let corpo;
  try { corpo = JSON.parse((await readBody(req, 4000)).toString('utf8') || '{}'); } catch { descartes.invalido++; return fim(); }
  const ua = String(req.headers['user-agent'] || '');
  if (ehRobo(ua)) { descartes.robo++; return fim(); }
  const chave = String(corpo?.k || '').toLowerCase();
  const tipo = corpo?.t === 'c' ? 'c' : corpo?.t === 'v' ? 'v' : null;
  if (!tipo || !aceitos(db).has(chave)) { descartes.invalido++; return fim(); }
  // o beacon do navegador sempre manda Origin; curl e robôs de formulário não. O domínio tem de ser o do site (ou o host do prefixo).
  const host = chave.startsWith('s/') ? null : chave.split('/')[0];
  const origem = dominioDe(req.headers.origin);
  if (!origem || (host && origem !== semWww(host))) { descartes.origem++; return fim(); }
  const ip = clientIp(req);
  if (!limite(ip)) { descartes.limite++; return fim(); }
  const dia = diaDe(agora);
  const caminho = (corta(String(corpo.p || '/').split('?')[0], 200) || '/').replace(/[^\w\-./~%]/g, '');
  let referer = tipo === 'v' ? dominioDe(corpo.r) : null;
  if (referer && (referer === origem || referer === semWww(host))) referer = '(interno)';
  const u = Array.isArray(corpo.u) ? corpo.u : [];
  const pais = /^[A-Z]{2}$/.test(String(req.headers['cf-ipcountry'] || '')) && !['XX', 'T1'].includes(req.headers['cf-ipcountry']) ? req.headers['cf-ipcountry'] : null;
  db.prepare(`INSERT INTO visitas (criado_em, dia, site, tipo, caminho, destino, referer, utm_source, utm_medium, utm_campaign, aparelho, pais, visitante, interno)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    agora.toISOString(), dia, chave, tipo, caminho, tipo === 'c' ? corta(String(corpo.x || '').replace(/[^\w\-./~%]/g, ''), 120) : null,
    referer, limpaUtm(u[0]), limpaUtm(u[1]), limpaUtm(u[2]), aparelhoDe(ua, corpo.w), pais,
    hashVisitante(ip, ua, chave, dia), ehInterno(ip) ? 1 : 0);
  return fim();
}

// ---------------------------------------------------------------- relatório

const LINK_AFILIADO = "destino LIKE 'l.kbsa.app/%'";

/** Números de um período [de, ate] (dias AAAA-MM-DD), sem a rede interna. */
export function relatorio(db, de, ate) {
  const q = (sql, ...a) => db.prepare(sql).all(de, ate, ...a);
  const w = 'dia BETWEEN ? AND ? AND interno = 0';
  const porDia = q(`SELECT dia, SUM(tipo='v') visitas, COUNT(DISTINCT CASE WHEN tipo='v' THEN visitante END) visitantes,
      SUM(tipo='c' AND ${LINK_AFILIADO}) cliques, SUM(tipo='c') saidas FROM visitas WHERE ${w} GROUP BY dia ORDER BY dia DESC`);
  const porSite = q(`SELECT site, SUM(tipo='v') visitas, COUNT(DISTINCT CASE WHEN tipo='v' THEN dia || visitante END) visitantes,
      SUM(tipo='c' AND ${LINK_AFILIADO}) cliques, SUM(tipo='c') saidas FROM visitas WHERE ${w} GROUP BY site ORDER BY visitas DESC`);
  const porPost = q(`SELECT site, caminho, SUM(tipo='v') visitas, COUNT(DISTINCT CASE WHEN tipo='v' THEN dia || visitante END) visitantes,
      SUM(tipo='c' AND ${LINK_AFILIADO}) cliques FROM visitas WHERE ${w} GROUP BY site, caminho ORDER BY visitas DESC, cliques DESC LIMIT 30`);
  const origens = q(`SELECT COALESCE(utm_source, referer, '(direto)') origem, SUM(tipo='v') visitas FROM visitas WHERE ${w} AND tipo='v'
      GROUP BY 1 ORDER BY 2 DESC LIMIT 15`);
  const aparelhos = q(`SELECT COALESCE(aparelho,'?') aparelho, COUNT(*) visitas FROM visitas WHERE ${w} AND tipo='v' GROUP BY 1 ORDER BY 2 DESC`);
  const paises = q(`SELECT COALESCE(pais,'?') pais, COUNT(*) visitas FROM visitas WHERE ${w} AND tipo='v' GROUP BY 1 ORDER BY 2 DESC LIMIT 10`);
  const destinos = q(`SELECT destino, COUNT(*) cliques FROM visitas WHERE ${w} AND tipo='c' GROUP BY 1 ORDER BY 2 DESC LIMIT 15`);
  const [tot] = q(`SELECT SUM(tipo='v') visitas, COUNT(DISTINCT CASE WHEN tipo='v' THEN dia || site || visitante END) visitantes,
      SUM(tipo='c' AND ${LINK_AFILIADO}) cliques, SUM(tipo='c') saidas FROM visitas WHERE ${w}`);
  const [internas] = db.prepare("SELECT SUM(tipo='v') visitas FROM visitas WHERE dia BETWEEN ? AND ? AND interno = 1").all(de, ate);
  const n = (x) => Number(x || 0);
  return {
    de, ate,
    total: { visitas: n(tot?.visitas), visitantes: n(tot?.visitantes), cliques: n(tot?.cliques), saidas: n(tot?.saidas) },
    internas: n(internas?.visitas),
    porDia, porSite, porPost, origens, aparelhos, paises, destinos,
  };
}

const somaDias = (dia, n) => { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ---------------------------------------------------------------- BigLinks (cliques aceitos e vendas pelo sck)

const lerArq = (f) => { try { return fs.readFileSync(f, 'utf8').trim(); } catch { return ''; } };
const cacheBl = new Map();
/** Resumo do BigLinks no período (cliques aceitos, pedidos atribuídos pelo sck/click_id, receita). null quando não há chave/acesso. */
export async function resumoBigLinks(app, de, ate) {
  const chave = lerArq(process.env.BIGLINKS_CHAVE_ARQUIVO || 'D:/biglinks-chave.txt');
  if (!chave) return { ok: false, motivo: 'sem chave do BigLinks neste servidor' };
  const k = `${de}|${ate}`;
  const c = cacheBl.get(k);
  if (c && Date.now() - c.em < 600_000) return c.v;
  const api = (process.env.BIGLINKS_API || 'https://kbsa.app/biglinks/api/v1').replace(/\/$/, '');
  let v;
  try {
    const r = await (app.fetchImpl || fetch)(`${api}/analytics?de=${de}&ate=${ate}`, { headers: { Authorization: `Bearer ${chave}` }, signal: AbortSignal.timeout(6000) });
    const j = await r.json().catch(() => null);
    if (r.status !== 200 || !j?.dados?.resumo) v = { ok: false, motivo: `BigLinks respondeu ${r.status}${j?.erro?.codigo ? ` (${j.erro.codigo})` : ''}` };
    else {
      const s = j.dados.resumo;
      v = { ok: true, cliques: Number(s.cliquesAceitos || 0), pedidos: Number(s.pedidos || 0), pedidosAtribuidos: Number(s.pedidosAtribuidos || 0),
        receita: s.receita || {}, filtrado: Number(s.trafegoFiltrado || 0) };
    }
  } catch (e) { v = { ok: false, motivo: `BigLinks fora do ar (${String(e?.message || e).slice(0, 80)})` }; }
  cacheBl.set(k, { em: Date.now(), v });
  return v;
}

// ---------------------------------------------------------------- resumo em arquivo (relatório das 8h)

export function resumoDiario(db, hoje = diaDe()) {
  const ontem = somaDias(hoje, -1);
  const um = (dia) => { const r = relatorio(db, dia, dia); return { dia, ...r.total, internas: r.internas, porSite: r.porSite, origens: r.origens.slice(0, 5), posts: r.porPost.slice(0, 5) }; };
  return { gerado_em: new Date().toISOString(), fonte: 'Portal, contador próprio sem cookie (tabela visitas)', ontem: um(ontem), hoje: um(hoje) };
}

function gravarResumo(db, dir) {
  try {
    const f = path.join(dir, 'visitas-resumo.json');
    fs.writeFileSync(`${f}.tmp`, JSON.stringify(resumoDiario(db), null, 1));
    fs.renameSync(`${f}.tmp`, f);
  } catch (e) { console.warn(`[visitas] resumo não gravado: ${e.message}`); }
}

// ---------------------------------------------------------------- ligação com o servidor

export async function init(app) {
  app.db.exec(SCHEMA_SQL);
  app.registrarVisita = (req, res) => registrarVisita(app.db, req, res);
  const dir = process.env.PORTAL_DATA_DIR;
  if (dir && !process.env.NODE_TEST_CONTEXT) {
    setTimeout(() => gravarResumo(app.db, dir), 20_000).unref();
    setInterval(() => gravarResumo(app.db, dir), 600_000).unref();
  }
}

const diaOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

export const routes = [
  {
    method: 'GET', path: '/api/t/:tenant/visitas', super: true, handler: async ({ app, db, query }) => {
      const hoje = diaDe();
      const ate = diaOk(query.ate) ? query.ate : hoje;
      const dias = Math.min(90, Math.max(1, Number(query.dias) || 14));
      const de = diaOk(query.de) ? query.de : somaDias(ate, -(dias - 1));
      const r = relatorio(db, de, ate);
      const bl = await resumoBigLinks(app, de, ate);
      return { ...r, hoje, ontem: somaDias(hoje, -1), biglinks: bl, descartes: { ...descartes },
        regras: 'Sem cookie e sem IP. Visitante = hash do dia (sal diário só na memória). Robôs, navegador sem tela e a nossa rede ficam fora.' };
    },
  },
];
