// Afiliação: blog com domínio próprio (site.json "dominio"). O site que estava em kbsa.app/<blog> troca de domínio no
// lugar (mesmo id e mesmos posts) e as páginas passam a sair com canonical e links no domínio novo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../lib/db.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.join(HERE, '..', 'tools', 'afiliacao-instalar.mjs');
const CONTEUDO = path.join(HERE, '..', 'conteudo', 'afiliacao');
const rodar = (dados, conteudo) => {
  const r = spawnSync(process.execPath, [TOOL, '--dados', dados, '--conteudo', conteudo], { encoding: 'utf8' });
  return JSON.parse(r.stdout.trim().split('\n').pop());
};

test('afiliação: kbsa.app/<blog> passa para o domínio próprio sem perder o site', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'afiliacao-dominio-'));
  const dados = path.join(tmp, 'dados'); const conteudo = path.join(tmp, 'conteudo');
  fs.mkdirSync(dados);
  try {
    fs.cpSync(CONTEUDO, conteudo, { recursive: true });
    const blogs = fs.readdirSync(conteudo).filter((d) => fs.existsSync(path.join(conteudo, d, 'site.json')));
    const dominios = {};
    for (const b of blogs) { // primeiro, como era antes: sem "dominio"
      const f = path.join(conteudo, b, 'site.json'); const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      dominios[b] = j.dominio; delete j.dominio; fs.writeFileSync(f, JSON.stringify(j));
    }
    assert.equal(rodar(dados, conteudo).ok, true);
    let db = openDb(path.join(dados, 'portal.db'));
    const antes = Object.fromEntries(db.prepare('SELECT id, domain FROM sites').all().map((s) => [s.domain, s.id]));
    const posts = db.prepare('SELECT count(*) n FROM posts').get().n;
    db.close();
    assert.ok(antes['kbsa.app/fornecedores']);

    for (const b of blogs) { // agora com o domínio próprio
      const f = path.join(conteudo, b, 'site.json'); const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      j.dominio = dominios[b]; fs.writeFileSync(f, JSON.stringify(j));
    }
    const r = rodar(dados, conteudo);
    assert.equal(r.ok, true, r.erro);
    assert.equal(r.relato.filter((l) => /domínio trocado/.test(l)).length, blogs.filter((b) => dominios[b]).length);
    db = openDb(path.join(dados, 'portal.db'));
    const site = db.prepare('SELECT * FROM sites WHERE domain = ?').get('fornecedores.blog');
    assert.equal(site?.id, antes['kbsa.app/fornecedores'], 'mesmo site, só o domínio mudou');
    assert.equal(db.prepare("SELECT count(*) n FROM sites WHERE domain LIKE 'kbsa.app/%'").get().n, 0);
    assert.equal(db.prepare('SELECT count(*) n FROM posts').get().n, posts, 'nenhum post some nem duplica');
    const html = db.prepare('SELECT html FROM paginas_proprias WHERE site_id = ? ORDER BY length(caminho) DESC LIMIT 1').get(site.id)?.html || '';
    assert.match(html, /https:\/\/fornecedores\.blog\//);
    assert.doesNotMatch(html, /https:\/\/kbsa\.app\/fornecedores/);
    db.close();
    const de_novo = rodar(dados, conteudo);
    assert.equal(de_novo.relato.filter((l) => /domínio trocado|site criado/.test(l)).length, 0, 'rodar de novo não muda nada');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
