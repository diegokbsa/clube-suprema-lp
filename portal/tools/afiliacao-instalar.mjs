// Instala a operação "Afiliação" (edição Geral) com os blogs de afiliado servidos em kbsa.app/<slug>.
// Conteúdo em portal/conteudo/afiliacao/: links.json (chave -> link de afiliado), medicao.json (slug -> GA4/Clarity),
// e uma pasta por blog com site.json e posts/*.json. Idempotente: rodar de novo atualiza site, home, medição e o texto
// dos posts (reaplica links novos) sem duplicar nada.
//   node portal/tools/afiliacao-instalar.mjs --dados <pasta de dados do portal> [--seco] [--host kbsa.app]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb, now } from '../lib/db.mjs';
import { createTenant, audit } from '../lib/tenants.mjs';
import { cleanTheme } from '../lib/templates.mjs';
import { scoped, registerTable } from '../lib/repo.mjs';
import { gravarPagina } from '../lib/modules/paginas.mjs';
import { publishedData } from '../lib/modules/blog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const ARGS = process.argv.slice(2);
const opt = (k) => { const i = ARGS.indexOf(k); return i >= 0 ? ARGS[i + 1] : null; };
const DADOS = opt('--dados');
const SECO = ARGS.includes('--seco');
const HOST = opt('--host') || 'kbsa.app';
const CONTEUDO = opt('--conteudo') || path.join(ROOT, 'conteudo', 'afiliacao');
if (!DADOS) { console.error('uso: node portal/tools/afiliacao-instalar.mjs --dados <pasta de dados> [--seco] [--host kbsa.app]'); process.exit(2); }

const lerJson = (f, padrao) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : padrao);
const LINKS = lerJson(path.join(CONTEUDO, 'links.json'), {});
const MEDICAO = lerJson(path.join(CONTEUDO, 'medicao.json'), {});
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Troca {{LINK:chave}} pelo link de afiliado (ou pela página do produto enquanto a afiliação está pendente) e
 *  {{POST:slug}} pelo endereço público do post. Chave sem link vira o índice do blog, para não sair link quebrado. */
function aplicarLinks(texto, prefixo) {
  return String(texto)
    .replace(/\{\{LINK:([a-z0-9-]+)\}\}/g, (_m, k) => LINKS[k]?.url || `${prefixo}/blog`)
    .replace(/\{\{POST:([a-z0-9-]+)\}\}/g, (_m, s) => `${prefixo}/blog/${s}`);
}

function homeHtml(info, posts, ga4, prefixo) {
  const itens = posts.map((p) => `<li><a href="blog/${esc(p.slug)}"><strong>${esc(p.title)}</strong></a><br><span>${esc(p.excerpt)}</span></li>`).join('\n');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(info.nome)} · ${esc(info.tagline)}</title><meta name="description" content="${esc(info.descricao).slice(0, 160)}">
<link rel="canonical" href="${esc(prefixo)}/"><link rel="stylesheet" href="/assets/site.css"><link rel="alternate" type="application/rss+xml" href="blog/feed.xml">
<style>body{max-width:760px;margin:0 auto;padding:32px 16px;font-family:system-ui,sans-serif;line-height:1.6;color:#1d1d1f;background:#fff}
h1{font-size:2rem;margin:.2em 0}.tag{color:#5b4bd5;font-weight:600}ul{list-style:none;padding:0}li{padding:14px 0;border-bottom:1px solid #eee}
a{color:#5b4bd5}footer{margin-top:40px;font-size:.85rem;color:#666}</style></head><body>
<header><p class="tag">${esc(info.tagline)}</p><h1>${esc(info.nome)}</h1><p>${esc(info.home_intro || info.descricao)}</p></header>
<main><h2>Guias e artigos</h2><ul>${itens}</ul><p><a href="blog">Ver todos os artigos</a></p>
<section><h2>Sobre</h2><p>${esc(info.sobre || info.descricao)}</p></section></main>
<footer>${esc(info.nome)} · Este site pode conter links de afiliado: se você comprar por eles, recebemos uma comissão, sem custo extra para você.</footer>
</body></html>`;
}

registerTable('posts');
registerTable('paginas_proprias');
let arquivoDb = path.join(DADOS, 'portal.db');
let pastaSeco = null;
if (SECO) {
  pastaSeco = fs.mkdtempSync(path.join(os.tmpdir(), 'afiliacao-seco-'));
  const copia = path.join(pastaSeco, 'portal.db');
  const orig = openDb(arquivoDb); orig.exec(`VACUUM INTO '${copia.replace(/'/g, "''")}'`); orig.close();
  arquivoDb = copia;
}
const db = openDb(arquivoDb);
const relato = [];
const passo = (m) => { relato.push(m); console.log(`· ${m}`); };

try {
  let tenant = db.prepare("SELECT * FROM tenants WHERE edition = 'geral' AND slug = 'afiliacao'").get();
  if (!tenant) {
    ({ tenant } = createTenant(db, { name: 'Afiliação', number: '90001', niche: 'criador', slug: 'afiliacao', edition: 'geral',
      settings: { tagline: 'Blogs de afiliado do Kbsa', timezone: 'America/Sao_Paulo' } }));
    passo(`operação criada: Afiliação (${tenant.slug}), id ${tenant.id}`);
  } else passo(`operação já existia: ${tenant.slug}`);
  const repo = scoped(db, tenant.id);
  const tema = cleanTheme({ primary: '#5b4bd5', accent: '#5b4bd5', font: 'Inter', fontHead: 'Inter', radius: 10 });

  const blogs = fs.readdirSync(CONTEUDO, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(CONTEUDO, d.name, 'site.json'))).map((d) => d.name).sort();
  for (const slugBlog of blogs) {
    const dir = path.join(CONTEUDO, slugBlog);
    const info = lerJson(path.join(dir, 'site.json'), {});
    const dominio = `${HOST}/${slugBlog}`;
    const prefixo = `https://${dominio}`;
    const med = MEDICAO[slugBlog] || {};
    const tracking = JSON.stringify(Object.fromEntries(Object.entries({ ga4: med.ga4, clarity: med.clarity }).filter(([, v]) => v)));
    let site = db.prepare('SELECT * FROM sites WHERE domain = ?').get(dominio);
    if (site && site.tenant_id !== tenant.id) throw new Error(`${dominio} já está em outra operação`);
    const seo = JSON.stringify({ title: `${info.nome} · ${info.tagline}`.slice(0, 70), description: String(info.descricao || '').slice(0, 160) });
    if (!site) {
      let slug = `af-${slugBlog}`;
      for (let i = 2; db.prepare('SELECT 1 FROM sites WHERE slug = ?').get(slug); i++) slug = `af-${slugBlog}-${i}`;
      site = repo.insert('sites', { slug, name: info.nome, template_id: null, template_version: null, domain: dominio, theme: JSON.stringify(tema), seo, tracking, status: 'publicado' });
      passo(`site criado: ${dominio} (/s/${slug}/)`);
    } else {
      repo.update('sites', site.id, { name: info.nome, seo, tracking, status: 'publicado' });
      site = repo.get('sites', site.id);
      passo(`site atualizado: ${dominio}`);
    }

    const arquivos = fs.existsSync(path.join(dir, 'posts')) ? fs.readdirSync(path.join(dir, 'posts')).filter((f) => f.endsWith('.json')).sort() : [];
    const lista = [];
    let novos = 0; let atualizados = 0;
    for (const f of arquivos) {
      const a = lerJson(path.join(dir, 'posts', f), null);
      if (!a?.slug || !a?.content) continue;
      lista.push(a);
      const base = { site_id: site.id, title: String(a.title).slice(0, 120), slug: a.slug, excerpt: String(a.excerpt || '').slice(0, 300),
        content: aplicarLinks(a.content, prefixo), category: String(a.category || info.categoria || 'Geral').slice(0, 80),
        tags: JSON.stringify((a.tags || []).slice(0, 20)), author: info.autor || `Equipe ${info.nome}`, cover_url: null,
        seo_title: String(a.seoTitle || '').slice(0, 70), seo_description: String(a.seoDescription || '').slice(0, 170) };
      const atual = repo.get('posts', { site_id: site.id, slug: a.slug });
      const at = atual?.published_at || now();
      const pub = { ...base, status: 'publicado', scheduled_at: null, published_at: at, published_slug: a.slug, published_data: JSON.stringify(publishedData(base, at)) };
      if (!atual) { repo.insert('posts', pub); novos++; } else { repo.update('posts', atual.id, pub); atualizados++; }
    }
    gravarPagina(repo, { siteId: site.id, caminho: '', html: homeHtml(info, lista, med.ga4, prefixo), titulo: info.nome, indexar: true });
    passo(`${slugBlog}: ${novos} posts novos, ${atualizados} atualizados, home gravada, medição ${tracking}`);
  }
  const pendentes = Object.entries(LINKS).filter(([, v]) => v.status !== 'ativo').map(([k]) => k);
  if (pendentes.length) passo(`links ainda sem afiliação ativa (apontam para a página do produto): ${pendentes.join(', ')}`);
  audit(db, { tenantId: tenant.id, action: 'afiliacao.instalar', target: tenant.id, data: { blogs: blogs.length } });
  if (SECO) passo('ensaio (--seco): rodou numa cópia do banco; o original não mudou');
  console.log(JSON.stringify({ ok: true, tenant: tenant.id, blogs, relato }));
} catch (e) {
  console.log(JSON.stringify({ ok: false, erro: e.message, relato }));
  process.exitCode = 1;
} finally {
  db.close();
  if (pastaSeco) { try { fs.rmSync(pastaSeco, { recursive: true, force: true }); } catch { /* temporário */ } }
}
