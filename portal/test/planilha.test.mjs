// Cópia dos leads na planilha do Google, por operação: URL só no cofre, mesmos campos do suprema.blog (jornada na
// coluna de indicação), uma vez por lead, falha que não atrapalha o lead, estado real, reenvio, permissões e isolamento.
// Nenhuma chamada sai de verdade: o fetch é falso.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPortal, client } from './helpers.mjs';
import { linhaDoLead, mascarar } from '../lib/modules/planilha.mjs';

const URL_A = `https://script.google.com/macros/s/AKfyTESTE${'a'.repeat(40)}Zz9/exec`;
const URL_B = `https://script.google.com/macros/s/AKfyOUTRA${'b'.repeat(40)}Yy8/exec`;
let P;
let sup;
let site;
let chamadas = [];
let falhar = false;

const esperar = async (cond, ms = 3000) => {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (cond()) return true; await new Promise((r) => setTimeout(r, 20)); }
  return false;
};
const lead = (corpo, s = site) => fetch(`${P.url}/f/${s.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ consent: '1', page: 'inicio', ...corpo }) });

before(async () => {
  P = await startPortal({
    fetchImpl: async (url, init = {}) => {
      chamadas.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
      if (falhar) return { status: 500, text: async () => 'erro do Google' };
      return { status: 200, text: async () => JSON.stringify(init.method === 'GET' ? { ok: true, servico: 'teste' } : { ok: true }) };
    },
  });
  P.app.planilhaEsperaMs = 0;
  sup = client(P.url);
  await sup.login('super@teste.local', 'senha-forte-123');
  await sup.req('POST', '/api/tenants', { name: 'Clube Planilha', number: '10080', niche: 'poker', template: 'clube-poker-premium' });
  await sup.req('POST', '/api/tenants', { name: 'Clube Vizinho', number: '10081', niche: 'poker', template: 'clube-poker-premium' });
  site = (await sup.req('GET', '/api/t/clube-10080/sites')).data.sites[0];
});
after(() => P.close());

test('sem URL a integração fica pendente e o lead não chama ninguém', async () => {
  const d = (await sup.req('GET', '/api/t/clube-10080/planilha')).data;
  assert.equal(d.estado, 'pendente');
  assert.equal(d.temUrl, false);
  const r = await lead({ email: 'sem-planilha@exemplo.com' });
  assert.equal(r.status, 201);
  await new Promise((res) => setTimeout(res, 80));
  assert.equal(chamadas.length, 0);
  const i = (await sup.req('GET', '/api/t/clube-10080/integrations')).data.integrations.find((x) => x.kind === 'google_sheets');
  assert.equal(i.status, 'pendente', 'a planilha aparece em Integrações com o estado real');
});

test('a URL é validada, vai para o cofre e nunca volta inteira', async () => {
  let r = await sup.req('PUT', '/api/t/clube-10080/planilha', { url: 'https://exemplo.com/webhook' });
  assert.equal(r.status, 400);
  r = await sup.req('PUT', '/api/t/clube-10080/planilha', { url: URL_A });
  assert.equal(r.status, 200);
  assert.equal(r.data.estado, 'gravado');
  assert.equal(r.data.urlMascarada, mascarar(URL_A));
  assert.ok(!JSON.stringify(r.data).includes(URL_A));
  const row = P.db.prepare("SELECT * FROM integrations WHERE kind = 'google_sheets' AND tenant_id = (SELECT id FROM tenants WHERE slug = 'clube-10080')").get();
  assert.ok(row.secret && !row.secret.includes('script.google.com'), 'só o selo do cofre fica no banco');
  assert.ok(!JSON.stringify((await sup.req('GET', '/api/t/clube-10080/integrations')).data).includes(URL_A));
});

test('testar faz só um GET (não escreve linha) e marca conectada', async () => {
  chamadas = [];
  const r = await sup.req('POST', '/api/t/clube-10080/planilha/teste');
  assert.equal(r.data.ok, true);
  assert.equal(r.data.estado, 'conectado');
  assert.deepEqual(chamadas.map((c) => c.method), ['GET']);
});

test('cada lead novo vai uma vez, com os campos do suprema.blog e a jornada na indicação', async () => {
  chamadas = [];
  const jid = '11111111-2222-3333-4444-555555555555';
  const r = await lead({ email: 'Lead@Exemplo.com', phone: '(11) 91234-5678', utm_source: 'insta', utm_campaign: 'nov', journey_id: jid, variant: 'b' });
  assert.equal(r.status, 201);
  assert.ok(await esperar(() => chamadas.length === 1));
  const c = chamadas[0];
  assert.equal(c.url, URL_A);
  assert.equal(c.method, 'POST');
  assert.deepEqual(Object.keys(c.body), ['tipo', 'id', 'createdAt', 'email', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'ref', 'landing', 'referrer', 'whatsapp']);
  assert.equal(c.body.tipo, 'cadastro');
  assert.equal(c.body.email, 'lead@exemplo.com');
  assert.equal(c.body.utm_source, 'insta');
  assert.equal(c.body.ref, 'jornada-b');
  assert.equal(c.body.landing, '/inicio');
  assert.equal(c.body.whatsapp, '11912345678');
  assert.ok(await esperar(() => P.db.prepare("SELECT data FROM lead_events WHERE kind = 'planilha' AND lead_id = ?").get(c.body.id)?.data.includes('salvo')));
  // o gancho de novo para o mesmo lead não manda de novo
  const { onLead } = await import('../lib/modules/planilha.mjs');
  const { scoped } = await import('../lib/repo.mjs');
  const repo = scoped(P.db, P.db.prepare("SELECT id FROM tenants WHERE slug = 'clube-10080'").get().id);
  await onLead({ app: P.app, repo, lead: repo.get('leads', c.body.id) });
  assert.equal(chamadas.length, 1, 'uma vez por lead');
});

test('falha da planilha não atrapalha o lead, aparece na tela e pode ser reenviada', async () => {
  chamadas = [];
  falhar = true;
  const r = await lead({ email: 'falha@exemplo.com' });
  assert.equal(r.status, 201, 'o lead entra mesmo com a planilha fora');
  assert.ok(await esperar(() => chamadas.length === 3), 'tenta 3 vezes');
  let d;
  assert.ok(await esperar(() => { d = P.db.prepare("SELECT status, last_error FROM integrations WHERE kind = 'google_sheets' AND tenant_id = (SELECT id FROM tenants WHERE slug = 'clube-10080')").get(); return d.status === 'erro'; }));
  assert.match(d.last_error, /500/);
  assert.ok(!d.last_error.includes('script.google.com'), 'o erro não mostra a URL');
  const tela = (await sup.req('GET', '/api/t/clube-10080/planilha')).data;
  assert.equal(tela.estado, 'erro');
  assert.equal(tela.envios.erros, 1);
  assert.ok(P.db.prepare('SELECT 1 FROM leads WHERE email = ?').get('falha@exemplo.com'), 'o lead está no CRM');
  falhar = false;
  const re = await sup.req('POST', '/api/t/clube-10080/planilha/reenviar');
  assert.equal(re.data.tentados, 1);
  assert.equal(re.data.salvos, 1);
  assert.equal(re.data.estado, 'conectado');
  assert.equal(re.data.envios.erros, 0);
});

test('o cadastro da jornada também vai para a planilha com a variante', async () => {
  await sup.req('PATCH', '/api/t/clube-10080', { settings: { inviteLink: 'https://convite.exemplo.com' } });
  const j = (await sup.req('POST', '/api/t/clube-10080/journeys', { preset: 'cadastro-app-fichas24h' })).data.journey.id;
  await sup.req('POST', `/api/t/clube-10080/journeys/${j}/status`, { status: 'rodando' });
  chamadas = [];
  const r = await fetch(`${P.url}/s/${site.slug}/cad/${j}/inicio`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'cad@exemplo.com', password: 'Zebra@7788', consent: 1, variant: 'a', utm: { utm_source: 'tiktok' } }) });
  assert.equal(r.status, 201);
  assert.ok(await esperar(() => chamadas.length === 1));
  assert.equal(chamadas[0].body.ref, 'jornada-a');
  assert.equal(chamadas[0].body.utm_source, 'tiktok');
  assert.ok(!JSON.stringify(chamadas[0].body).includes('Zebra@7788'), 'a senha nunca vai para a planilha');
});

test('isolamento: o lead de outra operação vai para a planilha dela, não para esta', async () => {
  await sup.req('PUT', '/api/t/clube-10081/planilha', { url: URL_B });
  const vizinho = (await sup.req('GET', '/api/t/clube-10081/sites')).data.sites[0];
  chamadas = [];
  await lead({ email: 'vizinho@exemplo.com' }, vizinho);
  assert.ok(await esperar(() => chamadas.length === 1));
  assert.equal(chamadas[0].url, URL_B);
});

test('permissões: marketing vê o estado mas não grava a URL', async () => {
  await sup.req('POST', '/api/t/clube-10080/users', { email: 'mkt-pl@teste.com', role: 'marketing', password: 'marketing-senha-9' });
  const mkt = client(P.url);
  await mkt.login('mkt-pl@teste.com', 'marketing-senha-9');
  assert.equal((await mkt.req('GET', '/api/t/clube-10080/planilha')).status, 200);
  assert.equal((await mkt.req('PUT', '/api/t/clube-10080/planilha', { url: URL_B })).status, 403);
  assert.equal((await mkt.req('POST', '/api/t/clube-10080/planilha/reenviar')).status, 403);
});

test('linha da planilha: telefone sem DDI e indicação junta ref e jornada', () => {
  const l = linhaDoLead({ id: 'x', created_at: '2026-11-06T10:00:00.000Z', email: 'a@b.com', page_slug: '', phone: '+5511987654321', utm: JSON.stringify({ ref: 'amigo', variante: 'a' }) });
  assert.equal(l.whatsapp, '11987654321');
  assert.equal(l.ref, 'amigo · jornada-a');
  assert.equal(l.landing, '/');
});
