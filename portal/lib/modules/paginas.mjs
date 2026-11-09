// Páginas próprias: documento HTML completo, feito à mão, servido num site com domínio próprio (ex.: hotpoker.club e /1 a /4).
// Só o superadministrador grava (é HTML livre). Ao servir, o portal liga o formulário de e-mail da página ao CRM
// (POST /f/<site> com UTMs) e troca __SITE__ pelo id do site. Páginas com indexar=1 entram no sitemap.
import { HttpError } from '../http.mjs';
import { now } from '../db.mjs';

export const tables = ['paginas_proprias'];

// Um nível extra é permitido (ex.: blog/<post>) para sites que desenham o próprio blog à mão.
const CAMINHO = /^[a-z0-9-]{0,60}(?:\/[a-z0-9-]{1,90})?$/;
const limpar = (c) => String(c ?? '').trim().replace(/^\/+|\/+$/g, '').toLowerCase();
// HTML próprio usa script e estilo embutidos e Google Fonts; o resto continua fechado.
export const CSP_PROPRIA = "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com https://*.adtrafficquality.google https://partner.googleadservices.com https://www.googletagservices.com https://www.googletagmanager.com https://connect.facebook.net https://www.clarity.ms https://*.clarity.ms https://www.googleadservices.com https://googleads.g.doubleclick.net; connect-src 'self' https://pagead2.googlesyndication.com https://*.adtrafficquality.google https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://www.facebook.com https://*.clarity.ms https://www.google.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://*.doubleclick.net; frame-src https://www.googletagmanager.com https://googleads.g.doubleclick.net https://*.googlesyndication.com https://*.adtrafficquality.google https://td.doubleclick.net; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

/** Script que o portal acrescenta: quando o envio da página é válido, o e-mail vai para o CRM (com UTMs). Não muda a tela da página. */
export function scriptCrm(siteId) {
  return `<script>(function(){var S=${JSON.stringify(String(siteId))};var RE=/^[^@\\s]+@[^@\\s]+\\.[^@\\s]{2,}$/;
var U=['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','gclid'];
function aviso(t){var d=document.createElement('div');d.setAttribute('role','alert');d.textContent=t;d.style.cssText='position:fixed;left:16px;right:16px;bottom:88px;z-index:99999;margin:auto;max-width:520px;padding:14px 16px;border-radius:8px;background:#1a1410;color:#fff;font:600 15px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgb(0 0 0/.45)';document.body.appendChild(d);setTimeout(function(){d.remove()},7000)}
document.addEventListener('submit',function(e){var f=e.target;if(!f||!f.querySelector)return;var em=f.querySelector('input[type=email]');if(!em)return;
var v=(em.value||'').trim().toLowerCase();var ck=f.querySelector('input[type=checkbox][required]')||f.querySelector('input[type=checkbox]');
if(!RE.test(v)||(ck&&!ck.checked))return;if(f.getAttribute('data-crm')===v)return;f.setAttribute('data-crm',v);
var q=new URLSearchParams(location.search),b={email:v,consent:'1',website:'',page:location.pathname.replace(/^\\/|\\/$/g,'')};
U.forEach(function(k){if(q.get(k))b[k]=q.get(k)});
fetch('/f/'+S,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(b),keepalive:true,credentials:'same-origin'})
.then(function(r){if(!r.ok)return r.json().then(function(j){throw new Error(j&&j.error||'erro')});if(window.hpMedir)window.hpMedir('generate_lead',{pagina:b.page||'inicio'})})
.catch(function(err){f.removeAttribute('data-crm');aviso('Não deu para registrar seu e-mail agora ('+(err&&err.message||'sem conexão')+'). Tente de novo em instantes ou chame o suporte no WhatsApp.')});
},false)})();</script>`;
}

/** Tag da medição (GA4, Pixel, Clarity e Google Ads, com consentimento) a partir de site.tracking; vazia sem IDs. */
export function tagMedicao(site) {
  let t = {};
  try { t = JSON.parse(site?.tracking || '{}') || {}; } catch { t = {}; }
  const ga4 = /^G-[A-Z0-9]{4,12}$/.test(t.ga4 || '') ? t.ga4 : '';
  const pixel = /^\d{8,20}$/.test(t.pixel || '') ? t.pixel : '';
  const clarity = /^[a-z0-9]{6,16}$/.test(t.clarity || '') ? t.clarity : '';
  const ads = /^AW-\d{6,14}$/.test(t.ads || '') ? t.ads : '';
  const adsLabel = ads && /^[A-Za-z0-9_-]{4,40}$/.test(t.adsLabel || '') ? t.adsLabel : '';
  const extra = `${clarity ? ` data-clarity="${clarity}"` : ''}${ads ? ` data-ads="${ads}"` : ''}${adsLabel ? ` data-ads-label="${adsLabel}"` : ''}`;
  return ga4 || pixel || clarity || ads ? `<script src="/assets/medicao.js" data-ga4="${ga4}" data-pixel="${pixel}"${extra} defer></script>` : '';
}

/** Documento pronto para servir: troca __SITE__ e põe a medição e o script do CRM antes de </body>. */
export function montar(html, siteOuId) {
  const site = typeof siteOuId === 'object' && siteOuId ? siteOuId : { id: siteOuId };
  const siteId = site.id;
  const doc = String(html).replace(/__SITE__/g, String(siteId));
  const s = tagMedicao(site) + scriptCrm(siteId);
  return /<\/body>/i.test(doc) ? doc.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${s}</body>`) : `${doc}${s}`;
}

/** Gancho do núcleo (servePublicSite): devolve a resposta quando o caminho tem página própria. */
export function paginaPropria({ req, site, repo, rest }) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  const caminho = limpar(String(rest || '').split('?')[0]);
  if (!CAMINHO.test(caminho)) return null;
  const p = repo.get('paginas_proprias', { site_id: site.id, caminho });
  if (!p) return null;
  return { status: 200, body: montar(p.html, site), headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP_PROPRIA,
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Cache-Control': 'public, max-age=120' } };
}

/** Sitemap: só as páginas próprias marcadas para indexar (a raiz e o que mais o dono quiser no Google). */
export function sitemapEntries({ site, repo }) {
  return repo.all('paginas_proprias', { site_id: site.id, indexar: 1 }, { order: 'caminho ASC' })
    .map((p) => ({ path: p.caminho ? `/${p.caminho}` : '/', lastmod: p.updated_at }));
}

/** Grava (cria ou troca) uma página própria. Usado pela API e pelo instalador do Hot Poker. */
export function gravarPagina(repo, { siteId, caminho, html, titulo = '', indexar = true }) {
  const c = limpar(caminho);
  if (!CAMINHO.test(c)) throw new HttpError(400, 'Caminho inválido: use letras minúsculas, números e hífen (vazio = raiz).');
  const doc = String(html || '');
  if (!/<html[\s>]/i.test(doc) || doc.length > 600_000) throw new HttpError(400, 'Mande o documento HTML completo (até 600 KB).');
  const atual = repo.get('paginas_proprias', { site_id: siteId, caminho: c });
  const dados = { titulo: String(titulo).slice(0, 160), html: doc, indexar: indexar ? 1 : 0, updated_at: now() };
  return atual ? repo.update('paginas_proprias', atual.id, dados) : repo.insert('paginas_proprias', { site_id: siteId, caminho: c, ...dados });
}

const siteDa = (repo, id) => {
  const s = repo.get('sites', id);
  if (!s) throw new HttpError(404, 'Site não encontrado nesta operação.');
  return s;
};

export const routes = [
  {
    method: 'GET', path: '/api/t/:tenant/sites/:site/paginas-proprias', super: true, handler: ({ repo, params }) => {
      siteDa(repo, params.site);
      return { paginas: repo.all('paginas_proprias', { site_id: params.site }, { order: 'caminho ASC' })
        .map(({ html, ...p }) => ({ ...p, tamanho: html.length })) };
    },
  },
  {
    method: 'PUT', path: '/api/t/:tenant/sites/:site/paginas-proprias', super: true, handler: ({ repo, params, body, audit }) => {
      siteDa(repo, params.site);
      const p = gravarPagina(repo, { siteId: params.site, caminho: body.caminho, html: body.html, titulo: body.titulo, indexar: body.indexar !== false });
      audit('pagina_propria.gravar', p.id, { caminho: p.caminho, indexar: p.indexar });
      const { html, ...resto } = p;
      return { pagina: { ...resto, tamanho: html.length } };
    },
  },
  {
    method: 'DELETE', path: '/api/t/:tenant/sites/:site/paginas-proprias/:id', super: true, handler: ({ repo, params, audit }) => {
      siteDa(repo, params.site);
      const p = repo.get('paginas_proprias', { id: params.id, site_id: params.site });
      if (!p) throw new HttpError(404, 'Página não encontrada.');
      repo.remove('paginas_proprias', p.id);
      audit('pagina_propria.apagar', p.id, { caminho: p.caminho });
      return { ok: true };
    },
  },
];
