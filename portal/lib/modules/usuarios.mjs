// Usuários e acessos do painel (superadministrador), pedido do Kbsa em 09/11/2026: "preciso criar outro administrador e não
// tem como adicionar usuários". Vale para todas as edições (SX, aff...), que usam o mesmo banco.
//   - convite de uso único, válido por 48 h: o superadmin escolhe e-mail e papel e copia o link; QUEM RECEBE define a própria
//     senha em <edição>/convite. Ninguém mais vê ou define senha, e nada de senha vai para log ou auditoria;
//   - o mesmo link serve para redefinir a senha de alguém (tipo "redefinicao");
//   - desativar encerra as sessões e os tokens de IA da pessoa e impede o login; reativar devolve o acesso;
//   - o token do link é aleatório (32 bytes) e só o hash dele fica no banco; toda ação vai para a auditoria.
// Papéis: superadministrador (tudo, todas as operações), administrador e editor (entram em todas as operações da edição
// em que o convite foi criado; a tela de usuários de cada operação continua ajustando caso a caso).
import { randomBytes, createHash } from 'node:crypto';
import { HttpError, readBody, decodeBody, rateLimiter, clientIp } from '../http.mjs';
import { hashPassword, passwordProblem } from '../auth.mjs';
import { id as newId, now } from '../db.mjs';

export const VALIDADE_H = 48;
export const PAPEIS = { super: 'Superadministrador', admin: 'Administrador', editor: 'Editor' };
const sha = (t) => createHash('sha256').update(String(t)).digest('hex');
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const need = (ok, status, msg) => { if (!ok) throw new HttpError(status, msg); };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const colunas = (db, t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);

export function init(app) {
  const { db } = app;
  const c = colunas(db, 'users');
  if (!c.includes('ativo')) db.exec('ALTER TABLE users ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1');
  if (!c.includes('ultimo_acesso')) db.exec('ALTER TABLE users ADD COLUMN ultimo_acesso TEXT');
  if (!c.includes('desativado_em')) db.exec('ALTER TABLE users ADD COLUMN desativado_em TEXT');
  db.exec(`CREATE TABLE IF NOT EXISTS convites_acesso (
    id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, tipo TEXT NOT NULL, email TEXT NOT NULL, nome TEXT, papel TEXT,
    user_id TEXT, edicao TEXT NOT NULL, criado_por TEXT, criado_em TEXT NOT NULL, expira_em INTEGER NOT NULL, usado_em TEXT, cancelado_em TEXT)`);
  db.exec('CREATE INDEX IF NOT EXISTS convites_acesso_email ON convites_acesso (email)');
}

/** Cria o link (cancela os pendentes iguais) e devolve { convite, link }. O token só existe nesta resposta. */
function novoLink(db, { tipo, email, nome = null, papel = null, userId = null, edicao, criadoPor, origin }) {
  db.prepare('UPDATE convites_acesso SET cancelado_em = ? WHERE email = ? AND tipo = ? AND usado_em IS NULL AND cancelado_em IS NULL').run(now(), email, tipo);
  const token = randomBytes(32).toString('base64url');
  const row = { id: newId(), token_hash: sha(token), tipo, email, nome, papel, user_id: userId, edicao, criado_por: criadoPor, criado_em: now(), expira_em: Date.now() + VALIDADE_H * 3600_000 };
  db.prepare(`INSERT INTO convites_acesso (id, token_hash, tipo, email, nome, papel, user_id, edicao, criado_por, criado_em, expira_em)
    VALUES (@id, @token_hash, @tipo, @email, @nome, @papel, @user_id, @edicao, @criado_por, @criado_em, @expira_em)`).run(row);
  return { convite: publico(row), link: `${origin}/convite?t=${token}` };
}
const publico = (c) => ({ id: c.id, tipo: c.tipo, email: c.email, nome: c.nome, papel: c.papel, criadoEm: c.criado_em, expiraEm: new Date(c.expira_em).toISOString() });

/** Encerra o acesso já aberto: sessões do painel e tokens da IA. */
function encerrarAcessos(db, userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  try { db.prepare('UPDATE oauth_tokens SET revoked = 1 WHERE user_id = ?').run(userId); } catch { /* sem tabela de tokens */ }
}

export const routes = [
  {
    method: 'GET', path: '/api/admin/usuarios', super: true, handler: ({ db, edition }) => {
      const users = db.prepare('SELECT id, email, name, is_super, ativo, ultimo_acesso, created_at FROM users ORDER BY ativo DESC, email').all();
      const papeis = db.prepare('SELECT m.user_id, m.role, COUNT(*) n FROM memberships m JOIN tenants t ON t.id = m.tenant_id WHERE t.edition = ? GROUP BY m.user_id, m.role').all(edition.id);
      const pendentes = db.prepare('SELECT * FROM convites_acesso WHERE usado_em IS NULL AND cancelado_em IS NULL AND expira_em > ? ORDER BY criado_em DESC').all(Date.now());
      return {
        papeis: PAPEIS,
        usuarios: users.map((u) => ({ id: u.id, email: u.email, nome: u.name, super: Boolean(u.is_super), ativo: u.ativo !== 0, ultimoAcesso: u.ultimo_acesso, criadoEm: u.created_at,
          operacoes: papeis.filter((p) => p.user_id === u.id).map((p) => ({ papel: p.role, n: p.n })), convitePendente: pendentes.some((c) => c.email === u.email) })),
        convites: pendentes.filter((c) => c.tipo === 'convite').map(publico),
      };
    },
  },
  {
    method: 'POST', path: '/api/admin/usuarios/convites', super: true, handler: ({ db, body, user, edition, origin, audit }) => {
      const email = String(body.email || '').trim().toLowerCase();
      need(EMAIL.test(email), 400, 'E-mail inválido.');
      need(PAPEIS[body.papel], 400, 'Escolha o papel: superadministrador, administrador ou editor.');
      const existente = db.prepare('SELECT id, ativo FROM users WHERE email = ?').get(email);
      need(!existente || existente.ativo === 0, 409, 'Esse e-mail já tem acesso. Para trocar a senha, use "Redefinir senha" na lista.');
      const nome = String(body.nome || '').trim().slice(0, 80) || null;
      const r = novoLink(db, { tipo: 'convite', email, nome, papel: body.papel, userId: existente?.id || null, edicao: edition.id, criadoPor: user.id, origin });
      audit('usuario.convidar', r.convite.id, { email, papel: body.papel, edicao: edition.id });
      return { status: 201, body: r };
    },
  },
  {
    method: 'POST', path: '/api/admin/convites/:id/reenviar', super: true, handler: ({ db, params, user, edition, origin, audit }) => {
      const c = db.prepare('SELECT * FROM convites_acesso WHERE id = ? AND usado_em IS NULL').get(params.id);
      need(c, 404, 'Convite não encontrado ou já usado.');
      const r = novoLink(db, { tipo: c.tipo, email: c.email, nome: c.nome, papel: c.papel, userId: c.user_id, edicao: edition.id, criadoPor: user.id, origin });
      audit('usuario.convite_reenviar', r.convite.id, { email: c.email, anterior: c.id });
      return r;
    },
  },
  {
    method: 'POST', path: '/api/admin/convites/:id/cancelar', super: true, handler: ({ db, params, audit }) => {
      const r = db.prepare('UPDATE convites_acesso SET cancelado_em = ? WHERE id = ? AND usado_em IS NULL AND cancelado_em IS NULL').run(now(), params.id);
      need(r.changes, 404, 'Convite não encontrado ou já usado.');
      audit('usuario.convite_cancelar', params.id);
      return { ok: true };
    },
  },
  {
    method: 'POST', path: '/api/admin/usuarios/:id/redefinicao', super: true, handler: ({ db, params, user, edition, origin, audit }) => {
      const u = db.prepare('SELECT id, email, name, ativo FROM users WHERE id = ?').get(params.id);
      need(u, 404, 'Usuário não encontrado.');
      need(u.ativo !== 0, 409, 'Reative o usuário antes de redefinir a senha.');
      const r = novoLink(db, { tipo: 'redefinicao', email: u.email, nome: u.name, userId: u.id, edicao: edition.id, criadoPor: user.id, origin });
      audit('usuario.redefinicao', u.id, { email: u.email });
      return r;
    },
  },
  {
    method: 'POST', path: '/api/admin/usuarios/:id/desativar', super: true, handler: ({ db, params, user, audit }) => {
      need(params.id !== user.id, 400, 'Você não pode desativar o próprio acesso.');
      const u = db.prepare('SELECT id, email, is_super FROM users WHERE id = ?').get(params.id);
      need(u, 404, 'Usuário não encontrado.');
      if (u.is_super) need(db.prepare('SELECT COUNT(*) n FROM users WHERE is_super = 1 AND ativo != 0 AND id != ?').get(u.id).n > 0, 400, 'Precisa ficar pelo menos um superadministrador ativo.');
      db.prepare('UPDATE users SET ativo = 0, desativado_em = ? WHERE id = ?').run(now(), u.id);
      encerrarAcessos(db, u.id);
      db.prepare('UPDATE convites_acesso SET cancelado_em = ? WHERE email = ? AND usado_em IS NULL AND cancelado_em IS NULL').run(now(), u.email);
      audit('usuario.desativar', u.id, { email: u.email });
      return { ok: true };
    },
  },
  {
    method: 'POST', path: '/api/admin/usuarios/:id/ativar', super: true, handler: ({ db, params, audit }) => {
      const r = db.prepare('UPDATE users SET ativo = 1, desativado_em = NULL WHERE id = ?').run(params.id);
      need(r.changes, 404, 'Usuário não encontrado.');
      audit('usuario.ativar', params.id);
      return { ok: true };
    },
  },
];

// ---------- página pública do link: /convite?t=... ----------
const tentativas = rateLimiter(20, 15 * 60_000);
function pagina(titulo, corpo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${esc(titulo)}</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f4f2;color:#141414;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px}
main{width:100%;max-width:420px;background:#fff;border:1px solid #e2e2de;border-radius:12px;padding:28px}
h1{font-size:1.35rem;margin:0 0 6px}p{margin:0 0 14px;color:#4a4a46}.k{display:block;font-size:.8rem;font-weight:700;letter-spacing:.04em;color:#2b7f99;margin-bottom:10px}
label{display:block;font-size:.9rem;font-weight:600;margin:14px 0 4px}input{width:100%;font:inherit;padding:11px 12px;border:1px solid #c9c9c4;border-radius:8px}
input:focus{outline:2px solid #3aa8c9;outline-offset:1px;border-color:#3aa8c9}input[readonly]{background:#f4f4f2;color:#4a4a46}
.dica{font-size:.83rem;color:#6b6b66;margin:6px 0 0}button,.btn{display:inline-block;margin-top:20px;width:100%;padding:12px;border:0;border-radius:8px;background:#141414;color:#fff;font:700 1rem system-ui,sans-serif;cursor:pointer;text-align:center;text-decoration:none}
button:hover,.btn:hover{background:#2b7f99}.erro{color:#b42318;font-weight:600}</style></head><body><main>${corpo}</main></body></html>`;
}
const html = (res, status, titulo, corpo) => { res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" }); res.end(pagina(titulo, corpo)); };
const invalido = (res) => html(res, 410, 'Link indisponível', '<span class="k">Acesso ao painel</span><h1>Este link não vale mais</h1><p>Ele já foi usado, foi cancelado ou passou de 48 horas. Peça um link novo a quem administra o painel.</p><a class="btn" href="/admin/">Ir para o login</a>');
const valido = (db, token) => (token ? db.prepare('SELECT * FROM convites_acesso WHERE token_hash = ? AND usado_em IS NULL AND cancelado_em IS NULL AND expira_em > ?').get(sha(token), Date.now()) : null);
function formulario(c, token, erro = '') {
  const convite = c.tipo === 'convite';
  return `<span class="k">${convite ? `Convite · ${esc(PAPEIS[c.papel] || '')}` : 'Redefinir senha'}</span><h1>${convite ? 'Crie sua senha de acesso' : 'Escolha uma senha nova'}</h1>
<p>${convite ? 'Você foi convidado para o painel. A senha é só sua: ninguém mais vê.' : 'A senha antiga deixa de valer assim que você salvar a nova.'}</p>${erro ? `<p class="erro" role="alert">${esc(erro)}</p>` : ''}
<form method="post" action="/convite"><input type="hidden" name="t" value="${esc(token)}"><label for="email">E-mail</label><input id="email" value="${esc(c.email)}" readonly>
${convite ? `<label for="nome">Seu nome</label><input id="nome" name="nome" value="${esc(c.nome || '')}" maxlength="80" autocomplete="name" required>` : ''}
<label for="senha">Senha</label><input id="senha" name="senha" type="password" minlength="10" autocomplete="new-password" required aria-describedby="regra"><p class="dica" id="regra">Pelo menos 10 caracteres, misturando letras e números.</p>
<label for="senha2">Repita a senha</label><input id="senha2" name="senha2" type="password" minlength="10" autocomplete="new-password" required>
<button type="submit">${convite ? 'Criar acesso' : 'Salvar senha nova'}</button></form>`;
}

export const rootRoutes = [
  {
    method: 'GET', path: '/convite', handler: ({ res, url, db }) => {
      const token = url.searchParams.get('t') || '';
      const c = valido(db, token);
      return c ? html(res, 200, 'Acesso ao painel', formulario(c, token)) : invalido(res);
    },
  },
  {
    method: 'POST', path: '/convite', handler: async ({ req, res, db }) => {
      if (!tentativas(clientIp(req))) return html(res, 429, 'Muitas tentativas', '<h1>Muitas tentativas</h1><p>Espere 15 minutos e abra o link de novo.</p>');
      const body = decodeBody(await readBody(req), req.headers['content-type'] || '');
      const token = String(body.t || '');
      const c = valido(db, token);
      if (!c) return invalido(res);
      const senha = String(body.senha || '');
      const problema = passwordProblem(senha) || (senha !== String(body.senha2 || '') ? 'As duas senhas não são iguais.' : null)
        || (c.tipo === 'convite' && !String(body.nome || '').trim() ? 'Escreva seu nome.' : null);
      if (problema) return html(res, 400, 'Acesso ao painel', formulario(c, token, problema));
      const quando = now();
      let userId = c.user_id;
      db.exec('BEGIN IMMEDIATE');
      try {
        // marca o uso primeiro: duas abas com o mesmo link não criam dois acessos
        if (!db.prepare('UPDATE convites_acesso SET usado_em = ? WHERE id = ? AND usado_em IS NULL').run(quando, c.id).changes) { db.exec('ROLLBACK'); return invalido(res); }
        if (c.tipo === 'convite') {
          const nome = String(body.nome).trim().slice(0, 80);
          const existente = db.prepare('SELECT id FROM users WHERE email = ?').get(c.email);
          if (existente) {
            userId = existente.id;
            db.prepare('UPDATE users SET pass = ?, name = ?, ativo = 1, desativado_em = NULL, is_super = ? WHERE id = ?').run(hashPassword(senha), nome, c.papel === 'super' ? 1 : 0, userId);
          } else {
            userId = newId();
            db.prepare('INSERT INTO users (id, email, name, pass, is_super, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(userId, c.email, nome, hashPassword(senha), c.papel === 'super' ? 1 : 0, quando);
          }
          if (c.papel !== 'super') {
            for (const t of db.prepare('SELECT id FROM tenants WHERE edition = ?').all(c.edicao)) {
              db.prepare('INSERT INTO memberships (user_id, tenant_id, role) VALUES (?, ?, ?) ON CONFLICT(user_id, tenant_id) DO UPDATE SET role = excluded.role').run(userId, t.id, c.papel);
            }
          }
        } else {
          db.prepare('UPDATE users SET pass = ? WHERE id = ? AND ativo != 0').run(hashPassword(senha), userId);
          encerrarAcessos(db, userId); // a senha antiga e as sessões abertas com ela deixam de valer
        }
        db.prepare('INSERT INTO audit (id, tenant_id, user_id, action, target, data, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?)')
          .run(newId(), userId, c.tipo === 'convite' ? 'usuario.convite_aceito' : 'usuario.senha_redefinida', c.id, JSON.stringify({ email: c.email, papel: c.papel, convidadoPor: c.criado_por }), quando);
        db.exec('COMMIT');
      } catch (e) { try { db.exec('ROLLBACK'); } catch { /* já desfeito */ } throw e; }
      return html(res, 200, 'Acesso criado', `<span class="k">Pronto</span><h1>${c.tipo === 'convite' ? 'Seu acesso está criado' : 'Senha trocada'}</h1><p>Entre no painel com <b>${esc(c.email)}</b> e a senha que você acabou de escolher.</p><a class="btn" href="/admin/">Entrar no painel</a>`);
    },
  },
];
