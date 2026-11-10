// Contador de visitas sem cookie: beacon conta visita real, robô/curl/sem Origin não contam, rede interna fica separada, nada de IP gravado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startPortal, client } from './helpers.mjs';
import { montar } from '../lib/modules/paginas.mjs';
import { createTenant } from '../lib/tenants.mjs';
import { scriptVisitas, tagVisitas, ehRobo, ehInterno, dominioDe, aparelhoDe, relatorio, resumoDiario, diaDe } from '../lib/modules/visitas.mjs';

const CHROME_CEL = 'Mozilla/5.0 (Linux; Android 14; 23049PCD8G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const DOC = '<!doctype html><html lang="pt-BR"><head><title>T</title></head><body><p>oi</p></body></html>';

test('script: inline, menos de 1 KB, só depois do load, com sendBeacon e sem cookie', () => {
  const s = scriptVisitas('fornecedores.blog', '/pa/v');
  assert.ok(s.length < 1024, `script com ${s.length} bytes`);
  assert.match(s, /sendBeacon/);
  assert.match(s, /addEventListener\("load"/);
  assert.doesNotMatch(s, /cookie|localStorage|sessionStorage/);
  assert.equal(tagVisitas({ id: 'x' }), '', 'só id (sem domínio nem slug): nada');
  assert.match(tagVisitas({ domain: 'kbsa.app/milhas' }), /E="\/milhas\/pa\/v"/);
  assert.match(tagVisitas({ slug: 'teste' }), /K="s\/teste",E="\/s\/teste\/pa\/v"/);
  const h = montar(DOC, { id: 's1', domain: 'fornecedores.blog' });
  assert.match(h, /K="fornecedores\.blog",E="\/pa\/v"/);
  assert.ok(h.indexOf('K="fornecedores.blog"') < h.lastIndexOf('</body>'));
});

test('filtros: robôs e ferramentas fora, navegador de verdade dentro, rede interna marcada', () => {
  for (const ua of ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Mozilla/5.0 (compatible; YandexBot/3.0)',
    'Mozilla/5.0 (compatible; bingbot/2.0)', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 11; moto g power) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 Chrome-Lighthouse',
    'curl/8.9.1', 'python-requests/2.32', '', 'Mozilla/5.0']) assert.ok(ehRobo(ua), ua);
  assert.equal(ehRobo(CHROME_CEL), false);
  assert.equal(ehRobo('Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'), false);
  assert.ok(ehInterno('189.97.25.183') && ehInterno('192.168.16.7') && ehInterno('127.0.0.1'));
  assert.equal(ehInterno('177.10.20.30'), false);
  assert.equal(dominioDe('https://www.google.com/search?q=prensa'), 'google.com');
  assert.equal(dominioDe(''), null);
  assert.equal(aparelhoDe(CHROME_CEL), 'celular');
});

test('beacon: visita real grava (sem IP), curl com UA de robô e sem Origin não grava, painel separa a rede interna', async (t) => {
  const p = await startPortal();
  t.after(() => p.close());
  const tn = createTenant(p.db, { name: 'Blogs', niche: 'poker', slug: 'blogs-teste' }, { userId: p.superUser.id }).tenant;
  p.db.prepare("INSERT INTO sites (id, tenant_id, slug, name, domain, status, created_at) VALUES ('s1', ?, 'forn', 'Forn', 'fornecedores.blog', 'publicado', 'x')").run(tn.id);
  const chave = 'fornecedores.blog';
  const beacon = (corpo, headers = {}) => fetch(`${p.url}/pa/v`, { method: 'POST', body: JSON.stringify(corpo), headers: { 'Content-Type': 'text/plain;charset=UTF-8', ...headers } });
  const real = { 'User-Agent': CHROME_CEL, Origin: `https://${chave}`, 'CF-Connecting-IP': '177.10.20.30', 'CF-IPCountry': 'BR' };
  const corpo = { k: chave, t: 'v', p: '/melhor-prensa?x=1', r: 'https://www.google.com/search?q=prensa', u: ['instagram', 'bio', null], w: 412 };

  assert.equal((await beacon(corpo, real)).status, 204);
  assert.equal((await beacon({ ...corpo, t: 'c', x: 'l.kbsa.app/ck-prime-box-pro' }, real)).status, 204);
  assert.equal((await beacon(corpo, { ...real, 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' })).status, 204);
  assert.equal((await beacon(corpo, { ...real, 'User-Agent': 'curl/8.9.1' })).status, 204);
  const { Origin, ...semOrigem } = real;
  await beacon(corpo, semOrigem);                                                   // curl "disfarçado" sem Origin
  await beacon(corpo, { ...real, Origin: 'https://outro-site.com' });               // Origin de outro domínio
  await beacon({ ...corpo, k: 'site-que-nao-existe.com' }, { ...real, Origin: 'https://site-que-nao-existe.com' });
  await beacon(corpo, { ...real, 'CF-Connecting-IP': '189.97.25.183' });           // nossa rede: grava como interna
  await fetch(`${p.url}/s/forn/pa/v`, { method: 'POST', body: JSON.stringify({ ...corpo, p: '/outro' }), headers: real }); // com prefixo /s/<slug>

  const linhas = p.db.prepare('SELECT * FROM visitas ORDER BY id').all();
  assert.equal(linhas.length, 4, JSON.stringify(linhas));
  const [v, c, interna, pref] = linhas;
  assert.deepEqual([v.tipo, v.site, v.caminho, v.referer, v.utm_source, v.utm_medium, v.aparelho, v.pais, v.interno], ['v', chave, '/melhor-prensa', 'google.com', 'instagram', 'bio', 'celular', 'BR', 0]);
  assert.equal(c.tipo, 'c'); assert.equal(c.destino, 'l.kbsa.app/ck-prime-box-pro');
  assert.equal(interna.interno, 1);
  assert.equal(pref.caminho, '/outro');
  assert.match(v.visitante, /^[0-9a-f]{16}$/);
  assert.equal(v.visitante, c.visitante, 'mesmo visitante no mesmo dia');
  const tudo = JSON.stringify(linhas);
  assert.doesNotMatch(tudo, /177\.10\.20\.30|189\.97/, 'nenhum IP gravado');
  assert.deepEqual(Object.keys(v).filter((k) => /^ip$|_ip$|user_agent|cookie/i.test(k)), []);

  const hoje = diaDe();
  const r = relatorio(p.db, hoje, hoje);
  assert.deepEqual(r.total, { visitas: 2, visitantes: 1, cliques: 1, saidas: 1 });
  assert.equal(r.internas, 1);
  assert.equal(r.porSite[0].site, chave);
  assert.equal(r.origens.find((o) => o.origem === 'instagram').visitas, 2);
  const res = resumoDiario(p.db, hoje);
  assert.equal(res.hoje.visitas, 2);

  const a = client(p.url);
  await a.login('super@teste.local', 'senha-forte-123');
  const pn = await a.req('GET', `/api/t/${tn.slug}/visitas?dias=7`);
  assert.equal(pn.status, 200, JSON.stringify(pn.data));
  assert.equal(pn.data.total.visitas, 2);
  assert.ok(pn.data.descartes.robo >= 2 && pn.data.descartes.origem >= 2);
  assert.equal(typeof pn.data.biglinks.ok, 'boolean');
});
