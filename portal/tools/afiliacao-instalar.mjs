// Instala a operação "Afiliação" (edição Geral) com os blogs de afiliado servidos em kbsa.app/<slug>.
// Conteúdo em portal/conteudo/afiliacao/: links.json (chave -> link de afiliado), medicao.json (slug -> GA4/Clarity),
// e uma pasta por blog com site.json e posts/*.json. Idempotente: rodar de novo atualiza site, home, medição e o texto
// dos posts (reaplica links novos) sem duplicar nada.
// Desde 08/11/2026 (Kbsa: "1 cliente pra cada"), cada blog é uma operação (cliente) própria no painel, blog-<slug>;
// um blog que estava na operação única "Afiliação" é movido para a dele com tudo o que pende do site (posts,
// páginas, leads, cliques...). Quem era membro da "Afiliação" vira membro de cada cliente, com o mesmo papel.
// --cliente-unico mantém o jeito antigo (todos os blogs numa operação só).
//   node portal/tools/afiliacao-instalar.mjs --dados <pasta de dados do portal> [--seco] [--host kbsa.app] [--cliente-unico]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb, now, tx } from '../lib/db.mjs';
import { createTenant, audit } from '../lib/tenants.mjs';
import { cleanTheme } from '../lib/templates.mjs';
import { scoped, registerTable } from '../lib/repo.mjs';
import { gravarPagina } from '../lib/modules/paginas.mjs';
import { publishedData } from '../lib/modules/blog.mjs';
import { renderHome, renderLista, renderPost, comOrigem, capaDo } from './afiliacao-visual.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const PUBLICO = path.join(ROOT, 'public');
const ARGS = process.argv.slice(2);
const opt = (k) => { const i = ARGS.indexOf(k); return i >= 0 ? ARGS[i + 1] : null; };
const DADOS = opt('--dados');
const SECO = ARGS.includes('--seco');
const CLIENTE_UNICO = ARGS.includes('--cliente-unico');
const HOST = opt('--host') || 'kbsa.app';
const CONTEUDO = opt('--conteudo') || path.join(ROOT, 'conteudo', 'afiliacao');
if (!DADOS) { console.error('uso: node portal/tools/afiliacao-instalar.mjs --dados <pasta de dados> [--seco] [--host kbsa.app]'); process.exit(2); }

const lerJson = (f, padrao) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : padrao);
const LINKS = lerJson(path.join(CONTEUDO, 'links.json'), {});
// BigLinks: produto com link curto ("curto": "https://l.kbsa.app/<chave>") sai pelo encurtador, que conta o clique e manda
// para o checkout ("url" vira "destino", só para referência). Sem "curto", o link vai direto ao checkout, como antes.
for (const v of Object.values(LINKS)) if (v?.curto && /^https:\/\/l\.kbsa\.app\/[a-z0-9-]+$/.test(v.curto)) { v.destino = v.url; v.url = v.curto; }
const MEDICAO = lerJson(path.join(CONTEUDO, 'medicao.json'), {});
const CATALOGO = lerJson(path.join(CONTEUDO, 'produtos.json'), {});
const DADOS_VITRINE = { catalogo: CATALOGO, links: LINKS };
const ATIVOS = new Set(Object.entries(LINKS).filter(([, v]) => v.status === 'ativo' && v.url).map(([k]) => k));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Troca {{LINK:chave}} pelo link de afiliado e {{POST:slug}} pelo endereço público do post. Só afiliação ATIVA vira
 *  link: produto pendente ou suspenso perde a caixa de oferta (:::cta) e o link vira texto comum, em todo lugar onde o
 *  texto sai (página própria, post do módulo do blog e feed.xml). Volta sozinho quando o status passa a 'ativo'. */
function aplicarLinks(texto, prefixo) {
  return String(texto)
    .replace(/^:::cta[^\n]*\n([\s\S]*?)\n:::[ \t]*$\n?/gm, (b, corpo) => {
      const k = /\{\{LINK:([a-z0-9-]+)\}\}/.exec(corpo)?.[1];
      return k && !ATIVOS.has(k) ? '' : b;
    })
    .replace(/\[([^\]]+)\]\(\{\{LINK:([a-z0-9-]+)\}\}\)/g, (m, t, k) => (ATIVOS.has(k) ? m : t))
    .replace(/\{\{LINK:([a-z0-9-]+)\}\}/g, (_m, k) => (ATIVOS.has(k) ? LINKS[k].url : `${prefixo}/blog`))
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
  const base = tenant;
  const tema = cleanTheme({ primary: '#5b4bd5', accent: '#5b4bd5', font: 'Inter', fontHead: 'Inter', radius: 10 });

  // tabelas com tenant_id e a coluna que as liga ao site (direto ou por página/jornada/lead do site)
  const colunas = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  const tabelas = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name).filter((t) => t !== 'sites' && colunas(t).includes('tenant_id'));
  /** Move um site e tudo o que pende dele de uma operação para outra, numa transação. */
  function moverSite(site, para) {
    return tx(db, () => {
      const de = site.tenant_id; let linhas = 0;
      for (const t of tabelas) {
        const c = colunas(t);
        const onde = c.includes('site_id') ? 'site_id = @s'
          : c.includes('page_id') ? 'page_id IN (SELECT id FROM pages WHERE site_id = @s)'
          : c.includes('journey_id') ? 'journey_id IN (SELECT id FROM journeys WHERE site_id = @s)'
          : c.includes('lead_id') ? 'lead_id IN (SELECT id FROM leads WHERE site_id = @s)' : null;
        if (onde) linhas += db.prepare(`UPDATE ${t} SET tenant_id = @para WHERE tenant_id = @de AND ${onde}`).run({ para, de, s: site.id }).changes;
      }
      db.prepare('UPDATE sites SET tenant_id = ? WHERE id = ?').run(para, site.id);
      return linhas;
    });
  }
  /** Operação (cliente) de cada blog: blog-<slug>, com os mesmos membros da operação base. */
  function clienteDoBlog(slugBlog, info, n) {
    const slug = `blog-${slugBlog}`;
    let t = db.prepare("SELECT * FROM tenants WHERE edition = 'geral' AND slug = ?").get(slug);
    if (!t) {
      ({ tenant: t } = createTenant(db, { name: String(info.nome || slugBlog), number: String(90010 + n), niche: 'criador', slug, edition: 'geral',
        settings: { tagline: info.tagline || '', timezone: 'America/Sao_Paulo' } }));
      passo(`cliente criado: ${t.name} (${slug}), id ${t.id}`);
    }
    for (const m of db.prepare('SELECT user_id, role FROM memberships WHERE tenant_id = ?').all(base.id)) {
      db.prepare('INSERT OR IGNORE INTO memberships (user_id, tenant_id, role) VALUES (?, ?, ?)').run(m.user_id, t.id, m.role);
    }
    return t;
  }

  const blogs = fs.readdirSync(CONTEUDO, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(CONTEUDO, d.name, 'site.json'))).map((d) => d.name).sort();
  const clientes = {};
  for (const [n, slugBlog] of blogs.entries()) {
    const dir = path.join(CONTEUDO, slugBlog);
    const info = lerJson(path.join(dir, 'site.json'), {});
    tenant = CLIENTE_UNICO ? base : clienteDoBlog(slugBlog, info, n + 1);
    clientes[slugBlog] = tenant.slug;
    const repo = scoped(db, tenant.id);
    // Domínio próprio (site.json "dominio", ex.: "fornecedores.blog", desde 08/11/2026) ou o caminho antigo kbsa.app/<slug>.
    // O site que estava no caminho antigo troca de domínio no lugar (mesmo id, posts, leads e cliques); o Caddy manda
    // kbsa.app/<slug>/* para o domínio novo com 301.
    const antigo = `${HOST}/${slugBlog}`;
    const dominio = info.dominio ? String(info.dominio).trim().toLowerCase() : antigo;
    if (!/^[a-z0-9.-]+(\/[a-z0-9-]+)?$/.test(dominio)) throw new Error(`${slugBlog}: domínio inválido em site.json: ${dominio}`);
    const prefixo = `https://${dominio}`;
    const med = MEDICAO[slugBlog] || {};
    const tracking = JSON.stringify(Object.fromEntries(Object.entries({ ga4: med.ga4, clarity: med.clarity }).filter(([, v]) => v)));
    let site = db.prepare('SELECT * FROM sites WHERE domain = ?').get(dominio);
    if (!site && dominio !== antigo) {
      site = db.prepare('SELECT * FROM sites WHERE domain = ?').get(antigo);
      if (site) {
        db.prepare('UPDATE sites SET domain = ? WHERE id = ?').run(dominio, site.id);
        site = db.prepare('SELECT * FROM sites WHERE id = ?').get(site.id);
        passo(`${antigo}: domínio trocado para ${dominio} (mesmo site, /s/${site.slug}/)`);
      }
    }
    if (site && site.tenant_id !== tenant.id) {
      if (site.tenant_id !== base.id) throw new Error(`${dominio} já está em outra operação`);
      const movidas = moverSite(site, tenant.id);
      site = db.prepare('SELECT * FROM sites WHERE id = ?').get(site.id);
      passo(`${dominio}: movido da operação ${base.slug} para ${tenant.slug} (${movidas} linhas junto)`);
    }
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
      // capa e imagens internas precisam existir em portal/public (copiar junto no recorte do Bigue)
      for (const src of [capaDo(a), ...[...String(a.content).matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1])].filter(Boolean)) {
        if (!fs.existsSync(path.join(PUBLICO, src.replace(/^\/+/, '')))) passo(`aviso: ${slugBlog}/${a.slug} usa ${src}, que não está em portal/public`);
      }
      const base = { site_id: site.id, title: String(a.title).slice(0, 120), slug: a.slug, excerpt: String(a.excerpt || '').slice(0, 300),
        content: comOrigem(aplicarLinks(a.content, prefixo), `${slugBlog}-${a.slug}`), category: String(a.category || info.categoria || 'Geral').slice(0, 80),
        tags: JSON.stringify((a.tags || []).slice(0, 20)), author: info.autor || `Equipe ${info.nome}`, cover_url: capaDo(a),
        seo_title: String(a.seoTitle || '').slice(0, 70), seo_description: String(a.seoDescription || '').slice(0, 170) };
      const atual = repo.get('posts', { site_id: site.id, slug: a.slug });
      const at = atual?.published_at || now();
      const pub = { ...base, status: 'publicado', scheduled_at: null, published_at: at, published_slug: a.slug, published_data: JSON.stringify(publishedData(base, at)) };
      if (!atual) { repo.insert('posts', pub); novos++; } else { repo.update('posts', atual.id, pub); atualizados++; }
    }
    const vitrine = lerJson(path.join(dir, 'vitrine.json'), null);
    if (vitrine) {
      // visual de venda: home comparativa, lista e cada post como página própria (mesmos endereços do blog)
      const v = { ...vitrine, _ativos: ATIVOS };
      gravarPagina(repo, { siteId: site.id, caminho: '', html: comOrigem(renderHome({ info, v, posts: lista, prefixo, dados: DADOS_VITRINE }), `${slugBlog}-home`), titulo: info.nome, indexar: true });
      gravarPagina(repo, { siteId: site.id, caminho: 'blog', html: renderLista({ info, v, posts: lista, prefixo }), titulo: `Guias · ${info.nome}`, indexar: false });
      for (const a of lista) {
        const row = repo.get('posts', { site_id: site.id, slug: a.slug });
        gravarPagina(repo, { siteId: site.id, caminho: `blog/${a.slug}`, titulo: a.title, indexar: false,
          html: comOrigem(renderPost({ info, v, post: a, posts: lista, prefixo, dados: DADOS_VITRINE, aplicarLinks, publicado: row?.published_at, atualizado: row?.updated_at }), `${slugBlog}-${a.slug}`) });
      }
      const ofertas = (vitrine.destaques || []).filter((k) => ATIVOS.has(k)).length;
      passo(`${slugBlog}: visual de venda gravado (home, lista e ${lista.length} posts; ${ofertas} ofertas ativas na vitrine)`);
    } else {
      gravarPagina(repo, { siteId: site.id, caminho: '', html: comOrigem(homeHtml(info, lista, med.ga4, prefixo), `${slugBlog}-home`), titulo: info.nome, indexar: true });
    }
    passo(`${slugBlog}: ${novos} posts novos, ${atualizados} atualizados, home gravada, medição ${tracking}`);
  }
  const pendentes = Object.entries(LINKS).filter(([, v]) => v.status !== 'ativo').map(([k]) => k);
  if (pendentes.length) passo(`links ainda sem afiliação ativa (sem caixa de oferta; o link vira texto): ${pendentes.join(', ')}`);
  audit(db, { tenantId: base.id, action: 'afiliacao.instalar', target: base.id, data: { blogs: blogs.length, clientes } });
  if (SECO) passo('ensaio (--seco): rodou numa cópia do banco; o original não mudou');
  console.log(JSON.stringify({ ok: true, tenant: base.id, clientes, blogs, relato }));
} catch (e) {
  console.log(JSON.stringify({ ok: false, erro: e.message, relato }));
  process.exitCode = 1;
} finally {
  db.close();
  if (pastaSeco) { try { fs.rmSync(pastaSeco, { recursive: true, force: true }); } catch { /* temporário */ } }
}
