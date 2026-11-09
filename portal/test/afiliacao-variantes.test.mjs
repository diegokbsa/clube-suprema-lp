import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { variante } from '../tools/afiliacao-visual.mjs';
import { nomeVariante } from '../tools/afiliacao-variantes.mjs';

const PUBLICO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

test('variantes: nome em r/<pasta>/<nome>-<largura>.webp', () => {
  assert.equal(nomeVariante('produtos/posts-virais.webp', 400), 'r/produtos/posts-virais-400.webp');
  assert.equal(nomeVariante('criativos/x-capa.webp', 600), 'r/criativos/x-capa-600.webp');
});

test('variantes: só usa a versão menor que existe no disco, com ?v=; png, externa e ausente ficam null', () => {
  const rel = 'assets/afiliacao/r/produtos/zz-teste-variante-400.webp';
  const arq = path.join(PUBLICO, rel);
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  fs.writeFileSync(arq, 'x');
  try {
    assert.match(variante('/assets/afiliacao/produtos/zz-teste-variante.webp', 400), /^\/assets\/afiliacao\/r\/produtos\/zz-teste-variante-400\.webp\?v=[a-z0-9]+$/);
    assert.match(variante('/assets/afiliacao/produtos/zz-teste-variante.webp?v=abc', 400), /zz-teste-variante-400\.webp\?v=/);
    assert.equal(variante('/assets/afiliacao/produtos/zz-teste-variante.webp', 160), null);
    assert.equal(variante('/assets/afiliacao/criativos/x-capa.png', 600), null);
    assert.equal(variante('https://cdn.exemplo.com/a.webp', 400), null);
  } finally { fs.rmSync(arq, { force: true }); }
});
