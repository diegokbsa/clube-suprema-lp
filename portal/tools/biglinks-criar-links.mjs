// Cria no BigLinks (kbsa.app/biglinks) um link curto l.kbsa.app/<chave> para cada produto ATIVO de
// conteudo/afiliacao/links.json e grava o campo "curto" no links.json. O instalador da afiliação passa a usar o link curto:
// o BigLinks conta o clique (com utm_campaign = <blog>_<post>) e repassa o src ao checkout da Hotmart/Kiwify.
// A chave secreta (bl_sk_…, escopos links:ler e links:escrever) vem de BIGLINKS_CHAVE ou do arquivo --chave-arquivo;
// ela nunca é impressa nem gravada.
//   node portal/tools/biglinks-criar-links.mjs --chave-arquivo <arquivo> [--gravar] [--api https://kbsa.app/biglinks/api/v1] [--curto https://l.kbsa.app]
// Sem --gravar, só mostra o que faria (não cria nada no BigLinks e não muda o links.json).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ARGS = process.argv.slice(2);
const opt = (k, d) => { const i = ARGS.indexOf(k); return i >= 0 ? ARGS[i + 1] : d; };
const GRAVAR = ARGS.includes('--gravar');
const API = opt('--api', 'https://kbsa.app/biglinks/api/v1').replace(/\/$/, '');
const CURTO = opt('--curto', 'https://l.kbsa.app').replace(/\/$/, '');
const LINKS_JSON = opt('--links', path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'conteudo', 'afiliacao', 'links.json'));
const arqChave = opt('--chave-arquivo', null);
const CHAVE = (process.env.BIGLINKS_CHAVE || (arqChave ? fs.readFileSync(arqChave, 'utf8') : '')).trim();
if (!/^bl_sk_[A-Za-z0-9_-]{8,}$/.test(CHAVE)) { console.error('chave do BigLinks ausente ou inválida (esperado bl_sk_…; use --chave-arquivo)'); process.exit(2); }

const api = async (metodo, rota, corpo) => {
  const r = await fetch(`${API}${rota}`, { method: metodo, headers: { Authorization: `Bearer ${CHAVE}`, 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  const texto = await r.text();
  let json = null; try { json = JSON.parse(texto); } catch { /* resposta sem JSON */ }
  return { status: r.status, json };
};
const lista = (j) => (Array.isArray(j) ? j : j?.dados || j?.data || j?.itens || j?.links || []);

const links = JSON.parse(fs.readFileSync(LINKS_JSON, 'utf8'));
const relato = [];
for (const [chave, v] of Object.entries(links)) {
  if (v.status !== 'ativo' || !v.url) continue;
  if (!/^[a-z0-9-]+$/.test(chave)) { relato.push({ chave, erro: 'chave fora do padrão de slug' }); continue; }
  const curto = `${CURTO}/${chave}`;
  if (v.curto === curto) { relato.push({ chave, ok: 'já tinha link curto' }); continue; }
  if (!GRAVAR) { relato.push({ chave, faria: `${curto} -> ${new URL(v.url).host}` }); continue; }

  let r = await api('POST', '/links', { titulo: `Blogs kbsa.app · ${chave}`, slug: chave, destinoPadrao: v.url, tags: ['kbsa-blogs', 'afiliacao'], tracking: { repassarParametros: true } });
  if (r.status >= 400) {
    // slug já existe? só reaproveita se apontar para o mesmo destino
    const busca = await api('GET', `/links?q=${encodeURIComponent(chave)}`);
    const achado = lista(busca.json).find((l) => l.slug === chave);
    if (!achado) { relato.push({ chave, erro: `BigLinks ${r.status} ${r.json?.erro?.codigo || r.json?.codigo || ''}`.trim() }); continue; }
    if (achado.destinoPadrao !== v.url) { relato.push({ chave, erro: 'slug já existe no BigLinks com outro destino; não mexi' }); continue; }
  }
  // confere sem contar clique (HEAD não grava visita): o link curto manda para o mesmo checkout e repassa o src
  const teste = await fetch(`${curto}?src=teste_biglinks`, { method: 'HEAD', redirect: 'manual' });
  const destino = teste.headers.get('location') || '';
  if (teste.status !== 302 || !destino.startsWith(v.url.split('?')[0]) || !/[?&]src=teste_biglinks/.test(destino)) {
    relato.push({ chave, erro: `redirecionamento não confere (HTTP ${teste.status})` });
    continue;
  }
  v.curto = curto;
  relato.push({ chave, ok: curto });
}
if (GRAVAR) fs.writeFileSync(LINKS_JSON, `${JSON.stringify(links, null, 2)}\n`);
const erros = relato.filter((x) => x.erro).length;
console.log(JSON.stringify({ ok: erros === 0, gravado: GRAVAR, total: relato.length, erros, relato }, null, 1));
process.exit(erros ? 1 : 0);
