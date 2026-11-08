// Afiliação: cada blog vira um cliente (operação) próprio, e um blog que estava na operação única é movido com tudo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../lib/db.mjs';

const TOOL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'afiliacao-instalar.mjs');
const rodar = (dados, ...extra) => {
  const r = spawnSync(process.execPath, [TOOL, '--dados', dados, ...extra], { encoding: 'utf8' });
  return JSON.parse(r.stdout.trim().split('\n').pop());
};

test('afiliação: um cliente por blog, migrando da operação única sem perder nada', () => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'afiliacao-clientes-'));
  try {
    let db = openDb(path.join(dados, 'portal.db'));
    db.prepare("INSERT INTO users (id, email, name, pass, is_super, created_at) VALUES ('u1', 'dono@teste.local', 'Dono', 'x', 0, '2026-11-08')").run();
    db.close();
    assert.equal(rodar(dados, '--cliente-unico').ok, true);
    db = openDb(path.join(dados, 'portal.db'));
    const base = db.prepare("SELECT id FROM tenants WHERE slug = 'afiliacao'").get();
    db.prepare('INSERT INTO memberships (user_id, tenant_id, role) VALUES (?, ?, ?)').run('u1', base.id, 'dono');
    const blogs = db.prepare('SELECT count(*) n FROM sites WHERE tenant_id = ?').get(base.id).n;
    const posts = db.prepare('SELECT count(*) n FROM posts').get().n;
    db.close();

    const seco = rodar(dados, '--seco');
    assert.equal(seco.ok, true);
    db = openDb(path.join(dados, 'portal.db'));
    assert.equal(db.prepare('SELECT count(*) n FROM tenants').get().n, 1, 'o ensaio não muda o banco');
    db.close();

    const r = rodar(dados);
    assert.equal(r.ok, true, r.erro);
    db = openDb(path.join(dados, 'portal.db'));
    const clientes = db.prepare("SELECT * FROM tenants WHERE slug LIKE 'blog-%'").all();
    assert.equal(clientes.length, blogs);
    for (const t of clientes) {
      assert.equal(db.prepare('SELECT count(*) n FROM sites WHERE tenant_id = ?').get(t.id).n, 1, `${t.slug} tem o seu site`);
      assert.ok(db.prepare('SELECT 1 FROM memberships WHERE tenant_id = ? AND user_id = ? AND role = ?').get(t.id, 'u1', 'dono'), `${t.slug} tem o dono`);
    }
    assert.equal(db.prepare('SELECT count(*) n FROM sites WHERE tenant_id = ?').get(base.id).n, 0);
    assert.equal(db.prepare('SELECT count(*) n FROM posts').get().n, posts, 'nenhum post some nem duplica');
    for (const t of ['posts', 'paginas_proprias', 'pages']) {
      assert.equal(db.prepare(`SELECT count(*) n FROM ${t} x JOIN sites s ON s.id = x.site_id WHERE x.tenant_id <> s.tenant_id`).get().n, 0, `${t} no cliente do site`);
    }
    db.close();
    const de_novo = rodar(dados);
    assert.equal(de_novo.relato.filter((l) => /movido|cliente criado/.test(l)).length, 0, 'rodar de novo não move nada');
  } finally {
    fs.rmSync(dados, { recursive: true, force: true });
  }
});
