import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sitemapXml } from '../lib/site.mjs';
import { sitemapEntries as sitemapBlog } from '../lib/modules/blog.mjs';
import { publicRoutes, sitemapEntries as sitemapFerramentas } from '../lib/modules/afiliacao-ferramentas.mjs';
import { startPortal, client } from './helpers.mjs';

const rota = (caminho) => publicRoutes.find((item) => item.path === caminho);

function chamar(handler, dominio, metodo = 'GET') {
  let resposta;
  const retorno = handler({ req: { method: metodo }, res: {}, site: { id: 'site-teste', domain: dominio }, origin: `https://${dominio}`,
    send: (_res, status, body, headers) => (resposta = { status, body, headers }) });
  return { retorno, resposta };
}

test('sitemap inclui a capa publicada de cada post no namespace oficial de imagens', () => {
  const post = { site_id: 'site-teste', published_slug: 'guia-cuidado', published_at: '2026-11-13T12:00:00Z',
    published_data: JSON.stringify({ dateModified: '2026-11-13T12:00:00Z', coverUrl: '/assets/afiliacao/manutencao/guia-cuidado-capa.webp' }) };
  const extras = sitemapBlog({ site: { id: 'site-teste' }, repo: { all: () => [post] } });
  const xml = sitemapXml('https://oficinanapratica.blog', '', [], extras);
  assert.match(xml, /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
  assert.match(xml, /<loc>https:\/\/oficinanapratica\.blog\/blog\/guia-cuidado<\/loc><lastmod>2026-11-13<\/lastmod><image:image><image:loc>https:\/\/oficinanapratica\.blog\/assets\/afiliacao\/manutencao\/guia-cuidado-capa\.webp<\/image:loc><\/image:image>/);
  assert.equal(extras[1].image, post.coverUrl || JSON.parse(post.published_data).coverUrl);
  const pagePrefixXml = sitemapXml('https://portal.exemplo.com', '/s/site', [], extras);
  assert.match(pagePrefixXml, /<image:loc>https:\/\/portal\.exemplo\.com\/assets\/afiliacao\/manutencao\/guia-cuidado-capa\.webp<\/image:loc>/,
    'capa usa caminho absoluto do domínio, sem o prefixo da página');
});

test('calculadora de mistura é exclusiva da Oficina, mostra as três proporções e inclui segurança, fonte e FAQ', () => {
  const handler = rota('/calculadora-mistura-2-tempos')?.handler;
  assert.equal(typeof handler, 'function');
  const { resposta } = chamar(handler, 'oficinanapratica.blog');
  assert.equal(resposta.status, 200);
  assert.match(resposta.headers['Content-Security-Policy'], /script-src[^;]*'unsafe-inline'/);
  assert.match(resposta.body, /<title>Mistura 2 tempos: calculadora de óleo por litro<\/title>/);
  assert.match(resposta.body, /type="application\/rss\+xml"/);
  assert.match(resposta.body, /id="mistura-50">20 mL/);
  assert.match(resposta.body, /id="mistura-40">25 mL/);
  assert.match(resposta.body, /id="mistura-25">40 mL/);
  assert.match(resposta.body, /manual do equipamento/);
  assert.match(resposta.body, /13\/11\/2026/);
  assert.match(resposta.body, /orientacao-as-ferramentas-stihl/);
  assert.match(resposta.body, /FAQPage/);
  assert.doesNotMatch(resposta.body, /<script\s+src=/i, 'não carrega biblioteca JavaScript externa');
  assert.equal(chamar(handler, 'fornecedores.blog').retorno, false, 'a rota não é exibida em outro blog');
});

test('calculadora de markup e margem valida o caso de referência e limita a rota ao Fornecedores', () => {
  const handler = rota('/calculadora-markup-margem')?.handler;
  assert.equal(typeof handler, 'function');
  const { resposta } = chamar(handler, 'fornecedores.blog');
  assert.equal(resposta.status, 200);
  assert.match(resposta.body, /<title>Markup e margem: calculadora de preço de venda<\/title>/);
  assert.match(resposta.body, /value="80"/);
  assert.match(resposta.body, /value="120"/);
  assert.match(resposta.body, /id="diferenca">R\$ 40,00/);
  assert.match(resposta.body, /id="markup-percentual">50%/);
  assert.match(resposta.body, /id="multiplicador">1,50×/);
  assert.match(resposta.body, /id="margem-percentual">33,33%/);
  assert.match(resposta.body, /bdmgorienta\.bdmg\.mg\.gov\.br\/margem-de-lucro/);
  assert.match(resposta.body, /impostos, comissão, frete/);
  assert.match(resposta.body, /FAQPage/);
  assert.doesNotMatch(resposta.body, /<script\s+src=/i, 'não carrega biblioteca JavaScript externa');
  assert.equal(chamar(handler, 'oficinanapratica.blog').retorno, false, 'a rota não é exibida em outro blog');
});

test('as duas ferramentas entram no sitemap só do domínio correspondente', () => {
  const oficina = sitemapFerramentas({ site: { domain: 'oficinanapratica.blog' } });
  const fornecedores = sitemapFerramentas({ site: { domain: 'fornecedores.blog' } });
  assert.equal(oficina[0].path, '/calculadora-mistura-2-tempos');
  assert.equal(fornecedores[0].path, '/calculadora-markup-margem');
  assert.match(oficina[0].lastmod, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(fornecedores[0].lastmod, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(sitemapFerramentas({ site: { domain: 'sublima.casa' } }), []);
});

test('o núcleo do Portal carrega cada ferramenta no domínio próprio', async () => {
  const portal = await startPortal();
  try {
    const admin = client(portal.origin);
    await admin.login('super@teste.local', 'senha-forte-123');
    const abrirSite = async ({ nome, numero, dominio, caminho, titulo }) => {
      const criado = await admin.req('POST', '/api/tenants', { name: nome, number: numero, niche: 'poker', template: 'clube-poker-premium' });
      assert.equal(criado.status, 201, JSON.stringify(criado.data));
      const tenant = criado.data.tenant;
      const site = (await admin.req('GET', `/api/t/${tenant.slug}/sites`)).data.sites[0];
      portal.db.prepare('UPDATE sites SET domain = ? WHERE id = ?').run(dominio, site.id);
      const response = await fetch(`${portal.url}/s/${tenant.slug}${caminho}`);
      const body = await response.text();
      assert.equal(response.status, 200, body);
      assert.match(response.headers.get('content-type') || '', /text\/html; charset=utf-8/);
      assert.match(body, new RegExp(`<title>${titulo}<\\/title>`));
      assert.ok(body.includes(`rel="canonical" href="${portal.origin}/s/${tenant.slug}${caminho}"`));
      return body;
    };
    const mistura = await abrirSite({ nome: 'Oficina de Teste', numero: '10201', dominio: 'oficinanapratica.blog', caminho: '/calculadora-mistura-2-tempos', titulo: 'Mistura 2 tempos: calculadora de óleo por litro' });
    const markup = await abrirSite({ nome: 'Fornecedores de Teste', numero: '10202', dominio: 'fornecedores.blog', caminho: '/calculadora-markup-margem', titulo: 'Markup e margem: calculadora de preço de venda' });
    assert.match(mistura, /id="mistura-25">40 mL/);
    assert.match(markup, /id="margem-percentual">33,33%/);
  } finally {
    await portal.close();
  }
});
