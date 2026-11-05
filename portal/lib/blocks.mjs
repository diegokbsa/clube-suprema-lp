// Catálogo de blocos do construtor. Cada bloco = { type, props }. O editor monta o formulário a partir de `fields`;
// o site público é renderizado por `render`. Todo texto passa por esc(); todo link passa por safeHref().

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

const para = (txt) => String(txt ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
const list = (v) => (Array.isArray(v) ? v : []);
const head = (p, cls = '') => (p.title || p.subtitle || p.eyebrow
  ? `<header class="b-head ${cls}">${p.eyebrow ? `<p class="eyebrow">${esc(p.eyebrow)}</p>` : ''}${p.title ? `<h2>${esc(p.title)}</h2>` : ''}${p.subtitle ? `<p class="sub">${esc(p.subtitle)}</p>` : ''}</header>`
  : '');
const btn = (label, href, ctx, cls = 'btn') => (label ? `<a class="${cls}" href="${safeHref(href, ctx.base)}" data-cta="${esc(label)}">${esc(label)}</a>` : '');
const img = (src, alt = '', cls = '') => (src && /^(https?:\/\/|\/)/.test(src) ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async">` : '');
const variant = (p, allowed, fallback) => (allowed.includes(p.variant) ? p.variant : fallback);

const F = {
  text: (k, label, extra = {}) => ({ k, label, t: 'text', ...extra }),
  area: (k, label, extra = {}) => ({ k, label, t: 'textarea', ...extra }),
  url: (k, label, extra = {}) => ({ k, label, t: 'url', ...extra }),
  select: (k, label, options) => ({ k, label, t: 'select', options }),
  check: (k, label) => ({ k, label, t: 'checkbox' }),
  list: (k, label, of) => ({ k, label, t: 'list', of }),
};
const HEAD = [F.text('eyebrow', 'Chamada pequena'), F.text('title', 'Título'), F.area('subtitle', 'Subtítulo')];

export const BLOCKS = {
  navbar: {
    label: 'Menu do topo',
    fields: [F.text('brand', 'Nome da marca'), F.url('logo', 'Logo (URL)'), F.list('links', 'Links', [F.text('label', 'Texto'), F.url('href', 'Destino')]),
      F.text('cta', 'Botão'), F.url('ctaHref', 'Destino do botão'), F.select('variant', 'Estilo', ['barra', 'centralizado', 'flutuante'])],
    render: (p, ctx) => `<nav class="b b-navbar v-${variant(p, ['barra', 'centralizado', 'flutuante'], 'barra')}"><div class="wrap">
      <a class="brand" href="${safeHref('/', ctx.base)}">${img(p.logo, p.brand, 'brand-logo')}<span>${esc(p.brand || ctx.site.name)}</span></a>
      <ul>${list(p.links).map((l) => `<li><a href="${safeHref(l.href, ctx.base)}">${esc(l.label)}</a></li>`).join('')}</ul>
      ${btn(p.cta, p.ctaHref, ctx, 'btn btn-sm')}</div></nav>`,
  },
  hero: {
    label: 'Destaque principal',
    fields: [...HEAD, F.text('cta', 'Botão principal'), F.url('ctaHref', 'Destino do botão'), F.text('secondary', 'Botão secundário'),
      F.url('secondaryHref', 'Destino secundário'), F.url('image', 'Imagem (URL)'), F.text('note', 'Nota abaixo dos botões'),
      F.select('variant', 'Composição', ['dividido', 'centralizado', 'cartaz', 'painel'])],
    render: (p, ctx) => {
      const v = variant(p, ['dividido', 'centralizado', 'cartaz', 'painel'], 'dividido');
      return `<section class="b b-hero v-${v}"><div class="wrap"><div class="hero-copy">
        ${p.eyebrow ? `<p class="eyebrow">${esc(p.eyebrow)}</p>` : ''}<h1>${esc(p.title)}</h1>${p.subtitle ? `<p class="lead">${esc(p.subtitle)}</p>` : ''}
        <div class="actions">${btn(p.cta, p.ctaHref, ctx, 'btn btn-lg')}${btn(p.secondary, p.secondaryHref, ctx, 'btn btn-ghost btn-lg')}</div>
        ${p.note ? `<p class="note">${esc(p.note)}</p>` : ''}</div>${img(p.image, p.title, 'hero-img')}</div></section>`;
    },
  },
  features: {
    label: 'Vantagens / recursos',
    fields: [...HEAD, F.list('items', 'Itens', [F.text('icon', 'Ícone (emoji ou sigla)'), F.text('title', 'Título'), F.area('text', 'Texto')]),
      F.select('variant', 'Composição', ['grade', 'lista', 'destaque-lateral'])],
    render: (p) => `<section class="b b-features v-${variant(p, ['grade', 'lista', 'destaque-lateral'], 'grade')}"><div class="wrap">${head(p)}
      <ul class="items">${list(p.items).map((i) => `<li>${i.icon ? `<span class="ico" aria-hidden="true">${esc(i.icon)}</span>` : ''}<h3>${esc(i.title)}</h3>${para(i.text)}</li>`).join('')}</ul></div></section>`,
  },
  steps: {
    label: 'Passo a passo',
    fields: [...HEAD, F.list('items', 'Passos', [F.text('title', 'Título'), F.area('text', 'Texto')]), F.select('variant', 'Composição', ['numerado', 'linha-do-tempo'])],
    render: (p) => `<section class="b b-steps v-${variant(p, ['numerado', 'linha-do-tempo'], 'numerado')}"><div class="wrap">${head(p)}
      <ol class="items">${list(p.items).map((i, n) => `<li><span class="num">${n + 1}</span><div><h3>${esc(i.title)}</h3>${para(i.text)}</div></li>`).join('')}</ol></div></section>`,
  },
  cta: {
    label: 'Chamada para ação',
    fields: [F.text('title', 'Título'), F.area('text', 'Texto'), F.text('cta', 'Botão'), F.url('ctaHref', 'Destino'), F.select('variant', 'Tom', ['destaque', 'escuro', 'faixa'])],
    render: (p, ctx) => `<section class="b b-cta v-${variant(p, ['destaque', 'escuro', 'faixa'], 'destaque')}"><div class="wrap"><div class="cta-box">
      <h2>${esc(p.title)}</h2>${para(p.text)}${btn(p.cta, p.ctaHref, ctx, 'btn btn-lg')}</div></div></section>`,
  },
  faq: {
    label: 'Perguntas frequentes',
    fields: [...HEAD, F.list('items', 'Perguntas', [F.text('q', 'Pergunta'), F.area('a', 'Resposta')])],
    render: (p) => `<section class="b b-faq"><div class="wrap narrow">${head(p)}
      ${list(p.items).map((i) => `<details><summary>${esc(i.q)}</summary>${para(i.a)}</details>`).join('')}</div></section>`,
  },
  text: {
    label: 'Texto livre',
    fields: [F.text('title', 'Título'), F.area('body', 'Texto (parágrafos separados por linha em branco)'), F.select('variant', 'Largura', ['estreito', 'largo'])],
    render: (p) => `<section class="b b-text"><div class="wrap ${p.variant === 'largo' ? '' : 'narrow'}">${p.title ? `<h2>${esc(p.title)}</h2>` : ''}${para(p.body)}</div></section>`,
  },
  lead_form: {
    label: 'Formulário de contato (vai para o CRM)',
    fields: [F.text('title', 'Título'), F.area('text', 'Texto'), F.select('fields', 'Campos', ['email', 'email_nome', 'email_nome_telefone']),
      F.text('button', 'Texto do botão'), F.text('success', 'Mensagem de sucesso'), F.area('consent', 'Texto de consentimento'),
      F.select('variant', 'Composição', ['cartao', 'faixa', 'lateral'])],
    render: (p, ctx) => {
      const f = p.fields || 'email_nome';
      const consent = p.consent || 'Concordo em receber contato sobre esta oferta. Posso sair quando quiser.';
      return `<section class="b b-lead_form v-${variant(p, ['cartao', 'faixa', 'lateral'], 'cartao')}" id="contato"><div class="wrap"><div class="form-box">
        <div class="form-copy"><h2>${esc(p.title || 'Fale com a gente')}</h2>${para(p.text)}</div>
        <form class="lead-form" method="post" action="${esc(ctx.formAction)}" data-success="${esc(p.success || 'Recebemos! Vamos falar com você em breve.')}">
          <input type="hidden" name="page" value="${esc(ctx.page.slug)}">
          ${f.includes('nome') ? '<label>Nome<input name="name" autocomplete="name" maxlength="80" required></label>' : ''}
          <label>E-mail<input name="email" type="email" autocomplete="email" maxlength="120" required></label>
          ${f.includes('telefone') ? '<label>WhatsApp<input name="phone" type="tel" autocomplete="tel" maxlength="20"></label>' : ''}
          <label class="check"><input type="checkbox" name="consent" value="1" required> <span>${esc(consent)}</span></label>
          <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
          <button class="btn btn-lg" type="submit">${esc(p.button || 'Enviar')}</button>
          <p class="form-msg" role="status" aria-live="polite"></p>
        </form></div></div></section>`;
    },
  },
  stats: {
    label: 'Números',
    fields: [...HEAD, F.list('items', 'Números', [F.text('value', 'Valor'), F.text('label', 'Legenda')]), F.check('demo', 'São números de exemplo (mostra o aviso)')],
    render: (p) => `<section class="b b-stats"><div class="wrap">${head(p)}<ul class="items">${list(p.items).map((i) => `<li><strong>${esc(i.value)}</strong><span>${esc(i.label)}</span></li>`).join('')}</ul>
      ${p.demo ? '<p class="demo-tag">Números de exemplo: troque pelos dados reais antes de publicar.</p>' : ''}</div></section>`,
  },
  schedule: {
    label: 'Agenda (torneios, eventos, aulas)',
    fields: [...HEAD, F.list('items', 'Itens', [F.text('day', 'Dia'), F.text('time', 'Hora'), F.text('name', 'Nome'), F.text('detail', 'Detalhe (buy-in, formato)'), F.text('prize', 'Destaque (garantido, vagas)')]),
      F.text('cta', 'Botão'), F.url('ctaHref', 'Destino')],
    render: (p, ctx) => `<section class="b b-schedule"><div class="wrap">${head(p)}<div class="table-wrap"><table><thead><tr><th>Dia</th><th>Hora</th><th>Nome</th><th>Detalhe</th><th>Destaque</th></tr></thead><tbody>
      ${list(p.items).map((i) => `<tr><td>${esc(i.day)}</td><td>${esc(i.time)}</td><td><strong>${esc(i.name)}</strong></td><td>${esc(i.detail)}</td><td>${esc(i.prize)}</td></tr>`).join('')}
      </tbody></table></div>${btn(p.cta, p.ctaHref, ctx)}</div></section>`,
  },
  offers: {
    label: 'Ofertas / parceiros com link',
    fields: [...HEAD, F.list('items', 'Ofertas', [F.text('name', 'Nome'), F.area('text', 'Descrição'), F.text('badge', 'Selo'), F.text('cta', 'Botão'), F.url('href', 'Link'), F.url('image', 'Imagem')]),
      F.select('variant', 'Composição', ['cartoes', 'ranking', 'lista']), F.text('disclosure', 'Aviso de afiliado')],
    render: (p, ctx) => `<section class="b b-offers v-${variant(p, ['cartoes', 'ranking', 'lista'], 'cartoes')}"><div class="wrap">${head(p)}
      <ol class="items">${list(p.items).map((i) => `<li>${img(i.image, i.name, 'offer-img')}<div class="offer-body">${i.badge ? `<span class="badge">${esc(i.badge)}</span>` : ''}<h3>${esc(i.name)}</h3>${para(i.text)}</div>${btn(i.cta || 'Ver oferta', i.href, ctx, 'btn btn-sm')}</li>`).join('')}</ol>
      <p class="disclosure">${esc(p.disclosure || 'Alguns links são de afiliado: podemos receber comissão sem custo extra para você.')}</p></div></section>`,
  },
  compare: {
    label: 'Tabela comparativa',
    fields: [...HEAD, F.text('columns', 'Colunas (separadas por ;)'), F.list('rows', 'Linhas', [F.text('name', 'Item'), F.text('values', 'Valores (separados por ;)')])],
    render: (p) => {
      const columns = String(p.columns || '').split(';').map((c) => c.trim()).filter(Boolean);
      return `<section class="b b-compare"><div class="wrap">${head(p)}<div class="table-wrap"><table><thead><tr><th></th>${columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>
        ${list(p.rows).map((r) => `<tr><th scope="row">${esc(r.name)}</th>${String(r.values || '').split(';').map((v) => `<td>${esc(v.trim())}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div></section>`;
    },
  },
  cards: {
    label: 'Cartões com link',
    fields: [...HEAD, F.list('items', 'Cartões', [F.text('title', 'Título'), F.area('text', 'Texto'), F.url('href', 'Link'), F.url('image', 'Imagem'), F.text('tag', 'Etiqueta')]),
      F.select('variant', 'Composição', ['grade', 'mosaico', 'carrossel'])],
    render: (p, ctx) => `<section class="b b-cards v-${variant(p, ['grade', 'mosaico', 'carrossel'], 'grade')}"><div class="wrap">${head(p)}
      <ul class="items">${list(p.items).map((i) => `<li><a href="${safeHref(i.href, ctx.base)}">${img(i.image, i.title, 'card-img')}<div class="card-body">${i.tag ? `<span class="tag">${esc(i.tag)}</span>` : ''}<h3>${esc(i.title)}</h3>${para(i.text)}</div></a></li>`).join('')}</ul></div></section>`,
  },
  image_text: {
    label: 'Imagem e texto',
    fields: [F.text('eyebrow', 'Chamada pequena'), F.text('title', 'Título'), F.area('text', 'Texto'), F.url('image', 'Imagem'), F.text('cta', 'Botão'), F.url('ctaHref', 'Destino'),
      F.select('variant', 'Lado da imagem', ['imagem-esquerda', 'imagem-direita'])],
    render: (p, ctx) => `<section class="b b-image_text v-${variant(p, ['imagem-esquerda', 'imagem-direita'], 'imagem-direita')}"><div class="wrap split">
      <div>${p.eyebrow ? `<p class="eyebrow">${esc(p.eyebrow)}</p>` : ''}<h2>${esc(p.title)}</h2>${para(p.text)}${btn(p.cta, p.ctaHref, ctx)}</div>
      <div class="media">${img(p.image, p.title) || '<div class="placeholder" aria-hidden="true"></div>'}</div></div></section>`,
  },
  logos: {
    label: 'Logos de parceiros',
    fields: [F.text('title', 'Título'), F.list('items', 'Parceiros', [F.text('name', 'Nome'), F.url('image', 'Logo'), F.url('href', 'Link')])],
    render: (p, ctx) => `<section class="b b-logos"><div class="wrap">${p.title ? `<p class="logos-title">${esc(p.title)}</p>` : ''}<ul>${list(p.items).map((i) => `<li><a href="${safeHref(i.href, ctx.base)}">${img(i.image, i.name) || esc(i.name)}</a></li>`).join('')}</ul></div></section>`,
  },
  ticker: {
    label: 'Faixa corrida',
    fields: [F.list('items', 'Frases', [F.text('text', 'Frase')])],
    render: (p) => `<div class="b b-ticker" aria-hidden="true"><div class="track">${[...list(p.items), ...list(p.items)].map((i) => `<span>${esc(i.text)}</span>`).join('')}</div></div>`,
  },
  contact: {
    label: 'Canais de atendimento',
    fields: [...HEAD, F.text('whatsapp', 'WhatsApp (só números, com DDI)'), F.text('telegram', 'Telegram (@usuario)'), F.text('instagram', 'Instagram (@perfil)'), F.text('email', 'E-mail'), F.text('hours', 'Horário')],
    render: (p) => {
      const ch = [];
      if (p.whatsapp) ch.push(['WhatsApp', `https://wa.me/${String(p.whatsapp).replace(/\D/g, '')}`]);
      if (p.telegram) ch.push(['Telegram', `https://t.me/${String(p.telegram).replace(/^@/, '')}`]);
      if (p.instagram) ch.push(['Instagram', `https://instagram.com/${String(p.instagram).replace(/^@/, '')}`]);
      if (p.email) ch.push(['E-mail', `mailto:${p.email}`]);
      return `<section class="b b-contact"><div class="wrap">${head(p)}<ul class="channels">${ch.map(([n, h]) => `<li><a class="btn btn-ghost" href="${safeHref(h)}" rel="noopener">${esc(n)}</a></li>`).join('')}</ul>
        ${p.hours ? `<p class="note">${esc(p.hours)}</p>` : ''}</div></section>`;
    },
  },
  notice: {
    label: 'Aviso (legal, idade, demonstração)',
    fields: [F.area('text', 'Texto'), F.select('variant', 'Tom', ['discreto', 'alerta'])],
    render: (p) => `<aside class="b b-notice v-${variant(p, ['discreto', 'alerta'], 'discreto')}"><div class="wrap">${para(p.text)}</div></aside>`,
  },
  footer: {
    label: 'Rodapé',
    fields: [F.text('brand', 'Marca'), F.area('text', 'Texto'), F.list('links', 'Links', [F.text('label', 'Texto'), F.url('href', 'Destino')]), F.area('disclaimer', 'Aviso legal')],
    render: (p, ctx) => `<footer class="b b-footer"><div class="wrap"><div><strong>${esc(p.brand || ctx.site.name)}</strong>${para(p.text)}</div>
      <ul>${list(p.links).map((l) => `<li><a href="${safeHref(l.href, ctx.base)}">${esc(l.label)}</a></li>`).join('')}</ul>
      ${p.disclaimer || ctx.disclaimer ? `<p class="disclaimer">${esc(p.disclaimer || ctx.disclaimer)}</p>` : ''}</div></footer>`,
  },
};

// Todo bloco aceita uma âncora (id) para links "#ancora" do menu.
for (const b of Object.values(BLOCKS)) b.fields.push(F.text('anchor', 'Âncora para links # (ex.: duvidas)'));
const ANCHOR = /^[a-z][a-z0-9-]{0,39}$/;

export const BLOCK_TYPES = Object.keys(BLOCKS);

/** Esquema dos blocos para o editor (sem as funções). */
export const blockSchema = () => Object.fromEntries(Object.entries(BLOCKS).map(([k, b]) => [k, { label: b.label, fields: b.fields }]));

/** Valida e limpa uma lista de blocos vinda do editor: tipo conhecido, props só com os campos do esquema, textos com limite. */
export function cleanBlocks(blocks) {
  if (!Array.isArray(blocks)) throw new Error('blocos devem ser uma lista');
  if (blocks.length > 60) throw new Error('no máximo 60 blocos por página');
  const cleanVal = (field, v) => {
    if (field.t === 'list') return list(v).slice(0, 40).map((item) => Object.fromEntries(field.of.map((f) => [f.k, cleanVal(f, item?.[f.k])])));
    if (field.t === 'checkbox') return Boolean(v);
    if (field.t === 'select') return field.options.includes(v) ? v : field.options[0];
    return String(v ?? '').slice(0, field.t === 'textarea' ? 4000 : 400);
  };
  return blocks.map((b) => {
    const def = BLOCKS[b?.type];
    if (!def) throw new Error(`bloco desconhecido: ${b?.type}`);
    const props = Object.fromEntries(def.fields.map((f) => [f.k, cleanVal(f, b.props?.[f.k])]));
    return { id: String(b.id || Math.random().toString(36).slice(2, 10)).slice(0, 24), type: b.type, props };
  });
}

export function renderBlocks(blocks, ctx) {
  return list(blocks).map((b) => {
    const def = BLOCKS[b.type];
    if (!def) return '';
    try {
      const html = def.render(b.props || {}, ctx);
      const anchor = String(b.props?.anchor || '').trim().toLowerCase();
      if (!ANCHOR.test(anchor)) return html;
      const first = html.match(/^\s*<[a-z]+[^>]*>/i)?.[0] || '';
      return / id="/.test(first) ? html.replace(/ id="[^"]*"/, ` id="${anchor}"`) : html.replace(/^(\s*<[a-z]+)/i, `$1 id="${anchor}"`);
    } catch { return ''; }
  }).join('\n');
}
