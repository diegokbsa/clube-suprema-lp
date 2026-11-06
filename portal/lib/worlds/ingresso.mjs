// Mundo "Ingresso de mesa": a página inteira como ingresso/canhoto de mesa. Papel na cor da marca, tinta escura, picote com furos,
// canhoto do jogador, código de barras desenhado a partir do código impresso, campos de formulário impressos e fonte mono.
// Pele em public/assets/worlds/ingresso.css (escopada em body[data-world="ingresso"]); interação "destaca no picote" em ingresso.js.
// Blocos-assinatura abaixo (nome começa por "ingresso_"). Texto aceita **negrito**; tudo passa por esc() e todo link por safeHref().
import { esc, safeHref, list, img, variant, F } from '../block-kit.mjs';

export const world = {
  name: 'Ingresso de mesa',
  description: 'A página inteira como um ingresso de mesa: papel na cor da marca, picote com furos, canhoto do jogador, código de barras e campos impressos em fonte mono. O formulário fica dentro do ingresso e o canhoto se destaca no picote ao enviar.',
  fonts: ['Antonio', 'JetBrains Mono', 'Montserrat', 'Red Hat Mono', 'Big Shoulders Display', 'Hanken Grotesk', 'Saira Condensed', 'Figtree'],
  palettes: [
    { id: 'suprema', name: 'Preto e dourado', colors: { mode: 'escuro', bg: '#0b0906', surface: '#efa144', text: '#f3b662', muted: '#c4a77e', primary: '#efa144', primaryText: '#140f08', accent: '#0e5a32', border: '#3a2c18' } },
    { id: 'sx', name: 'Preto e azul SX', colors: { mode: 'escuro', bg: '#0a0d10', surface: '#39bcff', text: '#bfe9ff', muted: '#8fb1c4', primary: '#39bcff', primaryText: '#04141d', accent: '#0b3d63', border: '#1d2c38' } },
    { id: 'feltro', name: 'Feltro verde e papel creme', colors: { mode: 'escuro', bg: '#0d1a13', surface: '#eadcbc', text: '#eadcbc', muted: '#a9b8a6', primary: '#eadcbc', primaryText: '#13221a', accent: '#a3282a', border: '#21392b' } },
    { id: 'rifa', name: 'Balcão claro e bilhete rosa', colors: { mode: 'claro', bg: '#f3eee4', surface: '#f2a7b6', text: '#1f1a22', muted: '#5b5560', primary: '#f2a7b6', primaryText: '#1f0d16', accent: '#1d3f8f', border: '#d9d0c1' } },
  ],
};

// ---------- utilidades ----------
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const paras = (txt, cls = '') => String(txt ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  .map((p) => `<p${cls ? ` class="${cls}"` : ''}>${rich(p).replace(/\n/g, '<br>')}</p>`).join('');
const lines = (txt) => String(txt ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
let seq = 0;
const uid = () => `ing${(++seq).toString(36)}`;

/** Valor impresso: vazio vira linha em branco para preencher (placeholder sem dado). */
const val = (v, cls = 'ing-val') => (String(v ?? '').trim()
  ? `<span class="${cls}">${esc(v)}</span>`
  : `<span class="${cls}"><span class="ing-vazio" aria-hidden="true"></span><span class="ing-sr">a preencher</span></span>`);

/** Código de barras desenhado: as barras saem do próprio código impresso (mesmo código, mesmas barras). */
function barras(seed, cls = '') {
  let h = 2166136261;
  for (const c of String(seed || 'ingresso')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  h = (h >>> 0) || 1;
  const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return (h % 1000) / 1000; };
  let r = '<rect x="0" width="2" height="60"/><rect x="3" width="1" height="60"/>';
  let x = 6;
  while (x < 186) { const w = 1 + Math.floor(rnd() * 3.4); r += `<rect x="${x}" width="${w}" height="60"/>`; x += w + 1 + Math.floor(rnd() * 2.6); }
  r += `<rect x="${x + 1}" width="1" height="60"/><rect x="${x + 3}" width="2" height="60"/>`;
  return `<svg class="ing-barras ${cls}" viewBox="0 0 ${x + 5} 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">${r}</svg>`;
}

const SETA = '<svg class="ing-seta" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12h15M13 6l6 6-6 6"/></svg>';
const TESOURA = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="6" cy="6.5" r="3"/><circle cx="6" cy="17.5" r="3"/><path d="M8.6 8 21 17.2M8.6 16 21 6.8"/></svg>';
const FICHA = '<svg class="ing-ficha" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><circle cx="16" cy="16" r="13"/><circle cx="16" cy="16" r="6.2"/><path d="M16 3v5.2M16 23.8V29M3 16h5.2M23.8 16H29M6.8 6.8l3.6 3.6M21.6 21.6l3.6 3.6M6.8 25.2l3.6-3.6M21.6 10.4l3.6-3.6"/></svg>';
const VISTO = '<svg class="ing-visto" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m4 10.5 4 4 8-9"/></svg>';

const ICONES = {
  perfil: '<rect x="9" y="3" width="14" height="26" rx="3"/><circle cx="16" cy="12" r="3"/><path d="M11.5 20c1.1-2.2 2.6-3.1 4.5-3.1s3.4.9 4.5 3.1M14 25.5h4"/>',
  cartao: '<rect x="4" y="8" width="24" height="17" rx="2"/><path d="M4 13h24M9 20h7M21 20h2"/>',
  pix: '<path d="M16 3 29 16 16 29 3 16z"/><path d="M11.5 16 16 11.5 20.5 16 16 20.5z"/>',
  link: '<path d="M13.5 18.5a5 5 0 0 0 7 0l4-4a5 5 0 0 0-7-7L16 9"/><path d="M18.5 13.5a5 5 0 0 0-7 0l-4 4a5 5 0 0 0 7 7L16 23"/>',
  chat: '<path d="M5 7h22v14H14l-6 5v-5H5z"/><path d="M10 12.5h12M10 16.5h8"/>',
  relogio: '<circle cx="16" cy="16" r="12"/><path d="M16 9v7l5 3"/>',
  escudo: '<path d="M16 3 26 7v8c0 6.5-4.3 11.3-10 14-5.7-2.7-10-7.5-10-14V7z"/><path d="m11.5 16 3.3 3.3 6-6.3"/>',
  calendario: '<rect x="4" y="7" width="24" height="21" rx="2"/><path d="M4 13h24M10 4v6M22 4v6M9 18h4M15 18h4M9 23h4"/>',
  livro: '<path d="M16 9c-3-2.5-7-3-12-3v19c5 0 9 .5 12 3 3-2.5 7-3 12-3V6c-5 0-9 .5-12 3z"/><path d="M16 9v19"/>',
  trofeu: '<path d="M10 4h12v8a6 6 0 0 1-12 0z"/><path d="M10 7H5a5 5 0 0 0 5 6M22 7h5a5 5 0 0 1-5 6M16 18v5M11 28h10M12.5 23h7v5h-7z"/>',
  megafone: '<path d="M5 13v6h4l11 6V7L9 13z"/><path d="M24 12.5a5 5 0 0 1 0 7M9 19l2 7h3l-1.5-6"/>',
  ficha: '<circle cx="16" cy="16" r="12"/><circle cx="16" cy="16" r="5.5"/><path d="M16 4v4.5M16 23.5V28M4 16h4.5M23.5 16H28"/>',
  saque: '<path d="M5 18v8h22v-8"/><path d="M16 4v15M10.5 13.5 16 19l5.5-5.5"/>',
  equipe: '<circle cx="11" cy="11" r="4"/><circle cx="22" cy="12" r="3.2"/><path d="M4 26c.8-4.6 3.4-7 7-7s6.2 2.4 7 7M18.5 19.6c1-.4 2.1-.6 3.5-.6 3 0 5.2 2 6 6"/>',
  cadeado: '<rect x="7" y="14" width="18" height="14" rx="2"/><path d="M11 14v-4a5 5 0 0 1 10 0v4M16 19v4"/>',
  painel: '<rect x="4" y="5" width="24" height="22" rx="2"/><path d="M4 11h24M9 22v-5M14 22v-8M19 22v-3M24 22v-6"/>',
};
const ICONE_IDS = Object.keys(ICONES);
const icone = (k) => `<svg class="ing-ico" viewBox="0 0 32 32" aria-hidden="true" focusable="false">${ICONES[k] || ICONES.ficha}</svg>`;

const marca = (p, ctx) => `${img(p.logo, '', 'ing-logo') || FICHA}<b>${esc(p.brand || ctx.site.name)}</b>`;

/** Cabeçalho de seção: título forte + texto de apoio (sem chamada pequena acima do título). */
const cab = (p, tag = 'h2') => (p.title || p.intro
  ? `<header class="ing-cab">${p.title ? `<${tag}>${rich(p.title)}</${tag}>` : ''}${p.intro ? `<div class="ing-intro">${paras(p.intro)}</div>` : ''}</header>` : '');

const aBtn = (label, href, ctx, cls = 'ing-btn') => (label
  ? `<a class="${cls}" href="${safeHref(href, ctx.base)}" data-cta="${esc(label)}">${esc(label)} ${SETA}</a>` : '');

const MIUDAS = ['**+18** · Proibido para menores', '**Jogue com responsabilidade**'];
const miudas = (items) => {
  const l = list(items).map((i) => i.text).filter(Boolean);
  return `<p class="ing-miudas">${(l.length ? l : MIUDAS).map((t) => `<span>${rich(t)}</span>`).join('')}</p>`;
};

function carimbo(texto, sub) {
  const t = String(texto || 'INSCRITO');
  return `<div class="ing-carimbo" aria-hidden="true"><svg viewBox="0 0 170 92"><rect x="3" y="3" width="164" height="86" rx="10" fill="none" stroke="currentColor" stroke-width="4"/>`
    + '<rect x="11" y="11" width="148" height="70" rx="5" fill="none" stroke="currentColor" stroke-width="1.6"/>'
    + `<text x="85" y="52" text-anchor="middle" fill="currentColor" class="ing-carimbo-t"${t.length > 8 ? ' textLength="140" lengthAdjust="spacingAndGlyphs"' : ''}>${esc(t)}</text>`
    + `<text x="85" y="70" text-anchor="middle" fill="currentColor" class="ing-carimbo-s" data-carimbo-data data-base="${esc(sub)}">${esc(sub)}</text></svg></div>`;
}

const LINK = [F.text('label', 'Texto'), F.url('href', 'Destino')];

export const blocks = {
  // ---------- topo ----------
  ingresso_topo: {
    label: 'Ingresso · menu do topo',
    fields: [F.text('brand', 'Nome da marca'), F.url('logo', 'Logo (URL)'), F.text('sub', 'Linha impressa sob a marca (ex.: Clube 10001 · +18)'),
      F.list('links', 'Links', [...LINK, F.check('vivo', 'Ponto "ao vivo" ao lado')]), F.text('cta', 'Botão'), F.url('ctaHref', 'Destino do botão')],
    render: (p, ctx) => `<header class="b ing-topo"><div class="wrap">
      <a class="ing-topo-marca" href="${safeHref('/', ctx.base)}" aria-label="${esc(p.brand || ctx.site.name)}, início">${img(p.logo, '', 'ing-logo') || FICHA}<span><b>${esc(p.brand || ctx.site.name)}</b>${p.sub ? `<small>${esc(p.sub)}</small>` : ''}</span></a>
      ${list(p.links).length ? `<nav class="ing-menu" aria-label="Principal">${list(p.links).map((l) => `<a href="${safeHref(l.href, ctx.base)}">${l.vivo ? '<span class="ing-vivo" aria-hidden="true"></span>' : ''}${esc(l.label)}${l.vivo ? '<span class="ing-sr"> (ao vivo)</span>' : ''}</a>`).join('')}</nav>` : ''}
      ${p.cta ? `<a class="ing-btn-papel" href="${safeHref(p.ctaHref, ctx.base)}" data-cta="${esc(p.cta)}">${esc(p.cta)}</a>` : ''}
    </div></header>`,
  },

  // ---------- primeira tela: o ingresso com o formulário dentro ----------
  ingresso_hero: {
    label: 'Ingresso · primeira tela com formulário (vai para o CRM)',
    fields: [F.text('brand', 'Marca impressa no ingresso'), F.url('logo', 'Logo (URL)'), F.text('serie', 'Linha de série no topo do ingresso'),
      F.text('title', 'Título'), F.area('text', 'Texto de apoio (use **negrito**)'), F.text('promessa', 'Frase em destaque'),
      F.list('fixos', 'Campos já impressos (ex.: Clube, Agente)', [F.text('label', 'Rótulo'), F.text('value', 'Valor')]),
      F.select('fields', 'Campos do formulário', ['email', 'email_nome', 'email_nome_telefone']), F.text('emailLabel', 'Rótulo do e-mail'),
      F.text('button', 'Texto do botão'), F.text('success', 'Mensagem de sucesso'), F.area('consent', 'Texto de consentimento'), F.text('help', 'Nota de ajuda sob o formulário'),
      F.list('miudas', 'Letras miúdas (+18, jogo responsável)', [F.text('text', 'Texto (use **negrito**)')]),
      F.text('stubTitle', 'Canhoto · título'), F.text('stubNote', 'Canhoto · validade'), F.text('stubMainLabel', 'Canhoto · rótulo principal'), F.text('stubMainValue', 'Canhoto · valor principal'),
      F.list('stubFields', 'Canhoto · campos', [F.text('label', 'Rótulo'), F.text('value', 'Valor')]),
      F.text('holderLabel', 'Canhoto · rótulo do titular'), F.text('holderEmpty', 'Canhoto · titular antes do envio'), F.text('code', 'Código impresso sob as barras'),
      F.text('cut', 'Texto da tesoura'), F.text('cutDone', 'Texto da tesoura depois do envio'), F.text('stamp', 'Carimbo depois do envio'), F.text('stampSub', 'Linha pequena do carimbo'),
      F.text('nextTitle', 'Depois do envio · título'), F.area('nextText', 'Depois do envio · texto'), F.text('nextCta', 'Depois do envio · botão'), F.url('nextHref', 'Depois do envio · destino'),
      F.select('variant', 'Composição', ['lateral', 'baixo', 'credencial', 'retrato'])],
    render: (p, ctx) => {
      const v = variant(p, ['lateral', 'baixo', 'credencial', 'retrato'], 'lateral');
      const f = p.fields || 'email';
      const u = uid();
      const consent = p.consent || 'Concordo em receber contato sobre o clube. Sou maior de 18 anos.';
      const titulo = `<h1>${rich(p.title)}</h1>`;
      const texto = `<div class="ing-texto">${p.text ? `<div class="ing-lead">${paras(p.text)}</div>` : ''}${p.promessa ? `<p class="ing-promessa">${rich(p.promessa)}</p>` : ''}</div>`;
      const fixos = list(p.fixos).length ? `<div class="ing-fixos" role="group" aria-label="Dados já preenchidos">${list(p.fixos).map((x) => `<div><span class="ing-rot">${esc(x.label)}</span>${val(x.value)}</div>`).join('')}</div>` : '';
      const extra = `${f.includes('nome') ? '<label class="ing-campo"><span class="ing-rot">Seu nome</span><input name="name" autocomplete="name" maxlength="80" required></label>' : ''}${f.includes('telefone') ? '<label class="ing-campo"><span class="ing-rot">WhatsApp</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="(11) 90000-0000"></label>' : ''}`;
      const form = `<form class="lead-form ing-form" method="post" action="${esc(ctx.formAction)}" data-success="${esc(p.success || 'Pronto! Seu canhoto foi destacado.')}">
          <input type="hidden" name="page" value="${esc(ctx.page.slug)}">
          ${fixos}
          ${extra ? `<div class="ing-extra">${extra}</div>` : ''}
          <label class="ing-rot" for="${u}-email">${esc(p.emailLabel || 'Seu e-mail')}</label>
          <div class="ing-envio"><input id="${u}-email" name="email" type="email" inputmode="email" autocomplete="email" spellcheck="false" maxlength="120" placeholder="nome@gmail.com" required${p.help ? ` aria-describedby="${u}-ajuda"` : ''}>
          <button class="ing-btn" type="submit">${esc(p.button || 'Quero jogar')} ${SETA}</button></div>
          <label class="ing-aceite"><input type="checkbox" name="consent" value="1" required><span>${esc(consent)}</span></label>
          <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
          <div class="ing-form-pe"><p class="form-msg" role="status" aria-live="polite"></p>${p.help ? `<p class="ing-ajuda" id="${u}-ajuda">${rich(p.help)}</p>` : ''}</div>
        </form>`;
      const proximo = `<div class="ing-proximo" data-proximo hidden>
          <h2 tabindex="-1">${rich(p.nextTitle || 'Canhoto destacado. Agora, o passo 2.')}</h2>
          ${paras(p.nextText)}
          ${aBtn(p.nextCta, p.nextHref, ctx)}
          <p class="ing-nota"><button type="button" data-refazer>Trocar o e-mail</button></p>
        </div>`;
      const canhoto = `<aside class="ing-canhoto ing-papel" aria-label="${esc(p.stubTitle || 'Canhoto do jogador')}">
          <div class="ing-topo-canhoto"><b>${esc(p.stubTitle || 'Canhoto do jogador')}</b>${p.stubNote ? `<span class="ing-rot">${esc(p.stubNote)}</span>` : ''}</div>
          ${p.stubMainLabel || p.stubMainValue ? `<div class="ing-mesa"><span class="ing-rot">${esc(p.stubMainLabel)}</span>${val(p.stubMainValue)}</div>` : ''}
          ${list(p.stubFields).map((x) => `<div class="ing-cc"><span class="ing-rot">${esc(x.label)}</span>${val(x.value)}</div>`).join('')}
          <div class="ing-titular"><span class="ing-rot">${esc(p.holderLabel || 'Titular')}</span><span class="ing-val" data-titular data-vazio="${esc(p.holderEmpty || 'seu e-mail aqui')}">${esc(p.holderEmpty || 'seu e-mail aqui')}</span></div>
          <div class="ing-barras-box">${barras(p.code)}${p.code ? `<span class="ing-codigo" aria-hidden="true">${esc(p.code)}</span>` : ''}</div>
          <div class="ing-tesoura">${TESOURA}<span class="ing-tesoura-t"><span data-tesoura-antes>${esc(p.cut || 'Destaca no picote ao enviar')}</span><span data-tesoura-depois>${esc(p.cutDone || 'Destacado. Guarde o canhoto.')}</span></span></div>
          ${carimbo(p.stamp, p.stampSub)}
        </aside>`;
      return `<section class="b ing-palco v-${v}"><div class="wrap">
        ${v === 'retrato' ? `<div class="ing-retrato">${titulo}${texto}</div>` : ''}
        <article class="ing-ticket" data-ticket>
          <div class="ing-corpo ing-papel">
            <div class="ing-cabeca"><span class="ing-marca">${marca(p, ctx)}</span>${p.serie ? `<span class="ing-serie">${esc(p.serie)}</span>` : ''}</div>
            ${v === 'retrato' ? '' : titulo}
            <div class="ing-miolo">${v === 'retrato' ? '' : texto}<div class="ing-zona">${form}${proximo}</div></div>
            ${miudas(p.miudas)}
          </div>
          ${canhoto}
        </article>
      </div></section>`;
    },
  },

  // ---------- cabeçalho de página interna ----------
  ingresso_cabecalho: {
    label: 'Ingresso · cabeçalho de página interna',
    fields: [F.text('serie', 'Linha de série (impressa no bilhete)'), F.text('title', 'Título da página'), F.area('text', 'Texto de apoio (use **negrito**)'),
      F.list('campos', 'Campos impressos', [F.text('label', 'Rótulo'), F.text('value', 'Valor')]), F.text('code', 'Código impresso'),
      F.text('miudas', 'Letras miúdas (ex.: +18 · Jogue com responsabilidade)'), F.select('variant', 'Composição', ['bilhete', 'faixa'])],
    render: (p) => {
      const v = variant(p, ['bilhete', 'faixa'], 'bilhete');
      const campos = list(p.campos);
      if (v === 'faixa') {
        return `<section class="b ing-cabecalho v-faixa"><div class="wrap">
          <h1>${rich(p.title)}</h1>${p.text ? `<div class="ing-intro">${paras(p.text)}</div>` : ''}
          ${campos.length || p.code ? `<ul class="ing-picotes">${campos.map((c) => `<li class="ing-papel"><span class="ing-rot">${esc(c.label)}</span>${val(c.value)}</li>`).join('')}${p.code ? `<li class="ing-papel ing-picote-barras">${barras(p.code)}<span class="ing-codigo" aria-hidden="true">${esc(p.code)}</span></li>` : ''}</ul>` : ''}
          ${p.miudas ? `<p class="ing-miudas-fundo">${rich(p.miudas)}</p>` : ''}
        </div></section>`;
      }
      return `<section class="b ing-cabecalho v-bilhete"><div class="wrap"><div class="ing-bilhete ing-papel">
        <div class="ing-cabeca">${p.serie ? `<span class="ing-serie">${esc(p.serie)}</span>` : '<span></span>'}${p.code ? `<span class="ing-serie">${esc(p.code)}</span>` : ''}</div>
        <div class="ing-bilhete-miolo">
          <div><h1>${rich(p.title)}</h1>${p.text ? `<div class="ing-lead">${paras(p.text)}</div>` : ''}</div>
          ${campos.length || p.code ? `<div class="ing-bilhete-lado">${campos.length ? `<dl class="ing-campos">${campos.map((c) => `<div><dt class="ing-rot">${esc(c.label)}</dt><dd>${val(c.value)}</dd></div>`).join('')}</dl>` : ''}${p.code ? barras(p.code) : ''}</div>` : ''}
        </div>
        ${p.miudas ? `<p class="ing-miudas"><span>${rich(p.miudas)}</span></p>` : ''}
      </div></div></section>`;
    },
  },

  // ---------- tira de canhotos (passo a passo) ----------
  ingresso_tira: {
    label: 'Ingresso · tira de canhotos (passo a passo)',
    fields: [F.text('title', 'Título'), F.area('intro', 'Texto de apoio (use **negrito**)'),
      F.list('items', 'Canhotos', [F.text('rot', 'Rótulo impresso (ex.: Canhoto 1 de 3 · leva)'), F.text('numero', 'Número grande (ex.: 10)'), F.text('unidade', 'Unidade (ex.: s, min)'),
        F.text('title', 'Título'), F.area('text', 'Texto'), F.text('nota', 'Nota menor'), F.text('impresso', 'Linha impressa (separe as partes com |)')])],
    render: (p) => `<section class="b ing-sec"><div class="wrap">${cab(p)}
      <ol class="ing-tira" style="--qtd:${Math.max(1, Math.min(4, list(p.items).length))}">${list(p.items).map((i) => `<li class="ing-papel">
        <div class="ing-linha-dado"><span class="ing-rot">${esc(i.rot)}</span>${i.numero ? `<span class="ing-numero">${esc(i.numero)}${i.unidade ? `<small>${esc(i.unidade)}</small>` : ''}</span>` : ''}</div>
        <h3>${rich(i.title)}</h3>${paras(i.text)}${i.nota ? `<p class="ing-nota-tira">${rich(i.nota)}</p>` : ''}
        ${i.impresso ? `<div class="ing-impresso">${String(i.impresso).split('|').map((s) => `<span>${rich(s.trim())}</span>`).join('')}</div>` : ''}
      </li>`).join('')}</ol></div></section>`,
  },

  // ---------- roteiro + comprovante ----------
  ingresso_recibo: {
    label: 'Ingresso · roteiro e comprovante (o que informar)',
    fields: [F.text('title', 'Título'), F.area('intro', 'Texto de apoio'),
      F.list('steps', 'Roteiro', [F.select('icon', 'Ícone', ICONE_IDS), F.text('title', 'Título'), F.area('text', 'Texto')]),
      F.text('cta', 'Botão'), F.url('ctaHref', 'Destino do botão'),
      F.text('reciboTitulo', 'Comprovante · título'), F.text('reciboSub', 'Comprovante · subtítulo'),
      F.list('linhas', 'Comprovante · linhas', [F.text('dt', 'Item'), F.text('dd', 'Valor (vazio = linha para preencher)'), F.text('nota', 'Nota sob a linha')]),
      F.area('rodape', 'Comprovante · rodapé (uma linha por item, use **negrito**)'), F.text('code', 'Comprovante · código das barras'),
      F.select('variant', 'Composição', ['recibo-direita', 'recibo-esquerda'])],
    render: (p, ctx) => {
      const v = variant(p, ['recibo-direita', 'recibo-esquerda'], 'recibo-direita');
      return `<section class="b ing-sec ing-pix v-${v}"><div class="wrap"><div class="ing-pix-grade">
        <div class="ing-pix-texto">${cab(p)}
          ${list(p.steps).length ? `<ol class="ing-roteiro">${list(p.steps).map((s) => `<li>${icone(s.icon)}<div><strong>${rich(s.title)}</strong>${paras(s.text)}</div></li>`).join('')}</ol>` : ''}
          ${aBtn(p.cta, p.ctaHref, ctx, 'ing-btn-contorno')}
        </div>
        <div class="ing-recibo ing-papel" role="group" aria-label="${esc(p.reciboTitulo || 'Comprovante')}">
          <p class="ing-recibo-t">${esc(p.reciboTitulo || 'Comprovante')}</p>${p.reciboSub ? `<p class="ing-recibo-s">${esc(p.reciboSub)}</p>` : ''}
          <hr>
          <ul class="ing-linhas">${list(p.linhas).map((l) => `<li class="ing-item"><span class="ing-dt">${esc(l.dt)}</span><span class="ing-pontos" aria-hidden="true"></span><span class="ing-dd">${String(l.dd || '').trim() ? esc(l.dd) : '<span class="ing-vazio" aria-hidden="true"></span><span class="ing-sr">o seu</span>'}</span></li>${l.nota ? `<li class="ing-nota-item">${esc(l.nota)}</li>` : ''}`).join('')}</ul>
          ${p.rodape ? `<hr><p class="ing-rodape-recibo">${lines(p.rodape).map(rich).join('<br>')}</p>` : ''}
          ${barras(p.code || p.reciboTitulo)}
        </div>
      </div></div></section>`;
    },
  },

  // ---------- fita de bilhetes (torneios, agenda) ----------
  ingresso_fita: {
    label: 'Ingresso · fita de bilhetes (torneios, agenda)',
    fields: [F.text('title', 'Título'), F.area('intro', 'Texto de apoio'),
      F.list('tags', 'Modalidades', [F.text('sigla', 'Sigla (ex.: NLH)'), F.text('texto', 'Descrição')]),
      F.text('subtitle', 'Título da grade'), F.text('meta', 'Linha ao lado da grade (data, fonte)'), F.text('metaLink', 'Link ao lado · texto'), F.url('metaHref', 'Link ao lado · destino'),
      F.list('items', 'Bilhetes', [F.text('dia', 'Dia'), F.text('hora', 'Hora'), F.text('nome', 'Nome'), F.text('tipo', 'Formato'), F.text('selo', 'Selo (ex.: Main Event)'),
        F.text('rot1', 'Rótulo 1 (ex.: Buy-in)'), F.text('val1', 'Valor 1'), F.text('rot2', 'Rótulo 2 (ex.: Garantido)'), F.text('val2', 'Valor 2'), F.text('nota', 'Nota do bilhete')]),
      F.check('exemplo', 'Grade de exemplo (mostra o aviso)'), F.text('nota', 'Nota abaixo da grade'), F.text('cta', 'Botão'), F.url('ctaHref', 'Destino do botão'),
      F.select('variant', 'Composição', ['fita', 'grade'])],
    render: (p, ctx) => {
      const v = variant(p, ['fita', 'grade'], 'fita');
      const valores = (i) => (i.rot1 || i.rot2 ? `<span class="ing-valores">${i.rot1 ? `<span class="ing-rot">${esc(i.rot1)}</span><b>${esc(i.val1)}</b>` : ''}${i.rot2 ? `<span class="ing-rot">${esc(i.rot2)}</span><b>${esc(i.val2)}</b>` : ''}</span>` : '');
      const tipo = (i) => `<span class="ing-tipo">${esc(i.tipo)}${i.selo ? ` <span class="ing-me">${esc(i.selo)}</span>` : ''}</span>`;
      const item = (i) => (v === 'grade'
        ? `<li class="ing-bilhete-t"><div class="ing-bt-canhoto ing-papel"><span class="ing-rot">${esc(i.dia)}</span><span class="ing-hora">${esc(i.hora)}</span></div>
            <div class="ing-bt-corpo ing-papel"><span class="ing-nome">${esc(i.nome)}</span>${tipo(i)}${i.nota ? `<span class="ing-bt-nota">${esc(i.nota)}</span>` : ''}${valores(i)}</div></li>`
        : `<li class="ing-papel"><span class="ing-hora">${esc(i.hora)}</span>${i.dia ? `<span class="ing-rot ing-dia">${esc(i.dia)}</span>` : ''}<span class="ing-nome">${esc(i.nome)}</span>${tipo(i)}${valores(i)}</li>`);
      return `<section class="b ing-sec ing-agenda v-${v}"><div class="wrap">${cab(p)}
        ${list(p.tags).length ? `<ul class="ing-modalidades">${list(p.tags).map((t) => `<li><b>${esc(t.sigla)}</b>${esc(t.texto)}</li>`).join('')}</ul>` : ''}
        ${p.subtitle || p.meta ? `<div class="ing-grade-cab">${p.subtitle ? `<h3>${rich(p.subtitle)}</h3>` : ''}<p>${esc(p.meta)}${p.metaLink ? `<br><a href="${safeHref(p.metaHref, ctx.base)}">${esc(p.metaLink)}</a>` : ''}</p></div>` : ''}
        ${p.exemplo ? '<p class="ing-exemplo"><span>Grade de exemplo</span> Troque pelos torneios reais antes de publicar.</p>' : ''}
        <ol class="ing-fita" style="--qtd:${Math.max(1, Math.min(6, list(p.items).length))}">${list(p.items).map(item).join('')}</ol>
        ${p.nota ? `<p class="ing-fita-nota">${rich(p.nota)}</p>` : ''}
        ${aBtn(p.cta, p.ctaHref, ctx, 'ing-btn-contorno')}
      </div></section>`;
    },
  },

  // ---------- linhas de recibo (por que, fatos) ----------
  ingresso_linhas: {
    label: 'Ingresso · linhas de recibo (fatos, motivos)',
    fields: [F.text('title', 'Título'), F.area('intro', 'Texto de apoio'), F.list('items', 'Linhas', [F.text('k', 'Destaque curto (ex.: 24h, PIX)'), F.area('v', 'Texto (use **negrito**)')])],
    render: (p) => `<section class="b ing-sec"><div class="wrap">${cab(p)}
      <ul class="ing-porque">${list(p.items).map((i) => `<li><span class="ing-k">${esc(i.k)}</span><span class="ing-v">${rich(i.v)}</span></li>`).join('')}</ul></div></section>`,
  },

  // ---------- verso do ingresso (dúvidas) ----------
  ingresso_verso: {
    label: 'Ingresso · verso com dúvidas',
    fields: [F.text('title', 'Título'), F.area('intro', 'Texto de apoio'), F.text('cabEsq', 'Cabeçalho do verso · esquerda (use **negrito**)'), F.text('cabDir', 'Cabeçalho do verso · direita'),
      F.list('items', 'Perguntas', [F.text('q', 'Pergunta'), F.area('a', 'Resposta (use **negrito**)')]), F.text('assina', 'Linha final do verso')],
    render: (p) => `<section class="b ing-sec"><div class="wrap">${cab(p)}
      <div class="ing-verso">
        ${p.cabEsq || p.cabDir ? `<div class="ing-cab-verso"><span>${rich(p.cabEsq)}</span><span>${esc(p.cabDir)}</span></div>` : ''}
        ${list(p.items).map((i) => `<details><summary><span>${esc(i.q)}</span><i class="ing-mais" aria-hidden="true"></i></summary>${paras(i.a)}</details>`).join('')}
        ${p.assina ? `<p class="ing-assina">${rich(p.assina)}</p>` : ''}
      </div></div></section>`,
  },

  // ---------- cláusulas (regras, saque, regulamento) ----------
  ingresso_clausulas: {
    label: 'Ingresso · cláusulas impressas (regras, condições)',
    fields: [F.text('title', 'Título'), F.area('intro', 'Texto de apoio'), F.text('cabEsq', 'Cabeçalho · esquerda (use **negrito**)'), F.text('cabDir', 'Cabeçalho · direita'),
      F.text('prefixo', 'Prefixo de cada item (ex.: Cláusula, Regra)'), F.list('items', 'Itens', [F.text('title', 'Título'), F.area('text', 'Texto (use **negrito**)')]), F.text('assina', 'Linha final')],
    render: (p) => `<section class="b ing-sec"><div class="wrap">${cab(p)}
      <div class="ing-clausulas">
        ${p.cabEsq || p.cabDir ? `<div class="ing-cab-verso"><span>${rich(p.cabEsq)}</span><span>${esc(p.cabDir)}</span></div>` : ''}
        <ol>${list(p.items).map((i, n) => `<li><h3><span class="ing-rot">${esc(p.prefixo || 'Cláusula')} ${n + 1}</span>${rich(i.title)}</h3>${paras(i.text)}</li>`).join('')}</ol>
        ${p.assina ? `<p class="ing-assina">${rich(p.assina)}</p>` : ''}
      </div></div></section>`,
  },

  // ---------- selo +18 / jogo responsável ----------
  ingresso_selo: {
    label: 'Ingresso · selo +18 e jogo responsável',
    fields: [F.text('selo', 'Texto grande do selo (ex.: +18)'), F.text('aro', 'Texto em volta do selo'), F.text('title', 'Título'), F.area('text', 'Texto (use **negrito**)'),
      F.list('items', 'Combinados', [F.text('text', 'Texto (use **negrito**)')]), F.text('cta', 'Link'), F.url('ctaHref', 'Destino do link'), F.select('variant', 'Composição', ['fundo', 'papel'])],
    render: (p, ctx) => {
      const v = variant(p, ['fundo', 'papel'], 'fundo');
      const u = uid();
      const aro = `${p.aro || 'Jogue com responsabilidade · Proibido para menores'} · `;
      return `<section class="b ing-sec ing-selo-sec v-${v}"><div class="wrap"><div class="ing-selo-caixa${v === 'papel' ? ' ing-papel' : ''}">
        <svg class="ing-selo" viewBox="0 0 220 220" role="img" aria-label="${esc(`${p.selo || '+18'}. ${aro}`)}"><defs><path id="${u}" d="M110 110m-84 0a84 84 0 1 1 168 0a84 84 0 1 1-168 0"/></defs>
          <circle cx="110" cy="110" r="104" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="110" cy="110" r="70" fill="none" stroke="currentColor" stroke-width="2"/>
          <text class="ing-selo-aro" fill="currentColor"><textPath href="#${u}" textLength="520" lengthAdjust="spacingAndGlyphs">${esc(aro.toUpperCase())}</textPath></text>
          <text class="ing-selo-t" x="110" y="132" text-anchor="middle" fill="currentColor">${esc(p.selo || '+18')}</text></svg>
        <div class="ing-selo-texto">${p.title ? `<h2>${rich(p.title)}</h2>` : ''}${paras(p.text)}
          ${list(p.items).length ? `<ul class="ing-combinados">${list(p.items).map((i) => `<li>${VISTO}<span>${rich(i.text)}</span></li>`).join('')}</ul>` : ''}
          ${p.cta ? `<a class="ing-link" href="${safeHref(p.ctaHref, ctx.base)}" data-cta="${esc(p.cta)}">${esc(p.cta)} ${SETA}</a>` : ''}
        </div>
      </div></div></section>`;
    },
  },

  // ---------- glossário / termos ----------
  ingresso_termos: {
    label: 'Ingresso · glossário de termos',
    fields: [F.text('title', 'Título'), F.area('intro', 'Texto de apoio'), F.list('items', 'Termos', [F.text('termo', 'Termo'), F.text('sigla', 'Sigla ou classe'), F.area('texto', 'Explicação (use **negrito**)')]),
      F.text('cta', 'Link'), F.url('ctaHref', 'Destino do link'), F.select('variant', 'Composição', ['duas-colunas', 'tres-colunas'])],
    render: (p, ctx) => `<section class="b ing-sec ing-termos-sec v-${variant(p, ['duas-colunas', 'tres-colunas'], 'duas-colunas')}"><div class="wrap">${cab(p)}
      <dl class="ing-termos">${list(p.items).map((i) => `<div><dt><span>${esc(i.termo)}</span>${i.sigla ? `<span class="ing-sigla">${esc(i.sigla)}</span>` : ''}</dt><dd>${paras(i.texto)}</dd></div>`).join('')}</dl>
      ${p.cta ? `<a class="ing-btn-contorno" href="${safeHref(p.ctaHref, ctx.base)}" data-cta="${esc(p.cta)}">${esc(p.cta)} ${SETA}</a>` : ''}
    </div></section>`,
  },

  // ---------- índice de leitura (blog, guias, clubes) ----------
  ingresso_indice: {
    label: 'Ingresso · bilhetes de leitura (guias, links)',
    fields: [F.text('title', 'Título'), F.area('intro', 'Texto de apoio'),
      F.list('items', 'Bilhetes', [F.text('codigo', 'Código impresso (ex.: G-01)'), F.text('tempo', 'Tempo ou destaque (ex.: 6 min)'), F.text('tag', 'Assunto'), F.text('title', 'Título'), F.area('text', 'Resumo'), F.url('href', 'Link'), F.text('acao', 'Texto do link (ex.: Ler o guia)')]),
      F.check('exemplo', 'Itens de exemplo (mostra o aviso)')],
    render: (p, ctx) => `<section class="b ing-sec"><div class="wrap">${cab(p)}
      ${p.exemplo ? '<p class="ing-exemplo"><span>Exemplo</span> Troque pelos itens reais antes de publicar.</p>' : ''}
      <ul class="ing-indice">${list(p.items).map((i) => `<li><a class="ing-leitura" href="${safeHref(i.href, ctx.base)}">
        <span class="ing-le-canhoto ing-papel"><span class="ing-rot">${esc(i.codigo)}</span><b>${esc(i.tempo)}</b></span>
        <span class="ing-le-corpo ing-papel">${i.tag ? `<span class="ing-rot">${esc(i.tag)}</span>` : ''}<span class="ing-le-t">${rich(i.title)}</span>${i.text ? `<span class="ing-le-r">${rich(i.text)}</span>` : ''}<span class="ing-le-a">${esc(i.acao || 'Ler')} ${SETA}</span></span>
      </a></li>`).join('')}</ul></div></section>`,
  },

  // ---------- talão de passes (níveis, perfis) ----------
  ingresso_passes: {
    label: 'Ingresso · talão de passes (níveis, perfis)',
    fields: [F.text('title', 'Título'), F.area('intro', 'Texto de apoio'),
      F.list('items', 'Passes', [F.text('classe', 'Classe (texto curto grande)'), F.text('rot', 'Rótulo da classe'), F.text('nome', 'Nome'), F.area('text', 'Texto'), F.area('lista', 'O que inclui (uma linha por item)'), F.text('nota', 'Nota')]),
      F.check('exemplo', 'Condições de exemplo (mostra o aviso)')],
    render: (p) => `<section class="b ing-sec"><div class="wrap">${cab(p)}
      ${p.exemplo ? '<p class="ing-exemplo"><span>Condições de exemplo</span> Ajuste às condições reais combinadas com o grupo.</p>' : ''}
      <ol class="ing-talao">${list(p.items).map((i) => `<li class="ing-papel">
        <div class="ing-classe"><span class="ing-rot">${esc(i.rot)}</span><b>${esc(i.classe)}</b></div>
        <div class="ing-passe-t"><h3>${rich(i.nome)}</h3>${paras(i.text)}${i.nota ? `<p class="ing-nota-tira">${rich(i.nota)}</p>` : ''}</div>
        ${lines(i.lista).length ? `<ul class="ing-inclui">${lines(i.lista).map((l) => `<li>${VISTO}<span>${rich(l)}</span></li>`).join('')}</ul>` : ''}
      </li>`).join('')}</ol></div></section>`,
  },

  // ---------- chamada final ----------
  ingresso_final: {
    label: 'Ingresso · chamada final',
    fields: [F.text('title', 'Título'), F.area('text', 'Texto (use **negrito**)'), F.text('cta', 'Botão'), F.url('ctaHref', 'Destino do botão'),
      F.text('secondary', 'Link secundário'), F.url('secondaryHref', 'Destino do link secundário'), F.select('variant', 'Composição', ['papel', 'contorno'])],
    render: (p, ctx) => {
      const v = variant(p, ['papel', 'contorno'], 'papel');
      return `<section class="b ing-sec ing-final v-${v}"><div class="wrap"><div class="ing-ultimo${v === 'papel' ? ' ing-papel' : ''}">
        <div><h2>${rich(p.title)}</h2>${paras(p.text)}</div>
        <div class="ing-final-acoes">${aBtn(p.cta, p.ctaHref, ctx, v === 'papel' ? 'ing-btn' : 'ing-btn-papel')}${p.secondary ? `<a class="ing-link" href="${safeHref(p.secondaryHref, ctx.base)}" data-cta="${esc(p.secondary)}">${esc(p.secondary)}</a>` : ''}</div>
      </div></div></section>`;
    },
  },
};
