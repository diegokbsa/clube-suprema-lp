// White label de clube SX (Hot Poker): paleta "chama" nos 5 mundos de pôquer, logo da operação no topo dos modelos
// e a mensagem padrão do WhatsApp com clube e agente (a mesma do suprema.blog).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templateVars } from '../lib/tenants.mjs';
import { WORLDS, WORLD_BLOCKS } from '../lib/worlds/index.mjs';
import { loadTemplates, fillPlaceholders } from '../lib/templates.mjs';

const POKER = ['rack', 'transmissao', 'relogio', 'ingresso', 'comprovante'];
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test('WhatsApp do pôquer já abre com a mensagem padrão do clube e do agente', () => {
  const v = templateVars({ name: 'Hot Poker', number: '33548', niche_id: 'poker' }, { whatsapp: '55 11 95213-8293', agentId: '768286' });
  const u = new URL(v.whatsappLink);
  assert.equal(u.origin + u.pathname, 'https://wa.me/5511952138293');
  assert.equal(u.searchParams.get('text'), 'Oi! Venho do clube 33548, agente 768286, e gostaria de suporte.');
  // sem agente, só o clube; outro nicho, sem mensagem; sem WhatsApp, vai para o formulário
  assert.equal(new URL(templateVars({ number: '33548', niche_id: 'poker' }, { whatsapp: '5511952138293' }).whatsappLink).searchParams.get('text'), 'Oi! Venho do clube 33548, e gostaria de suporte.');
  assert.equal(templateVars({ number: '1', niche_id: 'loja' }, { whatsapp: '5511952138293' }).whatsappLink, 'https://wa.me/5511952138293');
  assert.equal(templateVars({ number: '33548', niche_id: 'poker' }, {}).whatsappLink, '#contato');
});

test('os 5 mundos de pôquer têm a paleta preto e laranja chama, legível', () => {
  for (const w of POKER) {
    const p = WORLDS[w].palettes.find((x) => x.id === 'chama');
    assert.ok(p, `${w} sem a paleta chama`);
    const c = p.colors;
    for (const k of ['bg', 'surface', 'text', 'muted', 'primary', 'primaryText', 'accent', 'border']) assert.match(c[k], /^#[0-9a-f]{6}$/, `${w}.${k}`);
    assert.ok(contraste(c.text, c.bg) >= 7, `${w}: texto sobre o fundo`);
    assert.ok(contraste(c.muted, c.bg) >= 4.5, `${w}: texto de apoio sobre o fundo`);
    assert.ok(contraste(c.primaryText, c.primary) >= 4.5, `${w}: texto do botão`);
  }
  // no ingresso a cor da marca é o papel do bilhete e a tinta é escura
  const ing = WORLDS.ingresso.palettes.find((x) => x.id === 'chama').colors;
  assert.equal(ing.surface, ing.primary);
  assert.ok(contraste(ing.primaryText, ing.surface) >= 4.5, 'tinta sobre o papel do ingresso');
});

test('o logo da operação entra em todo bloco de mundo que aceita logo nos modelos SX', () => {
  const faltando = [];
  for (const t of loadTemplates({ fresh: true }).values()) {
    if (!t.id.startsWith('sx-') || !POKER.includes(t.theme?.world)) continue;
    for (const pg of t.pages) for (const b of pg.blocks) {
      const aceita = (WORLD_BLOCKS[b.type]?.fields || []).some((f) => f.k === 'logo');
      if (aceita && !('logo' in (b.props || {}))) faltando.push(`${t.id}/${pg.slug || 'inicio'}/${b.type}`);
    }
  }
  assert.deepEqual(faltando, []);
  const topo = loadTemplates().get('sx-rack-clube').pages[0].blocks.find((b) => b.type === 'rack_topo');
  assert.equal(fillPlaceholders(topo.props, { logo: '/assets/marcas/hot-poker-chama.png' }).logo, '/assets/marcas/hot-poker-chama.png');
  assert.equal(fillPlaceholders(topo.props, {}).logo, '', 'sem logo, o mundo usa a marca desenhada');
});
