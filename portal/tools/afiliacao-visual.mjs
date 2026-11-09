// Visual de venda dos blogs de afiliado (kbsa.app/<blog>): home comparativa, lista de guias e post, gravados como
// páginas próprias (raiz, "blog" e "blog/<slug>") por cima do modelo genérico do blog. Segue o padrão dos sites que
// mais vendem como afiliado nesses nichos: resposta pronta acima da dobra, ficha igual para todo produto (foto, tipo,
// preço, para quem é, botão), tabela com botão em cada linha, "como escolhemos", FAQ, data de atualização e um único
// botão de destaque por tela. Só usa dado real do produto (nome, tipo, preço e foto do marketplace).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { institucional, ROTULO, PAGINAS, emailDe } from './afiliacao-institucional.mjs';
import { htmlText, faqDoTexto, faqLd, IMG_LOCAL, dimensoesImagem } from '../lib/modules/blog.mjs';

const PUBLICO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
/** Foto do produto servida pelo próprio Portal (webp de 600 px gerado por tools/afiliacao-capas.mjs), em vez da original da Hotmart/Kiwify,
 *  que chega com vários MB e era o LCP das homes. Sem o arquivo local, segue a foto original. */
export const fotoLocal = (chave) => { const rel = `/assets/afiliacao/produtos/${chave}.webp`; return fs.existsSync(path.join(PUBLICO, rel)) ? rel : null; };
const absoluta = (src, prefixo) => (src && src.startsWith('/') ? `${new URL(prefixo).origin}${src}` : src || null);

/** Capa do post (campo "cover": /assets/afiliacao/<blog>/<slug>-capa.png). Só caminho local de imagem; senão null. */
export const capaDo = (post) => (IMG_LOCAL.test(String(post?.cover || '')) ? String(post.cover) : null);
/** Endereço absoluto da capa para og:image/Article.image: mesma origem do blog (kbsa.app/assets/... cai no portal). */
const capaAbs = (capa, prefixo) => (capa ? `${new URL(prefixo).origin}${capa}` : null);
const capaCard = (p, primeiro = false) => { const c = capaDo(p); if (!c) return ''; const [w, h] = dimensoesImagem(c, [1200, 630]); return `<img class="gc" src="${esc(c)}" alt="${esc(p.coverAlt || '')}" ${primeiro ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" width="${w}" height="${h}">`; };

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
  return l.status === 'ativo' && l.url ? { chave, ...c, img: fotoLocal(chave) || c.img, url: l.url } : null;
}

const css = (v) => `
:root{--a:${v.cor};--a2:${v.cor2 || v.cor};--ink:#15171c;--mut:#4f5563;--line:#e3e5ea;--bg:#fff;--soft:${v.suave || '#f5f6f8'};--tint:color-mix(in srgb,var(--a) 9%,#fff);--deep:color-mix(in srgb,var(--a) 72%,#000);--r:10px;--fh:'${v.fonte || 'Archivo'}',system-ui,sans-serif;--fb:'Atkinson Hyperlegible Next',system-ui,sans-serif}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;overflow-x:clip}body{margin:0;background:var(--bg);color:var(--ink);font:400 18px/1.65 var(--fb);overflow-wrap:break-word}
::selection{background:color-mix(in srgb,var(--a) 28%,#fff);color:var(--ink)}:focus-visible{outline:3px solid var(--a);outline-offset:3px;border-radius:4px}
a{color:var(--deep);text-underline-offset:.18em;text-decoration-thickness:1px}img{max-width:100%;display:block}.w{width:min(1160px,calc(100% - 32px));margin:0 auto}
.top{position:sticky;top:0;z-index:20;background:#fff;border-bottom:1px solid var(--line)}
.top .w{display:flex;align-items:center;justify-content:space-between;gap:16px;height:64px}
.marca{display:flex;align-items:center;gap:10px;font:700 1.15rem/1 var(--fh);color:var(--ink);text-decoration:none;letter-spacing:-.01em;min-width:0}
.marca i{flex:none;width:12px;height:22px;border-radius:2px;background:var(--a)}
.top nav{display:flex;gap:26px;font-size:.95rem}.top nav a{color:var(--mut);text-decoration:none}.top nav a:hover{color:var(--ink);text-decoration:underline}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:14px 22px;border-radius:8px;background:var(--a);color:#fff!important;font:700 1rem/1.15 var(--fb);text-decoration:none;border:0;cursor:pointer;transition:background-color .15s}
.btn:hover{background:var(--deep)}.btn.lin{background:#fff;color:var(--ink)!important;border:1.5px solid var(--ink)}.btn.lin:hover{background:var(--soft)}.btn.sm{padding:10px 14px;font-size:.92rem;white-space:nowrap}
.hero{background:var(--tint);border-bottom:1px solid var(--line)}
.hero .w{padding:56px 0 52px}
h1{font:700 clamp(2rem,4.6vw,3.4rem)/1.08 var(--fh);letter-spacing:-.025em;margin:0 0 16px;max-width:24ch;text-wrap:balance}h1 em{font-style:normal;color:inherit}
.sub{font-size:1.2rem;color:var(--mut);max-width:62ch;margin:0 0 18px}.meta{display:flex;flex-wrap:wrap;gap:4px 18px;color:var(--mut);font-size:.9rem}.meta span+span:before{content:'';display:inline-block;width:4px;height:4px;border-radius:50%;background:currentColor;margin:0 10px 3px -10px;opacity:.6}
.picks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin-top:34px}
.picks.n1,.picks.n2{grid-template-columns:1fr}
.card{position:relative;display:flex;flex-direction:column;background:#fff;border:1px solid var(--line);border-radius:var(--r);overflow:hidden;box-shadow:0 1px 2px rgba(21,23,28,.05),0 8px 24px -16px rgba(21,23,28,.22)}
.card .ft{aspect-ratio:16/10;background:#fff;border-bottom:1px solid var(--line);overflow:hidden;display:grid;place-items:center}.card .ft img{width:100%;height:100%;object-fit:cover}
.picks.n1 .card,.picks.n2 .card{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr)}
.picks.n1 .card .ft,.picks.n2 .card .ft{aspect-ratio:auto;height:100%;max-height:340px;border:0;border-right:1px solid var(--line);background:var(--soft);padding:18px}.picks.n1 .card .ft img,.picks.n2 .card .ft img{object-fit:contain;border-radius:6px}
.card .tag{align-self:flex-start;padding:3px 9px;border-radius:5px;background:var(--soft);color:var(--ink);font-size:.82rem;font-weight:700}
.card .tag.um{background:var(--a);color:#fff}.card .cp{padding:18px 20px 20px;display:flex;flex-direction:column;gap:8px;flex:1}
.card .cn{font:700 1.2rem/1.25 var(--fh);margin:0;letter-spacing:0}.card .tp{font-size:.88rem;color:var(--mut)}
.card .pr{font:700 1.5rem/1 var(--fh);margin:4px 0 0;font-variant-numeric:tabular-nums}.card .pr small{font:400 .82rem var(--fb);color:var(--mut)}
.card .pq{font-size:.96rem;color:var(--ink);margin:2px 0 8px}.card .pq b{font-weight:700}
.card .btn{margin-top:auto;width:100%}.nota{font-size:.8rem;color:var(--mut);text-align:center;margin-top:4px}
section{padding:60px 0}section.alt{background:var(--soft);border-block:1px solid var(--line)}
h2{font:700 clamp(1.55rem,3vw,2.2rem)/1.15 var(--fh);letter-spacing:-.02em;margin:0 0 10px;text-wrap:balance}.lead{color:var(--mut);margin:0 0 26px;max-width:66ch}
.tabw{overflow-x:auto;border:1px solid var(--line);border-radius:var(--r)}
.tab{width:100%;border-collapse:collapse;background:#fff;font-size:.98rem}
.tab th,.tab td{padding:14px 16px;text-align:left;border-bottom:1px solid var(--line);vertical-align:middle}.tab th{background:var(--soft);font-size:.85rem;font-weight:700;color:var(--mut)}
.tab tr:last-child td{border-bottom:0}.tab td:nth-child(3){font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:700}.tab .nm{display:flex;align-items:center;gap:12px;font-weight:700}.tab .nm img{width:48px;height:48px;border-radius:6px;object-fit:cover;flex:none}
.guias{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px 24px}
.guia{display:flex;flex-direction:column;gap:8px;text-decoration:none;color:var(--ink)}
.guia .gc,.guia .gx{width:100%;height:auto;aspect-ratio:1200/630;object-fit:cover;border-radius:var(--r);border:1px solid var(--line);margin-bottom:6px}
.guia .gx{display:grid;align-content:end;padding:18px;background:var(--a);color:#fff;font:700 1.25rem/1.15 var(--fh)}
.guia .k{font-size:.85rem;color:var(--deep);font-weight:700}
.guia h3{font:700 1.2rem/1.28 var(--fh);margin:0;text-wrap:balance}.guia:hover h3{text-decoration:underline;text-underline-offset:.15em}.guia p{margin:0;color:var(--mut);font-size:.98rem;line-height:1.55}.guia .vm{display:none}
.guias.dest .guia:first-child{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,7fr) minmax(0,5fr);gap:28px;align-items:center}
.guias.dest .guia:first-child h3{font-size:clamp(1.5rem,2.6vw,2.1rem);line-height:1.15}.guias.dest .guia:first-child .gc,.guias.dest .guia:first-child .gx{margin:0}
.guias.dest .guia:first-child > div{display:flex;flex-direction:column;gap:10px}
.capa{margin:26px 0 0}.capa img{width:100%;height:auto;border-radius:var(--r);border:1px solid var(--line)}
.txt .blog-fig{margin:1.6em 0}.txt .blog-fig img{width:100%;height:auto;border-radius:8px;border:1px solid var(--line)}
.passos{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:28px;counter-reset:p}
.passo{padding-top:16px;border-top:2px solid var(--ink)}.passo:before{counter-increment:p;content:'Passo ' counter(p);display:block;font:700 .9rem/1 var(--fb);color:var(--deep);margin-bottom:10px}
.passo h3{font:700 1.12rem/1.3 var(--fh);margin:0 0 6px}.passo p{margin:0;color:var(--mut);font-size:.98rem;line-height:1.55}
.faq{max-width:820px}.faq details{border-bottom:1px solid var(--line)}.faq summary{cursor:pointer;font-weight:700;padding:18px 0;list-style:none;display:flex;justify-content:space-between;gap:16px}.faq summary::-webkit-details-marker{display:none}
.faq summary:after{content:'';flex:none;width:10px;height:10px;margin-top:8px;border-right:2px solid var(--ink);border-bottom:2px solid var(--ink);transform:rotate(45deg);transition:transform .2s}.faq details[open] summary:after{transform:rotate(225deg)}.faq details p{margin:0 0 18px;color:var(--mut);max-width:70ch}
.cap{display:grid;grid-template-columns:1.2fr 1fr;gap:28px;align-items:center;padding:34px;border-radius:var(--r);background:var(--ink);color:#fff}
.cap h2{color:#fff}.cap p{margin:0;color:#d5d8de}.cap form{display:flex;flex-direction:column;gap:10px}
.cap input[type=email]{padding:15px 16px;border-radius:8px;border:0;font:400 1rem var(--fb)}.cap label{display:flex;gap:8px;font-size:.85rem;color:#d5d8de;align-items:flex-start}
footer{padding:40px 0 110px;border-top:1px solid var(--line);color:var(--mut);font-size:.9rem}footer .w{display:grid;gap:10px;max-width:none}footer span{max-width:80ch}footer .rod{display:flex;flex-wrap:wrap;gap:6px 18px}footer .rod a{color:var(--ink)}
/* post */
.bc{font-size:.88rem;color:var(--mut);margin-bottom:10px}.bc a{color:var(--mut)}
.grade{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:56px;align-items:start;padding:40px 0 20px}
article{min-width:0}
.rapida{background:var(--tint);border-radius:var(--r);padding:20px 22px;margin:26px 0}
.rapida b{display:block;font:700 1rem/1.2 var(--fh);color:var(--ink);margin-bottom:6px}.rapida p{margin:0}
.indice{border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:16px 0;margin:0 0 30px}.indice b{font:700 1rem var(--fh)}
.indice ol{margin:8px 0 0;padding-left:22px;font-size:1rem;columns:2 260px;column-gap:32px}.indice li{margin:4px 0;break-inside:avoid}.indice a{color:var(--ink);text-decoration:none}.indice a:hover{color:var(--deep);text-decoration:underline}
.txt{font-size:1.12rem;line-height:1.75;max-width:70ch}.txt h2{margin:1.9em 0 .5em;scroll-margin-top:84px}.txt h3{font:700 1.25rem/1.3 var(--fh);margin:1.6em 0 .4em}
.txt p{margin:0 0 1.15em}.txt ul,.txt ol{padding-left:1.3em;margin:0 0 1.3em}.txt li{margin:.35em 0}.txt strong{font-weight:700}
.txt .blog-box{margin:0 0 1.5em;padding:18px 20px;border-radius:var(--r);background:var(--soft)}.txt .blog-box-title{display:block;font:700 1.02rem var(--fh);margin-bottom:6px}
.txt .blog-box p:last-child{margin:0}.txt .blog-box-dica{background:var(--tint)}
.oferta{display:grid;grid-template-columns:160px minmax(0,1fr);gap:20px;align-items:center;margin:0 0 1.6em;padding:18px;border:1px solid var(--line);border-radius:var(--r);background:#fff;box-shadow:0 8px 24px -16px rgba(21,23,28,.25)}
.oferta img{width:160px;height:120px;border-radius:6px;object-fit:contain;background:var(--soft)}.oferta .k{font-size:.85rem;font-weight:700;color:var(--deep)}
.oferta h4{font:700 1.2rem/1.25 var(--fh);margin:2px 0 4px}.oferta .tx{font-size:.98rem;color:var(--mut);margin:0 0 12px;line-height:1.55}.oferta .tx p{margin:0}
.oferta .ln{display:flex;flex-wrap:wrap;align-items:center;gap:14px}.oferta .pr{font:700 1.3rem var(--fh);font-variant-numeric:tabular-nums}
.lado{position:sticky;top:88px;display:grid;gap:12px}.lado .card .ft{aspect-ratio:16/10}
.fixo{display:none}
@media(max-width:920px){.grade{grid-template-columns:1fr;gap:0}.lado{position:static;margin-top:20px}.top nav{display:none}
.picks{grid-template-columns:1fr}.guias{grid-template-columns:repeat(2,minmax(0,1fr))}
.cap{grid-template-columns:1fr;padding:24px}.tab .esc{display:none}
.fixo{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:30;gap:12px;align-items:center;justify-content:space-between;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid var(--line);box-shadow:0 -6px 20px -12px rgba(21,23,28,.3)}
.fixo span{font-size:.85rem;line-height:1.3;color:var(--mut);min-width:0}.fixo span b{display:block;color:var(--ink);font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
@media(max-width:640px){body{font-size:17px}.hero .w{padding:34px 0 30px}section{padding:42px 0}.guias,.guias.dest .guia:first-child{grid-template-columns:1fr}
.picks.n1 .card,.picks.n2 .card{grid-template-columns:1fr}.picks.n1 .card .ft,.picks.n2 .card .ft{border-right:0;border-bottom:1px solid var(--line);max-height:240px}
.oferta{grid-template-columns:1fr}.oferta img{width:100%;height:auto;aspect-ratio:16/10}.top .btn.sm{padding:9px 12px}
.tab th:nth-child(3),.tab td:nth-child(3){display:none}.tab th,.tab td{padding:12px 10px}}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
`;
/** Espaço do script do Google AdSense, DESLIGADO até a aprovação: só sai com adsense.json {cliente:"ca-pub-<16 dígitos>", ativo:true}
 *  (veja passo a passo em 03-PROJECTS/Active/adsense-blogs.md). Desligado, não carrega nada de terceiros. */
export function adsenseTag(a) {
  if (!a || a.ativo !== true || !/^ca-pub-\d{16}$/.test(String(a.cliente || ''))) return '<!-- adsense: desligado até a aprovação -->';
  return `<meta name="google-adsense-account" content="${esc(a.cliente)}"><script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(a.cliente)}" crossorigin="anonymous"></script>`;
}

function head({ titulo, desc, canonical, v, ld, og }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title><meta name="description" content="${esc(desc).slice(0, 160)}"><link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="index,follow,max-image-preview:large"><meta property="og:type" content="${og || 'website'}"><meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(desc).slice(0, 200)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:locale" content="pt_BR">
${v.imagem ? `<meta property="og:image" content="${esc(v.imagem)}">${/-capa\.(png|jpe?g|webp)$/.test(v.imagem) ? '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' : ''}<meta property="og:image:alt" content="${esc(titulo)}"><meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}${v.lcp ? `<link rel="preload" as="image" href="${esc(v.lcp)}" fetchpriority="high">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${((u) => `<link rel="preload" as="style" href="${u}" onload="this.onload=null;this.rel='stylesheet'"><noscript><link rel="stylesheet" href="${u}"></noscript>`)(`https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;700&amp;family=${encodeURIComponent(v.fonte || 'Archivo').replace(/%20/g, '+')}:wght@600;700&amp;display=swap`)}
<meta name="theme-color" content="${esc(v.cor)}">${adsenseTag(v._adsense)}<style>${css(v)}</style>
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}</head>`;
}

function topo(info, prefixo, v) {
  return `<header class="top"><div class="w"><a class="marca" href="${prefixo}/"><i aria-hidden="true"></i>${esc(info.nome)}</a>
<nav aria-label="Principal"><a href="${prefixo}/#comparativo">Comparativo</a><a href="${prefixo}/blog">Guias</a><a href="${prefixo}/#duvidas">Dúvidas</a></nav>
${(v.destaques || []).some((k) => !v._ativos || v._ativos.has(k)) ?`<a class="btn sm" href="${prefixo}/#comparativo">${esc(v.cta_topo || 'Ver os melhores')}</a>` : ''}</div></header>`;
}

function rodape(info, prefixo = '') {
  const nav = PAGINAS.map((p) => `<a href="${prefixo}/${p}">${esc(ROTULO[p])}</a>`).join('');
  return `<footer><div class="w"><strong>${esc(info.nome)}</strong><span>${esc(info.descricao)}</span>
<nav class="rod" aria-label="Institucional">${nav}</nav>
<span><b>Transparência:</b> alguns links deste site são de afiliado. Se você comprar por eles, recebemos uma comissão, sem custo extra para você. Isso não muda a ordem nem o que escrevemos; confira sempre na página oficial o conteúdo, o preço e a garantia antes de comprar. <a href="${prefixo}/aviso-de-afiliados">Saiba mais</a>.</span>
<span>Contato: <a href="mailto:${esc(emailDe(info, String(prefixo).replace(/^https?:\/\//, '')))}">${esc(emailDe(info, String(prefixo).replace(/^https?:\/\//, '')))}</a> · © ${ANO} ${esc(info.nome)} · Conteúdo informativo, sem promessa de resultado.</span></div></footer>`;
}

function cardProduto(p, { rotulo, um, melhor, primeiro, nivel = 'h2' }) {
  return `<article class="card">
<div class="ft">${p.img ? `<img src="${esc(p.img)}" alt="${esc(p.nome)}" ${primeiro ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" width="600" height="375">` : ''}</div>
<div class="cp">${rotulo ? `<span class="tag${um ? ' um' : ''}">${esc(rotulo)}</span>` : ''}<span class="tp">${esc(p.tipo || 'Curso online')}</span><${nivel} class="cn">${esc(p.nome)}</${nivel}>
${p.preco ? `<div class="pr">${brl(p.preco)} <small>${esc(p.preco_nota || 'na página oficial')}</small></div>` : ''}
${melhor ? `<div class="pq"><b>Para quem é:</b> ${esc(melhor)}</div>` : ''}
<a class="btn" href="${esc(p.url)}" ${REL}>${esc(p.cta || 'Ver na página oficial')}</a><span class="nota">Preço e condições conferidos em ${dataBr()}</span></div></article>`;
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
  const capaHome = capaAbs(capaDo(posts[0]), prefixo) || absoluta(prods[0]?.img, prefixo);
  const desc = v.desc_seo || info.descricao;
  const canonical = `${prefixo}/`;
  const faq = v.faq || [];
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebSite', '@id': `${canonical}#site`, url: canonical, name: info.nome, inLanguage: 'pt-BR', description: desc },
    { '@type': 'ItemList', name: v.h1, itemListElement: prods.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.nome, url: p.url })) },
    ...(faq.length ? [faqLd(faq.map((f) => ({ q: f.q, a: f.a })), `${canonical}#faq`)] : []),
  ] };
  const linhas = prods.map((p) => `<tr><td><div class="nm">${p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy" width="52" height="52">` : ''}<span>${esc(p.nome)}</span></div></td>
<td class="esc">${esc(cap(v.melhor_para?.[p.chave] || p.tipo || ''))}</td><td>${p.preco ? brl(p.preco) : '—'}</td><td><a class="btn sm" href="${esc(p.url)}" ${REL}>Ver oferta</a></td></tr>`).join('');
  const guias = posts.map((p) => `<a class="guia" href="${prefixo}/blog/${esc(p.slug)}">${capaCard(p) || `<span class="gx" aria-hidden="true">${esc(info.nome)}</span>`}<div><span class="k">${esc(p.category || info.categoria)}</span><h3>${esc(p.title)}</h3><p>${esc(frase(p.excerpt, 170))}</p></div></a>`).join('');
  return `${head({ titulo, desc, canonical, v: { ...v, imagem: v.imagem || capaHome, lcp: prods[0]?.img }, ld })}<body>${topo(info, prefixo, v)}
<main><div class="hero"><div class="w">
<h1>${esc(v.h1)}</h1><p class="sub">${esc(v.sub || info.tagline)}</p>
<div class="meta"><span>Por ${esc(info.autor || `Equipe ${info.nome}`)}</span><span>Atualizado em ${dataBr()}</span>${prods.length ? `<span>${prods.length} opções comparadas por preço e para quem servem</span>` : ''}</div>
<div class="picks n${Math.min(prods.length, 3)}">${prods.slice(0, 3).map((p, i) => cardProduto(p, { rotulo: rotulo(p, i), um: i === 0, primeiro: i === 0, melhor: v.melhor_para?.[p.chave] })).join('')}</div></div></div>
${prods.length ? `<section id="comparativo"><div class="w"><h2>${esc(v.tabela_titulo || 'Comparativo lado a lado')}</h2><p class="lead">${esc(v.tabela_texto || 'Preço da página oficial e o perfil de quem aproveita mais cada opção. Clique para conferir o conteúdo e a garantia antes de decidir.')}</p>
<div class="tabw"><table class="tab"><thead><tr><th>Opção</th><th class="esc">Para quem é</th><th>Preço</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div></div></section>` : ''}
${v.passos?.length ? `<section class="alt"><div class="w"><h2>${esc(v.passos_titulo || 'Como escolher em 3 passos')}</h2><p class="lead">${esc(v.passos_texto || '')}</p>
<div class="passos">${v.passos.map((s) => `<div class="passo"><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p></div>`).join('')}</div></div></section>` : ''}
<section><div class="w"><h2>${esc(v.guias_titulo || 'Guias para decidir sem cair em promessa')}</h2><p class="lead">${esc(frase(info.home_intro || info.descricao, 280))}</p><div class="guias dest">${guias}</div></div></section>
<section class="alt"><div class="w"><h2>Como escolhemos</h2><p class="lead" style="margin-bottom:0">${esc(v.metodo || 'Comparamos o que cada produto mostra na página oficial: o tipo de conteúdo, o preço e para quem ele foi feito. Não aceitamos pagamento para mudar a ordem. Quando a página do produto muda, atualizamos o comparativo e a data no topo.')}</p></div></section>
${faq.length ? `<section id="duvidas"><div class="w"><h2>Perguntas frequentes</h2>${faqHtml(faq)}</div></section>` : ''}
<section><div class="w">${captura(info, v)}</div></section></main>${rodape(info, prefixo)}
${prods[0] ? `<div class="fixo"><span><b>${esc(prods[0].nome)}</b>${prods[0].preco ? brl(prods[0].preco) : ''}</span><a class="btn sm" href="${esc(prods[0].url)}" ${REL}>Ver oferta</a></div>` : ''}</body></html>`;
}

/** Lista de guias (/blog). */
export function renderLista({ info, v, posts, prefixo }) {
  const canonical = `${prefixo}/blog`;
  const guias = posts.map((p, i) => `<a class="guia" href="${prefixo}/blog/${esc(p.slug)}">${capaCard(p, i === 0) || `<span class="gx" aria-hidden="true">${esc(info.nome)}</span>`}<div><span class="k">${esc(p.category || info.categoria)}</span><h3>${esc(p.title)}</h3><p>${esc(frase(p.excerpt, 170))}</p></div></a>`).join('');
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: `Guias · ${info.nome}`, url: canonical, inLanguage: 'pt-BR',
    hasPart: posts.map((p) => ({ '@type': 'Article', headline: p.title, url: `${prefixo}/blog/${p.slug}` })) };
  return `${head({ titulo: `Guias ${v.assunto ? `de ${v.assunto} ` : ''}· ${info.nome}`, desc: info.descricao, canonical, v: { ...v, imagem: v.imagem || capaAbs(capaDo(posts[0]), prefixo), lcp: capaDo(posts[0]) }, ld })}<body>${topo(info, prefixo, v)}
<main><div class="hero"><div class="w"><h1>Guias do ${esc(info.nome)}</h1><p class="sub">${esc(info.tagline)}</p><div class="meta"><span>${posts.length} guias</span><span>Atualizado em ${dataBr()}</span></div></div></div>
<section><div class="w"><div class="guias dest">${guias}</div></div></section><section><div class="w">${captura(info, v)}</div></section></main>${rodape(info, prefixo)}</body></html>`;
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
<div><span class="k">Recomendação do guia</span><h4>${esc(p.nome)}</h4><div class="tx">${texto}</div><div class="ln">${p.preco ? `<span class="pr">${brl(p.preco)}</span>` : ''}<a class="btn" href="${esc(p.url)}" ${REL}>Ver na página oficial</a></div></div></aside>`;
  });
  // links de afiliado no meio do texto: marcados como patrocinados e abrindo em outra aba
  html = html.replace(/<a href="(https:\/\/(?:[a-z0-9-]+\.)*(?:kiwify\.app|kiwify\.com\.br|kiwify\.com|hotmart\.com|hotm\.art|l\.kbsa\.app)[^"]*)"(?: rel="[^"]*")?(?: target="[^"]*")?>/g,`<a href="$1" ${REL}>`);
  // índice pelos H2
  const h2 = [];
  html = html.replace(/<h2>(.*?)<\/h2>/g, (_m, t) => { const id = t.replace(/<[^>]+>/g, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); h2.push([id, t]); return `<h2 id="${id}">${t}</h2>`; });
  const faq = faqDoTexto(post.content);
  const outros = posts.filter((p) => p.slug !== post.slug);
  // capa própria do post manda no og:image e no Article.image; sem capa, segue a foto do produto principal
  const capa = capaDo(post);
  const [cw, ch] = capa ? dimensoesImagem(capa, [1200, 630]) : [];
  const imagem = capaAbs(capa, prefixo) || absoluta(principal?.img, prefixo);
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'Article', headline: post.title, description: post.seoDescription || post.excerpt, inLanguage: 'pt-BR', mainEntityOfPage: canonical, url: canonical,
      datePublished: publicado, dateModified: atualizado || publicado, author: { '@type': 'Organization', name: info.autor || `Equipe ${info.nome}`, url: `${prefixo}/autor` },
      publisher: { '@type': 'Organization', name: info.nome, url: `${prefixo}/` }, ...(imagem ? { image: imagem } : {}) },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: info.nome, item: `${prefixo}/` },
      { '@type': 'ListItem', position: 2, name: 'Guias', item: `${prefixo}/blog` }, { '@type': 'ListItem', position: 3, name: post.title, item: canonical }] },
    ...(faq.length ? [faqLd(faq, `${canonical}#faq`)] : []),
  ] };
  const titulo = `${post.seoTitle || post.title} · ${info.nome}`;
  return `${head({ titulo, desc: post.seoDescription || post.excerpt, canonical, v: { ...v, imagem: imagem || v.imagem }, ld, og: 'article' })}<body>${topo(info, prefixo, v)}
<main><div class="w"><div class="grade"><article>
<div class="bc"><a href="${prefixo}/">${esc(info.nome)}</a> › <a href="${prefixo}/blog">Guias</a> › ${esc(post.category || info.categoria)}</div>
<h1 style="font-size:clamp(1.9rem,4.4vw,3rem)">${esc(post.title)}</h1>
<div class="meta"><span>Por <a href="${prefixo}/autor" rel="author">${esc(info.autor || `Equipe ${info.nome}`)}</a></span>${publicado ? `<span>Publicado em <time datetime="${esc(String(publicado).slice(0, 10))}">${dataBr(publicado)}</time></span>` : ''}<span>Atualizado em <time datetime="${esc(String(atualizado || publicado || '').slice(0, 10))}">${dataBr(atualizado || publicado)}</time></span><span>${minutos(post.content)} min de leitura</span></div>
${capa ? `<figure class="capa"><img src="${esc(capa)}" alt="${esc(post.coverAlt || post.title)}" width="${cw}" height="${ch}" fetchpriority="high" decoding="async"></figure>` : ''}
${post.excerpt ? `<div class="rapida"><b>Resposta rápida</b><p>${esc(post.excerpt)}</p></div>` : ''}
${h2.length > 2 ? `<nav class="indice" aria-label="Neste guia"><b>Neste guia</b><ol>${h2.map(([id, t]) => `<li><a href="#${id}">${t}</a></li>`).join('')}</ol></nav>` : ''}
<div class="txt">${html}</div>
${(v.fontes || []).length ? `<section class="fontes" style="padding:30px 0 0"><h2 style="font-size:1.5rem">Fontes para conferir por conta própria</h2><p>Referências oficiais e confiáveis sobre o tema deste blog. Confira sempre a versão mais recente antes de decidir.</p><ul>${v.fontes.map((f) => `<li><a href="${esc(f.u)}" rel="noopener" target="_blank">${esc(f.t)}</a></li>`).join('')}</ul></section>` : ''}
${outros.length ? `<section style="padding:30px 0 0"><h2 style="font-size:1.5rem">Continue lendo</h2><div class="guias">${outros.slice(0, 3).map((p) => `<a class="guia" href="${prefixo}/blog/${esc(p.slug)}">${capaCard(p)}<span class="k">${esc(p.category || info.categoria)}</span><h3>${esc(p.title)}</h3></a>`).join('')}</div></section>` : ''}
</article><aside class="lado" aria-label="Recomendação">${principal ? cardProduto(principal, { rotulo: 'Indicado neste guia', um: true, nivel: 'p', melhor: v.melhor_para?.[principal.chave] }) : ''}
<a class="btn lin" href="${prefixo}/#comparativo">Ver o comparativo completo</a></aside></div>
<section style="padding-top:10px">${captura(info, v)}</section></div></main>${rodape(info, prefixo)}
${principal ? `<div class="fixo"><span><b>${esc(principal.nome)}</b>${principal.preco ? brl(principal.preco) : ''}</span><a class="btn sm" href="${esc(principal.url)}" ${REL}>Ver oferta</a></div>` : ''}</body></html>`;
}

/** Página obrigatória (sobre, contato, privacidade, termos, aviso-de-afiliados, autor), com o mesmo tema do blog. */
export function renderInstitucional({ pag, info, v, prefixo, posts = [], medicao = {} }) {
  const dominio = String(prefixo).replace(/^https?:\/\//, '');
  const t = institucional(pag, { info, dominio, medicao, posts });
  const canonical = `${prefixo}/${pag}`;
  const corpo = t.html.replace(/href="\/(?!\/)/g, `href="${prefixo}/`);
  const ld = { '@context': 'https://schema.org', '@type': pag === 'sobre' ? 'AboutPage' : pag === 'contato' ? 'ContactPage' : 'WebPage', name: t.titulo, url: canonical, inLanguage: 'pt-BR',
    isPartOf: { '@type': 'WebSite', name: info.nome, url: `${prefixo}/` }, ...(pag === 'autor' || pag === 'sobre' ? { about: { '@type': 'Organization', name: info.autor || `Equipe ${info.nome}`, url: `${prefixo}/autor`, email: emailDe(info, dominio) } } : {}) };
  return `${head({ titulo: t.titulo, desc: t.desc, canonical, v: { ...v, imagem: v.imagem || null, lcp: null }, ld })}<body>${topo(info, prefixo, v)}
<main><div class="hero"><div class="w"><h1>${esc(t.titulo.replace(/ · .*$/, ''))}</h1><p class="sub">${esc(t.sub || '')}</p></div></div>
<section><div class="w"><div class="txt">${corpo}</div></div></section></main>${rodape(info, prefixo)}</body></html>`;
}

/** Lojas aceitas como link direto nas ofertas (além do {{LINK:chave}} de produto ativo e do curto l.kbsa.app). */
const LOJAS = /^https:\/\/([a-z0-9-]+\.)*(shopee\.com\.br|shp\.ee|mercadolivre\.com\.br|mercadolivre\.com|mercadolibre\.com|amazon\.com\.br|amzn\.to|magazineluiza\.com\.br|magalu\.com|l\.kbsa\.app)(\/|$)/i;

/** Link de uma oferta: {{LINK:chave}} só de produto ativo; URL direta só https de loja conhecida. Senão null (item some). */
export function linkOferta(link, dados) {
  const s = String(link || '').trim();
  const m = /^\{\{LINK:([a-z0-9-]+)\}\}$/.exec(s);
  if (m) return produto(m[1], dados)?.url || null;
  return LOJAS.test(s) && !/["'<>\s]/.test(s) ? s : null;
}

/** Ofertas do dia (<domínio>/ofertas): preço e data da conferência visíveis, link patrocinado, estado vazio "em breve".
 *  Lê ofertas.json do blog: {"atualizado":"ISO","itens":[{nome, preco, preco_conferido_em, loja, link, imagem, nota}]}. */
export function renderOfertas({ info, v, ofertas, prefixo, dados }) {
  const canonical = `${prefixo}/ofertas`;
  const itens = (ofertas?.itens || []).map((it) => ({ ...it, url: linkOferta(it.link, dados) }))
    .filter((it) => it.nome && it.url && Number.isFinite(Number(it.preco)) && it.preco_conferido_em);
  const img = (s) => (IMG_LOCAL.test(String(s || '')) || /^https:\/\/[^\s"'<>]+$/.test(String(s || '')) ? String(s) : null);
  const cards = itens.map((it) => `<article class="card"><div class="ft">${img(it.imagem) ? `<img src="${esc(img(it.imagem))}" alt="${esc(it.nome)}" loading="lazy" width="600" height="450">` : ''}</div>
<div class="cp"><span class="tp">${esc(it.loja || 'Loja parceira')}</span><h3>${esc(it.nome)}</h3>
<div class="pr">${brl(it.preco)} <small>preço conferido em ${esc(dataBr(it.preco_conferido_em))}</small></div>
${it.nota ? `<div class="pq">${esc(it.nota)}</div>` : ''}
<a class="btn" href="${esc(it.url)}" ${REL}>Ver na loja →</a><span class="nota">O preço pode mudar a qualquer momento; confira na loja antes de comprar.</span></div></article>`).join('');
  const titulo = `Ofertas do dia · ${info.nome}`;
  const desc = `Ofertas selecionadas pelo ${info.nome}, com o preço e a data em que foi conferido. Preços mudam: confira sempre na loja.`;
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: titulo, url: canonical, inLanguage: 'pt-BR',
    ...(itens.length ? { mainEntity: { '@type': 'ItemList', itemListElement: itens.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.nome })) } } : {}) };
  const vazio = `<div class="cap" style="grid-template-columns:1fr"><div><h2>Em breve</h2><p>Estamos conferindo preços e lojas. As primeiras ofertas aparecem aqui assim que cada preço for verificado na loja.</p></div></div>`;
  return `${head({ titulo, desc, canonical, v: { ...v, imagem: v.imagem || null, lcp: null }, ld })}<body>${topo(info, prefixo, v)}
<main><div class="hero"><div class="w"><span class="selo"><b></b>${itens.length ? `Atualizado em ${esc(dataBr(ofertas.atualizado || itens[0].preco_conferido_em))}` : 'Em preparação'}</span>
<h1>Ofertas do dia</h1><p class="sub">Cada preço aparece com a data em que foi conferido. Alguns links são de afiliado: se você comprar por eles, recebemos uma comissão, sem custo extra para você.</p></div></div>
<section><div class="w">${itens.length ? `<div class="picks">${cards}</div>` : vazio}</div></section></main>${rodape(info, prefixo)}</body></html>`;
}
