// Backup do banco do portal com o servidor ligado (VACUUM INTO = cópia consistente), guardando 14 dias.
// Uso: node portal/tools/backup.mjs [pasta-dos-dados] [pasta-dos-backups]
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = process.argv[2] || process.env.PORTAL_DATA_DIR || path.join(import.meta.dirname, '..', 'data');
const outDir = process.argv[3] || path.join(dataDir, 'backups');
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const dest = path.join(outDir, `portal-${stamp}.db`);
const db = new DatabaseSync(path.join(dataDir, 'portal.db'));
db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
db.close();
const check = new DatabaseSync(dest, { readOnly: true });
const ok = check.prepare('PRAGMA integrity_check').get();
check.close();
const old = fs.readdirSync(outDir).filter((f) => /^portal-.*\.db$/.test(f)).sort();
for (const f of old.slice(0, Math.max(0, old.length - 14))) fs.unlinkSync(path.join(outDir, f));
console.log(`backup ${dest} · integridade: ${Object.values(ok)[0]} · guardados: ${Math.min(old.length, 14)}`);
if (Object.values(ok)[0] !== 'ok') process.exit(1);
