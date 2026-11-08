// Visual de venda dos blogs de afiliado (kbsa.app/<blog>): home comparativa, lista de guias e post, gravados como
// páginas próprias (raiz, "blog" e "blog/<slug>") por cima do modelo genérico do blog. Segue o padrão dos sites que
// mais vendem como afiliado nesses nichos: resposta pronta acima da dobra, ficha igual para todo produto (foto, tipo,
// preço, para quem é, botão), tabela com botão em cada linha, "como escolhemos", FAQ, data de atualização e um único
// botão de destaque por tela. Só usa dado real do produto (nome, tipo, preço e foto do marketplace).
import { htmlText, faqDoTexto, faqLd } from '../lib/modules/blog.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (v) => (Number.isFinite(Number(v)) ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: Number(v) % 1 ? 2 : 0 }) : '');
const ANO = new Date().getFullYear();
const dataBr = (iso) => { const d = new Date(iso || Date.now()); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }); };
const minutos = (md) => Math.max(3, Math.round(String(md || '').split(/\s+/).length / 210));
const frase = (t, max) => { const s = String(t || ''); if (s.length <= max) return s; const c = s.slice(0, max); const i = Math.max(c.lastIndexOf('. '), c.lastIndexOf('! '), c.lastIndexOf('? ')); return i > 80 ? c.slice(0, i + 1) : `${c.slice(0, c.lastIndexOf(' '))}…`; };
const cap = (t) => { const s = String(t || ''); return s ? s[0].toUpperCase() + s.slice(1) : s; };
const REL = 'rel="sponsored nofollow noopener" target="_blank"';

/** Produto pronto para a vitrine: dado do catálogo + link (de afiliado se ativo; senão a página de vendas). */
export function produto(chave, { catalogo, links }) {
  const c = catalogo[chave];
  if (!c) return null;
  const l = links[chave] || {};
  // só entra na vitrine com afiliação ativa: todo clique tem que gerar comissão
  return l.status === 'ativo' && l.url ? { chave, ...c, url: l.url } : null;
}

const css = (v) => `
:root{--a:${v.cor};--a2:${v.cor2 || v.cor};--ink:#14161a;--mut:#5b6170;--line:#e6e8ee;--bg:#fff;--soft:${v.suave || '#f6f7fb'};--r:14px;--fh:'${v.fonte || 'Inter'}',system-ui,sans-serif}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--bg);color:var(--ink);font:400 18px/1.7 Inter,system-ui,sans-serif}
a{color:var(--a)}img{max-width:100%;display:block}.w{width:min(1120px,calc(100% - 32px));margin:0 auto}
.top{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.top .w{display:flex;align-items:center;justify-content:space-between;gap:12px;height:62px}
.marca{display:flex;align-items:center;gap:10px;font:800 1.08rem/1 var(--fh);color:var(--ink);text-decoration:none;letter-spacing:-.01em}
.marca i{width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,var(--a),var(--a2));display:grid;place-items:center;color:#fff;font:800 .95rem/1 var(--fh);font-style:normal}
.top nav{display:flex;gap:22px;font-size:.95rem}.top nav a{color:var(--mut);text-decoration:none;font-weight:600}.top nav a:hover{color:var(--ink)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:14px 22px;border-radius:12px;background:var(--a);color:#fff!important;font:700 1rem/1.1 Inter,system-ui,sans-serif;text-decoration:none;border:0;cursor:pointer;box-shadow:0 6px 18px -8px var(--a);transition:transform .15s,filter .15s}
.btn:hover{transform:translateY(-1px);filter:brightness(1.06)}.btn.lin{background:#fff;color:var(--ink)!important;border:1.5px solid var(--line);box-shadow:none}.btn.sm{padding:10px 14px;font-size:.92rem;border-radius:10px;white-space:nowrap}
.hero{background:radial-gradient(1200px 400px at 80% -10%,color-mix(in srgb,var(--a) 16%,transparent),transparent),var(--soft);border-bottom:1px solid var(--line)}
.hero .w{padding:54px 0 46px}.selo{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;background:#fff;border:1px solid var(--line);font-size:.82rem;font-weight:700;color:var(--mut)}
.selo b{width:8px;height:8px;border-radius:50%;background:var(--a)}
h1{font:800 clamp(2.1rem,5.4vw,3.7rem)/1.06 var(--fh);letter-spacing:-.035em;margin:16px 0 14px;max-width:880px}h1 em{font-style:normal;color:var(--a)}
.sub{font-size:1.18rem;color:var(--mut);max-width:720px;margin:0 0 22px}.meta{display:flex;flex-wrap:wrap;gap:6px 16px;color:var(--mut);font-size:.9rem}
.picks{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:18px;margin-top:30px}
.card{position:relative;display:flex;flex-direction:column;background:#fff;border:1px solid var(--line);border-radius:var(--r);overflow:hidden;box-shadow:0 1px 2px rgba(20,22,26,.04),0 12px 28px -18px rgba(20,22,26,.25)}
.card .ft{aspect-ratio:4/3;background:var(--soft);overflow:hidden;display:grid;place-items:center}.card .ft img{width:100%;height:100%;object-fit:contain}
.card .tag{position:absolute;top:12px;left:12px;padding:5px 10px;border-radius:8px;background:var(--ink);color:#fff;font-size:.76rem;font-weight:800;letter-spacing:.02em;text-transform:uppercase}
.card .tag.um{background:var(--a)}.card .cp{padding:18px 18px 20px;display:flex;flex-direction:column;gap:8px;flex:1}
.card h3{font:750 1.18rem/1.25 var(--fh);margin:0;letter-spacing:-.01em}.card .tp{font-size:.85rem;color:var(--mut);font-weight:600}
.card .pr{font:800 1.5rem/1 var(--fh);margin:6px 0 2px}.card .pr small{font:600 .8rem Inter,sans-serif;color:var(--mut)}
.card .pq{font-size:.95rem;color:var(--ink);background:var(--soft);border-radius:10px;padding:10px 12px;margin:4px 0 8px}.card .pq b{color:var(--a)}
.card .btn{margin-top:auto;width:100%}.nota{font-size:.78rem;color:var(--mut);text-align:center;margin-top:6px}
section{padding:56px 0}section.alt{background:var(--soft);border-block:1px solid var(--line)}
h2{font:800 clamp(1.6rem,3.4vw,2.3rem)/1.15 var(--fh);letter-spacing:-.025em;margin:0 0 10px}.lead{color:var(--mut);margin:0 0 26px;max-width:720px}
.tab{width:100%;border-collapse:separate;border-spacing:0;background:#fff;border:1px solid var(--line);border-radius:var(--r);overflow:hidden;font-size:.98rem}
.tab th,.tab td{padding:14px 16px;text-align:left;border-bottom:1px solid var(--line);vertical-align:middle}.tab th{background:var(--soft);font-size:.8rem;text-transform:uppercase;letter-spacing:.04em;color:var(--mut)}
.tab tr:last-child td{border-bottom:0}.tab .nm{display:flex;align-items:center;gap:12px;font-weight:700}.tab .nm img{width:52px;height:52px;border-radius:10px;object-fit:cover}
.guias{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:16px}
.guia{display:flex;flex-direction:column;gap:8px;padding:22px;background:#fff;border:1px solid var(--line);border-radius:var(--r);text-decoration:none;color:var(--ink);transition:border-color .15s,transform .15s}
.guia:hover{border-color:var(--a);transform:translateY(-2px)}.guia .k{font-size:.78rem;font-weight:800;color:var(--a);text-transform:uppercase;letter-spacing:.05em}
.guia h3{font:750 1.2rem/1.28 var(--fh);margin:0}.guia p{margin:0;color:var(--mut);font-size:.98rem;line-height:1.55}.guia .vm{margin-top:auto;font-weight:700;color:var(--a);font-size:.95rem}
.passos{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:16px;counter-reset:p}
.passo{padding:22px;border-radius:var(--r);background:#fff;border:1px solid var(--line)}.passo:before{counter-increment:p;content:counter(p);display:grid;place-items:center;width:38px;height:38px;border-radius:10px;background:var(--a);color:#fff;font:800 1.05rem var(--fh);margin-bottom:12px}
.passo h3{font:750 1.08rem/1.3 var(--fh);margin:0 0 6px}.passo p{margin:0;color:var(--mut);font-size:.96rem;line-height:1.55}
.faq details{background:#fff;border:1px solid var(--line);border-radius:12px;padding:4px 18px;margin-bottom:10px}.faq summary{cursor:pointer;font-weight:700;padding:14px 0;list-style:none;display:flex;justify-content:space-between;gap:12px}
.faq summary:after{content:'+';color:var(--a);font-weight:800;font-size:1.3rem;line-height:1}.faq details[open] summary:after{content:'–'}.faq details p{margin:0 0 16px;color:var(--mut)}
.cap{display:grid;grid-template-columns:1.2fr 1fr;gap:28px;align-items:center;padding:34px;border-radius:20px;background:linear-gradient(135deg,var(--a),var(--a2));color:#fff}
.cap h2{color:#fff}.cap p{margin:0;opacity:.92}.cap form{display:flex;flex-direction:column;gap:10px}
.cap input[type=email]{padding:15px 16px;border-radius:12px;border:0;font:500 1rem Inter,sans-serif}.cap label{display:flex;gap:8px;font-size:.82rem;opacity:.92;align-items:flex-start}
.cap .btn{background:var(--ink);box-shadow:none}
footer{padding:36px 0 110px;border-top:1px solid var(--line);color:var(--mut);font-size:.88rem}footer .w{display:grid;gap:10px}
/* post */
.bc{font-size:.85rem;color:var(--mut);margin-bottom:6px}.bc a{color:var(--mut);text-decoration:none}
.grade{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:48px;align-items:start;padding:40px 0 20px}
.rapida{border:1.5px solid color-mix(in srgb,var(--a) 35%,var(--line));background:color-mix(in srgb,var(--a) 6%,#fff);border-radius:var(--r);padding:18px 20px;margin:22px 0}
.rapida b{display:block;font:800 .8rem/1 Inter,sans-serif;text-transform:uppercase;letter-spacing:.06em;color:var(--a);margin-bottom:8px}.rapida p{margin:0}
.indice{border:1px solid var(--line);border-radius:var(--r);padding:16px 20px;margin:0 0 28px;background:var(--soft)}.indice b{font-size:.85rem;text-transform:uppercase;letter-spacing:.05em;color:var(--mut)}
.indice ol{margin:8px 0 0;padding-left:20px;font-size:.98rem}.indice li{margin:4px 0}.indice a{color:var(--ink);text-decoration:none}.indice a:hover{color:var(--a)}
.txt{font-size:1.1rem;line-height:1.82}.txt h2{margin:1.8em 0 .5em;scroll-margin-top:80px}.txt h3{font:750 1.25rem/1.3 var(--fh);margin:1.5em 0 .4em}
.txt p{margin:0 0 1.2em}.txt ul,.txt ol{padding-left:1.3em;margin:0 0 1.3em}.txt li{margin:.35em 0}.txt strong{font-weight:700}
.txt .blog-box{margin:0 0 1.5em;padding:18px 20px;border-radius:var(--r);background:var(--soft);border:1px solid var(--line)}.txt .blog-box-title{display:block;font-weight:800;margin-bottom:6px}
.txt .blog-box p:last-child{margin:0}.txt .blog-box-dica{border-left:4px solid var(--a2)}.txt .blog-box-nota{border-left:4px solid #9aa1b1}
.oferta{display:grid;grid-template-columns:150px 1fr;gap:18px;align-items:center;margin:0 0 1.6em;padding:18px;border:1.5px solid color-mix(in srgb,var(--a) 30%,var(--line));border-radius:var(--r);background:#fff;box-shadow:0 14px 30px -22px rgba(20,22,26,.4)}
.oferta img{width:150px;height:150px;border-radius:12px;object-fit:cover}.oferta .k{font-size:.76rem;font-weight:800;color:var(--a);text-transform:uppercase;letter-spacing:.06em}
.oferta h4{font:800 1.2rem/1.25 var(--fh);margin:4px 0 4px}.oferta .tx{font-size:.98rem;color:var(--mut);margin:0 0 10px;line-height:1.55}.oferta .tx p{margin:0}
.oferta .ln{display:flex;flex-wrap:wrap;align-items:center;gap:12px}.oferta .pr{font:800 1.3rem var(--fh)}
.lado{position:sticky;top:84px;display:grid;gap:14px}.lado .card .ft{aspect-ratio:1/1}
.fixo{display:none}
@media(max-width:920px){.grade{grid-template-columns:1fr;gap:0}.lado{position:static}.top nav{display:none}
.cap{grid-template-columns:1fr;padding:24px}.tab .esc{display:none}
.fixo{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:30;gap:12px;align-items:center;justify-content:space-between;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid var(--line);box-shadow:0 -8px 24px -12px rgba(20,22,26,.25)}
.fixo span{font-size:.85rem;line-height:1.3;color:var(--mut)}.fixo span b{display:block;color:var(--ink);font-size:.95rem}}
@media(max-width:600px){body{font-size:17px}.hero .w{padding:34px 0 30px}section{padding:40px 0}.oferta{grid-template-columns:1fr}.oferta img{width:100%;height:auto;aspect-ratio:16/10}
.tab th:nth-child(3),.tab td:nth-child(3){display:none}.tab th,.tab td{padding:12px 10px}}
`;

function head({ titulo, desc, canonical, v, ld, og }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title><meta name="description" content="${esc(desc).slice(0, 160)}"><link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="index,follow,max-image-preview:large"><meta property="og:type" content="${og || 'website'}"><meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(desc).slice(0, 200)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:locale" content="pt_BR">
${v.imagem ? `<meta property="og:image" content="${esc(v.imagem)}"><meta name="twitter:card" content="summary_large_image">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800${v.fonte && v.fonte !== 'Inter' ? `&family=${encodeURIComponent(v.fonte).replace(/%20/g, '+')}:wght@600;700;800` : ''}&display=swap" rel="stylesheet">
<meta name="theme-color" content="${esc(v.cor)}"><style>${css(v)}</style>
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}</head>`;
}

function topo(info, prefixo, v) {
  return `<header class="top"><div class="w"><a class="marca" href="${prefixo}/"><i>${esc(v.sigla || info.nome[0])}</i>${esc(info.nome)}</a>
<nav aria-label="Principal"><a href="${prefixo}/#comparativo">Comparativo</a><a href="${prefixo}/blog">Guias</a><a href="${prefixo}/#duvidas">Dúvidas</a></nav>
${(v.destaques || []).some((k) => !v._ativos || v._ativos.has(k)) ?`<a class="btn sm" href="${prefixo}/#comparativo">${esc(v.cta_topo || 'Ver os melhores')}</a>` : ''}</div></header>`;
}

function rodape(info) {
  return `<footer><div class="w"><strong>${esc(info.nome)}</strong><span>${esc(info.descricao)}</span>
<span><b>Transparência:</b> alguns links deste site são de afiliado. Se você comprar por eles, recebemos uma comissão, sem custo extra para você. Isso não muda a ordem nem o que escrevemos; confira sempre na página oficial o conteúdo, o preço e a garantia antes de comprar.</span>
<span>© ${ANO} ${esc(info.nome)} · Conteúdo informativo, sem promessa de resultado.</span></div></footer>`;
}

function cardProduto(p, { rotulo, um, melhor }) {
  return `<article class="card">${rotulo ? `<span class="tag${um ? ' um' : ''}">${esc(rotulo)}</span>` : ''}
<div class="ft">${p.img ? `<img src="${esc(p.img)}" alt="${esc(p.nome)}" loading="lazy" width="600" height="375">` : ''}</div>
<div class="cp"><span class="tp">${esc(p.tipo || 'Curso online')}</span><h3>${esc(p.nome)}</h3>
${p.preco ? `<div class="pr">${brl(p.preco)} <small>${esc(p.preco_nota || 'na página oficial')}</small></div>` : ''}
${melhor ? `<div class="pq"><b>Para quem é:</b> ${esc(melhor)}</div>` : ''}
<a class="btn" href="${esc(p.url)}" ${REL}>${esc(p.cta || 'Ver na página oficial')} →</a><span class="nota">Preço e condições conferidos em ${dataBr()}</span></div></article>`;
}

function captura(info, v) {
  return `<div class="cap"><div><h2>${esc(v.isca_titulo || `Receba os próximos guias do ${info.nome}`)}</h2><p>${esc(v.isca_texto || 'Um e-mail quando sair guia novo ou mudar algum preço do comparativo. Sem spam: sai com um clique.')}</p></div>
<form method="post" onsubmit="event.preventDefault();this.querySelector('button').textContent='Pronto! Você está na lista.';">
<input type="email" name="email" placeholder="seu@email.com" required autocomplete="email" aria-label="Seu e-mail">
<label><input type="checkbox" required> Aceito receber e-mails do ${esc(info.nome)} e sei que posso sair quando quiser.</label>
<button class="btn" type="submit">${esc(v.isca_botao || 'Quero receber')}</button></form></div>`;
}

const faqHtml = (faq) => `<div class="faq">${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>`;

/** Home: comparativo "os melhores X em ANO" com destaques, tabela, passos, guias, captura e FAQ. */
export function renderHome({ info, v, posts, prefixo, dados }) {
  const prods = (v.destaques || []).map((k) => produto(k, dados)).filter(Boolean);
  const menor = prods.filter((p) => p.preco).reduce((m, p) => (!m || p.preco < m.preco ? p : m), null);
  const rotulo = (p, i) => (i === 0 ? (v.rotulo_um || 'Mais indicado') : p === menor ? 'Menor preço' : (v.rotulo_outros || 'Também vale ver'));
  const titulo = `${v.h1_seo || v.h1} (${ANO}) · ${info.nome}`;
  const desc = v.desc_seo || info.descricao;
  const canonical = `${prefixo}/`;
  const faq = v.faq || [];
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebSite', '@id': `${canonical}#site`, url: canonical, name: info.nome, inLanguage: 'pt-BR', description: desc },
    { '@type': 'ItemList', name: v.h1, itemListElement: prods.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.nome, url: p.url })) },
    ...(faq.length ? [faqLd(faq.map((f) => ({ q: f.q, a: f.a })), `${canonical}#faq`)] : []),
  ] };
  const linhas = prods.map((p) => `<tr><td><div class="nm">${p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy" width="52" height="52">` : ''}<span>${esc(p.nome)}</span></div></td>
<td class="esc">${esc(cap(v.melhor_para?.[p.chave] || p.tipo || ''))}</td><td>${p.preco ? brl(p.preco) : '—'}</td><td><a class="btn sm" href="${esc(p.url)}" ${REL}>Ver →</a></td></tr>`).join('');
  const guias = posts.map((p) => `<a class="guia" href="${prefixo}/blog/${esc(p.slug)}"><span class="k">${esc(p.category || info.categoria)}</span><h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p><span class="vm">Ler o guia →</span></a>`).join('');
  return `${head({ titulo, desc, canonical, v, ld })}<body>${topo(info, prefixo, v)}
<main><div class="hero"><div class="w"><span class="selo"><b></b>Atualizado em ${dataBr()}</span>
<h1>${v.h1_html || esc(v.h1)}</h1><p class="sub">${esc(v.sub || info.tagline)}</p>
<div class="meta"><span>Por ${esc(info.autor || `Equipe ${info.nome}`)}</span>${prods.length ? `<span>${prods.length} opções comparadas por preço e para quem servem</span>` : ''}</div>
<div class="picks">${prods.slice(0, 3).map((p, i) => cardProduto(p, { rotulo: rotulo(p, i), um: i === 0, melhor: v.melhor_para?.[p.chave] })).join('')}</div></div></div>
${prods.length ? `<section id="comparativo"><div class="w"><h2>${esc(v.tabela_titulo || 'Comparativo lado a lado')}</h2><p class="lead">${esc(v.tabela_texto || 'Preço da página oficial e o perfil de quem aproveita mais cada opção. Clique para conferir o conteúdo e a garantia antes de decidir.')}</p>
<table class="tab"><thead><tr><th>Opção</th><th class="esc">Para quem é</th><th>Preço</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div></section>` : ''}
${v.passos?.length ? `<section class="alt"><div class="w"><h2>${esc(v.passos_titulo || 'Como escolher em 3 passos')}</h2><p class="lead">${esc(v.passos_texto || '')}</p>
<div class="passos">${v.passos.map((s) => `<div class="passo"><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p></div>`).join('')}</div></div></section>` : ''}
<section><div class="w"><h2>${esc(v.guias_titulo || 'Guias para decidir sem cair em promessa')}</h2><p class="lead">${esc(frase(info.home_intro || info.descricao, 280))}</p><div class="guias">${guias}</div></div></section>
<section class="alt"><div class="w"><h2>Como escolhemos</h2><p class="lead" style="margin-bottom:0">${esc(v.metodo || 'Comparamos o que cada produto mostra na página oficial: o tipo de conteúdo, o preço e para quem ele foi feito. Não aceitamos pagamento para mudar a ordem. Quando a página do produto muda, atualizamos o comparativo e a data no topo.')}</p></div></section>
${faq.length ? `<section id="duvidas"><div class="w"><h2>Perguntas frequentes</h2>${faqHtml(faq)}</div></section>` : ''}
<section><div class="w">${captura(info, v)}</div></section></main>${rodape(info)}
${prods[0] ? `<div class="fixo"><span><b>${esc(prods[0].nome)}</b>${prods[0].preco ? brl(prods[0].preco) : ''}</span><a class="btn sm" href="${esc(prods[0].url)}" ${REL}>Ver oferta →</a></div>` : ''}</body></html>`;
}

/** Lista de guias (/blog). */
export function renderLista({ info, v, posts, prefixo }) {
  const canonical = `${prefixo}/blog`;
  const guias = posts.map((p) => `<a class="guia" href="${prefixo}/blog/${esc(p.slug)}"><span class="k">${esc(p.category || info.categoria)}</span><h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p><span class="vm">Ler o guia →</span></a>`).join('');
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: `Guias · ${info.nome}`, url: canonical, inLanguage: 'pt-BR',
    hasPart: posts.map((p) => ({ '@type': 'Article', headline: p.title, url: `${prefixo}/blog/${p.slug}` })) };
  return `${head({ titulo: `Guias ${v.assunto ? `de ${v.assunto} ` : ''}· ${info.nome}`, desc: info.descricao, canonical, v, ld })}<body>${topo(info, prefixo, v)}
<main><div class="hero"><div class="w"><span class="selo"><b></b>${posts.length} guias · atualizado em ${dataBr()}</span><h1>Guias do ${esc(info.nome)}</h1><p class="sub">${esc(info.tagline)}</p></div></div>
<section><div class="w"><div class="guias">${guias}</div></div></section><section><div class="w">${captura(info, v)}</div></section></main>${rodape(info)}</body></html>`;
}

/** Marca a origem em todo link de checkout/afiliado da Hotmart (go./pay.hotmart.com, hotm.art) e da Kiwify (kiwify.app, pay.kiwify.com.br) com ?src=<origem>, para a
 *  venda aparecer no filtro "Origem (SRC)" da Hotmart dizendo de qual blog e post veio. Não mexe em imagem da Hotmart
 *  (static/media), nem em link que já tem src. A origem fica só com [a-z0-9_], até 50 caracteres: a Hotmart apaga o hífen do src (testado em 08/11/2026), o sublinhado fica. */
export function comOrigem(texto, origem) {
  const src = String(origem || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);
  if (!src) return String(texto);
  return String(texto).replace(/https:\/\/(?:go\.hotmart\.com|pay\.hotmart\.com|hotm\.art|(?:pay\.)?kiwify\.app|pay\.kiwify\.com\.br|l\.kbsa\.app)\/[^\s"'<>)\]]*/g, (url) => {
    if (/[?&]src=/.test(url) || /[?&]amp;src=/.test(url)) return url;
    const [base, hash = ''] = url.split('#');
    // No link curto do BigLinks, a origem vai também como utm_campaign: o BigLinks sempre repassa utm_* ao destino e
    // mostra a campanha no relatório; o src chega à Hotmart quando o workspace repassa os outros parâmetros.
    const extra = /^https:\/\/l\.kbsa\.app\//.test(base) ? `&utm_source=kbsa_blogs&utm_campaign=${src}` : '';
    return `${base}${base.includes('?') ? '&' : '?'}src=${src}${extra}${hash ? `#${hash}` : ''}`;
  });
}

/** Troca as caixas :::cta que têm link de afiliado por uma ficha do produto (foto, preço, botão). */
function comOfertas(md, dados, linkDe) {
  return String(md).replace(/^:::cta[^\n]*\n([\s\S]*?)\n:::[ \t]*$/gm, (bloco, corpo) => {
    const k = /\{\{LINK:([a-z0-9-]+)\}\}/.exec(corpo)?.[1];
    const p = k && produto(k, dados);
    if (!p) return bloco;
    const texto = corpo.replace(/\[([^\]]+)\]\(\{\{LINK:[a-z0-9-]+\}\}\)/g, '$1').trim();
    return `\u0000OFERTA:${k}:${Buffer.from(texto).toString('base64')}\u0000`;
  });
}

/** Post: resposta rápida, índice, ficha de produto no lugar das caixas de oferta, lateral fixa e barra no celular. */
export function renderPost({ info, v, post, posts, prefixo, dados, aplicarLinks, publicado, atualizado }) {
  const canonical = `${prefixo}/blog/${post.slug}`;
  const chaves = [...String(post.content).matchAll(/\{\{LINK:([a-z0-9-]+)\}\}/g)].map((m) => m[1]);
  const principal = [...chaves, ...(v.destaques || [])].map((k) => produto(k, dados)).find(Boolean);
  // produto sem afiliação ativa: a caixa de oferta sai e o link vira texto comum (volta sozinho quando for aprovado)
  let md = String(post.content)
    .replace(/^:::cta[^\n]*\n([\s\S]*?)\n:::[ \t]*$/gm, (b, corpo) => { const k = /\{\{LINK:([a-z0-9-]+)\}\}/.exec(corpo)?.[1]; return k && !produto(k, dados) ? '' : b; })
    .replace(/\[([^\]]+)\]\(\{\{LINK:([a-z0-9-]+)\}\}\)/g, (m, t, k) => (produto(k, dados) ? m : t));
  md = comOfertas(md, dados);
  md = aplicarLinks(md, prefixo);
  let html = htmlText(md);
  html = html.replace(/<p>\u0000OFERTA:([a-z0-9-]+):([A-Za-z0-9+/=]+)\u0000<\/p>|\u0000OFERTA:([a-z0-9-]+):([A-Za-z0-9+/=]+)\u0000/g, (_m, k1, b1, k2, b2) => {
    const p = produto(k1 || k2, dados);
    const texto = htmlText(aplicarLinks(Buffer.from(b1 || b2, 'base64').toString('utf8'), prefixo));
    return `<aside class="oferta">${p.img ? `<img src="${esc(p.img)}" alt="${esc(p.nome)}" loading="lazy" width="150" height="150">` : '<span></span>'}
<div><span class="k">Recomendação do guia</span><h4>${esc(p.nome)}</h4><div class="tx">${texto}</div><div class="ln">${p.preco ? `<span class="pr">${brl(p.preco)}</span>` : ''}<a class="btn" href="${esc(p.url)}" ${REL}>Ver na página oficial →</a></div></div></aside>`;
  });
  // links de afiliado no meio do texto: marcados como patrocinados e abrindo em outra aba
  html = html.replace(/<a href="(https:\/\/(?:[a-z0-9-]+\.)*(?:kiwify\.app|kiwify\.com\.br|kiwify\.com|hotmart\.com|hotm\.art|l\.kbsa\.app)[^"]*)"(?: rel="[^"]*")?(?: target="[^"]*")?>/g,`<a href="$1" ${REL}>`);
  // índice pelos H2
  const h2 = [];
  html = html.replace(/<h2>(.*?)<\/h2>/g, (_m, t) => { const id = t.replace(/<[^>]+>/g, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); h2.push([id, t]); return `<h2 id="${id}">${t}</h2>`; });
  const faq = faqDoTexto(post.content);
  const outros = posts.filter((p) => p.slug !== post.slug);
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'Article', headline: post.title, description: post.seoDescription || post.excerpt, inLanguage: 'pt-BR', mainEntityOfPage: canonical, url: canonical,
      datePublished: publicado, dateModified: atualizado || publicado, author: { '@type': 'Organization', name: info.autor || `Equipe ${info.nome}`, url: `${prefixo}/` },
      publisher: { '@type': 'Organization', name: info.nome, url: `${prefixo}/` }, ...(principal?.img ? { image: principal.img } : {}) },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: info.nome, item: `${prefixo}/` },
      { '@type': 'ListItem', position: 2, name: 'Guias', item: `${prefixo}/blog` }, { '@type': 'ListItem', position: 3, name: post.title, item: canonical }] },
    ...(faq.length ? [faqLd(faq, `${canonical}#faq`)] : []),
  ] };
  const titulo = `${post.seoTitle || post.title} · ${info.nome}`;
  return `${head({ titulo, desc: post.seoDescription || post.excerpt, canonical, v: { ...v, imagem: principal?.img || v.imagem }, ld, og: 'article' })}<body>${topo(info, prefixo, v)}
<main><div class="w"><div class="grade"><article>
<div class="bc"><a href="${prefixo}/">${esc(info.nome)}</a> › <a href="${prefixo}/blog">Guias</a> › ${esc(post.category || info.categoria)}</div>
<h1 style="font-size:clamp(1.9rem,4.4vw,3rem)">${esc(post.title)}</h1>
<div class="meta"><span>Por ${esc(info.autor || `Equipe ${info.nome}`)}</span><span>Atualizado em ${dataBr(atualizado || publicado)}</span><span>${minutos(post.content)} min de leitura</span></div>
${post.excerpt ? `<div class="rapida"><b>Resposta rápida</b><p>${esc(post.excerpt)}</p></div>` : ''}
${h2.length > 2 ? `<nav class="indice" aria-label="Neste guia"><b>Neste guia</b><ol>${h2.map(([id, t]) => `<li><a href="#${id}">${t}</a></li>`).join('')}</ol></nav>` : ''}
<div class="txt">${html}</div>
${outros.length ? `<section style="padding:30px 0 0"><h2 style="font-size:1.5rem">Continue lendo</h2><div class="guias">${outros.slice(0, 3).map((p) => `<a class="guia" href="${prefixo}/blog/${esc(p.slug)}"><span class="k">${esc(p.category || info.categoria)}</span><h3>${esc(p.title)}</h3><span class="vm">Ler →</span></a>`).join('')}</div></section>` : ''}
</article><aside class="lado" aria-label="Recomendação">${principal ? cardProduto(principal, { rotulo: 'Indicado neste guia', um: true, melhor: v.melhor_para?.[principal.chave] }) : ''}
<a class="btn lin" href="${prefixo}/#comparativo">Ver o comparativo completo</a></aside></div>
<section style="padding-top:10px">${captura(info, v)}</section></div></main>${rodape(info)}
${principal ? `<div class="fixo"><span><b>${esc(principal.nome)}</b>${principal.preco ? brl(principal.preco) : ''}</span><a class="btn sm" href="${esc(principal.url)}" ${REL}>Ver oferta →</a></div>` : ''}</body></html>`;
}
