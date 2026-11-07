// Pauta automática (PA-151): fila de temas por operação, horários, reserva do próximo tema pelo redator com o token de serviço,
// entrega do post pronto (agendado no horário ou em revisão), idempotência, preflight, pular, isolamento e permissões.
// Nenhuma chamada de rede: o redator é simulado com o cliente HTTP do teste.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPortal, client } from './helpers.mjs';
import { scoped } from '../lib/repo.mjs';
import { publishDuePosts } from '../lib/modules/blog.mjs';
import { horaLocal } from '../lib/modules/calendar.mjs';

const TOKEN = 'pa_svc_teste_redator_123';
const A = 'clube-10081';
const B = 'clube-10082';
let P;
let sup;
let mkt;
let ed;
let repoA;
let horario;

const redator = async (method, path, body, token = TOKEN) => {
  const r = await fetch(P.url + path, { method, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
};

const artigo = (titulo, extra = {}) => ({ title: titulo, excerpt: 'Resumo direto do post para quem busca o tema no Google e quer a resposta curta.',
  content: `## O que é\n\n${'Texto explicativo e claro sobre o tema do post. '.repeat(30)}\n\n- ponto um\n- ponto dois\n\n+18 · Jogue com responsabilidade.`,
  seoDescription: 'Descrição do post com o tamanho certo para aparecer inteira na busca do Google e explicar o tema.', tags: ['regras', 'iniciantes'], ...extra });

before(async () => {
  P = await startPortal();
  P.app.serviceToken = TOKEN;
  sup = client(P.url);
  await sup.login('super@teste.local', 'senha-forte-123');
  for (const [num, slug] of [['10081', A], ['10082', B]]) {
    const r = await sup.req('POST', '/api/tenants', { name: `Clube ${num}`, number: num, niche: 'poker', template: 'clube-poker-premium',
      settings: { app: 'Suprema Poker', agentId: '555', whatsapp: '5511988887777' } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.ok(slug);
  }
  repoA = scoped(P.db, P.db.prepare('SELECT id FROM tenants WHERE slug = ?').get(A).id);
  await sup.req('POST', `/api/t/${A}/users`, { email: 'mkt@pauta.test', name: 'Mkt', role: 'marketing', password: 'marketing-senha-123' });
  await sup.req('POST', `/api/t/${A}/users`, { email: 'ed@pauta.test', name: 'Ed', role: 'editor', password: 'editor-senha-1234' });
  mkt = client(P.url); await mkt.login('mkt@pauta.test', 'marketing-senha-123');
  ed = client(P.url); await ed.login('ed@pauta.test', 'editor-senha-1234');
  // um horário só, duas horas à frente: o post entra agendado no futuro e nada sai sozinho durante o teste
  horario = horaLocal('America/Sao_Paulo', new Date(Date.now() + 2 * 3600_000)).replace(/:\d\d$/, ':00');
});
after(() => P.close());

test('redator sem token, com token errado ou com a pauta desligada não pega tema', async () => {
  assert.equal((await redator('GET', '/api/service/pauta', undefined, null)).status, 401);
  assert.equal((await redator('GET', '/api/service/pauta', undefined, 'pa_svc_errado')).status, 401);
  assert.equal((await redator('POST', `/api/service/pauta/${A}/proximo`, {}, 'pa_svc_errado')).status, 401);
  const r = await redator('POST', `/api/service/pauta/${A}/proximo`, {});
  assert.equal(r.status, 409);
  assert.match(r.data.error, /desligada/);
  assert.equal((await redator('POST', '/api/service/pauta/nao-existe/proximo', {})).status, 404);
});

test('painel: temas entram na fila (um por linha, sem marcadores, sem repetidos); editor não liga a automação', async () => {
  let r = await mkt.req('POST', `/api/t/${A}/pauta/temas`, { texto: '- [ ] O que é straddle no poker\n1. Como funciona o side pot\n\n* Showdown: quem mostra primeiro\nO que é straddle no poker' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.deepEqual(r.data, { criados: 3, repetidos: 1 });
  r = await ed.req('POST', `/api/t/${A}/pauta/temas`, { temas: ['Tabela de mãos do Texas Holdem'] });
  assert.equal(r.status, 201);
  assert.equal((await ed.req('PUT', `/api/t/${A}/pauta/config`, { ativo: true })).status, 403, 'editor não tem blog.publish');
  const g = await mkt.req('GET', `/api/t/${A}/pauta`);
  assert.deepEqual(g.data.temas.map((t) => t.tema), ['O que é straddle no poker', 'Como funciona o side pot', 'Showdown: quem mostra primeiro', 'Tabela de mãos do Texas Holdem']);
  assert.ok(g.data.avisos.some((a) => /desligada/.test(a)));
  assert.ok(g.data.redator.proximo.endsWith(`/api/service/pauta/${A}/proximo`));

  // mover: o último vai para o topo e o primeiro desce
  const ultimo = g.data.temas[3].id;
  await mkt.req('POST', `/api/t/${A}/pauta/temas/${ultimo}/mover`, { para: 'topo' });
  await mkt.req('POST', `/api/t/${A}/pauta/temas/${g.data.temas[0].id}/mover`, { para: 'baixo' });
  const g2 = await mkt.req('GET', `/api/t/${A}/pauta`);
  assert.deepEqual(g2.data.temas.map((t) => t.tema).slice(0, 3), ['Tabela de mãos do Texas Holdem', 'Como funciona o side pot', 'O que é straddle no poker']);

  // outra operação não vê a fila
  assert.equal((await sup.req('GET', `/api/t/${B}/pauta`)).data.temas.length, 0);
});

test('configuração: horário inválido recusa; ligar exige horário; ligada aparece para o redator', async () => {
  assert.equal((await mkt.req('PUT', `/api/t/${A}/pauta/config`, { horarios: '25:00' })).status, 400);
  assert.equal((await mkt.req('PUT', `/api/t/${A}/pauta/config`, { modo: 'publicar-tudo' })).status, 400);
  const r = await mkt.req('PUT', `/api/t/${A}/pauta/config`, { ativo: true, horarios: horario, modo: 'agendar', autor: 'Equipe Clube 10081', minimoTemas: 3 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.config.ativo, true);
  assert.equal(r.data.config.horarios, horario);
  const lista = await redator('GET', '/api/service/pauta');
  assert.equal(lista.status, 200);
  assert.deepEqual(lista.data.operacoes.map((o) => o.operacao), [A], 'só a operação ligada');
  assert.equal(lista.data.operacoes[0].temasNaFila, 4);
  assert.ok(lista.data.operacoes[0].proximoHorario);
});

test('próximo tema: reserva o primeiro da fila para o próximo horário e devolve o contexto; repetir devolve o mesmo', async () => {
  const r = await redator('POST', `/api/service/pauta/${A}/proximo`, {});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.tema.tema, 'Tabela de mãos do Texas Holdem');
  assert.equal(r.data.tema.situacao, 'reservado');
  assert.equal(r.data.repetido, false);
  assert.ok(Date.parse(r.data.horario) > Date.now(), 'horário no futuro');
  assert.equal(r.data.operacao.agente, '555');
  assert.match(r.data.operacao.whatsapp, /wa\.me\/5511988887777/);
  assert.equal(r.data.blog.autor, 'Equipe Clube 10081');
  assert.ok(r.data.regras.some((x) => /promessa de ganho/.test(x)));
  assert.ok(r.data.regras.some((x) => /Jogue com responsabilidade/.test(x)), 'poker: rodapé de jogo responsável');
  const de_novo = await redator('POST', `/api/service/pauta/${A}/proximo`, {});
  assert.equal(de_novo.data.tema.id, r.data.tema.id);
  assert.equal(de_novo.data.repetido, true);
  assert.equal(de_novo.data.horario, r.data.horario);
});

test('entregar: o post entra agendado no horário; entregar de novo não duplica; sai sozinho na hora', async () => {
  const prox = await redator('POST', `/api/service/pauta/${A}/proximo`, {});
  const temaId = prox.data.tema.id;
  assert.equal((await redator('POST', `/api/service/pauta/${B}/entregar`, { temaId, ...artigo('Outro') })).status, 404, 'tema de outra operação');
  assert.equal((await redator('POST', `/api/service/pauta/${A}/entregar`, { temaId, title: 'Sem conteúdo' })).status, 400);
  const r = await redator('POST', `/api/service/pauta/${A}/entregar`, { temaId, ...artigo('Tabela de mãos do Texas Holdem: da mais forte à mais fraca') });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.post.situacao, 'agendado');
  assert.equal(r.data.post.publicaEm, prox.data.horario);
  assert.equal(r.data.preflight.bloqueios.length, 0);
  const post = repoA.get('posts', r.data.post.id);
  assert.equal(post.status, 'agendado');
  assert.equal(post.author, 'Equipe Clube 10081');
  assert.equal(repoA.get('pauta_temas', temaId).status, 'entregue');

  const rep = await redator('POST', `/api/service/pauta/${A}/entregar`, { temaId, ...artigo('Título diferente') });
  assert.equal(rep.status, 200);
  assert.equal(rep.data.repetido, true);
  assert.equal(rep.data.post.id, post.id);
  assert.equal(repoA.count('posts'), 1, 'não duplicou');

  // o laço do blog publica na hora marcada
  publishDuePosts(P.db, new Date(Date.parse(post.scheduled_at) + 1000).toISOString());
  assert.equal(repoA.get('posts', post.id).status, 'publicado');
  const site = repoA.get('sites', post.site_id);
  const pub = await fetch(`${P.url}/s/${site.slug}/blog/${post.slug}`);
  assert.equal(pub.status, 200);
  assert.match(await pub.text(), /Tabela de mãos do Texas Holdem/);
});

test('o horário já usado não recebe outro tema; endereço repetido recusa; preflight bloqueia e o post fica em revisão', async () => {
  const prox = await redator('POST', `/api/service/pauta/${A}/proximo`, {});
  assert.equal(prox.status, 200);
  const usado = repoA.all('pauta_temas', { status: 'entregue' })[0].horario_alvo;
  assert.notEqual(prox.data.horario, usado, 'cada horário recebe um tema só');
  const dup = await redator('POST', `/api/service/pauta/${A}/entregar`, { temaId: prox.data.tema.id, ...artigo('Tabela de mãos do Texas Holdem: da mais forte à mais fraca') });
  assert.equal(dup.status, 409, 'slug de post existente');
  const r = await redator('POST', `/api/service/pauta/${A}/entregar`, { temaId: prox.data.tema.id,
    ...artigo('Side pot sem mistério', { content: 'Com esta estratégia você vai ganhar dinheiro fácil todo dia e ter lucro garantido no clube.' }) });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.post.situacao, 'revisao');
  assert.equal(r.data.post.publicaEm, null);
  assert.ok(r.data.preflight.bloqueios.length > 0);
  assert.match(r.data.aviso, /revisão/);
  assert.match(repoA.get('pauta_temas', prox.data.tema.id).motivo, /Preflight/);
});

test('pular: exige motivo; sem "encerrarHorario" o horário fica livre para o próximo tema; tema pulado volta à fila pelo painel', async () => {
  const prox = await redator('POST', `/api/service/pauta/${A}/proximo`, {});
  assert.equal((await redator('POST', `/api/service/pauta/${A}/pular`, { temaId: prox.data.tema.id })).status, 400);
  const r = await redator('POST', `/api/service/pauta/${A}/pular`, { temaId: prox.data.tema.id, motivo: 'repete o post de mãos' });
  assert.equal(r.status, 200);
  assert.equal(r.data.encerrouHorario, false);
  const prox2 = await redator('POST', `/api/service/pauta/${A}/proximo`, {});
  assert.equal(prox2.data.horario, prox.data.horario, 'mesmo horário para o próximo tema');
  assert.notEqual(prox2.data.tema.id, prox.data.tema.id);
  const enc = await redator('POST', `/api/service/pauta/${A}/pular`, { temaId: prox2.data.tema.id, motivo: 'nenhum tema rendeu', encerrarHorario: true });
  assert.equal(enc.data.encerrouHorario, true);

  const g = await mkt.req('GET', `/api/t/${A}/pauta`);
  assert.equal(g.data.contagem.pulados, 2);
  assert.ok(g.data.historico.some((h) => h.situacao === 'entregue' && h.post?.situacao === 'publicado'));
  const volta = await mkt.req('PATCH', `/api/t/${A}/pauta/temas/${prox.data.tema.id}`, { devolver: true });
  assert.equal(volta.status, 200);
  assert.equal(volta.data.tema.situacao, 'fila');
  assert.equal((await mkt.req('DELETE', `/api/t/${A}/pauta/temas/${repoA.all('pauta_temas', { status: 'entregue' })[0].id}`)).status, 409, 'entregue não se apaga');
});

test('reserva vencida volta à fila; modo revisão: o post chega em revisão', async () => {
  await mkt.req('PUT', `/api/t/${A}/pauta/config`, { modo: 'revisao' });
  const prox = await redator('POST', `/api/service/pauta/${A}/proximo`, {});
  P.db.prepare('UPDATE pauta_temas SET reservado_ate = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), prox.data.tema.id);
  const prox2 = await redator('POST', `/api/service/pauta/${A}/proximo`, {});
  assert.equal(prox2.data.repetido, false, 'reserva nova');
  assert.equal(prox2.data.tema.id, prox.data.tema.id, 'o mesmo tema volta a ser o primeiro da fila');
  assert.match(prox2.data.entrega, /revisão/);
  const r = await redator('POST', `/api/service/pauta/${A}/entregar`, { temaId: prox2.data.tema.id, ...artigo('Showdown: quem mostra as cartas primeiro') });
  assert.equal(r.status, 201);
  assert.equal(r.data.post.situacao, 'revisao');
});

test('papéis: afiliado não vê a pauta; marketing não apaga tema de outra operação', async () => {
  await sup.req('POST', `/api/t/${A}/users`, { email: 'af@pauta.test', name: 'Af', role: 'affiliate', password: 'afiliado-senha-123' });
  const af = client(P.url); await af.login('af@pauta.test', 'afiliado-senha-123');
  assert.equal((await af.req('GET', `/api/t/${A}/pauta`)).status, 403);
  const t = repoA.all('pauta_temas')[0];
  assert.equal((await mkt.req('DELETE', `/api/t/${B}/pauta/temas/${t.id}`)).status, 404);
  assert.equal((await sup.req('DELETE', `/api/t/${B}/pauta/temas/${t.id}`)).status, 404, 'id de outra operação não existe em B');
});
