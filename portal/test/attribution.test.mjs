import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPortal, client, sign } from './helpers.mjs';

let P;
let sup;
let tenant;
let secret;
let afiliadaAna;
let afiliadaBia;
let site;

before(async () => {
  P = await startPortal();
  sup = client(P.origin);
  await sup.login('super@teste.local', 'senha-forte-123');

  const criada = await sup.req('POST', '/api/tenants', {
    name: 'Clube de Teste PA-021', number: '92021', niche: 'poker', template: 'clube-poker-premium',
  });
  assert.equal(criada.status, 201, JSON.stringify(criada.data));
  tenant = criada.data.tenant;
  secret = P.db.prepare('SELECT webhook_secret FROM tenants WHERE id = ?').get(tenant.id).webhook_secret;
  site = (await sup.req('GET', `/api/t/${tenant.slug}/sites`)).data.sites[0];

  await sup.req('POST', `/api/t/${tenant.slug}/affiliates`, { name: 'Ana Afiliada', code: 'ana' });
  await sup.req('POST', `/api/t/${tenant.slug}/affiliates`, { name: 'Bia Afiliada', code: 'bia' });
  afiliadaAna = P.db.prepare('SELECT id FROM affiliates WHERE tenant_id = ? AND code = ?').get(tenant.id, 'ana');
  afiliadaBia = P.db.prepare('SELECT id FROM affiliates WHERE tenant_id = ? AND code = ?').get(tenant.id, 'bia');
});

after(() => P?.close());

function criarClique(id, affiliateId, createdAt) {
  P.db.prepare(`INSERT INTO clicks (id, tenant_id, affiliate_id, utm, created_at)
    VALUES (?, ?, ?, '{}', ?)`).run(id, tenant.id, affiliateId, createdAt);
}

async function enviarConversao(payload, assinatura = sign(secret, JSON.stringify(payload))) {
  const body = JSON.stringify(payload);
  return fetch(`${P.origin}/api/hooks/${tenant.slug}/conversion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Portal-Signature': assinatura },
    body,
  });
}

test('assinatura inválida recebe 401 e não grava conversão', async () => {
  const resposta = await enviarConversao({ source: 'gateway', external_id: 'assinatura-invalida', kind: 'compra' }, 'sha256=00');

  assert.equal(resposta.status, 401);
  assert.equal(P.db.prepare('SELECT COUNT(*) AS total FROM conversions WHERE tenant_id = ?').get(tenant.id).total, 0);
});

test('reenvio do mesmo external_id mantém uma única conversão', async () => {
  const primeiroPayload = { source: 'gateway', external_id: 'evento-repetido', kind: 'compra', value_cents: 1000 };
  const primeira = await enviarConversao(primeiroPayload);
  const primeiraResposta = await primeira.json();
  const segunda = await enviarConversao({ ...primeiroPayload, value_cents: 9000 });
  const segundaResposta = await segunda.json();

  assert.equal(primeira.status, 201);
  assert.equal(segunda.status, 200);
  assert.equal(segundaResposta.duplicate, true);
  assert.equal(segundaResposta.id, primeiraResposta.id);
  assert.equal(P.db.prepare('SELECT COUNT(*) AS total FROM conversions WHERE tenant_id = ? AND source = ? AND external_id = ?')
    .get(tenant.id, 'gateway', 'evento-repetido').total, 1);
});

test('clique fora da janela não recebe crédito de afiliado', async () => {
  const cliqueId = 'clique-fora-janela';
  criarClique(cliqueId, afiliadaAna.id, new Date(Date.now() - 31 * 864e5).toISOString());

  const resposta = await enviarConversao({
    source: 'gateway', external_id: 'evento-fora-janela', kind: 'compra', click_id: cliqueId,
  });
  const dados = await resposta.json();
  const conversao = P.db.prepare('SELECT affiliate_id FROM conversions WHERE tenant_id = ? AND source = ? AND external_id = ?')
    .get(tenant.id, 'gateway', 'evento-fora-janela');

  assert.equal(resposta.status, 201);
  assert.equal(dados.affiliate, false);
  assert.equal(conversao.affiliate_id, null);
});

test('o último clique da navegação é herdado pelo lead', async () => {
  const visitante = client(P.origin);
  let resposta = await visitante.req('GET', `/r/${tenant.slug}/ana`);
  assert.equal(resposta.status, 302);
  resposta = await visitante.req('GET', `/r/${tenant.slug}/bia`);
  assert.equal(resposta.status, 302);

  const formulario = new URLSearchParams({
    email: 'ultimo-clique@teste.local', name: 'Visitante de Teste', consent: '1', page: '', utm_source: 'afiliado',
  });
  resposta = await visitante.req('POST', `/f/${site.id}`, formulario, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  assert.equal(resposta.status, 201, JSON.stringify(resposta.data));

  const leads = (await sup.req('GET', `/api/t/${tenant.slug}/leads`)).data.leads;
  const lead = leads.find((item) => item.email === 'ultimo-clique@teste.local');
  assert.equal(lead?.affiliate, 'Bia Afiliada');
});

test('webhook antigo recebido depois não usa um clique que ocorreu no futuro', async () => {
  const instanteClique = Date.now() - 2 * 60 * 60_000;
  const cliqueId = 'clique-eventos-fora-de-ordem';
  criarClique(cliqueId, afiliadaBia.id, new Date(instanteClique).toISOString());

  const eventoNovo = await enviarConversao({
    source: 'gateway', external_id: 'evento-novo', kind: 'compra', click_id: cliqueId,
    occurred_at: new Date(instanteClique + 60 * 60_000).toISOString(),
  });
  const dadosNovos = await eventoNovo.json();
  const eventoAntigo = await enviarConversao({
    source: 'gateway', external_id: 'evento-antigo', kind: 'compra', click_id: cliqueId,
    occurred_at: new Date(instanteClique - 60 * 60_000).toISOString(),
  });
  const dadosAntigos = await eventoAntigo.json();

  assert.equal(eventoNovo.status, 201);
  assert.equal(dadosNovos.affiliate, true);
  assert.equal(eventoAntigo.status, 201);
  assert.equal(dadosAntigos.affiliate, false);
});
