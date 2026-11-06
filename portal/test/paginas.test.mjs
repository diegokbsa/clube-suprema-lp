// Páginas próprias (HTML de domínio próprio, ex.: hotpoker.club) e o markdown curto do blog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montar, gravarPagina, paginaPropria, sitemapEntries } from '../lib/modules/paginas.mjs';
import { htmlText } from '../lib/modules/blog.mjs';

function repoFalso() {
  const linhas = [];
  let n = 0;
  const casa = (r, w) => Object.entries(w).every(([k, v]) => r[k] === v);
  return {
    linhas,
    get: (t, w) => linhas.find((r) => casa(r, typeof w === 'string' ? { id: w } : w)) || null,
    all: (t, w) => linhas.filter((r) => casa(r, w)),
    insert: (t, o) => { const r = { id: `p${++n}`, created_at: 'x', updated_at: 'x', ...o }; linhas.push(r); return r; },
    update: (t, id, p) => Object.assign(linhas.find((r) => r.id === id), p),
  };
}
const DOC = '<!doctype html><html lang="pt-BR"><head><title>T</title></head><body><form action="/f/__SITE__"><input type="email"></form></body></html>';

test('montar liga o formulário ao CRM do site certo e põe o script antes do </body>', () => {
  const h = montar(DOC, 'site-123');
  assert.match(h, /action="\/f\/site-123"/);
  assert.match(h, /var S="site-123"/);
  assert.ok(h.indexOf('<script>') < h.lastIndexOf('</body>'));
  assert.equal((h.match(/<\/body>/g) || []).length, 1);
});

test('gravar e servir: raiz e /1, caminho inválido recusado, sitemap só com as indexáveis', () => {
  const repo = repoFalso();
  gravarPagina(repo, { siteId: 's', caminho: '', html: DOC, indexar: true });
  gravarPagina(repo, { siteId: 's', caminho: '/1/', html: DOC, indexar: false });
  gravarPagina(repo, { siteId: 's', caminho: '1', html: DOC.replace('<title>T', '<title>T2'), indexar: false }); // troca, não duplica
  assert.equal(repo.linhas.length, 2);
  assert.throws(() => gravarPagina(repo, { siteId: 's', caminho: '../x', html: DOC }), /Caminho inválido/);
  assert.throws(() => gravarPagina(repo, { siteId: 's', caminho: 'x', html: 'sem documento' }), /HTML completo/);
  const site = { id: 's' };
  const raiz = paginaPropria({ req: { method: 'GET' }, site, repo, rest: '' });
  assert.equal(raiz.status, 200);
  assert.match(raiz.headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(paginaPropria({ req: { method: 'GET' }, site, repo, rest: '1/' }).body, /T2/);
  assert.equal(paginaPropria({ req: { method: 'GET' }, site, repo, rest: 'blog' }), null, 'o que não é página própria segue para o blog e o construtor');
  assert.equal(paginaPropria({ req: { method: 'POST' }, site, repo, rest: '' }), null);
  assert.deepEqual(sitemapEntries({ site, repo }).map((e) => e.path), ['/']);
});

test('blog: markdown curto vira HTML seguro (títulos, listas, negrito, links) e o resto é escapado', () => {
  const h = htmlText('## Como entrar\n\nTexto com **negrito** e [link](/blog/x) e [fora](https://hotpoker.club/).\n\n- um\n- dois\n\n1. primeiro\n2. segundo\n\n<script>alert(1)</script> [mau](javascript:alert(1))');
  assert.match(h, /<h2>Como entrar<\/h2>/);
  assert.match(h, /<strong>negrito<\/strong>/);
  assert.match(h, /<a href="\/blog\/x">link<\/a>/);
  assert.match(h, /<a href="https:\/\/hotpoker\.club\/" rel="noopener" target="_blank">fora<\/a>/);
  assert.match(h, /<ul><li>um<\/li><li>dois<\/li><\/ul>/);
  assert.match(h, /<ol><li>primeiro<\/li><li>segundo<\/li><\/ol>/);
  assert.doesNotMatch(h, /<script>/);
  assert.doesNotMatch(h, /href="javascript/);
  assert.equal(htmlText('linha um\nlinha dois\n\noutro'), '<p>linha um linha dois</p><p>outro</p>', 'post antigo continua igual');
});
