// Armazenamento simples em arquivo JSON (data/db.json, ou DATA_DIR/db.json).
// Bom para testes e volume baixo; trocar por um banco (ex.: Postgres) antes de escalar.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL('../data/', import.meta.url));
const FILE = path.join(DATA_DIR, 'db.json');

const db = load();
let saveTimer = null;

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { signups: parsed.signups ?? {}, deposits: parsed.deposits ?? {}, leads: parsed.leads ?? {} };
  } catch {
    return { signups: {}, deposits: {}, leads: {} };
  }
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 50);
}

function flush() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
}

const byNewest = (a, b) => b.createdAt.localeCompare(a.createdAt);

function collection(name) {
  return {
    get: (id) => db[name][id] ?? null,
    save(item) {
      item.updatedAt = new Date().toISOString();
      db[name][item.id] = item;
      persist();
      return item;
    },
    list: () => Object.values(db[name]).sort(byNewest),
  };
}

const signups = collection('signups');
const deposits = collection('deposits');
const leads = collection('leads');

export const store = {
  getSignup: signups.get,
  saveSignup: signups.save,
  listSignups: signups.list,

  getDeposit: deposits.get,
  saveDeposit: deposits.save,
  listDeposits: deposits.list,
  depositsOf: (signupId) => deposits.list().filter((d) => d.signupId === signupId),

  getLead: leads.get,
  saveLead: leads.save,
  listLeads: leads.list,
  findLeadByEmail: (email) => leads.list().find((l) => l.email === email) ?? null,
};
