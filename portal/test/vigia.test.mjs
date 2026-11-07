// Vigia diário (PA-151): confere site no ar, posts do dia da pauta, calendário do dia, Telegram (grade nos grupos), Bluesky e pauta;
// grava o resultado com histórico; roda uma vez por dia sozinho e sob demanda; só verifica (não muda nada, só faz GET no site).
// Hora fixa (agora = 19:00 de um dia de teste no fuso da operação) para não depender do relógio. Fetch falso: nada sai para a internet.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPortal, client } from './helpers.mjs';
import { scoped } from '../lib/repo.mjs';
import { rodarVigia, vigiaDoDia } from '../lib/modules/vigia.mjs';
import { instanteLocal } from '../lib/modules/calendar.mjs';

const TZ = 'America/Sao_Paulo';
const DIA = '2026-11-05';
const em = (hhmm) => instanteLocal(TZ, DIA, hhmm).toISOString();
const AGORA = new Date(em('19:00'));
const A = 'clube-10111';
const B = 'clube-10112';

let P;
let sup;
let ed;
let mkt;
let tA;
let tB;
let rA;
let rB;
let pedidos = [];
let fora = new Set();

async function fetchFalso(url, init = {}) {
  pedidos.push({ url, metodo: init.method || 'GET' });
  if ([...fora].some((s) => url.includes(s))) return { ok: false, status: 503, body: null };
  return { ok: true, status: 200, body: null };
}

const item = (exec, id) => exec.itens.find((i) => i.id === id);

before(async () => {
  P = await startPortal({ fetchImpl: fetchFalso });
  P.app.gradeDoDia = async () => ({ eventos: [{ inicio: em('22:00'), nome: 'Main', garantido: 1000, buyin: 10 }] });
  sup = client(P.url);
  await sup.login('super@teste.local', 'senha-forte-123');
  for (const num of ['10111', '10112']) {
    const r = await sup.req('POST', '/api/tenants', { name: `Clube ${num}`, number: num, niche: 'poker', template: 'clube-poker-premium', settings: { whatsapp: '5511955554444' } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
  }
  tA = P.db.prepare('SELECT * FROM tenants WHERE slug = ?').get(A);
  tB = P.db.prepare('SELECT * FROM tenants WHERE slug = ?').get(B);
  rA = scoped(P.db, tA.id);
  rB = scoped(P.db, tB.id);
  await sup.req('POST', `/api/t/${A}/users`, { email: 'ed@vigia.test', name: 'Ed', role: 'editor', password: 'editor-senha-1234' });
  await sup.req('POST', `/api/t/${A}/users`, { email: 'mkt@vigia.test', name: 'Mkt', role: 'marketing', password: 'marketing-senha-123' });
  ed = client(P.url); await ed.login('ed@vigia.test', 'editor-senha-1234');
  mkt = client(P.url); await mkt.login('mkt@vigia.test', 'marketing-senha-123');

  // operação A: pauta ligada 12h/15h/18h; 12h publicado, 15h pulado de propósito, 18h sem post; 2 temas na fila (mínimo 10)
  const pauta = await sup.req('PUT', `/api/t/${A}/pauta/config`, { ativo: true, horarios: '12:00,15:00,18:00' });
  assert.equal(pauta.status, 200, JSON.stringify(pauta.data));
  // ligada às 08:00 do dia de teste (o PUT grava a hora real em que ligou)
  P.db.prepare("UPDATE automacao_config SET config = json_set(config, '$.ligadaEm', ?) WHERE chave = 'pauta' AND tenant_id = ?").run(em('08:00'), tA.id);
  const site = rA.all('sites')[0];
  const post = rA.insert('posts', { site_id: site.id, title: 'Post das 12h', slug: 'post-das-12h', content: 'texto', author: 'Equipe', status: 'publicado',
    published_at: em('12:00'), published_slug: 'post-das-12h', published_data: JSON.stringify({ title: 'Post das 12h' }) });
  rA.insert('pauta_temas', { tema: 'Tema 12h', posicao: 1, status: 'entregue', horario_alvo: em('12:00'), post_id: post.id, entregue_em: em('11:50') });
  rA.insert('pauta_temas', { tema: 'Tema 15h', posicao: 2, status: 'pulado', horario_alvo: em('15:00'), motivo: 'repetia outro post', entregue_em: em('14:50') });
  rA.insert('pauta_temas', { tema: 'Fila 1', posicao: 3, status: 'fila' });
  rA.insert('pauta_temas', { tema: 'Fila 2', posicao: 4, status: 'fila' });
  // calendário do dia: 14h saiu, 16h deu erro, 21h ainda vai sair (não conta)
  rA.insert('calendar', { channel: 'telegram', scheduled_at: em('14:00'), caption: 'ok', status: 'publicado', idem_key: 'v|1' });
  rA.insert('calendar', { channel: 'instagram', scheduled_at: em('16:00'), caption: 'x', status: 'erro', last_error: 'conta desconectada', idem_key: 'v|2' });
  rA.insert('calendar', { channel: 'telegram', scheduled_at: em('21:00'), caption: 'depois', status: 'agendado', idem_key: 'v|3' });
  // Telegram conectado: grade das 9h faltando num grupo; Bluesky conectado desde as 8h com o post das 12h fora do perfil
  const tg = rA.get('integrations', { kind: 'telegram' });
  rA.update('integrations', tg.id, { status: 'ativo', secret: P.app.vault.seal('123:abc'), public_config: JSON.stringify({ canal: '@canal', botUsuario: '@bot' }) });
  rA.insert('telegram_grupos', { chat_id: '-1', titulo: 'Recebeu', situacao: 'ativo', ultima_grade: DIA });
  rA.insert('telegram_grupos', { chat_id: '-2', titulo: 'Não recebeu', situacao: 'ativo', ultima_grade: '2026-11-04' });
  rA.insert('telegram_grupos', { chat_id: '-3', titulo: 'Pausado', situacao: 'pausado' });
  const bs = rA.get('integrations', { kind: 'bluesky' }) || rA.insert('integrations', { kind: 'bluesky', status: 'pendente', public_config: '{}' });
  rA.update('integrations', bs.id, { status: 'ativo', secret: P.app.vault.seal('abcd-efgh-ijkl-mnop'), public_config: JSON.stringify({ handle: 'a.bsky.social', ativadoEm: em('08:00'), postarGrade: false }) });
});
after(() => P.close());

test('operação com falhas: aponta posts, calendário, Telegram, Bluesky e pauta, com o detalhe de cada um', async () => {
  const antes = { posts: rA.count('posts'), cal: P.db.prepare('SELECT status FROM calendar ORDER BY idem_key').all(), temas: P.db.prepare('SELECT status FROM pauta_temas ORDER BY posicao').all() };
  pedidos = [];
  const x = await rodarVigia(P.app, tA, { agora: AGORA, origem: 'manual' });
  assert.equal(item(x, 'site').estado, 'ok');
  const posts = item(x, 'posts');
  assert.equal(posts.estado, 'pendente');
  assert.match(posts.detalhe, /2 de 3 horário/);
  assert.ok(posts.extras.some((e) => /12:00: publicado "Post das 12h"/.test(e)));
  assert.ok(posts.extras.some((e) => /15:00: pulado de propósito \(repetia outro post\)/.test(e)));
  assert.ok(posts.extras.some((e) => /18:00: nenhum post entregue/.test(e)));
  const cal = item(x, 'calendario');
  assert.equal(cal.estado, 'pendente');
  assert.match(cal.detalhe, /1 de 2/);
  assert.ok(cal.extras.some((e) => /conta desconectada/.test(e)));
  const tg = item(x, 'telegram');
  assert.equal(tg.estado, 'pendente');
  assert.ok(tg.extras.some((e) => /faltando em 1 de 2 grupo\(s\): Não recebeu/.test(e)));
  assert.ok(tg.extras.some((e) => /rotinas automáticas desligadas/.test(e)), 'nos testes a leitura do bot está desligada: diz isso, sem inventar');
  const bs = item(x, 'bluesky');
  assert.equal(bs.estado, 'pendente');
  assert.ok(bs.extras.some((e) => /Post das 12h.*não entrou na fila/.test(e)));
  assert.equal(item(x, 'pauta').estado, 'pendente');
  assert.match(item(x, 'pauta').detalhe, /2 tema\(s\) na fila \(mínimo 10\)/);
  assert.equal(x.pendencias, 5);
  assert.equal(x.ok, 1);

  // só verificou: nada mudou e só houve GET no site
  assert.equal(rA.count('posts'), antes.posts);
  assert.deepEqual(P.db.prepare('SELECT status FROM calendar ORDER BY idem_key').all(), antes.cal);
  assert.deepEqual(P.db.prepare('SELECT status FROM pauta_temas ORDER BY posicao').all(), antes.temas);
  assert.ok(pedidos.length >= 1 && pedidos.every((p) => p.metodo === 'GET' && p.url.startsWith(P.url)), JSON.stringify(pedidos));
});

test('operação sem automações e com o site fora do ar: o resto é "não se aplica" e o site é pendência', async () => {
  const site = rB.all('sites')[0];
  fora = new Set([`/s/${site.slug}/`]);
  const x = await rodarVigia(P.app, tB, { agora: AGORA });
  fora = new Set();
  assert.equal(item(x, 'site').estado, 'pendente');
  assert.match(item(x, 'site').extras[0], /HTTP 503/);
  for (const id of ['posts', 'calendario', 'telegram', 'bluesky', 'pauta']) assert.equal(item(x, id).estado, 'na', id);
  assert.equal(x.pendencias, 1);
});

test('agenda: uma conferência automática por dia, só depois do horário; reexecutar não duplica', async () => {
  assert.equal(await vigiaDoDia(P.app, { agora: new Date(em('20:00')) }), 0, 'antes das 21:00 não roda');
  assert.equal(await vigiaDoDia(P.app, { agora: new Date(em('21:05')) }), 2, 'uma para cada operação');
  assert.equal(await vigiaDoDia(P.app, { agora: new Date(em('22:00')) }), 0, 'já rodou hoje');
  assert.equal(rA.count('vigia_execucoes', { origem: 'agenda' }), 1);
  await sup.req('PUT', `/api/t/${B}/vigia/config`, { ativo: false });
  assert.equal(await vigiaDoDia(P.app, { agora: new Date(instanteLocal(TZ, '2026-11-06', '21:30')) }), 1, 'B desligou a automática');
});

test('painel: histórico e resultado; conferir agora; permissões e isolamento', async () => {
  const g = await mkt.req('GET', `/api/t/${A}/vigia`);
  assert.equal(g.status, 200);
  assert.equal(g.data.config.hora, '21:00');
  assert.ok(g.data.historico.length >= 3);
  assert.ok(g.data.ultima.itens.length === 6);
  const r = await mkt.req('POST', `/api/t/${A}/vigia/rodar`, {});
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.execucao.origem, 'manual');
  const um = await mkt.req('GET', `/api/t/${A}/vigia/${r.data.execucao.id}`);
  assert.equal(um.data.execucao.id, r.data.execucao.id);
  assert.equal((await sup.req('GET', `/api/t/${B}/vigia/${r.data.execucao.id}`)).status, 404, 'outra operação não vê');
  assert.equal((await ed.req('GET', `/api/t/${A}/vigia`)).status, 403, 'editor não tem reports.read');
  assert.equal((await mkt.req('PUT', `/api/t/${A}/vigia/config`, { hora: '22:00' })).status, 403, 'marketing não muda a configuração');
  assert.equal((await sup.req('PUT', `/api/t/${A}/vigia/config`, { hora: '25:00' })).status, 400);
  assert.equal((await sup.req('PUT', `/api/t/${A}/vigia/config`, { hora: '22:30' })).data.config.hora, '22:30');
});

test('horários de antes de ligar a pauta não viram pendência', async () => {
  const sql = "UPDATE automacao_config SET config = json_set(config, '$.ligadaEm', ?) WHERE chave = 'pauta' AND tenant_id = ?";
  P.db.prepare(sql).run(em('16:00'), tA.id);
  const x = await rodarVigia(P.app, tA, { agora: AGORA });
  assert.match(item(x, 'posts').detalhe, /0 de 1 horário/, 'só o das 18:00 conta');
  P.db.prepare(sql).run(em('08:00'), tA.id);
});
