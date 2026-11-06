// Jornadas com teste A/B: modelo pronto do suprema.blog, edição, bloco no site, sorteio público, eventos únicos,
// lead com a variante no CRM, resultados por passo, vencedora, permissões e isolamento.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPortal, client } from './helpers.mjs';

let P;
let sup;
let jid;
let site;

before(async () => {
  P = await startPortal();
  sup = client(P.url);
  await sup.login('super@teste.local', 'senha-forte-123');
  await sup.req('POST', '/api/tenants', { name: 'Clube AB', number: '10005', niche: 'poker', template: 'clube-poker-premium',
    settings: { inviteLink: 'https://exemplo.com/convite', chipsUrl: 'https://exemplo.com/fichas', agentId: '777' } });
  site = (await sup.req('GET', '/api/t/clube-10005/sites')).data.sites[0];
});
after(() => P.close());

test('modelo pronto cria as jornadas A e B do suprema.blog', async () => {
  const list = await sup.req('GET', '/api/t/clube-10005/journeys');
  assert.ok(list.data.presets.some((p) => p.id === 'jornada-guiada-poker'));
  const r = await sup.req('POST', '/api/t/clube-10005/journeys', { preset: 'jornada-guiada-poker' });
  assert.equal(r.status, 201);
  jid = r.data.journey.id;
  const d = (await sup.req('GET', `/api/t/clube-10005/journeys/${jid}`)).data;
  assert.deepEqual(d.variants.map((v) => v.key), ['a', 'b']);
  assert.deepEqual(d.variants[0].steps.map((s) => s.type), ['formulario', 'link_app', 'copiar', 'link_externo', 'confirmacao', 'final']);
  assert.deepEqual(d.variants[1].steps.map((s) => s.type), ['formulario', 'copiar', 'link_externo', 'link_app', 'confirmacao', 'final']);
});

test('rascunho não aparece no site; rodando entrega as variantes com os dados da operação', async () => {
  let r = await sup.req('GET', `/s/clube-10005/j/${jid}/config`);
  assert.equal(r.status, 404, 'jornada em rascunho não é pública');
  await sup.req('POST', `/api/t/clube-10005/journeys/${jid}/status`, { status: 'rodando' });
  r = await sup.req('GET', `/s/clube-10005/j/${jid}/config`);
  assert.equal(r.status, 200);
  const app = r.data.variants[0].steps.find((s) => s.type === 'link_app');
  assert.equal(app.url, 'https://exemplo.com/convite', '{{inviteLink}} preenchido');
  const copiar = r.data.variants[0].steps.find((s) => s.type === 'copiar');
  assert.ok(copiar.items.some((i) => i.value === '[[nome]]'), 'campos do formulário ficam para o navegador preencher');
  assert.ok(copiar.items.some((i) => i.value === '777'));
  assert.equal(r.data.formAction, `/f/${site.id}`);
});

test('colocar no site põe o bloco no rascunho; publicado, a página tem o botão da jornada', async () => {
  const home = site.pages[0];
  await sup.req('POST', `/api/t/clube-10005/journeys/${jid}/place`, { pageId: home.id });
  await sup.req('POST', `/api/t/clube-10005/pages/${home.id}/publish`);
  const html = (await sup.req('GET', '/s/clube-10005/', undefined, { raw: true })).data;
  assert.match(html, new RegExp(`data-journey="${jid}"`));
  assert.match(html, /data-base="\/s\/clube-10005"/);
});

test('eventos contam uma vez por visitante e o lead leva a variante para o CRM', async () => {
  const ev = (o) => fetch(`${P.url}/s/clube-10005/j/${jid}/evento`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
  for (let i = 0; i < 4; i++) {
    const visitor = `visitante${i}abc`;
    const variant = i < 2 ? 'a' : 'b';
    await ev({ visitor, variant, step: 0, kind: 'ver' });
    await ev({ visitor, variant, step: 0, kind: 'ver' }); // recarregou
    await ev({ visitor, variant, step: 0, kind: 'concluir' });
    if (i === 0 || i === 2 || i === 3) await ev({ visitor, variant, step: 5, kind: 'ver' }); // chegou ao final
  }
  assert.equal((await ev({ visitor: 'x', variant: 'a', step: 0, kind: 'ver' })).status, 400, 'visitante inválido é recusado');
  const lead = await fetch(`${P.url}/f/${site.id}`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'ab@teste.com', name: 'Teste AB', consent: '1', journey_id: jid, variant: 'b' }) });
  assert.equal(lead.status, 201);
  const leads = (await sup.req('GET', '/api/t/clube-10005/leads')).data.leads;
  assert.equal(leads[0].utm.variante, 'b');
  assert.equal(leads[0].utm.jornada_id, jid);
  const d = (await sup.req('GET', `/api/t/clube-10005/journeys/${jid}`)).data;
  const [a, b] = d.results;
  assert.equal(a.visitors, 2);
  assert.equal(b.visitors, 2);
  assert.equal(a.goal, 1);
  assert.equal(b.goal, 2);
  assert.equal(b.leads, 1);
  assert.equal(a.funnel[0].concluiram, 2);
  assert.match(b.verdict, /Poucos dados/, 'com poucos visitantes não declara vencedora sozinho');
});

test('vencedora recebe todo o tráfego; editar uma jornada rodando avisa', async () => {
  const d = (await sup.req('GET', `/api/t/clube-10005/journeys/${jid}`)).data;
  const put = await sup.req('PUT', `/api/t/clube-10005/journeys/${jid}`, { name: d.journey.name, variants: d.variants });
  assert.match(put.data.warning, /mistura os resultados/);
  await sup.req('POST', `/api/t/clube-10005/journeys/${jid}/winner`, { key: 'b' });
  const cfg = (await sup.req('GET', `/s/clube-10005/j/${jid}/config`)).data;
  assert.deepEqual(cfg.variants.map((v) => v.key), ['b'], 'só a vencedora continua sendo sorteada');
  const bad = await sup.req('PUT', `/api/t/clube-10005/journeys/${jid}`, { variants: [{ name: 'X', weight: 50, steps: [{ type: 'inexistente' }] }] });
  assert.equal(bad.status, 400);
});

test('editor monta mas não inicia o teste; outra operação não enxerga a jornada', async () => {
  await sup.req('POST', '/api/t/clube-10005/users', { email: 'ed-ab@teste.com', role: 'editor', password: 'editor-senha-99' });
  const ed = client(P.url);
  await ed.login('ed-ab@teste.com', 'editor-senha-99');
  assert.equal((await ed.req('GET', `/api/t/clube-10005/journeys/${jid}`)).status, 200);
  assert.equal((await ed.req('POST', `/api/t/clube-10005/journeys/${jid}/status`, { status: 'pausada' })).status, 403);
  await sup.req('POST', '/api/tenants', { name: 'Outra', number: '10006', niche: 'poker' });
  await sup.req('POST', '/api/t/clube-10006/users', { email: 'dono6@teste.com', role: 'admin', password: 'dono-senha-666' });
  const dono = client(P.url);
  await dono.login('dono6@teste.com', 'dono-senha-666');
  assert.equal((await dono.req('GET', `/api/t/clube-10006/journeys/${jid}`)).status, 404);
});
