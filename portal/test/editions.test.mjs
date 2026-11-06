// Edições (SX e Geral) e insights do pesquisador de IA (token de serviço, repetidos, filtro por edição, decisão).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb } from '../lib/db.mjs';
import { createApp } from '../server.mjs';
import { createUser } from '../lib/auth.mjs';
import { client } from './helpers.mjs';

const servers = [];
async function start(editionId) {
  const db = openDb(':memory:');
  const server = http.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const { handle } = await createApp({ db, origin: url, secretKey: 't', editionId, serviceToken: `tok-${editionId}` });
  server.on('request', handle);
  servers.push(server);
  createUser(db, { email: 'super@teste.local', name: 'Super', password: 'senha-forte-123', isSuper: true });
  const c = client(url);
  await c.login('super@teste.local', 'senha-forte-123');
  return { url, c, db };
}
after(() => Promise.all(servers.map((s) => new Promise((r) => s.close(r)))));

const insight = (o = {}) => ({ titulo: 'Google muda regra de conteúdo gerado em escala', resumo: 'O Google atualizou a política de spam para conteúdo em escala; sites com muitas páginas parecidas perdem posição.',
  fonte_url: 'https://developers.google.com/search/blog/2026/11/exemplo', fonte_data: '2026-11-04', tipo: 'seo', aplicavel_em: ['geral'], acao: 'Revisar posts automáticos para ter dados próprios e evitar páginas quase iguais.', impacto: 4, esforco: 2, confianca: 4, ...o });

test('edição SX: só poker, paleta da SX nos sites novos e nome da edição', async () => {
  const { c } = await start('sx');
  const meta = (await c.req('GET', '/api/meta')).data;
  assert.equal(meta.edition.id, 'sx');
  assert.deepEqual(meta.niches.map((n) => n.id), ['poker']);
  const bad = await c.req('POST', '/api/tenants', { name: 'Loja', number: '1', niche: 'loja' });
  assert.equal(bad.status, 400, 'edição SX recusa outro nicho');
  const ok = await c.req('POST', '/api/tenants', { name: 'Clube SX', number: '20001', template: 'clube-poker-premium' });
  assert.equal(ok.status, 201, 'sem nicho informado usa o poker da edição');
  const site = (await c.req('GET', '/api/t/clube-20001/sites')).data.sites[0];
  assert.equal(site.theme.primary, '#39bcff', 'site novo nasce com a paleta da SX');
  const presets = (await c.req('GET', '/api/t/clube-20001/journeys')).data.presets.map((p) => p.id);
  assert.ok(presets.includes('jornada-guiada-poker'));
});

test('edição Geral: todos os nichos e sem tema imposto', async () => {
  const { c } = await start('geral');
  const meta = (await c.req('GET', '/api/meta')).data;
  assert.equal(meta.edition.id, 'geral');
  assert.ok(meta.niches.length >= 4);
  const r = await c.req('POST', '/api/tenants', { name: 'Parceiro SaaS', number: '30001', niche: 'saas' });
  assert.equal(r.status, 201);
  assert.equal(r.data.tenant.label, 'Parceiro 30001');
});

test('insights: só entram com o token de serviço, sem repetir e sem fonte falsa; superadmin decide', async () => {
  const { url, c } = await start('geral');
  const post = (body, tok = 'tok-geral') => fetch(`${url}/api/service/insights`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, body: JSON.stringify(body) });
  assert.equal((await post({ insights: [insight()] }, 'errado')).status, 401);
  let r = await (await post({ insights: [insight(), insight({ fonte_url: 'sem link', titulo: 'Sem fonte nenhuma aqui' }), insight({ titulo: 'Só para SX: grupos de clubes', aplicavel_em: ['sx'], fonte_url: 'https://exemplo.com/sx' })] })).json();
  assert.equal(r.novos, 2);
  assert.equal(r.recusados.length, 1, 'insight sem link real é recusado');
  r = await (await post({ insights: [insight({ fonte_url: 'https://developers.google.com/search/blog/2026/11/exemplo?utm=x' })] })).json();
  assert.equal(r.repetidos, 1, 'mesma fonte e título não entram de novo');
  const list = (await c.req('GET', '/api/admin/insights?status=novo')).data;
  assert.equal(list.insights.length, 1, 'a edição Geral não mostra o insight só da SX');
  assert.equal(list.insights[0].impacto, 4);
  assert.equal((await c.req('PATCH', `/api/admin/insights/${list.insights[0].id}`, { status: 'aceito' })).status, 200);
  assert.equal((await c.req('GET', '/api/admin/insights?status=aceito')).data.insights.length, 1);
  const edPub = await (await fetch(`${url}/api/edition`)).json();
  assert.equal(edPub.id, 'geral', 'a edição é pública para a tela de login');
});
