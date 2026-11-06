// Mundo "Rack de fichas": pilhas de fichas e ficha-selo com o número do clube; títulos condensados enormes; tudo concreto e físico.
// Pele em public/assets/worlds/rack.css; interação (montar a pilha do PIX) em public/assets/worlds/rack.js.
// As fichas são SVG desenhado aqui, sem <use> entre blocos: cada bloco é independente. As cores das fichas vêm do tema
// (classes rk-c-<cor> no CSS, derivadas de --primary, --accent e --bg), então trocar a paleta no painel troca as fichas junto.
import { esc, safeHref, list, btn, variant, F } from '../block-kit.mjs';

export const world = {
  name: 'Rack de fichas',
  description: 'Pilhas de fichas e ficha-selo com o número do clube; títulos condensados enormes; tudo concreto e físico.',
  fonts: ['Antonio', 'Montserrat'],
  palettes: [
    { id: 'suprema', name: 'Preto e dourado', colors: { mode: 'escuro', bg: '#120e09', surface: '#1c160e', text: '#f1e9dc', muted: '#c3b4a0', primary: '#efa144', primaryText: '#040404', accent: '#f2e4c4', border: '#3a2d1b' } },
    { id: 'sx', name: 'Preto e azul SX', colors: { mode: 'escuro', bg: '#0b0e11', surface: '#131920', text: '#eef3f6', muted: '#a3b3bf', primary: '#39bcff', primaryText: '#03121c', accent: '#e4eef4', border: '#24313c' } },
    { id: 'feltro', name: 'Feltro verde e marfim', colors: { mode: 'escuro', bg: '#0c1d15', surface: '#12281d', text: '#f4eddc', muted: '#bcc5b4', primary: '#dcae57', primaryText: '#16110a', accent: '#efe5cc', border: '#244234' } },
    { id: 'chama', name: 'Preto e laranja chama', colors: { mode: 'escuro', bg: '#0b0908', surface: '#17110d', text: '#f7f1ea', muted: '#bfb1a5', primary: '#f47b20', primaryText: '#150700', accent: '#ffc48a', border: '#3a2618' } },
  ],
};

// ---------- peças comuns ----------
const CORES = ['creme', 'ouro', 'preta', 'cobre', 'marca'];
const cor = (c, i = 0) => (CORES.includes(c) ? c : CORES[i % CORES.length]);
/** Texto com **negrito** (escapa antes de marcar). */
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const richPara = (txt, cls = '') => String(txt ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  .map((p) => `<p${cls ? ` class="${cls}"` : ''}>${rich(p).replace(/\n/g, '<br>')}</p>`).join('');
const num = (v, d, min = 0, max = 100) => { const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };
const r2 = (n) => Math.round(n * 100) / 100;
const okImg = (src) => (src && /^(https?:\/\/|\/)/.test(src) ? src : '');
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const HEADF = [F.text('title', 'Título'), F.area('subtitle', 'Texto de apoio (use **negrito**)')];
const PADRAO_18 = 'Somente maiores de 18 · Jogue com responsabilidade';

const ICO = {
  baixo: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v11M3.5 8.5 8 13l4.5-4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  seta: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h11M8.5 3.5 13 8l-4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  volta: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M14 8H3M7.5 3.5 3 8l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  info: '<svg viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="9.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M11 9.5v6M11 6.2v.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  rabisco: '<svg viewBox="0 0 34 22" aria-hidden="true"><path d="M2 4c6 10 16 14 28 12M24 10l6 6-7 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  sobe: '<svg viewBox="0 0 34 30" aria-hidden="true"><path d="M3 27C6 15 14 7 29 5M22 1.5 29.5 5 24 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  desfaz: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3 2 7l4 4M2.5 7H10a4 4 0 0 1 0 8H8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  zera: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3 3 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
};
const arrowLink = (label, href, ctx, ico) => (label ? `<a class="rk-link" href="${safeHref(href, ctx.base)}" data-cta="${esc(label)}">${esc(label)} ${ICO[ico || (String(href || '').startsWith('#') ? 'baixo' : 'seta')]}</a>` : '');
const selo18 = (txt) => `<p class="rk-18"><svg viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="13.5" fill="none" stroke="currentColor" stroke-width="2"/><text x="15" y="19.6" text-anchor="middle" font-weight="700" font-size="12.5" fill="currentColor">+18</text></svg><span>${esc(txt || PADRAO_18)}</span></p>`;

// ---------- fichas em SVG ----------
const ANG = [0, 60, 120, 180, 240, 300];
/** Face da ficha vista de cima (raio 98): borda com 6 inserções, anel, centro e tracejado. */
const face = (rot = 0) => `<circle class="f" r="98"/><g class="s">${ANG.map((a) => `<rect x="-13" y="-96" width="26" height="23" rx="2" transform="rotate(${a + rot})"/>`).join('')}</g>`
  + '<circle class="r" r="69" fill="none" stroke-width="2.5"/><circle class="c" r="61"/><circle class="d" r="53" fill="none" stroke-width="2" stroke-dasharray="5 6"/>';
/** Ficha vista de cima, inteira. */
const ficha = (c, inner = '', { rot = 0, cls = '' } = {}) => `<svg class="rk-chip rk-c-${c}${cls ? ` ${cls}` : ''}" viewBox="-100 -100 200 200" aria-hidden="true" focusable="false">${face(rot)}${inner}</svg>`;

const MEIA = (13 / 98) * (180 / Math.PI); // meia largura angular de uma inserção, em graus
/** Lateral de uma ficha em perspectiva (elipse de raio vertical ry, espessura h), com as inserções que ficam de frente. */
function lado(ry, h, rot = 0, y0 = 0) {
  const polys = [];
  for (const a0 of ANG) {
    const a = (((a0 + rot) % 360) + 360) % 360;
    const ini = Math.max(90, a - MEIA); const fim = Math.min(270, a + MEIA);
    if (fim - ini < 1) continue;
    const topo = [];
    for (let k = 0; k <= 4; k++) { const f = ((ini + ((fim - ini) * k) / 4) * Math.PI) / 180; topo.push([98 * Math.sin(f), -ry * Math.cos(f) + y0]); }
    const pts = [...topo, ...topo.slice().reverse().map(([x, y]) => [x, y + h])];
    polys.push(`<polygon points="${pts.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ')}"/>`);
  }
  return `<path class="e" d="M-98 ${y0}A98 ${ry} 0 0 0 98 ${y0}L98 ${y0 + h}A98 ${ry} 0 0 1 -98 ${y0 + h}Z"/><g class="s">${polys.join('')}</g>`
    + `<path class="l" d="M-98 ${y0 + h}A98 ${ry} 0 0 0 98 ${y0 + h}" fill="none"/>`;
}
/** Ficha em perspectiva (lateral + face achatada). inner = desenho sobre a face, no sistema da face. */
const isoFicha = (ry, h, rot, y0, inner = '') => `${lado(ry, h, rot, y0)}<g transform="translate(0 ${y0}) scale(1 ${r2(ry / 98)})">${face(rot)}${inner}</g>`;

/** Naipe de espadas desenhado (forma original de y -50 a -14). */
const espada = (t) => `<path class="t" transform="${t}" d="M0 -50C9 -40 21 -35 21 -27c0 6-5 9-10 9-4 0-7-2-8-4l3 8H-6l3-8c-1 2-4 4-8 4-5 0-10-3-10-9 0-8 12-13 21-23Z"/>`;
/** A ficha-selo: face na cor da marca, logo (ou espadas), palavra pequena e o número do clube. */
function selo(p, ctx, cls = '') {
  const numero = String(p.sealNumber ?? '').trim();
  const topo = String(p.sealTop ?? '').trim();
  const fs = numero.length <= 5 ? 33 : numero.length === 6 ? 30 : numero.length === 7 ? 27 : 21;
  const logo = okImg(p.logo);
  const marca = logo ? `<image href="${esc(logo)}" x="-24" y="-50" width="48" height="32" preserveAspectRatio="xMidYMid meet"/>` : espada(topo || numero ? 'translate(0 -6) scale(.8)' : 'translate(0 48) scale(1.5)');
  const inner = `${marca}${topo ? `<text class="t w" y="${numero ? 1 : 10}" text-anchor="middle" font-size="14" letter-spacing="3">${esc(topo.toUpperCase())}</text>` : ''}`
    + `${numero ? `<text class="t n" y="${topo ? 33 : 24}" text-anchor="middle" font-size="${fs}" letter-spacing="1">${esc(numero)}</text>` : ''}`;
  return `<div class="rk-selo ${cls}" aria-hidden="true">${ficha('marca', inner, { rot: 15 })}</div>`;
}
const SELOF = [F.text('sealTop', 'Ficha-selo: palavra pequena (ex.: CLUBE)'), F.text('sealNumber', 'Ficha-selo: número (ex.: {{number}})'), F.url('logo', 'Ficha-selo: logo (URL, opcional)')];

/** O rack: moldura com canais; cada pilha é uma fila de fichas deitadas (tamanho em %). Tamanho 0 = canal vazio (vaga). */
function rack(pilhas, aria, cls = '') {
  const itens = list(pilhas).slice(0, 8);
  const rotulos = itens.map((s) => s.label).filter(Boolean).join(', ');
  return `<div class="rk-rack ${cls}" role="img" aria-label="${esc(aria + (rotulos ? `: ${rotulos}` : ''))}"><div class="rk-rack-in">${itens.map((s, i) => {
    const n = num(s.size, 80);
    if (n === 0) return `<div class="rk-canal is-vaga"><span class="rk-fantasma">${s.label ? `<span class="rk-vaga">${esc(s.label)}</span>` : ''}</span></div>`;
    return `<div class="rk-canal"><span class="rk-fila rk-c-${cor(s.color, i)}" style="--n:${n}%"></span>${s.label ? `<span class="rk-rot">${esc(s.label)}</span>` : ''}</div>`;
  }).join('')}</div></div>`;
}
const PILHAF = F.list('stacks', 'Pilhas de fichas', [F.text('label', 'Rótulo (opcional)'), F.select('color', 'Cor da ficha', CORES), F.text('size', 'Tamanho: % no rack (0 = canal vazio) ou fichas na torre (1 a 14)')]);

/** Torres de fichas empilhadas (vista lateral), uma por pilha, com rótulo embaixo. */
function torres(pilhas, cls = '') {
  const itens = list(pilhas).slice(0, 5);
  if (!itens.length) return '';
  const ry = 34; const h = 22; const passo = 236;
  const qts = itens.map((s) => num(s.size, 8, 1, 14));
  const H = Math.max(...qts) * h + 2 * ry + 20;
  const cols = itens.map((s, i) => {
    let g = '';
    for (let k = 0; k < qts[i]; k++) {
      const y0 = H - 10 - ry - h - k * h;
      g += k === qts[i] - 1 ? isoFicha(ry, h, k % 2 ? 30 : 0, y0) : lado(ry, h, k % 2 ? 30 : 0, y0);
    }
    return `<g class="rk-chip rk-c-${cor(s.color, i)}" transform="translate(${passo * i + passo / 2} 0)">${g}</g>`;
  }).join('');
  const rot = itens.some((s) => s.label);
  return `<div class="rk-torres ${cls}" style="--cols:${itens.length}"><svg viewBox="0 0 ${passo * itens.length} ${H}" aria-hidden="true" focusable="false">${cols}</svg>`
    + `${rot ? `<ul class="rk-torres-rot">${itens.map((s) => `<li>${esc(s.label || '')}</li>`).join('')}</ul>` : ''}</div>`;
}

/** Formulário de lead no padrão do bloco lead_form (o site.js envia e o lead cai no CRM). */
function leadForm(p, ctx) {
  const f = ['email', 'email_nome', 'email_nome_telefone'].includes(p.fields) ? p.fields : 'email';
  const consent = p.consent || 'Concordo em receber contato sobre o clube. Posso sair quando quiser.';
  return `<form class="lead-form rk-form" method="post" action="${esc(ctx.formAction)}" data-success="${esc(p.success || 'Recebemos! Confira seu e-mail: o próximo passo chega por lá.')}">
    <input type="hidden" name="page" value="${esc(ctx.page?.slug || '')}">
    <div class="rk-campos f-${f}">
      ${f.includes('nome') ? '<label class="rk-campo">Seu nome<input name="name" autocomplete="name" maxlength="80" required></label>' : ''}
      <label class="rk-campo">Seu e-mail<input name="email" type="email" inputmode="email" autocomplete="email" maxlength="120" placeholder="voce@exemplo.com" required></label>
      ${f.includes('telefone') ? '<label class="rk-campo">WhatsApp<input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="(11) 90000-0000"></label>' : ''}
      <button class="btn btn-lg" type="submit">${esc(p.button || 'Quero jogar')}</button>
    </div>
    <label class="check rk-check"><input type="checkbox" name="consent" value="1" required> <span>${esc(consent)}</span></label>
    <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <p class="form-msg" role="status" aria-live="polite"></p>
  </form>`;
}
const comandaDl = (items) => `<dl class="rk-comanda">${list(items).slice(0, 5).map((c) => `<div><dt>${esc(c.label)}</dt><dd>${esc(c.value)}${c.note ? `<small>${esc(c.note)}</small>` : ''}</dd></div>`).join('')}</dl>`;
const cabeca = (p, extra = '') => (p.title || p.subtitle || extra ? `<div class="rk-cabeca">${p.title ? `<h2>${esc(p.title)}</h2>` : ''}${richPara(p.subtitle, 'rk-lead')}${extra}</div>` : '');

// ---------- blocos ----------
export const blocks = {
  rack_topo: {
    label: 'Rack · menu do topo',
    fields: [F.text('brand', 'Nome da marca'), F.text('sub', 'Linha pequena abaixo do nome (ex.: ID {{number}})'), F.url('logo', 'Logo (URL, opcional)'),
      F.list('links', 'Links', [F.text('label', 'Texto'), F.url('href', 'Destino'), F.check('live', 'Mostrar ponto verde (ao vivo)')]),
      F.text('cta', 'Botão'), F.url('ctaHref', 'Destino do botão')],
    render: (p, ctx) => {
      const logo = okImg(p.logo);
      const marca = logo ? `<img class="rk-logo" src="${esc(logo)}" alt="" decoding="async">` : ficha('marca', espada('translate(0 48) scale(1.5)'), { rot: 15, cls: 'rk-marca-ficha' });
      const links = list(p.links);
      return `<header class="rk-topo"><div class="rk-wrap">
        <a class="rk-marca" href="${safeHref('/', ctx.base)}">${marca}<span><strong>${esc(p.brand || ctx.site?.name)}</strong>${p.sub ? `<small>${esc(p.sub)}</small>` : ''}</span></a>
        ${links.length ? `<nav class="rk-menu" aria-label="Menu">${links.map((l) => `<a href="${safeHref(l.href, ctx.base)}"${l.live ? ' class="vivo"' : ''}>${l.live ? '<i aria-hidden="true"></i>' : ''}${esc(l.label)}</a>`).join('')}</nav>` : ''}
        ${btn(p.cta, p.ctaHref, ctx, 'btn btn-sm')}</div></header>`;
    },
  },

  rack_abre: {
    label: 'Rack · primeira tela',
    fields: [F.text('title', 'Título, linha 1'), F.text('title2', 'Título, linha 2 (na cor da marca)'), F.area('tese', 'Frase principal (use **negrito**)'),
      F.area('apoio', 'Texto de apoio'), F.text('cta', 'Botão'), F.url('ctaHref', 'Destino do botão'), F.text('link', 'Link ao lado do botão'), F.url('linkHref', 'Destino do link'),
      F.text('aviso18', 'Linha +18'), ...SELOF, PILHAF, F.text('legend', 'Legenda embaixo das fichas (use **negrito**)'),
      F.select('variant', 'Composição', ['rack', 'selo', 'torre', 'vaga'])],
    render: (p, ctx) => {
      const v = variant(p, ['rack', 'selo', 'torre', 'vaga'], 'rack');
      const h1 = `<h1 class="rk-h1">${p.title ? `<span>${esc(p.title)}</span> ` : ''}${p.title2 ? `<span class="rk-marca-cor">${esc(p.title2)}</span>` : ''}</h1>`;
      const texto = `${p.tese ? `<p class="rk-tese">${rich(p.tese)}</p>` : ''}${p.apoio ? `<p class="rk-apoio">${esc(p.apoio)}</p>` : ''}`;
      const acao = `<div class="rk-acao"><div class="rk-linha">${btn(p.cta, p.ctaHref, ctx, 'btn btn-lg')}${arrowLink(p.link, p.linkHref, ctx)}</div>${selo18(p.aviso18)}</div>`;
      const legenda = p.legend ? `<p class="rk-legenda">${rich(p.legend)}</p>` : '';
      if (v === 'rack') {
        return `<section class="rk rk-abre v-rack"><div class="rk-wrap">${h1}<div class="rk-abre-linha"><div>${texto}</div>${acao}</div></div>
          <div class="rk-wrap rk-palco">${rack(p.stacks, 'Rack de fichas do clube')}${selo(p, ctx, 'rk-selo-rack')}${legenda}</div></section>`;
      }
      if (v === 'selo') {
        return `<section class="rk rk-abre v-selo"><div class="rk-wrap rk-abre-grade"><div class="rk-abre-txt">${h1}${texto}${acao}</div>${selo(p, ctx, 'rk-selo-grande')}</div>
          ${list(p.stacks).length ? `<div class="rk-wrap rk-palco">${rack(p.stacks, 'Rack de fichas', 'rk-rack-baixo')}${legenda}</div>` : ''}</section>`;
      }
      if (v === 'torre') {
        return `<section class="rk rk-abre v-torre"><div class="rk-wrap rk-abre-grade"><div class="rk-abre-txt">${h1}${texto}${acao}</div>
          <div class="rk-abre-arte">${torres(p.stacks)}${legenda}</div></div></section>`;
      }
      // vaga: o rack do grupo com um canal vazio; a ficha-selo vem caindo no canal e a anotação à mão aponta a vaga
      const nota = p.legend ? `<p class="rk-legenda rk-legenda-vaga">${ICO.sobe}<span>${rich(p.legend)}</span></p>` : '';
      return `<section class="rk rk-abre v-vaga"><div class="rk-wrap rk-abre-grade"><div class="rk-abre-txt">${h1}${texto}${acao}</div>
        <div class="rk-abre-arte"><div class="rk-vaga-palco">${rack(p.stacks, 'Rack do grupo com um canal vazio', 'rk-rack-vaga')}${selo(p, ctx, 'rk-selo-vaga')}</div>${nota}</div></div></section>`;
    },
  },

  rack_passos: {
    label: 'Rack · passos em fichas',
    fields: [...HEADF, F.list('items', 'Passos (cada um é uma ficha)', [F.text('value', 'Na ficha: valor grande (ex.: 2)'), F.text('unit', 'Na ficha: palavra pequena (ex.: MINUTOS)'),
      F.select('color', 'Cor da ficha', CORES), F.text('title', 'Título do passo (use **negrito**)'), F.area('text', 'Texto (use **negrito**)'), F.text('note', 'Anotação à mão (opcional)'), F.url('noteHref', 'Link da anotação')]),
    F.select('variant', 'Composição', ['pilha', 'horizontal'])],
    render: (p, ctx) => {
      const v = variant(p, ['pilha', 'horizontal'], 'pilha');
      const items = list(p.items).slice(0, 6);
      return `<section class="rk rk-secao rk-passos v-${v}"><div class="rk-wrap">${cabeca(p)}
        <ol class="rk-pilha" style="--n:${items.length || 1}">${items.map((it, i) => {
          const c = cor(it.color, i);
          const val = String(it.value || '').trim();
          const fs = val.length <= 2 ? 58 : val.length <= 3 ? 52 : val.length <= 5 ? 40 : 30;
          const inner = `<g class="t" font-weight="700" text-anchor="middle">${val ? `<text y="${it.unit ? 16 : 20}" font-size="${fs}">${esc(val)}</text>` : ''}${it.unit ? `<text y="${val ? 44 : 10}" font-size="${String(it.unit).length > 10 ? 11.5 : String(it.unit).length > 8 ? 13 : 15}" letter-spacing="${String(it.unit).length > 8 ? 1 : 1.5}">${esc(String(it.unit).toUpperCase())}</text>` : ''}</g>`;
          const svg = `<svg class="rk-iso rk-chip rk-c-${c}" viewBox="-104 -56 208 134" aria-hidden="true" focusable="false">${isoFicha(49, 22, 15, 0, inner)}</svg>`;
          const nota = it.note ? `<p class="rk-rabisco">${ICO.rabisco}${it.noteHref ? `<a href="${safeHref(it.noteHref, ctx.base)}">${esc(it.note)}</a>` : `<span>${esc(it.note)}</span>`}</p>` : '';
          return `<li class="rk-passo">${svg}<div class="rk-passo-txt">${it.title ? `<h3>${rich(it.title)}</h3>` : ''}${richPara(it.text)}${nota}</div></li>`;
        }).join('')}</ol></div></section>`;
    },
  },

  rack_caixa: {
    label: 'Rack · monte a pilha do PIX (interativo)',
    fields: [F.text('title', 'Título'), F.area('text', 'Texto'), F.area('aviso', 'Aviso (deixe claro que é só ilustração)'), F.text('values', 'Valores das fichas, separados por vírgula (até 4)'),
      F.text('currency', 'Moeda (ex.: R$)'), F.text('comandaTitle', 'Título da comanda'), F.list('comanda', 'Comanda: o que ter à mão', [F.text('label', 'Rótulo'), F.text('value', 'Valor'), F.text('note', 'Nota pequena')]),
      F.text('cta', 'Botão'), F.url('ctaHref', 'Destino do botão'), F.text('note', 'Linha +18 ao lado do botão')],
    render: (p, ctx) => {
      const vals = String(p.values || '20, 50, 100, 200').split(/[,;\s]+/).map((x) => num(x, 0, 0, 99999)).filter((x) => x > 0).slice(0, 4);
      const moeda = esc(p.currency || 'R$');
      const cores = ['creme', 'ouro', 'preta', 'cobre'];
      const larg = 480 / Math.max(vals.length, 1);
      const fsv = (v) => (String(v).length <= 3 ? 50 : String(v).length === 4 ? 40 : 32);
      return `<section class="rk rk-secao rk-caixa" data-rk-caixa data-moeda="${moeda}"><div class="rk-wrap rk-caixa-grade">
        <div>
          ${p.title ? `<h2>${esc(p.title)}</h2>` : ''}${richPara(p.text, 'rk-lead')}
          ${p.aviso ? `<p class="rk-aviso">${ICO.info}<span>${esc(p.aviso)}</span></p>` : ''}
          <div class="rk-fichas-botoes" role="group" aria-label="Fichas para somar ao exemplo" style="--n:${vals.length}">${vals.map((v, i) => `<button class="rk-ficha-btn" type="button" data-v="${v}" aria-label="Adicionar ficha de ${moeda} ${v}">${ficha(cores[i], `<text class="t" y="${Math.round(fsv(v) / 3)}" text-anchor="middle" font-weight="700" font-size="${fsv(v)}">${v}</text>`, { rot: i % 2 ? 30 : 0 })}<span>${moeda} ${v}</span></button>`).join('')}</div>
          <div class="rk-controles"><button class="rk-btn-texto" type="button" data-acao="tirar" disabled>${ICO.desfaz}Tirar a última</button><button class="rk-btn-texto" type="button" data-acao="zerar" disabled>${ICO.zera}Zerar a pilha</button></div>
        </div>
        <div class="rk-mesa">
          <div class="rk-bandeja"><svg viewBox="0 64 480 232" aria-hidden="true" focusable="false">
            <rect class="rk-bandeja-borda" x="8" y="250" width="464" height="40" rx="12"/><rect class="rk-bandeja-sulco" x="16" y="256" width="448" height="8" rx="4"/>
            ${vals.map((v, i) => `<g class="rk-chip rk-c-${cores[i]}" data-col="${v}" data-x="${r2(larg * (i + 0.5))}"></g>`).join('')}
            <g class="rk-bandeja-rot" text-anchor="middle">${vals.map((v, i) => `<text x="${r2(larg * (i + 0.5))}" y="283">${moeda} ${v}</text>`).join('')}</g>
          </svg><p class="rk-vazio">Toque numa ficha para começar a pilha.</p></div>
          <div class="rk-total"><div><p class="rk-total-rot">Total do exemplo</p><p class="rk-total-num" data-total>${moeda} 0</p></div><p class="rk-qtd" data-qtd>nenhuma ficha</p></div>
          <p class="rk-sr" aria-live="polite" data-anuncio></p>
          ${list(p.comanda).length ? `${p.comandaTitle ? `<p class="rk-comanda-tit">${esc(p.comandaTitle)}</p>` : ''}${comandaDl(p.comanda)}` : ''}
          <div class="rk-caixa-acao">${btn(p.cta, p.ctaHref, ctx, 'btn btn-lg')}${selo18(p.note)}</div>
        </div></div></section>`;
    },
  },

  rack_grade: {
    label: 'Rack · grade de torneios',
    fields: [...HEADF, F.text('date', 'Linha da data (ex.: horários de Brasília)'),
      F.list('chips', 'Modalidades (fichas pequenas)', [F.text('label', 'Nome'), F.select('color', 'Cor', CORES)]),
      F.list('items', 'Torneios', [F.text('day', 'Dia (opcional)'), F.text('time', 'Hora'), F.text('name', 'Nome'), F.text('detail', 'Formato'), F.text('buyin', 'Buy-in'), F.text('prize', 'Garantido')]),
      F.check('example', 'É grade de exemplo (mostra o carimbo EXEMPLO)'), F.area('exampleNote', 'Aviso da grade de exemplo'),
      F.text('cta', 'Botão'), F.url('ctaHref', 'Destino do botão'), F.text('link', 'Link'), F.url('linkHref', 'Destino do link'), F.text('aviso18', 'Linha +18'),
      F.select('variant', 'Composição', ['secao', 'capa'])],
    render: (p, ctx) => {
      const v = variant(p, ['secao', 'capa'], 'secao');
      const items = list(p.items);
      const comDia = items.some((i) => i.day);
      const H = v === 'capa' ? 'h1' : 'h2';
      return `<section class="rk ${v === 'capa' ? 'rk-capa' : 'rk-secao'} rk-grade v-${v}"><div class="rk-wrap">
        <div class="rk-grade-cab"><div>${p.title ? `<${H}${v === 'capa' ? ' class="rk-h1"' : ''}>${esc(p.title)}</${H}>` : ''}${richPara(p.subtitle, 'rk-lead')}</div>${p.example ? '<p class="rk-carimbo">Grade de exemplo</p>' : ''}</div>
        ${list(p.chips).length ? `<ul class="rk-jogos" aria-label="Modalidades">${list(p.chips).map((c, i) => `<li>${ficha(cor(c.color, i), '', { rot: 15 })}${esc(c.label)}</li>`).join('')}</ul>` : ''}
        ${p.date ? `<p class="rk-grade-data">${esc(p.date)}</p>` : ''}
        <table class="rk-tabela${comDia ? ' com-dia' : ''}"><caption class="rk-sr">${esc(p.title || 'Grade de torneios')}${p.example ? ' (exemplo)' : ''}</caption>
          <thead><tr>${comDia ? '<th scope="col">Dia</th>' : ''}<th scope="col">Hora</th><th scope="col">Torneio</th><th scope="col" class="d">Buy-in</th><th scope="col" class="d">Garantido</th></tr></thead>
          <tbody>${items.map((i) => `<tr>${comDia ? `<td class="dia">${esc(i.day)}</td>` : ''}<td class="hora">${esc(i.time)}</td><td class="nome">${esc(i.name)}${i.detail ? `<small>${esc(i.detail)}</small>` : ''}</td><td class="din buy" data-r="buy-in">${esc(i.buyin)}</td><td class="din gar" data-r="gar.">${esc(i.prize)}</td></tr>`).join('')}</tbody></table>
        ${p.example && p.exampleNote ? `<p class="rk-aviso rk-aviso-grade">${ICO.info}<span>${esc(p.exampleNote)}</span></p>` : ''}
        ${p.cta || p.link || v === 'capa' || p.aviso18 ? `<div class="rk-grade-pe">${btn(p.cta, p.ctaHref, ctx, 'btn btn-lg')}${arrowLink(p.link, p.linkHref, ctx)}${v === 'capa' || p.aviso18 ? selo18(p.aviso18) : ''}</div>` : ''}
      </div></section>`;
    },
  },

  rack_fatos: {
    label: 'Rack · fatos ou glossário',
    fields: [...HEADF, F.list('items', 'Itens', [F.text('term', 'Termo grande (ex.: 24h)'), F.text('title', 'Linha em negrito'), F.area('text', 'Texto (use **negrito**)')]),
      F.text('link', 'Link no fim'), F.url('linkHref', 'Destino do link'), F.select('variant', 'Composição', ['fatos', 'glossario'])],
    render: (p, ctx) => {
      const v = variant(p, ['fatos', 'glossario'], 'fatos');
      return `<section class="rk rk-secao rk-fatos v-${v}"><div class="rk-wrap rk-fatos-grade">${cabeca(p, v === 'fatos' ? arrowLink(p.link, p.linkHref, ctx) : '')}
        <dl class="rk-dl">${list(p.items).map((i) => `<div class="rk-fato"${v === 'glossario' && slug(i.term) ? ` id="${slug(i.term)}"` : ''}><dt>${esc(i.term)}</dt><dd>${i.title ? `<b>${esc(i.title)}</b>` : ''}${i.text ? `<span>${rich(i.text)}</span>` : ''}</dd></div>`).join('')}</dl>
        ${v === 'glossario' && p.link ? `<div class="rk-fatos-pe">${arrowLink(p.link, p.linkHref, ctx)}</div>` : ''}
      </div></section>`;
    },
  },

  rack_rack: {
    label: 'Rack · fileiras com legenda',
    fields: [...HEADF, F.list('items', 'Fileiras', [F.text('label', 'Nome da fileira'), F.select('color', 'Cor da ficha', CORES), F.text('size', 'Tamanho em % (10 a 100)'), F.area('text', 'Legenda (use **negrito**)'), F.url('href', 'Link (opcional)')]),
      F.text('note', 'Nota embaixo (use **negrito**)'), F.text('link', 'Link'), F.url('linkHref', 'Destino do link')],
    render: (p, ctx) => {
      const items = list(p.items).slice(0, 8);
      return `<section class="rk rk-secao rk-fileiras"><div class="rk-wrap">${cabeca(p)}
        <ul class="rk-fileiras-grade" style="--rows:${items.length || 1}"><li class="rk-moldura" aria-hidden="true"></li>${items.map((it, i) => {
          const c = cor(it.color, i);
          const nome = it.href ? `<a href="${safeHref(it.href, ctx.base)}">${esc(it.label)}</a>` : esc(it.label);
          return `<li class="rk-fileira" style="--r:${i + 1}"><span class="rk-canal" aria-hidden="true"><span class="rk-fila rk-c-${c}" style="--n:${num(it.size, 70, 10, 100)}%"></span></span><div class="rk-fileira-txt"><h3>${ficha(c, '', { rot: 15 })}<span>${nome}</span></h3>${richPara(it.text)}</div></li>`;
        }).join('')}</ul>
        ${p.note || p.link ? `<div class="rk-fileiras-pe">${p.note ? `<p>${rich(p.note)}</p>` : ''}${arrowLink(p.link, p.linkHref, ctx)}</div>` : ''}
      </div></section>`;
    },
  },

  rack_comanda: {
    label: 'Rack · comanda (dados para ter à mão)',
    fields: [...HEADF, F.list('items', 'Itens da comanda', [F.text('label', 'Rótulo'), F.text('value', 'Valor grande'), F.text('note', 'Nota pequena')]),
      F.text('cta', 'Botão'), F.url('ctaHref', 'Destino do botão'), F.text('note', 'Linha +18 ao lado do botão'), F.select('variant', 'Composição', ['cartao', 'faixa'])],
    render: (p, ctx) => {
      const v = variant(p, ['cartao', 'faixa'], 'cartao');
      return `<section class="rk rk-secao rk-comanda-sec v-${v}"><div class="rk-wrap rk-comanda-grade">${cabeca(p)}
        <div class="rk-ticket">${comandaDl(p.items)}<div class="rk-caixa-acao">${btn(p.cta, p.ctaHref, ctx, 'btn btn-lg')}${selo18(p.note)}</div></div></div></section>`;
    },
  },

  rack_guias: {
    label: 'Rack · guias (lista de conteúdos)',
    fields: [...HEADF, F.list('items', 'Guias', [F.select('color', 'Cor da ficha', CORES), F.text('tag', 'Assunto'), F.text('title', 'Título'), F.area('text', 'Resumo'), F.url('href', 'Link'), F.text('time', 'Tempo de leitura (ex.: 4 min)')]),
      F.text('link', 'Link no fim'), F.url('linkHref', 'Destino do link'), F.text('aviso18', 'Linha +18'), F.select('variant', 'Composição', ['capa', 'lista'])],
    render: (p, ctx) => {
      const v = variant(p, ['capa', 'lista'], 'capa');
      const items = list(p.items).slice(0, 12);
      const H = v === 'capa' ? 'h1' : 'h2';
      const item = (it, i, grande) => `<li class="rk-guia${grande ? ' is-grande' : ''}"><a href="${safeHref(it.href, ctx.base)}">${ficha(cor(it.color, i), grande ? espada('translate(0 48) scale(1.5)') : '', { rot: i % 2 ? 30 : 0 })}<div>
        ${it.tag || it.time ? `<p class="rk-guia-meta">${esc(it.tag)}${it.tag && it.time ? ' · ' : ''}${esc(it.time)}</p>` : ''}<h3>${esc(it.title)}</h3>${it.text ? `<p>${esc(it.text)}</p>` : ''}</div></a></li>`;
      return `<section class="rk ${v === 'capa' ? 'rk-capa' : 'rk-secao'} rk-guias v-${v}"><div class="rk-wrap">
        <div class="rk-guias-cab">${p.title ? `<${H}${v === 'capa' ? ' class="rk-h1"' : ''}>${esc(p.title)}</${H}>` : ''}${richPara(p.subtitle, 'rk-tese')}${v === 'capa' ? selo18(p.aviso18) : ''}</div>
        <ul class="rk-guias-lista">${items.map((it, i) => item(it, i, v === 'capa' && i === 0)).join('')}</ul>
        ${p.link ? `<div class="rk-guias-pe">${arrowLink(p.link, p.linkHref, ctx)}</div>` : ''}
      </div></section>`;
    },
  },

  rack_pagina: {
    label: 'Rack · cabeçalho de página interna',
    fields: [F.text('title', 'Título'), F.text('title2', 'Segunda linha (na cor da marca, opcional)'), F.area('text', 'Texto de apoio (use **negrito**)'),
      F.text('back', 'Link de volta (ex.: Início)'), F.url('backHref', 'Destino do link de volta'), F.text('aviso18', 'Linha +18'), ...SELOF, PILHAF,
      F.select('variant', 'Composição', ['selo', 'faixa'])],
    render: (p, ctx) => {
      const v = variant(p, ['selo', 'faixa'], 'selo');
      const volta = p.back ? `<a class="rk-volta" href="${safeHref(p.backHref || '/', ctx.base)}">${ICO.volta}${esc(p.back)}</a>` : '';
      const temSelo = v === 'selo' && (String(p.sealNumber ?? '').trim() || String(p.sealTop ?? '').trim());
      return `<section class="rk rk-pagina v-${v}"><div class="rk-wrap rk-pagina-grade"><div class="rk-pagina-txt">${volta}
        <h1 class="rk-h1 rk-h1-int"><span>${esc(p.title)}</span>${p.title2 ? ` <span class="rk-marca-cor">${esc(p.title2)}</span>` : ''}</h1>
        ${richPara(p.text, 'rk-tese')}${selo18(p.aviso18)}</div>${temSelo ? selo(p, ctx, 'rk-selo-pagina') : ''}</div>
        ${v === 'faixa' && list(p.stacks).length ? `<div class="rk-wrap rk-pagina-rack">${rack(p.stacks, 'Fichas', 'rk-rack-fino')}</div>` : ''}</section>`;
    },
  },

  rack_final: {
    label: 'Rack · chamada final com cadastro (vai para o CRM)',
    fields: [F.text('title', 'Título'), F.area('text', 'Texto'), F.select('fields', 'Campos', ['email', 'email_nome', 'email_nome_telefone']),
      F.text('button', 'Texto do botão'), F.text('success', 'Mensagem de sucesso'), F.area('consent', 'Texto de consentimento'), F.text('note', 'Nota abaixo do formulário (use **negrito**)'),
      F.text('aviso18', 'Linha +18'), ...SELOF, F.select('variant', 'Composição', ['selo', 'torres'])],
    render: (p, ctx) => {
      const v = variant(p, ['selo', 'torres'], 'selo');
      const arte = v === 'selo' ? selo(p, ctx, 'rk-selo-final')
        : `<div class="rk-final-arte" aria-hidden="true">${torres([{ color: 'creme', size: '5' }, { color: 'marca', size: '9' }, { color: 'ouro', size: '7' }])}</div>`;
      return `<section class="rk rk-secao rk-final v-${v}"><div class="rk-wrap rk-final-grade"><div class="rk-final-txt">
        ${p.title ? `<h2>${esc(p.title)}</h2>` : ''}${richPara(p.text, 'rk-lead')}
        ${leadForm(p, ctx)}${p.note ? `<p class="rk-final-nota">${rich(p.note)}</p>` : ''}${selo18(p.aviso18)}</div>${arte}
      </div></section>`;
    },
  },
};
