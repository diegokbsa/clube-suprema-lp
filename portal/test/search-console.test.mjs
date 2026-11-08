import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPortal, client } from './helpers.mjs';
import { createUser } from '../lib/auth.mjs';

const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/webmasters';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_SITES = 'https://www.googleapis.com/webmasters/v3/sites';
const GOOGLE_SITEMAP_PREFIX = 'https://www.googleapis.com/webmasters/v3/sites/';
const BING_ENDPOINT = 'https://ssl.bing.com/webmaster/api.svc/json/SubmitFeed';
const CLIENT_ID = 'teste-cliente.apps.googleusercontent.com';
const CLIENT_SECRET = 'SEGREDO_OAUTH_FAKE_0123456789';
const ACCESS_TOKEN = 'TOKEN_GOOGLE_FAKE_NAO_EXIBIR_123';
const REFRESH_TOKEN = 'REFRESH_GOOGLE_FAKE_NAO_EXIBIR_123';
const BING_KEY = 'CHAVE_BING_FAKE_NAO_EXIBIR_123456';

let P;
let admin;
let slug;
let tenantId;
const chamadas = [];
let propriedadesGoogle = [];

function resposta(status, data = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

async function fakeFetch(url, init = {}) {
  const chamada = { url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body || '' };
  chamadas.push(chamada);
  if (chamada.url === GOOGLE_TOKEN) {
    const form = new URLSearchParams(chamada.body);
    if (form.get('grant_type') === 'authorization_code') {
      assert.equal(form.get('code'), 'codigo-falso');
      assert.equal(form.get('client_id'), CLIENT_ID);
      assert.equal(form.get('client_secret'), CLIENT_SECRET);
      assert.equal(form.get('redirect_uri'), `https://portal.exemplo.com/api/hooks/google-search-console/callback`);
      return resposta(200, { access_token: ACCESS_TOKEN, refresh_token: REFRESH_TOKEN, expires_in: 3600, scope: GOOGLE_SCOPE, token_type: 'Bearer' });
    }
    if (form.get('grant_type') === 'refresh_token') return resposta(200, { access_token: ACCESS_TOKEN, expires_in: 3600, scope: GOOGLE_SCOPE, token_type: 'Bearer' });
    throw new Error('grant_type inesperado no fetch falso');
  }
  if (chamada.url === GOOGLE_SITES) return resposta(200, { siteEntry: propriedadesGoogle });
  if (chamada.url.startsWith(GOOGLE_SITEMAP_PREFIX) && chamada.url.includes('/sitemaps/')) return resposta(200, {});
  if (chamada.url.includes('/searchAnalytics/query')) return resposta(200, [
    { keys: ['poker educativo'], clicks: 7, impressions: 90, ctr: 7 / 90, position: 4.2 },
  ]);
  if (chamada.url === 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect') return resposta(200, {
    inspectionResult: { indexStatusResult: { verdict: 'PASS', coverageState: 'Indexada', indexingState: 'INDEXING_ALLOWED', robotsTxtState: 'ALLOWED', lastCrawlTime: '2026-11-07T13:00:00Z' } },
  });
  if (chamada.url === 'https://api.indexnow.org/indexnow') return { status: 202 };
  if (chamada.url.startsWith(BING_ENDPOINT)) return resposta(200, {});
  throw new Error(`URL inesperada no fetch falso: ${chamada.url}`);
}

before(async () => {
  P = await startPortal({ origin: 'https://portal.exemplo.com', fetchImpl: fakeFetch });
  admin = client(P.url);
  await admin.login('super@teste.local', 'senha-forte-123');
  const tenant = await admin.req('POST', '/api/tenants', { name: 'Clube Search Console', number: '15015', niche: 'poker', template: 'clube-poker-premium' });
  assert.equal(tenant.status, 201);
  slug = tenant.data.tenant.slug;
  tenantId = tenant.data.tenant.id;
  chamadas.length = 0;
});

after(async () => { if (P) await P.close(); });

const api = () => `/api/t/${slug}/search-console`;
const aguardar = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));

test('sem credenciais, Google e Bing permanecem pendentes e não expõem segredos', async () => {
  const r = await admin.req('GET', api());
  assert.equal(r.status, 200);
  assert.equal(r.data.google.estado, 'pendente');
  assert.equal(r.data.google.clienteConfigurado, false);
  assert.equal(r.data.google.contaConectada, false);
  assert.equal(r.data.bing.estado, 'pendente');
  assert.equal(r.data.bing.chaveConfigurada, false);
  assert.equal(chamadas.length, 0);
  assert.equal(JSON.stringify(r.data).includes(CLIENT_SECRET), false);
  assert.equal(JSON.stringify(r.data).includes(ACCESS_TOKEN), false);
  const tela = await admin.req('GET', '/admin/modules/search-console.js', undefined, { raw: true });
  assert.equal(tela.status, 200);
  assert.match(tela.data, /Google Search Console/);
});

test('Google usa escopo oficial, cifra credenciais e consome o estado OAuth uma única vez', async () => {
  const save = await admin.req('PUT', `${api()}/google`, { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
  assert.equal(save.status, 200);
  assert.equal(save.data.google.clienteConfigurado, true);
  assert.equal(JSON.stringify(save.data).includes(CLIENT_ID), false);
  assert.equal(JSON.stringify(save.data).includes(CLIENT_SECRET), false);
  let row = P.app.db.prepare('SELECT * FROM integrations WHERE tenant_id = ? AND kind = ?').get(tenantId, 'google_search_console');
  assert.match(row.secret, /^v1\./);
  assert.equal(P.app.vault.open(row.secret).includes(CLIENT_SECRET), true);

  const iniciar = await admin.req('POST', `${api()}/google/autorizar`, {});
  assert.equal(iniciar.status, 200);
  const authUrl = new URL(iniciar.data.url);
  assert.equal(authUrl.origin + authUrl.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(authUrl.searchParams.get('scope'), GOOGLE_SCOPE);
  assert.equal(authUrl.searchParams.get('redirect_uri'), 'https://portal.exemplo.com/api/hooks/google-search-console/callback');
  const state = authUrl.searchParams.get('state');
  assert.ok(state && state.length >= 40);

  const callback = `/api/hooks/google-search-console/callback?code=codigo-falso&state=${encodeURIComponent(state)}`;
  const conectado = await admin.req('GET', callback, undefined, { raw: true });
  assert.equal(conectado.status, 200);
  assert.match(conectado.data, /concluída/);
  assert.equal(conectado.data.includes(ACCESS_TOKEN), false);
  row = P.app.db.prepare('SELECT * FROM integrations WHERE tenant_id = ? AND kind = ?').get(tenantId, 'google_search_console');
  assert.equal(row.status, 'conectado');
  const stored = JSON.parse(P.app.vault.open(row.secret));
  assert.equal(stored.accessToken, ACCESS_TOKEN);
  assert.equal(stored.refreshToken, REFRESH_TOKEN);
  assert.equal(row.public_config.includes(ACCESS_TOKEN), false);
  assert.equal(row.public_config.includes(REFRESH_TOKEN), false);

  const trocado = await admin.req('GET', callback, undefined, { raw: true });
  assert.equal(trocado.status, 400);
  assert.match(trocado.data, /expirou ou já foi usada/);
  assert.equal(chamadas.filter((c) => c.url === GOOGLE_TOKEN).length, 1);
  const estado = await admin.req('GET', api());
  assert.equal(estado.data.google.estado, 'conectado');
  assert.equal(JSON.stringify(estado.data).includes(ACCESS_TOKEN), false);
  assert.equal(JSON.stringify(estado.data).includes(REFRESH_TOKEN), false);
  assert.equal(JSON.stringify(estado.data).includes(CLIENT_SECRET), false);
});

test('publicar chama sitemaps.submit uma vez e o relatório devolve consultas e inspeção', async () => {
  const antes = chamadas.filter((c) => c.url.startsWith(GOOGLE_SITEMAP_PREFIX)).length;
  const sites = await admin.req('GET', `/api/t/${slug}/sites`);
  const site = sites.data.sites[0];
  const page = site.pages.find((item) => item.slug === 'torneios');
  assert.ok(page);
  propriedadesGoogle = [{ siteUrl: site.url, permissionLevel: 'siteOwner' }, { siteUrl: 'sc-domain:portal.exemplo.com', permissionLevel: 'siteOwner' }];
  const publicado = await admin.req('POST', `/api/t/${slug}/pages/${page.id}/publish`);
  assert.equal(publicado.status, 200);
  await aguardar();
  const submits = chamadas.filter((c) => c.url.startsWith(GOOGLE_SITEMAP_PREFIX));
  assert.equal(submits.length - antes, 1);
  assert.equal(submits.at(-1).method, 'PUT');
  assert.equal(submits.at(-1).headers.Authorization, `Bearer ${ACCESS_TOKEN}`);
  assert.equal(submits.at(-1).url.includes(encodeURIComponent(`${site.url}sitemap.xml`)), true);

  propriedadesGoogle = [{ siteUrl: 'sc-domain:portal.exemplo.com', permissionLevel: 'siteOwner' }];
  const anotherPage = site.pages.find((item) => item.id !== page.id);
  const publicado2 = await admin.req('POST', `/api/t/${slug}/pages/${anotherPage.id}/publish`);
  assert.equal(publicado2.status, 200);
  await aguardar();
  const submitsWithDomain = chamadas.filter((c) => c.url.startsWith(GOOGLE_SITEMAP_PREFIX));
  assert.equal(submitsWithDomain.length - antes, 2);
  assert.equal(submitsWithDomain.at(-1).url.includes(encodeURIComponent('sc-domain:portal.exemplo.com')), true);
  const evento = P.db.prepare("SELECT status, detail FROM seo_events WHERE tenant_id = ? AND engine = 'google_search_console' ORDER BY created_at DESC LIMIT 1").get(tenantId);
  assert.equal(evento.status, 'enviado');
  assert.equal(evento.detail.includes(ACCESS_TOKEN), false);

  P.db.prepare('UPDATE sites SET domain = ? WHERE tenant_id = ? AND id = ?').run('www.portal.exemplo.com', tenantId, site.id);
  propriedadesGoogle = [{ siteUrl: 'sc-domain:portal.exemplo.com', permissionLevel: 'siteOwner' }];
  const relatorio = await admin.req('GET', `${api()}/google/relatorio?siteId=${encodeURIComponent(site.id)}`);
  assert.equal(relatorio.status, 200);
  assert.equal(relatorio.data.propriedade, 'sc-domain:portal.exemplo.com');
  assert.equal(relatorio.data.consultas[0].consulta, 'poker educativo');
  assert.equal(relatorio.data.consultas[0].cliques, 7);
  assert.equal(relatorio.data.cobertura.veredito, 'PASS');
  assert.equal(relatorio.data.cobertura.estado, 'Indexada');
  const analytics = chamadas.findLast((c) => c.url.includes('/searchAnalytics/query'));
  assert.equal(analytics.url.includes(encodeURIComponent('sc-domain:portal.exemplo.com')), true);
  const inspect = chamadas.findLast((c) => c.url === 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect');
  assert.equal(JSON.parse(inspect.body).siteUrl, 'sc-domain:portal.exemplo.com');
  assert.equal(JSON.stringify(relatorio.data).includes(ACCESS_TOKEN), false);
});

test('Bing guarda a chave cifrada e envia SubmitFeed com o corpo oficial', async () => {
  const salvar = await admin.req('PUT', `${api()}/bing`, { apiKey: BING_KEY });
  assert.equal(salvar.status, 200);
  assert.equal(salvar.data.bing.estado, 'pendente');
  assert.equal(JSON.stringify(salvar.data).includes(BING_KEY), false);
  const row = P.app.db.prepare('SELECT * FROM integrations WHERE tenant_id = ? AND kind = ?').get(tenantId, 'bing_webmaster');
  assert.match(row.secret, /^v1\./);
  assert.equal(P.app.vault.open(row.secret).includes(BING_KEY), true);
  const state = await admin.req('GET', api());
  assert.equal(JSON.stringify(state.data).includes(BING_KEY), false);
  const siteId = state.data.sites[0].id;

  const submitted = await admin.req('POST', `${api()}/bing/enviar`, { siteId });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.data.enviado, true);
  const call = chamadas.findLast((c) => c.url.startsWith(BING_ENDPOINT));
  assert.ok(call);
  assert.equal(new URL(call.url).searchParams.get('apikey'), BING_KEY);
  assert.deepEqual(JSON.parse(call.body), { siteUrl: state.data.sites[0].siteUrl, feedUrl: state.data.sites[0].sitemap });
  assert.equal(P.app.db.prepare('SELECT status FROM integrations WHERE tenant_id = ? AND kind = ?').get(tenantId, 'bing_webmaster').status, 'conectado');
});

test('rotas exigem permissão de integração e os dados ficam isolados por operação', async () => {
  const other = await admin.req('POST', '/api/tenants', { name: 'Outra operação', number: '15016', niche: 'poker', template: 'clube-poker-premium' });
  assert.equal(other.status, 201);
  const outra = await admin.req('GET', `/api/t/${other.data.tenant.slug}/search-console`);
  assert.equal(outra.status, 200);
  assert.equal(outra.data.google.estado, 'pendente');
  assert.equal(outra.data.bing.estado, 'pendente');

  const editorUser = createUser(P.db, { email: 'editor-search@teste.local', name: 'Editor', password: 'senha-forte-123' });
  P.db.prepare('INSERT INTO memberships (user_id, tenant_id, role) VALUES (?, ?, ?)').run(editorUser.id, tenantId, 'editor');
  const editor = client(P.url);
  await editor.login('editor-search@teste.local', 'senha-forte-123');
  const leitura = await editor.req('GET', api());
  assert.equal(leitura.status, 403);
  const escrita = await editor.req('PUT', `${api()}/bing`, { apiKey: BING_KEY });
  assert.equal(escrita.status, 403);
});
