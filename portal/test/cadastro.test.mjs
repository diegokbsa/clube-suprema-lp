// Cadastro no app + Fichas 24h guiado (a jornada do suprema.blog para todas as operações): passos novos do catálogo,
// lead no CRM com variante e UTMs, senha só na memória, ID do app com acompanhamento ao vivo, retomada sem lead repetido,
// painel de cadastros, permissões e isolamento entre operações.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startPortal, client } from './helpers.mjs';
import { senhaProblema, senhaDe } from '../lib/modules/cadastro.mjs';
import { STEP_TYPES, PRESETS, cleanSteps } from '../lib/modules/journeys.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SENHA = 'Zebra@7788';
let P;
let sup;
let jid;
let outra;

const post = (slug, p, corpo, headers = {}) => fetch(`${P.url}/s/${slug}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers }, body: JSON.stringify(corpo) })
  .then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));
const get = (slug, p) => fetch(`${P.url}/s/${slug}${p}`, { headers: { Accept: 'application/json' } }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));
const inicio = (corpo, slug = 'clube-10070', j = jid) => post(slug, `/cad/${j}/inicio`, { email: 'jogador@exemplo.com', password: SENHA, consent: 1, variant: 'a', page: '', ...corpo });

/** Procura um texto em todas as tabelas do banco. */
function noBanco(db, texto) {
  const tabelas = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => t.name);
  return tabelas.filter((t) => db.prepare(`SELECT * FROM ${t}`).all().some((row) => JSON.stringify(row).includes(texto)));
}

before(async () => {
  P = await startPortal();
  sup = client(P.url);
  await sup.login('super@teste.local', 'senha-forte-123');
  await sup.req('POST', '/api/tenants', { name: 'Clube Cadastro', number: '10070', niche: 'poker', template: 'clube-poker-premium',
    settings: { app: 'Suprema Poker', agentId: '777123', inviteLink: 'https://convite.exemplo.com/clube', chipsUrl: 'https://fichas.exemplo.com/signup',
      chipsHomeUrl: 'https://fichas.exemplo.com/home', chipsClubName: 'CLUBE TESTE' } });
  await sup.req('POST', '/api/tenants', { name: 'Outro Clube', number: '10071', niche: 'poker', template: 'clube-poker-premium' });
  const r = await sup.req('POST', '/api/t/clube-10070/journeys', { preset: 'cadastro-app-fichas24h' });
  jid = r.data.journey.id;
  await sup.req('POST', `/api/t/clube-10070/journeys/${jid}/status`, { status: 'rodando' });
  const r2 = await sup.req('POST', '/api/t/clube-10071/journeys', { preset: 'cadastro-app-fichas24h' });
  outra = r2.data.journey.id;
  await sup.req('POST', `/api/t/clube-10071/journeys/${outra}/status`, { status: 'rodando' });
});
after(() => P.close());

test('o catálogo tem os passos novos e o modelo A/B do suprema.blog', async () => {
  for (const t of ['conta_app', 'entrar_clube', 'fichas24h']) assert.ok(STEP_TYPES[t], `passo ${t} no catálogo`);
  const p = PRESETS['cadastro-app-fichas24h'];
  assert.deepEqual(p.variants[0].steps.map((s) => s.type), ['conta_app', 'entrar_clube', 'fichas24h', 'final']);
  assert.deepEqual(p.variants[1].steps.map((s) => s.type), ['conta_app', 'fichas24h', 'entrar_clube', 'fichas24h', 'final']);
  assert.deepEqual(p.variants[1].steps.filter((s) => s.type === 'fichas24h').map((s) => s.parte), ['cadastro', 'compra']);
  assert.equal(cleanSteps([{ type: 'fichas24h', parte: 'qualquer' }])[0].parte, 'tudo', 'parte inválida volta para "tudo"');

  const lista = (await sup.req('GET', '/api/t/clube-10070/journeys')).data;
  assert.ok(lista.presets.some((x) => x.id === 'cadastro-app-fichas24h'), 'modelo oferecido para operação de pôquer');
  const cfg = (await get('clube-10070', `/j/${jid}/config`)).data;
  const a = cfg.variants.find((v) => v.key === 'a').steps;
  assert.equal(a.find((s) => s.type === 'entrar_clube').url, 'https://convite.exemplo.com/clube', 'link de convite das configurações da operação');
  const f = a.find((s) => s.type === 'fichas24h');
  assert.equal(f.signupUrl, 'https://fichas.exemplo.com/signup');
  assert.equal(f.homeUrl, 'https://fichas.exemplo.com/home');
  assert.equal(f.clubName, 'CLUBE TESTE');
  assert.equal(f.clube, '10070');
  assert.equal(f.agente, '777123');
});

test('senha segue as regras do app e o consentimento é obrigatório', async () => {
  assert.match(senhaProblema('fraca'), /6 a 16 caracteres/);
  assert.equal(senhaProblema(SENHA), null);
  let r = await inicio({ password: 'semsimbolo1A' });
  assert.equal(r.status, 422);
  assert.match(r.data.error, /símbolo/);
  r = await inicio({ consent: 0 });
  assert.equal(r.status, 422);
  r = await inicio({ email: 'nao-e-email' });
  assert.equal(r.status, 422);
  r = await inicio({ variant: 'z' });
  assert.equal(r.status, 400);
  r = await inicio({ website: 'robô' });
  assert.equal(r.status, 201, 'armadilha finge sucesso');
  assert.equal(r.data.id, undefined, 'e não cria nada');
  assert.equal((await sup.req('GET', '/api/t/clube-10070/cadastros')).data.funil.cadastros, 0);
});

let cad;
test('cadastro vira lead no CRM com variante e UTMs e fica esperando o jogador entrar no clube', async () => {
  const r = await inicio({ email: 'Jogador@Exemplo.com', variant: 'b', page: 'inicio', utm: { utm_source: 'google', utm_campaign: 'clube', gclid: 'abc123', ref: 'parceiro' } });
  assert.equal(r.status, 201);
  cad = r.data;
  assert.equal(cad.status, 'aguardando_jogador');
  assert.equal(cad.needs, 'entrar_clube');
  assert.equal(cad.email, 'jogador@exemplo.com');
  assert.deepEqual(cad.steps.map((s) => [s.key, s.state]), [['conta_app', 'aguardando'], ['email_app', 'pendente']]);
  assert.equal(senhaDe(cad.id), SENHA, 'a senha fica na memória enquanto o cadastro anda');

  const leads = (await sup.req('GET', '/api/t/clube-10070/leads')).data.leads;
  assert.equal(leads.length, 1);
  const utm = typeof leads[0].utm === 'string' ? JSON.parse(leads[0].utm) : leads[0].utm;
  assert.equal(utm.jornada_id, jid);
  assert.equal(utm.variante, 'b');
  assert.equal(utm.utm_source, 'google');
  assert.equal(utm.gclid, 'abc123');
  assert.equal(utm.ref, 'parceiro');
  assert.ok(P.db.prepare("SELECT 1 FROM lead_events WHERE lead_id = ? AND kind = 'cadastro_app'").get(leads[0].id));
  assert.ok(leads[0].contact_id || P.db.prepare('SELECT contact_id FROM leads WHERE id = ?').get(leads[0].id).contact_id, 'pessoa na base única');
});

test('a senha nunca é gravada no banco', () => {
  assert.deepEqual(noBanco(P.db, SENHA), [], 'nenhuma tabela tem a senha');
});

test('mesmo e-mail de novo na mesma jornada retoma o cadastro sem criar outro lead', async () => {
  const r = await inicio({ email: 'jogador@exemplo.com', variant: 'b' });
  assert.equal(r.status, 200);
  assert.equal(r.data.id, cad.id);
  assert.equal(r.data.retomado, true);
  assert.equal((await sup.req('GET', '/api/t/clube-10070/leads')).data.leads.length, 1);
});

test('o estado é consultado ao vivo e o ID do app termina a conta', async () => {
  let s = await get('clube-10070', `/cad/${cad.id}/status`);
  assert.equal(s.status, 200);
  assert.equal(s.data.pronto, false);
  let r = await post('clube-10070', `/cad/${cad.id}/id-app`, { idApp: '12' });
  assert.equal(r.status, 400, 'ID curto demais');
  r = await post('clube-10070', `/cad/${cad.id}/id-app`, { idApp: '1822 635' });
  assert.equal(r.status, 200);
  assert.equal(r.data.pronto, true);
  assert.equal(r.data.idApp, '1822635');
  s = await get('clube-10070', `/cad/${cad.id}/status`);
  assert.equal(s.data.status, 'pronto');
  assert.deepEqual(s.data.steps.map((x) => x.state), ['ok', 'ok']);
  assert.equal(senhaDe(cad.id), null, 'conta pronta: a senha sai da memória');
  const lead = P.db.prepare('SELECT id FROM leads WHERE email = ?').get('jogador@exemplo.com');
  const kinds = P.db.prepare('SELECT kind FROM lead_events WHERE lead_id = ?').all(lead.id).map((e) => e.kind);
  assert.ok(kinds.includes('id_app') && kinds.includes('cadastro_pronto'), 'o histórico do lead mostra o ID e a conta pronta');
});

test('o painel mostra o funil, a comparação A/B e deixa o suporte informar o ID', async () => {
  const r2 = await inicio({ email: 'segundo@exemplo.com', variant: 'a' });
  const d = (await sup.req('GET', '/api/t/clube-10070/cadastros')).data;
  assert.equal(d.funil.cadastros, 2);
  assert.equal(d.funil.prontos, 1);
  assert.equal(d.funil.aguardando, 1);
  assert.equal(d.funil.comId, 1);
  assert.deepEqual(d.porVariante.map((g) => [g.variant, g.cadastros, g.prontos]), [['a', 1, 0], ['b', 1, 1]]);
  assert.ok(!JSON.stringify(d).includes(SENHA));
  const ok = await sup.req('POST', `/api/t/clube-10070/cadastros/${r2.data.id}/id-app`, { idApp: '445566' });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.cadastro.pronto, true);
});

test('jornada parada não aceita cadastro', async () => {
  await sup.req('POST', `/api/t/clube-10070/journeys/${jid}/status`, { status: 'pausada' });
  const r = await inicio({ email: 'pausada@exemplo.com' });
  assert.equal(r.status, 404);
  await sup.req('POST', `/api/t/clube-10070/journeys/${jid}/status`, { status: 'rodando' });
});

test('isolamento: outra operação não lê nem usa o cadastro; papel sem permissão recebe 403', async () => {
  assert.equal((await get('clube-10071', `/cad/${cad.id}/status`)).status, 404, 'o site de outra operação não acha o cadastro');
  assert.equal((await post('clube-10071', `/cad/${cad.id}/id-app`, { idApp: '999999' })).status, 404);
  assert.equal((await inicio({ email: 'x@exemplo.com' }, 'clube-10071', jid)).status, 404, 'jornada de outra operação');
  const outro = (await sup.req('GET', '/api/t/clube-10071/cadastros')).data;
  assert.equal(outro.funil.cadastros, 0);
  await sup.req('POST', '/api/t/clube-10070/users', { email: 'af-cad@teste.com', role: 'affiliate', password: 'afiliado-senha-77' });
  const af = client(P.url);
  await af.login('af-cad@teste.com', 'afiliado-senha-77');
  assert.equal((await af.req('GET', '/api/t/clube-10070/cadastros')).status, 403);
  await sup.req('POST', '/api/t/clube-10070/users', { email: 'ed-cad@teste.com', role: 'editor', password: 'editor-senha-77' });
  const ed = client(P.url);
  await ed.login('ed-cad@teste.com', 'editor-senha-77');
  assert.equal((await ed.req('GET', '/api/t/clube-10070/cadastros')).status, 403, 'editor não lê leads');
});

test('a página da jornada consulta o estado a cada 1,2 s e não guarda senha nem CPF no servidor', () => {
  const js = fs.readFileSync(path.join(AQUI, '..', 'public', 'assets', 'journey.js'), 'utf8');
  assert.match(js, /setInterval\(consultar, 1200\)/);
  for (const t of ["'conta_app'", "'entrar_clube'", "'fichas24h'"]) assert.ok(js.includes(t), `journey.js desenha ${t}`);
  assert.ok(!/store\.set\([^)]*password/.test(js), 'a senha não vai para o armazenamento do aparelho');
  assert.ok(!/cad\([^)]*\)[^;]*cpf/i.test(js), 'o CPF não é mandado para as rotas do cadastro');
  assert.match(js, /localStorage\.removeItem\(f24Key\)/, 'os dados do Fichas 24h são apagados no fim');
});
