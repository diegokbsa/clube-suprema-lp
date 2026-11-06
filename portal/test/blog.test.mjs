// Blogue editorial por operação: publicação versionada, isolamento e permissões.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPortal, client } from './helpers.mjs';

let P;
let admin;
let tenant;
let site;

before(async () => {
  P = await startPortal();
  admin = client(P.origin);
  await admin.login('super@teste.local', 'senha-forte-123');
  const r = await admin.req('POST', '/api/tenants', { name: 'Clube Teste', number: '10002', niche: 'poker', template: 'clube-poker-premium' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  tenant = r.data.tenant;
  site = (await admin.req('GET', `/api/t/${tenant.slug}/sites`)).data.sites[0];
  await admin.req('POST', `/api/t/${tenant.slug}/pages/${site.pages[0].id}/publish`);
});

after(() => P.close());

test('painel serve o módulo de blog como JavaScript carregável', async () => {
  const response = await fetch(`${P.origin}/admin/modules/blog.js`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /javascript/);
  assert.match(await response.text(), /export async function render/);
});

test('horário inválido é recusado antes de qualquer persistência do painel', async () => {
  const ui = await import('../public/admin/modules/blog.js');
  assert.equal(typeof ui.scheduleWithValidatedTime, 'function');
  let persisted = false;
  await assert.rejects(ui.scheduleWithValidatedTime('', async () => { persisted = true; }), /Escolha data e horário/);
  assert.equal(persisted, false);
});

function article(overrides = {}) {
  return {
    siteId: site.id,
    title: 'Guia de regras',
    slug: 'guia-de-regras',
    excerpt: 'Resumo editorial.',
    content: 'Primeiro parágrafo.\n\nSegundo parágrafo.',
    category: 'Regras',
    tags: ['iniciante', 'regras'],
    author: 'Equipe editorial',
    coverUrl: '/assets/capa.webp',
    seoTitle: 'Guia de regras do jogo',
    seoDescription: 'Um resumo das regras.',
    ...overrides,
  };
}

test('rascunho não aparece; publicação usa cópia escapada e revisão não altera o texto público', async () => {
  const created = await admin.req('POST', `/api/t/${tenant.slug}/posts`, article({ content: 'Texto inicial.' }));
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.post.status, 'rascunho');
  assert.deepEqual(created.data.post.tags, ['iniciante', 'regras']);
  assert.equal(created.data.post.author, 'Equipe editorial');

  let page = await admin.req('GET', `/s/${site.slug}/blog`, undefined, { raw: true });
  assert.equal(page.status, 200, 'a página de blog tem estado vazio antes da primeira publicação');
  assert.doesNotMatch(page.data, /Guia de regras/, 'rascunho não aparece na listagem');
  page = await admin.req('GET', `/s/${site.slug}/blog/guia-de-regras`, undefined, { raw: true });
  assert.equal(page.status, 404, 'rascunho não aparece por slug');

  let r = await admin.req('POST', `/api/t/${tenant.slug}/posts/${created.data.post.id}/publish`);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  page = await admin.req('GET', `/s/${site.slug}/blog/guia-de-regras`, undefined, { raw: true });
  assert.equal(page.status, 200);
  assert.match(page.data, /Texto inicial\./);

  r = await admin.req('PUT', `/api/t/${tenant.slug}/posts/${created.data.post.id}`, article({
    title: 'Guia revisado', slug: 'guia-revisado', content: 'Novo <script>alert(1)</script> texto.',
  }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.post.status, 'revisao');
  page = await admin.req('GET', `/s/${site.slug}/blog/guia-de-regras`, undefined, { raw: true });
  assert.match(page.data, /Texto inicial\./, 'a revisão preserva a última versão publicada');
  page = await admin.req('GET', `/s/${site.slug}/blog/guia-revisado`, undefined, { raw: true });
  assert.equal(page.status, 404, 'o novo slug não fica público antes da aprovação');

  r = await admin.req('POST', `/api/t/${tenant.slug}/posts/${created.data.post.id}/publish`);
  assert.equal(r.status, 200);
  page = await admin.req('GET', `/s/${site.slug}/blog/guia-revisado`, undefined, { raw: true });
  assert.equal(page.status, 200);
  assert.match(page.data, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, 'conteúdo é escapado no HTML público');
  assert.match(page.headers.get('content-security-policy') || '', /style-src[^;]*'self'/, 'a CSP permite a folha de estilos local');
  page = await admin.req('GET', `/s/${site.slug}/blog/guia-de-regras`, undefined, { raw: true });
  assert.equal(page.status, 404, 'o slug anterior deixa de responder após publicar a revisão');
});

test('agendamento publica após o horário e a atualização não duplica o post', async () => {
  const created = await admin.req('POST', `/api/t/${tenant.slug}/posts`, article({ slug: 'guia-agendado', title: 'Guia agendado' }));
  assert.equal(created.status, 201);
  const scheduledAt = new Date(Date.now() + 300).toISOString();
  let r = await admin.req('PUT', `/api/t/${tenant.slug}/posts/${created.data.post.id}/schedule`, article({
    slug: 'guia-agendado', title: 'Guia agendado', content: 'Versão aprovada para a agenda.', scheduledAt,
  }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.post.status, 'agendado');
  r = await admin.req('GET', `/s/${site.slug}/blog/guia-agendado`, undefined, { raw: true });
  assert.equal(r.status, 404, 'post agendado ainda não é público');

  await new Promise((resolve) => setTimeout(resolve, 1500));
  r = await admin.req('GET', `/s/${site.slug}/blog/guia-agendado`, undefined, { raw: true });
  assert.equal(r.status, 200, 'o agendador publica depois do horário definido');
  let list = await admin.req('GET', `/api/t/${tenant.slug}/posts`);
  let post = list.data.posts.find((p) => p.id === created.data.post.id);
  assert.equal(post.status, 'publicado');
  const publishedAt = post.publishedAt;
  await new Promise((resolve) => setTimeout(resolve, 1200));
  list = await admin.req('GET', `/api/t/${tenant.slug}/posts`);
  post = list.data.posts.find((p) => p.id === created.data.post.id);
  assert.equal(post.publishedAt, publishedAt, 'as verificações seguintes não publicam duas vezes');
  assert.equal(list.data.posts.filter((p) => p.id === created.data.post.id).length, 1);
});

test('reagendamento inválido preserva agenda e conteúdo anteriores', async () => {
  const created = await admin.req('POST', `/api/t/${tenant.slug}/posts`, article({ title: 'Agenda preservada', slug: 'agenda-preservada' }));
  assert.equal(created.status, 201);
  const scheduledAt = new Date(Date.now() + 120_000).toISOString();
  let r = await admin.req('POST', `/api/t/${tenant.slug}/posts/${created.data.post.id}/schedule`, { scheduledAt });
  assert.equal(r.status, 200);
  r = await admin.req('PUT', `/api/t/${tenant.slug}/posts/${created.data.post.id}/schedule`, article({
    title: 'Alteração inválida', slug: 'agenda-preservada', content: 'Não deve sobrescrever o conteúdo.', scheduledAt: 'horário-inválido',
  }));
  assert.equal(r.status, 400);
  const posts = await admin.req('GET', `/api/t/${tenant.slug}/posts`);
  const unchanged = posts.data.posts.find((post) => post.id === created.data.post.id);
  assert.equal(unchanged.status, 'agendado');
  assert.equal(unchanged.scheduledAt, scheduledAt);
  assert.equal(unchanged.title, 'Agenda preservada');
  assert.equal(unchanged.content, 'Primeiro parágrafo.\n\nSegundo parágrafo.');
});

test('capa externa usa HTTPS ou caminho local', async () => {
  const r = await admin.req('POST', `/api/t/${tenant.slug}/posts`, article({ slug: 'capa-http', coverUrl: 'http://exemplo.test/capa.webp' }));
  assert.equal(r.status, 400);
  assert.match(r.data.error, /HTTPS|local/);
});

test('uma operação não lê o blog de outra e o site recebido precisa pertencer à operação', async () => {
  const created = await admin.req('POST', `/api/t/${tenant.slug}/posts`, article({ title: 'Artigo do Clube', slug: 'artigo-do-clube' }));
  assert.equal(created.status, 201);
  await admin.req('POST', `/api/t/${tenant.slug}/posts/${created.data.post.id}/publish`);
  let r = await admin.req('POST', '/api/tenants', { name: 'Clube Outro', number: '20002', niche: 'poker', template: 'clube-poker-premium' });
  assert.equal(r.status, 201);
  const other = r.data.tenant;
  const otherSite = (await admin.req('GET', `/api/t/${other.slug}/sites`)).data.sites[0];
  r = await admin.req('POST', `/api/t/${other.slug}/posts`, article({ siteId: site.id, slug: 'site-alheio' }));
  assert.equal(r.status, 404, 'não aceita site de outra operação');
  r = await admin.req('POST', `/api/t/${other.slug}/posts`, article({ siteId: otherSite.id, title: 'Artigo da Loja' }));
  assert.equal(r.status, 201, JSON.stringify(r.data));
  await admin.req('POST', `/api/t/${other.slug}/posts/${r.data.post.id}/publish`);

  r = await admin.req('GET', `/api/t/${tenant.slug}/posts`);
  assert.ok(r.data.posts.some((p) => p.id === created.data.post.id));
  assert.ok(r.data.posts.every((p) => p.siteId !== otherSite.id));
  r = await admin.req('GET', `/s/${otherSite.slug}/blog`, undefined, { raw: true });
  assert.doesNotMatch(r.data, /Artigo do Clube/);
  assert.match(r.data, /Artigo da Loja/);
});

test('editor pode editar, mas não publica nem agenda mesmo enviando estado no corpo', async () => {
  await admin.req('POST', `/api/t/${tenant.slug}/users`, { email: 'editor@teste.com', role: 'editor', password: 'editor-senha-1' });
  const editor = client(P.origin);
  await editor.login('editor@teste.com', 'editor-senha-1');
  const r = await editor.req('POST', `/api/t/${tenant.slug}/posts`, article({ slug: 'post-do-editor', status: 'publicado' }));
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.post.status, 'rascunho', 'o estado do corpo não contorna a permissão de publicação');
  let publicPage = await editor.req('GET', `/s/${site.slug}/blog/post-do-editor`, undefined, { raw: true });
  assert.equal(publicPage.status, 404);
  let action = await editor.req('POST', `/api/t/${tenant.slug}/posts/${r.data.post.id}/publish`);
  assert.equal(action.status, 403);
  action = await editor.req('POST', `/api/t/${tenant.slug}/posts/${r.data.post.id}/schedule`, { scheduledAt: new Date(Date.now() + 60_000).toISOString() });
  assert.equal(action.status, 403);
  action = await editor.req('PUT', `/api/t/${tenant.slug}/posts/${r.data.post.id}/schedule`, article({ scheduledAt: new Date(Date.now() + 60_000).toISOString() }));
  assert.equal(action.status, 403);
});
