// Migrações de bancos já existentes: só acrescentam (coluna, índice, dado derivado). Nunca apagam.
// Rodam depois dos arquivos de esquema, a cada início, e são idempotentes.
import { randomUUID } from 'node:crypto';

const has = (db, table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);

export const normEmail = (e) => String(e || '').trim().toLowerCase().slice(0, 120) || null;
export const normPhone = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return d.length <= 11 ? `55${d}` : d.slice(0, 15); // BR sem DDI ganha 55
};

/** Acha ou cria a pessoa na base única. E-mail manda; telefone completa ou acha quando não há e-mail. */
export function upsertContact(db, { email, phone, name }) {
  const e = normEmail(email);
  const ph = normPhone(phone);
  if (!e && !ph) return null;
  const now = new Date().toISOString();
  let c = e ? db.prepare('SELECT * FROM contacts WHERE email = ?').get(e) : null;
  if (!c && ph) c = db.prepare('SELECT * FROM contacts WHERE phone = ? AND (email IS NULL OR ? IS NULL) LIMIT 1').get(ph, e);
  if (c) {
    // só completa o que falta: uma operação nova não sobrescreve nome nem telefone que a pessoa deixou em outra
    db.prepare('UPDATE contacts SET email = COALESCE(email, ?), phone = COALESCE(phone, ?), name = COALESCE(name, ?), updated_at = ? WHERE id = ?')
      .run(e, ph, name ? String(name).slice(0, 80) : null, now, c.id);
    return c.id;
  }
  const id = randomUUID();
  db.prepare('INSERT INTO contacts (id, email, phone, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, e, ph, name ? String(name).slice(0, 80) : null, now, now);
  return id;
}

export function migrate(db) {
  if (!has(db, 'tenants', 'edition')) db.exec("ALTER TABLE tenants ADD COLUMN edition TEXT NOT NULL DEFAULT 'geral'");
  if (!has(db, 'leads', 'contact_id')) db.exec('ALTER TABLE leads ADD COLUMN contact_id TEXT');
  for (const col of ['contact_name', 'contact_email', 'contact_phone']) {
    if (!has(db, 'conversations', col)) db.exec(`ALTER TABLE conversations ADD COLUMN ${col} TEXT`);
  }
  db.exec('CREATE INDEX IF NOT EXISTS tenants_edition ON tenants (edition)');
  db.exec('CREATE INDEX IF NOT EXISTS leads_contact ON leads (contact_id)');
  // leads antigos sem pessoa: liga na base única (uma vez; depois o formulário já grava)
  const soltos = db.prepare('SELECT id, email, phone, name FROM leads WHERE contact_id IS NULL AND (email IS NOT NULL OR phone IS NOT NULL) LIMIT 5000').all();
  for (const l of soltos) {
    const cid = upsertContact(db, l);
    if (cid) db.prepare('UPDATE leads SET contact_id = ? WHERE id = ?').run(cid, l.id);
  }
}
