// Confere todos os modelos de portal/templates/: esquema, blocos conhecidos, página inicial e diferença real entre modelos.
// Uso: node portal/tools/validar-modelos.mjs   (sai com código 1 se algum modelo tiver problema)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { templateProblems } from '../lib/templates.mjs';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');
let bad = 0;
const signatures = new Map();
const FAKE = /(\d+[.,]?\d*\s*(mil|k)?\s*(jogadores|clientes|alunos|membros)\s+(ativos|satisfeitos))|depoimento real|garantimos lucro/i;

for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.json')).sort()) {
  let t;
  try { t = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { console.log(`✗ ${f}: JSON inválido (${e.message})`); bad++; continue; }
  const errs = templateProblems(t);
  if (`${t.id}.json` !== f) errs.push(`o arquivo deve se chamar ${t.id}.json`);
  const home = t.pages?.find((p) => p.slug === '');
  const sig = (home?.blocks || []).map((b) => `${b.type}:${b.props?.variant || ''}`).join('|');
  if (signatures.has(sig)) errs.push(`página inicial com a mesma composição de ${signatures.get(sig)} (mude blocos, ordem ou variantes, não só cores)`);
  signatures.set(sig, t.id);
  if (FAKE.test(JSON.stringify(t))) errs.push('texto parece apresentar métrica ou depoimento fictício como real');
  if ((t.pages || []).length < 2) errs.push('o modelo precisa de pelo menos uma página interna além do início');
  if (errs.length) { bad++; console.log(`✗ ${f}\n   - ${errs.join('\n   - ')}`); } else console.log(`✓ ${f} (${t.pages.length} páginas, ${home.blocks.length} blocos no início)`);
}
console.log(bad ? `\n${bad} modelo(s) com problema.` : `\nTodos os modelos válidos (${signatures.size}).`);
process.exit(bad ? 1 : 0);
