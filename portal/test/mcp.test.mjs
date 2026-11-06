// Conector MCP: fluxo OAuth completo (registro dinâmico, login, consentimento, PKCE, refresh com rotação),
// ferramentas respeitando o papel, rascunho sem duplicar, revogação e chave de API que nunca volta para a tela.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { startPortal, client } from './helpers.mjs';

let P;
let sup;
const fakeFetch = async (url) => ({ status: String(url).includes('anthropic') ? 200 : 401 });
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';

before(async () => {
  P = await startPortal({ fetchImpl: fakeFetch });
  sup = client(P.url);
  await sup.login('super@teste.local', 'senha-forte-123');
  await sup.req('POST', '/api/tenants', { name: 'Clube IA', number: '10004', niche: 'poker', template: 'clube-poker-premium' });
  await sup.req('POST', '/api/t/clube-10004/users', { email: 'mkt@teste.com', role: 'marketing', password: 'marketing-senha-1' });
  await sup.req('POST', '/api/t/clube-10004/users', { email: 'ed@teste.com', role: 'editor', password: 'editor-senha-12' });
});
after(() => P.close());

const form = (o) => new URLSearchParams(o).toString();
const formHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };

async function oauthConnect(email, password) {
  const reg = await fetch(`${P.url}/oauth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: [REDIRECT] }) });
  assert.equal(reg.status, 201);
  const { client_id } = await reg.json();
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const q = { response_type: 'code', client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', scope: 'portal' };
  const page = await fetch(`${P.url}/oauth/authorize?${form(q)}`);
  assert.match(await page.text(), /Entre com a sua conta/);
  const login = await fetch(`${P.url}/oauth/authorize`, { method: 'POST', headers: formHeaders, body: form({ ...q, action: 'login', email, password }) });
  const html = await login.text();
  assert.match(html, /Permitir que <strong>Claude<\/strong>/);
  const cookieHeader = login.headers.getSetCookie()[0].split(';')[0];
  const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
  const tenant = html.match(/<option value="([^"]+)"/)[1];
  const ok = await fetch(`${P.url}/oauth/authorize`, { method: 'POST', redirect: 'manual', headers: { ...formHeaders, Cookie: cookieHeader }, body: form({ ...q, action: 'approve', csrf, tenant }) });
  assert.equal(ok.status, 302);
  const loc = new URL(ok.headers.get('location'));
  assert.equal(loc.origin + loc.pathname, REDIRECT);
  assert.equal(loc.searchParams.get('state'), 'xyz');
  const code = loc.searchParams.get('code');
  const badPkce = await fetch(`${P.url}/oauth/token`, { method: 'POST', headers: formHeaders, body: form({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id, code_verifier: 'errado' }) });
  assert.equal(badPkce.status, 400, 'PKCE errado é recusado (e queima o código)');
  return { client_id, q, cookieHeader, csrf, tenant, verifier };
}

async function tokensFor(email, password) {
  const c = await oauthConnect(email, password);
  // o código anterior foi queimado pelo teste de PKCE: pede outro
  const ok = await fetch(`${P.url}/oauth/authorize`, { method: 'POST', redirect: 'manual', headers: { ...formHeaders, Cookie: c.cookieHeader }, body: form({ ...c.q, action: 'approve', csrf: c.csrf, tenant: c.tenant }) });
  const code = new URL(ok.headers.get('location')).searchParams.get('code');
  const r = await fetch(`${P.url}/oauth/token`, { method: 'POST', headers: formHeaders, body: form({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: c.client_id, code_verifier: c.verifier }) });
  assert.equal(r.status, 200);
  return { ...(await r.json()), client_id: c.client_id };
}

let rpcId = 0;
const rpc = async (tok, method, params) => {
  const r = await fetch(`${P.url}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }) });
  return { status: r.status, body: r.status === 200 ? await r.json() : null, headers: r.headers };
};

test('sem token, /mcp responde 401 apontando para o servidor de autorização', async () => {
  const r = await fetch(`${P.url}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"initialize"}' });
  assert.equal(r.status, 401);
  assert.match(r.headers.get('www-authenticate'), /resource_metadata=".*\/\.well-known\/oauth-protected-resource"/);
  const pr = await (await fetch(`${P.url}/.well-known/oauth-protected-resource`)).json();
  assert.equal(pr.resource, `${P.origin}/mcp`);
  const as = await (await fetch(`${P.url}/.well-known/oauth-authorization-server`)).json();
  assert.deepEqual(as.code_challenge_methods_supported, ['S256']);
  assert.ok(as.registration_endpoint);
});

test('marketing conecta pelo OAuth e usa as ferramentas; rascunho no calendário não duplica', async () => {
  const t = await tokensFor('mkt@teste.com', 'marketing-senha-1');
  let r = await rpc(t.access_token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'teste', version: '1' } });
  assert.equal(r.body.result.protocolVersion, '2025-06-18');
  assert.match(r.body.result.instructions, /Clube 10004/);
  r = await rpc(t.access_token, 'tools/list');
  const names = r.body.result.tools.map((x) => x.name);
  for (const n of ['resumo_da_operacao', 'listar_paginas', 'atualizar_rascunho_da_pagina', 'criar_rascunho_no_calendario', 'listar_leads']) assert.ok(names.includes(n), n);
  assert.ok(!names.includes('meu_link_de_afiliado'), 'marketing não é afiliado');
  const args = { canal: 'instagram', quando: '2026-11-07T12:00:00-03:00', legenda: 'Torneio de sábado às 20h. Link na bio.' };
  r = await rpc(t.access_token, 'tools/call', { name: 'criar_rascunho_no_calendario', arguments: args });
  assert.equal(r.body.result.isError, false);
  assert.equal(r.body.result.structuredContent.situacao, 'rascunho');
  r = await rpc(t.access_token, 'tools/call', { name: 'criar_rascunho_no_calendario', arguments: args });
  assert.equal(r.body.result.structuredContent.duplicado, true);
  r = await rpc(t.access_token, 'tools/call', { name: 'listar_paginas', arguments: {} });
  const page = r.body.result.structuredContent.sites[0].paginas[1];
  r = await rpc(t.access_token, 'tools/call', { name: 'ler_pagina', arguments: { pagina_id: page.id } });
  const blocos = r.body.result.structuredContent.blocos;
  r = await rpc(t.access_token, 'tools/call', { name: 'atualizar_rascunho_da_pagina', arguments: { pagina_id: page.id, blocos: [...blocos, { type: 'text', props: { title: 'Novo', body: 'Texto escrito pela IA.' } }] } });
  assert.equal(r.body.result.isError, false);
  const pub = (await sup.req('GET', '/s/clube-10004/torneios', undefined, { raw: true })).status;
  assert.equal(pub, 404, 'a IA só mexe no rascunho: nada foi publicado');
  r = await rpc(t.access_token, 'tools/call', { name: 'atualizar_rascunho_da_pagina', arguments: { pagina_id: page.id, blocos: [{ type: 'bloco_que_nao_existe' }] } });
  assert.equal(r.body.result.isError, true);

  // refresh com rotação; reusar o refresh antigo derruba a conexão
  let rt = await fetch(`${P.url}/oauth/token`, { method: 'POST', headers: formHeaders, body: form({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: t.client_id }) });
  assert.equal(rt.status, 200);
  const t2 = await rt.json();
  assert.equal((await rpc(t2.access_token, 'ping')).status, 200);
  assert.equal((await rpc(t.access_token, 'ping')).status, 401, 'access antigo morre na rotação');
  rt = await fetch(`${P.url}/oauth/token`, { method: 'POST', headers: formHeaders, body: form({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: t.client_id }) });
  assert.equal(rt.status, 400);
  assert.equal((await rpc(t2.access_token, 'ping')).status, 401, 'reuso de refresh revoga a família inteira');
});

test('editor não vê nem chama ferramenta de leads; tirar o acesso derruba a IA', async () => {
  const t = await tokensFor('ed@teste.com', 'editor-senha-12');
  let r = await rpc(t.access_token, 'tools/list');
  assert.ok(!r.body.result.tools.some((x) => x.name === 'listar_leads'));
  r = await rpc(t.access_token, 'tools/call', { name: 'listar_leads', arguments: {} });
  assert.equal(r.body.error.code, -32602);
  const ed = P.db.prepare("SELECT id FROM users WHERE email = 'ed@teste.com'").get();
  await sup.req('DELETE', `/api/t/clube-10004/users/${ed.id}`);
  assert.equal((await rpc(t.access_token, 'ping')).status, 401);
});

test('token pessoal (linha de comando), revogação e chave de API guardada no cofre', async () => {
  const mkt = client(P.url);
  await mkt.login('mkt@teste.com', 'marketing-senha-1');
  let r = await mkt.req('POST', '/api/t/clube-10004/ai/tokens', { name: 'Claude Code' });
  assert.equal(r.status, 201);
  const pat = r.data.token;
  assert.match(pat, /^pa_pat_/);
  assert.equal((await rpc(pat, 'ping')).status, 200);
  r = await mkt.req('GET', '/api/t/clube-10004/ai');
  const conn = r.data.connections.find((c) => c.name === 'Claude Code');
  assert.ok(conn);
  assert.ok(!JSON.stringify(r.data).includes(pat), 'o token não volta para a tela');
  await mkt.req('DELETE', `/api/t/clube-10004/ai/tokens/${conn.family}`);
  assert.equal((await rpc(pat, 'ping')).status, 401);

  const secretKey = `sk-ant-${'x'.repeat(40)}`;
  r = await mkt.req('PUT', '/api/t/clube-10004/ai/keys/anthropic', { key: secretKey });
  assert.equal(r.data.status, 'valida');
  r = await mkt.req('PUT', '/api/t/clube-10004/ai/keys/openai', { key: `sk-${'y'.repeat(40)}` });
  assert.equal(r.data.status, 'erro');
  r = await mkt.req('PUT', '/api/t/clube-10004/ai/services/instagram', { enabled: true, provider: 'anthropic' });
  assert.equal(r.status, 200);
  r = await mkt.req('GET', '/api/t/clube-10004/ai');
  assert.ok(!JSON.stringify(r.data).includes(secretKey), 'a chave nunca volta para a tela');
  const stored = P.db.prepare("SELECT secret FROM ai_keys WHERE provider = 'anthropic'").get().secret;
  assert.ok(!stored.includes(secretKey) && stored.startsWith('v1.'), 'a chave fica cifrada no banco');
  const ig = r.data.services.find((s) => s.id === 'instagram');
  assert.equal(ig.enabled, true);
  assert.equal(ig.status.pronto.automatico, false, 'sem rotina instalada não finge que roda sozinho');
  const audit = JSON.stringify(P.db.prepare('SELECT data FROM audit').all());
  assert.ok(!audit.includes(secretKey) && !audit.includes(pat), 'nada de segredo na auditoria');
});
