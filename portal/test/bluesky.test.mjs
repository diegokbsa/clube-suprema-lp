// Bluesky por operação (PA-151): senha de app só no cofre (nunca volta), recusa a senha da conta, teste abre a sessão (ativo/erro),
// post novo do blog vira post com cartão de link (capa, título, resumo, UTM) uma vez só, posts de antes de ligar ficam de fora,
// grade do dia, falha vira tentativa sem vazar a senha, aparece em Integrações, isolamento e permissões.
// Tudo com fetch falso: nenhuma chamada sai para a internet.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPortal, client } from './helpers.mjs';
import { scoped } from '../lib/repo.mjs';
import { rodadaBluesky, textoDoPost } from '../lib/modules/bluesky.mjs';
import { tamanho } from '../lib/automacao.mjs';

const SENHA = 'abcd-efgh-ijkl-mnop';
const HANDLE = 'clube10101.bsky.social';
const SLUG = 'clube-10101';
const OUTRA = 'clube-10102';

let P;
let sup;
let mkt;
let tenant;
let repo;
let chamadas = [];
let falharPost = false;
let grade = null;
const respostas = [];
const guardar = (r) => { respostas.push(JSON.stringify(r.data)); return r; };

async function fetchFalso(url, init = {}) {
  if (url === 'https://cdn.exemplo.com/capa.jpg') {
    chamadas.push({ metodo: 'capa' });
    return { ok: true, status: 200, headers: new Headers({ 'content-type': 'image/jpeg' }), arrayBuffer: async () => new Uint8Array([255, 216, 255, 1, 2, 3]).buffer };
  }
  const m = /^https:\/\/bsky\.social\/xrpc\/([\w.]+)/.exec(url);
  assert.ok(m, `URL inesperada: ${url}`);
  const corpo = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : null;
  chamadas.push({ metodo: m[1], corpo, auth: init.headers?.Authorization || null });
  const ok = (data) => ({ ok: true, status: 200, json: async () => data });
  switch (m[1]) {
    case 'com.atproto.server.createSession':
      if (corpo.identifier !== HANDLE || corpo.password !== SENHA) return { ok: false, status: 401, json: async () => ({ error: 'AuthenticationRequired', message: 'Invalid identifier or password' }) };
      return ok({ did: 'did:plc:clube10101', handle: HANDLE, accessJwt: 'jwt-de-acesso-teste', refreshJwt: 'jwt-refresh' });
    case 'com.atproto.repo.uploadBlob': return ok({ blob: { $type: 'blob', ref: { $link: 'bafkteste' }, mimeType: 'image/jpeg', size: 6 } });
    case 'com.atproto.repo.createRecord':
      if (falharPost) return { ok: false, status: 500, json: async () => ({ error: 'InternalServerError', message: `falhou para ${SENHA}` }) };
      return ok({ uri: `at://did:plc:clube10101/app.bsky.feed.post/${chamadas.length}`, cid: 'bafy' });
    default: return { ok: false, status: 404, json: async () => ({ error: 'MethodNotImplemented' }) };
  }
}

const criados = () => chamadas.filter((c) => c.metodo === 'com.atproto.repo.createRecord');

async function publicarPost(titulo, extra = {}) {
  const site = repo.all('sites')[0];
  const r = await sup.req('POST', `/api/t/${SLUG}/posts`, { siteId: site.id, title: titulo, content: 'Conteúdo do post com o passo a passo.', author: 'Equipe',
    excerpt: 'Resumo curto do post para o cartão.', tags: ['Regras', 'Iniciantes'], ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const p = await sup.req('POST', `/api/t/${SLUG}/posts/${r.data.post.id}/publish`, {});
  assert.equal(p.status, 200);
  return p.data.post;
}

before(async () => {
  P = await startPortal({ fetchImpl: fetchFalso });
  P.app.gradeDoDia = async () => grade;
  sup = client(P.url);
  await sup.login('super@teste.local', 'senha-forte-123');
  for (const num of ['10101', '10102']) {
    const r = await sup.req('POST', '/api/tenants', { name: `Clube ${num}`, number: num, niche: 'poker', template: 'clube-poker-premium', settings: { whatsapp: '5511966665555' } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
  }
  tenant = P.db.prepare('SELECT * FROM tenants WHERE slug = ?').get(SLUG);
  repo = scoped(P.db, tenant.id);
  await sup.req('POST', `/api/t/${SLUG}/users`, { email: 'mkt@bs.test', name: 'Mkt', role: 'marketing', password: 'marketing-senha-123' });
  mkt = client(P.url); await mkt.login('mkt@bs.test', 'marketing-senha-123');
});
after(() => P.close());

test('aparece em Integrações como pendente; salvar recusa senha da conta, guarda a senha de app só no cofre; marketing não grava', async () => {
  const lista = guardar(await sup.req('GET', `/api/t/${SLUG}/integrations`));
  const item = lista.data.integrations.find((i) => i.kind === 'bluesky');
  assert.ok(item, 'Bluesky na lista de integrações');
  assert.equal(item.status, 'pendente');
  assert.equal(item.group, 'redes');
  assert.equal(guardar(await sup.req('PUT', `/api/t/${SLUG}/bluesky`, { handle: HANDLE, senha: 'minha-senha-da-conta' })).status, 400);
  assert.equal(guardar(await sup.req('PUT', `/api/t/${SLUG}/bluesky`, { handle: 'não é handle', senha: SENHA })).status, 400);
  const r = guardar(await sup.req('PUT', `/api/t/${SLUG}/bluesky`, { handle: `https://bsky.app/profile/${HANDLE}`, senha: SENHA }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.config.handle, HANDLE, 'aceita o link do perfil');
  assert.equal(r.data.senhaGravada, true);
  assert.equal(r.data.estado, 'pendente', 'salvar não conecta; só o teste');
  const row = repo.get('integrations', { kind: 'bluesky' });
  assert.ok(row.secret && !row.secret.includes(SENHA));
  assert.equal(P.app.vault.open(row.secret), SENHA);
  assert.equal(chamadas.length, 0, 'salvar não chama o Bluesky');
  assert.equal(guardar(await mkt.req('GET', `/api/t/${SLUG}/bluesky`)).data.senhaGravada, true);
  assert.equal(guardar(await mkt.req('PUT', `/api/t/${SLUG}/bluesky`, { handle: 'outro.bsky.social' })).status, 403);
  assert.equal(guardar(await mkt.req('POST', `/api/t/${SLUG}/bluesky/teste`, {})).status, 403);
});

test('posts publicados antes de ligar ficam de fora; teste com senha errada marca erro; certa marca conectado', async () => {
  await publicarPost('Post antigo antes do Bluesky');
  P.db.prepare("UPDATE posts SET published_at = ? WHERE title = 'Post antigo antes do Bluesky'").run(new Date(Date.now() - 60_000).toISOString());
  const row = repo.get('integrations', { kind: 'bluesky' });
  repo.update('integrations', row.id, { secret: P.app.vault.seal('zzzz-zzzz-zzzz-zzzz') });
  let r = guardar(await sup.req('POST', `/api/t/${SLUG}/bluesky/teste`, {}));
  assert.equal(r.data.ok, false);
  assert.equal(r.data.estado, 'erro');
  assert.equal(repo.get('integrations', { kind: 'bluesky' }).status, 'erro');
  guardar(await sup.req('PUT', `/api/t/${SLUG}/bluesky`, { senha: SENHA }));
  r = guardar(await sup.req('POST', `/api/t/${SLUG}/bluesky/teste`, {}));
  assert.equal(r.data.ok, true, JSON.stringify(r.data));
  const cfg = JSON.parse(repo.get('integrations', { kind: 'bluesky' }).public_config);
  assert.equal(cfg.did, 'did:plc:clube10101');
  assert.ok(cfg.ativadoEm);
  assert.equal(repo.get('integrations', { kind: 'bluesky' }).status, 'ativo');
  chamadas = [];
  const rodada = await rodadaBluesky(P.app);
  assert.equal(rodada.enviados, 0, 'o post antigo não vai para o perfil');
  assert.equal(chamadas.length, 0, 'sem nada na fila, nem abre sessão');
});

test('post novo do blog vira post com cartão de link (capa, título, resumo, UTM, +18) uma vez só', async () => {
  const post = await publicarPost('Como funciona o side pot no poker', { coverUrl: 'https://cdn.exemplo.com/capa.jpg' });
  chamadas = [];
  const r = await rodadaBluesky(P.app);
  assert.equal(r.enviados, 1, JSON.stringify(r));
  assert.deepEqual(chamadas.map((c) => c.metodo), ['com.atproto.server.createSession', 'capa', 'com.atproto.repo.uploadBlob', 'com.atproto.repo.createRecord']);
  const rec = criados()[0].corpo;
  assert.equal(criados()[0].auth, 'Bearer jwt-de-acesso-teste');
  assert.equal(rec.repo, 'did:plc:clube10101');
  assert.equal(rec.collection, 'app.bsky.feed.post');
  assert.match(rec.record.text, /^Como funciona o side pot no poker/);
  assert.match(rec.record.text, /maiores de 18/);
  assert.ok(tamanho(rec.record.text) <= 300);
  const ext = rec.record.embed.external;
  assert.match(ext.uri, new RegExp(`/blog/${post.slug}\\?utm_source=bluesky&utm_medium=social$`));
  assert.equal(ext.title, 'Como funciona o side pot no poker');
  assert.equal(ext.thumb.ref.$link, 'bafkteste');
  assert.ok(rec.record.tags.includes('poker') && rec.record.tags.includes('regras'));
  const env = repo.get('bluesky_envios', { chave: `post:${post.id}` });
  assert.equal(env.status, 'enviado');
  assert.match(env.uri, /^at:\/\//);

  chamadas = [];
  await rodadaBluesky(P.app);
  assert.equal(criados().length, 0, 'reexecutar não posta repetido');
});

test('grade do dia sai uma vez depois do horário; falha vira nova tentativa sem a senha no erro', async () => {
  await sup.req('PUT', `/api/t/${SLUG}/bluesky`, { gradeHora: '00:00' });
  grade = { url: 'https://grade.exemplo.com/hoje', eventos: [
    { inicio: new Date(Date.now() + 3600_000).toISOString(), nome: 'Main Event', garantido: 100000, buyin: 100 },
    { inicio: new Date(Date.now() + 7200_000).toISOString(), nome: 'Turbo', garantido: 20000, buyin: 20 },
  ] };
  falharPost = true;
  chamadas = [];
  let r = await rodadaBluesky(P.app);
  assert.equal(r.erros, 1);
  const env = repo.all('bluesky_envios', { tipo: 'grade' })[0];
  assert.equal(env.status, 'pendente');
  assert.equal(env.tentativas, 1);
  assert.ok(!env.last_error.includes(SENHA), 'senha escondida no erro');
  falharPost = false;
  chamadas = [];
  r = await rodadaBluesky(P.app);
  assert.equal(r.enviados, 1);
  const rec = criados()[0].corpo.record;
  assert.match(rec.text, /Torneios de hoje no Clube 10101/);
  assert.match(rec.text, /Main Event · R\$\s?100\.000 GTD/);
  assert.ok(tamanho(rec.text) <= 300);
  assert.match(rec.embed.external.uri, /^https:\/\/grade\.exemplo\.com\/hoje\?utm_source=bluesky/);
  chamadas = [];
  await rodadaBluesky(P.app);
  assert.equal(criados().length, 0, 'grade do dia não repete');
  const tela = guardar(await sup.req('GET', `/api/t/${SLUG}/bluesky`));
  assert.equal(tela.data.envios.filter((e) => e.situacao === 'enviado').length, 2);
});

test('texto do post respeita 300 caracteres visíveis; outra operação não vê nada; senha nunca aparece', async () => {
  const t = textoDoPost('Título 🃏'.repeat(10), 'Resumo longo com acentuação e emoji ♠️ '.repeat(20), 'Somente maiores de 18 anos.');
  assert.ok(tamanho(t) <= 300);
  assert.match(t, /maiores de 18 anos\.$/);
  const outra = guardar(await sup.req('GET', `/api/t/${OUTRA}/bluesky`));
  assert.equal(outra.data.estado, 'pendente');
  assert.equal(outra.data.envios.length, 0);
  const env = repo.all('bluesky_envios')[0];
  assert.equal((await sup.req('POST', `/api/t/${OUTRA}/bluesky/envios/${env.id}/repetir`, {})).status, 404);
  const tudo = [...respostas, JSON.stringify(P.db.prepare('SELECT * FROM audit').all()), JSON.stringify(P.db.prepare('SELECT public_config, last_error FROM integrations').all()),
    JSON.stringify(P.db.prepare('SELECT * FROM bluesky_envios').all())].join('\n');
  assert.ok(!tudo.includes(SENHA), 'senha de app vazou');
  assert.ok(!tudo.includes('jwt-de-acesso-teste'), 'token de acesso vazou');
});
