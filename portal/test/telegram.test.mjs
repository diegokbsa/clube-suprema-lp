// Telegram: integração com o token no cofre (nunca volta para a tela), teste getMe + getChat + administrador do canal,
// publicação dos espaços vencidos do calendário (texto e imagem, HTML escapado), erro claro sem texto,
// respostas do bot no privado com offset guardado, e o token fora de respostas de API, histórico e auditoria.
// Tudo com fetch falso: nenhuma chamada sai para a internet.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPortal, client } from './helpers.mjs';
import { scoped } from '../lib/repo.mjs';
import { publicarVencidos, responderMensagens, respostaDoBot } from '../lib/modules/telegram.mjs';

const TOKEN = '123456789:AAH-teste-token-do-bot-1234567890abcdef';
const SLUG = 'clube-10071';

let P;
let sup;
let mkt;
let tenant;
let repo;
let chamadas = [];
let membro = { status: 'member' };
let updates = [];
let falharEnvio = false;
const respostas = [];
const guardar = (r) => { respostas.push(JSON.stringify(r.data)); return r; };

async function fetchFalso(url, init) {
  const m = /^https:\/\/api\.telegram\.org\/bot([^/]+)\/(\w+)$/.exec(url);
  assert.ok(m, `URL inesperada: ${url}`);
  const corpo = JSON.parse(init.body || '{}');
  chamadas.push({ metodo: m[2], corpo, tokenOk: m[1] === TOKEN });
  const ok = (result) => ({ status: 200, json: async () => ({ ok: true, result }) });
  if (m[1] !== TOKEN) return { status: 401, json: async () => ({ ok: false, error_code: 401, description: 'Unauthorized' }) };
  switch (m[2]) {
    case 'getMe': return ok({ id: 4242, is_bot: true, username: 'clubehot_bot' });
    case 'getChat': return ok({ id: -1001234567890, type: 'channel', title: 'Canal Hot' });
    case 'getChatMember': return ok(membro);
    case 'getUpdates': { const u = updates; updates = []; return ok(u); }
    case 'sendMessage':
    case 'sendPhoto':
      if (falharEnvio) throw new Error(`conexão recusada em ${url}`);           // erro que traz a URL (com o token) de propósito
      return ok({ message_id: chamadas.length });
    default: return { status: 404, json: async () => ({ ok: false, error_code: 404, description: 'Not Found' }) };
  }
}

const espaco = (dados) => repo.insert('calendar', { channel: 'telegram', status: 'agendado', caption: '', idem_key: `teste|${Math.random()}`,
  scheduled_at: new Date(Date.now() - 60_000).toISOString(), ...dados });

before(async () => {
  P = await startPortal({ fetchImpl: fetchFalso });
  sup = client(P.url);
  await sup.login('super@teste.local', 'senha-forte-123');
  const r = await sup.req('POST', '/api/tenants', { name: 'Clube Hot', number: '10071', niche: 'poker', template: 'clube-poker-premium',
    settings: { app: 'Suprema Poker', agentId: '777123', whatsapp: '5511999990000', chipsUrl: 'https://fichas.exemplo.com/entrar' } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  tenant = P.db.prepare('SELECT * FROM tenants WHERE slug = ?').get(SLUG);
  repo = scoped(P.db, tenant.id);
  await sup.req('POST', `/api/t/${SLUG}/users`, { email: 'mkt@tg.test', name: 'Marketing', role: 'marketing', password: 'marketing-senha-123' });
  mkt = client(P.url);
  await mkt.login('mkt@tg.test', 'marketing-senha-123');
});
after(() => P.close());

test('salvar: token só no cofre e nunca na resposta; formato validado; marketing lê mas não grava', async () => {
  let r = guardar(await sup.req('PUT', `/api/t/${SLUG}/telegram`, { canal: 'canal sem arroba', token: TOKEN }));
  assert.equal(r.status, 400);
  r = guardar(await sup.req('PUT', `/api/t/${SLUG}/telegram`, { canal: '@canalhot', token: 'token-errado' }));
  assert.equal(r.status, 400);
  r = guardar(await sup.req('PUT', `/api/t/${SLUG}/telegram`, { canal: '@canalhot', botUsuario: 'clubehot_bot', token: TOKEN }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.tokenGravado, 'sim');
  assert.equal(r.data.estado, 'pendente', 'salvar não conecta; só o teste');
  assert.equal(r.data.config.botUsuario, '@clubehot_bot');
  const row = repo.get('integrations', { kind: 'telegram' });
  assert.ok(row.secret && !row.secret.includes(TOKEN));
  assert.equal(P.app.vault.open(row.secret), TOKEN);
  assert.equal(chamadas.length, 0, 'salvar não chama o Telegram');

  assert.equal(guardar(await mkt.req('GET', `/api/t/${SLUG}/telegram`)).data.tokenGravado, 'sim');
  assert.equal(guardar(await mkt.req('PUT', `/api/t/${SLUG}/telegram`, { canal: '@outro' })).status, 403);
  assert.equal(guardar(await mkt.req('POST', `/api/t/${SLUG}/telegram/teste`, {})).status, 403);
});

test('teste: bot fora da administração do canal marca erro; administrador marca conectado (ativo para o calendário)', async () => {
  let r = guardar(await sup.req('POST', `/api/t/${SLUG}/telegram/teste`, {}));
  assert.equal(r.data.ok, false);
  assert.equal(r.data.estado, 'erro');
  assert.match(r.data.detalhe, /não é administrador/);
  assert.equal(repo.get('integrations', { kind: 'telegram' }).status, 'erro');

  // com a integração em erro, um espaço vencido não sai e fica com motivo claro
  const parado = espaco({ caption: 'Mesa nova hoje' });
  await publicarVencidos(P.app);
  assert.equal(repo.get('calendar', parado.id).status, 'erro');
  assert.match(repo.get('calendar', parado.id).last_error, /não está ativa/);

  membro = { status: 'administrator', can_post_messages: true };
  chamadas = [];
  r = guardar(await sup.req('POST', `/api/t/${SLUG}/telegram/teste`, {}));
  assert.equal(r.data.ok, true, JSON.stringify(r.data));
  assert.equal(r.data.estado, 'conectado');
  assert.deepEqual(chamadas.map((c) => c.metodo), ['getMe', 'getChat', 'getChatMember']);
  assert.equal(chamadas[1].corpo.chat_id, '@canalhot');
  assert.equal(chamadas[2].corpo.user_id, 4242);
  const row = repo.get('integrations', { kind: 'telegram' });
  assert.equal(row.status, 'ativo', 'o calendário entende "ativo" como conta conectada');
  assert.equal(JSON.parse(row.public_config).canalTitulo, 'Canal Hot');
  const g = guardar(await sup.req('GET', `/api/t/${SLUG}/telegram`));
  assert.equal(g.data.conectado, true);
});

test('publicação: espaço vencido sai no canal com HTML escapado e é marcado publicado; futuro fica', async () => {
  // pelo calendário de verdade: o canal telegram conta como conectado e o espaço pode ser agendado
  await sup.req('PUT', `/api/t/${SLUG}/calendar/config`, { channels: ['telegram'], postsPerDay: 1, postTimes: '12:00' });
  const gerado = guardar(await sup.req('POST', `/api/t/${SLUG}/calendar/gerar`, { dias: 2 }));
  assert.ok(gerado.data.criados >= 1);
  const item = repo.all('calendar', { channel: 'telegram', status: 'rascunho' }, { order: 'scheduled_at ASC' })[0];
  assert.ok(item, 'espaço do telegram criado como rascunho (conta conectada)');
  await sup.req('PATCH', `/api/t/${SLUG}/calendar/${item.id}`, { legenda: 'Torneio às 20h <b>&</b> mesa 5/10' });
  const ag = await sup.req('POST', `/api/t/${SLUG}/calendar/${item.id}/situacao`, { situacao: 'agendado' });
  assert.equal(ag.status, 200, JSON.stringify(ag.data));
  const futuro = espaco({ caption: 'Ainda não', scheduled_at: new Date(Date.now() + 3600_000).toISOString() });
  P.db.prepare('UPDATE calendar SET scheduled_at = ? WHERE id = ?').run(new Date(Date.now() - 5_000).toISOString(), item.id);

  chamadas = [];
  const r = await publicarVencidos(P.app);
  assert.equal(r.publicados, 1);
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].metodo, 'sendMessage');
  assert.equal(chamadas[0].corpo.chat_id, '@canalhot');
  assert.equal(chamadas[0].corpo.parse_mode, 'HTML');
  assert.equal(chamadas[0].corpo.text, 'Torneio às 20h &lt;b&gt;&amp;&lt;/b&gt; mesa 5/10');
  assert.equal(repo.get('calendar', item.id).status, 'publicado');
  assert.equal(repo.get('calendar', futuro.id).status, 'agendado', 'hora ainda não chegou');

  chamadas = [];
  await publicarVencidos(P.app);
  assert.equal(chamadas.length, 0, 'publicado não sai de novo');
});

test('publicação com imagem: https direto ou /assets/ resolvido pela origem do site', async () => {
  const comUrl = espaco({ caption: 'Com foto', creative_id: 'https://cdn.exemplo.com/mesa.jpg' });
  const comAsset = espaco({ caption: 'Com asset', creative_id: '/assets/img/mesa.png' });
  chamadas = [];
  await publicarVencidos(P.app);
  const fotos = chamadas.filter((c) => c.metodo === 'sendPhoto');
  assert.equal(fotos.length, 2);
  assert.deepEqual(fotos.map((f) => f.corpo.photo).sort(), [`${P.origin}/assets/img/mesa.png`, 'https://cdn.exemplo.com/mesa.jpg'].sort());
  assert.ok(fotos.every((f) => f.corpo.parse_mode === 'HTML' && f.corpo.caption));
  assert.equal(repo.get('calendar', comUrl.id).status, 'publicado');
  assert.equal(repo.get('calendar', comAsset.id).status, 'publicado');
});

test('espaço sem texto não é publicado e fica com erro de motivo claro', async () => {
  const vazio = espaco({ caption: '   ' });
  chamadas = [];
  const r = await publicarVencidos(P.app);
  assert.equal(chamadas.length, 0, 'nada saiu para o Telegram');
  assert.equal(r.erros, 1);
  const it = repo.get('calendar', vazio.id);
  assert.equal(it.status, 'erro');
  assert.match(it.last_error, /sem texto/);
});

test('falha no envio vira erro do espaço, sem o token na mensagem', async () => {
  const item = espaco({ caption: 'Vai falhar' });
  falharEnvio = true;
  await publicarVencidos(P.app);
  falharEnvio = false;
  const it = repo.get('calendar', item.id);
  assert.equal(it.status, 'erro');
  assert.match(it.last_error, /Não publicou no Telegram/);
  assert.ok(!it.last_error.includes(TOKEN), 'token escondido');
  assert.match(it.last_error, /bot\*\*\*\//);
});

test('bot no privado: responde /start com as configurações, ignora grupo e canal, guarda o offset', async () => {
  updates = [
    { update_id: 500, message: { message_id: 1, chat: { id: 9001, type: 'private' }, from: { id: 9001, is_bot: false }, text: '/start' } },
    { update_id: 501, channel_post: { chat: { id: -1001234567890, type: 'channel' }, text: 'post do canal' } },
    { update_id: 502, message: { message_id: 2, chat: { id: -500, type: 'group' }, from: { id: 1, is_bot: false }, text: '/start' } },
  ];
  chamadas = [];
  const r = await responderMensagens(P.app);
  assert.equal(r.respondidas, 1);
  assert.equal(chamadas[0].metodo, 'getUpdates');
  assert.equal(chamadas[0].corpo.offset, undefined, 'primeira leitura sem offset');
  const env = chamadas.filter((c) => c.metodo === 'sendMessage');
  assert.equal(env.length, 1);
  assert.equal(env[0].corpo.chat_id, 9001);
  assert.equal(env[0].corpo.parse_mode, 'HTML');
  const txt = env[0].corpo.text;
  assert.match(txt, /Clube Hot/);
  assert.match(txt, /10071/);
  assert.match(txt, /777123/);
  assert.match(txt, /Suprema Poker/);
  assert.match(txt, /Peça o link de convite no suporte/);
  assert.match(txt, /https:\/\/wa\.me\/5511999990000\?text=Oi!%20Venho%20do%20clube%2010071%2C%20agente%20777123/);
  assert.match(txt, /maiores de 18 anos/);
  assert.equal(JSON.parse(repo.get('integrations', { kind: 'telegram' }).public_config).updateOffset, 503);

  chamadas = [];
  await responderMensagens(P.app);
  assert.equal(chamadas[0].corpo.offset, 503, 'a próxima leitura continua do offset guardado');
  assert.equal(chamadas.filter((c) => c.metodo === 'sendMessage').length, 0, 'não responde de novo');
});

test('mensagens prontas: /clube, /fichas, /suporte e texto qualquer', () => {
  const d = { clube: 'Clube <Hot>', idClube: '10071', poker: true, agente: '777', appNome: 'Suprema Poker', convite: 'https://convite.exemplo.com/c?a=1&b=2',
    fichas: 'https://fichas.exemplo.com', whatsapp: 'https://wa.me/55119?text=Oi', siteUrl: 'https://site.exemplo.com', aviso: 'Somente maiores de 18 anos. Jogue com responsabilidade.' };
  assert.match(respostaDoBot(d, '/clube'), /<a href="https:\/\/convite\.exemplo\.com\/c\?a=1&amp;b=2">/);
  assert.match(respostaDoBot(d, '/clube'), /Clube &lt;Hot&gt;/, 'nome escapado');
  assert.match(respostaDoBot(d, '/fichas@clubehot_bot'), /canal oficial do clube: <a href="https:\/\/fichas\.exemplo\.com">/);
  assert.match(respostaDoBot(d, '/suporte'), /chamar o suporte/);
  assert.match(respostaDoBot(d, '/suporte'), /site\.exemplo\.com/);
  const qualquer = respostaDoBot(d, 'oi, quero jogar');
  assert.match(qualquer, /\/clube/);
  assert.match(qualquer, /maiores de 18/);
  for (const c of ['/start', '/clube', '/fichas', '/suporte', 'oi']) assert.doesNotMatch(respostaDoBot(d, c), /b[ôo]nus|gr[áa]tis|ganh[eo]/i);
});

test('o token nunca aparece em resposta de API, histórico de lead, auditoria nem config pública', async () => {
  respostas.push(JSON.stringify((await sup.req('GET', `/api/t/${SLUG}/integrations`)).data));
  respostas.push(JSON.stringify((await sup.req('GET', `/api/t/${SLUG}/calendar`)).data));
  const tudo = [
    ...respostas,
    JSON.stringify(P.db.prepare('SELECT * FROM lead_events').all()),
    JSON.stringify(P.db.prepare('SELECT * FROM audit').all()),
    JSON.stringify(P.db.prepare('SELECT public_config, last_error FROM integrations').all()),
    JSON.stringify(P.db.prepare('SELECT last_error FROM calendar').all()),
  ].join('\n');
  assert.ok(!tudo.includes(TOKEN), 'token vazou');
  assert.ok(!tudo.includes(TOKEN.split(':')[1]), 'parte secreta do token vazou');
});
