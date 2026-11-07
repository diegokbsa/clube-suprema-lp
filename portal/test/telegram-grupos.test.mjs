// Robô do Telegram nos grupos (PA-151): entrar no grupo (boas-vindas + grade do dia), comandos de grupo (/torneios, /clube,
// /ajuda, /pausar e /ativar só para admin), comando para outro bot ignorado, espera entre respostas, grade do dia uma vez por
// grupo, grupo pausado ou que tirou o bot fica de fora, funciona sem o módulo de torneios, isolamento e permissões.
// Tudo com fetch falso: nenhuma chamada sai para a internet.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPortal, client } from './helpers.mjs';
import { scoped } from '../lib/repo.mjs';
import { responderMensagens, gradeNosGrupos, ultimaLeitura } from '../lib/modules/telegram.mjs';
import { diaLocal } from '../lib/modules/calendar.mjs';

const TOKEN = '123456789:AAH-teste-token-grupos-1234567890abcd';
const SLUG = 'clube-10091';
const OUTRA = 'clube-10092';
const ADMIN = 71;
const COMUM = 72;

let P;
let sup;
let mkt;
let tenant;
let repo;
let chamadas = [];
let updates = [];
let expulso = new Set();
let grade = null;

async function fetchFalso(url, init) {
  const m = /^https:\/\/api\.telegram\.org\/bot([^/]+)\/(\w+)$/.exec(url);
  assert.ok(m, `URL inesperada: ${url}`);
  const corpo = JSON.parse(init.body || '{}');
  chamadas.push({ metodo: m[2], corpo });
  const ok = (result) => ({ status: 200, json: async () => ({ ok: true, result }) });
  if (m[1] !== TOKEN) return { status: 401, json: async () => ({ ok: false, error_code: 401, description: 'Unauthorized' }) };
  switch (m[2]) {
    case 'getMe': return ok({ id: 4242, is_bot: true, username: 'clubegrupo_bot' });
    case 'getChat': return ok({ id: -1009, type: 'channel', title: 'Canal' });
    case 'getChatMember': return ok({ status: corpo.user_id === ADMIN || corpo.user_id === 4242 ? 'administrator' : 'member', can_post_messages: true });
    case 'getUpdates': { const u = updates; updates = []; return ok(u); }
    case 'sendMessage':
      if (expulso.has(String(corpo.chat_id))) return { status: 403, json: async () => ({ ok: false, error_code: 403, description: 'Forbidden: bot was kicked from the group chat' }) };
      return ok({ message_id: chamadas.length });
    default: return { status: 404, json: async () => ({ ok: false, error_code: 404, description: 'Not Found' }) };
  }
}

const enviados = (chat) => chamadas.filter((c) => c.metodo === 'sendMessage' && (chat === undefined || String(c.corpo.chat_id) === String(chat)));
const entrou = (id, titulo, uid) => ({ update_id: uid, my_chat_member: { chat: { id, type: 'supergroup', title: titulo }, from: { id: ADMIN }, old_chat_member: { status: 'left' }, new_chat_member: { status: 'member' } } });
const msg = (id, texto, uid, from = COMUM) => ({ update_id: uid, message: { message_id: uid, chat: { id, type: 'supergroup', title: 'Grupo' }, from: { id: from, is_bot: false }, text: texto } });

before(async () => {
  P = await startPortal({ fetchImpl: fetchFalso });
  P.app.pausaTelegramMs = 0;
  P.app.gradeDoDia = async () => grade;
  sup = client(P.url);
  await sup.login('super@teste.local', 'senha-forte-123');
  for (const [num] of [['10091'], ['10092']]) {
    const r = await sup.req('POST', '/api/tenants', { name: `Clube ${num}`, number: num, niche: 'poker', template: 'clube-poker-premium',
      settings: { app: 'Suprema Poker', agentId: '888', whatsapp: '5511977776666', inviteLink: 'https://convite.exemplo.com/c/10091' } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
  }
  tenant = P.db.prepare('SELECT * FROM tenants WHERE slug = ?').get(SLUG);
  repo = scoped(P.db, tenant.id);
  await sup.req('PUT', `/api/t/${SLUG}/telegram`, { canal: '@canalgrupo', botUsuario: 'clubegrupo_bot', token: TOKEN });
  const t = await sup.req('POST', `/api/t/${SLUG}/telegram/teste`, {});
  assert.equal(t.data.ok, true, JSON.stringify(t.data));
  await sup.req('POST', `/api/t/${SLUG}/users`, { email: 'mkt@tgg.test', name: 'Mkt', role: 'marketing', password: 'marketing-senha-123' });
  mkt = client(P.url); await mkt.login('mkt@tgg.test', 'marketing-senha-123');
});
after(() => P.close());

test('sem módulo de torneios: /torneios avisa, /clube responde com convite e a grade do dia não sai', async () => {
  updates = [msg(-501, '/torneios', 10), msg(-501, '/clube@clubegrupo_bot', 11), msg(-501, '/start', 12), msg(-501, '/torneios@outro_bot', 13)];
  chamadas = [];
  P.app.gradeDoDia = null; // sem gancho e sem lib/modules/torneios.mjs
  const r = await responderMensagens(P.app);
  P.app.gradeDoDia = async () => grade;
  assert.equal(r.noGrupo, 2, '/start e comando de outro bot ficam sem resposta');
  const env = enviados(-501);
  assert.equal(env.length, 2);
  assert.match(env[0].corpo.text, /ainda não está disponível/);
  assert.equal(env[0].corpo.reply_parameters.message_id, 10, 'responde citando a mensagem');
  assert.match(env[1].corpo.text, /ID do agente: <b>888<\/b>/);
  assert.match(env[1].corpo.text, /convite\.exemplo\.com/);
  assert.equal(env[1].corpo.reply_markup.inline_keyboard[0][0].url, 'https://convite.exemplo.com/c/10091');
  assert.ok(ultimaLeitura(P.app, tenant.id), 'leitura registrada para o vigia');
  assert.equal(repo.get('telegram_grupos', { chat_id: '-501' }).situacao, 'ativo', 'grupo que usou comando entra na lista');
});

test('entrar no grupo: boas-vindas e, depois do horário, a grade do dia com os torneios que ainda vão começar', async () => {
  await sup.req('PUT', `/api/t/${SLUG}/telegram/grupos/config`, { gradeHora: '00:00', destaques: 3 });
  const agora = Date.now();
  grade = { dia: 'qualquer', url: 'https://grade.exemplo.com/hoje', eventos: [
    { inicio: new Date(agora + 3600_000).toISOString(), nome: 'Main Event <500K>', garantido: 500000, buyin: 200 },
    { inicio: new Date(agora + 7200_000).toISOString(), nome: 'Turbo 50K', garantido: 50000, buyin: 50 },
    { inicio: new Date(agora - 3600_000).toISOString(), nome: 'Já começou', garantido: 900000, buyin: 500 },
    { inicio: new Date(agora + 5400_000).toISOString(), nome: 'Freeroll', garantido: 1000, buyin: 0 },
    { inicio: new Date(agora + 9000_000).toISOString(), nome: 'Pequeno', garantido: 10, buyin: 5 },
  ] };
  updates = [entrou(-700, 'Grupo dos Amigos', 20)];
  chamadas = [];
  const r = await responderMensagens(P.app);
  assert.equal(r.grupos, 1);
  const env = enviados(-700);
  assert.equal(env.length, 2, 'boas-vindas + grade');
  assert.match(env[0].corpo.text, /Sou o bot do <b>Clube 10091<\/b>/);
  assert.match(env[0].corpo.text, /\/pausar/);
  const txt = env[1].corpo.text;
  assert.match(txt, /Torneios de hoje/);
  assert.match(txt, /Main Event &lt;500K&gt;/, 'nome escapado');
  assert.match(txt, /R\$\s?500\.000 GTD/);
  assert.doesNotMatch(txt, /Já começou/);
  assert.doesNotMatch(txt, /Pequeno/, 'só os 3 maiores garantidos');
  assert.ok(txt.indexOf('Main Event') < txt.indexOf('Freeroll') && txt.indexOf('Freeroll') < txt.indexOf('Turbo'), 'em ordem de horário');
  assert.match(txt, /maiores de 18/);
  assert.ok(env[1].corpo.reply_markup.inline_keyboard.some((l) => l[0].url === 'https://t.me/clubegrupo_bot?startgroup=grade'));
  const g = repo.get('telegram_grupos', { chat_id: '-700' });
  assert.equal(g.titulo, 'Grupo dos Amigos');
  assert.equal(g.ultima_grade, diaLocal('America/Sao_Paulo', new Date()));
});

test('grade do dia: sai uma vez por grupo ativo; pausado fica de fora; grupo que tirou o bot vira "saiu"', async () => {
  repo.insert('telegram_grupos', { chat_id: '-801', titulo: 'Ativo', tipo: 'group', situacao: 'ativo' });
  repo.insert('telegram_grupos', { chat_id: '-802', titulo: 'Pausado', tipo: 'group', situacao: 'pausado' });
  repo.insert('telegram_grupos', { chat_id: '-803', titulo: 'Expulsou', tipo: 'group', situacao: 'ativo' });
  expulso = new Set(['-803']);
  chamadas = [];
  const r = await gradeNosGrupos(P.app);
  assert.equal(r.enviados, 2, '-501 (do comando) e -801; -700 já recebeu ao entrar');
  assert.equal(r.saiu, 1);
  assert.deepEqual(enviados().map((c) => String(c.corpo.chat_id)).sort(), ['-501', '-801', '-803']);
  assert.equal(repo.get('telegram_grupos', { chat_id: '-803' }).situacao, 'saiu');
  assert.equal(repo.get('telegram_grupos', { chat_id: '-802' }).ultima_grade, null);
  chamadas = [];
  const de_novo = await gradeNosGrupos(P.app);
  assert.equal(de_novo.enviados, 0);
  assert.equal(enviados().length, 0, 'reexecutar não repete');
});

test('/pausar e /ativar só para admin; espera entre respostas do mesmo comando; bot saindo do grupo', async () => {
  updates = [msg(-801, '/pausar', 30, COMUM), msg(-801, '/ativar', 31, ADMIN), msg(-801, '/pausar', 32, ADMIN)];
  chamadas = [];
  await responderMensagens(P.app);
  const env = enviados(-801);
  assert.match(env[0].corpo.text, /Só um admin/);
  assert.match(env[1].corpo.text, /volta a chegar aqui todo dia às 00:00/);
  assert.equal(env.length, 2, 'o segundo /pausar dentro de 20 s fica sem resposta');
  assert.equal(repo.get('telegram_grupos', { chat_id: '-801' }).situacao, 'ativo');
  P.db.prepare("UPDATE telegram_grupos SET situacao = 'pausado' WHERE chat_id = '-801'").run();

  updates = [{ update_id: 40, my_chat_member: { chat: { id: -700, type: 'supergroup', title: 'Grupo dos Amigos' }, old_chat_member: { status: 'member' }, new_chat_member: { status: 'kicked' } } }];
  await responderMensagens(P.app);
  assert.equal(repo.get('telegram_grupos', { chat_id: '-700' }).situacao, 'saiu');
  const auditoria = P.db.prepare("SELECT action FROM audit WHERE tenant_id = ? AND action LIKE 'telegram.grupo.%'").all(tenant.id).map((a) => a.action);
  assert.ok(auditoria.includes('telegram.grupo.entrar') && auditoria.includes('telegram.grupo.sair') && auditoria.includes('telegram.grupo.ativar'));
});

test('painel: lista os grupos, pausa e ativa; marketing lê mas não mexe; outra operação não vê', async () => {
  const g = await mkt.req('GET', `/api/t/${SLUG}/telegram/grupos`);
  assert.equal(g.status, 200);
  assert.equal(g.data.gradeDisponivel, true);
  assert.equal(g.data.linkAdicionar, 'https://t.me/clubegrupo_bot?startgroup=grade');
  assert.ok(g.data.grupos.length >= 5);
  assert.ok(!JSON.stringify(g.data).includes(TOKEN), 'token fora da resposta');
  const pausado = g.data.grupos.find((x) => x.chatId === '-801');
  assert.equal((await mkt.req('PATCH', `/api/t/${SLUG}/telegram/grupos/${pausado.id}`, { situacao: 'ativo' })).status, 403);
  assert.equal((await mkt.req('PUT', `/api/t/${SLUG}/telegram/grupos/config`, { gradeHora: '10:00' })).status, 403);
  const r = await sup.req('PATCH', `/api/t/${SLUG}/telegram/grupos/${pausado.id}`, { situacao: 'ativo' });
  assert.equal(r.data.grupo.situacao, 'ativo');
  const saiu = g.data.grupos.find((x) => x.chatId === '-803');
  assert.equal((await sup.req('PATCH', `/api/t/${SLUG}/telegram/grupos/${saiu.id}`, { situacao: 'ativo' })).status, 409);
  assert.equal((await sup.req('PUT', `/api/t/${SLUG}/telegram/grupos/config`, { gradeHora: '9h' })).status, 400);
  const outra = await sup.req('GET', `/api/t/${OUTRA}/telegram/grupos`);
  assert.equal(outra.data.grupos.length, 0);
  assert.equal((await sup.req('PATCH', `/api/t/${OUTRA}/telegram/grupos/${pausado.id}`, { situacao: 'pausado' })).status, 404);

  // mandar agora: grupo reativado recebe; quem já recebeu hoje não recebe de novo
  chamadas = [];
  const agora = await sup.req('POST', `/api/t/${SLUG}/telegram/grupos/grade`, {});
  assert.equal(agora.status, 200, JSON.stringify(agora.data));
  assert.equal(agora.data.enviados, 0, '-801 já tinha recebido hoje antes da pausa');
  assert.equal((await sup.req('POST', `/api/t/${OUTRA}/telegram/grupos/grade`, {})).status, 409, 'outra operação sem Telegram conectado');
});
