// Blog + SEO do núcleo: post publicado entra no sitemap e avisa o IndexNow; despublicar some do sitemap.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPortal, client } from './helpers.mjs';

let P; let sup; let site;
const calls = [];
before(async () => {
  P = await startPortal({ origin: 'https://portal.exemplo.com', fetchImpl: async (url, init) => { calls.push(JSON.parse(init.body)); return { status: 202 }; } });
  sup = client(P.url);
  await sup.login('super@teste.local', 'senha-forte-123');
  await sup.req('POST', '/api/tenants', { name: 'Clube Blog', number: '40001', niche: 'poker', template: 'clube-poker-premium' });
  site = (await sup.req('GET', '/api/t/clube-40001/sites')).data.sites[0];
});
after(() => P.close());
const wait = () => new Promise((r) => setTimeout(r, 60));

test('publicar post avisa o IndexNow e coloca o post no sitemap; despublicar tira', async () => {
  const r = await sup.req('POST', '/api/t/clube-40001/posts', { siteId: site.id, title: 'Como funciona o torneio de sábado', slug: 'torneio-de-sabado',
    content: 'Texto do artigo com regras e horários do torneio de sábado no clube.', excerpt: 'Regras e horários.', category: 'Torneios', author: 'Equipe' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const id = r.data.post.id;
  assert.equal((await sup.req('POST', `/api/t/clube-40001/posts/${id}/publish`)).status, 200);
  await wait();
  const ultimo = calls.at(-1);
  assert.ok(ultimo.urlList.includes('https://portal.exemplo.com/s/clube-40001/blog/torneio-de-sabado'));
  let sm = (await sup.req('GET', '/s/clube-40001/sitemap.xml', undefined, { raw: true })).data;
  assert.match(sm, /\/s\/clube-40001\/blog\/torneio-de-sabado<\/loc><lastmod>\d{4}-\d{2}-\d{2}/);
  assert.match(sm, /\/s\/clube-40001\/blog<\/loc>/);
  await sup.req('POST', `/api/t/clube-40001/posts/${id}/unpublish`);
  sm = (await sup.req('GET', '/s/clube-40001/sitemap.xml', undefined, { raw: true })).data;
  assert.doesNotMatch(sm, /torneio-de-sabado/);
});
