// PA-140 · Trilha "Migrar para o pôquer": candidatura pública, fila do superadmin, aprovação em rascunho, primeiro acesso,
// página de perguntas, kit de 7 dias, placar, chave migracao.ativa e a edição Geral sem a trilha.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb } from '../lib/db.mjs';
import { createApp } from '../server.mjs';
import { createUser, checkPassword } from '../lib/auth.mjs';
import { client, sign } from './helpers.mjs';
import { checarTexto } from '../lib/preflight.mjs';
import { preflightPublico, VALIDADE_HORAS } from '../lib/modules/migracao.mjs';
import { montarKit } from '../lib/migracao/kit.mjs';
import { ANCORA_REVISAO, FAQ_SLUG, FONTES, REVISADO_EM } from '../lib/migracao/faq.mjs';

const servers = [];
async function start(editionId) {
  const db = openDb(':memory:');
  const server = http.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const { handle } = await createApp({ db, origin: url, secretKey: 't', editionId });
  server.on('request', handle);
  servers.push(server);
  createUser(db, { email: 'super@teste.local', name: 'Super', password: 'senha-forte-123', isSuper: true });
  const sup = client(url);
  await sup.login('super@teste.local', 'senha-forte-123');
  return { url, db, sup };
}
after(() => Promise.all(servers.map((s) => new Promise((r) => s.close(r)))));

let SX;
before(async () => { SX = await start('sx'); });

let ipSeq = 0;
const novoIp = () => `10.0.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;
const candidatura = (o = {}) => ({ nome: 'Joana Teste', contato: '11 98765-4321', canal: 'telegram', audiencia: '10k-50k', origem: 'afiliado-bet', nicho: 'futebol', maior18: '1', consentimento: '1', ...o });
async function enviar(url, dados, { ip = novoIp(), json = false } = {}) {
  const r = await fetch(`${url}/migrar`, { method: 'POST', redirect: 'manual', body: new URLSearchParams(dados).toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': ip, ...(json ? { Accept: 'application/json' } : {}) } });
  return { status: r.status, location: r.headers.get('location'), text: await r.text() };
}
const conta = (db, t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
const ultimaCand = (db) => db.prepare('SELECT * FROM migracao_candidaturas ORDER BY created_at DESC, rowid DESC LIMIT 1').get();

test('preflight bloqueia promessa e exige +18 e jogo responsável; os textos públicos da trilha passam', () => {
  const ruim = checarTexto('Ganhe renda extra com bônus e ficha grátis! Lucro garantido e rakeback.', { nicho: 'poker', edicao: 'sx', rede: 'instagram' });
  assert.equal(ruim.ok, false);
  const regras = ruim.bloqueios.map((b) => b.regra);
  for (const r of ['Promessa de ganho', 'Promessa de renda', 'Promessa de lucro', 'Bônus ao público', 'Ficha grátis ao público', 'Rakeback ao público', '"Garantido"']) assert.ok(regras.includes(r), `bloqueia: ${r}`);
  assert.deepEqual(ruim.faltando, ['+18', 'Jogue com responsabilidade']);
  const negado = checarTexto('Sem bônus e sem ficha grátis. Não prometemos ganho. +18. Jogue com responsabilidade.', { nicho: 'poker', edicao: 'sx' });
  assert.equal(negado.ok, true, 'negar a promessa não é prometer');
  const pub = preflightPublico();
  assert.equal(pub.migrar.ok, true, JSON.stringify(pub.migrar));
  assert.equal(pub.perguntas.ok, true, JSON.stringify(pub.perguntas));
  const kit = montarKit({ canal: 'tiktok', app: 'Suprema Poker', clube: 'Clube 1', linkPara: () => 'https://x.test/r/a/b' });
  assert.equal(kit.length, 7);
  assert.ok(kit.every((p) => p.preflight.ok && p.chamada.includes('https://x.test/r/a/b')), 'as 7 pautas passam e levam o link');
});

test('na edição Geral a trilha não existe: /migrar e a fila respondem 404', async () => {
  const G = await start('geral');
  assert.equal((await fetch(`${G.url}/migrar`)).status, 404);
  assert.equal((await enviar(G.url, candidatura())).status, 404);
  assert.equal((await G.sup.req('GET', '/api/admin/migracao')).status, 404);
  assert.equal(conta(G.db, 'migracao_candidaturas'), 0);
});

test('a página /migrar abre na SX com formulário, honeypot, +18 e consentimento', async () => {
  const r = await fetch(`${SX.url}/migrar`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /form-action 'self'/);
  const h = await r.text();
  for (const s of ['name="website"', 'name="maior18"', 'name="consentimento"', 'name="canal"', 'name="audiencia"', 'name="origem"', 'Jogue com responsabilidade', 'não é orientação jurídica']) assert.ok(h.includes(s), s);
  assert.doesNotMatch(h, /<script/i, 'página sem JavaScript');
});

test('candidatura entra na fila e não cria operação, usuário, site nem página', async () => {
  const antes = ['tenants', 'users', 'sites', 'pages', 'memberships'].map((t) => conta(SX.db, t));
  const r = await enviar(SX.url, candidatura({ nome: 'Carla Fila' }));
  assert.equal(r.status, 303);
  assert.match(r.location, /enviado=1/);
  assert.deepEqual(['tenants', 'users', 'sites', 'pages', 'memberships'].map((t) => conta(SX.db, t)), antes, 'nada além da candidatura foi criado');
  const c = ultimaCand(SX.db);
  assert.equal(c.nome, 'Carla Fila');
  assert.equal(c.status, 'nova');
  assert.equal(c.contato, '5511987654321', 'WhatsApp normalizado com DDI');
  assert.equal(c.tenant_id, null);
  assert.ok(!/\d+\.\d+\.\d+\.\d+/.test(c.ip_hash || ''), 'guarda só o hash do IP');
  const ok = await fetch(`${SX.url}${r.location}`);
  assert.match(await ok.text(), /Candidatura recebida/);
  const fila = await SX.sup.req('GET', '/api/admin/migracao?status=nova');
  assert.ok(fila.data.candidaturas.some((x) => x.nome === 'Carla Fila'));
  assert.equal(fila.data.modelos.length, 25, 'seletor com os 25 modelos de mundo');
  assert.ok(SX.db.prepare("SELECT 1 FROM audit WHERE action = 'migracao.candidatura' AND target = ?").get(c.id), 'auditoria da candidatura');
});

test('dados inválidos voltam com os erros e não gravam', async () => {
  const antes = conta(SX.db, 'migracao_candidaturas');
  const r = await enviar(SX.url, candidatura({ consentimento: '', maior18: '', contato: 'abc' }), { json: true });
  assert.equal(r.status, 400);
  const erros = JSON.parse(r.text).erros;
  assert.ok(erros.consentimento && erros.maior18 && erros.contato);
  const h = await enviar(SX.url, candidatura({ consentimento: '' }));
  assert.equal(h.status, 400);
  assert.match(h.text, /aria-invalid="true"/);
  assert.equal(conta(SX.db, 'migracao_candidaturas'), antes);
});

test('honeypot finge sucesso e não grava; limite de 5 candidaturas por IP por hora', async () => {
  const antes = conta(SX.db, 'migracao_candidaturas');
  const robo = await enviar(SX.url, candidatura({ website: 'http://spam.example' }));
  assert.equal(robo.status, 303, 'robô vê sucesso');
  assert.equal(conta(SX.db, 'migracao_candidaturas'), antes, 'e nada é gravado');
  const ip = novoIp();
  for (let i = 0; i < 5; i++) assert.equal((await enviar(SX.url, candidatura({ nome: `Pessoa ${i}` }), { ip })).status, 303);
  const sexta = await enviar(SX.url, candidatura({ nome: 'Pessoa 6' }), { ip });
  assert.equal(sexta.status, 429);
  assert.match(sexta.text, /Tente de novo daqui a uma hora/);
  assert.equal(conta(SX.db, 'migracao_candidaturas'), antes + 5);
  assert.equal((await enviar(SX.url, candidatura({ nome: 'Outro IP' }))).status, 303, 'outro IP segue livre');
});

let aprovada; // { cand, resp }
test('só o superadmin vê a fila e aprova', async () => {
  await enviar(SX.url, candidatura({ nome: 'Para Permissao' }));
  const cand = ultimaCand(SX.db);
  // um admin de outra operação SX, sem superadmin
  const t = await SX.sup.req('POST', '/api/tenants', { name: 'Clube Comum', number: '30001', template: 'sx-rack-clube' });
  assert.equal(t.status, 201);
  await SX.sup.req('POST', '/api/t/clube-30001/users', { email: 'dono@teste.local', role: 'admin', password: 'senha-dono-123' });
  const dono = client(SX.url);
  await dono.login('dono@teste.local', 'senha-dono-123');
  assert.equal((await dono.req('GET', '/api/admin/migracao')).status, 403);
  const r = await dono.req('POST', `/api/admin/migracao/${cand.id}/aprovar`, { nome: 'X', numero: '40001', codigoAgente: 'ag1', email: 'x@teste.local', modelo: 'sx-rack-clube' });
  assert.equal(r.status, 403);
  assert.equal((await client(SX.url).req('POST', `/api/admin/migracao/${cand.id}/aprovar`, {})).status, 401, 'sem sessão');
  assert.equal(ultimaCand(SX.db).status, 'nova', 'continua na fila');
});

test('aprovar cria a operação SX com site e páginas em rascunho, usuário sem senha, página de perguntas e kit', async () => {
  await enviar(SX.url, candidatura({ nome: 'Rafa Agente', canal: 'instagram', contato: 'rafa@teste.local', origem: 'criador' }));
  const cand = ultimaCand(SX.db);
  const ruim = await SX.sup.req('POST', `/api/admin/migracao/${cand.id}/aprovar`, { nome: 'Clube Rafa', numero: '20001', codigoAgente: 'ag-rafa', email: 'rafa@teste.local', modelo: 'clube-poker-premium' });
  assert.equal(ruim.status, 400, 'só modelo de mundo da SX');
  const r = await SX.sup.req('POST', `/api/admin/migracao/${cand.id}/aprovar`, { nome: 'Clube Rafa', numero: '20001', codigoAgente: 'ag-rafa', email: 'rafa@teste.local', modelo: 'sx-relogio-clube' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  aprovada = { cand, resp: r.data };
  const t = SX.db.prepare("SELECT * FROM tenants WHERE slug = 'clube-20001'").get();
  assert.equal(t.edition, 'sx');
  assert.equal(JSON.parse(t.settings).agentId, 'ag-rafa');
  const site = SX.db.prepare('SELECT * FROM sites WHERE tenant_id = ?').get(t.id);
  assert.equal(site.status, 'rascunho');
  assert.equal(site.template_id, 'sx-relogio-clube');
  assert.equal(JSON.parse(site.theme).world, 'relogio');
  const pages = SX.db.prepare('SELECT * FROM pages WHERE tenant_id = ?').all(t.id);
  assert.ok(pages.length >= 5);
  assert.ok(pages.every((p) => p.published === null), 'nada publicado automaticamente');
  const faq = pages.find((p) => p.slug === FAQ_SLUG);
  assert.ok(faq, 'página de perguntas criada');
  const blocos = JSON.parse(faq.draft);
  assert.ok(blocos.some((b) => b.props.anchor === ANCORA_REVISAO), 'aviso interno de revisão no rascunho');
  const txt = JSON.stringify(blocos);
  assert.ok(txt.includes(`revisado em ${REVISADO_EM}`.replace('revisado', 'Revisado')) || txt.includes(REVISADO_EM));
  assert.ok(txt.includes('não é orientação jurídica'));
  for (const f of FONTES) assert.ok(txt.includes(f.url), `cita ${f.url}`);
  assert.equal(blocos[0].type, 'navbar', 'usa o menu do próprio site');
  assert.equal(SX.db.prepare('SELECT status FROM migracao_revisoes WHERE page_id = ?').get(faq.id).status, 'aguardando_revisao');
  // usuário admin sem senha
  const u = SX.db.prepare("SELECT * FROM users WHERE email = 'rafa@teste.local'").get();
  assert.ok(u);
  assert.equal(SX.db.prepare('SELECT role FROM memberships WHERE user_id = ? AND tenant_id = ?').get(u.id, t.id).role, 'admin');
  assert.equal(checkPassword('', u.pass), false);
  assert.equal((await client(SX.url).req('POST', '/api/login', { email: 'rafa@teste.local', password: 'qualquer-coisa-1' })).status, 401, 'ninguém entra antes do primeiro acesso');
  // link de primeiro acesso, curto, sem envio
  assert.match(r.data.link, /\/primeiro-acesso\/[A-Za-z0-9_-]{40,}$/);
  const horas = (Date.parse(r.data.expiraEm) - Date.now()) / 3600_000;
  assert.ok(horas > VALIDADE_HORAS - 0.1 && horas <= VALIDADE_HORAS, 'validade curta');
  assert.equal(SX.db.prepare('SELECT COUNT(*) n FROM migracao_primeiro_acesso WHERE token_hash = ?').get(r.data.link.split('/').pop()).n, 0, 'o banco guarda só o hash');
  // kit e afiliado
  const kit = SX.db.prepare('SELECT * FROM migracao_kits WHERE tenant_id = ?').all(t.id);
  assert.equal(kit.length, 7);
  assert.ok(kit.every((k) => k.canal === 'instagram' && JSON.parse(k.preflight).ok && k.link.includes('/r/clube-20001/agrafa')));
  // candidatura e auditoria
  const c2 = SX.db.prepare('SELECT * FROM migracao_candidaturas WHERE id = ?').get(cand.id);
  assert.equal(c2.status, 'aprovada');
  assert.equal(c2.tenant_id, t.id);
  for (const a of ['operacao.criar', 'migracao.aprovar', 'migracao.link_primeiro_acesso']) assert.ok(SX.db.prepare('SELECT 1 FROM audit WHERE tenant_id = ? AND action = ?').get(t.id, a), `auditoria: ${a}`);
  assert.equal((await SX.sup.req('POST', `/api/admin/migracao/${cand.id}/aprovar`, { nome: 'De novo', numero: '20002', codigoAgente: 'ag2', email: 'z@teste.local', modelo: 'sx-rack-clube' })).status, 409, 'não aprova duas vezes');
});

test('primeiro acesso: cria a senha uma vez; link usado ou expirado não vale', async () => {
  const link = aprovada.resp.link;
  const path = new URL(link).pathname;
  let r = await fetch(`${SX.url}${path}`);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /rafa@teste\.local/);
  const post = (senha, senha2 = senha) => fetch(`${SX.url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ senha, senha2 }).toString() });
  assert.equal((await post('curta')).status, 400);
  assert.equal((await post('senha-boa-123', 'outra-senha-123')).status, 400);
  r = await post('senha-boa-123');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Senha criada/);
  const agente = client(SX.url);
  await agente.login('rafa@teste.local', 'senha-boa-123');
  assert.equal((await fetch(`${SX.url}${path}`)).status, 410, 'link usado não vale de novo');
  assert.equal((await post('outra-senha-456')).status, 410);
  assert.ok(SX.db.prepare("SELECT 1 FROM audit WHERE action = 'usuario.primeiro_acesso'").get());
  // expiração: outra aprovação, link vencido no relógio
  await enviar(SX.url, candidatura({ nome: 'Lia Expira', contato: 'lia@teste.local' }));
  const c = ultimaCand(SX.db);
  const a = await SX.sup.req('POST', `/api/admin/migracao/${c.id}/aprovar`, { nome: 'Clube Lia', numero: '20003', codigoAgente: 'ag-lia', email: 'lia@teste.local', modelo: 'sx-ingresso-fichas' });
  assert.equal(a.status, 201);
  const p2 = new URL(a.data.link).pathname;
  assert.equal((await fetch(`${SX.url}${p2}`)).status, 200);
  SX.db.prepare("UPDATE migracao_primeiro_acesso SET expira_em = ? WHERE user_id = (SELECT id FROM users WHERE email = 'lia@teste.local')").run(new Date(Date.now() - 1000).toISOString());
  assert.equal((await fetch(`${SX.url}${p2}`)).status, 410, 'link expirado não abre');
  // link novo substitui o anterior
  const novo = await SX.sup.req('POST', `/api/admin/migracao/${c.id}/link`);
  assert.equal(novo.status, 200);
  assert.equal((await fetch(`${SX.url}${new URL(novo.data.link).pathname}`)).status, 200);
});

test('painel do agente: placar vazio explica; clique, lead e primeira recarga verificada entram no placar', async () => {
  const agente = client(SX.url);
  await agente.login('rafa@teste.local', 'senha-boa-123');
  let d = (await agente.req('GET', '/api/t/clube-20001/migracao')).data;
  assert.equal(d.veioDaTrilha, true);
  assert.equal(d.placar.semDados, true);
  assert.equal(d.perguntas.revisao, 'aguardando_revisao');
  assert.equal(d.kit.length, 7);
  // clique no link rastreado do agente -> cookie -> conversão verificada pelo webhook assinado
  const clique = await fetch(`${SX.url}/r/clube-20001/agrafa?utm_source=afiliado`, { redirect: 'manual' });
  assert.equal(clique.status, 302);
  const t = SX.db.prepare("SELECT * FROM tenants WHERE slug = 'clube-20001'").get();
  const clickId = SX.db.prepare('SELECT id FROM clicks WHERE tenant_id = ?').get(t.id).id;
  const body = JSON.stringify({ source: 'suprema', external_id: 'rec-1', kind: 'primeiro_deposito', value_cents: 5000, click_id: clickId });
  const hook = await fetch(`${SX.url}/api/hooks/clube-20001/conversion`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Portal-Signature': sign(t.webhook_secret, body) }, body });
  assert.equal(hook.status, 201);
  d = (await agente.req('GET', '/api/t/clube-20001/migracao')).data;
  assert.equal(d.placar.semDados, false);
  assert.equal(d.placar.cliquesLink, 1);
  assert.equal(d.placar.conv7, 1);
  assert.equal(d.placar.conv7Link, 1);
  assert.equal(d.placar.conv30, 1);
  const fila = (await SX.sup.req('GET', '/api/admin/migracao?status=aprovada')).data;
  assert.equal(fila.placar.conv30Link, 1, 'o placar do superadmin soma o agente');
  assert.ok(fila.porOrigem.some((o) => o.origem === 'criador' && o.aprovadas === 1));
  // kit de outro canal, pelo próprio agente
  const k = await agente.req('POST', '/api/t/clube-20001/migracao/kit', { canal: 'youtube' });
  assert.equal(k.status, 200);
  assert.equal(SX.db.prepare("SELECT COUNT(*) n FROM migracao_kits WHERE tenant_id = ? AND canal = 'youtube'").get(t.id).n, 7);
  // revisão das perguntas: só superadmin; tira o aviso e não publica
  assert.equal((await agente.req('POST', '/api/t/clube-20001/migracao/perguntas/revisar')).status, 403);
  assert.equal((await SX.sup.req('POST', '/api/t/clube-20001/migracao/perguntas/revisar')).status, 200);
  const faq = SX.db.prepare('SELECT * FROM pages WHERE tenant_id = ? AND slug = ?').get(t.id, FAQ_SLUG);
  assert.ok(!JSON.parse(faq.draft).some((b) => b.props.anchor === ANCORA_REVISAO));
  assert.equal(faq.published, null, 'revisar não publica');
  // operação SX que não veio da trilha
  assert.equal((await SX.sup.req('GET', '/api/t/clube-30001/migracao')).data.veioDaTrilha, false);
});

test('recusar não avisa ninguém e não cria nada', async () => {
  await enviar(SX.url, candidatura({ nome: 'Recusada Silva' }));
  const c = ultimaCand(SX.db);
  const antes = conta(SX.db, 'tenants');
  const r = await SX.sup.req('POST', `/api/admin/migracao/${c.id}/recusar`, { motivo: 'Canal só de dicas de aposta' });
  assert.equal(r.status, 200);
  assert.equal(SX.db.prepare('SELECT status FROM migracao_candidaturas WHERE id = ?').get(c.id).status, 'recusada');
  assert.equal(conta(SX.db, 'tenants'), antes);
  assert.ok(SX.db.prepare("SELECT 1 FROM audit WHERE action = 'migracao.recusar' AND target = ?").get(c.id));
});

test('chave migracao.ativa pausa a trilha: /migrar não aceita candidatura e nada é aprovado', async () => {
  await enviar(SX.url, candidatura({ nome: 'Antes da Pausa' }));
  const c = ultimaCand(SX.db);
  assert.equal((await SX.sup.req('PATCH', '/api/admin/migracao/config', { ativa: false })).status, 200);
  const pag = await (await fetch(`${SX.url}/migrar`)).text();
  assert.match(pag, /Trilha pausada/);
  assert.doesNotMatch(pag, /name="consentimento"/);
  assert.equal((await enviar(SX.url, candidatura())).status, 403);
  assert.equal((await SX.sup.req('POST', `/api/admin/migracao/${c.id}/aprovar`, { nome: 'Clube P', numero: '20009', codigoAgente: 'agp', email: 'p@teste.local', modelo: 'sx-rack-clube' })).status, 409);
  assert.equal((await SX.sup.req('GET', '/api/admin/migracao')).data.ativa, false);
  assert.equal((await SX.sup.req('PATCH', '/api/admin/migracao/config', { ativa: true })).status, 200);
  assert.equal((await enviar(SX.url, candidatura({ nome: 'Depois da Pausa' }))).status, 303);
  assert.ok(SX.db.prepare("SELECT 1 FROM audit WHERE action = 'migracao.config'").get());
});
