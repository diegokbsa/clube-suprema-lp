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
