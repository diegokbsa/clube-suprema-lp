// Visual editorial dos blogs de afiliado (12/11/2026, ordem do Kbsa: "refaça toda a parte de UX, algo convidativo, cores sem
// ser de IA, 100 de PageSpeed, padrão premium do premium; quero que o usuário olhe e queira ir no blog todo dia").
// Páginas próprias (raiz, "blog", "blog/<slug>" e institucionais) gravadas pelo afiliacao-instalar.mjs por cima do modelo
// genérico do blog. Um esqueleto só, a "ficha de conferência": cada blog tem uma voz que assina (Regra 02: pessoa por trás,
// personagem criado com IA e declarado), a home é uma edição do dia (destaque, comece por aqui, mais lidos, séries, recentes,
// fichas de compra com contexto, newsletter/Telegram) e o post é leitura confortável com índice, "o que conferir" e a oferta
// como etiqueta com "Publicidade" visível. Cores, fonte de título e voz de cada blog ficam em afiliacao-temas.mjs.
// Só usa dado real do produto (nome, tipo, preço com data da conferência e foto do marketplace).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { institucional, ROTULO, PAGINAS, emailDe } from './afiliacao-institucional.mjs';
import { htmlText, faqDoTexto, faqLd, IMG_LOCAL, dimensoesImagem } from '../lib/modules/blog.mjs';
import { nomeVariante } from './afiliacao-variantes.mjs';
import { temaDe, FONTES, SERIES, plantaDe } from './afiliacao-temas.mjs';

const PUBLICO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
/** Foto do produto servida pelo próprio Portal (webp de 600 px gerado por tools/afiliacao-capas.mjs), em vez da original da Hotmart/Kiwify,
 *  que chega com vários MB. Sem o arquivo local, segue a foto original. */
export const fotoLocal = (chave) => { const rel = `/assets/afiliacao/produtos/${chave}.webp`; return fs.existsSync(path.join(PUBLICO, rel)) ? rel : null; };
const absoluta = (src, prefixo) => (src && src.startsWith('/') ? `${new URL(prefixo).origin}${src}` : src || null);

/** Capa do post (campo "cover": /assets/afiliacao/<blog>/<slug>-capa.png). Só caminho local de imagem; senão null. */
export const capaDo = (post) => (IMG_LOCAL.test(String(post?.cover || '')) ? String(post.cover) : null);
/** Versão no endereço da imagem local (data do arquivo): a capa regerada aparece na hora, sem esperar o cache do Cloudflare. */
export const comVersao = (src) => { try { return `${src}?v=${Math.floor(fs.statSync(path.join(PUBLICO, src.replace(/^\/+/, ''))).mtimeMs / 1000).toString(36)}`; } catch { return src; } };
/** Versão menor da imagem local gerada por tools/afiliacao-variantes.mjs (assets/afiliacao/r/...), ou null se não existe. */
export const variante = (src, w) => {
  const rel = String(src || '').replace(/\?.*$/, '');
  if (!rel.startsWith('/assets/afiliacao/') || !/\.webp$/i.test(rel)) return null;
  const v = `/assets/afiliacao/${nomeVariante(rel.slice('/assets/afiliacao/'.length), w)}`;
  return fs.existsSync(path.join(PUBLICO, v.slice(1))) ? comVersao(v) : null;
};
/** Miniatura: a variante da largura pedida, senão a original. */
const mini = (src, w) => variante(src, w) || src;
/** srcset com a variante (quando existe) e a original, para o navegador do celular baixar a menor. */
const srcset = (src, w, wOrig, sizes) => { const m = variante(src, w); return m ? ` srcset="${esc(m)} ${w}w, ${esc(comVersao(src))} ${wOrig}w" sizes="${sizes}"` : ''; };
const capaAbs = (capa, prefixo) => (capa ? `${new URL(prefixo).origin}${comVersao(capa)}` : null);
/** Foto própria do post, sem texto por cima (public/assets/afiliacao/<blog>/fotos/<slug>.webp, 960x540, gerada pelo
 *  afiliacao-capas.mjs). No site a foto limpa entra no lugar da capa com título (que fica para og:image e Web Story):
 *  título gravado na imagem repete o h1 e dá cara de modelo pronto. Sem a foto, a capa. */
export function imagemDo(p, blog) {
  const foto = blog && p?.slug ? `/assets/afiliacao/${blog}/fotos/${p.slug}.webp` : null;
  if (foto && fs.existsSync(path.join(PUBLICO, foto.slice(1)))) { const [w, h] = dimensoesImagem(foto, [960, 540]); return { src: comVersao(foto), w, h, set: '' }; }
  const c = capaDo(p);
  if (!c) return null;
  const [w, h] = dimensoesImagem(c, [1200, 630]);
  const m = variante(c, 600);
  return { src: comVersao(c), w, h, set: m ? `${m} 600w, ${comVersao(c)} ${w}w` : '' };
}
const imgTag = (im, alt, { primeiro = false, sizes = '(max-width: 640px) 92vw, 380px', cls = 'gc' } = {}) => (im
  ? `<img class="${cls}" src="${esc(im.src)}"${im.set ? ` srcset="${esc(im.set)}" sizes="${sizes}"` : ''} alt="${esc(alt || '')}" ${primeiro ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" width="${im.w}" height="${im.h}">` : '');
/** Imagem do post em miniatura (lista, recentes, relacionados). primeiro = imagem do LCP. */
// Miniatura dentro de link que já tem o título do post: alt só quando descreve a imagem; se repete o título, fica vazio (decorativa).
const capaCard = (p, primeiro = false, sizes, blog) => { const alt = String(p.coverAlt || '').replace(/^Capa do guia: /, ''); return imgTag(imagemDo(p, blog), alt && alt !== p.title ? alt : '', { primeiro, sizes }); };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (v) => (Number.isFinite(Number(v)) ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: Number(v) % 1 ? 2 : 0 }) : '');
const ANO = new Date().getFullYear();
const dataBr = (iso) => { const d = new Date(iso || Date.now()); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }); };
const dataCurta = (iso) => { const d = new Date(iso || Date.now()); return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', timeZone: 'America/Sao_Paulo' }).replace('.', ''); };
const minutos = (md) => Math.max(3, Math.round(String(md || '').split(/\s+/).length / 210));
const frase = (t, max) => { const s = String(t || ''); if (s.length <= max) return s; const c = s.slice(0, max); const i = Math.max(c.lastIndexOf('. '), c.lastIndexOf('! '), c.lastIndexOf('? ')); return i > 80 ? c.slice(0, i + 1) : `${c.slice(0, c.lastIndexOf(' '))}…`; };
const cap = (t) => { const s = String(t || ''); return s ? s[0].toUpperCase() + s.slice(1) : s; };
const REL = 'rel="sponsored nofollow noopener" target="_blank"';
/** Família para o Google Fonts (usada só pela Web Story AMP, que não carrega fonte própria). Fonte de peso único vai sem peso. */
export const PESO_UNICO = new Set(['Young Serif']);
export const familiaFonte = (f, pesos) => { const n = f || 'Archivo'; const q = encodeURIComponent(n).replace(/%20/g, '+'); return PESO_UNICO.has(n) ? q : `${q}:wght@${pesos}`; };

/** Slug do blog (pasta em conteudo/afiliacao). */
const blogDe = (v) => v?.inscricao?.blog || v?._blog || '';
/** Voz do blog (Regra 02); blog sem tema assina como equipe. */
const vozDe = (v, info) => temaDe(blogDe(v), v).voz || { nome: info.autor || `Equipe ${info.nome}`, curto: info.nome, iniciais: String(info.nome || '?')[0], ele: 'a', papel: 'equipe editorial', jeito: info.tagline || '', bordao: 'Em destaque hoje' };
const assinatura = (voz) => `${voz.ele === 'a' ? 'conferida' : 'conferido'}`;

/** Produto pronto para a vitrine: dado do catálogo + link (de afiliado se ativo; senão a página de vendas). */
export function produto(chave, { catalogo, links }) {
  const c = catalogo[chave];
  if (!c) return null;
  const l = links[chave] || {};
  // só entra na vitrine com afiliação ativa: todo clique tem que gerar comissão
  return l.status === 'ativo' && l.url ? { chave, ...c, img: fotoLocal(chave) || c.img, url: l.url } : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// CSS. Tokens do tema (claro, escuro pelo sistema e escuro/claro escolhido no botão), fontes do próprio Portal e um
// esqueleto só. A coluna de leitura fica calma (fonte de texto, 68ch, contraste AA); a identidade do nicho mora na barra do
// topo, nos títulos, no carimbo de conferência, nas réguas da ficha e nas etiquetas de oferta.
const vars = (c) => `--fundo:${c.fundo};--papel:${c.papel};--tinta:${c.tinta};--suave:${c.suave};--linha:${c.linha};--a:${c.acento};--sa:${c.sobreAcento};--m:${c.marca};--sm:${c.sobreMarca}`;
const fonteDe = (t) => FONTES[t.fonte] || FONTES['familjen-grotesk'];
const css = (v) => {
  const t = temaDe(blogDe(v), v);
  const f = fonteDe(t);
  const k = t.medida || 1; // fontes condensadas pedem título maior para o mesmo peso visual
  return `
@font-face{font-family:'Texto';src:url(/assets/fontes/texto.woff2) format('woff2');font-weight:200 800;font-style:normal;font-display:swap}
@font-face{font-family:'Texto';src:url(/assets/fontes/texto-italico.woff2) format('woff2');font-weight:200 800;font-style:italic;font-display:swap}
@font-face{font-family:'Titulo';src:url(/assets/fontes/${t.fonte}.woff2) format('woff2');font-weight:${f.pesos};font-style:normal;font-display:swap}
@font-face{font-family:'Texto-r';src:local('Arial');size-adjust:104%;ascent-override:92%;descent-override:24%}
:root{${vars(t.claro)};color-scheme:light;--fb:'Texto','Texto-r',system-ui,sans-serif;--fh:'Titulo','Texto',system-ui,sans-serif;--ft:${f.titulo};--k:${k};--r:6px;--sombra:0 1px 2px rgb(0 0 0/.05),0 10px 30px -18px rgb(0 0 0/.28)}
@media(prefers-color-scheme:dark){:root:not([data-tema=claro]){${vars(t.escuro)};color-scheme:dark;--sombra:0 1px 2px rgb(0 0 0/.4),0 12px 30px -16px rgb(0 0 0/.7)}}
:root[data-tema=escuro]{${vars(t.escuro)};color-scheme:dark;--sombra:0 1px 2px rgb(0 0 0/.4),0 12px 30px -16px rgb(0 0 0/.7)}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;overflow-x:clip;scroll-padding-top:24px;scrollbar-color:color-mix(in srgb,var(--suave) 55%,transparent) var(--fundo)}
body{margin:0;background:var(--fundo);color:var(--tinta);font:400 1.0625rem/1.65 var(--fb);overflow-wrap:break-word;caret-color:var(--a);-webkit-font-smoothing:antialiased}
::selection{background:var(--m);color:var(--sm)}:focus-visible{outline:3px solid var(--a);outline-offset:3px;border-radius:2px}
a{color:var(--a);text-decoration-thickness:1px;text-underline-offset:.22em;transition:text-decoration-thickness .15s,color .15s}a:hover{text-decoration-thickness:2px}
img{max-width:100%;height:auto;display:block}.w{width:min(1200px,calc(100% - 40px));margin-inline:auto}
h1,h2,h3{font-family:var(--fh);font-weight:var(--ft);line-height:1.12;letter-spacing:-.012em;text-wrap:balance;margin:0}
h1{font-size:calc(clamp(2.1rem,4.6vw,3.5rem)*var(--k))}h2{font-size:calc(clamp(1.45rem,2.6vw,2rem)*var(--k))}h3{font-size:calc(1.18rem*var(--k));line-height:1.25}
.num{font-variant-numeric:tabular-nums}
/* topo */
.bf{background:var(--m);color:var(--sm);font-size:.9rem}.bf .w{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;padding:8px 0}.bf a{color:inherit;font-weight:700;margin-left:auto}
.top{background:var(--papel);border-bottom:1px solid var(--linha)}
.top .w{display:flex;align-items:center;gap:20px;min-height:68px}
.marca{display:flex;align-items:baseline;gap:10px;font:var(--ft) calc(1.42rem*var(--k))/1 var(--fh);letter-spacing:-.01em;color:var(--tinta);text-decoration:none;margin-right:auto}
.marca b{font:700 .7rem/1 var(--fb);letter-spacing:.06em;text-transform:uppercase;color:var(--suave);white-space:nowrap}
.top nav{display:flex;gap:22px;font-size:.95rem}.top nav a{color:var(--tinta);text-decoration:none;padding:6px 0;border-bottom:2px solid transparent;transition:border-color .2s}.top nav a:hover,.top nav a[aria-current]{border-color:var(--a)}
.modo{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;border:1px solid var(--linha);background:transparent;color:var(--tinta);cursor:pointer;transition:background-color .2s}.modo:hover{background:var(--fundo)}
.modo svg{width:18px;height:18px}.modo .lua{display:none}:root[data-tema=escuro] .modo .sol{display:none}:root[data-tema=escuro] .modo .lua{display:block}
@media(prefers-color-scheme:dark){:root:not([data-tema=claro]) .modo .sol{display:none}:root:not([data-tema=claro]) .modo .lua{display:block}}
/* carimbo de conferência: a assinatura do sistema */
.carimbo{display:inline-flex;flex-direction:column;align-items:center;gap:1px;padding:6px 10px 5px;border:2px solid var(--a);outline:1px solid var(--a);outline-offset:2px;border-radius:3px;color:var(--a);font:700 .66rem/1.15 var(--fb);letter-spacing:.09em;text-transform:uppercase;transform:rotate(-2.5deg);white-space:nowrap}
.carimbo b{font:var(--ft) 1.05rem/1 var(--fh);letter-spacing:0;text-transform:none}
@media(prefers-reduced-motion:no-preference){.post-cab .carimbo{animation:carimba .55s cubic-bezier(.16,1,.3,1) .25s both}@keyframes carimba{from{transform:rotate(-7deg) scale(1.18);opacity:.35}to{transform:rotate(-2.5deg) scale(1);opacity:1}}}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:13px 20px;border-radius:var(--r);background:var(--a);color:var(--sa)!important;font:700 1rem/1.15 var(--fb);text-decoration:none;border:0;cursor:pointer;transition:filter .15s,transform .15s}
.btn:hover{filter:brightness(1.1)}.btn:active{transform:translateY(1px)}.btn.lin{background:transparent;color:var(--tinta)!important;box-shadow:inset 0 0 0 1.5px var(--tinta)}.btn.sm{padding:9px 14px;font-size:.92rem;white-space:nowrap}
.pub{display:inline-block;padding:2px 7px;border-radius:3px;background:var(--fundo);border:1px solid var(--linha);color:var(--suave);font:700 .72rem/1.3 var(--fb);letter-spacing:.04em;text-transform:uppercase}
/* home */
.sec{padding:56px 0}.sec+.sec{border-top:1px solid var(--linha)}.sec h2{margin-bottom:6px}.lead{color:var(--suave);margin:0 0 26px;max-width:62ch}
.abre{padding:44px 0 50px;background:var(--papel);border-bottom:1px solid var(--linha)}
.abre-g{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,340px);grid-template-areas:'cab voz' 'hoje hoje';gap:34px 40px;align-items:end}.abre-g>.cab{grid-area:cab}.abre-g>.voz{grid-area:voz}.abre-g>.hoje{grid-area:hoje;margin-top:6px}
.abre .sub{font-size:1.15rem;color:var(--suave);margin:14px 0 0;max-width:58ch}
.edicao{margin:18px 0 0;padding-top:12px;border-top:1px solid var(--linha);font-size:.88rem;color:var(--suave)}
.voz{display:grid;grid-template-columns:auto 1fr;gap:14px 16px;align-items:start;padding:20px;border:1px solid var(--linha);border-radius:var(--r);background:var(--fundo)}
.voz h2{font-size:calc(1.25rem*var(--k))}.voz p{margin:2px 0 0;font-size:.96rem;color:var(--suave);line-height:1.5}.voz .ia{grid-column:1/-1;font-size:.82rem;margin:0}
.voz .lk{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px 16px;font-weight:700;font-size:.95rem}
.hoje{display:grid;grid-template-columns:minmax(0,7fr) minmax(0,5fr);gap:36px;align-items:center}
.hoje>a{display:block;border-radius:var(--r);overflow:hidden;box-shadow:var(--sombra)}.hoje>a img{width:100%;aspect-ratio:16/9;object-fit:cover;transition:transform .6s cubic-bezier(.16,1,.3,1)}.hoje>a:hover img{transform:scale(1.025)}
.hoje h2{font-size:calc(clamp(1.1rem,1.6vw,1.25rem)*var(--k));color:var(--a);margin-bottom:12px}.hoje h3{font-size:calc(clamp(1.6rem,2.8vw,2.3rem)*var(--k));line-height:1.1}.hoje h3 a{color:var(--tinta);text-decoration:none}.hoje h3 a:hover{text-decoration:underline;text-decoration-thickness:2px}
.hoje p{color:var(--suave);margin:14px 0 18px}.hoje .meta{font-size:.88rem;color:var(--suave);margin:0 0 18px}
.parou{padding:14px 0;background:var(--fundo);border-bottom:1px solid var(--linha);font-size:.95rem}.parou .w{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:baseline}.parou b{font-weight:700}
.trilha{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 32px;counter-reset:t}
.trilha li{counter-increment:t;padding-top:16px;border-top:2px solid var(--tinta)}.trilha li:before{content:counter(t) 'º passo';display:block;font:700 .82rem/1 var(--fb);color:var(--a);margin-bottom:10px}
.trilha a{color:var(--tinta);text-decoration:none;font:var(--ft) calc(1.2rem*var(--k))/1.22 var(--fh);display:block;margin-bottom:8px}.trilha a:hover{text-decoration:underline;text-decoration-thickness:2px}.trilha p{margin:0;color:var(--suave);font-size:.96rem;line-height:1.55}
.duas{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:56px}
.top5{list-style:none;margin:0;padding:0;counter-reset:r}.top5 li{counter-increment:r;display:grid;grid-template-columns:2.2ch 1fr;gap:14px;padding:12px 0;border-bottom:1px solid var(--linha)}
.top5 li:before{content:counter(r);font:var(--ft) calc(1.5rem*var(--k))/1 var(--fh);color:var(--a)}.top5 a{color:var(--tinta);text-decoration:none;font-weight:700}.top5 a:hover{text-decoration:underline}
.series{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:26px 32px}.serie h3{display:flex;justify-content:space-between;gap:8px;padding-bottom:8px;border-bottom:1px solid var(--tinta);margin-bottom:6px}.serie h3 span{font:400 .85rem var(--fb);color:var(--suave)}
.serie ul{list-style:none;margin:0;padding:0}.serie li{padding:6px 0;font-size:.97rem;line-height:1.4}.serie a{color:var(--tinta);text-decoration:none}.serie a:hover{color:var(--a);text-decoration:underline}
.guias{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:34px 28px}
.guia{display:flex;flex-direction:column;gap:6px;text-decoration:none;color:var(--tinta)}
.guia .gc,.guia .gx{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:var(--r);margin-bottom:8px;background:var(--linha)}
.guia .gx{display:grid;align-content:end;padding:16px;background:var(--a);color:var(--sa);font:var(--ft) 1.2rem/1.15 var(--fh)}
.guia .k{font-size:.82rem;color:var(--suave)}.guia h3{transition:color .15s}.guia:hover h3{color:var(--a)}.guia p{margin:0;color:var(--suave);font-size:.96rem;line-height:1.5}
.guias.dest .guia:first-child{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,7fr) minmax(0,5fr);gap:30px;align-items:center}.guias.dest .guia:first-child h3{font-size:calc(clamp(1.5rem,2.6vw,2.1rem)*var(--k))}.guias.dest .guia:first-child>div{display:flex;flex-direction:column;gap:10px}
.ficha-tab{border-top:2px solid var(--tinta)}.ficha-cab{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:8px 20px;margin-bottom:18px}
.tabw{overflow-x:auto}.tab{width:100%;border-collapse:collapse;font-size:.97rem}
.tab th,.tab td{padding:14px 12px;text-align:left;border-bottom:1px solid var(--linha);vertical-align:middle}.tab th{font-size:.78rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--suave)}
.tab td:nth-child(3){font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:700}.tab .nm{display:flex;align-items:center;gap:12px;font-weight:700}.tab .nm img{width:52px;height:52px;border-radius:4px;object-fit:cover;flex:none;background:var(--fundo)}
.tab .nm small{display:block;font-weight:400;color:var(--suave);font-size:.84rem}.tab tbody tr{transition:background-color .15s}.tab tbody tr:hover{background:color-mix(in srgb,var(--a) 5%,transparent)}
.nota{font-size:.84rem;color:var(--suave);margin:14px 0 0;max-width:72ch}
.assine{display:grid;grid-template-columns:minmax(0,7fr) minmax(0,5fr);gap:20px}
.cap{padding:30px;border-radius:var(--r);background:var(--tinta);color:var(--fundo)}.cap h2{color:inherit;margin-bottom:8px}.cap p{margin:0 0 16px;opacity:.82}
.cap form{display:grid;gap:10px}.cap input[type=email]{padding:14px 15px;border-radius:var(--r);border:1px solid transparent;font:400 1rem var(--fb);background:var(--papel);color:var(--tinta)}
.cap label{display:flex;gap:8px;font-size:.84rem;align-items:flex-start;opacity:.85}.cap label.em{font-size:.9rem;font-weight:700;opacity:1}.cap .isca{position:absolute;left:-9999px}.cap .ins-msg{margin:0;font-size:.9rem;min-height:1.3em;opacity:1}
.cap .btn{background:var(--m);color:var(--sm)!important}
.tel{display:flex;flex-direction:column;justify-content:space-between;gap:16px;padding:30px;border-radius:var(--r);border:1px solid var(--linha);background:var(--papel)}.tel h2{font-size:calc(1.4rem*var(--k))}.tel p{margin:6px 0 0;color:var(--suave)}
.faq{max-width:820px}.faq details{border-bottom:1px solid var(--linha)}.faq summary{cursor:pointer;font-weight:700;padding:17px 0;list-style:none;display:flex;justify-content:space-between;gap:16px}.faq summary::-webkit-details-marker{display:none}
.faq summary:after{content:'';flex:none;width:9px;height:9px;margin-top:8px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg);transition:transform .25s cubic-bezier(.16,1,.3,1)}.faq details[open] summary:after{transform:rotate(225deg)}.faq details p{margin:0 0 18px;color:var(--suave);max-width:70ch}
.metodo{max-width:72ch;color:var(--suave)}
footer{padding:46px 0 120px;background:var(--papel);border-top:1px solid var(--linha);color:var(--suave);font-size:.9rem}footer .w{display:grid;gap:12px}footer strong{font:var(--ft) calc(1.25rem*var(--k)) var(--fh);color:var(--tinta)}footer span{max-width:80ch}
footer .rod{display:flex;flex-wrap:wrap;gap:6px 18px}footer .rod a{color:var(--tinta)}
/* post */
.progresso{position:fixed;inset:0 0 auto;height:3px;background:var(--a);transform-origin:0 50%;transform:scaleX(0);z-index:40}
@supports (animation-timeline:scroll()){@media(prefers-reduced-motion:no-preference){.progresso{animation:ler linear both;animation-timeline:scroll(root)}@keyframes ler{to{transform:scaleX(1)}}}}
.post-cab{padding:34px 0 0;max-width:860px}.bc{font-size:.88rem;color:var(--suave);margin-bottom:14px}.bc a{color:var(--suave)}
.post-cab h1{font-size:calc(clamp(2rem,4.2vw,3.1rem)*var(--k));line-height:1.08}
.linha-fina{font-size:1.2rem;line-height:1.55;color:var(--suave);margin:16px 0 0;max-width:62ch}
.ficha{display:flex;flex-wrap:wrap;align-items:center;gap:14px 24px;margin:24px 0 0;padding:16px 0;border-block:1px solid var(--linha);font-size:.9rem;color:var(--suave)}
.ficha dl{display:flex;flex-wrap:wrap;gap:6px 24px;margin:0}.ficha dt{font-size:.74rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase}.ficha dd{margin:0;color:var(--tinta)}
.capa{margin:28px 0 0}.capa img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:var(--r)}
.post-g{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:64px;align-items:start;padding:34px 0 10px}
.txt{font-size:1.13rem;line-height:1.75;max-width:68ch}.txt h2{margin:1.9em 0 .55em;scroll-margin-top:24px}.txt h3{margin:1.6em 0 .45em}
.txt p{margin:0 0 1.15em}.txt ul,.txt ol{padding-left:1.25em;margin:0 0 1.3em}.txt li{margin:.4em 0}.txt li::marker{color:var(--a)}.txt strong{font-weight:700}
.txt blockquote{margin:1.6em 0;padding:0 0 0 20px;border-left:1px solid var(--a);font:var(--ft) calc(1.3rem*var(--k))/1.35 var(--fh);color:var(--tinta)}
.txt table{width:100%;border-collapse:collapse;margin:0 0 1.4em;font-size:.97rem;display:block;overflow-x:auto}.txt th,.txt td{padding:11px 12px;border-bottom:1px solid var(--linha);text-align:left;vertical-align:top}.txt th{font-size:.8rem;letter-spacing:.04em;text-transform:uppercase;color:var(--suave);border-bottom:2px solid var(--tinta)}
.txt .blog-box{margin:0 0 1.5em;padding:20px 22px;border-radius:var(--r);background:var(--papel);border:1px solid var(--linha);box-shadow:inset 0 3px 0 var(--a)}.txt .blog-box-title{display:block;font:var(--ft) calc(1.08rem*var(--k)) var(--fh);margin-bottom:8px}
.txt .blog-box p:last-child,.txt .blog-box ul:last-child{margin-bottom:0}.txt .blog-box-dica{box-shadow:inset 0 3px 0 var(--m)}
.txt .blog-box ul{list-style:none;padding:0}.txt .blog-box li{position:relative;padding-left:30px}.txt .blog-box li:before{content:'';position:absolute;left:0;top:.28em;width:16px;height:16px;border:1.5px solid var(--a);border-radius:3px}
.txt .blog-fig{margin:1.8em 0}.txt .blog-fig img{width:100%;border-radius:var(--r)}.txt .blog-fig figcaption{font-size:.86rem;color:var(--suave);margin-top:8px}
.oferta{margin:0 0 1.7em;border:1px solid var(--linha);border-radius:var(--r);background:var(--papel);box-shadow:var(--sombra);overflow:hidden;font-size:1rem;line-height:1.55}
.of-cab{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 16px;border-bottom:1px dashed var(--linha);font-size:.82rem;color:var(--suave)}
.of-g{display:grid;grid-template-columns:132px minmax(0,1fr);gap:18px;padding:16px}.of-g img{width:132px;height:132px;border-radius:4px;object-fit:cover;background:var(--fundo)}
.oferta .on{font:var(--ft) calc(1.2rem*var(--k))/1.2 var(--fh);margin:0 0 4px}.oferta .tx{color:var(--suave);margin:0 0 12px}.oferta .tx p{margin:0}
.oferta .ln{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px}.oferta .pr{font:var(--ft) calc(1.45rem*var(--k))/1 var(--fh);font-variant-numeric:tabular-nums}.oferta .pr small{display:block;font:400 .78rem/1.4 var(--fb);color:var(--suave);margin-top:3px}
.assina{display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:center;margin:2.2em 0 0;padding:22px 0;border-top:1px solid var(--linha);font-size:.95rem;color:var(--suave)}.assina b{display:block;color:var(--tinta);font:var(--ft) calc(1.15rem*var(--k)) var(--fh)}.assina p{margin:2px 0 0}
.lado{position:sticky;top:20px;display:grid;gap:22px}
.indice{font-size:.94rem}.indice b{display:block;font:700 .76rem var(--fb);letter-spacing:.05em;text-transform:uppercase;color:var(--suave);margin-bottom:8px}
.indice ol{margin:0;padding:0;list-style:none;border-left:1px solid var(--linha)}.indice li a{display:block;padding:6px 0 6px 14px;margin-left:-1px;border-left:2px solid transparent;color:var(--suave);text-decoration:none;line-height:1.35;transition:color .15s,border-color .15s}
.indice li a:hover,.indice li a.agora{color:var(--tinta);border-color:var(--a)}
.indice-m{display:none;margin:0 0 26px;border:1px solid var(--linha);border-radius:var(--r);background:var(--papel)}.indice-m summary{cursor:pointer;padding:14px 16px;font-weight:700;list-style:none}.indice-m summary::-webkit-details-marker{display:none}.indice-m ol{margin:0;padding:0 16px 14px 34px}.indice-m li{margin:6px 0}.indice-m a{color:var(--tinta)}
.card{border:1px solid var(--linha);border-radius:var(--r);background:var(--papel);overflow:hidden}.card .of-cab{padding:8px 14px}.etq img{width:100%;aspect-ratio:16/10;object-fit:cover;background:var(--fundo)}
.card .cp{padding:14px 16px 16px;display:grid;gap:6px}.card .on{font:var(--ft) calc(1.1rem*var(--k))/1.22 var(--fh);margin:0}.card .pq{margin:0;font-size:.9rem;color:var(--suave);line-height:1.45}.card .pr{font:var(--ft) calc(1.35rem*var(--k))/1 var(--fh);font-variant-numeric:tabular-nums;margin-top:4px}.card .pr small{display:block;font:400 .76rem var(--fb);color:var(--suave);margin-top:4px}.card .btn{margin-top:6px}
.melhor{margin:0 0 30px}.melhor .mt{display:flex;justify-content:space-between;align-items:center;gap:10px;font:var(--ft) calc(1.1rem*var(--k)) var(--fh);margin-bottom:6px}
.melhor .tag{display:inline-block;margin-top:4px;padding:2px 7px;border-radius:3px;background:var(--m);color:var(--sm);font:700 .74rem var(--fb)}
.mais{padding:20px 0 0}.mais h2{font-size:calc(1.45rem*var(--k));margin-bottom:18px}
.viz ul{margin:0;padding:0;list-style:none;display:grid;gap:10px}.viz li{padding:14px 16px;border:1px solid var(--linha);border-radius:var(--r);background:var(--papel)}.viz li span{display:block;font-size:.84rem;color:var(--suave)}.viz a{font-weight:700;color:var(--tinta)}
/* plantas (afiliacao-temas.mjs PLANTAS): topo */
.top{position:relative}.top-b .w{position:relative;flex-direction:column;justify-content:center;gap:8px;padding:20px 0 12px}.top-b .marca{margin:0;flex-direction:column;align-items:center;gap:4px;font-size:calc(2.1rem*var(--k))}
.top-b .modo{position:absolute;right:0;top:20px}
.top-c{background:var(--tinta);border:0}.top-c .marca,.top-c nav a,.top-c .modo{color:var(--fundo)}.top-c .marca b{color:var(--fundo);opacity:.72}.top-c .modo{border-color:color-mix(in srgb,var(--fundo) 35%,transparent)}.top-c .modo:hover{background:transparent}.top-c nav a:hover,.top-c nav a[aria-current]{border-color:var(--fundo)}
/* home b: revista */
.rev .cab-c{text-align:center;max-width:860px;margin:0 auto 30px}.cab-c h1,.cab-c .sub{margin-left:auto;margin-right:auto}.cab-c .edicao{border:0;padding:0}
.hoje-capa>a{display:block;border-radius:var(--r);overflow:hidden;box-shadow:var(--sombra)}.hoje-capa img{width:100%;aspect-ratio:21/9;object-fit:cover}
.hoje-capa .hc{max-width:760px;margin:26px auto 0;text-align:center}.hoje-capa h2{font-size:calc(1.1rem*var(--k));color:var(--a);margin-bottom:10px}.hoje-capa h3{font-size:calc(clamp(1.6rem,3vw,2.5rem)*var(--k))}.hoje-capa h3 a{color:var(--tinta);text-decoration:none}.hoje-capa p{color:var(--suave);margin:12px 0 16px}.hoje-capa .meta{font-size:.88rem}
.rev-g{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:56px;align-items:start}.rev-lado{position:sticky;top:20px;display:grid;gap:26px}.rev-lado .voz{grid-template-columns:1fr}
.linhas{list-style:none;margin:0;padding:0;border-top:2px solid var(--tinta)}.linhas li{border-bottom:1px solid var(--linha)}.linhas a{display:grid;grid-template-columns:120px minmax(0,1fr);gap:16px;align-items:center;padding:14px 0;color:var(--tinta);text-decoration:none}
.linhas img{width:120px;aspect-ratio:16/9;object-fit:cover;border-radius:4px;background:var(--linha)}.linhas .k{display:block;font-size:.8rem;color:var(--suave);margin-bottom:3px}.linhas b{display:block;font:var(--ft) calc(1.12rem*var(--k))/1.28 var(--fh);transition:color .15s}.linhas a:hover b{color:var(--a)}
.snav{border-top:2px solid var(--tinta);padding-top:12px}.snav>b{display:block;font:700 .76rem var(--fb);letter-spacing:.05em;text-transform:uppercase;color:var(--suave);margin-bottom:4px}.snav details{border-bottom:1px solid var(--linha)}
.snav summary{cursor:pointer;padding:11px 0;font-weight:700;display:flex;justify-content:space-between;gap:10px;list-style:none}.snav summary::-webkit-details-marker{display:none}.snav summary .num{font-weight:400;color:var(--suave)}.snav ul{list-style:none;margin:0 0 12px;padding:0}.snav li{padding:4px 0;font-size:.93rem;line-height:1.4}.snav a{color:var(--suave);text-decoration:none}.snav a:hover{color:var(--a);text-decoration:underline}
.trilha-f{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px;counter-reset:t}.trilha-f li{counter-increment:t}.trilha-f a{display:grid;gap:12px;color:var(--tinta);text-decoration:none;font:var(--ft) calc(1.15rem*var(--k))/1.25 var(--fh)}
.trilha-f img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:var(--r)}.trilha-f span:before{content:counter(t) 'º passo';display:block;font:700 .8rem var(--fb);color:var(--a);margin-bottom:6px}.trilha-f a:hover span{text-decoration:underline}
/* home c: almanaque */
.alm{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:56px;align-items:start;padding:40px 0 10px}.alm-lado{position:sticky;top:20px;display:grid;gap:24px}.voz-c{grid-template-columns:1fr}
.alm-cab{padding:0 0 28px;border-bottom:2px solid var(--tinta)}.alm-cab .edicao{border:0;padding:0}.alm-sec{padding:40px 0;border-bottom:1px solid var(--linha)}.alm-sec:last-child{border:0}
.trilha-l{list-style:none;padding:0;margin:0;counter-reset:t}.trilha-l li{counter-increment:t;display:grid;grid-template-columns:3.4rem minmax(0,1fr);gap:14px;padding:18px 0;border-top:1px solid var(--linha)}
.trilha-l li:before{content:counter(t);font:var(--ft) calc(2.6rem*var(--k))/1 var(--fh);color:var(--a)}.trilha-l a{font:var(--ft) calc(1.3rem*var(--k))/1.22 var(--fh);color:var(--tinta);text-decoration:none}.trilha-l a:hover{text-decoration:underline}.trilha-l p{margin:6px 0 0;color:var(--suave);font-size:.97rem;line-height:1.5}
.hoje-ficha{display:grid;grid-template-columns:minmax(0,1fr) 240px;gap:28px;align-items:center;padding:24px;border:1px solid var(--linha);border-radius:var(--r);background:var(--papel)}.hoje-ficha img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:4px}
.hoje-ficha h2{font-size:calc(1.05rem*var(--k));color:var(--a);margin-bottom:8px}.hoje-ficha h3{font-size:calc(1.5rem*var(--k))}.hoje-ficha h3 a{color:var(--tinta);text-decoration:none}.hoje-ficha p{color:var(--suave);margin:10px 0 14px}.hoje-ficha .meta{font-size:.88rem}
/* home d: perguntas */
.cab-d{max-width:820px;margin-bottom:34px}.cab-d .edicao{border:0;padding:0}.pergunta{font-size:calc(1.15rem*var(--k));margin:0 0 14px}
.temas{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.tema{display:flex;flex-direction:column;gap:6px;padding:18px 18px 20px;border-radius:var(--r);border:1px solid var(--linha);background:var(--fundo);color:var(--tinta);text-decoration:none;transition:border-color .2s,background-color .2s}
.tema:hover{border-color:var(--a);background:var(--papel)}.tema b{font:var(--ft) calc(1.3rem*var(--k))/1.15 var(--fh)}.tema .num{font-size:.82rem;color:var(--a);font-weight:700}.tema span:last-child{font-size:.9rem;color:var(--suave);line-height:1.4}
.hoje.inv{grid-template-columns:minmax(0,5fr) minmax(0,7fr)}
.guias.g2{grid-template-columns:repeat(2,minmax(0,1fr));gap:44px 32px}.g2 .guia h3{font-size:calc(1.45rem*var(--k))}
.faixa-voz{background:var(--papel)}.voz-d{grid-template-columns:auto minmax(0,1fr) auto;align-items:center;border:0;background:transparent;padding:0}.voz-d .ia{grid-column:2}.voz-d .lk{grid-column:3;grid-row:1/3;flex-direction:column}
/* post 2 a 4 */
.pp-2 .post-g{grid-template-columns:240px minmax(0,1fr)}.pp-2 .lado{order:-1}
.pp-3>.capa{margin:22px 0 0}.pp-3>.capa img{aspect-ratio:21/9}.pp-3 .post-cab{margin:0 auto;text-align:center;max-width:820px}.pp-3 .linha-fina{margin-left:auto;margin-right:auto}.pp-3 .ficha{justify-content:center}.pp-3 .ficha dl{justify-content:center}
.pp-3 .post-g{grid-template-columns:minmax(0,1fr);max-width:760px;margin:0 auto}.pp-3 .indice-m{display:block}
.pp-4 .post-cab{max-width:none;display:grid;grid-template-columns:minmax(0,7fr) minmax(0,5fr);gap:44px;align-items:center}.pp-4 .post-cab .capa{margin:0}.pp-4 .post-cab .capa img{aspect-ratio:4/3}.pp-4 .post-g{grid-template-columns:minmax(0,1fr)}
.convite{margin:2.2em 0 0;padding:26px;border-radius:var(--r);background:var(--papel);border:1px solid var(--linha);box-shadow:inset 0 3px 0 var(--a)}.convite h2{font-size:calc(1.35rem*var(--k));margin:0 0 8px}.convite p{margin:0 0 16px;color:var(--suave)}.cv-b{display:flex;flex-wrap:wrap;gap:10px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:28px 0 0}.chips a{padding:6px 12px;border:1px solid var(--linha);border-radius:999px;font-size:.88rem;color:var(--tinta);text-decoration:none;background:var(--papel);transition:border-color .15s,color .15s}.chips a:hover{border-color:var(--a);color:var(--a)}
@media(max-width:960px){.rev-g,.alm,.hoje-ficha,.pp-4 .post-cab,.pp-2 .post-g{grid-template-columns:1fr}.rev-lado,.alm-lado{position:static}.temas{grid-template-columns:repeat(2,minmax(0,1fr))}.trilha-f{grid-template-columns:1fr}
.voz-d{grid-template-columns:auto minmax(0,1fr)}.voz-d .lk{grid-column:1/-1;grid-row:auto;flex-direction:row}.hoje.inv{grid-template-columns:1fr}.hoje.inv>div{order:2}.alm{gap:30px;padding-top:28px}.pp-4 .post-cab{gap:22px}.pp-4 .post-cab .capa{order:-1}.top-b .marca{font-size:calc(1.5rem*var(--k))}.top-b .w{padding:14px 0 10px}.top-b .modo{top:12px}
.post-g{grid-template-columns:1fr;gap:0}.lado{display:none}.indice-m{display:block}.top nav{display:none}
.hoje,.duas,.assine{grid-template-columns:1fr}.abre-g{grid-template-columns:1fr;grid-template-areas:'cab' 'hoje' 'voz';gap:28px}.hoje{gap:18px}.duas{gap:40px}.trilha{grid-template-columns:1fr;gap:22px}.guias{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:640px){.guias.g2{grid-template-columns:1fr}.linhas a{grid-template-columns:88px minmax(0,1fr);gap:12px}.linhas img{width:88px}.hoje-capa img,.pp-3>.capa img{aspect-ratio:16/9}.temas{gap:8px}.tema{padding:14px}.tema span:last-child{display:none}
body{font-size:1rem}.w{width:calc(100% - 32px)}.sec{padding:42px 0}.abre{padding:28px 0 36px}.marca b{display:none}
.guias,.guias.dest .guia:first-child,.series{grid-template-columns:1fr}.of-g{grid-template-columns:84px minmax(0,1fr);gap:14px}.of-g img{width:84px;height:84px}
.tab thead{display:none}.tab tr{display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px 12px;padding:14px 0;border-bottom:1px solid var(--linha)}.tab td{padding:0;border:0}.tab td:first-child{grid-column:1/-1}.tab td:nth-child(2){display:none}.tab .nm img{width:48px;height:48px}
h1{font-size:calc(2rem*var(--k))}.abre .sub{font-size:1.05rem}.ficha dl{gap:6px 18px}.txt{font-size:1.06rem}.cap,.tel{padding:24px}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{transition:none!important;animation:none!important}}
@media print{.top,.lado,.progresso,.assine,footer{display:none}}
`;
};

/** Espaço do script do Google AdSense, DESLIGADO até a aprovação: só sai com adsense.json {cliente:"ca-pub-<16 dígitos>", ativo:true}. */
export function adsenseTag(a) {
  if (!a || a.ativo !== true || !/^ca-pub-\d{16}$/.test(String(a.cliente || ''))) return '<!-- adsense: desligado até a aprovação -->';
  // Imediato no <head> enquanto os 10 blogs estão na revisão do AdSense (pedido da sessão AdSense, 12/11/2026: o revisor lê o HTML).
  // Depois da aprovação pode voltar a type="depois" (carregador do Portal, CARREGAR_DEPOIS em paginas.mjs), que ganha no PageSpeed.
  return `<meta name="google-adsense-account" content="${esc(a.cliente)}"><script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(a.cliente)}" crossorigin="anonymous"></script>`;
}

/** Title da aba e do Google: até ~60 caracteres. Se "título · nome do blog" passar disso, fica só o título (o og:title segue completo). */
export const tituloCurto = (t) => { const x = String(t || ''); const i = x.lastIndexOf(' · '); return x.length > 60 && i > 0 ? x.slice(0, i) : x; };
/** Imagem de compartilhamento padrão do blog: a capa do guia mais recente com capa; sem guias, o logo (logo.webp do blog). */
function imagemPadrao(v, prefixo, posts = []) {
  const p = [...posts].reverse().find((x) => capaDo(x));
  if (p) return capaAbs(capaDo(p), prefixo);
  return v.inscricao?.blog ? `${new URL(prefixo).origin}${comVersao(`/assets/afiliacao/${v.inscricao.blog}/logo.webp`)}` : null;
}

// Modo escuro escolhido no botão (preferência de quem lê, só neste navegador): aplicado antes da pintura, sem piscar.
const SCRIPT_TEMA = `<script>try{var m=localStorage.getItem('tema');if(m==='escuro'||m==='claro')document.documentElement.dataset.tema=m}catch(e){}</script>`;
export function rssAutodiscovery(info, prefixo = '') {
  const base = String(prefixo || '').replace(/\/+$/, '');
  return `<link rel="alternate" type="application/rss+xml" title="${esc(info?.nome || '')}" href="${esc(`${base}/feed.xml`)}" data-rss-feed="blogs-afiliado">`;
}

function head({ titulo, desc, canonical, v, ld, og, robots, info, prefixo }) {
  const t = temaDe(blogDe(v), v);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(tituloCurto(titulo))}</title><meta name="description" content="${esc(desc).slice(0, 160)}"><link rel="canonical" href="${esc(canonical)}">
${rssAutodiscovery(info, prefixo)}
<meta name="robots" content="${robots || 'index,follow,max-image-preview:large'}"><meta name="scripts-depois" content="1"><meta property="og:type" content="${og || 'website'}"><meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(desc).slice(0, 200)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:locale" content="pt_BR">
${v.imagem ? `<meta property="og:image" content="${esc(v.imagem)}">${/-capa\.(png|jpe?g|webp)(\?|$)/.test(v.imagem) ? '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' : ''}<meta property="og:image:alt" content="${esc(titulo)}"><meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
${v.lcp ? `<link rel="preload" as="image" href="${esc(v.lcp)}"${v.lcpSrcset ? ` imagesrcset="${esc(v.lcpSrcset)}" imagesizes="${esc(v.lcpSizes || '100vw')}"` : ''} fetchpriority="high">` : ''}
<link rel="preload" as="font" type="font/woff2" href="/assets/fontes/texto.woff2" crossorigin><link rel="preload" as="font" type="font/woff2" href="/assets/fontes/${t.fonte}.woff2" crossorigin>
<meta name="theme-color" content="${esc(t.claro.papel)}" media="(prefers-color-scheme: light)"><meta name="theme-color" content="${esc(t.escuro.papel)}" media="(prefers-color-scheme: dark)">${SCRIPT_TEMA}${adsenseTag(v._adsense)}<style>${css(v)}</style>
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}</head>`;
}

// ---- Black Friday 2026 (pedido do Kbsa via Big, 09/11): faixa no topo de todas as páginas + link no menu e no rodapé ----
// Só aparece no blog que já tem o post "black-friday-2026-ofertas-de-<blog>" e até 01/12/2026 (23:59 de Brasília).
// 12/11/2026 (Mesa de Copy/Big, revisão do AdSense): a mesma faixa nos 10 blogs parecia rede em escala. O texto agora vem do
// próprio post de BF: campo "faixa" (texto) ou, sem ele, o título do post; "faixa": false tira a faixa e o item do menu (fica
// só o link no rodapé, com o título do post), para a página de BF que virou guia.
export const BF_ATE = Date.parse('2026-12-02T03:00:00Z');
export function blackFriday(v, prefixo, agora = Date.now()) {
  const blog = v.inscricao?.blog;
  if (!blog || agora >= BF_ATE) return null;
  const slug = `black-friday-2026-ofertas-de-${blog}`;
  const dir = path.join(CONTEUDO, blog, 'posts');
  if (!fs.existsSync(dir)) return null;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    let p; try { p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
    if (p?.slug !== slug || p.redirect) continue;
    const titulo = String(p.title || 'Black Friday 2026');
    return { url: `${prefixo}/blog/${slug}`, titulo, faixa: p.faixa === false ? null : (typeof p.faixa === 'string' && p.faixa.trim() ? p.faixa.trim() : titulo) };
  }
  return null;
}
const faixaBF = (bf) => (bf?.faixa ? `<div class="bf" data-ate="${BF_ATE}"><div class="w"><span>${esc(bf.faixa)}</span><a href="${esc(bf.url)}">Ler o guia</a></div></div>
<script>(function(){var b=document.currentScript.previousElementSibling;if(Date.now()>=+b.dataset.ate)b.remove()})()</script>` : '');

const ICONE_MODO = '<svg class="sol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/></svg><svg class="lua" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6Z"/></svg>';
const SCRIPT_MODO = `<script>document.querySelector('.modo').addEventListener('click',function(){var r=document.documentElement,e=r.dataset.tema?r.dataset.tema==='escuro':matchMedia('(prefers-color-scheme: dark)').matches,n=e?'claro':'escuro';r.dataset.tema=n;try{localStorage.setItem('tema',n)}catch(x){}})</script>`;

/** Topo: planta b = cabeçalho de revista centrado; c = barra invertida (tinta) de almanaque; a e d = barra clara. */
function topo(info, prefixo, v, atual = '', pl = plantaDe(blogDe(v)).home) {
  const bf = blackFriday(v, prefixo);
  const voz = vozDe(v, info);
  const nav = [[`${prefixo}/blog`, 'Guias', 'blog'], [`${prefixo}/#comece`, 'Comece por aqui', ''], [`${prefixo}/#fichas`, 'Fichas de compra', ''], [`${prefixo}/autor`, `Quem é ${voz.ele === 'a' ? 'a' : 'o'} ${voz.curto}`, 'autor']];
  return `${faixaBF(bf)}<header class="top top-${pl}"><div class="w"><a class="marca" href="${prefixo}/">${esc(info.nome)}<b>com ${esc(voz.curto)}</b></a>
<nav aria-label="Principal">${bf?.faixa ? `<a href="${esc(bf.url)}">Black Friday</a>` : ''}${nav.map(([h, t, k]) => `<a href="${h}"${k && k === atual ? ' aria-current="page"' : ''}>${esc(t)}</a>`).join('')}</nav>
<button class="modo" type="button" aria-label="Alternar modo claro ou escuro">${ICONE_MODO}</button></div></header>${SCRIPT_MODO}`;
}

function rodape(info, prefixo = '', v = {}) {
  const nav = PAGINAS.map((p) => `<a href="${prefixo}/${p}">${esc(ROTULO[p])}</a>`).join('');
  const voz = vozDe(v, info);
  const email = emailDe(info, String(prefixo).replace(/^https?:\/\//, ''));
  return `<footer><div class="w"><strong>${esc(info.nome)}</strong><span>${esc(info.descricao)}</span>
<nav class="rod" aria-label="Institucional"><a href="${prefixo}/blog">Todos os guias</a><a href="${prefixo}/feed.xml">Assinar por RSS</a>${((bf) => (bf ? `<a href="${esc(bf.url)}">${esc(bf.titulo)}</a>` : ''))(blackFriday(v, prefixo))}${nav}</nav>
<span>${esc(voz.nome)} é ${voz.ele === 'a' ? 'uma personagem criada' : 'um personagem criado'} com IA para dar voz ao blog: ${voz.ele === 'a' ? 'ela' : 'ele'} compara a ficha e as fontes de cada produto e não afirma ter testado nada.</span>
<span><b>Transparência:</b> alguns links deste site são de afiliado. Se você comprar por eles, recebemos uma comissão, sem custo extra para você. Isso não muda a ordem nem o que escrevemos; confira sempre na página oficial o conteúdo, o preço e a garantia antes de comprar. <a href="${prefixo}/aviso-de-afiliados">Saiba mais</a>.</span>
<span>Contato: <!--email_off--><a href="mailto:${esc(email)}">${esc(email)}</a><!--/email_off--> · © ${ANO} ${esc(info.nome)} · Conteúdo informativo, sem promessa de resultado.</span></div></footer>`;
}

/** Carimbo de conferência: quem conferiu e quando. */
const carimbo = (voz, quando) => `<span class="carimbo" aria-hidden="true">${assinatura(voz)} por<b>${esc(voz.curto)}</b>${esc(dataCurta(quando))}</span>`;
const cabOferta = (rotulo) => `<div class="of-cab"><span class="pub">Publicidade</span><span>${esc(rotulo)}</span></div>`;

/** Ficha do produto em cartão (página de ofertas e lateral do post). */
function cardProduto(p, { rotulo, melhor, primeiro, nivel = 'h2' }) {
  return `<article class="card">${cabOferta(rotulo || 'Link de afiliado')}
${p.img ? `<img src="${esc(mini(p.img, 400))}" alt="${esc(p.nome)}" ${primeiro ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" width="600" height="375">` : ''}
<div class="cp"><span class="tp">${esc(p.tipo || 'Curso online')}</span><${nivel} class="on">${esc(p.nome)}</${nivel}>
${melhor ? `<p class="pq">Para quem é: ${esc(melhor)}</p>` : ''}
${p.preco ? `<div class="pr">${brl(p.preco)}<small>${esc(p.preco_nota || 'na página oficial')} · conferido em ${dataCurta()}</small></div>` : ''}
<a class="btn" href="${esc(p.url)}" ${REL}>${esc(p.cta || 'Ver na página oficial')}</a></div></article>`;
}

/** Newsletter dos blogs: brinde + posts da semana, inscrição em kbsa.app/inscricoes (LGPD: consentimento desmarcado, campo "site" isca). */
export const INSCRICOES_NO_AR = true;
const INSCREVER = 'https://kbsa.app/inscricoes/inscrever';
const SCRIPT_INSCRICAO = `<script>document.querySelectorAll('form.inscricao').forEach(function(f){f.addEventListener('submit',function(ev){ev.preventDefault();
var m=f.querySelector('.ins-msg'),b=f.querySelector('button');if(!f.email.value||!f.consentimento.checked){m.textContent='Preencha o e-mail e marque o consentimento.';return}
b.disabled=true;m.textContent='Enviando...';fetch('${INSCREVER}',{method:'POST',headers:{'Content-Type':'application/json'},
body:JSON.stringify({email:f.email.value,blog:f.dataset.blog,consentimento:f.consentimento.checked?'1':'',site:f.site.value})})
.then(function(r){return r.json()}).then(function(j){m.textContent=j.ok?(j.mensagem||'Pronto! Confira seu e-mail.'):(j.erro||'Não foi possível agora.');if(j.ok)f.reset();b.disabled=false})
.catch(function(){m.textContent='Falha de conexão. Tente de novo.';b.disabled=false})})});</script>`;
export function inscricao(info, v) {
  const { blog, brinde } = v.inscricao;
  const voz = vozDe(v, info);
  return `<div class="cap"><h2>Receba grátis: ${esc(brinde)}</h2><p>PDF para baixar e, uma vez por semana, um e-mail ${voz.ele === 'a' ? 'da' : 'do'} ${esc(voz.curto)} com os guias novos e o que mudou de preço.</p>
<form class="inscricao" data-blog="${esc(blog)}" novalidate><label class="em" for="ins-email">Seu melhor e-mail</label>
<input id="ins-email" name="email" type="email" required autocomplete="email" inputmode="email" placeholder="seu@email.com">
<input class="isca" name="site" tabindex="-1" autocomplete="off" aria-hidden="true">
<label><input name="consentimento" type="checkbox" required> <span>Concordo em receber e-mails deste blog (brinde, novos posts e ofertas). Posso sair a qualquer momento, com 1 clique, em qualquer e-mail. Dados usados só para isso (LGPD).</span></label>
<button class="btn" type="submit">Quero o brinde</button><p class="ins-msg" role="status" aria-live="polite"></p></form></div>${SCRIPT_INSCRICAO}`;
}

function captura(info, v) {
  if (INSCRICOES_NO_AR && v.inscricao?.blog && v.inscricao?.brinde) return inscricao(info, v);
  return `<div class="cap"><h2>${esc(v.isca_titulo || `Receba os próximos guias do ${info.nome}`)}</h2><p>${esc(v.isca_texto || 'Um e-mail quando sair guia novo ou mudar algum preço do comparativo. Sem spam: sai com um clique.')}</p>
<form method="post" onsubmit="event.preventDefault();this.querySelector('button').textContent='Pronto! Você está na lista.';">
<input type="email" name="email" placeholder="seu@email.com" required autocomplete="email" aria-label="Seu e-mail">
<label><input type="checkbox" required> Aceito receber e-mails do ${esc(info.nome)} e sei que posso sair quando quiser.</label>
<button class="btn" type="submit">${esc(v.isca_botao || 'Quero receber')}</button></form></div>`;
}
/** Canal do Telegram do blog (pelo BigLinks), ao lado da newsletter. */
function telegram(info, v) {
  if (!/^https:\/\/l\.kbsa\.app\/[a-z0-9-]+/.test(v.telegram || '')) return '';
  const voz = vozDe(v, info);
  return `<div class="tel"><div><h2>Um recado por dia no Telegram</h2><p>${esc(voz.curto)} manda ${voz.bordao ? `"${esc(voz.bordao)}"` : 'uma dica'} todo dia: dica curta, enquete e oferta só quando faz sentido.</p></div>
<a class="btn lin" href="${esc(String(v.telegram).split('?')[0])}" rel="nofollow noopener" target="_blank">Entrar no canal do ${esc(info.nome)}</a></div>`;
}
const assineHtml = (info, v) => `<div class="assine">${captura(info, v)}${telegram(info, v)}</div>`;

const faqHtml = (faq) => `<div class="faq">${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>`;

/** "Comece com o kit básico": vitrine.json "kit": {"titulo", "texto", "itens": [chaves]}, de 2 a 4 itens com afiliação ativa;
 *  com menos de 2 o bloco some. Mostra a soma dos preços, a data da conferência e o aviso de comissão. */
export function kitBasico(v, dados) {
  const itens = (v.kit?.itens || []).map((k) => produto(k, dados)).filter(Boolean).slice(0, 4);
  if (itens.length < 2) return '';
  const soma = itens.reduce((s, p) => s + (Number(p.preco) || 0), 0);
  const tipo = (p) => (p.chave.startsWith('sp-') ? 'Físico' : 'Digital');
  const linhas = itens.map((p) => `<tr><td><div class="nm">${p.img ? `<img src="${esc(mini(p.img, 160))}" alt="" loading="lazy" decoding="async" width="52" height="52">` : ''}<span>${esc(p.nome)}<small><span class="tag">${tipo(p)}</span> ${esc(cap(v.melhor_para?.[p.chave] || p.tipo || ''))}</small></span></div></td>
<td>${esc(p.tipo || '')}</td><td>${p.preco ? brl(p.preco) : '—'}</td><td><a class="btn sm" href="${esc(p.url)}" ${REL}>Ver oferta</a></td></tr>`).join('');
  return `<div id="kit" class="kit"><h3 style="margin:34px 0 6px">${esc(v.kit.titulo || 'Comece com o kit básico')}</h3><p class="lead" style="margin-bottom:12px">${esc(v.kit.texto || 'O curso para aprender e o que você precisa ter à mão para começar.')}</p>
<div class="tabw"><table class="tab"><thead><tr><th>Item</th><th>Tipo</th><th>Preço</th><th><span class="pub">Publicidade</span></th></tr></thead><tbody>${linhas}</tbody></table></div>
<p class="nota">Kit completo por cerca de <b class="num">${brl(soma)}</b>, somando os preços conferidos em ${dataBr()}. Os preços mudam: confira em cada loja. São links de afiliado: se você comprar por eles, recebemos uma comissão, sem custo extra.</p></div>`;
}

/** Posts de cada série (afiliacao-temas.mjs). Série com menos de 2 posts não aparece. */
export function seriesDo(blog, posts) {
  return (SERIES[blog] || []).map(([nome, er]) => [nome, posts.filter((p) => new RegExp(er, 'i').test(`${p.title} ${(p.tags || []).join(' ')}`))]).filter(([, l]) => l.length >= 2);
}
/** "Comece por aqui": os guias-pilar (vitrine.comece ou os 3 primeiros da numeração). */
const comecePor = (v, posts) => { const s = (v.comece || []).map((x) => posts.find((p) => p.slug === x)).filter(Boolean); return (s.length >= 2 ? s : posts.slice(0, 3)).slice(0, 3); };
/** Recentes: a numeração dos arquivos não é a ordem de publicação; vale "publicado" quando vier, senão o fim da lista. */
const recentes = (posts) => [...posts].map((p, i) => [p, p._publicado || '', i]).sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : b[2] - a[2])).map((x) => x[0]);

const SCRIPT_PAROU = (blog) => `<script>try{var u=JSON.parse(localStorage.getItem('parou:${blog}')||'null'),e=document.querySelector('.parou');if(u&&u.s&&u.t&&e){e.querySelector('a').href=u.s;e.querySelector('a').textContent=u.t;e.hidden=false}}catch(x){}</script>`;

/** Home: edição do dia, em uma de 4 plantas (afiliacao-temas.mjs, PLANTAS). Os mesmos blocos (voz, destaque, comece por aqui,
 *  mais lidos, séries, recentes, fichas, newsletter/Telegram, FAQ, método) mudam de ordem, de grade e de tratamento, para os
 *  blogs não terem a mesma planta. maisLidos = slugs ordenados pelo contador do Portal (afiliacao-instalar). */
export function renderHome({ info, v, posts, prefixo, dados, maisLidos = [] }) {
  const blog = blogDe(v);
  const voz = vozDe(v, info);
  const pl = v._planta || plantaDe(blog).home;
  const prods = (v.destaques || []).map((k) => produto(k, dados)).filter(Boolean);
  const titulo = `${v.h1_seo || v.h1} (${ANO}) · ${info.nome}`;
  const ordem = recentes(posts);
  const hoje = ordem.find((p) => capaDo(p)) || ordem[0];
  const capaHoje = capaDo(hoje);
  const capaHome = capaAbs(capaHoje, prefixo) || absoluta(prods[0]?.img, prefixo);
  const desc = v.desc_seo || info.descricao;
  const canonical = `${prefixo}/`;
  const faq = v.faq || [];
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebSite', '@id': `${canonical}#site`, url: canonical, name: info.nome, inLanguage: 'pt-BR', description: desc },
    { '@type': 'ItemList', name: v.h1, itemListElement: prods.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.nome })) },
    ...(faq.length ? [faqLd(faq.map((f) => ({ q: f.q, a: f.a })), `${canonical}#faq`)] : []),
  ] };
  const link = (p) => `${prefixo}/blog/${esc(p.slug)}`;
  const imHoje = hoje && imagemDo(hoje, blog);
  // a foto do destaque só é LCP quando está na primeira dobra (no almanaque ela fica mais abaixo e vai sem pressa)
  const fotoNoTopo = pl !== 'c';
  const sizesHoje = pl === 'b' ? '(max-width: 960px) 92vw, 1160px' : pl === 'c' ? '(max-width: 640px) 92vw, 260px' : '(max-width: 960px) 92vw, 680px';
  const comece = comecePor(v, posts);
  const lidos = maisLidos.map((s) => posts.find((p) => p.slug === s)).filter(Boolean).slice(0, 5);
  const series = seriesDo(blog, posts);
  const outros = ordem.filter((p) => p !== hoje);
  const fichas = prods.filter((p) => posts.some((x) => String(x.content || '').includes(`{{LINK:${p.chave}}}`))).slice(0, 4); // menor destaque: até 4 fichas, depois do conteúdo, só de produto com guia
  const sec = (corpo, extra = '') => `<section class="sec"${extra}><div class="w">${corpo}</div></section>`;
  const iaVoz = `${esc(voz.nome)} é ${voz.ele === 'a' ? 'uma personagem criada' : 'um personagem criado'} com IA. Compara ficha e fontes; não diz que testou.`;

  // ---- blocos ----
  const cab = `<h1>${esc(info.tagline || v.h1)}</h1><p class="sub">${esc(frase(v.sub || info.descricao, 190))}</p>
<p class="edicao">Edição de ${dataBr()} · <span class="num">${posts.length}</span> guias publicados · um novo por dia</p>`;
  const vozCard = (cls = 'voz') => `<aside class="${cls}" aria-label="Quem escreve">${carimbo(voz, Date.now())}<div><h2>${esc(voz.nome)}</h2><p>${esc(cap(voz.papel))}. ${esc(voz.jeito)}</p></div>
<p class="ia">${iaVoz}</p><div class="lk"><a href="#assine">Receber por e-mail</a>${v.telegram ? '<a href="#assine">Canal no Telegram</a>' : ''}<a href="${prefixo}/sobre">Como o blog funciona</a></div></aside>`;
  const fotoHoje = (cls) => (imHoje ? imgTag(imHoje, hoje.title, { primeiro: fotoNoTopo, sizes: sizesHoje, cls }) : `<span class="gx">${esc(info.nome)}</span>`);
  const textoHoje = hoje ? `<h2>${esc(voz.bordao)}</h2><h3><a href="${link(hoje)}">${esc(hoje.title)}</a></h3><p>${esc(frase(hoje.resposta || hoje.excerpt, 230))}</p>
<p class="meta">${esc(hoje.category || info.categoria)} · ${minutos(hoje.content)} min de leitura</p><a class="btn" href="${link(hoje)}">Ler o guia</a>` : '';
  const fotoLink = () => `<a href="${link(hoje)}" tabindex="-1" aria-hidden="true">${fotoHoje('fh')}</a>`;
  const hojeHtml = !hoje ? '' : {
    a: `<div class="hoje">${fotoLink()}<div>${textoHoje}</div></div>`,
    b: `<div class="hoje-capa">${fotoLink()}<div class="hc">${textoHoje}</div></div>`,
    c: `<div class="hoje-ficha"><div>${textoHoje}</div>${fotoLink()}</div>`,
    d: `<div class="hoje inv"><div>${textoHoje}</div>${fotoLink()}</div>`,
  }[pl];
  const parou = `<div class="parou" hidden><div class="w"><b>Você parou em:</b><a href="#"></a></div></div>${SCRIPT_PAROU(blog)}`;
  const comeceTit = `<h2>Comece por aqui</h2><p class="lead">Se é a primeira vez, leia nesta ordem. São os guias que ${esc(voz.curto)} indicaria para quem está começando.</p>`;
  const comeceHtml = (forma) => {
    if (!comece.length) return '';
    if (forma === 'lista') return `<div id="comece">${comeceTit}<ol class="trilha-l">${comece.map((p) => `<li><div><a href="${link(p)}">${esc(p.title)}</a><p>${esc(frase(p.excerpt, 170))}</p></div></li>`).join('')}</ol></div>`;
    if (forma === 'faixa') return `<div id="comece">${comeceTit}<ol class="trilha-f">${comece.map((p) => `<li><a href="${link(p)}">${capaCard(p, false, '(max-width: 640px) 92vw, 380px', blog)}<span>${esc(p.title)}</span></a></li>`).join('')}</ol></div>`;
    return `<div id="comece">${comeceTit}<ol class="trilha">${comece.map((p) => `<li><a href="${link(p)}">${esc(p.title)}</a><p>${esc(frase(p.excerpt, 150))}</p></li>`).join('')}</ol></div>`;
  };
  const lidosHtml = lidos.length >= 3 ? `<div><h2>Mais lidos</h2><p class="lead">O que mais gente abriu nos últimos 30 dias.</p><ol class="top5">${lidos.map((p) => `<li><a href="${link(p)}">${esc(p.title)}</a></li>`).join('')}</ol></div>` : '';
  const seriesHtml = (forma) => {
    if (!series.length) return '';
    if (forma === 'nav') return `<nav class="snav" aria-label="Séries"><b>Séries</b>${series.map(([nome, l]) => `<details><summary>${esc(nome)} <span class="num">${l.length}</span></summary><ul>${l.slice(0, 6).map((p) => `<li><a href="${link(p)}">${esc(p.title)}</a></li>`).join('')}</ul></details>`).join('')}</nav>`;
    if (forma === 'temas') return `<div class="temas">${series.map(([nome, l]) => `<a class="tema" href="${link(l[0])}"><b>${esc(nome)}</b><span class="num">${l.length} guias</span><span>${esc(frase(l[0].title, 70))}</span></a>`).join('')}</div>`;
    return `<div><h2>Séries</h2><p class="lead">Os guias agrupados pelo que você quer resolver.</p><div class="series">${series.map(([nome, l]) => `<div class="serie"><h3>${esc(nome)}<span class="num">${l.length} guias</span></h3><ul>${l.slice(0, 4).map((p) => `<li><a href="${link(p)}">${esc(p.title)}</a></li>`).join('')}</ul></div>`).join('')}</div></div>`;
  };
  const recentesHtml = (forma) => {
    const l = outros.slice(0, forma === 'linhas' ? 8 : forma === 'duas' ? 4 : 6);
    const corpo = forma === 'linhas'
      ? `<ul class="linhas">${l.map((p) => `<li><a href="${link(p)}">${capaCard(p, false, '120px', blog)}<span><span class="k">${esc(p.category || info.categoria)} · ${minutos(p.content)} min</span><b>${esc(p.title)}</b></span></a></li>`).join('')}</ul>`
      : `<div class="guias${forma === 'duas' ? ' g2' : ''}">${l.map((p) => `<a class="guia" href="${link(p)}">${capaCard(p, false, forma === 'duas' ? '(max-width: 640px) 92vw, 580px' : undefined, blog) || `<span class="gx" aria-hidden="true">${esc(info.nome)}</span>`}<span class="k">${esc(p.category || info.categoria)}</span><h3>${esc(p.title)}</h3>${forma === 'duas' ? `<p>${esc(frase(p.excerpt, 150))}</p>` : ''}</a>`).join('')}</div>`;
    return `<h2>Saiu esta semana</h2><p class="lead">${esc(frase(info.home_intro || info.descricao, 200))}</p>${corpo}<p style="margin:26px 0 0"><a class="btn lin" href="${prefixo}/blog">Ver todos os ${posts.length} guias</a></p>`;
  };
  // Fichas da home levam à análise do produto no próprio blog, não ao link de afiliado (sessão BigLinks, 12/11/2026: robôs
  // clicavam em massa nos botões da home; o link de afiliado fica no post, onde quem clica já leu o contexto). Produto sem
  // guia que fale dele não entra nas fichas.
  const guiaDo = (chave) => { const c = posts.filter((x) => String(x.content || '').includes(`{{LINK:${chave}}}`)); return c.find((x) => /vale a pena|funciona|review|o que conferir|como avaliar/i.test(x.title)) || c[0] || null; };
  const linhasFicha = fichas.map((p) => [p, guiaDo(p.chave)]).filter(([, g]) => g).map(([p, g]) => `<tr><td><div class="nm">${p.img ? `<img src="${esc(mini(p.img, 160))}" alt="" loading="lazy" decoding="async" width="52" height="52">` : ''}<span>${esc(p.nome)}<small>${esc(p.tipo || '')}</small></span></div></td>
<td>${esc(cap(v.melhor_para?.[p.chave] || ''))}</td><td>${p.preco ? brl(p.preco) : '—'}</td><td><a class="btn sm lin" href="${link(g)}">Ler a análise</a></td></tr>`).join('');
  const fichasHtml = fichas.length ? `<section class="sec" id="fichas"><div class="w ficha-tab" style="padding-top:22px"><div class="ficha-cab"><div><h2>${esc(v.tabela_titulo_novo || `Fichas de compra ${voz.ele === 'a' ? 'da' : 'do'} ${voz.curto}`)}</h2><p class="lead" style="margin:0">${esc(v.tabela_texto || 'Para quem cada opção serve e o preço da página oficial. Clique para conferir o conteúdo e a garantia antes de decidir.')}</p></div></div>
<div class="tabw"><table class="tab"><thead><tr><th>Opção</th><th>Para quem é</th><th>Preço</th><th>Análise</th></tr></thead><tbody>${linhasFicha}</tbody></table></div>
<p class="nota">Preços conferidos em ${dataBr()} na página oficial de cada produto; eles mudam. Cada análise explica para quem o produto serve e o que conferir antes de comprar. Os links de compra ficam dentro das análises e são de afiliado: se você comprar por eles, o blog recebe uma comissão, sem custo extra.</p>
${kitBasico(v, dados)}</div></section>` : '';
  const assine = `<section class="sec" id="assine"><div class="w">${assineHtml(info, v)}</div></section>`;
  const faqSec = faq.length ? `<section class="sec" id="duvidas"><div class="w"><h2 style="margin-bottom:16px">Perguntas frequentes</h2>${faqHtml(faq)}</div></section>` : '';
  const metodo = sec(`<h2>Como ${esc(voz.curto)} escolhe</h2><p class="metodo">${esc(v.metodo || 'Comparamos o que cada produto mostra na página oficial: o tipo de conteúdo, o preço e para quem ele foi feito. Não aceitamos pagamento para mudar a ordem. Quando a página do produto muda, atualizamos o comparativo e a data no topo.')}</p>`);
  const seriesCol = seriesHtml('colunas');
  const duasA = lidosHtml || seriesCol ? sec(`<div class="duas">${lidosHtml}${lidosHtml ? seriesCol : seriesCol.replace(/^<div>/, '<div style="grid-column:1/-1">')}</div>`) : '';

  // ---- plantas ----
  const corpo = {
    a: `<main><section class="abre"><div class="w abre-g"><div class="cab">${cab}</div>${vozCard()}${hojeHtml}</div></section>${parou}
${sec(comeceHtml('colunas'))}${duasA}${sec(recentesHtml('grade'))}${fichasHtml}${assine}${faqSec}${metodo}</main>`,
    b: `<main><section class="abre rev"><div class="w"><div class="cab cab-c">${cab}</div>${hojeHtml}</div></section>${parou}
<section class="sec"><div class="w rev-g"><div>${recentesHtml('linhas')}${lidosHtml ? `<div style="margin-top:44px">${lidosHtml}</div>` : ''}</div><div class="rev-lado">${vozCard('voz')}${seriesHtml('nav')}</div></div></section>
${sec(comeceHtml('faixa'))}${fichasHtml}${assine}${faqSec}${metodo}</main>`,
    c: `<main><div class="w alm"><div class="alm-m"><section class="alm-cab">${cab}</section>${parou}<section class="alm-sec">${comeceHtml('lista')}</section>
<section class="alm-sec">${hojeHtml}</section><section class="alm-sec">${recentesHtml('linhas')}</section>${lidosHtml ? `<section class="alm-sec">${lidosHtml}</section>` : ''}</div>
<div class="alm-lado">${vozCard('voz voz-c')}${seriesHtml('nav')}</div></div>${fichasHtml}${assine}${faqSec}${metodo}</main>`,
    d: `<main><section class="abre"><div class="w"><div class="cab cab-d">${cab}</div>${series.length ? `<h2 class="pergunta">O que você quer resolver hoje?</h2>${seriesHtml('temas')}` : ''}</div></section>${parou}
${sec(hojeHtml)}${lidosHtml ? sec(lidosHtml) : ''}${sec(recentesHtml('duas'))}
<section class="sec faixa-voz"><div class="w">${vozCard('voz voz-d')}</div></section>
${sec(comeceHtml('colunas'))}${fichasHtml}${assine}${faqSec}${metodo}</main>`,
  }[pl];
  return `${head({ titulo, desc, canonical, v: { ...v, imagem: v.imagem || capaHome, lcp: fotoNoTopo ? imHoje?.src || null : null, lcpSrcset: fotoNoTopo ? imHoje?.set || null : null, lcpSizes: sizesHoje }, ld, info, prefixo })}<body class="pl-${pl}">${topo(info, prefixo, v, '', pl)}
${corpo}${rodape(info, prefixo, v)}</body></html>`;
}

/** Lista de guias (/blog): o mais recente em destaque e a grade dos outros. */
export function renderLista({ info, v, posts, prefixo }) {
  const canonical = `${prefixo}/blog`;
  const ordem = recentes(posts);
  const blog = blogDe(v);
  const guias = ordem.map((p, i) => `<a class="guia" href="${prefixo}/blog/${esc(p.slug)}">${capaCard(p, i === 0, i === 0 ? '(max-width: 960px) 92vw, 680px' : undefined, blog) || `<span class="gx" aria-hidden="true">${esc(info.nome)}</span>`}<div><span class="k">${esc(p.category || info.categoria)}</span><h3>${esc(p.title)}</h3><p>${esc(frase(p.excerpt, 170))}</p></div></a>`).join('');
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: `Guias · ${info.nome}`, url: canonical, inLanguage: 'pt-BR',
    hasPart: posts.map((p) => ({ '@type': 'Article', headline: p.title, url: `${prefixo}/blog/${p.slug}` })) };
  const c0 = capaDo(ordem[0]);
  const im0 = ordem[0] && imagemDo(ordem[0], blog);
  const series = seriesDo(blog, posts);
  return `${head({ titulo: `Guias ${v.assunto ? `de ${v.assunto} ` : ''}· ${info.nome}`, desc: info.descricao, canonical, v: { ...v, imagem: v.imagem || capaAbs(c0, prefixo), lcp: im0?.src || null, lcpSrcset: im0?.set || null, lcpSizes: '(max-width: 960px) 92vw, 680px' }, ld, info, prefixo })}<body>${topo(info, prefixo, v, 'blog')}
<main><section class="abre"><div class="w"><h1>Todos os guias</h1><p class="sub" style="font-size:1.15rem;color:var(--suave);margin:12px 0 0;max-width:60ch">${esc(info.tagline)}</p>
<p class="edicao"><span class="num">${posts.length}</span> guias · atualizado em ${dataBr()}${series.length ? ` · séries: ${series.map(([n, l]) => `${esc(n)} (${l.length})`).join(', ')}` : ''}</p></div></section>
<section class="sec"><div class="w"><div class="guias dest">${guias}</div></div></section><section class="sec" id="assine"><div class="w">${assineHtml(info, v)}</div></section></main>${rodape(info, prefixo, v)}</body></html>`;
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
function comOfertas(md, dados) {
  return String(md).replace(/^:::cta[^\n]*\n([\s\S]*?)\n:::[ \t]*$/gm, (bloco, corpo) => {
    const k = /\{\{LINK:([a-z0-9-]+)\}\}/.exec(corpo)?.[1];
    const p = k && produto(k, dados);
    if (!p) return bloco;
    const texto = corpo.replace(/\[([^\]]+)\]\(\{\{LINK:[a-z0-9-]+\}\}\)/g, '$1').trim();
    return `\u0000OFERTA:${k}:${Buffer.from(texto).toString('base64')}\u0000`;
  });
}

// ---- Links internos e entre os nossos blogs (09/11/2026, pedido "100 vendas por dia"): por assunto, nunca em massa ----
const PARADAS = new Set('para como qual quais mais menos sobre entre guia guias melhor melhores vale pena passo antes depois quando onde voce seus suas esse essa isso este esta tudo cada fazer zero preco comecar completo iniciante iniciantes dicas escolher mesmo forma formas jeito ideias lista erros vem'.split(' '));
const termos = (p) => new Set(`${p.title} ${(p.tags || []).join(' ')}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .split(/[^a-z0-9]+/).filter((t) => t.length > 3 && !PARADAS.has(t) && !/^\d+$/.test(t)));
const chavesDe = (p) => new Set([...String(p.content || '').matchAll(/\{\{LINK:([a-z0-9-]+)\}\}/g)].map((m) => m[1]));
const comuns = (a, b) => { let n = 0; for (const t of b) if (a.has(t)) n++; return n; };
/** Posts do mesmo blog mais parecidos: termos do título/tags, produto em comum (peso 3) e mesma categoria. */
export function relacionados(post, posts, n = 3) {
  const ta = termos(post); const ca = chavesDe(post);
  return posts.filter((p) => p.slug !== post.slug)
    .map((p, i) => [comuns(ta, termos(p)) + 3 * comuns(ca, chavesDe(p)) + (post.category && p.category === post.category ? 1 : 0), -i, p])
    .sort((x, y) => y[0] - x[0] || y[1] - x[1]).slice(0, n).map((x) => x[2]);
}
/** Blogs vizinhos (público que se cruza). Só daqui saem links entre blogs, e só quando o assunto do post combina. */
export const VIZINHOS = { achadinhos: ['sublimacao', 'fornecedores', 'criativos', 'milhas'], sublimacao: ['achadinhos', 'fornecedores', 'criativos'],
  fornecedores: ['achadinhos', 'sublimacao', 'afiliado'], afiliado: ['criativos', 'automacao', 'ia', 'fornecedores'], criativos: ['afiliado', 'ia', 'sublimacao', 'achadinhos'],
  automacao: ['ia', 'afiliado', 'criativos'], ia: ['automacao', 'criativos', 'afiliado', 'gamer'], gamer: ['criativos', 'ia'], manutencao: ['fornecedores'], milhas: ['achadinhos', 'afiliado'] };
const CONTEUDO = path.join(PUBLICO, '..', 'conteudo', 'afiliacao');
let indice = null;
function indiceBlogs() {
  if (indice) return indice;
  indice = {};
  for (const b of fs.existsSync(CONTEUDO) ? fs.readdirSync(CONTEUDO) : []) {
    const f = path.join(CONTEUDO, b, 'site.json'); const dp = path.join(CONTEUDO, b, 'posts');
    if (!fs.existsSync(f) || !fs.existsSync(dp)) continue;
    const info = JSON.parse(fs.readFileSync(f, 'utf8'));
    const posts = fs.readdirSync(dp).filter((x) => x.endsWith('.json')).map((x) => {
      try { const p = JSON.parse(fs.readFileSync(path.join(dp, x), 'utf8')); return p?.slug && p?.title && !p.redirect ? { slug: p.slug, title: p.title, t: termos(p) } : null; } catch { return null; }
    }).filter(Boolean);
    indice[b] = { nome: info.nome, origem: info.dominio ? `https://${info.dominio}` : `https://kbsa.app/${b}`, posts };
  }
  return indice;
}
/** Até n posts de blogs vizinhos com pelo menos 2 termos em comum com o post (1 por blog). */
export function deOutrosBlogs(info, post, n = 2) {
  const idx = indiceBlogs();
  const meu = Object.keys(idx).find((b) => idx[b].nome === info.nome);
  if (!meu) return [];
  const ta = termos(post);
  return (VIZINHOS[meu] || []).map((b) => idx[b] && idx[b].posts.map((p) => [comuns(ta, p.t), p, b]).sort((x, y) => y[0] - x[0])[0]).filter((x) => x && x[0] >= 2)
    .sort((x, y) => y[0] - x[0]).slice(0, n).map(([, p, b]) => ({ url: `${idx[b].origem}/blog/${p.slug}`, title: p.title, blog: idx[b].nome }));
}

// ---- Conversão no post: etiqueta no topo, tabela "melhor escolha" nos comparativos e etiqueta no meio do texto ----
function ofertaHtml(p, textoHtml, rotulo = 'Recomendação do guia') {
  return `<aside class="oferta" aria-label="Publicidade: ${esc(p.nome)}">${cabOferta(rotulo)}<div class="of-g">${p.img ? `<img src="${esc(mini(p.img, 400))}" alt="${esc(p.nome)}" loading="lazy" decoding="async" width="150" height="150">` : '<span></span>'}
<div><p class="on">${esc(p.nome)}</p><div class="tx">${textoHtml}</div><div class="ln">${p.preco ? `<span class="pr">${brl(p.preco)}<small>conferido em ${dataCurta()} na página oficial</small></span>` : ''}<a class="btn" href="${esc(p.url)}" ${REL}>Ver na página oficial</a></div></div></div></aside>`;
}
function tabelaMelhor(prods, v) {
  const linhas = prods.map((p, i) => `<tr><td><div class="nm">${p.img ? `<img src="${esc(mini(p.img, 160))}" alt="" loading="lazy" decoding="async" width="52" height="52">` : ''}<span>${esc(p.nome)}${i === 0 ? '<small><span class="tag">Melhor escolha</span></small>' : ''}</span></div></td>
<td>${esc(cap(v.melhor_para?.[p.chave] || p.tipo || ''))}</td><td>${p.preco ? brl(p.preco) : '—'}</td><td><a class="btn sm" href="${esc(p.url)}" ${REL}>Ver oferta</a></td></tr>`).join('');
  return `<div class="melhor"><div class="mt">Melhor escolha por perfil<span class="pub">Publicidade</span></div><div class="tabw"><table class="tab"><thead><tr><th>Opção</th><th>Para quem é</th><th>Preço</th><th>Oferta</th></tr></thead><tbody>${linhas}</tbody></table></div></div>`;
}

// Índice que acompanha a leitura, "continue de onde parou" na home e barra de oferta no celular só depois do topo do post.
const SCRIPT_POST = (blog, url, titulo) => `<script>(function(){try{localStorage.setItem('parou:${blog}',JSON.stringify({s:${JSON.stringify(url)},t:${JSON.stringify(titulo).replace(/</g, '\\u003c')}}))}catch(e){}
var l=[].slice.call(document.querySelectorAll('.lado .indice a'));if(!l.length||!('IntersectionObserver'in window))return;var m={};l.forEach(function(a){m[a.hash.slice(1)]=a});
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;l.forEach(function(a){a.classList.remove('agora')});var a=m[e.target.id];if(a)a.classList.add('agora')})},{rootMargin:'0px 0px -70% 0px'});
[].forEach.call(document.querySelectorAll('.txt h2[id]'),function(h){io.observe(h)})})()</script>`;

/** Autor do Article: a voz do blog como Person, declarada como personagem editorial criado com IA (padrão V2 da Mesa de Copy);
 *  blog sem tema assina como a equipe (Organization). */
function autorLd(info, v, prefixo) {
  const t = temaDe(blogDe(v), v);
  if (!t.voz) return { '@type': 'Organization', name: info.autor || `Equipe ${info.nome}`, url: `${prefixo}/autor` };
  return { '@type': 'Person', name: t.voz.nome, url: `${prefixo}/autor`, jobTitle: cap(t.voz.papel),
    description: `${t.voz.nome} é ${t.voz.ele === 'a' ? 'a personagem editorial criada' : 'o personagem editorial criado'} com IA para o ${info.nome}, revisado pela equipe do blog. Compara fichas e fontes; não afirma ter testado produtos.`,
    worksFor: { '@type': 'Organization', name: info.nome, url: `${prefixo}/` } };
}

/** Post: cabeça com linha fina e ficha de conferência, capa, etiqueta/tabela no topo, índice, texto, assinatura da voz,
 *  relacionados; na lateral (computador) o índice que acompanha e a etiqueta do produto; no celular a barra de oferta. */
/** semOferta (variante para tráfego pago, /guia/<slug>, 12/11/2026): {convite:{titulo,texto,botao}, whatsapp}. A mesma matéria sem
 *  nenhum link de compra (caixa :::cta, link {{LINK}}, link direto de loja e bloco automático saem), com o convite para o canal
 *  da voz depois do conteúdo, noindex e canonical para o post normal. O clique no convite e a leitura profunda vão para o contador. */
export function renderPost({ info, v, post, posts, prefixo, dados, aplicarLinks, publicado, atualizado, semOferta = null }) {
  const blog = blogDe(v);
  const voz = vozDe(v, info);
  const canonical = `${prefixo}/blog/${post.slug}`;
  const chaves = [...String(post.content).matchAll(/\{\{LINK:([a-z0-9-]+)\}\}/g)].map((m) => m[1]);
  // sem produto no texto: o destaque do blog mais ligado ao assunto do post (empate fica com a ordem da vitrine)
  const tp = termos(post);
  const destaques = (v.destaques || []).map((k, i) => [k, i, comuns(tp, termos({ title: `${dados.catalogo[k]?.nome || ''} ${v.melhor_para?.[k] || ''}` }))])
    .sort((a, b) => b[2] - a[2] || a[1] - b[1]).map(([k]) => k);
  const principal = [...chaves, ...destaques].map((k) => produto(k, dados)).find(Boolean);
  // produto sem afiliação ativa: a caixa de oferta sai e o link vira texto comum (volta sozinho quando for aprovado)
  let md = String(post.content);
  if (semOferta) md = md.replace(/^:::cta[^\n]*\n[\s\S]*?\n:::[ \t]*$\n?/gm, '').replace(/\[([^\]]+)\]\(\{\{LINK:[a-z0-9-]+\}\}\)/g, '$1')
    .replace(/\[([^\]]+)\]\((https:\/\/(?:l\.kbsa\.app\/(?!tel-)|(?:[a-z0-9-]+\.)*(?:shopee\.com\.br|shp\.ee|mercadolivre\.com\.br|amazon\.com\.br|amzn\.to|hotmart\.com|hotm\.art|kiwify\.app|kiwify\.com\.br))[^)]*)\)/g, '$1');
  md = md
    .replace(/^:::cta[^\n]*\n([\s\S]*?)\n:::[ \t]*$/gm, (b, corpo) => { const k = /\{\{LINK:([a-z0-9-]+)\}\}/.exec(corpo)?.[1]; return k && !produto(k, dados) ? '' : b; })
    .replace(/\[([^\]]+)\]\(\{\{LINK:([a-z0-9-]+)\}\}\)/g, (m, t, k) => (produto(k, dados) ? m : t));
  md = comOfertas(md, dados);
  md = aplicarLinks(md, prefixo);
  let html = htmlText(md);
  html = html.replace(/<p>\u0000OFERTA:([a-z0-9-]+):([A-Za-z0-9+/=]+)\u0000<\/p>|\u0000OFERTA:([a-z0-9-]+):([A-Za-z0-9+/=]+)\u0000/g, (_m, k1, b1, k2, b2) => {
    const p = produto(k1 || k2, dados);
    const texto = htmlText(aplicarLinks(Buffer.from(b1 || b2, 'base64').toString('utf8'), prefixo));
    return ofertaHtml(p, texto);
  });
  // links de afiliado no meio do texto: marcados como patrocinados e abrindo em outra aba
  html = html.replace(/<a href="(https:\/\/(?:[a-z0-9-]+\.)*(?:kiwify\.app|kiwify\.com\.br|kiwify\.com|hotmart\.com|hotm\.art|l\.kbsa\.app)[^"]*)"(?: rel="[^"]*")?(?: target="[^"]*")?>/g, `<a href="$1" ${REL}>`);
  // a linha "Este conteúdo pode conter links de afiliado..." do fim do texto vira o rodapé da assinatura (não repete)
  html = html.replace(/<p>(?:<em>)?Este conteúdo pode conter links de afiliado[^<]*(?:<\/em>)?<\/p>\s*$/, '');
  // índice pelos H2
  const h2 = [];
  html = html.replace(/<h2>(.*?)<\/h2>/g, (_m, t) => { const id = t.replace(/<[^>]+>/g, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); h2.push([id, t]); return `<h2 id="${id}">${t}</h2>`; });
  // Oferta com menor destaque (ordem do Kbsa, 12/11/2026, "com menor destaque nos blogs"; política do AdSense contra página com mais
  // promoção que conteúdo): no máximo 1 bloco de oferta por post, depois do conteúdo útil, com "Publicidade" no próprio bloco.
  // Sem barra fixa, sem oferta no topo e sem cartão lateral. Caixa :::cta do texto vale como o bloco (as seguintes saem).
  // Comparativo (2+ produtos ativos): a tabela "melhor escolha por perfil" é o bloco único e as caixas soltas saem.
  const comparados = [...new Set(post.comparar || chaves)].map((k) => produto(k, dados)).filter(Boolean);
  let caixas = 0;
  html = html.replace(/<aside class="oferta"[\s\S]*?<\/aside>/g, (m) => (comparados.length >= 2 || caixas++ ? '' : m));
  if (!semOferta && !caixas && (principal || comparados.length >= 2)) {
    const melhor = principal && v.melhor_para?.[principal.chave];
    const rot = principal && chaves.includes(principal.chave) ? 'Recomendação do guia' : `Indicado pelo ${info.nome}`;
    const bloco = comparados.length >= 2 ? tabelaMelhor(comparados, v) : ofertaHtml(principal, `<p>${esc(cap(melhor ? `para quem é: ${melhor}` : principal.tipo || ''))}</p>`, rot);
    // lugar: logo depois da seção "o que conferir"; sem ela, antes de Fontes/Perguntas; sem esses, no fim do texto
    const iConf = h2.findIndex(([, t]) => /conferir/i.test(t));
    const depois = iConf >= 0 ? h2[iConf + 1] : h2.find(([, t]) => /perguntas|fontes|refer[eê]ncias/i.test(t));
    html = depois ? html.replace(`<h2 id="${depois[0]}">`, `${bloco}<h2 id="${depois[0]}">`) : `${html}${bloco}`;
  }
  const faq = faqDoTexto(post.content);
  const outros = relacionados(post, posts);
  const vizinhos = deOutrosBlogs(info, post);
  const resposta = frase(post.resposta || post.excerpt, 340);
  // capa própria do post manda no og:image e no Article.image; sem capa, segue a foto do produto principal
  const capa = capaDo(post);
  const im = imagemDo(post, blog);
  const imagem = capaAbs(capa, prefixo) || absoluta(principal?.img, prefixo);
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'Article', headline: post.title, description: post.seoDescription || post.excerpt, inLanguage: 'pt-BR', mainEntityOfPage: canonical, url: canonical,
      datePublished: publicado, dateModified: atualizado || publicado, author: autorLd(info, v, prefixo),
      publisher: { '@type': 'Organization', name: info.nome, url: `${prefixo}/` }, isPartOf: { '@type': 'WebSite', name: info.nome, url: `${prefixo}/` },
      wordCount: String(post.content).split(/\s+/).length, speakable: { '@type': 'SpeakableSpecification', cssSelector: ['h1', '.rapida'] },
      ...(imagem ? { image: imagem } : {}) },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: info.nome, item: `${prefixo}/` },
      { '@type': 'ListItem', position: 2, name: 'Guias', item: `${prefixo}/blog` }, { '@type': 'ListItem', position: 3, name: post.title, item: canonical }] },
    ...(faq.length ? [faqLd(faq, `${canonical}#faq`)] : []),
  ] };
  const titulo = `${post.seoTitle || post.title} · ${info.nome}`;
  const indiceItens = h2.map(([id, t]) => `<li><a href="#${id}">${t}</a></li>`).join('');
  const quando = atualizado || publicado;
  // planta do post (afiliacao-temas.mjs): 1 índice à direita, 2 à esquerda, 3 revista (foto primeiro, coluna centrada), 4 cabeçalho dividido
  const pp = v._plantaPost || plantaDe(blog).post;
  const tamFoto = pp === 3 ? '(max-width: 1200px) 100vw, 1160px' : pp === 4 ? '(max-width: 960px) 92vw, 520px' : '(max-width: 960px) 92vw, 836px';
  const figura = im ? `<figure class="capa">${imgTag(im, (post.coverAlt || post.title).replace(/^Capa do guia: /, ''), { primeiro: true, sizes: tamFoto, cls: 'fh' })}</figure>` : '';
  return `${head({ titulo, desc: post.seoDescription || post.excerpt, canonical, v: { ...v, imagem: imagem || v.imagem, lcp: im?.src || null, lcpSrcset: im?.set || null, lcpSizes: tamFoto }, ld, og: 'article', robots: semOferta ? 'noindex,follow' : null, info, prefixo })}<body><div class="progresso" aria-hidden="true"></div>${topo(info, prefixo, v)}
<main><!--rss-conteudo-inicio--><article class="w pp-${pp}">${pp === 3 ? figura : ''}<header class="post-cab"><div class="pc-t"><div class="bc"><a href="${prefixo}/">${esc(info.nome)}</a> › <a href="${prefixo}/blog">Guias</a> › ${esc(post.category || info.categoria)}</div>
<h1>${esc(post.title)}</h1>
${resposta ? `<p class="linha-fina rapida">${esc(resposta)}</p>` : ''}
<div class="ficha">${carimbo(voz, quando)}<dl><div><dt>Por</dt><dd><a href="${prefixo}/autor" rel="author">${esc(voz.nome)}</a></dd></div>${publicado ? `<div><dt>Publicado</dt><dd><time datetime="${esc(String(publicado).slice(0, 10))}">${dataBr(publicado)}</time></dd></div>` : ''}<div><dt>Atualizado em</dt><dd><time datetime="${esc(String(quando || '').slice(0, 10))}">${dataBr(quando)}</time></dd></div><div><dt>Leitura</dt><dd class="num">${minutos(post.content)} min</dd></div>${capa ? `<div><dt>Resumo</dt><dd><a href="${prefixo}/stories/${esc(post.slug)}">Ver em story</a></dd></div>` : ''}</dl></div></div>
${pp === 3 ? '' : figura}</header>
${pp === 4 && h2.length > 2 ? `<nav class="chips" aria-label="Neste guia">${h2.map(([id, t]) => `<a href="#${id}">${t.replace(/<[^>]+>/g, '')}</a>`).join('')}</nav>` : ''}
<div class="post-g"><div class="corpo">${h2.length > 2 && pp !== 4 ? `<details class="indice-m"${pp === 3 ? ' open' : ''}><summary>Neste guia (${h2.length} partes)</summary><ol>${indiceItens}</ol></details>` : ''}
<div class="txt">${html}</div>
${semOferta ? conviteHtml(info, v, voz, semOferta) : ''}
<div class="assina">${carimbo(voz, quando)}<div><b><a href="${prefixo}/autor" rel="author" style="color:inherit">${esc(voz.nome)}</a></b><p>${esc(cap(voz.papel))}. ${esc(voz.nome)} é ${voz.ele === 'a' ? 'uma personagem criada' : 'um personagem criado'} com IA: confere a ficha e as fontes e não afirma ter testado. ${semOferta ? 'Esta versão do guia não tem links de compra.' : 'Este conteúdo pode conter links de afiliado; se você comprar por eles, o blog recebe uma comissão, sem custo extra para você.'}</p></div></div>
${(v.fontes || []).length ? `<section class="mais fontes"><h2>Fontes para conferir por conta própria</h2><ul>${v.fontes.map((f) => `<li><a href="${esc(f.u)}" rel="noopener" target="_blank">${esc(f.t)}</a></li>`).join('')}</ul></section>` : ''}
${outros.length ? `<section class="mais"><h2>Continue lendo</h2><div class="guias">${outros.map((p) => `<a class="guia" href="${prefixo}/blog/${esc(p.slug)}">${capaCard(p, false, undefined, blog)}<span class="k">${esc(p.category || info.categoria)}</span><h3>${esc(p.title)}</h3></a>`).join('')}</div></section>` : ''}
${vizinhos.length ? `<section class="mais viz"><h2>Do mesmo assunto nos nossos outros blogs</h2><ul>${vizinhos.map((x) => `<li><a href="${esc(x.url)}">${esc(x.title)}</a><span>${esc(x.blog)}</span></li>`).join('')}</ul></section>` : ''}
</div>${pp <= 2 ? `<aside class="lado" aria-label="Neste guia">${h2.length > 2 ? `<nav class="indice" aria-label="Neste guia"><b>Neste guia</b><ol>${indiceItens}</ol></nav>` : ''}</aside>` : ''}</div>
<section class="sec" id="assine" style="border:0;padding-top:30px">${assineHtml(info, v)}</section></article><!--rss-conteudo-fim--></main>${rodape(info, prefixo, v)}
${SCRIPT_POST(blog, canonical, post.title)}${semOferta ? scriptConvite(new URL(prefixo).host) : ''}</body></html>`;
}

// ---- Variante sem oferta: convite para o canal da voz e medição (contador do Portal, /pa/v, tipo "c" com destino "evento/<nome>") ----
function conviteHtml(info, v, voz, cfg) {
  const c = cfg.convite || {};
  const tel = /^https:\/\/l\.kbsa\.app\/[a-z0-9-]+/.test(v.telegram || '') ? String(v.telegram) : '';
  const wa = /^https:\/\/(l\.kbsa\.app\/[a-z0-9-]+|whatsapp\.com\/channel\/[A-Za-z0-9]+)/.test(cfg.whatsapp || '') ? String(cfg.whatsapp) : '';
  if (!tel && !wa) return '';
  const titulo = c.titulo || `As ofertas conferidas do dia saem no canal ${voz.ele === 'a' ? 'da' : 'do'} ${voz.curto}`;
  const texto = c.texto || `Lá ${voz.ele === 'a' ? 'ela' : 'ele'} manda uma dica curta por dia e só avisa de oferta quando o preço foi conferido.`;
  return `<aside class="convite" aria-label="Canal ${voz.ele === 'a' ? 'da' : 'do'} ${esc(voz.curto)}"><h2>${esc(titulo)}</h2><p>${esc(texto)}</p><div class="cv-b">
${tel ? `<a class="btn" data-convite="telegram" href="${esc(tel)}" rel="nofollow noopener" target="_blank">${esc(c.botao || 'Entrar no canal do Telegram')}</a>` : ''}${wa ? `<a class="btn lin" data-convite="whatsapp" href="${esc(wa)}" rel="nofollow noopener" target="_blank">Seguir o Canal no WhatsApp</a>` : ''}</div></aside>`;
}
/** Medição da variante: utm do anúncio vira src do BigLinks no convite (meta_<campanha>_<criativo>), CliqueConvite no clique de gente
 *  e LeituraProfunda com rolagem >= 60% e >= 30 s, uma vez por página. Sai sozinho com navigator.webdriver (robô e PageSpeed). */
const scriptConvite = (k) => `<script>(function(){var n=navigator,d=document,l=location;if(n.webdriver)return;var q=new URLSearchParams(l.search),u=[q.get('utm_source'),q.get('utm_medium'),q.get('utm_campaign')],t0=Date.now(),max=0,lido=0;
function ev(x){var j=JSON.stringify({k:${JSON.stringify(k)},t:'c',p:l.pathname,r:'',u:u,w:innerWidth,x:'evento/'+x});try{n.sendBeacon?n.sendBeacon('/pa/v',j):fetch('/pa/v',{method:'POST',body:j,keepalive:!0})}catch(e){}}
var src=(['utm_source','utm_campaign','utm_content'].map(function(x){return q.get(x)}).filter(Boolean).join('_')||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').slice(0,50);
[].forEach.call(d.querySelectorAll('[data-convite]'),function(a){if(src&&q.get('utm_source')){var b=a.href.split('?')[0];a.href=b+'?src='+src+'&'+['utm_source','utm_medium','utm_campaign','utm_content'].filter(function(x){return q.get(x)}).map(function(x){return x+'='+encodeURIComponent(q.get(x))}).join('&')}
a.addEventListener('click',function(e){if(e.isTrusted)ev('CliqueConvite_'+a.dataset.convite)})});
function ver(){var h=d.documentElement,r=(scrollY+innerHeight)/h.scrollHeight;if(r>max)max=r;if(!lido&&max>=.6&&Date.now()-t0>=3e4){lido=1;ev('LeituraProfunda')}}
addEventListener('scroll',ver,{passive:!0});setInterval(ver,5e3)})()</script>`;

/** Página obrigatória (sobre, contato, privacidade, termos, aviso-de-afiliados, autor), com o mesmo tema do blog.
 *  Na "sobre", a voz do blog se apresenta antes do texto institucional. */
export function renderInstitucional({ pag, info, v, prefixo, posts = [], medicao = {} }) {
  const dominio = String(prefixo).replace(/^https?:\/\//, '');
  const t = institucional(pag, { info, dominio, medicao, posts });
  const canonical = `${prefixo}/${pag}`;
  const corpo = t.html.replace(/href="\/(?!\/)/g, `href="${prefixo}/`);
  const voz = vozDe(v, info);
  const ld = { '@context': 'https://schema.org', '@type': pag === 'sobre' ? 'AboutPage' : pag === 'contato' ? 'ContactPage' : 'WebPage', name: t.titulo, url: canonical, inLanguage: 'pt-BR',
    isPartOf: { '@type': 'WebSite', name: info.nome, url: `${prefixo}/` }, ...(pag === 'autor' || pag === 'sobre' ? { about: { '@type': 'Organization', name: info.autor || `Equipe ${info.nome}`, url: `${prefixo}/autor`, email: emailDe(info, dominio) } } : {}) };
  const apresenta = pag === 'sobre' || pag === 'autor' ? `<aside class="voz" style="margin:0 0 34px;max-width:720px">${carimbo(voz, Date.now())}<div><h2>Oi, aqui é ${voz.ele === 'a' ? 'a' : 'o'} ${esc(voz.curto)}</h2><p>${esc(cap(voz.papel))}. ${esc(voz.jeito)}</p></div>
<p class="ia">${esc(voz.nome)} é ${voz.ele === 'a' ? 'uma personagem criada' : 'um personagem criado'} com IA para dar voz ao ${esc(info.nome)}. Os guias são pesquisados e conferidos pela equipe: ninguém aqui diz que testou um produto sem ter testado.</p></aside>` : '';
  return `${head({ titulo: t.titulo, desc: t.desc, canonical, v: { ...v, imagem: v.imagem || imagemPadrao(v, prefixo, posts), lcp: null }, ld, info, prefixo })}<body>${topo(info, prefixo, v, pag)}
<main><section class="abre"><div class="w"><h1>${esc(t.titulo.replace(/ · .*$/, ''))}</h1>${t.sub ? `<p class="sub" style="font-size:1.15rem;color:var(--suave);margin:12px 0 0;max-width:62ch">${esc(t.sub)}</p>` : ''}</div></section>
<section class="sec"><div class="w">${apresenta}<div class="txt">${corpo}</div></div></section></main>${rodape(info, prefixo, v)}</body></html>`;
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
  const cards = itens.map((it) => `<article class="card">${cabOferta(it.loja || 'Loja parceira')}${img(it.imagem) ? `<img src="${esc(img(it.imagem))}" alt="${esc(it.nome)}" loading="lazy" width="600" height="450">` : ''}
<div class="cp"><h3 class="on">${esc(it.nome)}</h3>
<div class="pr">${brl(it.preco)}<small>preço conferido em ${esc(dataBr(it.preco_conferido_em))}</small></div>
${it.nota ? `<p class="pq">${esc(it.nota)}</p>` : ''}
<a class="btn" href="${esc(it.url)}" ${REL}>Ver na loja</a><span class="nota" style="margin:4px 0 0">O preço pode mudar a qualquer momento; confira na loja antes de comprar.</span></div></article>`).join('');
  const titulo = `Ofertas do dia · ${info.nome}`;
  const desc = `Ofertas selecionadas pelo ${info.nome}, com o preço e a data em que foi conferido. Preços mudam: confira sempre na loja.`;
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: titulo, url: canonical, inLanguage: 'pt-BR',
    ...(itens.length ? { mainEntity: { '@type': 'ItemList', itemListElement: itens.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.nome })) } } : {}) };
  const vazio = `<div class="cap"><h2>Em breve</h2><p>Estamos conferindo preços e lojas. As primeiras ofertas aparecem aqui assim que cada preço for verificado na loja.</p></div>`;
  return `${head({ titulo, desc, canonical, v: { ...v, imagem: v.imagem || imagemPadrao(v, prefixo), lcp: null }, ld, info, prefixo })}<body>${topo(info, prefixo, v)}
<main><section class="abre"><div class="w"><h1>Ofertas do dia</h1><p class="sub" style="font-size:1.15rem;color:var(--suave);margin:12px 0 0;max-width:62ch">Cada preço aparece com a data em que foi conferido. Alguns links são de afiliado: se você comprar por eles, recebemos uma comissão, sem custo extra para você.</p>
<p class="edicao">${itens.length ? `Atualizado em ${esc(dataBr(ofertas.atualizado || itens[0].preco_conferido_em))}` : 'Em preparação'}</p></div></section>
<section class="sec"><div class="w">${itens.length ? `<div class="guias picks">${cards}</div>` : vazio}</div></section></main>${rodape(info, prefixo, v)}</body></html>`;
}

// ---- Web Story (AMP) de cada post, em <domínio>/stories/<slug> (09/11/2026): Google Discover e busca de imagens ----
const AMP_BOILERPLATE = '<style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style><noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>';
const plano = (md) => String(md || '').replace(/\{\{[A-Z]+:[a-z0-9-]+\}\}/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/[*_`>#]+/g, '').replace(/\s+/g, ' ').trim();
/** Intertítulos do post com a primeira frase de cada um (sem FAQ, Fontes nem caixas de oferta). */
export function trechosDoPost(content, max = 3) {
  const out = [];
  for (const bloco of String(content || '').replace(/\r/g, '').replace(/^:::[\s\S]*?^:::[ \t]*$/gm, '').split(/^##\s+/m).slice(1)) {
    const [titulo, ...resto] = bloco.split('\n');
    if (/perguntas|fontes|refer[eê]ncias/i.test(titulo)) continue;
    const par = resto.map((l) => l.trim()).find((l) => l && !/^(#|!\[|\||-{3})/.test(l));
    if (par) out.push({ t: plano(titulo), d: frase(plano(par.replace(/^([-*]|\d+[.)])\s+/, '')), 190) });
    if (out.length >= max) break;
  }
  return out;
}
/** Imagens da story a partir da capa do post: pôster 1200x1600 (<slug>-story.webp) e logo do blog (logo.webp), gerados por afiliacao-capas.mjs. */
export const posterDa = (capa) => (capa ? capa.replace(/-capa\.(png|jpe?g|webp)$/, '-story.webp') : null);
export const logoDa = (capa) => (capa ? capa.replace(/\/[^/]+$/, '/logo.webp') : null);

/** Web Story AMP do post: capa, resposta rápida, até 3 intertítulos, produto indicado (link de afiliado) e o guia completo. Null sem capa. */
export function renderStory({ info, v, post, prefixo, dados }) {
  const capa = capaDo(post);
  if (!capa) return null;
  const origem = new URL(prefixo).origin;
  const url = `${prefixo}/stories/${post.slug}`;
  const guia = `${prefixo}/blog/${post.slug}`;
  const poster = `${origem}${comVersao(posterDa(capa))}`;
  const logo = `${origem}${comVersao(logoDa(capa))}`;
  const chaves = [...String(post.content).matchAll(/\{\{LINK:([a-z0-9-]+)\}\}/g)].map((m) => m[1]);
  const p = [...chaves, ...(v.destaques || [])].map((k) => produto(k, dados)).find(Boolean);
  const resposta = frase(post.resposta || post.excerpt, 260);
  const trechos = trechosDoPost(post.content);
  const desc = post.seoDescription || post.excerpt || '';
  const t = temaDe(blogDe(v), v);
  const fonte = fonteDe(t).familia;
  const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: post.title, description: desc, url, mainEntityOfPage: url, inLanguage: 'pt-BR',
    image: [poster, `${origem}${capa}`], author: { '@type': 'Organization', name: info.autor || `Equipe ${info.nome}`, url: `${prefixo}/` },
    publisher: { '@type': 'Organization', name: info.nome, url: `${prefixo}/`, logo: { '@type': 'ImageObject', url: logo, width: 192, height: 192 } } };
  const pagina = (id, corpo, extra = '') => `<amp-story-page id="${id}"><amp-story-grid-layer template="vertical" class="tx">${corpo}</amp-story-grid-layer>${extra}</amp-story-page>`;
  const link = (href, texto, patrocinado) => `<amp-story-page-outlink layout="nodisplay" theme="custom" cta-accent-element="background" cta-accent-color="${esc(t.claro.acento)}"><a href="${esc(href)}"${patrocinado ? ' rel="sponsored nofollow"' : ''}>${esc(texto)}</a></amp-story-page-outlink>`;
  return `<!doctype html><html ⚡ lang="pt-BR"><head><meta charset="utf-8"><title>${esc(tituloCurto(`${post.seoTitle || post.title} · ${info.nome}`))}</title>
<link rel="canonical" href="${esc(url)}"><meta name="viewport" content="width=device-width"><meta name="description" content="${esc(desc).slice(0, 160)}">
${rssAutodiscovery(info, prefixo)}
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(post.title)}"><meta property="og:description" content="${esc(desc).slice(0, 200)}"><meta property="og:url" content="${esc(url)}"><meta property="og:locale" content="pt_BR"><meta property="og:site_name" content="${esc(info.nome)}"><meta property="og:image" content="${esc(poster)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="1600"><meta property="og:image:alt" content="${esc(post.coverAlt || post.title)}"><meta name="twitter:card" content="summary_large_image">
<script async src="https://cdn.ampproject.org/v0.js"></script><script async custom-element="amp-story" src="https://cdn.ampproject.org/v0/amp-story-1.0.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;700&amp;family=${familiaFonte(fonte, '700')}&amp;display=swap" rel="stylesheet">
${AMP_BOILERPLATE}
<style amp-custom>.guia-link{display:inline-flex;align-items:center;min-height:52px;margin-top:28px;padding:0 20px;border:2px solid ${t.claro.sobreAcento};border-radius:8px;background:${t.claro.sobreAcento};color:${t.claro.acento};font-size:18px;font-weight:700;text-decoration:none}.guia-link:focus{outline:3px solid ${t.claro.sobreAcento};outline-offset:4px}
amp-story{font-family:'Atkinson Hyperlegible Next',sans-serif;color:${t.claro.sobreAcento}}
.tx{background:${t.claro.acento};padding:56px 28px 96px;align-content:center}
.k{font-size:15px;font-weight:700;letter-spacing:.02em;opacity:.9;margin:0 0 10px}
h1,h2{font-family:'${fonte}',sans-serif;font-weight:700;line-height:1.1;margin:0 0 16px}h1{font-size:34px}h2{font-size:30px}
p{font-size:20px;line-height:1.45;margin:0}.pr{font-size:28px;font-weight:700;margin-top:12px}
.ft{background:#fff;border-radius:14px;padding:16px;margin-bottom:22px}.m{font-size:16px;font-weight:700;margin-top:22px}</style>
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script></head><body>
<amp-story standalone title="${esc(post.title)}" publisher="${esc(info.nome)}" publisher-logo-src="${esc(logo)}" poster-portrait-src="${esc(poster)}">
<amp-story-page id="capa"><amp-story-grid-layer template="fill"><amp-img src="${esc(poster)}" width="1200" height="1600" layout="responsive" alt="${esc(post.coverAlt || post.title)}"></amp-img></amp-story-grid-layer></amp-story-page>
${resposta ? pagina('resposta', `<div><p class="k">Resposta rápida</p><h1>${esc(post.title)}</h1><p>${esc(resposta)}</p></div>`) : ''}
${trechos.map((x, i) => pagina(`parte-${i + 1}`, `<div><p class="k">${i + 1} de ${trechos.length}</p><h2>${esc(x.t)}</h2><p>${esc(x.d)}</p></div>`)).join('\n')}
${p ? pagina('oferta', `<div>${p.img ? `<div class="ft"><amp-img src="${esc(absoluta(p.img, prefixo))}" width="600" height="375" layout="responsive" alt="${esc(p.nome)}"></amp-img></div>` : ''}<p class="k">${chaves.includes(p.chave) ? 'Indicado neste guia' : `Indicado pelo ${esc(info.nome)}`}</p><h2>${esc(p.nome)}</h2>${p.preco ? `<p class="pr">${brl(p.preco)}</p>` : ''}<p class="m">Link de afiliado: confira preço e garantia na página oficial.</p></div>`, link(p.url, 'Ver oferta', true)) : ''}
${pagina('guia', `<div><p class="k">${esc(info.nome)}</p><h2>Leia o guia completo</h2><p>${esc(frase(desc, 200))}</p><a class="guia-link" href="${esc(guia)}" target="_blank" rel="noopener">Abrir o guia completo</a></div>`, link(guia, 'Abrir o guia'))}
</amp-story></body></html>`;
}
