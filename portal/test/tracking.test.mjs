// Mensuração por site: consentimento antes de qualquer script, IDs por site, Conversions API com o mesmo event_id
// do navegador (deduplicação), tela que separa "ID instalado" de "conta conectada", idempotência, erro da Meta,
// segredo que nunca volta para a tela, permissões e isolamento entre operações.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startPortal, client } from './helpers.mjs';

const TELA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'admin', 'modules', 'tracking.js');
const TOKEN = 'EAAG-token-de-teste-1234567890abcdef';
const GA4 = 'G-TESTE1234';
const GTM = 'GTM-TESTE12';
const PIXEL = '123456789012345';

let P;
let sup;
let site;
let chamadas = [];
let resposta = { status: 200, json: async () => ({ events_received: 1 }) };

const evento = (corpo, slug = 'clube-10050') => fetch(`${P.url}/s/${slug}/pa/evento`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
});
const diag = async (slug = 'clube-10050') => (await sup.req('GET', `/api/t/${slug}/tracking`)).data;
const integ = (d, kind) => d.integracoes.find((i) => i.kind === kind);

before(async () => {
  P = await startPortal({
    fetchImpl: async (url, init) => { chamadas.push({ url, body: JSON.parse(init.body) }); return resposta; },
  });
  sup = client(P.url);
  await sup.login('super@teste.local', 'senha-forte-123');
  await sup.req('POST', '/api/tenants', { name: 'Clube Mensuração', number: '10050', niche: 'poker', template: 'clube-poker-premium' });
  site = (await sup.req('GET', '/api/t/clube-10050/sites')).data.sites[0];
  await sup.req('PUT', `/api/t/clube-10050/tracking/sites/${site.id}`, { ga4: GA4, gtm: GTM, pixel: PIXEL });
  await sup.req('POST', `/api/t/clube-10050/pages/${site.pages[0].id}/publish`);
});
after(() => P.close());

test('sem consentimento nenhum script de mensuração carrega e o servidor não registra nada', async () => {
  const html = (await sup.req('GET', '/s/clube-10050/', undefined, { raw: true })).data;
  const externos = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(externos.filter((u) => !u.startsWith('/assets/')), [], 'a página só traz scripts do próprio portal');
  assert.ok(externos.includes('/assets/site.js'), 'o script do portal está na página');
  assert.ok(!/googletagmanager\.com/.test(html), 'nenhuma tag do Google no HTML');
  assert.ok(!/connect\.facebook\.net/.test(html), 'nenhuma tag da Meta no HTML');
  assert.match(html, /id="consent"/, 'a faixa de consentimento está na página');
  assert.match(html, new RegExp(`data-ga4="${GA4}"`), 'o ID fica no corpo, à espera do "aceitar"');

  const r = await evento({ name: 'page_view', event_id: 'sem-consentimento-1' });
  assert.equal(r.status, 204, 'evento sem consentimento é descartado em silêncio');
  const d = await diag();
  assert.equal(d.recentes.length, 0, 'nada registrado');
  assert.equal(chamadas.length, 0, 'nada saiu para a Meta');
});

test('a tela separa "ID instalado" de "conta conectada"', async () => {
  const d = await diag();
  assert.equal(integ(d, 'meta_pixel').instalado, true);
  assert.equal(integ(d, 'meta_pixel').conectada, false);
  assert.equal(integ(d, 'meta_pixel').estadoLabel, 'ID instalado');
  assert.deepEqual(integ(d, 'ga4').sites, ['clube-10050']);
  const capi = integ(d, 'meta_capi');
  assert.equal(capi.conectada, false);
  assert.equal(capi.estadoLabel, 'Pendente de configuração');
  assert.ok(d.pendencias.some((p) => /Conversions API ainda não/.test(p)), 'a tela avisa que falta a API de conversões');

  const tela = fs.readFileSync(TELA, 'utf8');
  assert.match(tela, /ID instalado/);
  assert.match(tela, /Conta conectada/);
});

test('token guardado não é conta conectada; só depois da Meta responder', async () => {
  const salvo = await sup.req('PUT', '/api/t/clube-10050/tracking/capi', { pixelId: PIXEL, token: TOKEN });
  assert.equal(salvo.status, 200);
  assert.equal(salvo.data.estado, 'token_guardado');
  let d = await diag();
  assert.equal(integ(d, 'meta_capi').conectada, false, 'guardar o token não conecta a conta');
  assert.equal(integ(d, 'meta_capi').estadoLabel, 'Token guardado, falta validar');
  assert.ok(!JSON.stringify(d).includes(TOKEN), 'o token nunca volta para a tela');

  const teste = await sup.req('POST', '/api/t/clube-10050/tracking/capi/teste', {});
  assert.equal(teste.data.ok, true);
  assert.equal(chamadas.at(-1).url, `https://graph.facebook.com/v21.0/${PIXEL}/events`);
  assert.equal(chamadas.at(-1).body.access_token, TOKEN, 'o token vai no corpo, não na URL');
  d = await diag();
  assert.equal(integ(d, 'meta_capi').conectada, true);
  assert.equal(integ(d, 'meta_capi').estadoLabel, 'Conta conectada');
  assert.ok(!JSON.stringify(d).includes(TOKEN));
});

test('evento de navegador e de servidor saem com o mesmo event_id', async () => {
  chamadas = [];
  const eventId = 'lead-abc123def456';
  const r = await evento({ name: 'generate_lead', event_id: eventId, consent: 1, page: 'contato', email: 'Pessoa@Teste.com ' });
  assert.equal(r.status, 202);
  assert.deepEqual(await r.json(), { ok: true, event_id: eventId, capi: 'enviado' });

  assert.equal(chamadas.length, 1, 'um envio para a Conversions API');
  const enviado = chamadas[0].body.data[0];
  assert.equal(enviado.event_id, eventId, 'o servidor repete o event_id do navegador');
  assert.equal(enviado.event_name, 'Lead');
  assert.equal(enviado.action_source, 'website');
  assert.match(enviado.user_data.em[0], /^[0-9a-f]{64}$/, 'e-mail só em hash');
  assert.ok(!JSON.stringify(chamadas[0].body).includes('Pessoa@Teste.com'), 'e-mail em texto puro não sai daqui');

  const d = await diag();
  const par = d.recentes.filter((e) => e.eventId === eventId);
  assert.deepEqual(par.map((e) => e.source).sort(), ['navegador', 'servidor']);
  assert.ok(par.every((e) => e.deduplicado), 'a tela marca o par como deduplicado');
  assert.equal(d.eventos.find((e) => e.chave === 'generate_lead').navegador7d, 1);
  assert.equal(d.eventos.find((e) => e.chave === 'generate_lead').servidor7d, 1);
});

test('o mesmo event_id reenviado não duplica nem reenvia para a Meta', async () => {
  chamadas = [];
  const r = await evento({ name: 'generate_lead', event_id: 'lead-abc123def456', consent: 1, page: 'contato' });
  assert.equal(r.status, 202);
  assert.deepEqual(await r.json(), { ok: true, duplicate: true, event_id: 'lead-abc123def456' });
  assert.equal(chamadas.length, 0, 'não bate na Meta de novo');
  const d = await diag();
  assert.equal(d.recentes.filter((e) => e.eventId === 'lead-abc123def456').length, 2, 'continuam sendo dois registros');
});

test('visita, clique, cadastro e compra viram os nomes certos no GA4 e na Meta', async () => {
  chamadas = [];
  await evento({ name: 'page_view', event_id: 'visita-0001aaaa', consent: 1, page: '' });
  await evento({ name: 'cta_click', event_id: 'clique-0001aaaa', consent: 1, page: '' });
  await evento({ name: 'sign_up', event_id: 'cadastro-0001aa', consent: 1, page: 'cadastro' });
  await evento({ name: 'purchase', event_id: 'compra-0001aaaa', consent: 1, page: 'fichas', value_cents: 25000, currency: 'BRL' });
  assert.deepEqual(chamadas.map((c) => c.body.data[0].event_name), ['PageView', 'Contact', 'CompleteRegistration', 'Purchase']);
  const compra = chamadas.at(-1).body.data[0];
  assert.deepEqual(compra.custom_data, { value: 250, currency: 'BRL' });

  const d = await diag();
  const nomes = Object.fromEntries(d.eventos.map((e) => [e.chave, e.label]));
  assert.deepEqual(nomes, { page_view: 'Visita', cta_click: 'Clique em CTA', generate_lead: 'Lead', sign_up: 'Cadastro', purchase: 'Compra', journey_step: 'Passo da jornada' });
  assert.equal(d.eventos.find((e) => e.chave === 'purchase').servidor7d, 1);
});

test('evento fora do catálogo, event_id torto e site sem identificador são recusados', async () => {
  assert.equal((await evento({ name: 'inventado', event_id: 'xxxxxxxxxx', consent: 1 })).status, 400);
  assert.equal((await evento({ name: 'page_view', event_id: 'curto', consent: 1 })).status, 400);
  await sup.req('POST', '/api/tenants', { name: 'Sem Medição', number: '10051', niche: 'poker', template: 'clube-poker-premium' });
  assert.equal((await evento({ name: 'page_view', event_id: 'sem-medicao-01', consent: 1 }, 'clube-10051')).status, 204);
  const mau = await sup.req('PUT', `/api/t/clube-10050/tracking/sites/${site.id}`, { ga4: 'ga-errado', gtm: GTM, pixel: PIXEL });
  assert.equal(mau.status, 400);
  assert.match(mau.data.error, /formato inválido/);
});

test('quando a Meta recusa, a tela mostra o erro e nenhum token aparece nele', async () => {
  chamadas = [];
  resposta = { status: 400, json: async () => ({ error: { message: 'Invalid parameter: access token' } }) };
  const r = await evento({ name: 'generate_lead', event_id: 'lead-erro-00001', consent: 1, page: 'contato' });
  assert.deepEqual(await r.json(), { ok: true, event_id: 'lead-erro-00001', capi: 'erro' });
  const d = await diag();
  const linha = d.recentes.find((e) => e.eventId === 'lead-erro-00001' && e.source === 'servidor');
  assert.equal(linha.status, 'erro');
  assert.match(linha.detail, /A Meta recusou/);
  assert.equal(integ(d, 'meta_capi').estado, 'erro');
  assert.equal(integ(d, 'meta_capi').conectada, false, 'erro derruba o "conta conectada"');
  assert.ok(!JSON.stringify(d).includes(TOKEN));
  resposta = { status: 200, json: async () => ({ events_received: 1 }) };
});

test('remover o token devolve a integração para pendente de configuração', async () => {
  chamadas = [];
  await sup.req('DELETE', '/api/t/clube-10050/tracking/capi');
  const d = await diag();
  assert.equal(integ(d, 'meta_capi').estadoLabel, 'Pendente de configuração');
  assert.equal(d.capi.temToken, false);
  const r = await evento({ name: 'purchase', event_id: 'compra-sem-token1', consent: 1, page: 'fichas' });
  assert.deepEqual(await r.json(), { ok: true, event_id: 'compra-sem-token1', capi: 'pendente' });
  assert.equal(chamadas.length, 0, 'sem credencial o portal não finge que enviou');
  const teste = await sup.req('POST', '/api/t/clube-10050/tracking/capi/teste', {});
  assert.equal(teste.status, 400);
  assert.match(teste.data.error, /pendente de configuração/);
});

test('marketing lê mas não conecta conta; editor não entra; outra operação não vê os eventos', async () => {
  await sup.req('POST', '/api/t/clube-10050/users', { email: 'mkt-50@teste.com', role: 'marketing', password: 'marketing-senha-50' });
  await sup.req('POST', '/api/t/clube-10050/users', { email: 'ed-50@teste.com', role: 'editor', password: 'editor-senha-50x' });
  const mkt = client(P.url);
  await mkt.login('mkt-50@teste.com', 'marketing-senha-50');
  assert.equal((await mkt.req('GET', '/api/t/clube-10050/tracking')).status, 200);
  assert.equal((await mkt.req('PUT', '/api/t/clube-10050/tracking/capi', { pixelId: PIXEL, token: TOKEN })).status, 403);
  assert.equal((await mkt.req('PUT', `/api/t/clube-10050/tracking/sites/${site.id}`, { ga4: GA4, gtm: GTM, pixel: PIXEL })).status, 200);
  const ed = client(P.url);
  await ed.login('ed-50@teste.com', 'editor-senha-50x');
  assert.equal((await ed.req('GET', '/api/t/clube-10050/tracking')).status, 403);

  await sup.req('POST', '/api/t/clube-10051/users', { email: 'dono-51@teste.com', role: 'admin', password: 'dono-senha-5151' });
  const outro = client(P.url);
  await outro.login('dono-51@teste.com', 'dono-senha-5151');
  assert.equal((await outro.req('GET', '/api/t/clube-10050/tracking')).status, 404, 'nem enxerga a outra operação');
  const dele = (await outro.req('GET', '/api/t/clube-10051/tracking')).data;
  assert.equal(dele.recentes.length, 0, 'eventos de uma operação não aparecem na outra');
});
