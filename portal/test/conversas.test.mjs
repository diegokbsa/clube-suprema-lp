// CRM de conversas: caixa de entrada por operação — isolamento, base única de clientes, idempotência e permissões.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPortal, client, sign } from './helpers.mjs';
import { scoped } from '../lib/repo.mjs';
import { upsertContact } from '../lib/migrations.mjs';
import { segredoHookMensagens } from '../lib/modules/conversas.mjs';

let P;
let sup;
let clube;
let loja;
let users;
let leadCliente;

const hook = (slug, corpo, segredo) => {
  const raw = JSON.stringify(corpo);
  return fetch(`${P.origin}/api/hooks/${slug}/mensagem`, {
    method: 'POST', body: raw,
    headers: { 'Content-Type': 'application/json', 'X-Portal-Signature': sign(segredo, raw) },
  }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));
};

const segredoDe = (tenantId) => segredoHookMensagens(P.db.prepare('SELECT webhook_secret s FROM tenants WHERE id = ?').get(tenantId).s);

before(async () => {
  P = await startPortal();
  sup = client(P.origin);
  await sup.login('super@teste.local', 'senha-forte-123');

  clube = (await sup.req('POST', '/api/tenants', { name: 'Clube Conversas', number: '10050', niche: 'poker' })).data.tenant;
  loja = (await sup.req('POST', '/api/tenants', { name: 'Loja Conversas', number: '30050', niche: 'loja' })).data.tenant;

  await sup.req('POST', `/api/t/${clube.slug}/users`, { email: 'atendente@conversas.test', name: 'Atendente Clube', role: 'marketing', password: 'atendente-senha-123' });
  await sup.req('POST', `/api/t/${clube.slug}/users`, { email: 'afiliada@conversas.test', name: 'Afiliada Clube', role: 'affiliate', password: 'afiliada-senha-123' });
  await sup.req('POST', `/api/t/${loja.slug}/users`, { email: 'dona@loja-conversas.test', name: 'Dona Loja', role: 'admin', password: 'dona-senha-123' });

  users = {
    atendente: P.db.prepare('SELECT id FROM users WHERE email = ?').get('atendente@conversas.test').id,
    afiliada: P.db.prepare('SELECT id FROM users WHERE email = ?').get('afiliada@conversas.test').id,
    donaLoja: P.db.prepare('SELECT id FROM users WHERE email = ?').get('dona@loja-conversas.test').id,
  };

  // a pessoa já existe na base única e tem lead no clube (é assim que o formulário do site grava)
  const pessoa = upsertContact(P.db, { email: 'cliente@conversas.test', phone: '11 95213-8293', name: 'Cliente Base Única' });
  leadCliente = scoped(P.db, clube.id).insert('leads', {
    contact_id: pessoa, email: 'cliente@conversas.test', name: 'Cliente Base Única', phone: '5511952138293', stage: 'novo',
  });
});

after(() => P.close());

test('módulo aparece no painel e a tela da caixa de entrada é servida', async () => {
  const meta = await sup.req('GET', '/api/meta');
  assert.ok(meta.data.modules.some((m) => m.id === 'conversas'), 'módulo de conversas no menu');

  const tela = await sup.req('GET', '/admin/modules/conversas.js', undefined, { raw: true });
  assert.equal(tela.status, 200);
  assert.match(tela.data, /Caixa de entrada/);
  assert.match(tela.data, /Nota interna/);
  assert.match(tela.data, /canaisIntegracao/);
  assert.match(tela.data, /rotuloCanalComEstado/);
});

test('conversa aberta no painel liga na pessoa da base única e no lead da operação', async () => {
  const r = await sup.req('POST', `/api/t/${clube.slug}/conversas`, {
    canal: 'whatsapp', email: 'CLIENTE@conversas.test', nome: 'Cliente Base Única', assunto: 'Dúvida sobre fichas', texto: 'Primeiro contato pelo WhatsApp', direcao: 'entrada',
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const conversa = r.data.conversa;
  assert.equal(conversa.canal, 'whatsapp');
  assert.equal(conversa.status, 'aberta');
  assert.equal(conversa.cliente.email, 'cliente@conversas.test', 'e-mail normalizado acha a mesma pessoa');

  const linha = P.db.prepare('SELECT contact_id, lead_id, tenant_id FROM conversations WHERE id = ?').get(conversa.id);
  const esperado = P.db.prepare('SELECT id FROM contacts WHERE email = ?').get('cliente@conversas.test').id;
  assert.equal(linha.contact_id, esperado, 'conversa aponta para a pessoa única');
  assert.equal(linha.lead_id, leadCliente.id, 'conversa aponta para o lead desta operação');
  assert.equal(linha.tenant_id, clube.id);

  const detalhe = await sup.req('GET', `/api/t/${clube.slug}/conversas/${conversa.id}`);
  assert.equal(detalhe.status, 200);
  assert.equal(detalhe.data.mensagens.length, 1);
  assert.equal(detalhe.data.mensagens[0].direcao, 'entrada');
  assert.equal(detalhe.data.lead.id, leadCliente.id);
  assert.ok(detalhe.data.eventos.some((e) => e.tipo === 'aberta'), 'abertura entra no histórico');
});

test('mensagem que chega pelo webhook acha o cliente certo pelo telefone da base única', async () => {
  const r = await hook(clube.slug, {
    canal: 'telegram', id_externo: 'tg-1', conversa_externa: 'tg-chat-1', texto: 'Oi, consigo ficha hoje?',
    telefone: '11952138293', nome: 'Cliente Base Única',
  }, segredoDe(clube.id));
  assert.equal(r.status, 201, JSON.stringify(r.data));

  const detalhe = (await sup.req('GET', `/api/t/${clube.slug}/conversas/${r.data.conversa}`)).data;
  assert.equal(detalhe.conversa.cliente.email, 'cliente@conversas.test', 'telefone levou à mesma pessoa da base única');
  assert.equal(detalhe.conversa.canal, 'telegram');
  assert.equal(detalhe.conversa.naoLidas, 1);
  assert.equal(detalhe.mensagens[0].status, 'registrada');

  const antes = (await sup.req('GET', `/api/t/${clube.slug}`)).data.dashboard;
  const csvAntes = await sup.req('GET', `/api/t/${clube.slug}/leads.csv`, undefined, { raw: true });
  assert.equal(csvAntes.status, 200);
  // A conversa registra o contato, mas não cria um lead sem consentimento explícito.
  const nova = await hook(clube.slug, { canal: 'whatsapp', id_externo: 'wa-nova-1', texto: 'Quero saber dos torneios', telefone: '21 98888-7777', nome: 'Pessoa Nova' }, segredoDe(clube.id));
  assert.equal(nova.status, 201, JSON.stringify(nova.data));
  const pessoaNova = P.db.prepare('SELECT id, name FROM contacts WHERE phone = ?').get('5521988887777');
  assert.ok(pessoaNova, 'webhook criou a pessoa na base única');
  const conversaNova = P.db.prepare('SELECT contact_id, lead_id FROM conversations WHERE id = ?').get(nova.data.conversa);
  assert.equal(conversaNova.contact_id, pessoaNova.id);
  assert.equal(conversaNova.lead_id, null, 'mensagem recebida não cria lead sem consentimento');
  const detalheNova = (await sup.req('GET', `/api/t/${clube.slug}/conversas/${nova.data.conversa}`)).data;
  assert.deepEqual(detalheNova.conversa.cliente, { id: pessoaNova.id, nome: 'Pessoa Nova', email: null, telefone: '5521988887777' });
  const depois = (await sup.req('GET', `/api/t/${clube.slug}`)).data.dashboard;
  assert.equal(depois.leads30, antes.leads30, 'o contato não aumenta a contagem de leads dos últimos 30 dias');
  assert.equal(depois.leadsTotal, antes.leadsTotal, 'o contato não aumenta a contagem total de leads');
  const csvDepois = await sup.req('GET', `/api/t/${clube.slug}/leads.csv`, undefined, { raw: true });
  assert.equal(csvDepois.status, 200);
  assert.equal(csvDepois.data, csvAntes.data, 'leads.csv não inclui o contato sem consentimento');
  assert.ok(!csvDepois.data.includes('Pessoa Nova'));
});

test('reenvio da mesma mensagem não duplica (idempotência por id externo)', async () => {
  const corpo = { canal: 'telegram', id_externo: 'tg-2', conversa_externa: 'tg-chat-1', texto: 'Repetiu o evento', telefone: '11952138293' };
  const primeira = await hook(clube.slug, corpo, segredoDe(clube.id));
  assert.equal(primeira.status, 201);
  assert.equal(primeira.data.duplicada, false);

  const repetida = await hook(clube.slug, corpo, segredoDe(clube.id));
  assert.equal(repetida.status, 200, 'reenvio devolve 200');
  assert.equal(repetida.data.duplicada, true);
  assert.equal(repetida.data.mensagem, primeira.data.mensagem, 'devolve a mesma mensagem');
  assert.equal(repetida.data.conversa, primeira.data.conversa, 'e a mesma conversa');

  const quantas = P.db.prepare('SELECT COUNT(*) n FROM messages WHERE tenant_id = ? AND external_id = ?').get(clube.id, 'tg-2').n;
  assert.equal(quantas, 1, 'uma linha só para o mesmo id externo');

  const detalhe = (await sup.req('GET', `/api/t/${clube.slug}/conversas/${primeira.data.conversa}`)).data;
  assert.equal(detalhe.mensagens.filter((m) => m.idExterno === 'tg-2').length, 1);
  assert.equal(detalhe.conversa.mensagens, detalhe.mensagens.length, 'o contador da conversa bate com as mensagens');

  // o mesmo id externo em outra operação é outra mensagem: a chave é por operação
  const outra = await hook(loja.slug, { ...corpo, telefone: '11 97777-6666' }, segredoDe(loja.id));
  assert.equal(outra.status, 201, JSON.stringify(outra.data));
});

test('webhook duplicado é descartado antes de criar contato ou conversa', async () => {
  const primeira = await hook(clube.slug, {
    canal: 'whatsapp', id_externo: 'wa-dedupe-antes', texto: 'Mensagem inicial', telefone: '31 98888-1234', nome: 'Contato Inicial',
  }, segredoDe(clube.id));
  assert.equal(primeira.status, 201, JSON.stringify(primeira.data));
  const conversasAntes = scoped(P.db, clube.id).count('conversations');
  const repetida = await hook(clube.slug, {
    canal: 'whatsapp', id_externo: 'wa-dedupe-antes', conversa_externa: 'wa-fio-vazio',
    texto: 'Reenvio', email: 'nao-criar-contato@conversas.test', nome: 'Duplicado',
  }, segredoDe(clube.id));
  assert.equal(repetida.status, 200, JSON.stringify(repetida.data));
  assert.equal(repetida.data.duplicada, true);
  assert.equal(repetida.data.conversa, primeira.data.conversa);
  assert.equal(scoped(P.db, clube.id).count('conversations'), conversasAntes, 'reenvio não abre conversa vazia');
  assert.equal(P.db.prepare('SELECT COUNT(*) n FROM contacts WHERE email = ?').get('nao-criar-contato@conversas.test').n, 0, 'reenvio não cria contato');
  assert.equal(scoped(P.db, clube.id).get('conversations', { channel: 'whatsapp', external_id: 'wa-fio-vazio' }), null);
});

test('webhook em conversa existente não cria nem atualiza contato global', async () => {
  const primeira = await hook(clube.slug, {
    canal: 'telegram', id_externo: 'tg-fio-primeira', conversa_externa: 'tg-fio-existente',
    texto: 'Primeira', telefone: '41 98888-0011', nome: 'Contato do Fio',
  }, segredoDe(clube.id));
  assert.equal(primeira.status, 201);
  const contatoAntes = P.db.prepare('SELECT COUNT(*) n FROM contacts').get().n;
  const seguinte = await hook(clube.slug, {
    canal: 'telegram', id_externo: 'tg-fio-seguinte', conversa_externa: 'tg-fio-existente',
    texto: 'Continuação', email: 'nao-upsert-existente@conversas.test', nome: 'Novo Nome',
  }, segredoDe(clube.id));
  assert.equal(seguinte.status, 201, JSON.stringify(seguinte.data));
  assert.equal(seguinte.data.conversa, primeira.data.conversa);
  assert.equal(P.db.prepare('SELECT COUNT(*) n FROM contacts').get().n, contatoAntes);
  assert.equal(P.db.prepare('SELECT COUNT(*) n FROM contacts WHERE email = ?').get('nao-upsert-existente@conversas.test').n, 0);
});

test('webhook recusa assinatura errada e operação inexistente', async () => {
  const ruim = await hook(clube.slug, { canal: 'whatsapp', id_externo: 'wa-ruim', texto: 'tentativa', telefone: '11952138293' }, 'segredo-errado');
  assert.equal(ruim.status, 401);
  assert.equal(P.db.prepare('SELECT COUNT(*) n FROM messages WHERE tenant_id = ? AND external_id = ?').get(clube.id, 'wa-ruim').n, 0);
  assert.ok(P.db.prepare("SELECT 1 FROM audit WHERE tenant_id = ? AND action = 'webhook.assinatura_invalida'").get(clube.id), 'tentativa fica na auditoria');

  const semOperacao = await hook('operacao-que-nao-existe', { canal: 'whatsapp', id_externo: 'x', texto: 'oi', telefone: '11952138293' }, 'qualquer');
  assert.equal(semOperacao.status, 404);

  const semTexto = await hook(clube.slug, { canal: 'whatsapp', id_externo: 'wa-vazio', texto: '   ', telefone: '11952138293' }, segredoDe(clube.id));
  assert.equal(semTexto.status, 400);

  const canalInvalido = await hook(clube.slug, { canal: 'pombo-correio', id_externo: 'wa-canal', texto: 'oi', telefone: '11952138293' }, segredoDe(clube.id));
  assert.equal(canalInvalido.status, 400);
});

test('hook de mensagens tem chave derivada, URL própria e segredo mascarado', async () => {
  const info = await sup.req('GET', `/api/t/${clube.slug}/conversas/hook`);
  assert.equal(info.status, 200, JSON.stringify(info.data));
  assert.equal(info.data.url, `${P.origin}/api/hooks/${clube.slug}/mensagem`);
  assert.match(info.data.assinatura, /X-Portal-Signature/);
  assert.match(info.data.segredo, /^••••[a-f0-9]{4}$/i);
  const segredoBase = P.db.prepare('SELECT webhook_secret FROM tenants WHERE id = ?').get(clube.id).webhook_secret;
  assert.notEqual(info.data.segredo, segredoBase, 'a interface não revela o segredo da operação');
  const bruto = await hook(clube.slug, {
    canal: 'whatsapp', id_externo: 'wa-segredo-base', texto: 'Assinatura com segredo-base', telefone: '11 90000-0022',
  }, segredoBase);
  assert.equal(bruto.status, 401, 'o webhook exige a chave derivada específica de mensagens');
});

test('webhook recusa operação inativa sem gravar conversa ou mensagem', async () => {
  const repo = scoped(P.db, clube.id);
  const conversasAntes = repo.count('conversations');
  const mensagensAntes = repo.count('messages');
  P.db.prepare("UPDATE tenants SET status = 'inativa' WHERE id = ?").run(clube.id);
  try {
    const r = await hook(clube.slug, {
      canal: 'whatsapp', id_externo: 'wa-operacao-inativa', texto: 'Não registrar', email: 'inativa@conversas.test',
    }, segredoDe(clube.id));
    assert.equal(r.status, 409);
    assert.equal(repo.count('conversations'), conversasAntes);
    assert.equal(repo.count('messages'), mensagensAntes);
    assert.equal(P.db.prepare('SELECT COUNT(*) n FROM contacts WHERE email = ?').get('inativa@conversas.test').n, 0);
  } finally {
    P.db.prepare("UPDATE tenants SET status = 'ativa' WHERE id = ?").run(clube.id);
  }
});

test('a conversa de uma operação não aparece em outra', async () => {
  const noClube = (await sup.req('POST', `/api/t/${clube.slug}/conversas`, { canal: 'email', email: 'isolada@conversas.test', nome: 'Isolada', assunto: 'Só do clube' })).data.conversa;
  const naLoja = (await sup.req('POST', `/api/t/${loja.slug}/conversas`, { canal: 'email', email: 'daloja@conversas.test', nome: 'Da Loja', assunto: 'Só da loja' })).data.conversa;

  const listaClube = (await sup.req('GET', `/api/t/${clube.slug}/conversas`)).data;
  assert.ok(listaClube.conversas.some((c) => c.id === noClube.id));
  assert.ok(!listaClube.conversas.some((c) => c.id === naLoja.id), 'a lista do clube não traz conversa da loja');
  assert.equal(listaClube.totais.todas, listaClube.conversas.length);

  const listaLoja = (await sup.req('GET', `/api/t/${loja.slug}/conversas`)).data;
  assert.ok(!listaLoja.conversas.some((c) => c.id === noClube.id));

  assert.equal((await sup.req('GET', `/api/t/${loja.slug}/conversas/${noClube.id}`)).status, 404, 'detalhe atravessado não existe');
  assert.equal((await sup.req('PATCH', `/api/t/${loja.slug}/conversas/${noClube.id}`, { status: 'resolvida' })).status, 404);
  assert.equal((await sup.req('POST', `/api/t/${loja.slug}/conversas/${noClube.id}/mensagens`, { texto: 'invasão', direcao: 'nota' })).status, 404);

  const dona = client(P.origin);
  await dona.login('dona@loja-conversas.test', 'dona-senha-123');
  assert.equal((await dona.req('GET', `/api/t/${clube.slug}/conversas`)).status, 404, 'usuária de outra operação nem enxerga a caixa de entrada');
});

test('contato compartilhado só recebe na operação os dados informados nela', async () => {
  const segredoEmail = upsertContact(P.db, {
    email: 'email-segredo@clube.test', phone: '21 97777-1234', name: 'Pessoa Só Do Clube',
  });
  scoped(P.db, clube.id).insert('leads', {
    contact_id: segredoEmail, email: 'email-segredo@clube.test', phone: '5521977771234', name: 'Pessoa Só Do Clube', stage: 'novo',
  });
  const segredoTelefone = upsertContact(P.db, {
    email: 'email-informado-so-no-clube@clube.test', phone: '21 96666-4321', name: 'Pessoa Do Telefone',
  });
  scoped(P.db, clube.id).insert('leads', {
    contact_id: segredoTelefone, email: 'email-informado-so-no-clube@clube.test', phone: '5521966664321', name: 'Pessoa Do Telefone', stage: 'novo',
  });

  const porEmail = await sup.req('POST', `/api/t/${loja.slug}/conversas`, {
    canal: 'email', email: 'email-segredo@clube.test',
  });
  assert.equal(porEmail.status, 201, JSON.stringify(porEmail.data));
  assert.equal(porEmail.data.conversa.cliente.email, 'email-segredo@clube.test', 'retorna o e-mail enviado pela própria operação');
  assert.equal(porEmail.data.conversa.cliente.nome, null, 'não revela o nome guardado pelo clube');
  assert.equal(porEmail.data.conversa.cliente.telefone, null, 'não revela o telefone guardado pelo clube');

  const porTelefone = await sup.req('POST', `/api/t/${loja.slug}/conversas`, {
    canal: 'whatsapp', telefone: '21966664321',
  });
  assert.equal(porTelefone.status, 201, JSON.stringify(porTelefone.data));
  assert.equal(porTelefone.data.conversa.cliente.telefone, '5521966664321', 'retorna o telefone informado nesta operação');
  assert.equal(porTelefone.data.conversa.cliente.nome, null, 'não revela o nome guardado pelo clube');
  assert.equal(porTelefone.data.conversa.cliente.email, null, 'não revela o e-mail guardado pelo clube');

  const detalheTelefone = await sup.req('GET', `/api/t/${loja.slug}/conversas/${porTelefone.data.conversa.id}`);
  assert.equal(detalheTelefone.data.conversa.cliente.nome, null);
  assert.equal(detalheTelefone.data.conversa.cliente.email, null);
  const lista = await sup.req('GET', `/api/t/${loja.slug}/conversas`);
  const conversaListada = lista.data.conversas.find((c) => c.id === porEmail.data.conversa.id);
  assert.equal(conversaListada.cliente.nome, null, 'a lista também usa apenas os dados locais');
  assert.equal(conversaListada.cliente.telefone, null);

  const repoLoja = scoped(P.db, loja.id);
  const vinculoEmail = P.db.prepare('SELECT lead_id FROM conversations WHERE id = ?').get(porEmail.data.conversa.id);
  const vinculoTelefone = P.db.prepare('SELECT lead_id FROM conversations WHERE id = ?').get(porTelefone.data.conversa.id);
  assert.ok(vinculoEmail.lead_id, 'a conversa cria relação local com o contato');
  assert.ok(vinculoTelefone.lead_id, 'a conversa cria relação local com o contato');
  const leadEmail = repoLoja.get('leads', vinculoEmail.lead_id);
  const leadTelefone = repoLoja.get('leads', vinculoTelefone.lead_id);
  assert.equal(leadEmail.contact_id, segredoEmail);
  assert.equal(leadEmail.email, 'email-segredo@clube.test');
  assert.equal(leadEmail.name, null, 'o lead local não copia o nome global');
  assert.equal(leadEmail.phone, null, 'o lead local não copia o telefone global');
  assert.equal(leadTelefone.contact_id, segredoTelefone);
  assert.equal(leadTelefone.phone, '5521966664321');
  assert.equal(leadTelefone.email, null, 'o lead local não copia o e-mail global');
  assert.equal(leadTelefone.name, null, 'o lead local não copia o nome global');
  assert.equal(leadEmail.consent, 0, 'abrir conversa não concede consentimento de marketing');
  assert.equal(repoLoja.count('leads', { contact_id: segredoEmail }), 1, 'não duplica a relação local');
  assert.equal(repoLoja.count('leads', { contact_id: segredoTelefone }), 1, 'não duplica a relação local');
});

test('status, atendente e notas internas entram no histórico', async () => {
  const conversa = (await sup.req('POST', `/api/t/${clube.slug}/conversas`, { canal: 'site', email: 'fluxo@conversas.test', nome: 'Fluxo', assunto: 'Atendimento' })).data.conversa;
  const semMensagem = P.db.prepare('SELECT last_message_at FROM conversations WHERE id = ?').get(conversa.id).last_message_at;
  assert.ok(semMensagem, 'conversa recém-criada já tem last_message_at');

  P.db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', conversa.id);
  let r = await sup.req('PATCH', `/api/t/${clube.slug}/conversas/${conversa.id}`, { status: 'resolvida', atendente: users.atendente, nota: 'Resolvido no telefone' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.conversa.status, 'resolvida');
  assert.equal(r.data.conversa.atendente, users.atendente);
  assert.equal(r.data.mudou, true);
  assert.notEqual(P.db.prepare('SELECT last_message_at FROM conversations WHERE id = ?').get(conversa.id).last_message_at, '2000-01-01T00:00:00.000Z');

  r = await sup.req('PATCH', `/api/t/${clube.slug}/conversas/${conversa.id}`, { status: 'resolvida', atendente: users.atendente });
  assert.equal(r.data.mudou, false, 'repetir o mesmo valor não inventa histórico');

  for (const invalido of [{ status: 'arquivada' }, { atendente: users.afiliada }, { atendente: users.donaLoja }, { atendente: 'usuario-inexistente' }]) {
    const ruim = await sup.req('PATCH', `/api/t/${clube.slug}/conversas/${conversa.id}`, invalido);
    assert.equal(ruim.status, 400, `deve recusar ${JSON.stringify(invalido)}`);
  }

  P.db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', conversa.id);
  const nota = await sup.req('POST', `/api/t/${clube.slug}/conversas/${conversa.id}/mensagens`, { texto: 'Cliente pediu retorno amanhã', direcao: 'nota' });
  assert.equal(nota.status, 201);
  assert.equal(nota.data.mensagem.interna, true);
  assert.equal(nota.data.conversa.status, 'resolvida', 'nota interna não reabre a conversa');
  assert.notEqual(nota.data.conversa.ultimaEm, '2000-01-01T00:00:00.000Z', 'nota interna também atualiza last_message_at');

  P.db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', conversa.id);
  const notaSozinha = await sup.req('PATCH', `/api/t/${clube.slug}/conversas/${conversa.id}`, { nota: 'Nota sem outra alteração' });
  assert.equal(notaSozinha.status, 200);
  assert.equal(notaSozinha.data.mudou, true, 'nota sem outra mudança é registrada');
  assert.notEqual(notaSozinha.data.conversa.ultimaEm, '2000-01-01T00:00:00.000Z');

  const resposta = await sup.req('POST', `/api/t/${clube.slug}/conversas/${conversa.id}/mensagens`, { texto: 'Boa tarde, já verifiquei', direcao: 'saida' });
  assert.equal(resposta.status, 201);
  assert.equal(resposta.data.mensagem.status, 'pendente_envio', 'o painel não envia: fica pendente até existir integração');
  assert.match(resposta.data.aviso, /pendente de envio/);

  const detalhe = (await sup.req('GET', `/api/t/${clube.slug}/conversas/${conversa.id}`)).data;
  assert.deepEqual(detalhe.eventos.map((e) => e.tipo).sort(), ['aberta', 'atendente', 'nota', 'status']);
  assert.ok(detalhe.eventos.some((e) => e.tipo === 'nota' && e.dados.nota === 'Nota sem outra alteração'));
  const evento = detalhe.eventos.find((e) => e.tipo === 'status');
  assert.deepEqual(evento.dados, { de: 'aberta', para: 'resolvida', nota: 'Resolvido no telefone' });
  assert.equal(detalhe.mensagens.length, 2);

  // sem o id de conversa do canal, mensagem nova depois de resolvida abre outro atendimento e não mexe no que foi fechado
  const volta = await hook(clube.slug, { canal: 'site', id_externo: 'site-1', texto: 'Voltei', email: 'fluxo@conversas.test' }, segredoDe(clube.id));
  assert.equal(volta.status, 201);
  assert.notEqual(volta.data.conversa, conversa.id, 'atendimento resolvido continua resolvido');
  const atendimentoNovo = (await sup.req('GET', `/api/t/${clube.slug}/conversas/${volta.data.conversa}`)).data.conversa;
  assert.equal(atendimentoNovo.cliente.email, 'fluxo@conversas.test', 'mesma pessoa da base única');
  assert.equal((await sup.req('GET', `/api/t/${clube.slug}/conversas/${conversa.id}`)).data.conversa.status, 'resolvida');

  // quando o canal manda o id da conversa dele, o fio é o mesmo e a mensagem do cliente reabre o atendimento
  const fio = (await sup.req('GET', `/api/t/${clube.slug}/conversas?canal=telegram`)).data.conversas.find((c) => c.idExterno === 'tg-chat-1');
  await sup.req('PATCH', `/api/t/${clube.slug}/conversas/${fio.id}`, { status: 'resolvida', lida: true });
  const seguimento = await hook(clube.slug, { canal: 'telegram', id_externo: 'tg-3', conversa_externa: 'tg-chat-1', texto: 'Mais uma', telefone: '11952138293' }, segredoDe(clube.id));
  assert.equal(seguimento.data.conversa, fio.id, 'o id da conversa no canal mantém o mesmo fio');
  const reaberta = (await sup.req('GET', `/api/t/${clube.slug}/conversas/${fio.id}`)).data.conversa;
  assert.equal(reaberta.status, 'aberta', 'mensagem do cliente reabre o atendimento resolvido');
  assert.equal(reaberta.naoLidas, 1);

  const lida = await sup.req('PATCH', `/api/t/${clube.slug}/conversas/${fio.id}`, { lida: true });
  assert.equal(lida.data.conversa.naoLidas, 0);
});

test('filtros e busca da caixa de entrada', async () => {
  const lista = async (qs) => (await sup.req('GET', `/api/t/${clube.slug}/conversas${qs}`)).data;

  const todas = await lista('');
  assert.ok(todas.totais.todas >= 4);
  assert.ok(todas.atendentes.some((u) => u.id === users.atendente));
  assert.ok(!todas.atendentes.some((u) => u.id === users.afiliada), 'afiliado não atende');

  const porCanal = await lista('?canal=telegram');
  assert.ok(porCanal.conversas.length >= 1);
  assert.ok(porCanal.conversas.every((c) => c.canal === 'telegram'));

  const semAtendente = await lista('?atendente=sem');
  assert.ok(semAtendente.conversas.every((c) => !c.atendente));

  const doAtendente = await lista(`?atendente=${users.atendente}`);
  assert.ok(doAtendente.conversas.length >= 1);
  assert.ok(doAtendente.conversas.every((c) => c.atendente === users.atendente));

  const busca = await lista('?q=fluxo%40conversas.test');
  assert.ok(busca.conversas.length >= 1);
  assert.ok(busca.conversas.every((c) => c.cliente?.email === 'fluxo@conversas.test'));

  assert.equal((await sup.req('GET', `/api/t/${clube.slug}/conversas?status=arquivada`)).status, 400);
  assert.equal((await sup.req('GET', `/api/t/${clube.slug}/conversas?canal=fax`)).status, 400);
});

test('estado exibido para cada canal acompanha a linha real de integrations', async () => {
  const repo = scoped(P.db, clube.id);
  const antes = (await sup.req('GET', `/api/t/${clube.slug}/conversas`)).data.canaisIntegracao;
  assert.equal(antes.telegram.status, 'pendente', 'Telegram começa pendente no registro real da operação');
  assert.equal(antes.telegram.configurada, false);
  assert.equal(antes.whatsapp.kind, 'whatsapp');
  assert.equal(antes.whatsapp.status, 'pendente', 'sem registro de WhatsApp continua pendente');
  assert.equal(antes.site.kind, null, 'site não é integração de canal externo');

  const integration = repo.get('integrations', { kind: 'telegram' });
  assert.ok(integration);
  P.db.prepare("UPDATE integrations SET status = 'ativo' WHERE tenant_id = ? AND kind = 'telegram'").run(clube.id);
  try {
    const depois = (await sup.req('GET', `/api/t/${clube.slug}/conversas`)).data.canaisIntegracao;
    assert.equal(depois.telegram.status, 'ativo');
    assert.equal(depois.telegram.configurada, true);
    const conversa = (await sup.req('POST', `/api/t/${clube.slug}/conversas`, {
      canal: 'telegram', email: 'telegram-estado@conversas.test', nome: 'Estado Telegram',
    })).data.conversa;
    const resposta = await sup.req('POST', `/api/t/${clube.slug}/conversas/${conversa.id}/mensagens`, {
      direcao: 'saida', texto: 'Resposta de teste',
    });
    assert.equal(resposta.data.mensagem.status, 'pendente_envio', 'o painel ainda não envia mesmo com integração conectada');
    assert.match(resposta.data.aviso, /integração está conectada/);
  } finally {
    P.db.prepare('UPDATE integrations SET status = ? WHERE tenant_id = ? AND kind = ?').run(integration.status, clube.id, 'telegram');
  }
});

test('afiliado não entra na caixa de entrada e editor não escreve', async () => {
  const conversa = (await sup.req('GET', `/api/t/${clube.slug}/conversas`)).data.conversas[0];

  const afiliada = client(P.origin);
  await afiliada.login('afiliada@conversas.test', 'afiliada-senha-123');
  for (const caminho of ['/conversas', '/conversas/atendentes', `/conversas/${conversa.id}`]) {
    const bloqueada = await afiliada.req('GET', `/api/t/${clube.slug}${caminho}`);
    assert.equal(bloqueada.status, 403, `afiliado não lê ${caminho}`);
  }
  assert.equal((await afiliada.req('POST', `/api/t/${clube.slug}/conversas/${conversa.id}/mensagens`, { texto: 'oi', direcao: 'saida' })).status, 403);

  await sup.req('POST', `/api/t/${clube.slug}/users`, { email: 'editor@conversas.test', name: 'Editor Clube', role: 'editor', password: 'editor-senha-123' });
  const editor = client(P.origin);
  await editor.login('editor@conversas.test', 'editor-senha-123');
  assert.equal((await editor.req('GET', `/api/t/${clube.slug}/conversas`)).status, 403, 'editor não tem leads.read');
});
