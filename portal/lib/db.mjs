// Banco do portal: SQLite embutido do Node (node:sqlite), sem dependências.
// Esquema = todos os arquivos de lib/schema/*.sql em ordem de nome (cada módulo traz o seu: 20-blog.sql, 70-commissions.sql...).
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from './migrations.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA_DIR = path.join(HERE, 'schema');

export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export const parse = (txt, fallback = null) => {
  if (txt == null) return fallback;
  try { return JSON.parse(txt); } catch { return fallback; }
};
export const json = (v) => JSON.stringify(v ?? null);

/** Abre (ou cria) o banco. `file` = ':memory:' nos testes. */
export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  for (const f of fs.readdirSync(SCHEMA_DIR).filter((n) => n.endsWith('.sql')).sort()) {
    db.exec(fs.readFileSync(path.join(SCHEMA_DIR, f), 'utf8'));
  }
  migrate(db);
  return db;
}

/** Executa fn numa transação (BEGIN IMMEDIATE), com rollback se lançar erro. */
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
