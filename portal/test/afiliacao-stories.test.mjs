// Web Stories: cada post com capa vira <domínio>/stories/<slug> em AMP, indexável (sitemap), sem script injetado e com CSP do AMP.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../lib/db.mjs';
import { montar, ehAmp, CSP_AMP, paginaPropria, sitemapEntries } from '../lib/modules/paginas.mjs';
import { scoped, registerTable } from '../lib/repo.mjs';

registerTable('paginas_proprias');

const T = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools');
const rodar = (tool, dados, ...extra) => {
  const r = spawnSync(process.execPath, [path.join(T, tool), '--dados', dados, ...extra], { encoding: 'utf8' });
  return JSON.parse(r.stdout.trim().split('\n').pop());
};

test('stories: gravadas em AMP depois do instalador, indexáveis e idempotentes', () => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'afiliacao-stories-'));
  try {
    openDb(path.join(dados, 'portal.db')).close();
    assert.equal(rodar('afiliacao-instalar.mjs', dados).ok, true);
    const r = rodar('afiliacao-stories.mjs', dados, '--sem-indexnow');
    assert.equal(r.ok, true, JSON.stringify(r.relato));
    const total = r.relato.reduce((s, b) => s + b.gravadas, 0);
    const db = openDb(path.join(dados, 'portal.db'));
    const paginas = db.prepare("SELECT p.*, s.domain FROM paginas_proprias p JOIN sites s ON s.id = p.site_id WHERE caminho LIKE 'stories/%'").all();
    assert.equal(paginas.length, total);
    if (paginas.length) {
      const p = paginas[0];
      assert.ok(ehAmp(p.html) && p.indexar === 1);
      assert.match(p.html, new RegExp(`<link rel="canonical" href="https://${p.domain.replace(/\./g, '\\.')}/${p.caminho}">`));
      assert.match(p.html, /poster-portrait-src="https:\/\/[^"]+-story\.webp(\?v=[a-z0-9]+)?"/);
      assert.ok(!/<script(?! async| type="application\/ld\+json")/.test(p.html), 'só scripts do AMP e JSON-LD');
      assert.equal(montar(p.html, { id: p.site_id }), p.html, 'nada injetado na página AMP');
      const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(p.site_id);
      const repo = scoped(db, site.tenant_id);
      const resp = paginaPropria({ req: { method: 'GET' }, site, repo, rest: p.caminho });
      assert.equal(resp.headers['Content-Security-Policy'], CSP_AMP);
      assert.ok(sitemapEntries({ site, repo }).some((e) => e.path === `/${p.caminho}`), 'story no sitemap');
      assert.ok(/l\.kbsa\.app\/[a-z0-9-]+\?src=/.test(p.html) || !/l\.kbsa\.app/.test(p.html), 'link de afiliado com origem');
    }
    db.close();
    const de_novo = rodar('afiliacao-stories.mjs', dados, '--sem-indexnow');
    assert.equal(de_novo.relato.reduce((s, b) => s + b.gravadas, 0), 0, 'rodar de novo não regrava nada');
  } finally { try { fs.rmSync(dados, { recursive: true, force: true }); } catch { /* banco ainda aberto após falha */ } }
});
