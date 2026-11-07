// Ferramentas comuns dos blocos (usadas por lib/blocks.mjs e pelos mundos em lib/worlds/*.mjs).
// Todo texto passa por esc(); todo link passa por safeHref(); toda imagem por img().

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Só http(s), mailto, tel, âncora e caminho relativo. Caminho "/x" vira relativo à base do site. */
export function safeHref(href, base = '') {
  const h = String(href ?? '').trim();
  if (!h) return '#';
  if (h.startsWith('#')) return esc(h);
  if (h.startsWith('/') && !h.startsWith('//')) return esc(base + h);
  if (/^(https?:|mailto:|tel:)/i.test(h)) return esc(h);
  return '#';
}

/** Parágrafos separados por linha em branco; quebra simples vira <br>. */
export const para = (txt) => String(txt ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
export const list = (v) => (Array.isArray(v) ? v : []);
export const head = (p, cls = '') => (p.title || p.subtitle || p.eyebrow
  ? `<header class="b-head ${cls}">${p.eyebrow ? `<p class="eyebrow">${esc(p.eyebrow)}</p>` : ''}${p.title ? `<h2>${esc(p.title)}</h2>` : ''}${p.subtitle ? `<p class="sub">${esc(p.subtitle)}</p>` : ''}</header>`
  : '');
export const btn = (label, href, ctx, cls = 'btn') => (label ? `<a class="${cls}" href="${safeHref(href, ctx.base)}" data-cta="${esc(label)}">${esc(label)}</a>` : '');
export const img = (src, alt = '', cls = '') => (src && /^(https?:\/\/|\/)/.test(src) ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async">` : '');
export const variant = (p, allowed, fallback) => (allowed.includes(p.variant) ? p.variant : fallback);

/** Campos do editor: o painel monta o formulário do bloco a partir desta lista. */
export const F = {
  text: (k, label, extra = {}) => ({ k, label, t: 'text', ...extra }),
  area: (k, label, extra = {}) => ({ k, label, t: 'textarea', ...extra }),
  url: (k, label, extra = {}) => ({ k, label, t: 'url', ...extra }),
  select: (k, label, options) => ({ k, label, t: 'select', options }),
  check: (k, label) => ({ k, label, t: 'checkbox' }),
  list: (k, label, of) => ({ k, label, t: 'list', of }),
};
export const HEAD = [F.text('eyebrow', 'Chamada pequena'), F.text('title', 'Título'), F.area('subtitle', 'Subtítulo')];

/** Campos dos blocos de grade que podem puxar os torneios da liga (lib/grade-ao-vivo.mjs). */
export const AO_VIVO = [F.check('aoVivo', 'Grade ao vivo da liga (Recursos → Torneios ao vivo): troca os itens abaixo pelos torneios abertos agora, com contagem regressiva. Sem liga ligada, mostra os itens abaixo.'),
  F.text('aoVivoMax', 'Grade ao vivo · quantos torneios mostrar (padrão 8)')];

/** Selo da contagem regressiva de um item da grade ao vivo ('' nos itens digitados à mão). site.js atualiza a cada 15 s. */
export const contagem = (i) => (i?._cd?.ini
  ? `<span class="cd cd-${esc(i._cd.fase)}${i._cd.urgente ? ' cd-urgente' : ''}" data-cd-ini="${esc(i._cd.ini)}" data-cd-fim="${esc(i._cd.fim)}">${esc(i._cd.texto)}</span>`
  : '');
