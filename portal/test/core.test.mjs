// Núcleo: Clube 10002 de ponta a ponta, isolamento entre operações, permissões, atribuição e webhook duplicado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPortal, client, sign } from './helpers.mjs';

let P;
let sup;
let clube;
let outra;

before(async () => {
  P = await startPortal();
  sup = client(P.origin);
  await sup.login('super@teste.local', 'senha-forte-123');
});
after(() => P.close());

test('superadmin cria o Clube 10002 com o modelo Clube de poker premium', async () => {
  const r = await sup.req('POST', '/api/tenants', { name: 'Clube Teste', number: '10002', niche: 'poker', template: 'clube-poker-premium',
    settings: { app: 'Suprema Poker', agentId: '999', whatsapp: '5511999990000', inviteLink: 'https://exemplo.com/convite' } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.tenant.label, 'Clube 10002');
  assert.equal(r.data.tenant.slug, 'clube-10002');
  clube = r.data;
  const sites = await sup.req('GET', '/api/t/clube-10002/sites');
  assert.equal(sites.data.sites.length, 1);
  assert.deepEqual(sites.data.sites[0].pages.map((p) => p.slug), ['', 'torneios', 'fichas', 'privacidade']);
  const home = sites.data.sites[0].pages[0];
  assert.match(JSON.stringify(home.draft), /Clube Teste/, 'placeholders preenchidos com os dados da operação');
  assert.doesNotMatch(JSON.stringify(home.draft), /\{\{/, 'nenhum {{placeholder}} sobra');
});

test('site só aparece depois de publicado; edição vira rascunho; versão pode ser restaurada', async () => {
  const site = (await sup.req('GET', '/api/t/clube-10002/sites')).data.sites[0];
  const home = site.pages[0];
  let r = await sup.req('GET', `/s/${site.slug}/`);
  assert.equal(r.status, 404, 'rascunho não é público');
  r = await sup.req('POST', `/api/t/clube-10002/pages/${home.id}/publish`);
  assert.equal(r.status, 200);
  r = await sup.req('GET', `/s/${site.slug}/`, undefined, { raw: true });
  assert.equal(r.status, 200);
  assert.match(r.data, /Clube Teste/);
  assert.match(r.data, /Somente maiores de 18 anos/);
  // bloco de texto novo no fim (não depende de qual bloco o modelo usa na primeira tela)
  const blocks = [...home.draft, { type: 'text', props: { title: 'Título <script>alert(1)</script> novo', body: '' } }];
  r = await sup.req('PUT', `/api/t/clube-10002/pages/${home.id}/draft`, { blocks });
  assert.equal(r.status, 200);
  assert.equal(r.data.page.dirty, true);
  r = await sup.req('GET', `/s/${site.slug}/`, undefined, { raw: true });
  assert.doesNotMatch(r.data, /Título/, 'público continua com a versão publicada');
  r = await sup.req('GET', `/api/t/clube-10002/pages/${home.id}/preview`, undefined, { raw: true });
  assert.match(r.data, /Título &lt;script&gt;alert\(1\)&lt;\/script&gt; novo/, 'prévia mostra o rascunho, com HTML escapado');
  const versions = (await sup.req('GET', `/api/t/clube-10002/pages/${home.id}`)).data.versions;
  const publicada = versions.find((v) => v.note === 'publicada');
  r = await sup.req('POST', `/api/t/clube-10002/pages/${home.id}/restore`, { versionId: publicada.id });
  assert.equal(r.status, 200);
  assert.doesNotMatch(JSON.stringify(r.data.page.draft), /Título/);
  const sitemap = await sup.req('GET', `/s/${site.slug}/sitemap.xml`, undefined, { raw: true });
  assert.match(sitemap.data, /<loc>/);
});

test('link de afiliado -> lead com origem -> conversão assinada e deduplicada', async () => {
  let r = await sup.req('POST', '/api/t/clube-10002/affiliates', { name: 'Ana Afiliada', code: 'ana' });
  assert.equal(r.status, 201);
  const visitante = client(P.origin);
  r = await visitante.req('GET', '/r/clube-10002/ana?utm_medium=instagram&utm_campaign=lancamento');
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location'), /\/s\/clube-10002\//);
  assert.match(visitante.cookie, /pa_clube10002=/);
  const site = (await sup.req('GET', '/api/t/clube-10002/sites')).data.sites[0];
  r = await visitante.req('POST', `/f/${site.id}`, new URLSearchParams({ email: 'jogador@teste.com', name: 'Jogador', consent: '1', page: '', utm_source: 'afiliado' }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const leads = (await sup.req('GET', '/api/t/clube-10002/leads')).data.leads;
  assert.equal(leads.length, 1);
  assert.equal(leads[0].affiliate, 'Ana Afiliada');
  assert.equal(leads[0].utm.utm_campaign, 'lancamento');

  const secret = P.db.prepare("SELECT webhook_secret s FROM tenants WHERE slug = 'clube-10002'").get().s;
  const body = JSON.stringify({ source: 'fichas', external_id: 'pedido-1', kind: 'primeiro_deposito', value_cents: 10000, email: 'jogador@teste.com' });
  const hook = (b, sig) => fetch(`${P.origin}/api/hooks/clube-10002/conversion`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Portal-Signature': sig }, body: b });
  let h = await hook(body, 'sha256=00');
  assert.equal(h.status, 401, 'assinatura inválida é recusada');
  h = await hook(body, sign(secret, body));
  assert.equal(h.status, 201);
  const first = await h.json();
  assert.equal(first.affiliate, true, 'crédito vai para a afiliada pelo clique do lead');
  h = await hook(body, sign(secret, body));
  assert.equal(h.status, 200);
  assert.equal((await h.json()).duplicate, true, 'reenvio não duplica');
  const conv = (await sup.req('GET', '/api/t/clube-10002/conversions')).data.conversions;
  assert.equal(conv.length, 1);
  assert.equal(conv[0].verified, 1);
});

test('clique fora da janela de atribuição não credita o afiliado', async () => {
  const t = P.db.prepare("SELECT id FROM tenants WHERE slug = 'clube-10002'").get();
  const aff = P.db.prepare("SELECT id FROM affiliates WHERE tenant_id = ? AND code = 'ana'").get(t.id);
  const old = new Date(Date.now() - 45 * 864e5).toISOString();
  P.db.prepare("INSERT INTO clicks (id, tenant_id, affiliate_id, utm, created_at) VALUES ('clique-velho', ?, ?, '{}', ?)").run(t.id, aff.id, old);
  const secret = P.db.prepare('SELECT webhook_secret s FROM tenants WHERE id = ?').get(t.id).s;
  const body = JSON.stringify({ source: 'fichas', external_id: 'pedido-velho', kind: 'deposito', value_cents: 500, click_id: 'clique-velho' });
  const h = await fetch(`${P.origin}/api/hooks/clube-10002/conversion`, { method: 'POST', headers: { 'X-Portal-Signature': sign(secret, body) }, body });
  assert.equal(h.status, 201);
  assert.equal((await h.json()).affiliate, false);
});

test('isolamento: admin de outra operação não lê nem altera o Clube 10002', async () => {
  let r = await sup.req('POST', '/api/tenants', { name: 'Loja Cartas', number: '30001', niche: 'loja' });
  assert.equal(r.status, 201);
  outra = r.data.tenant;
  assert.equal(outra.label, 'Loja 30001', 'o mesmo fluxo vira Loja por configuração de nicho');
  r = await sup.req('POST', '/api/t/loja-30001/users', { email: 'dono@loja.com', role: 'admin', password: 'outra-senha-123' });
  assert.equal(r.status, 201);
  const dono = client(P.origin);
  await dono.login('dono@loja.com', 'outra-senha-123');
  const me = await dono.req('GET', '/api/me');
  assert.deepEqual(me.data.tenants.map((t) => t.slug), ['loja-30001']);
  for (const path of ['/api/t/clube-10002', '/api/t/clube-10002/leads', '/api/t/clube-10002/sites', `/api/t/${clube.tenant.id}/affiliates`]) {
    r = await dono.req('GET', path);
    assert.equal(r.status, 404, `${path} deve parecer inexistente`);
  }
  const site = (await sup.req('GET', '/api/t/clube-10002/sites')).data.sites[0];
  r = await dono.req('PUT', `/api/t/loja-30001/pages/${site.pages[0].id}/draft`, { blocks: [] });
  assert.equal(r.status, 404, 'id de página de outra operação não é encontrado pelo repositório com escopo');
  r = await dono.req('POST', '/api/tenants', { name: 'X', niche: 'poker' });
  assert.equal(r.status, 403, 'só superadmin cria operação');
});

test('permissões: editor edita mas não publica; afiliado não vê CRM; CSRF obrigatório', async () => {
  await sup.req('POST', '/api/t/clube-10002/users', { email: 'editor@teste.com', role: 'editor', password: 'editor-senha-1' });
  await sup.req('POST', '/api/t/clube-10002/users', { email: 'afiliado@teste.com', role: 'affiliate', password: 'afiliado-senha-1' });
  const ed = client(P.origin);
  await ed.login('editor@teste.com', 'editor-senha-1');
  const site = (await ed.req('GET', '/api/t/clube-10002/sites')).data.sites[0];
  const page = site.pages[1];
  let r = await ed.req('PUT', `/api/t/clube-10002/pages/${page.id}/draft`, { blocks: page.draft });
  assert.equal(r.status, 200);
  r = await ed.req('POST', `/api/t/clube-10002/pages/${page.id}/publish`);
  assert.equal(r.status, 403);
  r = await ed.req('GET', '/api/t/clube-10002/leads');
  assert.equal(r.status, 403);
  const af = client(P.origin);
  await af.login('afiliado@teste.com', 'afiliado-senha-1');
  r = await af.req('GET', '/api/t/clube-10002/leads');
  assert.equal(r.status, 403);
  r = await fetch(`${P.origin}/api/t/clube-10002/pages/${page.id}/draft`, { method: 'PUT', headers: { Cookie: ed.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ blocks: [] }) });
  assert.equal(r.status, 403, 'sem X-CSRF a escrita é recusada');
});

test('auditoria registra ações administrativas', () => {
  const actions = P.db.prepare('SELECT action FROM audit').all().map((a) => a.action);
  for (const a of ['operacao.criar', 'pagina.publicar', 'afiliado.criar', 'usuario.vincular', 'webhook.assinatura_invalida']) assert.ok(actions.includes(a), `falta ${a}`);
});

test('integrações começam pendentes e mostram o estado real', async () => {
  const r = await sup.req('GET', '/api/t/clube-10002/integrations');
  const by = Object.fromEntries(r.data.integrations.map((i) => [i.kind, i.status]));
  assert.equal(by.instagram, 'pendente');
  assert.equal(by.meta_ads, 'pendente');
  assert.equal(by.webhook_conversoes, 'ativo');
  const hook = r.data.integrations.find((i) => i.kind === 'webhook_conversoes');
  assert.match(hook.secret, /^••••/, 'segredo nunca volta inteiro');
});
