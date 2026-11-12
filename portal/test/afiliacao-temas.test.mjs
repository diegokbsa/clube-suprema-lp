// Temas dos 10 blogs (12/11/2026): contraste AA nos dois modos, fonte servida pelo Portal e voz declarada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMAS, FONTES, SERIES, contraste } from '../tools/afiliacao-temas.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = path.join(RAIZ, 'conteudo', 'afiliacao');

test('todo blog com vitrine tem tema, voz e séries', () => {
  for (const b of fs.readdirSync(C).filter((d) => fs.existsSync(path.join(C, d, 'vitrine.json')))) {
    assert.ok(TEMAS[b], `${b}: tema`);
    assert.ok(TEMAS[b].voz?.nome && TEMAS[b].voz?.bordao, `${b}: voz com nome e bordão`);
    assert.ok((SERIES[b] || []).length >= 3, `${b}: séries`);
  }
});

test('contraste AA: texto, texto secundário, link e botão, no claro e no escuro', () => {
  for (const [b, t] of Object.entries(TEMAS)) {
    for (const modo of ['claro', 'escuro']) {
      const c = t[modo];
      const pares = { tinta: [c.tinta, c.fundo], suave: [c.suave, c.fundo], suavePapel: [c.suave, c.papel], link: [c.acento, c.fundo], linkPapel: [c.acento, c.papel], botao: [c.sobreAcento, c.acento], marca: [c.sobreMarca, c.marca] };
      for (const [k, [x, y]] of Object.entries(pares)) assert.ok(contraste(x, y) >= 4.5, `${b}/${modo}/${k}: ${contraste(x, y).toFixed(2)}`);
    }
  }
});

test('fonte de título de cada tema existe em public/assets/fontes', () => {
  assert.ok(fs.existsSync(path.join(RAIZ, 'public', 'assets', 'fontes', 'texto.woff2')));
  for (const [b, t] of Object.entries(TEMAS)) {
    assert.ok(FONTES[t.fonte], `${b}: fonte cadastrada`);
    assert.ok(fs.existsSync(path.join(RAIZ, 'public', 'assets', 'fontes', `${t.fonte}.woff2`)), `${b}: ${t.fonte}.woff2`);
  }
});
