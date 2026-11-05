// Repositório com escopo de operação: a ÚNICA porta de leitura e escrita para dados de uma operação.
// Toda consulta leva "tenant_id = ?" e todo insert grava o tenant. Módulos novos registram suas tabelas com registerTable().
import { id as newId, now } from './db.mjs';

const TABLES = new Set(['sites', 'pages', 'page_versions', 'leads', 'lead_events', 'affiliates', 'clicks', 'conversions', 'integrations', 'calendar', 'audit']);
const NAME = /^[a-z_][a-z0-9_]*$/;

export function registerTable(name) {
  if (!NAME.test(name)) throw new Error(`nome de tabela inválido: ${name}`);
  TABLES.add(name);
}

function table(name) {
  if (!TABLES.has(name)) throw new Error(`tabela fora do escopo de operação: ${name}`);
  return name;
}

const COLUMNS = new WeakMap();
function columnsOf(db, name) {
  let byTable = COLUMNS.get(db);
  if (!byTable) COLUMNS.set(db, (byTable = new Map()));
  if (!byTable.has(name)) byTable.set(name, new Set(db.prepare(`PRAGMA table_info(${name})`).all().map((c) => c.name)));
  return byTable.get(name);
}

function cols(obj) {
  const keys = Object.keys(obj);
  for (const k of keys) if (!NAME.test(k)) throw new Error(`coluna inválida: ${k}`);
  return keys;
}

/** where: objeto { coluna: valor } (igualdade) ; extra: trecho SQL opcional com parâmetros próprios. */
export function scoped(db, tenantId) {
  if (!tenantId) throw new Error('operação obrigatória');
  const whereSql = (where = {}) => {
    const keys = cols(where);
    return { sql: ['tenant_id = ?', ...keys.map((k) => (where[k] === null ? `${k} IS NULL` : `${k} = ?`))].join(' AND '),
      params: [tenantId, ...keys.filter((k) => where[k] !== null).map((k) => where[k])] };
  };
  return {
    tenantId,
    all(name, where = {}, { order = 'rowid DESC', limit = 500, extra = '', extraParams = [] } = {}) {
      if (!/^[a-z_, ]+( (ASC|DESC))?$/i.test(order)) throw new Error('ordem inválida');
      const w = whereSql(where);
      return db.prepare(`SELECT * FROM ${table(name)} WHERE ${w.sql} ${extra ? `AND (${extra})` : ''} ORDER BY ${order} LIMIT ?`)
        .all(...w.params, ...extraParams, Math.min(Number(limit) || 500, 5000));
    },
    get(name, idOrWhere) {
      const w = whereSql(typeof idOrWhere === 'string' ? { id: idOrWhere } : idOrWhere);
      return db.prepare(`SELECT * FROM ${table(name)} WHERE ${w.sql} LIMIT 1`).get(...w.params) || null;
    },
    count(name, where = {}, extra = '', extraParams = []) {
      const w = whereSql(where);
      return db.prepare(`SELECT COUNT(*) n FROM ${table(name)} WHERE ${w.sql} ${extra ? `AND (${extra})` : ''}`).get(...w.params, ...extraParams).n;
    },
    insert(name, obj) {
      const row = { id: newId(), ...obj, tenant_id: tenantId };
      const has = columnsOf(db, table(name));
      if (has.has('created_at')) row.created_at ??= now();
      if (has.has('updated_at')) row.updated_at ??= now();
      const keys = cols(row);
      db.prepare(`INSERT INTO ${table(name)} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...keys.map((k) => row[k]));
      return row;
    },
    update(name, idValue, patch) {
      const p = { ...patch };
      delete p.id; delete p.tenant_id;
      if (!Object.keys(p).length) return this.get(name, idValue);
      if (columnsOf(db, table(name)).has('updated_at')) p.updated_at ??= now();
      const keys = cols(p);
      const r = db.prepare(`UPDATE ${table(name)} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE tenant_id = ? AND id = ?`)
        .run(...keys.map((k) => p[k]), tenantId, idValue);
      return r.changes ? this.get(name, idValue) : null;
    },
    remove(name, idValue) {
      return db.prepare(`DELETE FROM ${table(name)} WHERE tenant_id = ? AND id = ?`).run(tenantId, idValue).changes > 0;
    },
  };
}
