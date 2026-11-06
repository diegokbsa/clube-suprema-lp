// Mundo "Comprovante PIX": a página inteira fala a língua do app do banco. Valor em destaque, linhas de recibo,
// extrato, "detalhes da transação". O seletor de valor muda o comprovante ao vivo (public/assets/worlds/comprovante.js);
// sem JS o comprovante mostra o valor marcado como padrão. Todo comprovante leva o selo ILUSTRAÇÃO: o PIX de verdade
// é gerado no canal de fichas da operação, nunca no site.
// Pele em public/assets/worlds/comprovante.css (veste também os blocos comuns). Blocos abaixo começam por "comprovante_".
import { esc, safeHref, list, img, variant, F } from '../block-kit.mjs';

export const world = {
  name: 'Comprovante PIX',
  description: 'Interface de comprovante do app do banco: valor em destaque, linhas de recibo, extrato e seletor de valor que muda o comprovante ao vivo.',
  // fontes que a pele usa (todas em FONTS de lib/templates.mjs): texto, números do comprovante e a dupla da paleta clara
  fonts: ['Montserrat', 'Antonio', 'Onest', 'Red Hat Mono'],
  palettes: [
    { id: 'suprema', name: 'Preto e dourado',
      colors: { mode: 'escuro', bg: '#0f0c07', surface: '#16120b', text: '#f4ede1', muted: '#9a8d78', primary: '#efa144', primaryText: '#040404', accent: '#52c48e', border: '#2a2318' } },
    { id: 'sx', name: 'Preto e azul SX',
      colors: { mode: 'escuro', bg: '#0a0d11', surface: '#11161c', text: '#eef3f7', muted: '#8f9daa', primary: '#39bcff', primaryText: '#03121c', accent: '#4fd1a1', border: '#1f2833' } },
    { id: 'papel', name: 'Papel e tinta azul',
      colors: { mode: 'claro', bg: '#f1eee6', surface: '#fffdf8', text: '#16171b', muted: '#5d5f63', primary: '#2340c8', primaryText: '#ffffff', accent: '#157a46', border: '#ddd7ca' } },
  ],
};

// ---------- utilidades do mundo ----------
const ICONS = {
  check: '<circle cx="12" cy="12" r="9"/><path class="cp-traco" d="M8 12.4l2.7 2.7L16.2 9.6"/>',
  seta: '<path d="M5 12h14"/><path d="M13.5 6.5L19 12l-5.5 5.5"/>',
  share: '<path d="M12 3.5v11"/><path d="M8 7.3l4-3.8 4 3.8"/><path d="M6.5 11H6a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 18 11h-.5"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4.5 7l7.5 6 7.5-6"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  ficha: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.2"/><path d="M12 3.5v3.3M12 17.2v3.3M3.5 12h3.3M17.2 12h3.3"/>',
  chat: '<path d="M20 12a7.5 7.5 0 0 1-11 6.6L4.5 20l1.4-4.2A7.5 7.5 0 1 1 20 12z"/>',
  saque: '<path d="M12 4v10"/><path d="M8 10.5l4 4 4-4"/><path d="M5 19.5h14"/>',
  calendario: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  relogio: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  livro: '<path d="M4.5 5.5A2 2 0 0 1 6.5 4H12v15.5H6.5a2 2 0 0 0-2 1.5z"/><path d="M19.5 5.5A2 2 0 0 0 17.5 4H12v15.5h5.5a2 2 0 0 1 2 1.5z"/>',
  escudo: '<path d="M12 3.5l7 2.6v5.6c0 4.3-2.9 7.6-7 8.8-4.1-1.2-7-4.5-7-8.8V6.1z"/><path d="M9 12l2.2 2.2L15.3 10"/>',
  usuario: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c.7-3.7 3.5-5.8 7-5.8s6.3 2.1 7 5.8"/>',
  grupo: '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.5" cy="8" r="2.6"/><path d="M15.5 13.4c2.6-.3 4.6 1.3 5.1 4.6"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"/>',
  pausa: '<circle cx="12" cy="12" r="8.5"/><path d="M10 9v6M14 9v6"/>',
  alvo: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
  trofeu: '<path d="M8 4.5h8v4.5a4 4 0 0 1-8 0z"/><path d="M8 6.5H5.5a2.5 2.5 0 0 0 2.6 3.4M16 6.5h2.5a2.5 2.5 0 0 1-2.6 3.4"/><path d="M12 13v3.5M8.5 19.5h7M10 16.5h4v3h-4z"/>',
  recibo: '<path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>',
};
const ICON_NAMES = Object.keys(ICONS).filter((k) => !['seta', 'share', 'copy', 'menu'].includes(k));
const ico = (name, cls = 'cp-ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ICONS.recibo}</svg>`;

// marca desenhada (comprovante dobrado) para quando a operação não tem logo
const MARK = '<svg class="cp-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M7 3.5h18v25l-3-2-3 2-3-2-3 2-3-2-3 2z" fill="currentColor"/><path d="M11.5 11.5h9M11.5 16h9M11.5 20.5h5" fill="none" stroke="var(--cp-mark-ink)" stroke-width="2.2" stroke-linecap="round"/></svg>';
const brandMark = (logo, alt) => img(logo, alt, 'cp-logo') || MARK;

// texto curto com **negrito** (escapa antes; só o negrito vira tag)
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const richPara = (txt) => String(txt ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  .map((p) => `<p>${rich(p).replace(/\n/g, '<br>')}</p>`).join('');
const idade = '<span class="cp-18">+18</span>';
const resp = `<span class="cp-resp">${idade} Jogue com responsabilidade.</span>`;
const digits = (s) => String(s ?? '').replace(/\D/g, '');
const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(36); };
const link = (label, href, ctx, cls, icon = '') => (label ? `<a class="${cls}" href="${safeHref(href, ctx.base)}" data-cta="${esc(label)}">${esc(label)}${icon}</a>` : '');
const secHead = (p) => (p.title || p.subtitle
  ? `<header class="cp-sec-cab">${p.title ? `<h2>${esc(p.title)}</h2>` : ''}${p.subtitle ? `<div class="cp-sec-txt">${richPara(p.subtitle)}</div>` : ''}</header>` : '');
const ICON_FIELD = (k = 'icon') => F.select(k, 'Ícone', ICON_NAMES);
const TONES = ['ouro', 'ok', 'neutro'];

export const blocks = {
  // ---------------- topo ----------------
  comprovante_topo: {
    label: 'Comprovante · topo com faixa +18',
    fields: [F.text('faixa', 'Faixa de cima (+18)'), F.text('brand', 'Nome da marca'), F.text('sub', 'Linha abaixo do nome (ex.: ID do clube)'), F.url('logo', 'Logo (URL, opcional)'),
      F.list('links', 'Links do menu', [F.text('label', 'Texto'), F.url('href', 'Destino'), F.check('dot', 'Ponto verde de "ao vivo"')]),
      F.text('cta', 'Botão'), F.url('ctaHref', 'Destino do botão')],
    render: (p, ctx) => {
      const links = list(p.links).filter((l) => l.label);
      const a = (l) => `<a href="${safeHref(l.href, ctx.base)}">${l.dot ? '<span class="cp-vivo" aria-hidden="true"></span>' : ''}${esc(l.label)}</a>`;
      return `<header class="b cp-topo">
  <div class="cp-faixa"><div class="wrap">${idade}<span>${esc(p.faixa || 'Somente maiores de 18 anos · Jogue com responsabilidade')}</span></div></div>
  <div class="wrap cp-barra">
    <a class="cp-marca" href="${safeHref('/', ctx.base)}">${brandMark(p.logo, p.brand)}<span><strong>${esc(p.brand || ctx.site.name)}</strong>${p.sub ? `<small>${esc(p.sub)}</small>` : ''}</span></a>
    ${links.length ? `<nav class="cp-menu" aria-label="Menu">${links.map(a).join('')}</nav>` : ''}
    ${link(p.cta, p.ctaHref, ctx, 'btn cp-pagar cp-sm')}
    ${links.length ? `<details class="cp-mmenu"><summary aria-label="Menu">${ico('menu')}</summary><nav aria-label="Menu"><ul>${links.map((l) => `<li>${a(l)}</li>`).join('')}</ul></nav></details>` : ''}
  </div>
</header>`;
    },
  },

  // ---------------- comprovante ao vivo (primeira tela) ----------------
  comprovante_recibo: {
    label: 'Comprovante · comprovante ao vivo com seletor de valor',
    fields: [F.text('title', 'Título (H1)'), F.area('subtitle', 'Texto de apoio (use **negrito**)'),
      F.text('cta', 'Botão principal'), F.url('ctaHref', 'Destino do botão'), F.text('secondary', 'Botão secundário (composições lado e espelho)'), F.url('secondaryHref', 'Destino secundário'),
      F.text('legend', 'Pergunta do seletor'),
      F.list('options', 'Opções do seletor (valores de exemplo)', [F.text('label', 'Texto da opção'), F.text('amount', 'Valor no comprovante (ex.: 50)'), F.text('line', 'Linha extra no comprovante (opcional)'), F.check('padrao', 'Começa marcada')]),
      F.text('selectNote', 'Nota abaixo do seletor'),
      F.url('logo', 'Logo no comprovante (URL, opcional)'), F.text('receiptTitle', 'Título do comprovante'), F.text('receiptSub', 'Linha abaixo do título'),
      F.text('tag', 'Selo (sempre visível; vazio = ILUSTRAÇÃO)'), F.text('amountLabel', 'Rótulo do valor'), F.text('currency', 'Moeda'), F.text('cents', 'Centavos'),
      F.text('status', 'Status (verde)'), F.text('when', 'Quando (comece com "Amanhã" para mostrar a data)'),
      F.list('rows', 'Linhas do comprovante', [F.text('label', 'Rótulo'), F.text('value', 'Valor'), F.text('noteTitle', 'Anotação: título'), F.area('note', 'Anotação: texto')]),
      F.text('txidLabel', 'Rótulo do código'), F.text('txid', 'Código de exemplo (o valor entra no fim)'),
      F.text('ctaNoteTitle', 'Anotação do botão: título'), F.area('ctaNote', 'Anotação do botão: texto'),
      F.text('share', 'Botão compartilhar (vazio esconde)'), F.text('shareText', 'Texto compartilhado'),
      F.text('footStrong', 'Aviso: começo em negrito'), F.area('foot', 'Aviso abaixo do comprovante'),
      F.select('variant', 'Composição', ['palco', 'lado', 'espelho', 'lista'])],
    render: (p, ctx) => {
      const v = variant(p, ['palco', 'lado', 'espelho', 'lista'], 'palco');
      const opts = list(p.options).filter((o) => o.label || o.amount);
      let sel = opts.findIndex((o) => o.padrao);
      if (sel < 0) sel = Math.min(1, opts.length - 1);
      const cur = opts[sel] || { amount: '50', line: '' };
      const rows = list(p.rows).filter((r) => r.label || r.value);
      const notes = rows.map((r, i) => (r.note || r.noteTitle ? { i: String(i), t: r.noteTitle || r.label, n: r.note } : null)).filter(Boolean);
      if (p.ctaNote || p.ctaNoteTitle) notes.push({ i: 'cta', t: p.ctaNoteTitle || p.cta, n: p.ctaNote });
      const pad = (a) => (digits(a) || '0').padStart(3, '0');
      const name = `cp-v-${hash(`${p.title}|${p.receiptTitle}|${opts.length}`)}`;
      const lado = v === 'lado' || v === 'espelho';
      const cur$ = p.currency ?? 'R$';
      return `<section class="b cp-recibo v-${v}" data-cp-recibo>
<div class="wrap cp-grade">
  <div class="cp-cab">
    <h1>${esc(p.title)}</h1>
    ${p.subtitle ? `<p class="cp-lead">${rich(p.subtitle)}</p>` : ''}
    ${lado && (p.cta || p.secondary) ? `<div class="cp-acoes-cab">${link(p.cta, p.ctaHref, ctx, 'btn cp-pagar', ico('seta'))}${link(p.secondary, p.secondaryHref, ctx, 'btn cp-linha-btn')}</div>` : ''}
  </div>
  ${opts.length ? `<fieldset class="cp-sel">
    ${p.legend ? `<legend>${esc(p.legend)}</legend>` : ''}
    <div class="cp-ops">${opts.map((o, i) => `<label class="cp-op"><input type="radio" name="${name}" value="${esc(o.amount)}" data-line="${esc(o.line)}"${i === sel ? ' checked' : ''}><span><i aria-hidden="true"></i><b>${esc(o.label || `${cur$} ${o.amount}`)}</b>${v === 'lista' && o.line ? `<small>${esc(o.line)}</small>` : ''}</span></label>`).join('')}</div>
    ${p.selectNote ? `<p class="cp-sel-nota">${esc(p.selectNote)}</p>` : ''}
  </fieldset>` : ''}
  <article class="cp-comp" aria-label="${esc(p.receiptTitle || 'Comprovante')} (ilustração)">
    <header class="cp-comp-cab">${brandMark(p.logo, '')}<h2>${esc(p.receiptTitle || 'Comprovante')}${p.receiptSub ? `<small>${esc(p.receiptSub)}</small>` : ''}</h2><span class="cp-tag">${esc(p.tag || 'ILUSTRAÇÃO')}</span></header>
    <div class="cp-comp-valor">
      ${p.amountLabel ? `<span class="cp-rot">${esc(p.amountLabel)}</span>` : ''}
      <div class="cp-num-caixa"><span class="cp-num" data-cp-num>${cur$ ? `<span class="cp-moeda">${esc(cur$)}</span>` : ''}<span data-cp-int>${esc(cur.amount)}</span>${p.cents ?? ',00' ? `<span class="cp-cent">${esc(p.cents ?? ',00')}</span>` : ''}</span></div>
      ${p.status ? `<span class="cp-status" data-cp-status>${ico('check')}${esc(p.status)}</span>` : ''}
      ${p.when ? `<span class="cp-quando" data-cp-quando>${esc(p.when)}</span>` : ''}
      <span class="cp-linha-op" data-cp-linha${cur.line ? '' : ' hidden'}>${esc(cur.line)}</span>
    </div>
    <dl class="cp-dados">
      ${rows.map((r, i) => `<div data-cp-row="${i}"><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`).join('')}
      ${p.txid ? `<div><dt>${esc(p.txidLabel || 'Código')}</dt><dd class="cp-txid" data-cp-txid="${esc(p.txid)}">${esc(p.txid)}${pad(cur.amount)}</dd></div>` : ''}
    </dl>
    <div class="cp-comp-acoes${p.share ? '' : ' sem-share'}" data-cp-row="cta">
      ${link(p.cta, p.ctaHref, ctx, 'btn cp-pagar', ico('seta'))}
      ${p.share ? `<button class="btn cp-linha-btn cp-share" type="button" data-cp-share data-text="${esc(p.shareText || p.title)}" aria-label="${esc(p.share)}">${ico('share')}<span>${esc(p.share)}</span></button>` : ''}
    </div>
    <p class="cp-pe"><strong>${esc(p.footStrong || 'É só uma ilustração.')}</strong> ${esc(p.foot)} ${resp}</p>
    <p class="cp-aviso" role="status" aria-live="polite" data-cp-aviso></p>
  </article>
  ${notes.length ? `<ul class="cp-notas" aria-label="Como ler o comprovante">${notes.map((n) => `<li class="cp-nota" data-cp-alvo="${n.i}"><b>${esc(n.t)}</b>${esc(n.n)}</li>`).join('')}</ul>` : ''}
</div>
</section>`;
    },
  },

  // ---------------- extrato (passo a passo, guias, extrato do parceiro) ----------------
  comprovante_extrato: {
    label: 'Comprovante · extrato (lançamentos)',
    fields: [F.text('title', 'Título'), F.area('subtitle', 'Texto (use **negrito**)'), F.text('headLeft', 'Cabeçalho do extrato (esquerda)'), F.text('headRight', 'Cabeçalho do extrato (direita)'),
      F.text('tag', 'Selo no cabeçalho (ex.: EXEMPLO; vazio = sem selo)'),
      F.list('items', 'Lançamentos', [ICON_FIELD(), F.text('title', 'Título'), F.text('time', 'À direita (tempo, valor)'), F.area('text', 'Texto (use **negrito**)'),
        F.text('pill', 'Etiqueta'), F.select('tone', 'Cor da etiqueta', TONES), F.url('href', 'Link (opcional: a linha vira link)')]),
      F.text('totalLabel', 'Rodapé: rótulo'), F.text('total', 'Rodapé: valor'), F.text('cta', 'Botão (opcional)'), F.url('ctaHref', 'Destino do botão'),
      F.select('variant', 'Composição', ['extrato', 'lado', 'guias'])],
    render: (p, ctx) => {
      const v = variant(p, ['extrato', 'lado', 'guias'], 'extrato');
      const item = (i) => {
        const inner = `<span class="cp-lanc-ico">${ico(i.icon)}</span>
        <div class="cp-lanc-topo"><h3>${esc(i.title)}</h3>${i.time ? `<span class="cp-lanc-tempo">${esc(i.time)}</span>` : ''}</div>
        <div class="cp-lanc-txt">${richPara(i.text)}${i.pill ? `<span class="cp-pill t-${TONES.includes(i.tone) ? i.tone : 'ouro'}">${i.tone === 'ok' ? ico('check') : ''}${esc(i.pill)}</span>` : ''}</div>`;
        return i.href ? `<li class="cp-lanc com-link"><a href="${safeHref(i.href, ctx.base)}">${inner}<span class="cp-lanc-ir">${ico('seta')}</span></a></li>` : `<li class="cp-lanc">${inner}</li>`;
      };
      return `<section class="b cp-extrato v-${v}"><div class="wrap cp-ext-grade">
  ${secHead(p)}
  <div class="cp-tela">
    ${p.headLeft || p.headRight || p.tag ? `<div class="cp-tela-cab"><strong>${esc(p.headLeft)}</strong><span>${esc(p.headRight)}${p.tag ? `<span class="cp-tag">${esc(p.tag)}</span>` : ''}</span></div>` : ''}
    <ol class="cp-lancs">${list(p.items).map(item).join('')}</ol>
    ${p.totalLabel || p.total || p.cta ? `<div class="cp-saldo"><div><span>${esc(p.totalLabel)}</span><strong>${esc(p.total)}</strong></div>${link(p.cta, p.ctaHref, ctx, 'btn cp-pagar cp-sm', ico('seta'))}</div>` : ''}
  </div>
</div></section>`;
    },
  },

  // ---------------- comprovante parado (abertura de página ou seção) ----------------
  comprovante_painel: {
    label: 'Comprovante · comprovante parado (abertura ou seção)',
    fields: [F.text('title', 'Título'), F.area('subtitle', 'Texto (use **negrito**)'), F.text('cta', 'Botão principal'), F.url('ctaHref', 'Destino'), F.text('secondary', 'Botão secundário'), F.url('secondaryHref', 'Destino secundário'),
      F.list('points', 'Pontos ao lado (opcional)', [ICON_FIELD(), F.text('text', 'Texto (use **negrito**)')]),
      F.url('logo', 'Logo no comprovante (URL, opcional)'), F.text('panelTitle', 'Título do comprovante'), F.text('panelSub', 'Linha abaixo do título'), F.text('tag', 'Selo (vazio = ILUSTRAÇÃO)'),
      F.text('bigLabel', 'Rótulo do destaque'), F.text('big', 'Destaque (número ou palavra curta)'), F.text('bigSub', 'Status abaixo do destaque'),
      F.list('rows', 'Linhas', [F.text('label', 'Rótulo'), F.text('value', 'Valor'), F.text('detail', 'Detalhe (opcional)')]),
      F.text('totalLabel', 'Total: rótulo'), F.text('total', 'Total: valor'), F.area('panelFoot', 'Aviso abaixo (use **negrito**)'),
      F.select('variant', 'Composição', ['abertura', 'cartaz', 'secao'])],
    render: (p, ctx) => {
      const v = variant(p, ['abertura', 'cartaz', 'secao'], 'abertura');
      const [H, h] = v === 'secao' ? ['h2', 'h3'] : ['h1', 'h2'];
      return `<section class="b cp-painel v-${v}"><div class="wrap cp-painel-grade">
  <div class="cp-cab">
    <${H}>${esc(p.title)}</${H}>
    ${p.subtitle ? `<div class="cp-lead">${richPara(p.subtitle)}</div>` : ''}
    ${list(p.points).length ? `<ul class="cp-pontos">${list(p.points).map((i) => `<li>${ico(i.icon)}<span>${rich(i.text)}</span></li>`).join('')}</ul>` : ''}
    ${p.cta || p.secondary ? `<div class="cp-acoes-cab">${link(p.cta, p.ctaHref, ctx, 'btn cp-pagar', ico('seta'))}${link(p.secondary, p.secondaryHref, ctx, 'btn cp-linha-btn')}</div>` : ''}
  </div>
  <article class="cp-comp" aria-label="${esc(p.panelTitle || 'Comprovante')} (ilustração)">
    <header class="cp-comp-cab">${brandMark(p.logo, '')}<${h}>${esc(p.panelTitle || 'Comprovante')}${p.panelSub ? `<small>${esc(p.panelSub)}</small>` : ''}</${h}><span class="cp-tag">${esc(p.tag || 'ILUSTRAÇÃO')}</span></header>
    ${p.big ? `<div class="cp-comp-valor">${p.bigLabel ? `<span class="cp-rot">${esc(p.bigLabel)}</span>` : ''}<div class="cp-num-caixa"><span class="cp-num">${esc(p.big)}</span></div>${p.bigSub ? `<span class="cp-status">${ico('check')}${esc(p.bigSub)}</span>` : ''}</div>` : ''}
    <dl class="cp-dados">${list(p.rows).map((r) => `<div><dt>${esc(r.label)}</dt><dd>${esc(r.value)}${r.detail ? `<span>${esc(r.detail)}</span>` : ''}</dd></div>`).join('')}</dl>
    ${p.total || p.totalLabel ? `<div class="cp-total"><span>${esc(p.totalLabel)}</span><strong>${esc(p.total)}</strong></div>` : ''}
    <p class="cp-pe">${p.panelFoot ? `${rich(p.panelFoot)} ` : ''}${resp}</p>
  </article>
</div></section>`;
    },
  },

  // ---------------- dados para copiar + passos ----------------
  comprovante_dados: {
    label: 'Comprovante · dados para copiar e passos do PIX',
    fields: [F.text('title', 'Título'), F.area('subtitle', 'Texto (use **negrito**)'),
      F.text('leftTitle', 'Painel 1: título'), F.text('leftMeta', 'Painel 1: à direita'),
      F.list('fields', 'Dados', [F.text('label', 'Rótulo'), F.text('value', 'Valor (vazio = só texto de ajuda)'), F.text('help', 'Ajuda (use **negrito**)'), F.check('copy', 'Botão copiar')]),
      F.text('rightTitle', 'Painel 2: título'), F.text('rightMeta', 'Painel 2: à direita'), F.list('steps', 'Passos (em ordem)', [F.text('text', 'Passo (use **negrito**)')]),
      F.text('noteTitle', 'Nota final: título'), F.area('note', 'Nota final: texto (use **negrito**)'), F.select('noteIcon', 'Nota final: ícone', ICON_NAMES)],
    render: (p) => `<section class="b cp-dados-sec"><div class="wrap">
  ${secHead(p)}
  <div class="cp-duas">
    <div class="cp-tela">
      ${p.leftTitle || p.leftMeta ? `<div class="cp-tela-cab"><strong>${esc(p.leftTitle)}</strong><span>${esc(p.leftMeta)}</span></div>` : ''}
      ${list(p.fields).map((f) => `<div class="cp-campo"><div class="cp-campo-txt"><span>${esc(f.label)}</span>${f.value ? `<strong>${esc(f.value)}</strong>` : ''}${f.help ? `<p>${rich(f.help)}</p>` : ''}</div>
        ${f.copy && f.value ? `<button class="cp-copiar" type="button" data-cp-copiar="${esc(f.value)}" aria-label="Copiar ${esc(f.label)}: ${esc(f.value)}">${ico('copy')}<span>Copiar</span></button>` : ''}</div>`).join('')}
    </div>
    <div class="cp-tela">
      ${p.rightTitle || p.rightMeta ? `<div class="cp-tela-cab"><strong>${esc(p.rightTitle)}</strong><span>${esc(p.rightMeta)}</span></div>` : ''}
      <ol class="cp-passos">${list(p.steps).map((s) => `<li><span>${rich(s.text)}</span></li>`).join('')}</ol>
      ${p.note || p.noteTitle ? `<div class="cp-nota-final">${ico(p.noteIcon || 'check')}<span>${p.noteTitle ? `<b>${esc(p.noteTitle)}</b> ` : ''}${rich(p.note)}</span></div>` : ''}
    </div>
  </div>
</div></section>`,
  },

  // ---------------- linhas de recibo em painéis ----------------
  comprovante_linhas: {
    label: 'Comprovante · linhas de recibo em um ou dois painéis',
    fields: [F.text('title', 'Título'), F.area('subtitle', 'Texto (use **negrito**)'),
      F.text('leftTitle', 'Painel 1: título'), F.list('leftRows', 'Painel 1: linhas', [F.text('label', 'Rótulo'), F.text('value', 'Valor'), F.area('detail', 'Detalhe (use **negrito**)')]),
      F.text('rightTitle', 'Painel 2: título (vazio e sem linhas = um painel só)'), F.list('rightRows', 'Painel 2: linhas', [F.text('label', 'Rótulo'), F.text('value', 'Valor'), F.area('detail', 'Detalhe (use **negrito**)')]),
      F.area('foot', 'Nota abaixo dos painéis (use **negrito**)'), F.select('variant', 'Composição', ['duas', 'lado'])],
    render: (p) => {
      const rowsHtml = (rows) => `<dl class="cp-linhas">${list(rows).map((r) => `<div><dt>${esc(r.label)}</dt><dd>${esc(r.value)}${r.detail ? `<span>${rich(r.detail)}</span>` : ''}</dd></div>`).join('')}</dl>`;
      const two = p.rightTitle || list(p.rightRows).length;
      const v = variant(p, ['duas', 'lado'], 'duas');
      return `<section class="b cp-linhas-sec v-${v}"><div class="wrap cp-ext-grade">
  ${secHead(p)}
  <div class="cp-corpo">
    <div class="${two ? 'cp-duas' : 'cp-uma'}">
      <div class="cp-tela">${p.leftTitle ? `<h3>${esc(p.leftTitle)}</h3>` : ''}${rowsHtml(p.leftRows)}</div>
      ${two ? `<div class="cp-tela">${p.rightTitle ? `<h3>${esc(p.rightTitle)}</h3>` : ''}${rowsHtml(p.rightRows)}</div>` : ''}
    </div>
    ${p.foot ? `<div class="cp-sec-pe">${richPara(p.foot)}</div>` : ''}
  </div>
</div></section>`;
    },
  },

  // ---------------- agenda (agendados do app do banco) ----------------
  comprovante_agenda: {
    label: 'Comprovante · agenda (agendados, grade de exemplo)',
    fields: [F.text('title', 'Título'), F.area('subtitle', 'Texto (use **negrito**)'), F.text('headLeft', 'Cabeçalho (esquerda)'), F.check('live', 'Ponto verde no cabeçalho'), F.text('headRight', 'Cabeçalho (direita)'),
      F.text('tag', 'Selo (vazio = EXEMPLO)'),
      F.list('items', 'Itens', [F.text('day', 'Dia (igual ao anterior = mesmo grupo)'), F.text('time', 'Hora'), F.text('name', 'Nome'), F.text('info', 'Detalhe (formato, buy-in)'), F.text('label', 'Rótulo à direita'), F.text('value', 'Valor à direita')]),
      F.text('foot', 'Rodapé (fonte, aviso)'), F.text('linkLabel', 'Link do rodapé'), F.url('linkHref', 'Destino do link')],
    render: (p, ctx) => {
      let last = null;
      const rows = list(p.items).map((i) => {
        const dia = i.day && i.day !== last ? `<li class="cp-dia">${esc(i.day)}</li>` : '';
        last = i.day || last;
        return `${dia}<li class="cp-ag"><span class="cp-ag-hora">${esc(i.time)}</span><div><div class="cp-ag-nome">${esc(i.name)}</div>${i.info ? `<div class="cp-ag-info">${esc(i.info)}</div>` : ''}</div>${i.value || i.label ? `<div class="cp-ag-dir">${i.label ? `<span>${esc(i.label)}</span>` : ''}<strong>${esc(i.value)}</strong></div>` : '<span></span>'}</li>`;
      }).join('');
      return `<section class="b cp-agenda"><div class="wrap">
  ${secHead(p)}
  <div class="cp-tela">
    <div class="cp-tela-cab"><span class="cp-ao-vivo">${p.live ? '<span class="cp-vivo" aria-hidden="true"></span>' : ''}${esc(p.headLeft)}</span><span>${esc(p.headRight)}<span class="cp-tag">${esc(p.tag || 'EXEMPLO')}</span></span></div>
    <ol class="cp-ags">${rows}</ol>
    ${p.foot || p.linkLabel ? `<div class="cp-ag-pe"><span>${esc(p.foot)}</span>${link(p.linkLabel, p.linkHref, ctx, 'cp-ag-link', ico('seta'))}</div>` : ''}
  </div>
</div></section>`;
    },
  },

  // ---------------- chamada final com resumo ----------------
  comprovante_final: {
    label: 'Comprovante · chamada final com resumo do valor',
    fields: [F.text('title', 'Título'), F.area('text', 'Texto (use **negrito**)'), F.text('label', 'Resumo: rótulo'), F.text('value', 'Resumo: valor (acompanha o seletor da página)'),
      F.text('dest', 'Resumo: destino'), F.text('cta', 'Botão'), F.url('ctaHref', 'Destino do botão'), F.text('supportLabel', 'Link de ajuda'), F.url('supportHref', 'Destino da ajuda')],
    render: (p, ctx) => `<section class="b cp-final"><div class="wrap cp-final-grade">
  <div><h2>${esc(p.title)}</h2>${p.text ? `<div class="cp-lead">${richPara(p.text)}</div>` : ''}</div>
  <div class="cp-resumo">
    ${p.label || p.value ? `<div class="cp-resumo-linha"><span>${esc(p.label)}</span><strong data-cp-resumo>${esc(p.value)}</strong></div>` : ''}
    ${p.dest ? `<p class="cp-resumo-dest">${esc(p.dest)}</p>` : ''}
    ${link(p.cta, p.ctaHref, ctx, 'btn cp-pagar', ico('seta'))}
    <p class="cp-resumo-pe">${resp}${p.supportLabel ? ` <a href="${safeHref(p.supportHref, ctx.base)}" rel="noopener">${esc(p.supportLabel)}</a>` : ''}</p>
  </div>
</div></section>`,
  },

  // ---------------- cabeçalho de página interna ----------------
  comprovante_cabecalho: {
    label: 'Comprovante · cabeçalho de página interna',
    fields: [F.text('title', 'Título (H1)'), F.area('subtitle', 'Texto (use **negrito**)'), F.text('cta', 'Botão'), F.url('ctaHref', 'Destino do botão'), F.text('secondary', 'Botão secundário'), F.url('secondaryHref', 'Destino secundário'),
      F.text('stripTitle', 'Recibo ao lado: título (vazio = sem recibo)'), F.list('strip', 'Recibo ao lado: linhas', [F.text('label', 'Rótulo'), F.text('value', 'Valor')]), F.text('tag', 'Selo do recibo (vazio = sem selo)')],
    render: (p, ctx) => `<section class="b cp-cabecalho${p.stripTitle ? ' com-recibo' : ''}"><div class="wrap cp-cabecalho-grade">
  <div class="cp-cab"><h1>${esc(p.title)}</h1>${p.subtitle ? `<div class="cp-lead">${richPara(p.subtitle)}</div>` : ''}
    ${p.cta || p.secondary ? `<div class="cp-acoes-cab">${link(p.cta, p.ctaHref, ctx, 'btn cp-pagar', ico('seta'))}${link(p.secondary, p.secondaryHref, ctx, 'btn cp-linha-btn')}</div>` : ''}</div>
  ${p.stripTitle ? `<aside class="cp-mini" aria-label="${esc(p.stripTitle)}"><div class="cp-mini-cab"><strong>${esc(p.stripTitle)}</strong>${p.tag ? `<span class="cp-tag">${esc(p.tag)}</span>` : ''}</div>
    <dl class="cp-dados">${list(p.strip).map((r) => `<div><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`).join('')}</dl></aside>` : ''}
</div></section>`,
  },

  // ---------------- canais oficiais (linhas com botão) ----------------
  comprovante_canais: {
    label: 'Comprovante · canais oficiais de atendimento',
    fields: [F.text('title', 'Título'), F.area('subtitle', 'Texto (use **negrito**)'), F.text('headLeft', 'Cabeçalho (esquerda)'), F.check('live', 'Ponto verde no cabeçalho'), F.text('headRight', 'Cabeçalho (direita)'),
      F.list('items', 'Canais', [ICON_FIELD(), F.text('label', 'Canal'), F.text('detail', 'Detalhe'), F.text('cta', 'Botão'), F.url('href', 'Link')]),
      F.area('foot', 'Nota abaixo (use **negrito**)')],
    render: (p, ctx) => `<section class="b cp-canais"><div class="wrap">
  ${secHead(p)}
  <div class="cp-tela cp-uma">
    ${p.headLeft || p.headRight ? `<div class="cp-tela-cab"><span class="cp-ao-vivo">${p.live ? '<span class="cp-vivo" aria-hidden="true"></span>' : ''}${esc(p.headLeft)}</span><span>${esc(p.headRight)}</span></div>` : ''}
    <ul class="cp-canal-lista">${list(p.items).filter((i) => i.label).map((i) => `<li class="cp-canal"><span class="cp-lanc-ico">${ico(i.icon || 'chat')}</span><div><strong>${esc(i.label)}</strong>${i.detail ? `<span>${esc(i.detail)}</span>` : ''}</div>${i.cta ? `<a class="btn cp-linha-btn cp-sm" href="${safeHref(i.href, ctx.base)}" rel="noopener" data-cta="${esc(i.cta)}">${esc(i.cta)}</a>` : ''}</li>`).join('')}</ul>
  </div>
  ${p.foot ? `<div class="cp-sec-pe">${richPara(p.foot)}</div>` : ''}
</div></section>`,
  },
};
