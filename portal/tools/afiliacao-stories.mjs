// Web Stories dos blogs de afiliado: grava <domínio>/stories/<slug> (AMP, página própria indexável, entra no sitemap) para
// cada post com capa e avisa o IndexNow só das stories novas ou mudadas. Roda DEPOIS do afiliacao-instalar.mjs (usa os sites
// que ele criou). Não mexe em post, site.json nem no instalador. Pôster e logo vêm de tools/afiliacao-capas.mjs.
//   node portal/tools/afiliacao-stories.mjs --dados <pasta de dados do portal> [--seco] [--sem-indexnow] [--blog <slug>] [--host kbsa.app]
// IndexNow: chave derivada do segredo do servidor (PORTAL_SECRET_KEY ou <dados>/.chave-do-cofre), lida aqui e nunca impressa.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../lib/db.mjs';
import { scoped, registerTable } from '../lib/repo.mjs';
import { gravarPagina } from '../lib/modules/paginas.mjs';
import { indexNowKey, INDEXNOW_ENDPOINT } from '../lib/seo.mjs';
import { renderStory, comOrigem, posterDa } from './afiliacao-visual.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLICO = path.join(ROOT, 'public');
const ARGS = process.argv.slice(2);
const opt = (k) => { const i = ARGS.indexOf(k); return i >= 0 ? ARGS[i + 1] : null; };
const DADOS = opt('--dados');
const SECO = ARGS.includes('--seco');
const HOST = opt('--host') || 'kbsa.app';
const CONTEUDO = opt('--conteudo') || path.join(ROOT, 'conteudo', 'afiliacao');
if (!DADOS) { console.error('uso: node portal/tools/afiliacao-stories.mjs --dados <pasta de dados> [--seco] [--sem-indexnow] [--blog <slug>]'); process.exit(2); }

const lerJson = (f, padrao) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : padrao);
const LINKS = lerJson(path.join(CONTEUDO, 'links.json'), {});
for (const v of Object.values(LINKS)) if (v?.curto && /^https:\/\/l\.kbsa\.app\/[a-z0-9-]+$/.test(v.curto)) { v.destino = v.url; v.url = v.curto; } // igual ao instalador: sai pelo BigLinks
const DADOS_VITRINE = { catalogo: lerJson(path.join(CONTEUDO, 'produtos.json'), {}), links: LINKS };

registerTable('paginas_proprias');
const db = openDb(path.join(DADOS, 'portal.db'));
const relato = [];
const avisar = [];
try {
  const blogs = fs.readdirSync(CONTEUDO).filter((d) => fs.existsSync(path.join(CONTEUDO, d, 'vitrine.json')) && (!opt('--blog') || d === opt('--blog'))).sort();
  for (const blog of blogs) {
    const info = lerJson(path.join(CONTEUDO, blog, 'site.json'), {});
    const v = lerJson(path.join(CONTEUDO, blog, 'vitrine.json'), {});
    const dominio = info.dominio ? String(info.dominio).trim().toLowerCase() : `${HOST}/${blog}`;
    const site = db.prepare('SELECT * FROM sites WHERE domain = ?').get(dominio);
    if (!site) { relato.push({ blog, erro: `site ${dominio} não está no banco (rode o instalador antes)` }); continue; }
    const repo = scoped(db, site.tenant_id);
    const prefixo = `https://${dominio}`;
    const dir = path.join(CONTEUDO, blog, 'posts');
    let novas = 0; let iguais = 0; let semImagem = 0;
    const mudadas = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
      const post = lerJson(path.join(dir, f), null);
      if (!post?.slug || !post?.content || post.redirect) continue; // post fundido (301) não ganha story
      const html = renderStory({ info, v, post, prefixo, dados: DADOS_VITRINE });
      if (!html) continue; // sem capa, sem story
      if (!fs.existsSync(path.join(PUBLICO, posterDa(post.cover).replace(/^\/+/, '')))) { semImagem++; continue; } // pôster ainda não gerado
      const doc = comOrigem(html, `${blog}-story-${post.slug}`);
      const caminho = `stories/${post.slug}`;
      const atual = repo.get('paginas_proprias', { site_id: site.id, caminho });
      if (atual?.html === doc) { iguais++; continue; }
      if (!SECO) gravarPagina(repo, { siteId: site.id, caminho, html: doc, titulo: `Story: ${post.title}`, indexar: true });
      novas++; mudadas.push(`/${caminho}`);
    }
    relato.push({ blog, dominio, gravadas: novas, iguais, sem_poster: semImagem });
    if (mudadas.length && info.dominio) avisar.push({ blog, site, origem: prefixo, urls: mudadas.map((c) => `${prefixo}${c}`) });
  }
} finally { db.close(); }

// IndexNow só das stories novas ou mudadas, por domínio próprio (a chave fica na raiz do domínio)
const indexnow = [];
if (!SECO && !ARGS.includes('--sem-indexnow') && avisar.length) {
  const cofre = path.join(DADOS, '.chave-do-cofre');
  const segredo = process.env.PORTAL_SECRET_KEY || (fs.existsSync(cofre) ? fs.readFileSync(cofre, 'utf8').trim() : '');
  for (const a of avisar) {
    if (!segredo) { indexnow.push({ blog: a.blog, indexnow: 'sem segredo do servidor; nada enviado' }); continue; }
    const key = indexNowKey(segredo, a.site.id);
    const status = await fetch(INDEXNOW_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: new URL(a.origem).host, key, keyLocation: `${a.origem}/${key}.txt`, urlList: a.urls.slice(0, 10000) }), signal: AbortSignal.timeout(20000) })
      .then((r) => r.status).catch((e) => e.message);
    indexnow.push({ blog: a.blog, urls: a.urls.length, indexnow: status });
  }
}
const ok = relato.every((r) => !r.erro);
console.log(JSON.stringify({ ok, seco: SECO, relato, indexnow }));
if (!ok) process.exitCode = 1;
