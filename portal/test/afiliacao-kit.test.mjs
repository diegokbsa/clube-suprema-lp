// Bloco "Comece com o kit básico" da home dos blogs (09/11/2026): digital + físico, só com afiliação ativa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { kitBasico } from '../tools/afiliacao-visual.mjs';

const dados = {
  catalogo: {
    'curso-x': { nome: 'Curso X', tipo: 'Curso online', preco: 97 },
    'sp-a': { nome: 'Prensa A', tipo: 'Prensa', preco: 339, preco_nota: 'na Shopee em 09/11/2026' },
    'sp-b': { nome: 'Caneca B', tipo: 'Insumo', preco: 129.8 },
    'sp-off': { nome: 'Fora do ar', tipo: 'Insumo', preco: 10 },
  },
  links: {
    'curso-x': { status: 'ativo', url: 'https://l.kbsa.app/curso-x' },
    'sp-a': { status: 'ativo', url: 'https://l.kbsa.app/sp-a' },
    'sp-b': { status: 'ativo', url: 'https://l.kbsa.app/sp-b' },
    'sp-off': { status: 'pendente' },
  },
};

test('kit básico: digital e físico rotulados, soma dos preços, aviso de comissão e link patrocinado', () => {
  const html = kitBasico({ kit: { itens: ['curso-x', 'sp-a', 'sp-b', 'sp-off'] } }, dados);
  assert.match(html, /Comece com o kit básico/);
  assert.equal((html.match(/<article class="card">/g) || []).length, 3, 'item sem afiliação ativa fica de fora');
  assert.match(html, /<span class="tag">Digital<\/span>/);
  assert.equal((html.match(/<span class="tag">Físico<\/span>/g) || []).length, 2);
  assert.match(html, /R\$\s?565,80/);
  assert.match(html, /recebemos uma comissão/);
  assert.match(html, /rel="sponsored nofollow noopener"/);
});

test('kit básico: com menos de 2 itens ativos o bloco não aparece', () => {
  assert.equal(kitBasico({ kit: { itens: ['curso-x', 'sp-off'] } }, dados), '');
  assert.equal(kitBasico({}, dados), '');
});
