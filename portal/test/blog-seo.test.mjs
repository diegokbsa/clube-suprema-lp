// Blog + SEO do núcleo: publicação, metadados, feed, recomendações e sitemap.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPortal, client } from './helpers.mjs';

let P; let sup; let site;
const calls = [];
before(async () => {
  P = await startPortal({ origin: 'https://portal.exemplo.com', fetchImpl: async (_url, init) => { calls.push(JSON.parse(init.body)); return { status: 202 }; } });
  sup = client(P.url);
  await sup.login('super@teste.local', 'senha-forte-123');
  await sup.req('POST', '/api/tenants', { name: 'Clube Blog', number: '40001', niche: 'poker', template: 'clube-poker-premium' });
  site = (await sup.req('GET', '/api/t/clube-40001/sites')).data.sites[0];
});
after(() => P.close());
const wait = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (condition, description, timeout = 5_000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await condition();
    if (result) return result;
    await wait(25);
  }
  throw new Error(`Tempo esgotado aguardando ${description}.`);
};
const postUrl = (slug) => `https://portal.exemplo.com/s/clube-40001/blog/${slug}`;
const createPost = async (overrides = {}) => {
  const result = await sup.req('POST', '/api/t/clube-40001/posts', {
    siteId: site.id, title: 'Como funciona o torneio de sábado', slug: 'torneio-de-sabado',
    content: 'Texto do artigo com regras e horários do torneio de sábado no clube.', excerpt: 'Regras e horários.', category: 'Torneios', author: 'Equipe',
    ...overrides,
  });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return result.data.post;
};
const publishPost = async (post) => {
  const result = await sup.req('POST', `/api/t/clube-40001/posts/${post.id}/publish`);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  await wait();
  return result.data.post;
};

test('publicar post anuncia IndexNow e Google, entra no sitemap e some ao despublicar', async () => {
  const post = await createPost();
  const url = postUrl(post.slug);
  const before = calls.length;
  await publishPost(post);
  const sent = calls.slice(before).filter((call) => call.urlList.includes(url));
  assert.equal(sent.length, 1);
  assert.ok(sent[0].urlList.includes('https://portal.exemplo.com/s/clube-40001/blog'));

  const seo = (await sup.req('GET', '/api/t/clube-40001/seo')).data;
  const events = seo.events.filter((event) => event.reason === 'publicacao');
  assert.equal(events.find((event) => event.engine === 'indexnow' && event.urls.includes(url))?.status, 'recebido');
  assert.equal(events.find((event) => event.engine === 'google_search_console')?.status, 'pendente_conexao');

  let sitemap = (await sup.req('GET', '/s/clube-40001/sitemap.xml', undefined, { raw: true })).data;
  assert.match(sitemap, /\/s\/clube-40001\/blog\/torneio-de-sabado<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  assert.match(sitemap, /\/s\/clube-40001\/blog<\/loc>/);
  const beforeRemoval = calls.length;
  await sup.req('POST', `/api/t/clube-40001/posts/${post.id}/unpublish`);
  await wait();
  const removed = calls.slice(beforeRemoval).filter((call) => call.urlList.includes(url));
  assert.equal(removed.length, 1);
  assert.ok(removed[0].urlList.includes('https://portal.exemplo.com/s/clube-40001/blog'));
  const afterRemoval = (await sup.req('GET', '/api/t/clube-40001/seo')).data.events.filter((event) => event.reason === 'remocao');
  assert.equal(afterRemoval.find((event) => event.engine === 'indexnow' && event.urls.includes(url))?.status, 'recebido');
  assert.equal(afterRemoval.find((event) => event.engine === 'google_search_console')?.status, 'pendente_conexao');
  sitemap = (await sup.req('GET', '/s/clube-40001/sitemap.xml', undefined, { raw: true })).data;
  assert.doesNotMatch(sitemap, /torneio-de-sabado/);
  const feed = (await sup.req('GET', '/s/clube-40001/blog/feed.xml', undefined, { raw: true })).data;
  assert.doesNotMatch(feed, /torneio-de-sabado/);
});

test('post agendado só anuncia quando publica e apenas uma vez', async () => {
  const post = await createPost({ title: 'Agenda de torneio', slug: 'agenda-de-torneio' });
  const url = postUrl(post.slug);
  const before = calls.length;
  const previousEvents = (await sup.req('GET', '/api/t/clube-40001/seo')).data.events;
  const scheduled = await sup.req('POST', `/api/t/clube-40001/posts/${post.id}/schedule`, { scheduledAt: new Date(Date.now() + 200).toISOString() });
  assert.equal(scheduled.status, 200, JSON.stringify(scheduled.data));
  assert.equal(calls.slice(before).filter((call) => call.urlList.includes(url)).length, 0);
  await waitFor(async () => {
    const posts = (await sup.req('GET', `/api/t/clube-40001/posts?siteId=${encodeURIComponent(site.id)}`)).data.posts;
    return posts.find((item) => item.id === post.id)?.status === 'publicado';
  }, 'a publicação agendada');
  await waitFor(() => calls.slice(before).filter((call) => call.urlList.includes(url)).length === 1, 'o anúncio SEO');
  await wait(1100); // Aguarda mais um ciclo conhecido do agendador, que verifica a fila a cada 1 s.
  assert.equal(calls.slice(before).filter((call) => call.urlList.includes(url)).length, 1);
  const allEvents = (await sup.req('GET', '/api/t/clube-40001/seo')).data.events;
  const newEvents = allEvents.slice(0, allEvents.length - previousEvents.length);
  assert.equal(newEvents.filter((event) => event.engine === 'indexnow' && event.urls.includes(url) && event.status === 'recebido').length, 1);
  assert.equal(newEvents.filter((event) => event.engine === 'google_search_console' && event.status === 'pendente_conexao').length, 1);
});

test('artigo oferece checklist, links relacionados, JSON-LD e feed RSS', async () => {
  const content = Array.from({ length: 151 }, () => 'estratégia').join(' ');
  const related = await createPost({ title: 'Guia de fundamentos', slug: 'guia-de-fundamentos', category: 'Estratégia', tags: ['iniciante'], content });
  await publishPost(related);
  const post = await createPost({
    title: 'Estratégia & posição no poker', slug: 'posicao-no-poker', category: 'Estratégia', tags: ['iniciante', 'posição'],
    author: 'Equipe Editorial', excerpt: 'Um guia de estratégia e posição para quem está começando.',
    seoTitle: 'Estratégia & posição no poker: guia prático',
    seoDescription: 'Entenda como a posição muda as decisões e descubra conceitos essenciais para jogar com mais clareza.',
    coverUrl: '/assets/capa.webp', content,
  });
  assert.equal(post.suggestedInternalLinks[0]?.slug, related.slug);
  assert.equal(post.seoChecklist.find((item) => item.id === 'linksInternos')?.ok, true);
  const published = await publishPost(post);
  assert.equal(published.suggestedInternalLinks[0]?.slug, related.slug);

  const posts = (await sup.req('GET', `/api/t/clube-40001/posts?siteId=${encodeURIComponent(site.id)}`)).data.posts;
  const listed = posts.find((item) => item.id === post.id);
  assert.deepEqual(new Set(listed.seoChecklist.map((item) => item.id)), new Set(['titulo', 'descricao', 'h1', 'linksInternos', 'altCapa', 'tamanho']));
  assert.ok(listed.seoChecklist.every((item) => typeof item.ok === 'boolean' && item.msg));
  assert.equal(listed.seoChecklist.find((item) => item.id === 'linksInternos').ok, true);
  assert.equal(listed.seoChecklist.find((item) => item.id === 'altCapa').ok, true);
  assert.equal(listed.seoChecklist.find((item) => item.id === 'tamanho').ok, true);
  assert.equal(listed.suggestedInternalLinks[0].slug, related.slug);
  assert.equal(listed.suggestedInternalLinks[0].url, `/blog/${related.slug}`);

  const article = await sup.req('GET', `/s/clube-40001/blog/${post.slug}`, undefined, { raw: true });
  assert.equal(article.status, 200);
  assert.match(article.data, new RegExp(`<link rel="canonical" href="https://portal\\.exemplo\\.com/s/clube-40001/blog/${post.slug}">`));
  assert.match(article.data, /<meta property="og:title" content="Estratégia &amp; posição no poker: guia prático · Clube Blog">/);
  assert.match(article.data, /<meta property="og:image" content="https:\/\/portal\.exemplo\.com\/assets\/capa\.webp">/);
  assert.match(article.data, /<h1>Estratégia &amp; posição no poker<\/h1>/);
  assert.match(article.data, /<img class="blog-cover"[^>]+alt="Estratégia &amp; posição no poker"/);
  const scripts = [...article.data.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  const ld = JSON.parse(scripts[0][1]);
  const graph = ld['@graph'];
  const schemaArticle = graph.find((item) => item['@type'] === 'Article');
  const breadcrumbs = graph.find((item) => item['@type'] === 'BreadcrumbList');
  assert.equal(schemaArticle.headline, post.title);
  assert.ok(Number.isFinite(Date.parse(schemaArticle.datePublished)));
  assert.ok(Number.isFinite(Date.parse(schemaArticle.dateModified)));
  assert.equal(schemaArticle.author.name, post.author);
  assert.equal(schemaArticle.image, 'https://portal.exemplo.com/assets/capa.webp');
  assert.equal(breadcrumbs.itemListElement.length, 3);
  assert.match(article.data, new RegExp(`href="/s/clube-40001/blog/${related.slug}"[^>]*>${related.title}<`));

  const feed = await sup.req('GET', '/s/clube-40001/blog/feed.xml', undefined, { raw: true });
  assert.equal(feed.status, 200);
  assert.match(feed.headers.get('content-type'), /^application\/rss\+xml; charset=utf-8/);
  assert.match(feed.data, /<rss version="2\.0"/);
  assert.match(feed.data, /<title>Estratégia &amp; posição no poker<\/title>/);
  assert.match(feed.data, new RegExp(`<link>${postUrl(post.slug).replaceAll('.', '\\.')}<\/link>`));
  assert.match(feed.data, /<pubDate>[^<]+<\/pubDate>/);
});

test('checklist avalia o tamanho real dos metadados sem truncar', async () => {
  const post = await createPost({
    title: `Título ${'comprido '.repeat(10)}`, slug: 'metadados-acima-do-limite', seoTitle: '',
    excerpt: 'Descrição longa '.repeat(12), seoDescription: '',
  });
  assert.equal(post.seoChecklist.find((item) => item.id === 'titulo')?.ok, false);
  assert.equal(post.seoChecklist.find((item) => item.id === 'descricao')?.ok, false);
});

test('revisão preserva a data original e atualiza dateModified e sitemap', async () => {
  const post = await createPost({ title: 'Versão original do artigo', slug: 'versao-original', content: 'Conteúdo original.' });
  await publishPost(post);
  const articleUrl = `/s/clube-40001/blog/${post.slug}`;
  const readArticle = async () => {
    const response = await sup.req('GET', articleUrl, undefined, { raw: true });
    const script = response.data.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    return JSON.parse(script)['@graph'].find((item) => item['@type'] === 'Article');
  };
  const original = await readArticle();
  await wait(1100);
  const updated = await sup.req('PUT', `/api/t/clube-40001/posts/${post.id}`, {
    siteId: site.id, title: 'Versão revisada do artigo', slug: post.slug, category: 'Torneios', author: 'Equipe',
    excerpt: 'Resumo da versão revisada.', content: 'Conteúdo revisado.', seoTitle: 'Versão revisada do artigo',
    seoDescription: 'Uma descrição revisada do artigo, com informação adicional para o leitor e o mecanismo de busca.',
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  const stillPublished = await readArticle();
  assert.equal(stillPublished.headline, original.headline);
  assert.equal(stillPublished.datePublished, original.datePublished);
  assert.equal(stillPublished.dateModified, original.dateModified);

  await publishPost(post);
  const revised = await readArticle();
  assert.equal(revised.headline, 'Versão revisada do artigo');
  assert.equal(revised.datePublished, original.datePublished);
  assert.ok(Date.parse(revised.dateModified) > Date.parse(original.dateModified));
  const sitemap = (await sup.req('GET', '/s/clube-40001/sitemap.xml', undefined, { raw: true })).data;
  const lastmod = new Date(revised.dateModified).toISOString().slice(0, 10);
  assert.match(sitemap, new RegExp(`<loc>https://portal\\.exemplo\\.com/s/clube-40001/blog/${post.slug}<\\/loc><lastmod>${lastmod}<\\/lastmod>`));
});
