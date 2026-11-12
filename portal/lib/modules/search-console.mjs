// Google Search Console e Bing Webmaster Tools. Segredos ficam cifrados no cofre do servidor.
import { randomBytes } from 'node:crypto';
import { HttpError } from '../http.mjs';
import { now } from '../db.mjs';
import { scoped } from '../repo.mjs';
import { siteBase } from '../seo.mjs';

export const nav = { id: 'search-console', label: 'Search Console', perm: 'integrations.read' };

export const GOOGLE_KIND = 'google_search_console';
export const BING_KIND = 'bing_webmaster';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/webmasters';
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
export const GOOGLE_API = 'https://www.googleapis.com/webmasters/v3';
export const GOOGLE_INSPECT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
const BING_SUBMIT = 'https://ssl.bing.com/webmaster/api.svc/json/SubmitFeed';
const STATE_TTL_MS = 10 * 60_000;
const googleStates = new Map();

const need = (condition, status, message) => { if (!condition) throw new HttpError(status, message); };
const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const object = (value) => {
  try { const parsed = typeof value === 'string' ? JSON.parse(value) : value; return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; }
  catch { return {}; }
};
const fetcher = (app) => app.fetchImpl || globalThis.fetch;
const integration = (repo, kind, create = false) => repo.get('integrations', { kind })
  || (create ? repo.insert('integrations', { kind, status: 'pendente', public_config: '{}' }) : null);
export const sealedData = (app, row) => {
  try { return object(row?.secret ? app.vault.open(row.secret) : null); }
  catch { return {}; }
};
const saveSecret = (app, repo, row, secrets, patch = {}) => repo.update('integrations', row.id, {
  ...patch,
  secret: Object.values(secrets).some(Boolean) ? app.vault.seal(JSON.stringify(secrets)) : null,
});
const redirectUri = (origin) => `${String(origin || '').replace(/\/$/, '')}/api/hooks/google-search-console/callback`;
const siteUrlOf = (app, site) => {
  const { origin, base } = siteBase(app, site);
  return `${origin}${base || ''}/`;
};
const sitemapOf = (app, site) => {
  const { origin, base } = siteBase(app, site);
  return `${origin}${base}/sitemap.xml`;
};
const publicSitemap = (sitemap) => {
  try {
    const url = new URL(sitemap);
    return url.protocol === 'https:' && !/(localhost|127\.0\.0\.1|\[::1\]|\.local|\.test)(:|\/|$)/i.test(url.host);
  } catch { return false; }
};
const configOf = (row) => object(row?.public_config);

function cleanGoogleStates() {
  const at = Date.now();
  for (const [key, value] of googleStates) if (value.expiresAt <= at) googleStates.delete(key);
  while (googleStates.size > 1000) googleStates.delete(googleStates.keys().next().value);
}

function bodyJson(response) {
  return Promise.resolve().then(() => response?.json?.()).catch(() => ({}));
}

async function exchangeToken(app, form) {
  let response;
  try {
    response = await fetcher(app)(GOOGLE_TOKEN, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(form).toString(), signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new HttpError(502, 'Não foi possível concluir a conexão com o Google. Tente novamente.'); }
  const data = await bodyJson(response);
  if (!response?.ok || !data?.access_token) throw new HttpError(502, 'O Google não concluiu a conexão. Confira o código e a URL de retorno configurada.');
  return data;
}

async function refreshGoogle(app, repo, row, secrets) {
  need(secrets.clientId && secrets.clientSecret && secrets.refreshToken, 409, 'Google Search Console pendente de configuração: conecte novamente a conta.');
  const data = await exchangeToken(app, {
    client_id: secrets.clientId, client_secret: secrets.clientSecret, refresh_token: secrets.refreshToken, grant_type: 'refresh_token',
  });
  const updated = {
    ...secrets, accessToken: data.access_token,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000,
    scope: String(data.scope || secrets.scope || GOOGLE_SCOPE),
    tokenType: String(data.token_type || secrets.tokenType || 'Bearer'),
  };
  saveSecret(app, repo, row, updated, { status: 'conectado', last_check: now(), last_error: null });
  Object.assign(secrets, updated);
  return secrets.accessToken;
}

async function googleAccessToken(app, repo, row, { forceRefresh = false } = {}) {
  const secrets = sealedData(app, row);
  need(secrets.clientId && secrets.clientSecret, 409, 'Google Search Console pendente de configuração: informe as credenciais do aplicativo.');
  need(secrets.accessToken || secrets.refreshToken, 409, 'Google Search Console pendente de configuração: conecte a conta Google.');
  if (!forceRefresh && secrets.accessToken && Number(secrets.expiresAt) > Date.now() + 60_000) return { token: secrets.accessToken, secrets };
  if (secrets.refreshToken) return { token: await refreshGoogle(app, repo, row, secrets), secrets };
  return { token: secrets.accessToken, secrets };
}

export async function googleRequest(app, repo, row, url, init = {}) {
  let auth = await googleAccessToken(app, repo, row);
  const call = (token) => fetcher(app)(url, {
    ...init,
    headers: { Accept: 'application/json', ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...init.headers, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  let response;
  try { response = await call(auth.token); } catch { throw new HttpError(502, 'A conexão com o Google foi interrompida. Tente novamente.'); }
  if (response?.status === 401 && auth.secrets.refreshToken) {
    auth = await googleAccessToken(app, repo, row, { forceRefresh: true });
    try { response = await call(auth.token); } catch { throw new HttpError(502, 'A conexão com o Google foi interrompida. Tente novamente.'); }
  }
  if (!response?.ok) {
    if (response?.status === 401) repo.update('integrations', row.id, { status: 'erro', last_check: now(), last_error: 'O Google recusou a sessão. Reconecte a conta.' });
    throw new HttpError(502, response?.status === 401
      ? 'A sessão do Google expirou. Reconecte o Search Console.'
      : `O Google Search Console respondeu com HTTP ${Number(response?.status) || 'desconhecido'}.`);
  }
  return bodyJson(response);
}

async function submitGoogle(app, tenant, site, sitemap) {
  const repo = scoped(app.db, tenant.id);
  const row = integration(repo, GOOGLE_KIND);
  need(row?.status === 'conectado', 409, 'Google Search Console pendente de configuração.');
  need(publicSitemap(sitemap), 400, 'O sitemap precisa ter um endereço HTTPS público.');
  const siteUrl = await googleProperty(app, repo, row, site);
  const url = `${GOOGLE_API}/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemap)}`;
  await googleRequest(app, repo, row, url, { method: 'PUT' });
  repo.update('integrations', row.id, { last_check: now(), last_error: null });
  return 'enviado';
}

function getSite(repo, siteId) {
  const site = repo.get('sites', String(siteId || ''));
  need(site && !site.external_url, 404, 'Site não encontrado nesta operação ou sem sitemap próprio.');
  return site;
}

function normalizedProperty(value) {
  try {
    const url = new URL(String(value));
    return `${url.origin}${url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`}`;
  } catch { return ''; }
}

async function googleProperty(app, repo, row, site) {
  const expected = siteUrlOf(app, site);
  const listed = await googleRequest(app, repo, row, `${GOOGLE_API}/sites`);
  const entries = (Array.isArray(listed?.siteEntry) ? listed.siteEntry : [])
    .map((entry) => ({ siteUrl: String(entry?.siteUrl || ''), normalized: normalizedProperty(entry?.siteUrl) }))
    .filter((entry) => entry.siteUrl);
  const normalizedExpected = normalizedProperty(expected);
  const exact = entries.find((entry) => entry.normalized && entry.normalized === normalizedExpected);
  if (exact) return exact.siteUrl;
  // Uma propriedade URL-prefix de raiz cobre o caminho do site; entre várias, usa a mais específica.
  const prefix = entries.filter((entry) => entry.normalized && normalizedExpected.startsWith(entry.normalized))
    .sort((a, b) => b.normalized.length - a.normalized.length)[0];
  if (prefix) return prefix.siteUrl;
  const host = new URL(expected).hostname.toLowerCase();
  const domain = entries
    .map((entry) => ({ ...entry, domain: entry.siteUrl.slice('sc-domain:'.length).toLowerCase() }))
    .filter((entry) => entry.siteUrl.toLowerCase().startsWith('sc-domain:')
      && (host === entry.domain || host.endsWith(`.${entry.domain}`)))
    .sort((a, b) => b.domain.length - a.domain.length)[0];
  if (domain) return domain.siteUrl;
  throw new HttpError(409, 'A conta Google não tem uma propriedade do Search Console correspondente a este site. Verifique a propriedade e as permissões da conta.');
}

async function reportGoogle(app, repo, site) {
  const row = integration(repo, GOOGLE_KIND);
  need(row?.status === 'conectado', 409, 'Google Search Console pendente de configuração: conecte a conta antes de consultar os relatórios.');
  const siteUrl = siteUrlOf(app, site);
  const property = await googleProperty(app, repo, row, site);
  const sitemap = sitemapOf(app, site);
  need(publicSitemap(sitemap), 400, 'Os relatórios exigem um site com endereço HTTPS público.');
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  const date = (d) => d.toISOString().slice(0, 10);
  const analyticsUrl = `${GOOGLE_API}/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
  const results = await Promise.allSettled([
    googleRequest(app, repo, row, analyticsUrl, { method: 'POST', body: JSON.stringify({ startDate: date(start), endDate: date(end), dimensions: ['query'], rowLimit: 25 }) }),
    googleRequest(app, repo, row, GOOGLE_INSPECT, { method: 'POST', body: JSON.stringify({ inspectionUrl: `${siteUrl}`, siteUrl: property, languageCode: 'pt-BR' }) }),
  ]);
  const queries = results[0].status === 'fulfilled' && Array.isArray(results[0].value) ? results[0].value.map((item) => ({
    consulta: String(item.keys?.[0] || ''), cliques: Number(item.clicks) || 0, impressoes: Number(item.impressions) || 0,
    ctr: Number(item.ctr) || 0, posicao: Number(item.position) || 0,
  })) : [];
  const inspection = results[1].status === 'fulfilled' ? object(results[1].value?.inspectionResult?.indexStatusResult) : {};
  const coverage = results[1].status === 'fulfilled' ? {
    veredito: text(inspection.verdict, 80), estado: text(inspection.coverageState, 200),
    indexacao: text(inspection.indexingState, 100), robots: text(inspection.robotsTxtState, 100),
    ultimoRastreamento: text(inspection.lastCrawlTime, 40) || null,
  } : null;
  const avisos = [];
  if (results[0].status === 'rejected') avisos.push('O Google não devolveu consultas para este período.');
  if (results[1].status === 'rejected') avisos.push('O Google não devolveu o estado de inspeção da página inicial.');
  return { siteUrl, propriedade: property, sitemap, periodo: { inicio: date(start), fim: date(end) }, consultas: queries, cobertura: coverage, avisos };
}

async function submitBing(app, repo, site) {
  const row = integration(repo, BING_KIND);
  const secrets = sealedData(app, row);
  need(secrets.apiKey, 409, 'Bing Webmaster Tools pendente de configuração: informe a chave da API.');
  const siteUrl = siteUrlOf(app, site);
  const feedUrl = sitemapOf(app, site);
  need(publicSitemap(feedUrl), 400, 'O sitemap precisa ter um endereço HTTPS público.');
  let response;
  try {
    response = await fetcher(app)(`${BING_SUBMIT}?apikey=${encodeURIComponent(secrets.apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ siteUrl, feedUrl }), signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new HttpError(502, 'A conexão com o Bing Webmaster Tools foi interrompida.'); }
  const data = await bodyJson(response);
  if (!response?.ok || data?.ErrorCode || data?.error) {
    repo.update('integrations', row.id, { status: 'erro', last_check: now(), last_error: 'O Bing não aceitou o envio do sitemap.' });
    throw new HttpError(502, `O Bing Webmaster Tools respondeu com HTTP ${Number(response?.status) || 'desconhecido'}.`);
  }
  repo.update('integrations', row.id, { status: 'conectado', last_check: now(), last_error: null });
  return { ok: true, estado: 'conectado', enviado: true, siteUrl, feedUrl };
}

function painel(app, origin, repo) {
  const google = integration(repo, GOOGLE_KIND);
  const googleSecrets = sealedData(app, google);
  const bing = integration(repo, BING_KIND);
  const bingSecrets = sealedData(app, bing);
  const sites = repo.all('sites', {}, { order: 'created_at ASC' }).filter((site) => !site.external_url).map((site) => ({
    id: site.id, nome: site.name, siteUrl: siteUrlOf(app, site), sitemap: sitemapOf(app, site),
  }));
  return {
    google: {
      estado: google?.status === 'erro' && (googleSecrets.accessToken || googleSecrets.refreshToken) ? 'erro'
        : google?.status === 'conectado' && (googleSecrets.accessToken || googleSecrets.refreshToken) ? 'conectado' : 'pendente',
      clienteConfigurado: Boolean(googleSecrets.clientId && googleSecrets.clientSecret),
      contaConectada: Boolean(googleSecrets.accessToken || googleSecrets.refreshToken),
      escopo: GOOGLE_SCOPE, urlRetorno: redirectUri(origin), lastCheck: google?.last_check || null,
      ultimoErro: google?.last_error || null,
    },
    bing: {
      estado: bing?.status === 'erro' && bingSecrets.apiKey ? 'erro'
        : bing?.status === 'conectado' && bingSecrets.apiKey ? 'conectado' : 'pendente',
      chaveConfigurada: Boolean(bingSecrets.apiKey), lastCheck: bing?.last_check || null,
      ultimoErro: bing?.last_error || null,
    },
    sites,
  };
}

export const routes = [
  {
    method: 'GET', path: '/api/t/:tenant/search-console', perm: 'integrations.read',
    handler: ({ app, origin, repo }) => painel(app, origin, repo),
  },
  {
    method: 'PUT', path: '/api/t/:tenant/search-console/google', perm: 'integrations.manage',
    handler: ({ app, origin, repo, body, audit }) => {
      const row = integration(repo, GOOGLE_KIND, true);
      const before = sealedData(app, row);
      const secrets = { ...before };
      if (body?.clientId !== undefined && text(body.clientId, 300)) secrets.clientId = text(body.clientId, 300);
      if (body?.clientSecret !== undefined && text(body.clientSecret, 512)) secrets.clientSecret = text(body.clientSecret, 512);
      need(Boolean(secrets.clientId) === Boolean(secrets.clientSecret), 400, 'Informe o ID e o segredo do aplicativo Google juntos.');
      need(!secrets.clientId || /^[^\s]{8,300}$/.test(secrets.clientId), 400, 'ID do aplicativo Google inválido.');
      need(!secrets.clientSecret || /^[^\s]{12,512}$/.test(secrets.clientSecret), 400, 'Segredo do aplicativo Google inválido.');
      const limpar = body?.apagarCredenciais === true;
      if (limpar) for (const key of ['clientId', 'clientSecret', 'accessToken', 'refreshToken', 'expiresAt', 'scope', 'tokenType']) delete secrets[key];
      const mudou = secrets.clientId !== before.clientId || secrets.clientSecret !== before.clientSecret || limpar;
      if (mudou) for (const key of ['accessToken', 'refreshToken', 'expiresAt', 'scope', 'tokenType']) delete secrets[key];
      saveSecret(app, repo, row, secrets, {
        status: mudou ? 'pendente' : row.status,
        last_check: mudou ? now() : row.last_check,
        last_error: mudou ? null : row.last_error,
        public_config: mudou ? JSON.stringify({}) : row.public_config,
      });
      audit('search_console.google.configurar', GOOGLE_KIND, { clienteConfigurado: Boolean(secrets.clientId && secrets.clientSecret), limpar });
      const out = painel(app, origin, repo);
      return { ok: true, google: out.google, nota: secrets.clientId ? 'Credenciais protegidas no cofre. Agora conecte a conta Google.' : 'Google Search Console pendente de configuração.' };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/search-console/google/autorizar', perm: 'integrations.manage',
    handler: ({ app, origin, repo, tenant }) => {
      const row = integration(repo, GOOGLE_KIND);
      const secrets = sealedData(app, row);
      need(secrets.clientId && secrets.clientSecret, 409, 'Configure o ID e o segredo do aplicativo Google antes de conectar.');
      cleanGoogleStates();
      const state = randomBytes(32).toString('base64url');
      const callback = redirectUri(origin);
      googleStates.set(state, { app, tenantId: tenant.id, redirectUri: callback, expiresAt: Date.now() + STATE_TTL_MS });
      const url = new URL(GOOGLE_AUTH);
      for (const [key, value] of Object.entries({ client_id: secrets.clientId, redirect_uri: callback, response_type: 'code', scope: GOOGLE_SCOPE,
        access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state })) url.searchParams.set(key, value);
      return { url: url.toString(), urlRetorno: callback, expiraEmSegundos: STATE_TTL_MS / 1000 };
    },
  },
  {
    method: 'GET', path: '/api/hooks/google-search-console/callback', auth: false,
    handler: async ({ app, db, query }) => {
      const state = text(query.state, 200);
      const pending = googleStates.get(state);
      if (state) googleStates.delete(state); // consumo antes de qualquer validação ou chamada externa: um único uso
      if (!pending || pending.app !== app || pending.expiresAt <= Date.now()) return { status: 400, body: 'A conexão expirou ou já foi usada. Volte ao painel e tente novamente.', headers: { 'Content-Type': 'text/plain; charset=utf-8' } };
      if (query.error || !query.code) return { status: 400, body: 'O Google não concluiu a autorização. Volte ao painel e tente novamente.', headers: { 'Content-Type': 'text/plain; charset=utf-8' } };
      const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(pending.tenantId);
      if (!tenant) return { status: 400, body: 'A operação desta conexão não está disponível.', headers: { 'Content-Type': 'text/plain; charset=utf-8' } };
      const repo = scoped(db, tenant.id);
      const row = integration(repo, GOOGLE_KIND);
      const secrets = sealedData(app, row);
      if (!secrets.clientId || !secrets.clientSecret) return { status: 400, body: 'As credenciais do aplicativo Google foram removidas. Volte ao painel e configure novamente.', headers: { 'Content-Type': 'text/plain; charset=utf-8' } };
      let data;
      try {
        data = await exchangeToken(app, { code: text(query.code, 4096), client_id: secrets.clientId, client_secret: secrets.clientSecret,
          redirect_uri: pending.redirectUri, grant_type: 'authorization_code' });
      } catch {
        repo.update('integrations', row.id, { status: 'erro', last_check: now(), last_error: 'O Google não concluiu a autorização.' });
        return { status: 502, body: 'O Google não concluiu a autorização. Verifique o código e a URL de retorno e tente novamente.', headers: { 'Content-Type': 'text/plain; charset=utf-8' } };
      }
      const scopes = String(data.scope || GOOGLE_SCOPE).split(/\s+/).filter(Boolean);
      if (!scopes.includes(GOOGLE_SCOPE)) return { status: 400, body: 'A autorização não incluiu o escopo do Search Console. Volte ao painel e conecte novamente.', headers: { 'Content-Type': 'text/plain; charset=utf-8' } };
      const fresh = integration(repo, GOOGLE_KIND);
      const existing = sealedData(app, fresh);
      const connected = {
        ...existing, accessToken: data.access_token, refreshToken: data.refresh_token || existing.refreshToken || '',
        expiresAt: Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000,
        scope: scopes.join(' '), tokenType: String(data.token_type || 'Bearer'),
      };
      saveSecret(app, repo, fresh, connected, { status: 'conectado', last_check: now(), last_error: null, public_config: JSON.stringify({ scope: GOOGLE_SCOPE }) });
      return { status: 200, body: 'Conexão do Google Search Console concluída. Você pode voltar ao painel.', headers: { 'Content-Type': 'text/plain; charset=utf-8' } };
    },
  },
  {
    method: 'PUT', path: '/api/t/:tenant/search-console/bing', perm: 'integrations.manage',
    handler: ({ app, origin, repo, body, audit }) => {
      const row = integration(repo, BING_KIND, true);
      const before = sealedData(app, row);
      const apiKey = body?.apiKey === undefined ? before.apiKey : text(body.apiKey, 512);
      need(!apiKey || /^[^\s]{16,512}$/.test(apiKey), 400, 'Chave da API Bing inválida.');
      const secrets = apiKey ? { apiKey } : {};
      const mudou = apiKey !== before.apiKey;
      saveSecret(app, repo, row, secrets, { status: mudou ? 'pendente' : row.status,
        last_check: mudou ? now() : row.last_check, last_error: mudou ? null : row.last_error, public_config: JSON.stringify({}) });
      audit('search_console.bing.configurar', BING_KIND, { chaveConfigurada: Boolean(apiKey) });
      return { ok: true, bing: painel(app, origin, repo).bing, nota: apiKey ? 'Chave protegida no cofre. O Bing fica conectado após aceitar um envio de sitemap.' : 'Bing Webmaster Tools pendente de configuração.' };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/search-console/bing/enviar', perm: 'integrations.manage',
    handler: async ({ app, repo, body, audit }) => {
      const site = getSite(repo, body?.siteId);
      const result = await submitBing(app, repo, site);
      audit('search_console.bing.submit_feed', BING_KIND, { siteId: site.id, resultado: 'enviado' });
      return result;
    },
  },
  {
    method: 'GET', path: '/api/t/:tenant/search-console/google/relatorio', perm: 'integrations.read',
    handler: async ({ app, repo, query }) => reportGoogle(app, repo, getSite(repo, query.siteId)),
  },
];

export async function init(app) {
  // lib/seo.mjs já chama este gancho uma vez para cada publicação, quando o Search Console está conectado.
  app.seo.submitSitemapGoogle = (tenant, site, sitemap) => submitGoogle(app, tenant, site, sitemap);
}
