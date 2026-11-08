// Afiliação: todo link de checkout (Hotmart e Kiwify) sai com ?src=<blog>_<post>, para a venda mostrar de onde veio.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../lib/db.mjs';
import { comOrigem } from '../tools/afiliacao-visual.mjs';

const TOOL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'afiliacao-instalar.mjs');

test('comOrigem: marca checkout, preserva imagem, src existente e âncora', () => {
  assert.equal(comOrigem('https://go.hotmart.com/U108A', 'blog-ia-home'), 'https://go.hotmart.com/U108A?src=blog_ia_home');
  assert.equal(comOrigem('https://pay.hotmart.com/X1?off=a', 'b'), 'https://pay.hotmart.com/X1?off=a&src=b');
  assert.equal(comOrigem('[ver](https://hotm.art/abc)', 'b'), '[ver](https://hotm.art/abc?src=b)');
  assert.equal(comOrigem('https://go.hotmart.com/U1?src=velho', 'novo'), 'https://go.hotmart.com/U1?src=velho');
  assert.equal(comOrigem('https://go.hotmart.com/U1#x', 'b'), 'https://go.hotmart.com/U1?src=b#x');
  const img = 'https://static-media.hotmart.com/foto.png';
  assert.equal(comOrigem(`<img src="${img}">`, 'b'), `<img src="${img}">`);
  assert.equal(comOrigem('https://go.hotmart.com/U1', 'Blog Ação/Teste'), 'https://go.hotmart.com/U1?src=blog_a_o_teste');
  assert.equal(comOrigem('https://kiwify.app/AbC?afid=x', 'b'), 'https://kiwify.app/AbC?afid=x&src=b');
  assert.equal(comOrigem('https://pay.kiwify.com.br/Xy', 'b'), 'https://pay.kiwify.com.br/Xy?src=b');
});

test('instalador: nenhuma página nem post sai com link da Hotmart sem src', () => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'afiliacao-origem-'));
  try {
    const r = spawnSync(process.execPath, [TOOL, '--dados', dados], { encoding: 'utf8' });
    assert.equal(JSON.parse(r.stdout.trim().split('\n').pop()).ok, true, r.stderr);
    const db = openDb(path.join(dados, 'portal.db'));
    const textos = [
      ...db.prepare('SELECT caminho AS onde, html AS t FROM paginas_proprias').all(),
      ...db.prepare('SELECT slug AS onde, content AS t FROM posts').all(),
    ];
    db.close();
    const links = textos.flatMap(({ onde, t }) => [...t.matchAll(/https:\/\/(?:go\.hotmart\.com|pay\.hotmart\.com|hotm\.art|(?:pay\.)?kiwify\.app|pay\.kiwify\.com\.br)\/[^\s"'<>)\]]*/g)].map((m) => [onde, m[0]]));
    assert.ok(links.length > 0, 'deveria haver links da Hotmart nas páginas');
    const sem = links.filter(([, u]) => !/[?&]src=[a-z0-9_]+/.test(u));
    assert.deepEqual(sem, [], 'link da Hotmart sem src');
    assert.ok(links.some(([, u]) => /src=[a-z]+_home/.test(u)), 'a home marca a origem como <blog>_home');
    assert.ok(links.some(([o, u]) => o !== '' && /kiwify/.test(u)), 'posts com Kiwify também levam src');
  } finally {
    fs.rmSync(dados, { recursive: true, force: true });
  }
});

test('BigLinks: produto com "curto" sai por l.kbsa.app com src, utm e rel sponsored; sem "curto" nada muda', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'afiliacao-curto-'));
  try {
    const conteudo = path.join(raiz, 'conteudo');
    fs.cpSync(path.join(path.dirname(TOOL), '..', 'conteudo', 'afiliacao'), conteudo, { recursive: true });
    const lf = path.join(conteudo, 'links.json');
    const links = JSON.parse(fs.readFileSync(lf, 'utf8'));
    const destino = links['posts-virais'].url;
    links['posts-virais'].curto = 'https://l.kbsa.app/posts-virais';
    fs.writeFileSync(lf, JSON.stringify(links));
    const dados = path.join(raiz, 'dados'); fs.mkdirSync(dados);
    const r = spawnSync(process.execPath, [TOOL, '--dados', dados, '--conteudo', conteudo], { encoding: 'utf8' });
    assert.equal(JSON.parse(r.stdout.trim().split('\n').pop()).ok, true, r.stderr);
    const db = openDb(path.join(dados, 'portal.db'));
    const tudo = [...db.prepare('SELECT html AS t FROM paginas_proprias').all(), ...db.prepare('SELECT content AS t FROM posts').all()].map((x) => x.t).join('\n');
    const pagina = db.prepare("SELECT html FROM paginas_proprias WHERE caminho = 'blog/posts-virais-vale-a-pena'").get()?.html || '';
    db.close();
    assert.ok(!tudo.includes(destino.split('?')[0]), 'o checkout do produto com link curto não aparece direto');
    assert.match(pagina, /href="https:\/\/l\.kbsa\.app\/posts-virais\?src=criativos_posts_virais_vale_a_pena&(?:amp;)?utm_source=kbsa_blogs&(?:amp;)?utm_campaign=criativos_posts_virais_vale_a_pena" rel="sponsored nofollow noopener"/);
    assert.match(tudo, /https:\/\/kiwify\.app\/[^"?\s]+\?afid=[^"\s]+&(?:amp;)?src=/, 'os outros produtos seguem direto ao checkout');
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});
