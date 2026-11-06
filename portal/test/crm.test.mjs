// CRM: funil por etapas, responsáveis da operação, histórico e exportação CSV.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPortal, client } from './helpers.mjs';
import { scoped } from '../lib/repo.mjs';

let P;
let sup;
let clube;
let loja;
let leads;
let users;

before(async () => {
  P = await startPortal();
  sup = client(P.origin);
  await sup.login('super@teste.local', 'senha-forte-123');

  clube = (await sup.req('POST', '/api/tenants', { name: 'Clube CRM', number: '10002', niche: 'poker' })).data.tenant;
  loja = (await sup.req('POST', '/api/tenants', { name: 'Loja CRM', number: '30001', niche: 'loja' })).data.tenant;

  await sup.req('POST', `/api/t/${clube.slug}/users`, { email: 'gestora@crm.test', name: 'Gestora CRM', role: 'marketing', password: 'gestora-senha-123' });
  await sup.req('POST', `/api/t/${clube.slug}/users`, { email: 'afiliada@crm.test', name: 'Afiliada CRM', role: 'affiliate', password: 'afiliada-senha-123' });
  await sup.req('POST', `/api/t/${loja.slug}/users`, { email: 'dono@loja-crm.test', name: 'Dono Loja CRM', role: 'admin', password: 'dono-senha-123' });

  users = {
    gestora: P.db.prepare('SELECT id FROM users WHERE email = ?').get('gestora@crm.test').id,
    afiliada: P.db.prepare('SELECT id FROM users WHERE email = ?').get('afiliada@crm.test').id,
    donoLoja: P.db.prepare('SELECT id FROM users WHERE email = ?').get('dono@loja-crm.test').id,
  };

  const crm = scoped(P.db, clube.id);
  const outraOperacao = scoped(P.db, loja.id);
  leads = {
    etapa: crm.insert('leads', { id: 'lead-crm-etapa', email: 'etapa@crm.test', name: 'Lead Etapa', stage: 'novo' }),
    responsavel: crm.insert('leads', { id: 'lead-crm-responsavel', email: 'responsavel@crm.test', name: 'Lead Responsável', stage: 'novo' }),
    csv: crm.insert('leads', { id: 'lead-crm-csv', email: 'csv@crm.test', name: '=2+2, "Teste"', stage: 'novo' }),
    csvLoja: outraOperacao.insert('leads', { id: 'lead-loja-csv', email: 'loja@crm.test', name: 'Lead da Loja', stage: 'novo' }),
  };
});

after(() => P.close());

test('módulo CRM aparece no painel e serve a tela do funil', async () => {
  const meta = await sup.req('GET', '/api/meta');
  assert.ok(meta.data.modules.some((m) => m.id === 'crm'), 'módulo CRM disponível no menu');

  const tela = await sup.req('GET', '/admin/modules/crm.js', undefined, { raw: true });
  assert.equal(tela.status, 200);
  assert.match(tela.data, /Funil/);
});

test('mudança real de etapa grava lead_event e mantém compatibilidade com o CRM do núcleo', async () => {
  let r = await sup.req('PATCH', `/api/t/${clube.slug}/crm/leads/${leads.etapa.id}/etapa`, { stage: 'contato', note: 'Retorno solicitado' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.lead.stage, 'contato');
  assert.equal(r.data.changed, true);

  let detalhe = (await sup.req('GET', `/api/t/${clube.slug}/leads/${leads.etapa.id}`)).data;
  let evento = detalhe.events.find((e) => e.kind === 'etapa');
  assert.ok(evento, 'a etapa nova tem evento próprio no histórico');
  assert.deepEqual(evento.data, { de: 'novo', para: 'contato', nota: 'Retorno solicitado' });

  const quantidade = detalhe.events.length;
  r = await sup.req('PATCH', `/api/t/${clube.slug}/crm/leads/${leads.etapa.id}/etapa`, { stage: 'contato' });
  assert.equal(r.status, 200);
  assert.equal(r.data.changed, false, 'repetir a etapa não cria evento falso');
  detalhe = (await sup.req('GET', `/api/t/${clube.slug}/leads/${leads.etapa.id}`)).data;
  assert.equal(detalhe.events.length, quantidade);

  r = await sup.req('PATCH', `/api/t/${clube.slug}/leads/${leads.etapa.id}`, { stage: 'qualificado' });
  assert.equal(r.status, 200);
  detalhe = (await sup.req('GET', `/api/t/${clube.slug}/leads/${leads.etapa.id}`)).data;
  evento = detalhe.events.find((e) => e.kind === 'edicao');
  assert.ok(evento, 'a rota legada também registra a mudança de etapa');
  assert.equal(evento.data.de.stage, 'contato');
  assert.equal(evento.data.para.stage, 'qualificado');
});

test('responsável precisa pertencer à equipe da operação e cada troca entra no histórico', async () => {
  const lista = await sup.req('GET', `/api/t/${clube.slug}/crm/responsaveis`);
  assert.equal(lista.status, 200);
  assert.ok(lista.data.responsaveis.some((u) => u.id === users.gestora));
  assert.ok(!lista.data.responsaveis.some((u) => u.id === users.afiliada), 'afiliados não são responsáveis internos do CRM');
  assert.ok(!lista.data.responsaveis.some((u) => u.id === users.donoLoja), 'a lista respeita a operação');

  let r = await sup.req('PATCH', `/api/t/${clube.slug}/crm/leads/${leads.responsavel.id}/responsavel`, { ownerId: '   ' });
  assert.equal(r.status, 200);
  assert.equal(r.data.changed, false, 'responsável em branco normaliza para sem responsável');
  assert.equal(r.data.lead.owner_id, null);
  assert.equal((await sup.req('GET', `/api/t/${clube.slug}/leads/${leads.responsavel.id}`)).data.events.length, 0);

  r = await sup.req('PATCH', `/api/t/${clube.slug}/crm/leads/${leads.responsavel.id}/responsavel`, { ownerId: users.gestora });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.lead.owner_id, users.gestora);
  assert.equal(r.data.changed, true);

  let detalhe = (await sup.req('GET', `/api/t/${clube.slug}/leads/${leads.responsavel.id}`)).data;
  let evento = detalhe.events.find((e) => e.kind === 'responsavel');
  assert.ok(evento);
  assert.deepEqual(evento.data, { de: null, para: users.gestora });

  const quantidade = detalhe.events.length;
  r = await sup.req('PATCH', `/api/t/${clube.slug}/crm/leads/${leads.responsavel.id}/responsavel`, { ownerId: users.gestora });
  assert.equal(r.status, 200);
  assert.equal(r.data.changed, false);
  detalhe = (await sup.req('GET', `/api/t/${clube.slug}/leads/${leads.responsavel.id}`)).data;
  assert.equal(detalhe.events.length, quantidade);

  for (const ownerId of [users.afiliada, users.donoLoja, 'usuario-inexistente']) {
    r = await sup.req('PATCH', `/api/t/${clube.slug}/crm/leads/${leads.responsavel.id}/responsavel`, { ownerId });
    assert.equal(r.status, 400, `responsável inválido deve ser recusado: ${ownerId}`);
  }
  r = await sup.req('PATCH', `/api/t/${clube.slug}/crm/leads/${leads.csvLoja.id}/responsavel`, { ownerId: users.gestora });
  assert.equal(r.status, 404, 'lead de outra operação não existe neste escopo');
});

test('CSV exporta só a operação, escapa dados e barra acesso de afiliado', async () => {
  const crm = scoped(P.db, clube.id);
  let afiliadoAntigo;
  for (let i = 0; i < 501; i++) {
    const afiliado = crm.insert('affiliates', { name: `Afiliado ${i}`, code: `afiliado-${i}`, status: 'ativo' });
    if (i === 0) afiliadoAntigo = afiliado;
  }
  crm.update('leads', leads.csv.id, { affiliate_id: afiliadoAntigo.id });

  const respostaCsv = await fetch(`${P.origin}/api/t/${clube.slug}/leads.csv`, { headers: { Cookie: sup.cookie } });
  assert.equal(respostaCsv.status, 200);
  assert.match(respostaCsv.headers.get('content-type'), /text\/csv; charset=utf-8/i);
  assert.match(respostaCsv.headers.get('content-disposition'), /attachment; filename="leads-clube-10002\.csv"/i);
  const csv = Buffer.from(await respostaCsv.arrayBuffer()).toString('utf8');
  assert.equal(csv.charCodeAt(0), 0xFEFF, 'CSV inclui BOM para leitores de planilha');
  assert.match(csv, /csv@crm\.test/);
  assert.match(csv, /Afiliado 0/, 'o CSV associa afiliados mesmo acima do limite padrão da listagem');
  assert.doesNotMatch(csv, /loja@crm\.test/, 'exportação não atravessa operações');
  assert.match(csv, /"'=2\+2, ""Teste"""/, 'campo com fórmula recebe prefixo seguro e aspas CSV');

  const dono = client(P.origin);
  await dono.login('dono@loja-crm.test', 'dono-senha-123');
  const cruzada = await dono.req('GET', `/api/t/${clube.slug}/leads.csv`, undefined, { raw: true });
  assert.equal(cruzada.status, 404, 'usuário de outra operação não acessa o CRM');

  const afiliada = client(P.origin);
  await afiliada.login('afiliada@crm.test', 'afiliada-senha-123');
  for (const path of [`/api/t/${clube.slug}/leads`, `/api/t/${clube.slug}/leads/${leads.csv.id}`, `/api/t/${clube.slug}/leads.csv`]) {
    const bloqueada = await afiliada.req('GET', path, undefined, { raw: path.endsWith('.csv') });
    assert.equal(bloqueada.status, 403, `afiliado não consulta leads pelo caminho ${path}`);
  }
});
