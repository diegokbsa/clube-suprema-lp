// Blocos: regras de renderização que valem para todos os mundos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBlocks } from '../lib/blocks.mjs';

const ctx = { site: { id: 's' }, page: { slug: '' }, tenant: {}, base: '', formAction: '/f/s', pages: [] };
const ids = (h) => (h.match(/id="contato"/g) || []).length;

test('canais de atendimento sem nenhum canal não aparecem no site, mas a prévia avisa', () => {
  assert.equal(renderBlocks([{ type: 'contact', props: { title: 'Fale com a gente' } }], ctx), '');
  assert.match(renderBlocks([{ type: 'contact', props: {} }], { ...ctx, preview: true }), /Preencha pelo menos um canal/);
  assert.match(renderBlocks([{ type: 'contact', props: { whatsapp: '5511999990000' } }], ctx), /wa\.me\/5511999990000/);
});

test('#contato cai no primeiro formulário da página, sem id repetido', () => {
  assert.equal(ids(renderBlocks([{ type: 'lead_form', props: {} }, { type: 'lead_form', props: {} }], ctx)), 1);
  const h = renderBlocks([{ type: 'text', props: { title: 'x' } }, { type: 'lead_form', props: {} }], ctx);
  assert.ok(h.indexOf('id="contato"') > h.indexOf('b-text'), 'a âncora fica no formulário, não no texto');
  assert.equal(ids(renderBlocks([{ type: 'lead_form', props: {} }, { type: 'text', props: { title: 'x', anchor: 'contato' } }], ctx)), 1,
    'âncora "contato" escolhida no painel tem preferência');
  assert.equal(ids(renderBlocks([{ type: 'text', props: { title: 'x' } }], ctx)), 0, 'página sem formulário não ganha âncora');
});
