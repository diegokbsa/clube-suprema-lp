-- Base única de clientes da instalação (as duas edições usam o mesmo banco).
-- Uma pessoa existe uma vez só; o relacionamento com cada operação está nos leads (tenant_id + contact_id).
-- Cada operação só enxerga as pessoas que chegaram por ela; a visão da base inteira é do superadmin.
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  phone TEXT,
  name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS contacts_phone ON contacts (phone);
