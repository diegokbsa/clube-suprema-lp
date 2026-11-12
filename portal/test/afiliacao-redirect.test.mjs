// Post fundido em outro (Mesa de Copy, 12/11/2026): {"slug":"antigo","redirect":"destino"} vira 301 e sai do sitemap e da home.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../lib/db.mjs';
import { paginaPropria, htmlRedirect, REDIRECT } from '../lib/modules/paginas.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(RAIZ, 'tools', 'afiliacao-instalar.mjs');

test('documento de redirecionamento: só caminho local, com noindex e canonical', () => {
  const h = htmlRedirect('/blog/destino');
  assert.equal(REDIRECT.exec(h)?.[1], '/blog/destino');
  assert.match(h, /<meta name="robots" content="noindex">/);
  assert.equal(REDIRECT.exec(htmlRedirect('https://golpe.example/x')), null, 'endereço de fora não vira 301');
});

test('instalador: post com "redirect" responde 301, sai do sitemap e da home; destino inexistente é ignorado', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'afiliacao-redirect-'));
  try {
    const conteudo = path.join(raiz, 'conteudo');
    fs.cpSync(path.join(RAIZ, 'conteudo', 'afiliacao'), conteudo, { recursive: true });
    const dir = path.join(conteudo, 'milhas', 'posts');
    const arqs = fs.readdirSync(dir).sort();
    const destino = JSON.parse(fs.readFileSync(path.join(dir, arqs[0]), 'utf8')).slug;
    const antigo = JSON.parse(fs.readFileSync(path.join(dir, arqs[1]), 'utf8'));
    fs.writeFileSync(path.join(dir, arqs[1]), JSON.stringify({ slug: antigo.slug, redirect: destino }));
    const ruim = JSON.parse(fs.readFileSync(path.join(dir, arqs[2]), 'utf8'));
    fs.writeFileSync(path.join(dir, arqs[2]), JSON.stringify({ ...ruim, redirect: 'nao-existe' }));
    const dados = path.join(raiz, 'dados'); fs.mkdirSync(dados);
    const r = spawnSync(process.execPath, [TOOL, '--dados', dados, '--conteudo', conteudo], { encoding: 'utf8' });
    const saida = JSON.parse(r.stdout.trim().split('\n').pop());
    assert.equal(saida.ok, true, r.stderr);
    assert.ok(JSON.stringify(saida.relato).includes('nao-existe'), 'avisa o destino inexistente');
    const db = openDb(path.join(dados, 'portal.db'));
    const site = db.prepare("SELECT * FROM sites WHERE domain = 'milhas.blog'").get();
    const pag = db.prepare('SELECT * FROM paginas_proprias WHERE site_id = ? AND caminho = ?').get(site.id, `blog/${antigo.slug}`);
    const home = db.prepare("SELECT html FROM paginas_proprias WHERE site_id = ? AND caminho = ''").get(site.id).html;
    const post = db.prepare('SELECT * FROM posts WHERE site_id = ? AND slug = ?').get(site.id, antigo.slug);
    const repo = { get: (t, w) => db.prepare(`SELECT * FROM ${t} WHERE site_id = ? AND caminho = ?`).get(w.site_id, w.caminho) };
    const resp = paginaPropria({ req: { method: 'GET' }, site, repo, rest: `blog/${antigo.slug}` });
    const outro = db.prepare('SELECT html FROM paginas_proprias WHERE site_id = ? AND caminho = ?').get(site.id, `blog/${ruim.slug}`);
    db.close();
    assert.equal(Number(pag.indexar), 0, 'fora do sitemap');
    assert.equal(post, undefined, 'post fundido não é publicado');
    assert.equal(resp.status, 301);
    assert.equal(resp.headers.Location, `/blog/${destino}`);
    assert.ok(!home.includes(`/blog/${antigo.slug}"`), 'some da home');
    assert.ok(!REDIRECT.test(outro.html), 'redirect para post inexistente é ignorado e o post continua');
  } finally { fs.rmSync(raiz, { recursive: true, force: true }); }
});
