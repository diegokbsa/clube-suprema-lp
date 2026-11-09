// Esqueleto visual dos blogs de afiliado: home com og:image, card que se adapta ao número de produtos, foto local e títulos em ordem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHome, renderLista, fotoLocal } from '../tools/afiliacao-visual.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = path.join(RAIZ, 'conteudo', 'afiliacao');
const j = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const dados = { catalogo: j(path.join(C, 'produtos.json')), links: j(path.join(C, 'links.json')) };
const blog = (slug) => ({ info: j(path.join(C, slug, 'site.json')), v: j(path.join(C, slug, 'vitrine.json')),
  posts: fs.readdirSync(path.join(C, slug, 'posts')).sort().map((f) => j(path.join(C, slug, 'posts', f))), prefixo: `https://kbsa.app/${slug}`, dados });

test('home: og:image, 1a foto sem lazy, card conforme o número de produtos e sem marcas de IA', () => {
  for (const slug of fs.readdirSync(C).filter((d) => fs.existsSync(path.join(C, d, 'site.json')))) {
    const html = renderHome(blog(slug));
    assert.match(html, /<meta property="og:image" content="https:\/\//, `${slug}: home com og:image`);
    assert.match(html, /<div class="picks n[123]">/, `${slug}: classe do número de produtos`);
    assert.ok(!html.includes('→'), `${slug}: sem seta nos botões`);
    assert.ok(!/class="selo"/.test(html), `${slug}: sem pílula acima do título`);
    const imgs = [...html.matchAll(/<div class="ft"><img ([^>]+)>/g)].map((m) => m[1]);
    assert.ok(imgs.length && /fetchpriority="high"/.test(imgs[0]) && !/loading=/.test(imgs[0]), `${slug}: 1a foto é a do LCP`);
    assert.ok(imgs.slice(1).every((a) => /loading="lazy"/.test(a)), `${slug}: as outras fotos são lazy`);
    const niveis = [...html.matchAll(/<h([1-6])/g)].map((m) => Number(m[1]));
    niveis.forEach((n, i) => assert.ok(i === 0 || n <= niveis[i - 1] + 1, `${slug}: título h${n} depois de h${niveis[i - 1]}`));
  }
});

test('foto local do produto entra no lugar da original quando o webp existe', () => {
  const chave = Object.keys(dados.catalogo).find((k) => fotoLocal(k));
  if (!chave) return; // sem fotos geradas neste checkout
  const slug = fs.readdirSync(C).find((d) => fs.existsSync(path.join(C, d, 'vitrine.json')) && j(path.join(C, d, 'vitrine.json')).destaques?.includes(chave));
  if (!slug) return;
  assert.ok(renderHome(blog(slug)).includes(`src="/assets/afiliacao/produtos/${chave}.webp"`));
});

test('lista: a 1a capa não é lazy e vira og:image', () => {
  const b = blog('gamer');
  const html = renderLista(b);
  const capa = /<img class="gc" ([^>]+)>/.exec(html)?.[1] || '';
  if (!b.posts[0].cover) return;
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
      const temProduto = /class="fixo"/.test(html);
      if (!temProduto) continue;
      assert.ok(/class="(escolha|melhor)"/.test(html), `${slug}/${post.slug}: caixa ou tabela no topo`);
      assert.ok(html.indexOf('class="rapida"') < html.search(/class="(escolha|melhor)"/), `${slug}/${post.slug}: resposta rápida antes da oferta`);
      if (/class="melhor"/.test(html)) comparativos++;
      assert.ok(/class="oferta"/.test(html), `${slug}/${post.slug}: CTA no meio do texto`);
      assert.match(html, /"@type":"Article"[^]*"dateModified"/, `${slug}/${post.slug}: Article com data`);
      assert.match(html, /Atualizado em <time datetime=/, `${slug}/${post.slug}: data de atualização visível`);
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

test('rodapé: canal do Telegram do blog pelo BigLinks, com src próprio que o comOrigem não troca', async () => {
  const { comOrigem } = await import('../tools/afiliacao-visual.mjs');
  for (const slug of fs.readdirSync(C).filter((d) => fs.existsSync(path.join(C, d, 'vitrine.json')))) {
    const b = blog(slug);
    if (!b.v.telegram) continue;
    const html = comOrigem(renderHome(b), `${slug}-home`);
    assert.ok(html.includes(`href="${b.v.telegram.replace(/&/g, '&amp;')}"`), `${slug}: link do Telegram intacto`);
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
  assert.equal(blackFriday(b.v, b.prefixo), fs.readdirSync(path.join(C, 'milhas', 'posts')).some((f) => /black-friday/.test(f)) ? blackFriday(b.v, b.prefixo) : null);
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
