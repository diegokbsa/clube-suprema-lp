// Histórico diário do Search Console (e do Bing Webmaster, quando há chave) para todos os nossos domínios.
// Pedido do Big em 12/11/2026: o placar de tração dos blogs precisa de série guardada, não só da consulta ao vivo.
//
// Roda dentro do próprio Portal (sem tarefa agendada nova): a cada 15 min confere se já coletou hoje; a partir das 05h
// (Brasília) coleta uma vez por dia. Também dá para disparar no painel (superadmin): POST /api/t/:tenant/sc-historico/coletar.
//
// Token: o Google entrega todas as propriedades da conta que autorizou. Por isso o coletor usa a conexão do Search Console
// de qualquer operação que esteja "conectado" (hoje a do hot-poker, conta h2odiegokbsa) para todos os domínios que essa
// conta enxerga. Domínio sem propriedade na conta vira pendência (o passo é do Kbsa: verificar no Search Console).
//
// Grava no portal.db (sc_diario, sc_consultas, sc_indexacao) e exporta, para o relatório das 8h30 e o painel do Bigue (:8130):
//   <dados>/search-console/<dominio>.json   série completa do domínio (últimos 180 dias)
//   <dados>/search-console/resumo.json      um bloco por domínio + pendências + medianas dos blogs
import fs from 'node:fs';
import path from 'node:path';
import { scoped } from '../repo.mjs';
import { HttpError } from '../http.mjs';
import { GOOGLE_KIND, BING_KIND, GOOGLE_API, GOOGLE_INSPECT, sealedData, googleRequest } from './search-console.mjs';
import { diaDe } from './visitas.mjs';

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sc_diario (
  dominio TEXT NOT NULL, fonte TEXT NOT NULL, dia TEXT NOT NULL,      -- fonte: google | bing; dia AAAA-MM-DD (fuso do Google: Pacífico)
  impressoes INTEGER NOT NULL DEFAULT 0, cliques INTEGER NOT NULL DEFAULT 0,
  ctr REAL, posicao REAL, coletado_em TEXT NOT NULL,
  PRIMARY KEY (dominio, fonte, dia)
);
CREATE TABLE IF NOT EXISTS sc_consultas (
  dominio TEXT NOT NULL, dia TEXT NOT NULL, consultas TEXT NOT NULL,   -- JSON: até 50 consultas com mais impressões no dia
  coletado_em TEXT NOT NULL, PRIMARY KEY (dominio, dia)
);
CREATE TABLE IF NOT EXISTS sc_indexacao (
  dominio TEXT NOT NULL, dia TEXT NOT NULL,                           -- dia da coleta (Brasília)
  sitemap_urls INTEGER, enviadas INTEGER, indexadas_sitemap INTEGER,  -- sitemap público e o que o Search Console diz dele
  inspecionadas INTEGER, indexadas INTEGER, detalhe TEXT,             -- inspeção de URL (veredito PASS = indexada)
  coletado_em TEXT NOT NULL, PRIMARY KEY (dominio, dia)
);
`;

/** Domínios fora do banco de sites do Portal (o suprema.blog é app à parte). */
export const DOMINIOS_EXTRAS = ['suprema.blog'];
const LIMITE_INSPECAO = 120;          // URLs inspecionadas por domínio por dia (cota do Google: 2.000/dia por propriedade)
const DIAS_SERIE = 30;                // janela relida todo dia (o Google ajusta os números dos últimos dias)
const DIAS_CONSULTAS = 28;            // dias para trás que ganham as 50 consultas, se ainda não têm
const HORA_INICIO = 5;

const semWww = (h) => String(h || '').toLowerCase().replace(/^www\./, '');
const isoDia = (d) => d.toISOString().slice(0, 10);
const diasAtras = (n, base = new Date()) => { const d = new Date(base); d.setUTCDate(d.getUTCDate() - n); return isoDia(d); };
const horaSp = (d = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(d));

/** Nossos domínios: os sites do Portal com domínio próprio (sem caminho) de operações ativas, mais os extras. */
export function dominios(db) {
  const lista = new Set(DOMINIOS_EXTRAS);
  for (const r of db.prepare(`SELECT s.domain FROM sites s JOIN tenants t ON t.id = s.tenant_id
      WHERE s.domain IS NOT NULL AND s.domain NOT LIKE '%/%' AND s.domain LIKE '%.%' AND t.status = 'ativa'`).all()) lista.add(semWww(r.domain));
  return [...lista].sort();
}

/** Conexões do Google (status conectado, com token) de qualquer operação. */
function conexoesGoogle(app) {
  return app.db.prepare("SELECT * FROM integrations WHERE kind = ? AND status = 'conectado'").all(GOOGLE_KIND)
    .filter((row) => { const s = sealedData(app, row); return s.refreshToken || s.accessToken; });
}

/** Propriedade da conta para o domínio: sc-domain:x, depois https://x/, depois https://www.x/. */
export function propriedadeDo(dominio, entradas) {
  const urls = new Set(entradas.map((e) => String(e.siteUrl || '')));
  for (const p of [`sc-domain:${dominio}`, `https://${dominio}/`, `https://www.${dominio}/`, `http://${dominio}/`]) if (urls.has(p)) return p;
  return null;
}

/** Endereços do sitemap público (sitemap index é seguido um nível). */
async function urlsDoSitemap(fetchImpl, dominio) {
  const ler = async (u) => { const r = await fetchImpl(u, { signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'Portal-SC-Historico/1.0' } }); return r.ok ? r.text() : ''; };
  const locs = (xml) => [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  const raiz = await ler(`https://${dominio}/sitemap.xml`);
  if (/<sitemapindex/i.test(raiz)) {
    const out = [];
    for (const s of locs(raiz).slice(0, 10)) out.push(...locs(await ler(s).catch(() => '')));
    return out;
  }
  return locs(raiz);
}

async function coletarGoogle(app, ctx, dominio, propriedade, hoje, log) {
  const { repo, row } = ctx;
  const db = app.db;
  const agora = new Date().toISOString();
  const q = `${GOOGLE_API}/sites/${encodeURIComponent(propriedade)}/searchAnalytics/query`;
  const corpo = (o) => ({ method: 'POST', body: JSON.stringify({ dataState: 'all', ...o }) });
  // 1. série diária (impressões, cliques, CTR, posição) dos últimos 30 dias
  const serie = await googleRequest(app, repo, row, q, corpo({ startDate: diasAtras(DIAS_SERIE), endDate: diasAtras(0), dimensions: ['date'], rowLimit: 100 }));
  const ins = db.prepare(`INSERT INTO sc_diario (dominio, fonte, dia, impressoes, cliques, ctr, posicao, coletado_em) VALUES (?, 'google', ?, ?, ?, ?, ?, ?)
    ON CONFLICT (dominio, fonte, dia) DO UPDATE SET impressoes = excluded.impressoes, cliques = excluded.cliques, ctr = excluded.ctr, posicao = excluded.posicao, coletado_em = excluded.coletado_em`);
  const linhas = Array.isArray(serie?.rows) ? serie.rows : [];
  for (const r of linhas) ins.run(dominio, String(r.keys?.[0]), Number(r.impressions) || 0, Number(r.clicks) || 0, Number(r.ctr) || 0, Number(r.position) || null, agora);
  // 2. as 50 consultas com mais impressões, por dia: os 3 dias mais recentes sempre (o Google ainda mexe) e o que faltar em 28 dias
  const tem = new Set(db.prepare('SELECT dia FROM sc_consultas WHERE dominio = ?').all(dominio).map((r) => r.dia));
  const diasComDado = linhas.map((r) => String(r.keys?.[0])).sort().reverse();
  const alvo = diasComDado.filter((d, i) => i < 3 || (!tem.has(d) && d >= diasAtras(DIAS_CONSULTAS)));
  const insQ = db.prepare(`INSERT INTO sc_consultas (dominio, dia, consultas, coletado_em) VALUES (?, ?, ?, ?)
    ON CONFLICT (dominio, dia) DO UPDATE SET consultas = excluded.consultas, coletado_em = excluded.coletado_em`);
  for (const dia of alvo) {
    const r = await googleRequest(app, repo, row, q, corpo({ startDate: dia, endDate: dia, dimensions: ['query'], rowLimit: 50 }));
    const consultas = (Array.isArray(r?.rows) ? r.rows : []).map((x) => ({ consulta: String(x.keys?.[0] || ''), impressoes: Number(x.impressions) || 0,
      cliques: Number(x.clicks) || 0, ctr: Number(x.ctr) || 0, posicao: Number(x.position) || 0 })).sort((a, b) => b.impressoes - a.impressoes).slice(0, 50);
    insQ.run(dominio, dia, JSON.stringify(consultas), agora);
  }
  // 3. indexação: o que o Search Console diz do sitemap e a inspeção de cada URL do sitemap público
  let enviadas = null; let indexadasSitemap = null;
  try {
    const sm = await googleRequest(app, repo, row, `${GOOGLE_API}/sites/${encodeURIComponent(propriedade)}/sitemaps`);
    for (const s of Array.isArray(sm?.sitemap) ? sm.sitemap : []) for (const c of Array.isArray(s.contents) ? s.contents : []) {
      if (c.type && c.type !== 'web') continue;
      enviadas = (enviadas || 0) + (Number(c.submitted) || 0);
      indexadasSitemap = (indexadasSitemap || 0) + (Number(c.indexed) || 0);
    }
  } catch (e) { log(`${dominio}: sitemaps do Search Console: ${e.message}`); }
  let urls = [];
  try { urls = [...new Set(await urlsDoSitemap(app.fetchImpl || fetch, dominio))]; } catch (e) { log(`${dominio}: sitemap público: ${e.message}`); }
  let inspecionadas = 0; let indexadas = 0; const estados = {};
  for (const url of urls.slice(0, LIMITE_INSPECAO)) {
    try {
      const r = await googleRequest(app, repo, row, GOOGLE_INSPECT, { method: 'POST', body: JSON.stringify({ inspectionUrl: url, siteUrl: propriedade, languageCode: 'pt-BR' }) });
      const st = r?.inspectionResult?.indexStatusResult || {};
      inspecionadas++;
      if (st.verdict === 'PASS') indexadas++;
      const chave = String(st.coverageState || st.verdict || 'sem estado').slice(0, 80);
      estados[chave] = (estados[chave] || 0) + 1;
    } catch (e) { log(`${dominio}: inspeção parou em ${inspecionadas}: ${e.message}`); break; }
  }
  app.db.prepare(`INSERT INTO sc_indexacao (dominio, dia, sitemap_urls, enviadas, indexadas_sitemap, inspecionadas, indexadas, detalhe, coletado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (dominio, dia) DO UPDATE SET sitemap_urls = excluded.sitemap_urls, enviadas = excluded.enviadas,
    indexadas_sitemap = excluded.indexadas_sitemap, inspecionadas = excluded.inspecionadas, indexadas = excluded.indexadas, detalhe = excluded.detalhe, coletado_em = excluded.coletado_em`)
    .run(dominio, hoje, urls.length, enviadas, indexadasSitemap, inspecionadas, indexadas, JSON.stringify({ estados, alemDoLimite: Math.max(0, urls.length - LIMITE_INSPECAO) }), agora);
  return { dias: linhas.length, consultas: alvo.length, sitemapUrls: urls.length, inspecionadas, indexadas };
}

/** Bing Webmaster (GetRankAndTrafficStats): impressões e cliques por dia. Só roda se alguma operação tem a chave da API. */
async function coletarBing(app, apiKey, dominio) {
  const f = app.fetchImpl || fetch;
  const r = await f(`https://ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats?siteUrl=${encodeURIComponent(`https://${dominio}/`)}&apikey=${encodeURIComponent(apiKey)}`,
    { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !Array.isArray(j?.d)) throw new Error(`Bing respondeu ${r.status}${j?.Message ? `: ${String(j.Message).slice(0, 120)}` : ''}`);
  const agora = new Date().toISOString();
  const ins = app.db.prepare(`INSERT INTO sc_diario (dominio, fonte, dia, impressoes, cliques, ctr, posicao, coletado_em) VALUES (?, 'bing', ?, ?, ?, NULL, NULL, ?)
    ON CONFLICT (dominio, fonte, dia) DO UPDATE SET impressoes = excluded.impressoes, cliques = excluded.cliques, coletado_em = excluded.coletado_em`);
  let n = 0;
  for (const x of j.d) {
    const ms = Number(/\/Date\((\d+)/.exec(String(x.Date))?.[1]);
    if (!ms) continue;
    ins.run(dominio, isoDia(new Date(ms)), Number(x.Impressions) || 0, Number(x.Clicks) || 0, agora); n++;
  }
  return n;
}

const mediana = (xs) => { const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

/** Série de um domínio (o que vai para <dominio>.json). */
export function serieDo(db, dominio, dias = 180) {
  const desde = diasAtras(dias);
  const g = db.prepare("SELECT dia, impressoes, cliques, ctr, posicao FROM sc_diario WHERE dominio = ? AND fonte = 'google' AND dia >= ? ORDER BY dia").all(dominio, desde);
  const b = db.prepare("SELECT dia, impressoes, cliques FROM sc_diario WHERE dominio = ? AND fonte = 'bing' AND dia >= ? ORDER BY dia").all(dominio, desde);
  const c = db.prepare('SELECT dia, consultas FROM sc_consultas WHERE dominio = ? AND dia >= ? ORDER BY dia').all(dominio, desde);
  const i = db.prepare('SELECT dia, sitemap_urls, enviadas, indexadas_sitemap, inspecionadas, indexadas, detalhe FROM sc_indexacao WHERE dominio = ? AND dia >= ? ORDER BY dia').all(dominio, desde);
  const cons = Object.fromEntries(c.map((x) => [x.dia, JSON.parse(x.consultas)]));
  return {
    dominio,
    google: g.map((x) => ({ ...x, consultas: cons[x.dia] || null })),
    bing: b,
    indexacao: i.map((x) => ({ ...x, detalhe: JSON.parse(x.detalhe || '{}') })),
  };
}

function somaJanela(linhas, ate, n) {
  const de = diasAtras(n - 1, new Date(`${ate}T12:00:00Z`));
  const j = linhas.filter((x) => x.dia >= de && x.dia <= ate);
  const imp = j.reduce((s, x) => s + x.impressoes, 0);
  const cli = j.reduce((s, x) => s + x.cliques, 0);
  const pos = imp ? j.reduce((s, x) => s + (x.posicao || 0) * x.impressoes, 0) / imp : null;
  return { de, ate, impressoes: imp, cliques: cli, ctr: imp ? cli / imp : null, posicao: pos == null ? null : Math.round(pos * 10) / 10 };
}

export function resumoGeral(db, estado) {
  const blocos = estado.dominios.map((d) => {
    const s = serieDo(db, d.dominio, 60);
    const ultimo = s.google.at(-1)?.dia || null;
    const idx = s.indexacao.at(-1) || null;
    return { ...d, ultimoDiaComDado: ultimo, ultimos7: ultimo ? somaJanela(s.google, ultimo, 7) : null, ultimos28: ultimo ? somaJanela(s.google, ultimo, 28) : null,
      indexacao: idx && { dia: idx.dia, sitemapUrls: idx.sitemap_urls, inspecionadas: idx.inspecionadas, indexadas: idx.indexadas, enviadasSc: idx.enviadas },
      bing7: s.bing.length ? somaJanela(s.bing.map((x) => ({ ...x, posicao: null })), s.bing.at(-1).dia, 7) : null,
      topConsultas: (s.google.findLast?.((x) => x.consultas?.length)?.consultas || []).slice(0, 10) };
  });
  const blogs = blocos.filter((b) => /\.(blog|casa)$/.test(b.dominio) && b.dominio !== 'suprema.blog' && b.estado === 'ok');
  return {
    gerado_em: new Date().toISOString(),
    fonte: 'Portal sc-historico (Search Console API + Bing Webmaster API), coleta diária a partir das 05h',
    formato: 'impressoes/cliques/ctr/posicao por dia (fuso do Google), consultas = top 50 por impressões no dia, indexadas = URLs do sitemap com veredito PASS na inspeção',
    dominios: blocos,
    medianasBlogs: {
      n: blogs.length,
      impressoes7: mediana(blogs.map((b) => b.ultimos7?.impressoes)), cliques7: mediana(blogs.map((b) => b.ultimos7?.cliques)),
      impressoes28: mediana(blogs.map((b) => b.ultimos28?.impressoes)), cliques28: mediana(blogs.map((b) => b.ultimos28?.cliques)),
      posicao28: mediana(blogs.map((b) => b.ultimos28?.posicao)), indexadas: mediana(blogs.map((b) => b.indexacao?.indexadas)),
    },
    pendencias: estado.pendencias,
    log: estado.log.slice(-40),
  };
}

let rodando = null;
let ultimaColeta = null;

/** Coleta tudo uma vez. Nunca derruba o servidor; o que falhar vai para "pendencias"/"log" do resumo. */
export async function coletar(app, { dir = process.env.PORTAL_DATA_DIR, inspecionar = true } = {}) {
  if (rodando) return rodando;
  rodando = (async () => {
    const hoje = diaDe();
    const log = [];
    const anota = (t) => { log.push(`${new Date().toISOString()} ${t}`); };
    const pendencias = [];
    const estadoDominios = [];
    const lista = dominios(app.db);
    // Google: junta as propriedades que cada conexão enxerga
    const mapa = new Map();
    for (const row of conexoesGoogle(app)) {
      const repo = scoped(app.db, row.tenant_id);
      try {
        const sites = await googleRequest(app, repo, row, `${GOOGLE_API}/sites`);
        const entradas = (Array.isArray(sites?.siteEntry) ? sites.siteEntry : []).filter((e) => e.permissionLevel !== 'siteUnverifiedUser');
        for (const d of lista) if (!mapa.has(d)) { const p = propriedadeDo(d, entradas); if (p) mapa.set(d, { propriedade: p, ctx: { repo, row } }); }
      } catch (e) { anota(`conexão do Google (operação ${row.tenant_id}): ${e.message}`); }
    }
    if (!conexoesGoogle(app).length) pendencias.push({ tipo: 'google_sem_conexao', passo: 'Conectar a conta Google no painel do Portal → Search Console → "Conectar conta Google".' });
    for (const d of lista) {
      const alvo = mapa.get(d);
      if (!alvo) {
        estadoDominios.push({ dominio: d, estado: 'sem_propriedade', propriedade: null });
        pendencias.push({ tipo: 'propriedade_ausente', dominio: d,
          passo: `Kbsa: em search.google.com/search-console, "Adicionar propriedade" → Domínio → ${d}; o registro TXT vai no DNS da Cloudflare (a sessão faz isso se você mandar o TXT, ou use "Verificar pela Cloudflare").` });
        continue;
      }
      if (!inspecionar) { estadoDominios.push({ dominio: d, estado: 'ok', propriedade: alvo.propriedade }); continue; }
      try {
        const r = await coletarGoogle(app, alvo.ctx, d, alvo.propriedade, hoje, anota);
        estadoDominios.push({ dominio: d, estado: 'ok', propriedade: alvo.propriedade, coleta: r });
      } catch (e) {
        anota(`${d}: ${e.message}`);
        estadoDominios.push({ dominio: d, estado: 'erro', propriedade: alvo.propriedade, erro: String(e.message).slice(0, 200) });
      }
    }
    // Bing, se alguma operação tem a chave
    const bingRow = app.db.prepare('SELECT * FROM integrations WHERE kind = ?').all(BING_KIND).find((r) => sealedData(app, r).apiKey);
    if (bingRow) {
      const apiKey = sealedData(app, bingRow).apiKey;
      for (const e of estadoDominios) {
        try { e.bingDias = await coletarBing(app, apiKey, e.dominio); } catch (err) { e.bingErro = String(err.message).slice(0, 160); }
      }
    } else pendencias.push({ tipo: 'bing_sem_chave', passo: 'Opcional: colar a chave da API do Bing Webmaster no painel do Portal → Search Console (bing.com/webmasters → Configurações → API).' });
    const estado = { dominios: estadoDominios, pendencias, log };
    ultimaColeta = { dia: hoje, em: new Date().toISOString(), ok: estadoDominios.filter((d) => d.estado === 'ok').length, total: lista.length };
    if (dir) exportar(app.db, dir, estado);
    return { ...ultimaColeta, estado };
  })();
  try { return await rodando; } finally { rodando = null; }
}

export function exportar(db, dir, estado) {
  const pasta = path.join(dir, 'search-console');
  fs.mkdirSync(pasta, { recursive: true });
  const grava = (nome, obj) => { const f = path.join(pasta, nome); fs.writeFileSync(`${f}.tmp`, JSON.stringify(obj, null, 1)); fs.renameSync(`${f}.tmp`, f); };
  for (const d of estado.dominios) grava(`${d.dominio}.json`, { ...serieDo(db, d.dominio), estado: d.estado, propriedade: d.propriedade, atualizado: new Date().toISOString() });
  grava('resumo.json', resumoGeral(db, estado));
}

export async function init(app) {
  app.db.exec(SCHEMA_SQL);
  const dir = process.env.PORTAL_DATA_DIR;
  if (!dir || process.env.NODE_TEST_CONTEXT) return;
  try { const r = JSON.parse(fs.readFileSync(path.join(dir, 'search-console', 'resumo.json'), 'utf8')); ultimaColeta = { dia: diaDe(new Date(r.gerado_em)), em: r.gerado_em }; } catch { /* nunca coletou */ }
  const talvez = () => {
    if (horaSp() < HORA_INICIO || ultimaColeta?.dia === diaDe()) return;
    coletar(app).catch((e) => console.warn(`[sc-historico] ${e.message}`));
  };
  setTimeout(talvez, 60_000).unref();
  setInterval(talvez, 15 * 60_000).unref();
}

export const routes = [
  {
    method: 'POST', path: '/api/t/:tenant/sc-historico/coletar', super: true, handler: async ({ app }) => {
      const r = await coletar(app);
      return { ok: true, dia: r.dia, dominiosOk: r.ok, total: r.total, pendencias: r.estado.pendencias, log: r.estado.log.slice(-20) };
    },
  },
  {
    method: 'GET', path: '/api/t/:tenant/sc-historico', super: true, handler: ({ app, query }) => {
      const d = String(query.dominio || '').toLowerCase();
      if (d) { if (!dominios(app.db).includes(d)) throw new HttpError(404, 'Domínio fora da lista.'); return serieDo(app.db, d, Math.min(400, Number(query.dias) || 90)); }
      return { ultimaColeta, dominios: dominios(app.db) };
    },
  },
];
