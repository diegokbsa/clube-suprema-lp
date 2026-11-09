// Páginas obrigatórias do AdSense nos 10 blogs, rodapé com links, espaço do script desligado e ads.txt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHome, renderInstitucional, adsenseTag } from '../tools/afiliacao-visual.mjs';
import { PAGINAS } from '../tools/afiliacao-institucional.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = path.join(RAIZ, 'conteudo', 'afiliacao');
const j = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const dados = { catalogo: j(path.join(C, 'produtos.json')), links: j(path.join(C, 'links.json')) };
const blogs = fs.readdirSync(C).filter((d) => fs.existsSync(path.join(C, d, 'site.json')));

test('10 blogs: 6 páginas obrigatórias com o que o AdSense exige', () => {
  assert.equal(blogs.length, 10);
  for (const slug of blogs) {
    const info = j(path.join(C, slug, 'site.json')); const v = j(path.join(C, slug, 'vitrine.json'));
    const prefixo = `https://${info.dominio}`;
    for (const pag of PAGINAS) {
      const html = renderInstitucional({ pag, info, v, prefixo, posts: [], medicao: { ga4: 'G-TESTE' } });
      assert.ok(!/\$\{|undefined|\[object/.test(html), `${slug}/${pag}: sem sobra de template`);
      assert.match(html, new RegExp(`<link rel="canonical" href="${prefixo}/${pag}">`), `${slug}/${pag}: canonical`);
      assert.match(html, /<h1>/, `${slug}/${pag}: h1`);
      assert.ok(!/p[oô]quer|aposta|cassino/i.test(html.replace(/aposta/g, '')), `${slug}/${pag}: sem jogo de azar`);
      if (pag === 'privacidade') for (const t of ['cookies', 'AdSense', 'Google Analytics', 'LGPD']) assert.ok(html.includes(t), `${slug}: privacidade cita ${t}`);
      if (pag === 'contato') assert.match(html, new RegExp(`mailto:contato@${info.dominio.replace('.', '\.')}`), `${slug}: e-mail de contato`);
    }
  }
});

test('rodapé liga as páginas obrigatórias e o script do AdSense nasce desligado', () => {
  const slug = blogs[0]; const info = j(path.join(C, slug, 'site.json')); const v = j(path.join(C, slug, 'vitrine.json'));
  const posts = fs.readdirSync(path.join(C, slug, 'posts')).sort().map((f) => j(path.join(C, slug, 'posts', f)));
  const html = renderHome({ info, v, posts, prefixo: `https://${info.dominio}`, dados });
  for (const p of PAGINAS) assert.ok(html.includes(`href="https://${info.dominio}/${p}"`), `rodapé liga /${p}`);
  assert.ok(!html.includes('googlesyndication'), 'sem script de anúncio por padrão');
  assert.match(adsenseTag({ ativo: false, cliente: 'ca-pub-1234567890123456' }), /desligado/);
  assert.match(adsenseTag({ ativo: true, cliente: 'ca-pub-123' }), /desligado/, 'ID inválido não liga');
  assert.match(adsenseTag({ ativo: true, cliente: 'ca-pub-1234567890123456' }), /adsbygoogle\.js\?client=ca-pub-1234567890123456/);
});
