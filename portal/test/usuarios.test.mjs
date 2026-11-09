// Usuários e acessos: convite de uso único (48 h), quem recebe define a senha, redefinição, desativação e auditoria.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startPortal, client } from './helpers.mjs';
import { createTenant } from '../lib/tenants.mjs';

const tokenDe = (link) => new URL(link).searchParams.get('t');
const aceitar = (c, token, campos) => c.req('POST', '/convite', new URLSearchParams({ t: token, ...campos }),
  { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' }, raw: true });

test('convite: superadmin convida, a pessoa define a senha, entra, e o link não vale de novo', async () => {
  const p = await startPortal();
  try {
    const su = client(p.url); await su.login('super@teste.local', 'senha-forte-123');
    const r = await su.req('POST', '/api/admin/usuarios/convites', { email: 'Nova@Teste.local', nome: 'Nova', papel: 'super' });
    assert.equal(r.status, 201);
    assert.match(r.data.link, /\/convite\?t=[A-Za-z0-9_-]{40,}$/);
    const token = tokenDe(r.data.link);
    const salvo = p.db.prepare('SELECT * FROM convites_acesso WHERE id = ?').get(r.data.convite.id);
    assert.notEqual(salvo.token_hash, token, 'o token não fica no banco, só o hash');
    assert.ok(!JSON.stringify(p.db.prepare('SELECT * FROM audit').all()).includes(token), 'token fora da auditoria');

    const visitante = client(p.url);
    const pagina = await visitante.req('GET', `/convite?t=${token}`, undefined, { raw: true, headers: { Accept: 'text/html' } });
    assert.equal(pagina.status, 200);
    assert.match(pagina.data, /nova@teste\.local/);
    assert.equal((await aceitar(visitante, token, { nome: 'Nova', senha: 'curta1', senha2: 'curta1' })).status, 400, 'senha fraca recusada');
    assert.equal((await aceitar(visitante, token, { nome: 'Nova', senha: 'senha-nova-2026', senha2: 'outra-senha-2026' })).status, 400, 'senhas diferentes');
    const ok = await aceitar(visitante, token, { nome: 'Nova', senha: 'senha-nova-2026', senha2: 'senha-nova-2026' });
    assert.equal(ok.status, 200);
    assert.match(ok.data, /Seu acesso está criado/);

    const nova = client(p.url); await nova.login('nova@teste.local', 'senha-nova-2026');
    assert.equal((await nova.req('GET', '/api/me')).data.user.isSuper, true);
    assert.equal((await aceitar(client(p.url), token, { nome: 'X', senha: 'senha-outra-2026', senha2: 'senha-outra-2026' })).status, 410, 'link reutilizado');
    assert.ok(p.db.prepare("SELECT 1 FROM audit WHERE action = 'usuario.convite_aceito'").get());
    assert.ok(!JSON.stringify(p.db.prepare('SELECT * FROM audit').all()).includes('senha-nova-2026'), 'senha fora da auditoria');
  } finally { await p.close(); }
});

test('convite expirado não abre; só superadmin convida; editor entra nas operações da edição', async () => {
  const p = await startPortal();
  try {
    const su = client(p.url); await su.login('super@teste.local', 'senha-forte-123');
    const r = await su.req('POST', '/api/admin/usuarios/convites', { email: 'velho@teste.local', papel: 'editor' });
    p.db.prepare('UPDATE convites_acesso SET expira_em = ? WHERE id = ?').run(Date.now() - 1000, r.data.convite.id);
    assert.equal((await client(p.url).req('GET', `/convite?t=${tokenDe(r.data.link)}`, undefined, { raw: true })).status, 410);
    assert.equal((await aceitar(client(p.url), tokenDe(r.data.link), { nome: 'V', senha: 'senha-nova-2026', senha2: 'senha-nova-2026' })).status, 410);

    createTenant(p.db, { name: 'Op', number: '90901', niche: 'criador', slug: 'op1', edition: 'geral' });
    const r2 = await su.req('POST', `/api/admin/convites/${r.data.convite.id}/reenviar`);
    assert.equal(r2.status, 200);
    const ed = client(p.url);
    assert.equal((await aceitar(ed, tokenDe(r2.data.link), { nome: 'Editor', senha: 'senha-nova-2026', senha2: 'senha-nova-2026' })).status, 200);
    await ed.login('velho@teste.local', 'senha-nova-2026');
    const me = (await ed.req('GET', '/api/me')).data;
    assert.equal(me.user.isSuper, false);
    assert.deepEqual(me.tenants.map((t) => t.role), ['editor']);
    assert.equal((await ed.req('POST', '/api/admin/usuarios/convites', { email: 'x@teste.local', papel: 'super' })).status, 403, 'editor não convida');
    assert.equal((await su.req('POST', '/api/admin/usuarios/convites', { email: 'velho@teste.local', papel: 'admin' })).status, 409, 'e-mail que já tem acesso');
  } finally { await p.close(); }
});

test('desativar derruba a sessão e o login; redefinição troca a senha e invalida a antiga', async () => {
  const p = await startPortal();
  try {
    const su = client(p.url); await su.login('super@teste.local', 'senha-forte-123');
    const conv = await su.req('POST', '/api/admin/usuarios/convites', { email: 'b@teste.local', papel: 'super' });
    await aceitar(client(p.url), tokenDe(conv.data.link), { nome: 'B', senha: 'senha-b-2026x', senha2: 'senha-b-2026x' });
    const b = client(p.url); await b.login('b@teste.local', 'senha-b-2026x');
    const id = p.db.prepare("SELECT id FROM users WHERE email = 'b@teste.local'").get().id;

    const red = await su.req('POST', `/api/admin/usuarios/${id}/redefinicao`);
    assert.equal(red.status, 200);
    assert.equal((await aceitar(client(p.url), tokenDe(red.data.link), { senha: 'senha-c-2026x', senha2: 'senha-c-2026x' })).status, 200);
    assert.equal((await b.req('GET', '/api/me')).status, 401, 'sessão aberta com a senha antiga cai');
    assert.equal((await client(p.url).req('POST', '/api/login', { email: 'b@teste.local', password: 'senha-b-2026x' })).status, 401, 'senha antiga não vale');
    const b2 = client(p.url); await b2.login('b@teste.local', 'senha-c-2026x');

    assert.equal((await su.req('POST', `/api/admin/usuarios/${p.superUser.id}/desativar`)).status, 400, 'não desativa a si mesmo');
    assert.equal((await su.req('POST', `/api/admin/usuarios/${id}/desativar`)).status, 200);
    assert.equal((await b2.req('GET', '/api/me')).status, 401, 'sessão encerrada');
    assert.equal((await client(p.url).req('POST', '/api/login', { email: 'b@teste.local', password: 'senha-c-2026x' })).status, 401, 'login bloqueado');
    const lista = (await su.req('GET', '/api/admin/usuarios')).data.usuarios;
    assert.equal(lista.find((u) => u.email === 'b@teste.local').ativo, false);
    assert.ok(lista.find((u) => u.email === 'super@teste.local').ultimoAcesso, 'último acesso gravado no login');
    assert.ok(p.db.prepare("SELECT 1 FROM audit WHERE action = 'usuario.desativar' AND user_id = ?").get(p.superUser.id), 'auditoria diz quem desativou');
    assert.equal((await su.req('POST', `/api/admin/usuarios/${id}/ativar`)).status, 200);
    await client(p.url).login('b@teste.local', 'senha-c-2026x');
  } finally { await p.close(); }
});

test('senha definida pelo superadmin: entra, é obrigado a trocar, troca e entra com a nova; senha fora da auditoria', async () => {
  const p = await startPortal();
  try {
    const su = client(p.url); await su.login('super@teste.local', 'senha-forte-123');
    assert.equal((await su.req('POST', '/api/admin/usuarios/criar', { email: 'c@teste.local', papel: 'super', senha: 'curta' })).status, 400, 'senha fraca');
    const cr = await su.req('POST', '/api/admin/usuarios/criar', { email: 'c@teste.local', nome: 'C', papel: 'super', senha: 'provisoria-2026', trocar: true });
    assert.equal(cr.status, 201);
    const c = client(p.url); await c.login('c@teste.local', 'provisoria-2026');
    assert.equal((await c.req('GET', '/api/me')).data.user.trocarSenha, true);
    assert.equal((await c.req('GET', '/api/admin/usuarios')).status, 403, 'bloqueado até trocar');
    assert.equal((await c.req('POST', '/api/conta/senha', { atual: 'errada-2026x', nova: 'definitiva-2026' })).status, 400);
    assert.equal((await c.req('POST', '/api/conta/senha', { atual: 'provisoria-2026', nova: 'definitiva-2026' })).status, 200);
    assert.equal((await c.req('GET', '/api/admin/usuarios')).status, 200, 'liberado depois de trocar');
    assert.equal((await client(p.url).req('POST', '/api/login', { email: 'c@teste.local', password: 'provisoria-2026' })).status, 401, 'provisória não vale mais');
    await client(p.url).login('c@teste.local', 'definitiva-2026');

    const id = cr.data.usuario.id;
    assert.equal((await su.req('POST', `/api/admin/usuarios/${id}/senha`, { senha: 'outra-senha-2026', trocar: false })).status, 200);
    assert.equal((await c.req('GET', '/api/me')).status, 401, 'sessão antiga cai quando o superadmin define senha');
    const c2 = client(p.url); await c2.login('c@teste.local', 'outra-senha-2026');
    assert.equal((await c2.req('GET', '/api/me')).data.user.trocarSenha, false, 'sem pedir troca quando desmarcado');
    const aud = JSON.stringify(p.db.prepare('SELECT * FROM audit').all());
    for (const s of ['provisoria-2026', 'definitiva-2026', 'outra-senha-2026']) assert.ok(!aud.includes(s), `senha ${s} fora da auditoria`);
    assert.match(aud, /definida pelo superadmin/);
  } finally { await p.close(); }
});
