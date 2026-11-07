// Site publicado num caminho de outro host (domain = "kbsa.app/milhas"): com o X-Portal-Prefix do Caddy,
// links, canonical, sitemap e IndexNow saem em https://kbsa.app/milhas; sem o cabeçalho, /s/<slug> segue igual.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPortal, client } from './helpers.mjs';

let P; let sup; let site;
const calls = [];
const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
before(async () => {
  P = await startPortal({ origin: 'https://aff.exemplo.com', fetchImpl: async (_u, init) => { calls.push(JSON.parse(init.body)); return { status: 202 }; } });
  sup = client(P.url);
  await sup.login('super@teste.local', 'senha-forte-123');
  await sup.req('POST', '/api/tenants', { name: 'Blog Milhas', number: '70001', niche: 'criador', template: 'vitrine-generica' });
  site = (await sup.req('GET', '/api/t/criador-70001/sites')).data.sites?.[0];
  if (!site) { const t = (await sup.req('GET', '/api/tenants')).data; throw new Error(JSON.stringify(t).slice(0, 400)); }
  P.db.prepare('UPDATE sites SET domain = ? WHERE id = ?').run('kbsa.app/milhas', site.id);
  const post = (await sup.req('POST', `/api/t/${site.tenantSlug || 'criador-70001'}/posts`, {
    siteId: site.id, title: 'Como juntar milhas do zero', slug: 'juntar-milhas', content: 'Texto do artigo sobre milhas e programas de fidelidade.', excerpt: 'Guia.', category: 'Milhas', author: 'Equipe',
  })).data.post;
  calls.length = 0;
  const pub = await sup.req('POST', `/api/t/criador-70001/posts/${post.id}/publish`);
  assert.equal(pub.status, 200, JSON.stringify(pub.data));
  await wait();
});
after(() => P.close());

test('com X-Portal-Prefix o post sai com canonical e links em kbsa.app/milhas', async () => {
  const r = await sup.req('GET', `/s/${site.slug}/blog/juntar-milhas`, undefined, { raw: true, headers: { 'X-Portal-Prefix': '/milhas', Accept: 'text/html' } });
  assert.equal(r.status, 200);
  assert.match(r.data, /<link rel="canonical" href="https:\/\/kbsa\.app\/milhas\/blog\/juntar-milhas">/);
  assert.doesNotMatch(r.data, /\/s\/[a-z0-9-]+\/blog/);
  const sm = await sup.req('GET', `/s/${site.slug}/sitemap.xml`, undefined, { raw: true, headers: { 'X-Portal-Prefix': '/milhas' } });
  assert.match(sm.data, /<loc>https:\/\/kbsa\.app\/milhas\/blog\/juntar-milhas<\/loc>/);
  const rb = await sup.req('GET', `/s/${site.slug}/robots.txt`, undefined, { raw: true, headers: { 'X-Portal-Prefix': '/milhas' } });
  assert.match(rb.data, /Sitemap: https:\/\/kbsa\.app\/milhas\/sitemap\.xml/);
});

test('sem barra final redireciona para o prefixo; prefixo errado e sem cabeçalho seguem em /s/<slug>', async () => {
  const r = await sup.req('GET', `/s/${site.slug}`, undefined, { raw: true, headers: { 'X-Portal-Prefix': '/milhas' } });
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), '/milhas/');
  const outro = await sup.req('GET', `/s/${site.slug}/blog/juntar-milhas`, undefined, { raw: true, headers: { 'X-Portal-Prefix': '/outro', Accept: 'text/html' } });
  assert.match(outro.data, new RegExp(`/s/${site.slug}/blog`));
});

test('IndexNow anuncia as URLs em kbsa.app/milhas', async () => {
  const urls = calls.flatMap((c) => c.urlList || []);
  assert.ok(urls.includes('https://kbsa.app/milhas/blog/juntar-milhas'), JSON.stringify(calls));
});

test('página própria em blog/<post> vence o modelo do blog, com o mesmo endereço', async () => {
  const put = await sup.req('PUT', `/api/t/criador-70001/sites/${site.id}/paginas-proprias`, { caminho: 'blog/juntar-milhas', html: '<!doctype html><html><body><h1>PROPRIO</h1></body></html>', indexar: false });
  assert.equal(put.status, 200, JSON.stringify(put.data));
  const r = await sup.req('GET', `/s/${site.slug}/blog/juntar-milhas`, undefined, { raw: true, headers: { 'X-Portal-Prefix': '/milhas', Accept: 'text/html' } });
  assert.equal(r.status, 200);
  assert.match(r.data, /PROPRIO/);
  const ruim = await sup.req('PUT', `/api/t/criador-70001/sites/${site.id}/paginas-proprias`, { caminho: 'a/b/c', html: '<!doctype html><html></html>' });
  assert.equal(ruim.status, 400);
});
