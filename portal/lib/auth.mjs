// Login, sessões, papéis e cofre de segredos. Permissões são decididas AQUI, no servidor; o front só esconde botões.
import { scryptSync, randomBytes, timingSafeEqual, createCipheriv, createDecipheriv, createHash, createHmac } from 'node:crypto';
import { id as newId, now } from './db.mjs';

export const ROLES = {
  admin: 'Administrador da operação',
  marketing: 'Gestor de marketing',
  editor: 'Editor',
  affiliate: 'Afiliado',
};

const ALL = ['tenant.read', 'tenant.manage', 'users.manage', 'site.read', 'site.edit', 'site.publish', 'blog.read', 'blog.edit', 'blog.publish',
  'media.read', 'media.edit', 'leads.read', 'leads.edit', 'leads.export', 'affiliates.read', 'affiliates.manage', 'affiliate.self',
  'creatives.read', 'creatives.edit', 'creatives.approve', 'calendar.read', 'calendar.edit', 'social.publish', 'integrations.read',
  'integrations.manage', 'campaigns.read', 'campaigns.edit', 'campaigns.publish', 'commissions.read', 'commissions.manage', 'reports.read', 'audit.read',
  'ai.connect', 'ugc.read', 'ugc.edit', 'ugc.approve'];

const PERMS = {
  admin: new Set(ALL.filter((p) => p !== 'affiliate.self')),
  marketing: new Set(['tenant.read', 'site.read', 'site.edit', 'site.publish', 'blog.read', 'blog.edit', 'blog.publish', 'media.read', 'media.edit',
    'leads.read', 'leads.edit', 'leads.export', 'affiliates.read', 'creatives.read', 'creatives.edit', 'creatives.approve', 'calendar.read',
    'calendar.edit', 'social.publish', 'integrations.read', 'campaigns.read', 'campaigns.edit', 'commissions.read', 'reports.read', 'ai.connect',
    'ugc.read', 'ugc.edit']),
  editor: new Set(['tenant.read', 'site.read', 'site.edit', 'blog.read', 'blog.edit', 'media.read', 'media.edit', 'creatives.read', 'creatives.edit',
    'calendar.read', 'calendar.edit', 'ai.connect', 'ugc.read', 'ugc.edit']),
  affiliate: new Set(['affiliate.self', 'ai.connect', 'creatives.read', 'creatives.edit']),
};
export const PERMISSIONS = ALL;

/** O usuário pode `perm` nesta operação? Superadmin pode tudo. */
export function can(user, role, perm) {
  if (!user) return false;
  if (user.is_super) return true;
  return Boolean(role && PERMS[role]?.has(perm));
}
export const permsOf = (user, role) => (user?.is_super ? ALL : [...(PERMS[role] || [])]);

// ---------- senha (scrypt) ----------
export function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = scryptSync(String(pw), salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
export function checkPassword(pw, stored) {
  const [alg, salt, key] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !key) return false;
  const want = Buffer.from(key, 'base64');
  const got = scryptSync(String(pw), Buffer.from(salt, 'base64'), want.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(want, got);
}
export function passwordProblem(pw) {
  const s = String(pw || '');
  if (s.length < 10) return 'Use pelo menos 10 caracteres.';
  if (!/[a-z]/i.test(s) || !/\d/.test(s)) return 'Misture letras e números.';
  return null;
}

// ---------- sessões ----------
const SESSION_DAYS = 7;
const sha = (t) => createHash('sha256').update(t).digest('hex');

export function createSession(db, userId) {
  const token = randomBytes(32).toString('base64url');
  const csrf = randomBytes(18).toString('base64url');
  db.prepare('INSERT INTO sessions (token, user_id, csrf, expires_at) VALUES (?, ?, ?, ?)')
    .run(sha(token), userId, csrf, Date.now() + SESSION_DAYS * 864e5);
  return { token, csrf, maxAge: SESSION_DAYS * 86400 };
}
export function readSession(db, token) {
  if (!token) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(sha(token));
  if (!s || s.expires_at < Date.now()) return null;
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(s.user_id);
  if (!u || u.ativo === 0) return null; // desativado perde a sessão na hora
  return { user: { id: u.id, email: u.email, name: u.name, is_super: u.is_super }, csrf: s.csrf };
}
export function dropSession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(sha(token));
}

export function membership(db, user, tenantId) {
  if (!user) return null;
  const m = db.prepare('SELECT role FROM memberships WHERE user_id = ? AND tenant_id = ?').get(user.id, tenantId);
  return m?.role || null;
}

export function createUser(db, { email, name, password, isSuper = false }) {
  const row = { id: newId(), email: String(email).trim().toLowerCase(), name: String(name || email).trim(), pass: hashPassword(password),
    is_super: isSuper ? 1 : 0, created_at: now() };
  db.prepare('INSERT INTO users (id, email, name, pass, is_super, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(row.id, row.email, row.name, row.pass, row.is_super, row.created_at);
  return { id: row.id, email: row.email, name: row.name, is_super: row.is_super };
}

// ---------- cofre: segredos de integrações (AES-256-GCM com a chave do servidor) ----------
export function vault(secretKey) {
  const key = createHash('sha256').update(String(secretKey)).digest();
  return {
    seal(plain) {
      if (plain == null || plain === '') return null;
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', key, iv);
      const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
      return `v1.${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
    },
    open(sealed) {
      if (!sealed) return null;
      const [v, iv, tag, enc] = String(sealed).split('.');
      if (v !== 'v1') return null;
      const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
      d.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8');
    },
  };
}

/** Mostra só o final de um segredo (para a tela dizer "token ••••1a2b" sem revelar). */
export const mask = (s) => (s ? `••••${String(s).slice(-4)}` : '');

export const hmac = (secret, body) => createHmac('sha256', secret).update(body).digest('hex');
export function safeEqualHex(a, b) {
  const x = Buffer.from(String(a || ''), 'hex');
  const y = Buffer.from(String(b || ''), 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
