// Esqueleto visual dos blogs de afiliado: home com og:image, card que se adapta ao número de produtos, foto local e títulos em ordem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHome, renderLista, fotoLocal } from '../tools/afiliacao-visual.mjs';
import { plantaDe, PLANTAS } from '../tools/afiliacao-temas.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = path.join(RAIZ, 'conteudo', 'afiliacao');
const j = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const dados = { catalogo: j(path.join(C, 'produtos.json')), links: j(path.join(C, 'links.json')) };
const blog = (slug) => ({ info: j(path.join(C, slug, 'site.json')), v: j(path.join(C, slug, 'vitrine.json')),
  posts: fs.readdirSync(path.join(C, slug, 'posts')).sort().map((f) => j(path.join(C, slug, 'posts', f))), prefixo: `https://kbsa.app/${slug}`, dados });

test('home: og:image, foto do destaque sem lazy, voz assinando, Publicidade nas fichas e sem marcas de IA', () => {
  for (const slug of fs.readdirSync(C).filter((d) => fs.existsSync(path.join(C, d, 'site.json')))) {
    const html = renderHome(blog(slug));
    assert.match(html, /<meta property="og:image" content="https:\/\//, `${slug}: home com og:image`);
    assert.ok(!html.includes('→'), `${slug}: sem seta nos botões`);
    assert.ok(!/class="selo"/.test(html), `${slug}: sem pílula acima do título`);
    const imgs = [...html.matchAll(/<img ([^>]+)>/g)].map((m) => m[1]);
    const lcp = imgs.filter((a) => /fetchpriority="high"/.test(a));
    const pl = plantaDe(slug).home;
    // almanaque (c) não tem foto na primeira dobra: nada de preload nem de imagem com prioridade
    assert.equal(lcp.length, pl === 'c' ? 0 : 1, `${slug}: imagem de LCP`);
    if (lcp[0]) assert.ok(!/loading=/.test(lcp[0]), `${slug}: a foto do destaque não é lazy`);
    assert.ok(imgs.filter((a) => !/fetchpriority/.test(a)).every((a) => /loading="lazy"/.test(a)), `${slug}: as outras imagens são lazy`);
    assert.equal(/<link rel="preload" as="image"/.test(html), pl !== 'c', `${slug}: preload da foto só quando ela está no topo`);
    assert.match(html, new RegExp(`<body class="pl-${pl}">`), `${slug}: planta da home`);
    assert.match(html, /<aside class="voz[ "][^]*com IA/, `${slug}: voz do blog declarada como personagem de IA`);
    assert.match(html, /<span class="pub">Publicidade/, `${slug}: rótulo de publicidade nas fichas`);
    assert.match(html, /@font-face\{font-family:'Titulo';src:url\(\/assets\/fontes\/[a-z-]+\.woff2\)/, `${slug}: fonte servida pelo Portal`);
    assert.ok(!/fonts\.googleapis/.test(html), `${slug}: sem Google Fonts na página`);
    const niveis = [...html.matchAll(/<h([1-6])/g)].map((m) => Number(m[1]));
    niveis.forEach((n, i) => assert.ok(i === 0 || n <= niveis[i - 1] + 1, `${slug}: título h${n} depois de h${niveis[i - 1]}`));
  }
});

test('foto local do produto entra no lugar da original quando o webp existe', () => {
  const chave = Object.keys(dados.catalogo).find((k) => fotoLocal(k));
  if (!chave) return; // sem fotos geradas neste checkout
  const slug = fs.readdirSync(C).find((d) => fs.existsSync(path.join(C, d, 'vitrine.json')) && j(path.join(C, d, 'vitrine.json')).destaques?.includes(chave));
  if (!slug) return;
  const html = renderHome(blog(slug));
  assert.ok(html.includes(`/assets/afiliacao/produtos/${chave}.webp`) || html.includes(`/assets/afiliacao/r/produtos/${chave}-`), 'foto local (ou a variante dela)');
});

test('lista: a 1a imagem não é lazy e a capa vira og:image', () => {
  const b = blog('gamer');
  const html = renderLista(b);
  const capa = /<img class="gc" ([^>]+)>/.exec(html)?.[1] || '';
  assert.ok(/fetchpriority="high"/.test(capa) && !/loading=/.test(capa));
  assert.match(html, /<meta property="og:image" content="https:\/\/kbsa\.app\/assets\/afiliacao\/gamer\//);
});

test('post: caixa no topo ou tabela "melhor escolha", CTA no meio, relacionados e links entre blogs', async () => {
  const { renderPost, relacionados, deOutrosBlogs } = await import('../tools/afiliacao-visual.mjs');
  const aplicarLinks = (t, pre) => String(t).replace(/\{\{LINK:([a-z0-9-]+)\}\}/g, (_m, k) => dados.links[k]?.url || `${pre}/blog`).replace(/\{\{POST:([a-z0-9-]+)\}\}/g, (_m, s) => `${pre}/blog/${s}`);
  let comparativos = 0; let entreBlogs = 0;
  for (const slug of fs.readdirSync(C).filter((d) => fs.existsSync(path.join(C, d, 'vitrine.json')))) {
    const b = blog(slug);
    for (const post of b.posts) {
      const html = renderPost({ ...b, post, aplicarLinks, publicado: '2026-11-08T10:00:00Z', atualizado: '2026-11-09T10:00:00Z' });
      // oferta com menor destaque: no máximo 1 bloco, depois do 1º intertítulo, nunca no topo; sem barra fixa nem cartão lateral
      const blocos = (html.match(/<aside class="oferta"|<div class="melhor">/g) || []).length;
      assert.ok(blocos <= 1, `${slug}/${post.slug}: ${blocos} blocos de oferta`);
      assert.ok(!/class="fixo"|class="escolha/.test(html), `${slug}/${post.slug}: sem barra fixa nem caixa no topo`);
      if (blocos) assert.ok(html.search(/<aside class="oferta"|<div class="melhor">/) > html.indexOf('<h2 id='), `${slug}/${post.slug}: oferta depois do começo do texto`);
      if (/<div class="melhor">/.test(html)) comparativos++;
      if (!blocos) continue;
      assert.match(html, /"@type":"Article"[^]*"dateModified"/, `${slug}/${post.slug}: Article com data`);
      assert.match(html, /Atualizado em<\/dt><dd><time datetime=/, `${slug}/${post.slug}: data de atualização visível`);
      assert.match(html, /<div class="assina">[^]*com IA/, `${slug}/${post.slug}: assinatura da voz`);
      assert.ok((html.match(/<span class="pub">Publicidade<\/span>/g) || []).length >= 1, `${slug}/${post.slug}: oferta com "Publicidade"`);
      const rel = relacionados(post, b.posts);
      assert.ok(!rel.some((p) => p.slug === post.slug) && rel.length <= 3);
      const viz = deOutrosBlogs(b.info, post);
      assert.ok(viz.length <= 2 && viz.every((x) => /^https:\/\//.test(x.url) && !x.url.startsWith(b.prefixo)));
      if (viz.length) entreBlogs++;
    }
  }
  assert.ok(comparativos > 0, 'algum post comparativo com tabela');
  assert.ok(entreBlogs > 0, 'algum post com link para outro blog');
});

// 12/11/2026: o botão sai sem o src fixo da vitrine; o comOrigem põe o da página (site_post), que o BigLinks grava na coluna src.
// O canal continua no próprio link (slug tel-*), e o destino t.me guarda o src=telegram_<blog> dele (o link não repassa parâmetros).
test('rodapé: canal do Telegram do blog pelo BigLinks, com o src da página e nofollow', async () => {
  const { comOrigem } = await import('../tools/afiliacao-visual.mjs');
  for (const slug of fs.readdirSync(C).filter((d) => fs.existsSync(path.join(C, d, 'vitrine.json')))) {
    const b = blog(slug);
    if (!b.v.telegram) continue;
    const html = comOrigem(renderHome(b), `${slug}-home`);
    const base = b.v.telegram.split('?')[0];
    assert.ok(html.includes(`href="${base}?src=${slug}_home&utm_source=kbsa_blogs&utm_campaign=${slug}_home" rel="nofollow noopener"`), `${slug}: link do Telegram com a origem da página`);
    assert.match(b.v.telegram, /^https:\/\/l\.kbsa\.app\/tel-[a-z]+-[a-z0-9]+\?src=telegram_/);
    assert.ok(b.v.telegram.endsWith(`src=telegram_${slug}&utm_source=kbsa_blogs&utm_campaign=telegram_${slug}`), `${slug}: origem do clique`);
  }
});

test('newsletter: formulário LGPD pronto e desligado até a rota /inscricoes responder', async () => {
  const { inscricao, INSCRICOES_NO_AR } = await import('../tools/afiliacao-visual.mjs');
  for (const slug of fs.readdirSync(C).filter((d) => fs.existsSync(path.join(C, d, 'vitrine.json')))) {
    const b = blog(slug);
    assert.equal(b.v.inscricao?.blog, slug, `${slug}: vitrine.inscricao.blog`);
    assert.ok(b.v.inscricao?.brinde, `${slug}: título do brinde`);
    const f = inscricao(b.info, b.v);
    assert.ok(f.includes(`data-blog="${slug}"`) && f.includes('https://kbsa.app/inscricoes/inscrever'));
    assert.match(f, /<input name="consentimento" type="checkbox" required>/, 'consentimento desmarcado');
    assert.ok(!/checked/.test(f.replace(/\.checked/g, '')), 'nada vem marcado');
    assert.match(f, /<input class="isca" name="site" tabindex="-1"/);
    assert.equal(renderHome(b).includes('form class="inscricao"'), INSCRICOES_NO_AR, `${slug}: só aparece quando ligado`);
  }
});

test('Black Friday 2026: faixa, menu e rodapé só no blog com o post BF e só até 01/12', async () => {
  const { blackFriday, BF_ATE } = await import('../tools/afiliacao-visual.mjs');
  const arq = path.join(C, 'milhas', 'posts', '99-teste-bf.json');
  const b = blog('milhas');
  assert.deepEqual(blackFriday(b.v, b.prefixo), fs.readdirSync(path.join(C, 'milhas', 'posts')).some((f) => /black-friday/.test(f)) ? blackFriday(b.v, b.prefixo) : null);
  fs.writeFileSync(arq, JSON.stringify({ slug: 'black-friday-2026-ofertas-de-milhas', title: 'BF', content: 'x' }));
  try {
    const bf = blackFriday(b.v, b.prefixo, Date.parse('2026-11-20T12:00:00Z'));
    assert.equal(bf.url, `${b.prefixo}/blog/black-friday-2026-ofertas-de-milhas`);
    assert.equal(blackFriday(b.v, b.prefixo, BF_ATE), null, 'some depois de 01/12');
    const html = renderHome(blog('milhas'));
    if (Date.now() < BF_ATE) {
      assert.match(html, /<div class="bf" data-ate="\d+">/);
      assert.ok((html.match(/black-friday-2026-ofertas-de-milhas/g) || []).length >= 3, 'faixa, menu e rodapé');
    }
    assert.ok(!renderHome(blog('gamer')).includes('class="bf"') || fs.readdirSync(path.join(C, 'gamer', 'posts')).some((f) => /black-friday/.test(f)), 'blog sem post BF não ganha faixa');
  } finally { fs.rmSync(arq, { force: true }); }
});

test('plantas: pelo menos 3 de home e 3 de post, e nenhum par home+post repetido entre os blogs', () => {
  const v = Object.values(PLANTAS);
  assert.ok(new Set(v.map((x) => x.home)).size >= 3 && new Set(v.map((x) => x.post)).size >= 3);
  const pares = v.map((x) => `${x.home}${x.post}`);
  assert.equal(new Set(pares).size, pares.length, pares.join(' '));
});

test('Black Friday: texto da faixa vem do post (faixa ou título) e "faixa": false tira faixa e menu', async () => {
  const { blackFriday } = await import('../tools/afiliacao-visual.mjs');
  const arq = path.join(C, 'milhas', 'posts', '98-teste-bf-faixa.json');
  const antes = fs.readdirSync(path.join(C, 'milhas', 'posts')).filter((f) => /black-friday/.test(f));
  if (antes.length) return; // o blog já tem post de BF: o teste com arquivo falso confundiria os dois
  const b = blog('milhas'); const quando = Date.parse('2026-11-20T12:00:00Z');
  try {
    fs.writeFileSync(arq, JSON.stringify({ slug: 'black-friday-2026-ofertas-de-milhas', title: 'Título do Rafa', content: 'x' }));
    assert.equal(blackFriday(b.v, b.prefixo, quando).faixa, 'Título do Rafa');
    fs.writeFileSync(arq, JSON.stringify({ slug: 'black-friday-2026-ofertas-de-milhas', title: 'Título do Rafa', faixa: 'Faz a conta da Black Friday comigo', content: 'x' }));
    assert.equal(blackFriday(b.v, b.prefixo, quando).faixa, 'Faz a conta da Black Friday comigo');
    fs.writeFileSync(arq, JSON.stringify({ slug: 'black-friday-2026-ofertas-de-milhas', title: 'Guia', faixa: false, content: 'x' }));
    const bf = blackFriday(b.v, b.prefixo, quando);
    assert.equal(bf.faixa, null); assert.equal(bf.titulo, 'Guia');
  } finally { fs.rmSync(arq, { force: true }); }
});

test('Black Friday: nenhum blog com o mesmo texto de faixa', async () => {
  const { blackFriday } = await import('../tools/afiliacao-visual.mjs');
  const textos = fs.readdirSync(C).filter((d) => fs.existsSync(path.join(C, d, 'vitrine.json')))
    .map((d) => blackFriday(blog(d).v, blog(d).prefixo, Date.parse('2026-11-20T12:00:00Z'))?.faixa).filter(Boolean);
  assert.equal(new Set(textos).size, textos.length, textos.join(' | '));
});
