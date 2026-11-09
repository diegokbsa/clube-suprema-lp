// Regrava só as páginas próprias do hotpoker.club (raiz + /1 a /4) a partir de conteudo/hot-poker/site/,
// sem mexer em operação, dono, senha, settings nem posts (para isso existe o hot-poker-instalar.mjs).
//   node portal/tools/hot-poker-paginas.mjs --dados <pasta de dados do portal> [--seco]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../lib/db.mjs';
import { scoped, registerTable } from '../lib/repo.mjs';
import { gravarPagina } from '../lib/modules/paginas.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = process.argv.slice(2);
const DADOS = ARGS[ARGS.indexOf('--dados') + 1];
const SECO = ARGS.includes('--seco');
if (!ARGS.includes('--dados') || !DADOS) { console.error('uso: node portal/tools/hot-poker-paginas.mjs --dados <pasta> [--seco]'); process.exit(2); }

const SITE_DIR = path.join(ROOT, 'conteudo', 'hot-poker', 'site');
const PAGINAS = [
  { caminho: '', arquivo: 'raiz.html', titulo: 'Hot Poker · muro de lambe-lambe', indexar: true },
  { caminho: '1', arquivo: '1.html', titulo: 'Hot Poker · escala de calor', indexar: false },
  { caminho: '2', arquivo: '2.html', titulo: 'Hot Poker · álbum de figurinhas', indexar: false },
  { caminho: '3', arquivo: '3.html', titulo: 'Hot Poker · radar de raios', indexar: false },
  { caminho: '4', arquivo: '4.html', titulo: 'Hot Poker · caixa de fósforos', indexar: false },
];

registerTable('paginas_proprias');
const db = openDb(path.join(DADOS, 'portal.db'));
const site = db.prepare('SELECT * FROM sites WHERE domain = ?').get('hotpoker.club');
if (!site) { console.log(JSON.stringify({ ok: false, erro: 'site hotpoker.club não encontrado' })); process.exit(1); }
const repo = scoped(db, site.tenant_id);
const feitas = [];
if (!SECO) db.exec('BEGIN');
try {
  for (const p of PAGINAS) {
    const html = fs.readFileSync(path.join(SITE_DIR, p.arquivo), 'utf8');
    if (!SECO) gravarPagina(repo, { siteId: site.id, caminho: p.caminho, html, titulo: p.titulo, indexar: p.indexar });
    feitas.push(`/${p.caminho}`);
  }
  if (!SECO) db.exec('COMMIT');
} catch (e) { if (!SECO) db.exec('ROLLBACK'); throw e; }
console.log(JSON.stringify({ ok: true, seco: SECO, site: site.slug, paginas: feitas }));
