// Um servidor e um banco para as duas edições: a edição vem da porta (no ar, do endereço).
// Cada operação nasce com portal e CRM próprios; a pessoa existe uma vez na base; ninguém vê cliente de outra operação.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb } from '../lib/db.mjs';
import { createApp } from '../server.mjs';
import { createUser } from '../lib/auth.mjs';
import { normPhone } from '../lib/migrations.mjs';
import { client } from './helpers.mjs';

let db; let geral; let sx; let sG; let sS;
const servers = [];

before(async () => {
  db = openDb(':memory:');
  const listen = async () => { const s = http.createServer(); await new Promise((r) => s.listen(0, '127.0.0.1', r)); servers.push(s); return s; };
  const a = await listen();
  const b = await listen();
  geral = `http://127.0.0.1:${a.address().port}`;
  sx = `http://127.0.0.1:${b.address().port}`;
  const { handle } = await createApp({ db, origin: geral, secretKey: 't', portEditions: { [a.address().port]: 'geral', [b.address().port]: 'sx' } });
  a.on('request', handle);
  b.on('request', handle);
  createUser(db, { email: 'super@teste.local', name: 'Super', password: 'senha-forte-123', isSuper: true });
  sG = client(geral); await sG.login('super@teste.local', 'senha-forte-123');
  sS = client(sx); await sS.login('super@teste.local', 'senha-forte-123');
});
after(() => Promise.all(servers.map((s) => new Promise((r) => s.close(r)))));

const lead = (base, siteId, body) => fetch(`${base}/f/${siteId}`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ consent: '1', ...body }) });

test('novo clube nasce com portal e CRM próprios na edição certa', async () => {
  let r = await sS.req('POST', '/api/tenants', { name: 'Clube Novo', number: '123123', template: 'clube-poker-premium' });
  assert.equal(r.status, 201);
  assert.equal(r.data.tenant.edition, 'sx');
  r = await sG.req('POST', '/api/tenants', { name: 'Parceiro SaaS', number: '20001', niche: 'saas' });
  assert.equal(r.data.tenant.edition, 'geral');
  const meS = (await sS.req('GET', '/api/me')).data.tenants.map((t) => t.slug);
  const meG = (await sG.req('GET', '/api/me')).data.tenants.map((t) => t.slug);
  assert.deepEqual(meS, ['clube-123123'], 'a SX só lista os clubes dela');
  assert.deepEqual(meG, ['parceiro-20001'], 'a Geral só lista as operações dela');
  assert.equal((await sG.req('GET', '/api/t/clube-123123')).status, 404, 'clube da SX não abre pelo endereço da Geral');
  assert.equal((await sS.req('GET', '/api/t/clube-123123/clientes')).status, 200, 'o clube tem a tela de clientes dele');
  assert.equal((await sS.req('GET', '/api/edition')).data.id, 'sx');
  assert.equal((await sG.req('GET', '/api/edition')).data.id, 'geral');
});

test('a mesma pessoa entra por dois clubes e existe uma vez só na base', async () => {
  await sS.req('POST', '/api/tenants', { name: 'Clube Dois', number: '777777', template: 'clube-poker-premium' });
  const site1 = (await sS.req('GET', '/api/t/clube-123123/sites')).data.sites[0];
  const site2 = (await sS.req('GET', '/api/t/clube-777777/sites')).data.sites[0];
  assert.equal((await lead(sx, site1.id, { email: 'Joao@Exemplo.com', name: 'João', phone: '(11) 98888-7777', utm_source: 'instagram' })).status, 201);
  assert.equal((await lead(sx, site2.id, { email: 'joao@exemplo.com', name: 'João Silva' })).status, 201);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM contacts').get().n, 1, 'e-mail igual (maiúscula ou não) = mesma pessoa');
  const c1 = (await sS.req('GET', '/api/t/clube-123123/clientes')).data;
  assert.equal(c1.total, 1);
  assert.equal(c1.clientes[0].origem, 'instagram');
  const cid = c1.clientes[0].id;
  const d1 = (await sS.req('GET', `/api/t/clube-123123/clientes/${cid}`)).data;
  assert.equal(d1.leads.length, 1, 'o clube vê só as entradas dele');
  const base = (await sS.req('GET', '/api/admin/clientes')).data;
  assert.equal(base.totais.pessoas, 1);
  assert.equal(base.totais.emMaisDeUma, 1);
  assert.equal(base.clientes[0].operacoes, 2);
  const rel = (await sS.req('GET', `/api/admin/clientes/${cid}`)).data.relacionamentos;
  assert.equal(rel.length, 2);
  assert.equal((await sG.req('GET', '/api/admin/clientes')).data.totais.pessoas, 0, 'a base da Geral não mostra clientes que só passaram pela SX');
});

test('dono de um clube não vê cliente de outro clube, nem pelo id', async () => {
  await sS.req('POST', '/api/t/clube-777777/users', { email: 'dono7@teste.com', role: 'admin', password: 'dono-senha-777' });
  const dono = client(sx);
  await dono.login('dono7@teste.com', 'dono-senha-777');
  const cid = db.prepare('SELECT id FROM contacts').get().id;
  assert.equal((await dono.req('GET', '/api/t/clube-123123/clientes')).status, 404);
  const meu = (await dono.req('GET', `/api/t/clube-777777/clientes/${cid}`)).data;
  assert.equal(meu.leads.length, 1, 'vê a entrada da pessoa no clube dele');
  assert.equal(JSON.stringify(meu).includes('instagram'), false, 'não vê a origem que ela teve no outro clube');
  // a pessoa deixou o telefone só no clube 123123; no 777777 deixou e-mail e outro nome
  assert.equal(meu.cliente.phone, null, 'não vê o telefone que ela deixou no outro clube');
  assert.equal(meu.cliente.name, 'João Silva', 'vê o nome que ela deixou neste clube');
  const lista = (await dono.req('GET', '/api/t/clube-777777/clientes')).data.clientes;
  assert.equal(lista[0].phone, null, 'a lista também não mostra o telefone de outro clube');
  assert.equal(JSON.stringify(lista).includes('98888'), false);
  assert.equal((await dono.req('GET', '/api/t/clube-777777/clientes?q=98888')).data.clientes.length, 0, 'busca pelo telefone de outro clube não acha');
  const global = db.prepare('SELECT name, phone FROM contacts WHERE id = ?').get(cid);
  assert.equal(global.name, 'João', 'cadastro de outro clube não sobrescreve o nome da base');
  const outra = db.prepare("INSERT INTO contacts (id, email, created_at, updated_at) VALUES ('so-do-outro', 'x@y.com', 'a', 'a')").run();
  void outra;
  assert.equal((await dono.req('GET', '/api/t/clube-777777/clientes/so-do-outro')).status, 404);
  assert.equal((await dono.req('GET', '/api/admin/clientes')).status, 403, 'base inteira só para o superadmin');
});

test('telefone brasileiro é normalizado', () => {
  assert.equal(normPhone('(11) 98888-7777'), '5511988887777');
  assert.equal(normPhone('+55 11 98888-7777'), '5511988887777');
  assert.equal(normPhone('123'), null);
});
