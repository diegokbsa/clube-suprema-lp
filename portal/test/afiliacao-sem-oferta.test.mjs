// Variante sem oferta para tráfego pago (/guia/<slug>, 12/11/2026): nenhum link de compra, convite para o canal da voz,
// noindex com canonical para o post normal e medição do convite e da leitura.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPost } from '../tools/afiliacao-visual.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = path.join(RAIZ, 'conteudo', 'afiliacao');
const j = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const links = j(path.join(C, 'links.json'));
for (const l of Object.values(links)) if (l?.curto) l.url = l.curto;
const dados = { catalogo: j(path.join(C, 'produtos.json')), links };
const aplicarLinks = (t, pre) => String(t).replace(/\{\{LINK:([a-z0-9-]+)\}\}/g, (_m, k) => links[k]?.url || `${pre}/blog`).replace(/\{\{POST:([a-z0-9-]+)\}\}/g, (_m, s) => `${pre}/blog/${s}`);

test('sem-oferta.json só cita posts vivos', () => {
  for (const b of fs.readdirSync(C).filter((d) => fs.existsSync(path.join(C, d, 'sem-oferta.json')))) {
    const slugs = new Set(fs.readdirSync(path.join(C, b, 'posts')).map((f) => j(path.join(C, b, 'posts', f))).filter((p) => !p.redirect).map((p) => p.slug));
    for (const s of j(path.join(C, b, 'sem-oferta.json')).posts) assert.ok(slugs.has(s), `${b}: ${s}`);
  }
});

test('variante sem oferta: zero link de compra, convite, noindex, canonical e eventos', () => {
  for (const b of fs.readdirSync(C).filter((d) => fs.existsSync(path.join(C, d, 'sem-oferta.json')))) {
    const info = j(path.join(C, b, 'site.json')); const v = j(path.join(C, b, 'vitrine.json')); const cfg = j(path.join(C, b, 'sem-oferta.json'));
    const posts = fs.readdirSync(path.join(C, b, 'posts')).sort().map((f) => j(path.join(C, b, 'posts', f))).filter((p) => !p.redirect);
    const prefixo = `https://${info.dominio}`;
    for (const s of cfg.posts) {
      const post = posts.find((p) => p.slug === s);
      const html = renderPost({ info, v, post, posts, prefixo, dados, aplicarLinks, publicado: '2026-11-10T10:00:00Z', semOferta: cfg });
      assert.ok(!/l\.kbsa\.app\/(?!tel-)/.test(html), `${b}/${s}: link do BigLinks de compra`);
      assert.ok(!/shopee\.com\.br|shp\.ee|hotmart|kiwify/.test(html), `${b}/${s}: link direto de loja`);
      assert.ok(!/<aside class="oferta"|<div class="melhor">/.test(html), `${b}/${s}: bloco de oferta`);
      assert.match(html, /<aside class="convite"[^]*data-convite="telegram"/);
      assert.match(html, /<meta name="robots" content="noindex,follow">/);
      assert.ok(html.includes(`<link rel="canonical" href="${prefixo}/blog/${s}">`));
      assert.match(html, /evento\/'\+x/);
      assert.match(html, /LeituraProfunda/);
    }
  }
});
