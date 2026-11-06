// Calendário editorial: configuração de horários, geração idempotente, fuso da operação e situação real dos espaços.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPortal, client } from './helpers.mjs';
import { scoped } from '../lib/repo.mjs';
import { instanteLocal, diaLocal, horaLocal, somarDias, chaveDoEspaco, calendarConfig, ensureSlots, marcarPublicado, marcarErro } from '../lib/modules/calendar.mjs';

let P;
let sup;
let clube;
let loja;

const contar = (tenantId) => P.db.prepare('SELECT COUNT(*) n FROM calendar WHERE tenant_id = ?').get(tenantId).n;
const itensDe = (tenantId) => P.db.prepare('SELECT * FROM calendar WHERE tenant_id = ? ORDER BY scheduled_at ASC').all(tenantId);
const conectar = (tenantId, kind, status) => {
  const repo = scoped(P.db, tenantId);
  const row = repo.get('integrations', { kind });
  return repo.update('integrations', row.id, { status });
};

before(async () => {
  P = await startPortal();
  sup = client(P.origin);
  await sup.login('super@teste.local', 'senha-forte-123');
  clube = (await sup.req('POST', '/api/tenants', { name: 'Clube Calendário', number: '10031', niche: 'poker' })).data.tenant;
  loja = (await sup.req('POST', '/api/tenants', { name: 'Loja Calendário', number: '30031', niche: 'loja' })).data.tenant;
  await sup.req('POST', `/api/t/${clube.slug}/users`, { email: 'editora@cal.test', name: 'Editora', role: 'editor', password: 'editora-senha-123' });
  await sup.req('POST', `/api/t/${clube.slug}/users`, { email: 'afiliada@cal.test', name: 'Afiliada', role: 'affiliate', password: 'afiliada-senha-123' });
  await sup.req('POST', `/api/t/${loja.slug}/users`, { email: 'dona@loja-cal.test', name: 'Dona Loja', role: 'admin', password: 'dona-senha-123' });
});

after(() => P.close());

test('o módulo entra no menu do painel e serve a tela do calendário', async () => {
  const meta = await sup.req('GET', '/api/meta');
  assert.ok(meta.data.modules.some((m) => m.id === 'calendar' && m.perm === 'calendar.read'), 'calendário disponível no menu');

  const tela = await sup.req('GET', '/admin/modules/calendar.js', undefined, { raw: true });
  assert.equal(tela.status, 200);
  assert.match(tela.data, /aguardando conexão/i);
});

test('horários configurados são validados e gravados nas configurações da operação', async () => {
  let r = await sup.req('PUT', `/api/t/${clube.slug}/calendar/config`, { postTimes: '12:00,25:00' });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Horário inválido/);

  r = await sup.req('PUT', `/api/t/${clube.slug}/calendar/config`, { timezone: 'Marte/Olympus' });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Fuso horário desconhecido/);

  r = await sup.req('PUT', `/api/t/${clube.slug}/calendar/config`, { channels: ['tiktok'] });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Canal desconhecido/);

  r = await sup.req('PUT', `/api/t/${clube.slug}/calendar/config`, {
    postsPerDay: 3, postTimes: '18:00, 12:00 ,15:00, 12:00', timezone: 'America/Sao_Paulo', channels: ['instagram'],
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.config.postTimes, ['12:00', '15:00', '18:00'], 'horários ordenados e sem repetidos');
  assert.equal(r.data.config.postsPerDay, 3);

  const salvo = JSON.parse(P.db.prepare('SELECT settings FROM tenants WHERE id = ?').get(clube.id).settings);
  assert.equal(salvo.postTimes, '12:00,15:00,18:00');
  assert.deepEqual(salvo.postChannels, ['instagram']);
  assert.equal(salvo.whatsapp === undefined, true, 'não inventa campos que a operação não tem');
});

test('rodar a geração duas vezes não duplica itens', async () => {
  const primeira = await sup.req('POST', `/api/t/${clube.slug}/calendar/gerar`, { dias: 7 });
  assert.equal(primeira.status, 200, JSON.stringify(primeira.data));
  assert.equal(primeira.data.criados, 21, '3 horários × 7 dias × 1 canal');
  const depoisDaPrimeira = contar(clube.id);
  assert.equal(depoisDaPrimeira, 21);

  const segunda = await sup.req('POST', `/api/t/${clube.slug}/calendar/gerar`, { dias: 7 });
  assert.equal(segunda.status, 200);
  assert.equal(segunda.data.criados, 0, 'reexecutar não cria nada');
  assert.equal(segunda.data.mantidos, 21);
  assert.equal(contar(clube.id), depoisDaPrimeira, 'a quantidade de itens não muda');

  const chaves = itensDe(clube.id).map((c) => c.idem_key);
  assert.equal(new Set(chaves).size, chaves.length, 'cada espaço tem chave única');
  const hoje = diaLocal('America/Sao_Paulo');
  assert.ok(chaves.includes(chaveDoEspaco('instagram', hoje, '12:00')), 'a chave é canal + dia local + horário');

  // terceira passada com janela maior: só acrescenta os dias novos
  const terceira = await sup.req('POST', `/api/t/${clube.slug}/calendar/gerar`, { dias: 10 });
  assert.equal(terceira.data.criados, 9, 'só os 3 dias que faltavam');
  assert.equal(contar(clube.id), 30);
});

test('geração remove espaços abertos que saíram dos horários ou canais configurados', async () => {
  const tenant = (await sup.req('POST', '/api/tenants', { name: 'Calendário Reconfigurado', number: '10033', niche: 'poker' })).data.tenant;
  await sup.req('PUT', `/api/t/${tenant.slug}/calendar/config`, { postsPerDay: 1, postTimes: '12:00', channels: ['instagram'] });
  let r = await sup.req('POST', `/api/t/${tenant.slug}/calendar/gerar`, { dias: 3 });
  assert.equal(r.data.criados, 3);
  assert.equal(contar(tenant.id), 3);

  await sup.req('PUT', `/api/t/${tenant.slug}/calendar/config`, { postsPerDay: 1, postTimes: '20:00' });
  r = await sup.req('POST', `/api/t/${tenant.slug}/calendar/gerar`, { dias: 3 });
  assert.equal(r.data.criados, 3);
  assert.equal(r.data.removidos, 3, 'o horário que saiu da configuração é removido');
  assert.equal(contar(tenant.id), 3);
  assert.ok(itensDe(tenant.id).every((item) => item.idem_key.endsWith('|20:00')));

  await sup.req('PUT', `/api/t/${tenant.slug}/calendar/config`, { channels: ['blog'] });
  r = await sup.req('POST', `/api/t/${tenant.slug}/calendar/gerar`, { dias: 3 });
  assert.equal(r.data.criados, 3);
  assert.equal(r.data.removidos, 3, 'o canal que saiu da configuração é removido');
  assert.equal(contar(tenant.id), 3);
  assert.ok(itensDe(tenant.id).every((item) => item.channel === 'blog'));
});

test('a lista comporta 2.880 espaços em 60 dias', async () => {
  const tenant = (await sup.req('POST', '/api/tenants', { name: 'Calendário Amplo', number: '10034', niche: 'poker' })).data.tenant;
  const horarios = Array.from({ length: 12 }, (_, i) => `${String(i * 2).padStart(2, '0')}:00`).join(',');
  await sup.req('PUT', `/api/t/${tenant.slug}/calendar/config`, {
    postsPerDay: 12, postTimes: horarios, channels: ['instagram', 'telegram', 'youtube', 'blog'],
  });
  const geracao = await sup.req('POST', `/api/t/${tenant.slug}/calendar/gerar`, { dias: 60 });
  assert.equal(geracao.data.criados, 2880);
  const lista = await sup.req('GET', `/api/t/${tenant.slug}/calendar?dias=60`);
  assert.equal(lista.data.dias.reduce((n, dia) => n + dia.itens.length, 0), 2880, 'a tela não trunca no limite antigo de 2.000');
});

test('sem conta conectada o item fica aguardando conexão e volta a rascunho quando conecta', async () => {
  for (const item of itensDe(clube.id)) assert.equal(item.status, 'aguardando_conexao', 'Instagram ainda não conectado');

  let lista = await sup.req('GET', `/api/t/${clube.slug}/calendar?dias=7`);
  assert.equal(lista.status, 200);
  assert.equal(lista.data.conexoes.instagram, false);
  assert.ok(lista.data.avisos.some((a) => /Sem conta conectada em Instagram/.test(a)));
  assert.equal(lista.data.dias[0].itens[0].situacaoLabel, 'Aguardando conexão');

  conectar(clube.id, 'instagram', 'ativo');
  const r = await sup.req('POST', `/api/t/${clube.slug}/calendar/gerar`, { dias: 7 });
  assert.equal(r.data.criados, 0);
  assert.equal(r.data.reavaliados, 21, 'os espaços da janela passam para rascunho');
  for (const item of itensDe(clube.id).slice(0, 21)) assert.equal(item.status, 'rascunho');

  conectar(clube.id, 'instagram', 'pendente');
  await sup.req('POST', `/api/t/${clube.slug}/calendar/gerar`, { dias: 7 });
  for (const item of itensDe(clube.id).slice(0, 21)) assert.equal(item.status, 'aguardando_conexao', 'perdeu a conexão: volta a aguardar');
  conectar(clube.id, 'instagram', 'ativo');
  await sup.req('POST', `/api/t/${clube.slug}/calendar/gerar`, { dias: 7 });

  lista = await sup.req('GET', `/api/t/${clube.slug}/calendar?dias=7`);
  assert.equal(lista.data.conexoes.instagram, true);
  assert.equal(lista.data.conexoes.youtube, false, 'YouTube não tem integração: segue sem conta');
  assert.equal(lista.data.conexoes.blog, true, 'o blog sai no próprio portal');
  assert.ok(!lista.data.avisos.some((a) => /Instagram/.test(a)));
});

test('horários respeitam o fuso da operação e remarcam sem duplicar quando o fuso muda', async () => {
  const antes = itensDe(clube.id);
  const hoje = diaLocal('America/Sao_Paulo');
  const meioDiaSp = antes.find((c) => c.idem_key === chaveDoEspaco('instagram', hoje, '12:00'));
  assert.ok(meioDiaSp, 'existe o espaço das 12:00 de hoje');
  assert.equal(meioDiaSp.scheduled_at, instanteLocal('America/Sao_Paulo', hoje, '12:00').toISOString());
  assert.equal(new Date(meioDiaSp.scheduled_at).toISOString().slice(11, 16), '15:00', '12:00 em São Paulo é 15:00 UTC');

  const quantidade = contar(clube.id);
  const r = await sup.req('PUT', `/api/t/${clube.slug}/calendar/config`, { timezone: 'America/Manaus' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.config.timezone, 'America/Manaus');

  const gerou = await sup.req('POST', `/api/t/${clube.slug}/calendar/gerar`, { dias: 7 });
  assert.equal(gerou.data.criados, 0, 'trocar o fuso não cria item novo');
  assert.equal(gerou.data.remarcados, 21, 'os espaços da janela são remarcados');
  assert.equal(contar(clube.id), quantidade, 'nada foi duplicado');

  const depois = itensDe(clube.id).find((c) => c.idem_key === meioDiaSp.idem_key);
  assert.equal(new Date(depois.scheduled_at).toISOString().slice(11, 16), '16:00', '12:00 em Manaus é 16:00 UTC');

  const lista = await sup.req('GET', `/api/t/${clube.slug}/calendar?dias=7`);
  const item = lista.data.dias[0].itens.find((x) => x.id === depois.id);
  assert.equal(item.hora, '12:00', 'a tela mostra a hora no relógio da operação');
  assert.equal(item.dia, diaLocal('America/Manaus'));

  await sup.req('PUT', `/api/t/${clube.slug}/calendar/config`, { timezone: 'America/Sao_Paulo' });
  await sup.req('POST', `/api/t/${clube.slug}/calendar/gerar`, { dias: 7 });
});

test('fuso com horário de verão: o espaço cai na hora certa do relógio local', () => {
  // Lisboa muda a hora em 29/03/2026 (de UTC+0 para UTC+1).
  assert.equal(instanteLocal('Europe/Lisbon', '2026-03-28', '12:00').toISOString(), '2026-03-28T12:00:00.000Z');
  assert.equal(instanteLocal('Europe/Lisbon', '2026-03-30', '12:00').toISOString(), '2026-03-30T11:00:00.000Z');
  assert.equal(somarDias('2026-03-28', 2), '2026-03-30', 'o dia anda no calendário, não de 24 em 24 horas');

  const meiaNoiteInexistente = instanteLocal('America/Santiago', '2026-09-06', '00:00');
  assert.equal(meiaNoiteInexistente.toISOString(), '2026-09-06T04:00:00.000Z', 'avança para 01:00, o primeiro horário válido');
  assert.equal(diaLocal('America/Santiago', meiaNoiteInexistente), '2026-09-06', 'o espaço não volta para o dia anterior');
  assert.equal(horaLocal('America/Santiago', meiaNoiteInexistente), '01:00');
});

test('agendar exige legenda e conta conectada; publicado e erro ficam fora da geração', async () => {
  const lista = await sup.req('GET', `/api/t/${clube.slug}/calendar?dias=7`);
  const alvo = lista.data.dias[0].itens[0];

  let r = await sup.req('POST', `/api/t/${clube.slug}/calendar/${alvo.id}/situacao`, { situacao: 'agendado' });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /legenda/);

  r = await sup.req('POST', `/api/t/${clube.slug}/calendar/${alvo.id}/situacao`, { situacao: 'publicado' });
  assert.equal(r.status, 400, 'a tela não publica: isso é do módulo do canal');

  r = await sup.req('PATCH', `/api/t/${clube.slug}/calendar/${alvo.id}`, { legenda: 'Mesa de sexta às 21h. Link na bio.' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.item.legenda, 'Mesa de sexta às 21h. Link na bio.');

  conectar(clube.id, 'instagram', 'pendente');
  r = await sup.req('POST', `/api/t/${clube.slug}/calendar/${alvo.id}/situacao`, { situacao: 'agendado' });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Conecte a conta de Instagram/);
  conectar(clube.id, 'instagram', 'ativo');

  r = await sup.req('POST', `/api/t/${clube.slug}/calendar/${alvo.id}/situacao`, { situacao: 'agendado' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.item.situacao, 'agendado');

  // o módulo do canal publica e erra; a geração não mexe mais nesses
  const repo = scoped(P.db, clube.id);
  const outros = itensDe(clube.id).filter((c) => c.id !== alvo.id);
  marcarPublicado(repo, outros[0].id);
  marcarErro(repo, outros[1].id, 'A conta recusou a publicação.');

  const fechadosAntes = [outros[0], outros[1]].map(({ id }) => {
    const item = P.db.prepare('SELECT status, scheduled_at FROM calendar WHERE tenant_id = ? AND id = ?').get(clube.id, id);
    return { id, ...item };
  });
  await sup.req('PUT', `/api/t/${clube.slug}/calendar/config`, { timezone: 'America/Manaus' });
  conectar(clube.id, 'instagram', 'pendente');
  await sup.req('POST', `/api/t/${clube.slug}/calendar/gerar`, { dias: 7 });
  const fechadosDepois = fechadosAntes.map(({ id }) => {
    const item = P.db.prepare('SELECT status, scheduled_at FROM calendar WHERE tenant_id = ? AND id = ?').get(clube.id, id);
    return { id, ...item };
  });
  assert.deepEqual(fechadosDepois, fechadosAntes, 'publicado e erro preservam estado e horário após mudar o fuso e desconectar o canal');
  await sup.req('PUT', `/api/t/${clube.slug}/calendar/config`, { timezone: 'America/Sao_Paulo' });
  conectar(clube.id, 'instagram', 'ativo');
  await sup.req('POST', `/api/t/${clube.slug}/calendar/gerar`, { dias: 7 });

  r = await sup.req('PATCH', `/api/t/${clube.slug}/calendar/${outros[0].id}`, { legenda: 'tentando reescrever' });
  assert.equal(r.status, 409, 'publicado não se altera');
  r = await sup.req('DELETE', `/api/t/${clube.slug}/calendar/${outros[0].id}`);
  assert.equal(r.status, 409, 'publicado não se apaga');

  r = await sup.req('POST', `/api/t/${clube.slug}/calendar/${outros[1].id}/situacao`, { situacao: 'rascunho' });
  assert.equal(r.status, 200);
  assert.equal(r.data.item.situacao, 'rascunho');
  assert.equal(r.data.item.erro, null, 'voltar para rascunho limpa a mensagem de erro');
});

test('meta de zero por dia e horários a menos que a meta são avisados, sem inventar espaço', async () => {
  const vazio = (await sup.req('POST', '/api/tenants', { name: 'Clube Sem Posts', number: '10032', niche: 'poker' })).data.tenant;
  await sup.req('PUT', `/api/t/${vazio.slug}/calendar/config`, { postsPerDay: 0, postTimes: '12:00' });
  let r = await sup.req('POST', `/api/t/${vazio.slug}/calendar/gerar`, { dias: 7 });
  assert.equal(r.data.criados, 0);
  assert.equal(contar(vazio.id), 0, 'meta zero não cria espaço');
  let lista = await sup.req('GET', `/api/t/${vazio.slug}/calendar?dias=7`);
  assert.ok(lista.data.avisos.some((a) => /0 publicações por dia/.test(a)));

  await sup.req('PUT', `/api/t/${vazio.slug}/calendar/config`, { postsPerDay: 3, postTimes: '09:00' });
  r = await sup.req('POST', `/api/t/${vazio.slug}/calendar/gerar`, { dias: 2 });
  assert.equal(r.data.criados, 2, 'cria só os horários que existem');
  lista = await sup.req('GET', `/api/t/${vazio.slug}/calendar?dias=2`);
  assert.ok(lista.data.avisos.some((a) => /só há 1 horário/.test(a)), 'avisa que falta horário para fechar a meta');
});

test('cada operação só enxerga o próprio calendário e o papel sem permissão é barrado', async () => {
  await sup.req('PUT', `/api/t/${loja.slug}/calendar/config`, { postsPerDay: 1, postTimes: '08:00', channels: ['blog'] });
  await sup.req('POST', `/api/t/${loja.slug}/calendar/gerar`, { dias: 3 });
  assert.equal(contar(loja.id), 3);

  const daLoja = itensDe(loja.id)[0];
  const doClube = itensDe(clube.id)[0];
  const lista = await sup.req('GET', `/api/t/${clube.slug}/calendar?dias=7`);
  const ids = lista.data.dias.flatMap((d) => d.itens.map((i) => i.id));
  assert.ok(!ids.includes(daLoja.id), 'o calendário de uma operação não mostra itens de outra');

  let r = await sup.req('PATCH', `/api/t/${clube.slug}/calendar/${daLoja.id}`, { legenda: 'invasão' });
  assert.equal(r.status, 404, 'item de outra operação não existe neste escopo');

  const dona = client(P.origin);
  await dona.login('dona@loja-cal.test', 'dona-senha-123');
  r = await dona.req('GET', `/api/t/${clube.slug}/calendar`);
  assert.equal(r.status, 404, 'quem não é da operação nem sabe que ela existe');

  const afiliada = client(P.origin);
  await afiliada.login('afiliada@cal.test', 'afiliada-senha-123');
  for (const chamada of [['GET', `/api/t/${clube.slug}/calendar`], ['POST', `/api/t/${clube.slug}/calendar/gerar`],
    ['PUT', `/api/t/${clube.slug}/calendar/config`], ['DELETE', `/api/t/${clube.slug}/calendar/${doClube.id}`]]) {
    const bloqueada = await afiliada.req(chamada[0], chamada[1], chamada[0] === 'GET' ? undefined : {});
    assert.equal(bloqueada.status, 403, `afiliado não acessa ${chamada[0]} ${chamada[1]}`);
  }

  const editora = client(P.origin);
  await editora.login('editora@cal.test', 'editora-senha-123');
  r = await editora.req('GET', `/api/t/${clube.slug}/calendar`);
  assert.equal(r.status, 200, 'editor tem calendar.read');
  r = await editora.req('POST', `/api/t/${clube.slug}/calendar/gerar`, { dias: 3 });
  assert.equal(r.status, 200, 'editor tem calendar.edit');
});

test('ensureSlots e calendarConfig funcionam direto, para o módulo que publica reaproveitar', () => {
  const tenant = { niche_id: 'poker', settings: JSON.stringify({ timezone: 'UTC', postsPerDay: 2, postTimes: '06:00,18:00', postChannels: ['blog', 'telegram'] }) };
  const cfg = calendarConfig(tenant);
  assert.deepEqual(cfg, { timezone: 'UTC', postsPerDay: 2, postTimes: ['06:00', '18:00'], canais: ['blog', 'telegram'] });

  const t = itensDe(loja.id).length;
  const repo = scoped(P.db, loja.id);
  const resumo = ensureSlots(repo, { niche_id: 'loja', settings: JSON.stringify({ timezone: 'UTC', postsPerDay: 1, postTimes: '23:30', postChannels: ['blog'] }) }, { days: 2 });
  assert.equal(resumo.criados, 2);
  assert.equal(resumo.removidos, 2, 'a geração retira horários anteriores dentro da janela');
  assert.equal(itensDe(loja.id).length, t + resumo.criados - resumo.removidos);
  const repetido = ensureSlots(repo, { niche_id: 'loja', settings: JSON.stringify({ timezone: 'UTC', postsPerDay: 1, postTimes: '23:30', postChannels: ['blog'] }) }, { days: 2 });
  assert.equal(repetido.criados, 0);
  assert.equal(repetido.mantidos, 2);
  assert.equal(repetido.removidos, 0);
});
