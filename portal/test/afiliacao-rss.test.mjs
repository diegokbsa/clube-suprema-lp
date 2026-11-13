import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gerarRss, extrairConteudoRss, marcarOrigemRss } from '../lib/rss.mjs';
import { publicRoutes } from '../lib/modules/paginas.mjs';
import { renderHome, renderLista, renderPost, renderInstitucional, renderOfertas, renderStory, posterDa, rssAutodiscovery } from '../tools/afiliacao-visual.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = path.join(RAIZ, 'conteudo', 'afiliacao');
const lerJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const dadosBase = { catalogo: lerJson(path.join(C, 'produtos.json')), links: lerJson(path.join(C, 'links.json')) };
const blogs = fs.readdirSync(C).filter((slug) => fs.existsSync(path.join(C, slug, 'site.json'))).sort();
const escaparRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parsearXml(xml) {
  const codigo = "import json,sys,xml.etree.ElementTree as E; r=E.fromstring(sys.stdin.buffer.read()); n={'c':'http://purl.org/rss/1.0/modules/content/','m':'http://search.yahoo.com/mrss/'}; c=r.find('channel'); itens=[] if c is None else c.findall('item'); print(json.dumps({'title':c.findtext('title'),'site':c.findtext('link'),'items':[{'title':i.findtext('title'),'link':i.findtext('link'),'guid':i.findtext('guid'),'pubDate':i.findtext('pubDate'),'description':i.findtext('description'),'content':i.findtext('c:encoded',namespaces=n),'media':(i.find('m:content',n).attrib if i.find('m:content',n) is not None else None)} for i in itens]}))";
  const exe = process.platform === 'win32' ? 'python' : 'python3';
  const r = spawnSync(exe, ['-c', codigo], { input: Buffer.from(xml, 'utf8'), encoding: 'utf8' });
  assert.ifError(r.error);
  assert.equal(r.status, 0, `XML inválido: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

test('RSS 2.0 é XML válido e preserva caracteres, acentos e HTML depois do parse', () => {
  const xml = gerarRss({ title: 'Achados & <dicas> de café', siteUrl: 'https://achadinhosnapratica.blog/', feedUrl: 'https://achadinhosnapratica.blog/feed.xml',
    description: 'Preço < comparação & contexto', items: [{ title: 'Guia: preço & qualidade <hoje>', link: 'https://achadinhosnapratica.blog/blog/cafe',
      publishedAt: '2026-11-12T18:00:00-03:00', excerpt: 'A & B < C — café especial', content: '<p>Água &amp; moagem &lt; pressa</p>' ,
      coverUrl: 'https://achadinhosnapratica.blog/assets/capa.webp?x=1&y=2', coverType: 'image/webp' }] });
  assert.match(xml, /xmlns:content="http:\/\/purl\.org\/rss\/1\.0\/modules\/content\/"/);
  assert.match(xml, /xmlns:media="http:\/\/search\.yahoo\.com\/mrss\/"/);
  assert.match(xml, /\bpubDate>Thu, 12 Nov 2026 21:00:00 GMT/);
  const parsed = parsearXml(xml);
  assert.equal(parsed.title, 'Achados & <dicas> de café');
  assert.equal(parsed.items[0].title, 'Guia: preço & qualidade <hoje>');
  assert.equal(parsed.items[0].description, 'A & B < C — café especial');
  assert.equal(parsed.items[0].content, '<p>Água &amp; moagem &lt; pressa</p>');
  assert.deepEqual(parsed.items[0].media, { url: 'https://achadinhosnapratica.blog/assets/capa.webp?x=1&y=2', medium: 'image', type: 'image/webp', width: '1200', height: '675' });
});

test('RSS remove pares substitutos Unicode isolados sem corromper caracteres válidos', () => {
  const xml = gerarRss({ title: `Café \uD800 especial \uDC00`, siteUrl: 'https://achadinhosnapratica.blog/',
    feedUrl: 'https://achadinhosnapratica.blog/feed.xml', items: [{ title: 'Água \uD83D\uDCA7 & grão',
      link: 'https://achadinhosnapratica.blog/blog/agua-grao', publishedAt: '2026-11-12T18:00:00Z',
      excerpt: 'Texto \uD800 limpo', content: '<p>Válido \uD83D\uDCA7</p>' }] });
  const parsed = parsearXml(xml);
  assert.equal(parsed.title, 'Café  especial ');
  assert.equal(parsed.items[0].title, 'Água 💧 & grão');
  assert.equal(parsed.items[0].description, 'Texto  limpo');
  assert.equal(parsed.items[0].content, '<p>Válido 💧</p>');
});

test('RSS limita a 40 itens, ordena por data decrescente e mantém o domínio do blog', () => {
  const items = Array.from({ length: 45 }, (_, i) => ({ title: `Post ${i}`, link: `https://sublima.casa/blog/post-${i}`,
    publishedAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString(), excerpt: `Resumo ${i}`, content: `<p>Completo ${i}</p>`, coverUrl: 'https://sublima.casa/capa.webp' }));
  const xml = gerarRss({ title: 'Sublima em Casa', siteUrl: 'https://sublima.casa/', feedUrl: 'https://sublima.casa/feed.xml', items });
  const parsed = parsearXml(xml);
  assert.equal(parsed.items.length, 40);
  assert.equal(parsed.items[0].title, 'Post 44');
  assert.equal(parsed.items.at(-1).title, 'Post 5');
  assert.deepEqual(parsed.items.map((x) => Date.parse(x.pubDate)), [...parsed.items.map((x) => Date.parse(x.pubDate))].sort((a, b) => b - a));
  assert.ok(parsed.items.every((x) => new URL(x.link).hostname === 'sublima.casa'));
});

test('rota /feed.xml só atende blog sinalizado e usa o artigo renderizado com src próprio', () => {
  const marcador = '<!doctype html><html><head data-rss-feed="blogs-afiliado"></head><body></body></html>';
  const slug = 'guia-cafe';
  const html = '<article><p>Texto completo: grão &amp; água.</p><p><a href="https://l.kbsa.app/cafe?src=achadinhos-guia-cafe&amp;utm_source=kbsa_blogs">Conferir</a></p><img src="/assets/miolo.webp" alt="Moagem"></article>';
  assert.equal(extrairConteudoRss(`<div>${html}</div>`), null, 'sem marcadores não se inventa conteúdo');
  const paginas = [{ caminho: '', html: marcador }, { caminho: `blog/${slug}`, html: `<main><!--rss-conteudo-inicio--><article><h1>Guia do café</h1><div class="txt">${html}</div></article><!--rss-conteudo-fim--></main>` }];
  const row = { site_id: 'site-1', published_slug: slug, published_at: '2026-11-12T18:00:00-03:00', cover_url: '/assets/afiliacao/achadinhos/guia-cafe-capa.webp',
    title: 'Guia do café', excerpt: 'Resumo curto', published_data: JSON.stringify({ title: 'Guia do café', excerpt: 'Resumo curto', datePublished: '2026-11-12T18:00:00-03:00', coverUrl: '/assets/afiliacao/achadinhos/guia-cafe-capa.webp' }) };
  const repo = { get: (_t, w) => paginas.find((p) => p.caminho === w.caminho) || null, all: () => [row] };
  const rota = publicRoutes.find((r) => r.path === '/feed.xml');
  let resposta;
  const contexto = { req: { method: 'GET', url: '/feed.xml' }, res: {}, site: { id: 'site-1', name: 'Achadinhos na Prática', domain: 'achadinhosnapratica.blog' },
    tenant: { slug: 'blog-achadinhos' }, repo, origin: 'https://portal.kbsa.app', send: (_res, status, body, headers) => (resposta = { status, body, headers }) };
  rota.handler(contexto);
  assert.equal(resposta.status, 200);
  assert.match(resposta.headers['Content-Type'], /^application\/rss\+xml/);
  const parsed = parsearXml(resposta.body);
  assert.equal(parsed.site, 'https://achadinhosnapratica.blog/');
  assert.equal(parsed.items[0].link, 'https://achadinhosnapratica.blog/blog/guia-cafe');
  assert.equal(parsed.items[0].guid, parsed.items[0].link);
  assert.match(parsed.items[0].content, /^<article>/);
  assert.match(parsed.items[0].content, /Texto completo: grão &amp; água\./);
  assert.match(parsed.items[0].content, /src=rss_guia_cafe/);
  assert.match(parsed.items[0].content, /src="https:\/\/achadinhosnapratica\.blog\/assets\/miolo\.webp"/);
  assert.doesNotMatch(parsed.items[0].content, /\{\{LINK:/);
  assert.equal(parsed.items[0].media.url, 'https://achadinhosnapratica.blog/assets/afiliacao/achadinhos/guia-cafe-capa.webp');

  contexto.repo = { ...repo, get: () => ({ caminho: '', html: '<html><head></head></html>' }) };
  assert.equal(rota.handler(contexto), false, 'não cria feed em site sem autodiscovery de blog');
});

test('todas as páginas geradas dos 10 blogs anunciam o RSS e mostram Assinar por RSS', () => {
  assert.equal(blogs.length, 10, 'o checkout contém os dez blogs da ordem');
  for (const slug of blogs) {
    const info = lerJson(path.join(C, slug, 'site.json'));
    const v = lerJson(path.join(C, slug, 'vitrine.json'));
    const prefixo = `https://${info.dominio}`;
    const posts = fs.readdirSync(path.join(C, slug, 'posts')).sort().map((f) => lerJson(path.join(C, slug, 'posts', f))).filter((p) => !p.redirect);
    const aplicarLinks = (texto) => String(texto).replace(/\{\{LINK:([a-z0-9-]+)\}\}/g, (_m, k) => dadosBase.links[k]?.url || `${prefixo}/blog`)
      .replace(/\{\{POST:([a-z0-9-]+)\}\}/g, (_m, s) => `${prefixo}/blog/${s}`);
    const artigo = posts.find((p) => p.cover) || posts[0];
    const htmls = [renderHome({ info, v, posts, prefixo, dados: dadosBase }), renderLista({ info, v, posts, prefixo }),
      renderPost({ info, v, post: artigo, posts, prefixo, dados: dadosBase, aplicarLinks, publicado: '2026-11-12T18:00:00Z' }),
      renderInstitucional({ pag: 'sobre', info, v, posts, prefixo, medicao: {} }),
      renderOfertas({ info, v, ofertas: { itens: [] }, prefixo, dados: dadosBase })];
    const story = renderStory({ info, v, post: artigo, prefixo, dados: dadosBase });
    const esperado = new RegExp(`<link rel="alternate" type="application/rss\\+xml" title="${escaparRe(info.nome)}" href="${escaparRe(prefixo)}/feed\\.xml" data-rss-feed="blogs-afiliado">`);
    assert.match(rssAutodiscovery(info, prefixo), esperado, `${slug}: autodiscovery da home simples`);
    for (const html of [...htmls, story].filter(Boolean)) {
      assert.match(html, esperado, `${slug}: autodiscovery na página`);
    }
    for (const html of htmls) assert.match(html, /Assinar por RSS/, `${slug}: link discreto no rodapé`);
    if (story) {
      assert.match(story, /<amp-story/, `${slug}: história AMP também anuncia o feed`);
      assert.match(story, /property="og:image:width" content="1200"/);
      assert.match(story, /property="og:image:height" content="1600"/);
      assert.match(story, /<amp-img src="[^"]+" width="1200" height="1600"/);
      assert.match(story, /<amp-story-page id="guia">[\s\S]*?<a class="guia-link"[^>]*>Abrir o guia completo<\/a>[\s\S]*?<amp-story-page-outlink layout="nodisplay"/,
        `${slug}: último quadro tem link visível e CTA AMP nativo`);
    }
    const postHtml = htmls[2];
    assert.ok(extrairConteudoRss(postHtml), `${slug}: conteúdo do post fica marcado para o feed`);
  }
});

test('todas as Web Stories dos posts têm capa e og:image 1200x1600 e link visível no último quadro', () => {
  let total = 0;
  for (const slug of blogs) {
    const info = lerJson(path.join(C, slug, 'site.json'));
    const v = lerJson(path.join(C, slug, 'vitrine.json'));
    const prefixo = `https://${info.dominio}`;
    const posts = fs.readdirSync(path.join(C, slug, 'posts')).sort().map((f) => lerJson(path.join(C, slug, 'posts', f))).filter((p) => !p.redirect && p.cover);
    for (const post of posts) {
      const story = renderStory({ info, v, post, prefixo, dados: dadosBase });
      assert.ok(story, `${slug}/${post.slug}: renderer gera Web Story`);
      const poster = posterDa(post.cover);
      assert.ok(fs.existsSync(path.join(RAIZ, 'public', poster.replace(/^\/+/, ''))), `${slug}/${post.slug}: pôster local existe`);
      const og = /<meta property="og:image" content="([^"]+)"/.exec(story)?.[1] || '';
      assert.ok(og.startsWith(`${prefixo}${poster}?v=`), `${slug}/${post.slug}: og:image usa o pôster retrato`);
      assert.match(story, /property="og:image:width" content="1200"/);
      assert.match(story, /property="og:image:height" content="1600"/);
      assert.match(story, /<amp-img src="[^"]+" width="1200" height="1600"/);
      const ultimo = /<amp-story-page id="guia">([\s\S]*?)<\/amp-story-page>/.exec(story)?.[1] || '';
      assert.match(ultimo, /<a class="guia-link" href="[^"]+\/blog\/[^"]+" target="_blank" rel="noopener">Abrir o guia completo<\/a>/,
        `${slug}/${post.slug}: último quadro mostra o link para o post`);
      total++;
    }
  }
  assert.ok(total > 250, `stories verificadas: ${total}`);
});

test('src do feed substitui a origem do artigo em BigLinks e não deixa macro cru', () => {
  const html = '<a href="https://l.kbsa.app/cafe?src=blog-antigo&amp;utm_campaign=blog-antigo">Oferta</a>';
  const pronto = marcarOrigemRss(html, 'comparar-cafe');
  assert.match(pronto, /src=rss_comparar_cafe/);
  assert.match(pronto, /utm_campaign=rss_comparar_cafe/);
  assert.doesNotMatch(pronto, /\{\{LINK:/);
});
