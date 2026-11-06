// Junta o banco da edição SX no banco da edição Geral (um banco para as duas edições, base única de clientes).
//   node portal/tools/unificar-bancos.mjs <dados-destino> <dados-origem-sx> [--marcar-sx slug1,slug2]
// - Faz backup dos dois antes (VACUUM INTO em <dados>/backups/antes-de-unificar-*.db) e confere a integridade.
// - Operações da origem entram com edition = 'sx'. Usuários com o mesmo e-mail viram um só; pessoas com o mesmo e-mail também.
// - Nada é apagado; rodar de novo não duplica (INSERT OR IGNORE e mapeamento por e-mail).
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../lib/db.mjs';

const [destDir, srcDir] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const marcarIdx = process.argv.indexOf('--marcar-sx');
const marcar = marcarIdx > -1 ? String(process.argv[marcarIdx + 1] || '').split(',').filter(Boolean) : [];
if (!destDir || !srcDir) { console.error('uso: node portal/tools/unificar-bancos.mjs <dados-destino> <dados-origem-sx> [--marcar-sx slugs]'); process.exit(2); }

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
function backup(dir) {
  const dbFile = path.join(dir, 'portal.db');
  if (!fs.existsSync(dbFile)) throw new Error(`não achei ${dbFile}`);
  const out = path.join(dir, 'backups');
  fs.mkdirSync(out, { recursive: true });
  const dest = path.join(out, `antes-de-unificar-${stamp}.db`);
  const db = openDb(dbFile);
  db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  db.close();
  console.log(`backup: ${dest}`);
}
backup(destDir);
backup(srcDir);

const dest = openDb(path.join(destDir, 'portal.db'));
const src = openDb(path.join(srcDir, 'portal.db'));
const cols = (db, t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
const tables = src.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name)
  .filter((t) => dest.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t));
const SKIP = new Set(['sessions', 'oauth_codes']);          // sessões e códigos de login são efêmeros
const USER_COLS = ['user_id', 'created_by', 'by_user', 'owner_id'];
const report = {};

dest.exec('BEGIN IMMEDIATE');
try {
  // usuários: mesmo e-mail = mesma pessoa; senão entra com o mesmo id
  const userMap = new Map();
  for (const u of src.prepare('SELECT * FROM users').all()) {
    const ex = dest.prepare('SELECT id FROM users WHERE email = ?').get(u.email);
    if (ex) { userMap.set(u.id, ex.id); continue; }
    const c = cols(dest, 'users').filter((k) => k in u);
    dest.prepare(`INSERT OR IGNORE INTO users (${c.join(',')}) VALUES (${c.map(() => '?').join(',')})`).run(...c.map((k) => u[k]));
    userMap.set(u.id, u.id);
  }
  // pessoas: mesmo e-mail = mesma pessoa
  const contactMap = new Map();
  if (tables.includes('contacts')) {
    for (const c of src.prepare('SELECT * FROM contacts').all()) {
      const ex = c.email ? dest.prepare('SELECT id FROM contacts WHERE email = ?').get(c.email) : null;
      if (ex) { contactMap.set(c.id, ex.id); continue; }
      const k = cols(dest, 'contacts').filter((x) => x in c);
      dest.prepare(`INSERT OR IGNORE INTO contacts (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`).run(...k.map((x) => c[x]));
      contactMap.set(c.id, c.id);
    }
  }
  // operações que já existem no destino com o mesmo endereço ficam de fora (relatado)
  const skipTenants = new Set();
  for (const t of src.prepare('SELECT id, slug FROM tenants').all()) {
    const ex = dest.prepare('SELECT id FROM tenants WHERE slug = ?').get(t.slug);
    if (ex && ex.id !== t.id) { skipTenants.add(t.id); console.log(`AVISO: ${t.slug} já existe no destino com outro id; não foi copiada`); }
  }
  for (const t of tables) {
    if (SKIP.has(t) || t === 'users' || t === 'contacts') continue;
    const k = cols(dest, t).filter((x) => cols(src, t).includes(x));
    const ins = dest.prepare(`INSERT OR IGNORE INTO ${t} (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`);
    let n = 0;
    for (const row of src.prepare(`SELECT * FROM ${t}`).all()) {
      if (row.tenant_id && skipTenants.has(row.tenant_id)) continue;
      if (t === 'tenants' && skipTenants.has(row.id)) continue;
      const r = { ...row };
      if (t === 'tenants') r.edition = 'sx';
      for (const uc of USER_COLS) if (r[uc] && userMap.has(r[uc])) r[uc] = userMap.get(r[uc]);
      if (r.contact_id && contactMap.has(r.contact_id)) r.contact_id = contactMap.get(r.contact_id);
      n += ins.run(...k.map((x) => r[x])).changes;
    }
    if (n) report[t] = n;
  }
  for (const slug of marcar) {
    const c = dest.prepare("UPDATE tenants SET edition = 'sx' WHERE slug = ?").run(slug).changes;
    console.log(`${slug}: ${c ? 'marcada como SX' : 'não encontrada'}`);
  }
  dest.exec('COMMIT');
} catch (e) {
  dest.exec('ROLLBACK');
  console.error('ERRO, nada foi gravado:', e.message);
  process.exit(1);
}
const ok = Object.values(dest.prepare('PRAGMA integrity_check').get())[0];
const porEdicao = dest.prepare('SELECT edition, COUNT(*) n FROM tenants GROUP BY edition').all();
console.log('linhas copiadas:', JSON.stringify(report));
console.log('operações por edição:', JSON.stringify(porEdicao), '· integridade:', ok);
fs.writeFileSync(path.join(srcDir, 'UNIFICADO.txt'), `Este banco foi juntado em ${path.resolve(destDir)} em ${new Date().toISOString()}. Não é mais usado; fica como cópia.\n`);
