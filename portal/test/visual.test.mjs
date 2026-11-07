// Visual do painel (Kbsa, 07/11/2026): padrão branco com detalhes roxos e um botão "Visual" que troca entre os outros.
// Confere a lista, o CSS de cada visual, o contraste AA dos pares de cor que o painel usa e o CSP (sem script inline).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { startPortal } from './helpers.mjs';

const ADMIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'admin');
const ler = (f) => fs.readFileSync(path.join(ADMIN, f), 'utf8');

// roda o visual.js num "navegador" mínimo e devolve o que ele expõe
function carregarVisual({ salvo = null, busca = '' } = {}) {
  const dataset = {};
  const guardado = new Map(salvo ? [['portal.visual', salvo]] : []);
  const head = { appendChild: () => {} };
  const ctx = {
    document: { documentElement: { dataset }, head, getElementById: () => null, createElement: () => ({}) },
    localStorage: { getItem: (k) => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, v) },
    location: { search: busca }, URLSearchParams,
  };
  ctx.window = ctx;
  vm.runInNewContext(ler('visual.js'), ctx);
  return { api: ctx.PortalVisual, dataset, guardado };
}

const blocos = () => {
  const css = ler('visuais.css');
  const out = {};
  for (const m of css.matchAll(/:root\[data-visual="([a-z]+)"\]\s*\{([^}]*)\}/g)) {
    const vars = {};
    for (const v of m[2].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) vars[v[1]] = v[2].trim();
    if (Object.keys(vars).length > 5) out[m[1]] = vars; // o bloco de tokens (há blocos curtos de acabamento também)
  }
  return out;
};

function lum(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hex = (v) => /^#[0-9a-f]{6}$/i.test(v || '');

test('visual.js: começa no branco, lembra a escolha e aceita ?visual= sem salvar', () => {
  let r = carregarVisual();
  assert.equal(r.api.padrao, 'branco');
  assert.equal(r.dataset.visual, 'branco', 'sem nada salvo, o painel abre no branco');
  assert.equal(r.api.lista.length, 12, '11 visuais + o original da edição');
  assert.ok(r.api.lista.some((v) => v.id === 'original'));
  r.api.aplicar('ameixa', true);
  assert.equal(r.dataset.visual, 'ameixa');
  assert.equal(r.guardado.get('portal.visual'), 'ameixa', 'a escolha fica salva');
  r.api.aplicar('original', true);
  assert.equal(r.dataset.visual, undefined, 'original tira o data-visual e volta às cores da edição');
  r = carregarVisual({ salvo: 'console' });
  assert.equal(r.dataset.visual, 'console');
  r = carregarVisual({ salvo: 'console', busca: '?visual=suica' });
  assert.equal(r.dataset.visual, 'suica');
  assert.equal(r.api.atual(), 'suica', 'o botão mostra o visual da prévia');
  assert.equal(r.guardado.get('portal.visual'), 'console', 'a prévia não troca a escolha salva');
  r = carregarVisual({ salvo: 'nao-existe' });
  assert.equal(r.dataset.visual, 'branco', 'valor desconhecido cai no padrão');
});

test('visuais.css: cada visual da lista tem tokens completos', () => {
  const { api } = carregarVisual();
  const b = blocos();
  const exigidos = ['bg', 'panel', 'input', 'ink', 'ink-strong', 'ink-2', 'ink-3', 'line', 'line-2', 'brand', 'brand-2', 'brand-ink', 'gold', 'gold-soft',
    'ok', 'ok-soft', 'warn', 'warn-soft', 'bad', 'bad-soft', 'rail', 'rail-2', 'rail-active', 'rail-ink', 'rail-muted', 'rail-line', 'radius', 'font'];
  for (const v of api.lista.filter((x) => x.id !== 'original')) {
    assert.ok(b[v.id], `falta o bloco :root[data-visual="${v.id}"]`);
    const falta = exigidos.filter((k) => !(k in b[v.id]));
    assert.deepEqual(falta, [], `${v.id}: tokens faltando`);
  }
});

test('contraste AA (4,5:1) nos pares de cor que o painel usa, em todos os visuais', () => {
  const pares = [['ink', 'panel'], ['ink-3', 'panel'], ['ink', 'bg'], ['ink-3', 'bg'], ['brand-ink', 'brand'], ['ok', 'ok-soft'], ['warn', 'warn-soft'], ['bad', 'bad-soft'],
    ['rail-ink', 'rail'], ['rail-muted', 'rail'], ['rail-active-ink', 'rail-active'], ['ink', 'input']];
  const ruins = [];
  for (const [id, t] of Object.entries(blocos())) {
    const tok = { 'rail-active-ink': '#ffffff', ...t };
    for (const [a, b] of pares) {
      if (!hex(tok[a]) || !hex(tok[b])) continue; // vidro (rgba) é conferido pela cor opaca do painel
      const c = contraste(tok[a], tok[b]);
      if (c < 4.5) ruins.push(`${id}: --${a} sobre --${b} = ${c.toFixed(2)}`);
    }
  }
  assert.deepEqual(ruins, []);
});

test('index do admin: visual.js antes do CSS e nenhum script inline (CSP)', () => {
  const html = ler('index.html');
  assert.ok(html.indexOf('/admin/visual.js') > -1 && html.indexOf('/admin/visual.js') < html.indexOf('/admin/admin.css'), 'visual.js carrega antes de pintar');
  assert.ok(html.indexOf('/admin/visuais.css') > html.indexOf('/admin/admin.css'), 'visuais.css vem depois do admin.css');
  assert.deepEqual([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)], [], 'script sem src seria bloqueado pelo CSP');
  const js = ler('admin.js');
  assert.ok(js.includes('${seletorVisual()}') && js.includes('ligarSeletorVisual();'), 'o botão Visual está no menu lateral');
});

test('servidor entrega visual.js e visuais.css com o tipo certo', async (t) => {
  const P = await startPortal();
  after(() => P.close());
  for (const [f, tipo] of [['visual.js', 'text/javascript'], ['visuais.css', 'text/css']]) {
    const r = await fetch(`${P.url}/admin/${f}`);
    assert.equal(r.status, 200, f);
    assert.ok(r.headers.get('content-type').startsWith(tipo), f);
  }
});
