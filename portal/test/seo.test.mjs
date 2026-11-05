// Fluxo de SEO: publicar avisa o IndexNow com a chave do site, registra o Google como pendente de conexão,
// serve a chave, o sitemap e o JSON-LD; endereço local nunca envia nada para fora.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPortal, client } from './helpers.mjs';

let P;
let sup;
const calls = [];
const fakeFetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { status: 202 }; };

before(async () => {
  P = await startPortal({ origin: 'https://portal.exemplo.com', fetchImpl: fakeFetch });
  sup = client(P.url);
  await sup.login('super@teste.local', 'senha-forte-123');
  const r = await sup.req('POST', '/api/tenants', { name: 'Clube SEO', number: '10003', niche: 'poker', template: 'clube-poker-premium' });
  assert.equal(r.status, 201);
});
after(() => P.close());

const wait = () => new Promise((r) => setTimeout(r, 50));

test('publicar avisa o IndexNow com a chave do site e o Google fica pendente de conexão', async () => {
  const site = (await sup.req('GET', '/api/t/clube-10003/sites')).data.sites[0];
  const page = site.pages.find((p) => p.slug === 'torneios');
  await sup.req('POST', `/api/t/clube-10003/pages/${page.id}/publish`);
  await wait();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.indexnow.org/indexnow');
  const body = calls[0].body;
  assert.equal(body.host, 'portal.exemplo.com');
  assert.deepEqual(body.urlList, ['https://portal.exemplo.com/s/clube-10003/torneios']);
  assert.match(body.keyLocation, /^https:\/\/portal\.exemplo\.com\/s\/clube-10003\/[a-f0-9]{32}\.txt$/);
  const keyPath = new URL(body.keyLocation).pathname;
  const k = await sup.req('GET', keyPath, undefined, { raw: true });
  assert.equal(k.status, 200);
  assert.equal(k.data, body.key, 'o arquivo da chave está no ar no mesmo caminho do site');
  const seo = (await sup.req('GET', '/api/t/clube-10003/seo')).data;
  const byEngine = Object.fromEntries(seo.events.map((e) => [e.engine, e.status]));
  assert.equal(byEngine.indexnow, 'recebido');
  assert.equal(byEngine.google_search_console, 'pendente_conexao', 'sem conta conectada não finge envio ao Google');
});

test('página publicada tem canonical, JSON-LD e entra no sitemap; noindex não avisa', async () => {
  const site = (await sup.req('GET', '/api/t/clube-10003/sites')).data.sites[0];
  const html = (await sup.req('GET', '/s/clube-10003/torneios', undefined, { raw: true })).data;
  assert.match(html, /<link rel="canonical" href="https:\/\/portal\.exemplo\.com\/s\/clube-10003\/torneios">/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(ld['@graph'][0]['@type'], 'WebPage');
  assert.equal(ld['@graph'][1]['@type'], 'BreadcrumbList');
  const sm = (await sup.req('GET', '/s/clube-10003/sitemap.xml', undefined, { raw: true })).data;
  assert.match(sm, /<loc>https:\/\/portal\.exemplo\.com\/s\/clube-10003\/torneios<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  const priv = site.pages.find((p) => p.slug === 'privacidade');
  await sup.req('PUT', `/api/t/clube-10003/pages/${priv.id}/draft`, { blocks: priv.draft, seo: { noindex: true } });
  const before = calls.length;
  await sup.req('POST', `/api/t/clube-10003/pages/${priv.id}/publish`);
  await wait();
  assert.equal(calls.length, before, 'página com noindex não é anunciada');
});

test('checklist de SEO aparece no editor', async () => {
  const site = (await sup.req('GET', '/api/t/clube-10003/sites')).data.sites[0];
  const r = await sup.req('GET', `/api/t/clube-10003/pages/${site.pages[0].id}`);
  assert.ok(Array.isArray(r.data.seo) && r.data.seo.length >= 8);
  assert.ok(r.data.seo.some((c) => /H1/.test(c.msg) && c.ok));
});

test('endereço local não envia nada para fora', async () => {
  const L = await startPortal({ fetchImpl: async () => { throw new Error('não deveria chamar'); } });
  const c = client(L.url);
  await c.login('super@teste.local', 'senha-forte-123');
  await c.req('POST', '/api/tenants', { name: 'Local', number: '1', niche: 'poker', template: 'clube-poker-premium' });
  const site = (await c.req('GET', '/api/t/clube-1/sites')).data.sites[0];
  await c.req('POST', `/api/t/clube-1/pages/${site.pages[0].id}/publish`);
  await wait();
  const ev = (await c.req('GET', '/api/t/clube-1/seo')).data.events;
  assert.equal(ev[0].status, 'ignorado_local');
  await L.close();
});
