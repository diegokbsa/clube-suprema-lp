// Mundo "Relógio de blinds": painel de torneio. Contagem regressiva gigante para o próximo torneio, níveis, blinds, buy-in,
// garantido e registro tardio numa grade de instrumentos com fios finos, hora de Brasília ao vivo.
// Pele em public/assets/worlds/relogio.css (veste também os blocos comuns); interação em public/assets/worlds/relogio.js
// (lê a grade editável dos atributos data-*; sem JS a página mostra a grade estática). Blocos começam por "relogio_".
import { esc, safeHref, list, btn, variant, F } from '../block-kit.mjs';

export const world = {
  name: 'Relógio de blinds',
  description: 'Painel de torneio: contagem regressiva gigante, níveis, blinds e buy-in em grade de instrumentos com fios finos e hora de Brasília ao vivo.',
  fonts: ['Antonio', 'Montserrat'],
  palettes: [
    { id: 'suprema', name: 'Preto e dourado', colors: { mode: 'escuro', bg: '#15110a', surface: '#040404', text: '#f2e8d6', muted: '#b3a386', primary: '#efa144', primaryText: '#040404', accent: '#f3b662', border: '#3a2f1f' } },
    { id: 'sx', name: 'Preto e azul SX', colors: { mode: 'escuro', bg: '#0b1014', surface: '#030507', text: '#e9f1f6', muted: '#97a9b5', primary: '#39bcff', primaryText: '#03121c', accent: '#8fd6ff', border: '#1f2c36' } },
    { id: 'led', name: 'Grafite e LED vermelho', colors: { mode: 'escuro', bg: '#111314', surface: '#050606', text: '#eef0ec', muted: '#a6aca8', primary: '#ff5b3a', primaryText: '#0c0504', accent: '#ffb199', border: '#2b2f31' } },
  ],
};

/* ---------- ferramentas do mundo ---------- */

/** Texto com **negrito** (depois de escapar: seguro). */
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
/** Parágrafos com **negrito**; linha em branco separa parágrafos. */
const richPara = (txt) => String(txt ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  .map((p) => `<p>${rich(p).replace(/\n/g, '<br>')}</p>`).join('');
const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;
const hora = (s) => (HHMM.test(String(s || '').trim()) ? String(s).trim().padStart(5, '0') : '');

const ICO = {
  copiar: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false"><rect x="5" y="5" width="9" height="9"/><path d="M11 2H2v9"/></svg>',
  seta: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" focusable="false"><path d="M2.5 8h10M8.5 4l4 4-4 4"/></svg>',
};

const r18 = (txt, badge = '+18') => (txt ? `<span class="rl-r18"><b>${esc(badge)}</b>${esc(txt)}</span>` : '');
/** Hora de Brasília ao vivo. Sem JS a hora fica escondida e sobra só o rótulo. */
const vivo = (label, nota = 'horário de Brasília') => `<div class="rl-vivo">
  <span class="rl-rot"><span class="rl-dot" aria-hidden="true"></span>${esc(label || 'Ao vivo')}</span>
  <span class="rl-hora" data-rl-relogio hidden><time data-rl-agora>--:--</time></span>
  ${nota ? `<small data-rl-relogio hidden>${esc(nota)}</small>` : ''}</div>`;
const copiar = (valor, rotulo) => `<button class="rl-copiar" type="button" data-rl-copiar="${esc(valor)}" aria-label="Copiar ${esc(rotulo)}: ${esc(valor)}">${ICO.copiar}<span>Copiar</span></button>`;
/** Valor curto (número, ID) vai em numeral grande; frase vai em texto corrido. */
const curto = (v) => { const s = String(v || '').trim(); return s.length <= 14 && s.split(/\s+/).length <= 2; };

const GRADE_FIELDS = [F.text('time', 'Horário (HH:MM)'), F.text('name', 'Torneio'), F.text('mode', 'Modalidade (ex.: NLH)'),
  F.text('buyin', 'Buy-in'), F.text('guaranteed', 'Garantido'), F.text('stack', 'Stack inicial (ex.: 40K)'), F.text('blinds', 'Minutos por nível'),
  F.text('late', 'Registro tardio até (HH:MM)'), F.text('tag', 'Selo (ex.: Main)')];

/** Grade normalizada e ordenada pelo horário (para o relógio). */
function gradeOrdenada(items) {
  return list(items).filter((t) => hora(t.time) && t.name)
    .map((t) => ({ h: hora(t.time), nome: String(t.name), mod: String(t.mode || ''), buy: String(t.buyin || ''), gar: String(t.guaranteed || ''),
      stack: String(t.stack || ''), bl: String(t.blinds || ''), late: hora(t.late), tag: String(t.tag || '') }))
    .sort((a, b) => a.h.localeCompare(b.h));
}
const blindsTxt = (t) => (t.bl ? `${t.bl} min` : '—');
const blindsNota = (t) => ['por nível', t.stack ? `stack ${t.stack}` : ''].filter(Boolean).join(' · ');
const proxNota = (t) => [t.gar ? `${t.gar} garantido` : '', t.buy ? `buy-in ${t.buy}` : ''].filter(Boolean).join(' · ');

/** Cabeçalho de seção: título grande à esquerda, texto à direita (sem chamada pequena). */
function cab(p) {
  if (!p.title && !p.subtitle) return '';
  return `<header class="rl-cab">${p.title ? `<h2>${esc(p.title)}</h2>` : ''}${p.subtitle ? `<div class="rl-cab-txt">${richPara(p.subtitle)}</div>` : ''}</header>`;
}

/* ---------- peças do monitor ---------- */
const dado = (rot, valor, slot, { cls = '', nota = '', notaSlot = '', extra = '' } = {}) => `<div class="rl-dado">
  <p class="rl-rot">${esc(rot)}</p><p class="v ${cls}" data-rl="${slot}">${esc(valor || '—')}</p>
  ${nota || notaSlot ? `<p class="n"${notaSlot ? ` data-rl="${notaSlot}"` : ''}>${esc(nota)}</p>` : ''}${extra}</div>`;

const relogioGrande = (t0, rotulo) => `<p class="rl-rot rl-ouro" data-rl="rot" data-rot="${esc(rotulo || 'Próximo torneio começa em')}">Próximo torneio às</p>
  <p class="rl-relogio" data-rl="relogio" role="timer" aria-live="off">${esc(t0?.h || '--:--')}</p>`;

const fita = (t0, t1) => `<div class="rl-fita">
  <div><p class="rl-rot">Nível</p><p class="v">1</p><p class="n" data-rl="nivel-n">abre às ${esc(t0?.h || '')}</p></div>
  <div><p class="rl-rot">Blinds</p><p class="v" data-rl="blinds">${esc(t0 ? blindsTxt(t0) : '—')}</p><p class="n" data-rl="blinds-n">${esc(t0 ? blindsNota(t0) : '')}</p></div>
  <div class="prox"><p class="rl-rot">Próximo</p><p class="v" data-rl="prox">${esc(t1 ? `${t1.h} · ${t1.nome}` : '—')}</p><p class="n" data-rl="prox-n">${esc(t1 ? proxNota(t1) : '')}</p></div>
</div>`;

const tagMain = (t0) => `<span class="rl-tag" data-rl="tag"${t0?.tag ? '' : ' hidden'}>${esc(t0?.tag || '')}</span>`;

export const blocks = {
  relogio_monitor: {
    label: 'Relógio de blinds · primeira tela com contagem regressiva',
    fields: [F.text('title', 'Título (H1)'), F.area('subtitle', 'Texto (use **assim** para destacar)'), F.text('live', 'Rótulo ao vivo (ex.: Ao vivo · Suprema Poker)'),
      F.text('countLabel', 'Rótulo da contagem (ex.: Próximo torneio começa em)'),
      F.list('items', 'Grade do relógio (exemplos editáveis)', GRADE_FIELDS),
      F.text('cta', 'Botão'), F.url('ctaHref', 'Destino do botão'), F.text('ctaNote', 'Nota do botão'),
      F.text('source', 'Fonte da grade (ex.: Grade de exemplo, troque pela do seu clube)'), F.text('r18', 'Aviso +18'),
      F.select('variant', 'Composição', ['painel', 'saguao', 'tv'])],
    render: (p, ctx) => {
      const v = variant(p, ['painel', 'saguao', 'tv'], 'painel');
      const g = gradeOrdenada(p.items);
      const t0 = g[0];
      const t1 = g[1] || g[0];
      const data = esc(JSON.stringify(g));
      const head = `<div class="rl-mon-head"><div><h1>${esc(p.title)}</h1>${p.subtitle ? `<p class="rl-sub">${rich(p.subtitle)}</p>` : ''}</div>${vivo(p.live)}</div>`;
      const foot = `<div class="rl-mon-foot"><span data-rl="fonte">${esc(p.source)}</span>${r18(p.r18)}</div>`;
      const acao = `<div class="rl-acao">${btn(p.cta, p.ctaHref, ctx, 'btn btn-lg')}${p.ctaNote ? `<p>${esc(p.ctaNote)}</p>` : ''}</div>`;
      const torneio = dado('Torneio', t0?.nome, 'nome', { cls: 'ouro', nota: t0?.mod || '', notaSlot: 'mod', extra: tagMain(t0) });
      const gar = dado('Garantido', t0?.gar, 'gar');
      const buy = dado('Buy-in', t0?.buy, 'buy');
      const late = dado('Registro tardio', t0?.late ? `até ${t0.late}` : '—', 'late');
      let body;
      if (v === 'saguao') {
        const fila = g.slice(0, 6).map((t) => `<li><span class="h">${esc(t.h)}</span><span class="nm">${esc(t.nome)}<small>${esc([t.mod, t.buy ? `buy-in ${t.buy}` : ''].filter(Boolean).join(' · '))}</small></span><span class="g">${esc(t.gar)}</span></li>`).join('');
        body = `<div class="rl-mon-body">
          <div class="rl-centro">${relogioGrande(t0, p.countLabel)}
            <div class="rl-fita rl-fita-4">
              <div><p class="rl-rot">Torneio</p><p class="v ouro" data-rl="nome">${esc(t0?.nome || '—')}</p><p class="n" data-rl="mod">${esc(t0?.mod || '')}</p></div>
              <div><p class="rl-rot">Garantido</p><p class="v" data-rl="gar">${esc(t0?.gar || '—')}</p></div>
              <div><p class="rl-rot">Buy-in</p><p class="v" data-rl="buy">${esc(t0?.buy || '—')}</p></div>
              <div><p class="rl-rot">Registro tardio</p><p class="v" data-rl="late">${esc(t0?.late ? `até ${t0.late}` : '—')}</p></div>
            </div></div>
          <div class="rl-fila"><p class="rl-rot">Na sequência</p><ol data-rl-fila>${fila}</ol>${acao}</div>
        </div>`;
      } else if (v === 'tv') {
        body = `<div class="rl-mon-body">
          <div class="rl-tv-topo"><p class="rl-rot">Torneio</p><p class="v" data-rl="nome">${esc(t0?.nome || '—')}</p><p class="n" data-rl="mod">${esc(t0?.mod || '')}</p>${tagMain(t0)}</div>
          <div class="rl-esq">${dado('Nível', '1', 'nivel', { nota: `abre às ${t0?.h || ''}`, notaSlot: 'nivel-n' })}${dado('Blinds', t0 ? blindsTxt(t0) : '—', 'blinds', { nota: t0 ? blindsNota(t0) : '', notaSlot: 'blinds-n' })}</div>
          <div class="rl-centro">${relogioGrande(t0, p.countLabel)}</div>
          <div class="rl-dir">${buy}${gar}</div>
          <div class="rl-tv-base">
            ${dado('Registro tardio', t0?.late ? `até ${t0.late}` : '—', 'late')}
            ${dado('Próximo', t1 ? `${t1.h} · ${t1.nome}` : '—', 'prox', { nota: t1 ? proxNota(t1) : '', notaSlot: 'prox-n' })}
            ${acao}
          </div>
        </div>`;
      } else {
        body = `<div class="rl-mon-body">
          <div class="rl-centro">${relogioGrande(t0, p.countLabel)}${fita(t0, t1)}</div>
          <div class="rl-esq">${torneio}${gar}</div>
          <div class="rl-dir">${buy}${late}</div>
          ${acao}
        </div>`;
      }
      return `<section class="b rl-monitor v-${v}" data-rl-monitor data-grade="${data}"><div class="wrap"><div class="rl-mon">${head}${body}${foot}</div></div></section>`;
    },
  },

  relogio_grade: {
    label: 'Relógio de blinds · grade de torneios',
    fields: [F.text('title', 'Título'), F.area('subtitle', 'Texto (use **assim** para destacar)'),
      F.list('items', 'Torneios (exemplos editáveis)', [F.text('day', 'Dia (opcional: agrupa a grade, ex.: Segunda)'), ...GRADE_FIELDS]),
      F.text('note', 'Nota abaixo da grade (fonte, exemplo)'), F.text('cta', 'Link'), F.url('ctaHref', 'Destino do link'),
      F.check('live', 'É a grade de hoje: marcar ao vivo registro aberto e encerrado'),
      F.select('variant', 'Composição', ['tabela', 'compacta'])],
    render: (p, ctx) => {
      const v = variant(p, ['tabela', 'compacta'], 'tabela');
      let dia = null;
      const rows = list(p.items).filter((t) => t.name).map((t) => {
        const h = hora(t.time);
        const det = [t.mode, t.blinds ? `blinds de ${t.blinds} min` : '', t.stack ? `stack ${t.stack}` : '', hora(t.late) ? `tardio até ${hora(t.late)}` : ''].filter(Boolean).join(' · ');
        const grupo = t.day && t.day !== dia ? `<tr class="rl-dia"><th colspan="4" scope="rowgroup">${esc(t.day)}</th></tr>` : '';
        if (t.day) dia = t.day;
        const mod = v === 'tabela' ? det : t.mode;
        return `${grupo}<tr${h ? ` data-ini="${h}"` : ''}${hora(t.late) ? ` data-fim="${hora(t.late)}"` : ''}><td class="h">${esc(t.time)}</td>
          <td class="t"><span class="nome">${esc(t.name)}</span>${t.tag ? `<span class="rl-tag">${esc(t.tag)}</span>` : ''}<span class="st" hidden></span>${mod ? `<span class="mod">${esc(mod)}</span>` : ''}</td>
          <td class="num g"><span class="gar">${esc(t.guaranteed)}</span></td><td class="num b"><span class="buy">${esc(t.buyin)}</span></td></tr>`;
      }).join('');
      return `<section class="b rl-grade v-${v}"${p.live ? ' data-rl-grade data-ao-vivo="1"' : ''}><div class="wrap">
        ${cab(p)}
        <table class="rl-tabela"><caption class="rl-sr">${esc(p.title || 'Grade de torneios')}: horário, torneio, garantido e buy-in</caption>
          <thead><tr><th class="rl-rot" scope="col">Horário</th><th class="rl-rot" scope="col">Torneio</th><th class="rl-rot num" scope="col">Garantido</th><th class="rl-rot num" scope="col">Buy-in</th></tr></thead>
          <tbody>${rows}</tbody></table>
        ${p.note || p.cta ? `<div class="rl-grade-pe">${p.note ? `<span>${esc(p.note)}</span>` : ''}${p.cta ? `<a class="rl-link" href="${safeHref(p.ctaHref, ctx.base)}" data-cta="${esc(p.cta)}">${esc(p.cta)}${ICO.seta}</a>` : ''}</div>` : ''}
      </div></section>`;
    },
  },

  relogio_estrutura: {
    label: 'Relógio de blinds · estrutura em níveis (passo a passo)',
    fields: [F.text('title', 'Título'), F.area('subtitle', 'Texto (use **assim** para destacar)'), F.text('colTime', 'Título da coluna da direita (ex.: Tempo)'),
      F.list('items', 'Níveis', [F.text('level', 'Nível (ex.: 1)'), F.text('title', 'Título'), F.area('text', 'Texto (use **assim** para destacar)'),
        F.text('time', 'Coluna da direita (ex.: 2 min)'), F.text('timeNote', 'Nota da coluna da direita'), F.check('pause', 'É um intervalo (faixa de aviso entre níveis)')]),
      F.text('cta', 'Botão'), F.url('ctaHref', 'Destino do botão')],
    render: (p, ctx) => {
      const rows = list(p.items).map((i) => (i.pause
        ? `<tr class="rl-intervalo"><td class="niv">${esc(i.level || 'Intervalo')}</td><td colspan="2">${i.title ? `<h3>${esc(i.title)}</h3>` : ''}${richPara(i.text)}</td></tr>`
        : `<tr><td class="niv">${esc(i.level)}<small>Nível</small></td><td><h3>${esc(i.title)}</h3>${richPara(i.text)}</td>
            <td class="tempo">${esc(i.time)}${i.timeNote ? `<small>${esc(i.timeNote)}</small>` : ''}</td></tr>`)).join('');
      return `<section class="b rl-estrutura"><div class="wrap">${cab(p)}
        <table class="rl-passo"><caption class="rl-sr">${esc(p.title)}</caption>
          <thead><tr><th class="rl-rot" scope="col">Nível</th><th class="rl-rot" scope="col">O que você faz</th><th class="rl-rot num" scope="col">${esc(p.colTime || 'Tempo')}</th></tr></thead>
          <tbody>${rows}</tbody></table>
        ${p.cta ? `<div class="rl-acoes">${btn(p.cta, p.ctaHref, ctx, 'btn btn-lg')}</div>` : ''}</div></section>`;
    },
  },

  relogio_niveis: {
    label: 'Relógio de blinds · estrutura de blinds (tabela de níveis)',
    fields: [F.text('title', 'Título'), F.area('subtitle', 'Texto (use **assim** para destacar)'),
      F.list('items', 'Níveis', [F.text('level', 'Nível'), F.text('blinds', 'Blinds (ex.: 100/200)'), F.text('ante', 'Ante'), F.text('minutes', 'Duração (ex.: 12 min)'),
        F.text('note', 'Observação'), F.check('pause', 'É um intervalo')]),
      F.text('note', 'Nota abaixo da tabela (ex.: estrutura de exemplo)')],
    render: (p) => {
      const bb = (s) => { const m = String(s || '').replace(/\./g, '').match(/\/\s*([\d,]+)\s*(k|mil)?/i); if (!m) return 0; return parseFloat(m[1].replace(',', '.')) * (m[2] ? 1000 : 1); };
      const max = Math.max(1, ...list(p.items).filter((i) => !i.pause).map((i) => bb(i.blinds)));
      const rows = list(p.items).map((i) => (i.pause
        ? `<tr class="rl-pausa"><td class="lv">${esc(i.level || 'Pausa')}</td><td colspan="4">${esc([i.minutes, i.note].filter(Boolean).join(' · '))}</td></tr>`
        : `<tr><td class="lv">${esc(i.level)}</td><td class="bl"><span>${esc(i.blinds)}</span><i class="rl-barra" style="--w:${Math.max(3, Math.round((bb(i.blinds) / max) * 100))}%" aria-hidden="true"></i></td>
            <td class="an${i.ante ? '' : ' vazio'}">${esc(i.ante || '—')}</td><td class="mi">${esc(i.minutes)}</td><td class="ob">${esc(i.note)}</td></tr>`)).join('');
      return `<section class="b rl-niveis"><div class="wrap">${cab(p)}
        <table class="rl-tabela-niveis"><caption class="rl-sr">${esc(p.title)}</caption>
          <thead><tr><th class="rl-rot" scope="col">Nível</th><th class="rl-rot" scope="col">Blinds</th><th class="rl-rot" scope="col">Ante</th><th class="rl-rot" scope="col">Duração</th><th class="rl-rot" scope="col">Observação</th></tr></thead>
          <tbody>${rows}</tbody></table>
        ${p.note ? `<p class="rl-nota">${esc(p.note)}</p>` : ''}</div></section>`;
    },
  },

  relogio_caixa: {
    label: 'Relógio de blinds · caixa do PIX (dados para copiar)',
    fields: [F.text('title', 'Título'), F.area('subtitle', 'Texto (use **assim** para destacar)'), F.text('live', 'Rótulo ao vivo (só na primeira tela)'),
      F.list('steps', 'Passos', [F.text('title', 'Título'), F.area('text', 'Texto')]),
      F.text('boxTitle', 'Título do quadro'), F.list('rows', 'Linhas do quadro', [F.text('label', 'Rótulo'), F.text('value', 'Valor'), F.check('copy', 'Mostrar botão Copiar')]),
      F.text('cta', 'Botão'), F.url('ctaHref', 'Destino do botão'), F.text('note', 'Nota do quadro'), F.text('foot', 'Rodapé do painel (só na primeira tela)'), F.text('r18', 'Aviso +18'),
      F.select('variant', 'Composição', ['secao', 'destaque'])],
    render: (p, ctx) => {
      const v = variant(p, ['secao', 'destaque'], 'secao');
      const linhas = list(p.rows).filter((r) => r.label).map((r) => `<div class="rl-linha-caixa">
        <dt class="rl-rot">${esc(r.label)}</dt><dd class="${curto(r.value) ? 'nb' : 'txt'}">${esc(r.value)}</dd>${r.copy && r.value ? copiar(r.value, r.label) : ''}</div>`).join('');
      const passos = list(p.steps).map((s) => `<li><strong>${esc(s.title)}</strong><span>${rich(s.text)}</span></li>`).join('');
      if (v === 'destaque') {
        return `<section class="b rl-caixa v-destaque"><div class="wrap"><div class="rl-mon">
          <div class="rl-mon-head"><div><h1>${esc(p.title)}</h1>${p.subtitle ? `<p class="rl-sub">${rich(p.subtitle)}</p>` : ''}</div>${vivo(p.live)}</div>
          <div class="rl-caixa-corpo">
            <div class="rl-caixa-dados">${p.boxTitle ? `<p class="rl-rot rl-ouro">${esc(p.boxTitle)}</p>` : ''}<dl>${linhas}</dl></div>
            <div class="rl-acao">${btn(p.cta, p.ctaHref, ctx, 'btn btn-lg')}${p.note ? `<p>${esc(p.note)}</p>` : ''}</div>
          </div>
          ${passos ? `<ol class="rl-passos-fita">${passos}</ol>` : ''}
          ${p.foot || p.r18 ? `<div class="rl-mon-foot"><span>${esc(p.foot)}</span>${r18(p.r18)}</div>` : ''}
        </div></div></section>`;
      }
      return `<section class="b rl-caixa v-secao"><div class="wrap">${cab(p)}
        <div class="rl-pix">${passos ? `<ol class="rl-passos">${passos}</ol>` : '<div></div>'}
          <div class="rl-quadro">${p.boxTitle ? `<h3>${esc(p.boxTitle)}</h3>` : ''}<dl>${linhas}</dl>
            ${p.cta || p.note ? `<div class="pe">${btn(p.cta, p.ctaHref, ctx, 'btn btn-linha')}${p.note ? `<p>${esc(p.note)}</p>` : ''}</div>` : ''}</div>
        </div>${p.r18 ? `<p class="rl-r18-linha">${r18(p.r18)}</p>` : ''}</div></section>`;
    },
  },

  relogio_leituras: {
    label: 'Relógio de blinds · leituras do painel (valor grande e texto)',
    fields: [F.text('title', 'Título'), F.area('subtitle', 'Texto (use **assim** para destacar)'),
      F.list('items', 'Leituras', [F.text('value', 'Valor grande (ex.: 24h, PIX, NLH)'), F.text('label', 'Legenda'), F.area('text', 'Texto (use **assim** para destacar)')]),
      F.text('note', 'Nota'), F.select('variant', 'Composição', ['faixa', 'lista'])],
    render: (p) => {
      const v = variant(p, ['faixa', 'lista'], 'faixa');
      const items = list(p.items);
      const corpo = v === 'lista'
        ? `<dl class="rl-porque">${items.map((i) => `<div><dt>${esc(i.value)}</dt><dd>${esc(i.label)}${i.text ? `<span>${rich(i.text)}</span>` : ''}</dd></div>`).join('')}</dl>`
        : `<div class="rl-mesas" style="--n:${Math.min(4, Math.max(1, items.length))}">${items.map((i) => `<div><p class="vv">${esc(i.value)}</p>${i.label ? `<p class="q">${esc(i.label)}</p>` : ''}${i.text ? `<p>${rich(i.text)}</p>` : ''}</div>`).join('')}</div>`;
      return `<section class="b rl-leituras v-${v}"><div class="wrap">${cab(p)}${corpo}${p.note ? `<p class="rl-nota">${esc(p.note)}</p>` : ''}</div></section>`;
    },
  },

  relogio_painel: {
    label: 'Relógio de blinds · primeira tela de ficha técnica (parcerias)',
    fields: [F.text('title', 'Título (H1)'), F.area('subtitle', 'Texto (use **assim** para destacar)'), F.text('live', 'Rótulo ao vivo'),
      F.list('items', 'Leituras do painel', [F.text('label', 'Rótulo'), F.text('value', 'Valor'), F.text('note', 'Nota')]),
      F.text('cta', 'Botão principal'), F.url('ctaHref', 'Destino'), F.text('secondary', 'Botão secundário'), F.url('secondaryHref', 'Destino secundário'),
      F.text('note', 'Nota do rodapé do painel'), F.text('r18', 'Aviso +18')],
    render: (p, ctx) => `<section class="b rl-painel"><div class="wrap"><div class="rl-mon">
      <div class="rl-painel-corpo">
        <div class="rl-painel-copy"><h1>${esc(p.title)}</h1>${p.subtitle ? `<p class="rl-sub">${rich(p.subtitle)}</p>` : ''}
          <div class="rl-acoes">${btn(p.cta, p.ctaHref, ctx, 'btn btn-lg')}${btn(p.secondary, p.secondaryHref, ctx, 'btn btn-linha btn-lg')}</div></div>
        <div class="rl-ficha">${vivo(p.live)}
          <dl>${list(p.items).map((i) => `<div><dt class="rl-rot">${esc(i.label)}</dt><dd class="vv">${esc(i.value)}</dd>${i.note ? `<dd class="n">${esc(i.note)}</dd>` : ''}</div>`).join('')}</dl></div>
      </div>
      <div class="rl-mon-foot"><span>${esc(p.note)}</span>${r18(p.r18)}</div>
    </div></div></section>`,
  },

  relogio_anatomia: {
    label: 'Relógio de blinds · como ler o relógio (primeira tela do blog)',
    fields: [F.text('title', 'Título (H1)'), F.area('subtitle', 'Texto (use **assim** para destacar)'),
      F.text('level', 'Nível do exemplo (ex.: 7)'), F.text('time', 'Tempo do nível (MM:SS, ex.: 12:00)'), F.text('blinds', 'Blinds (ex.: 200/400)'),
      F.text('ante', 'Ante (ex.: 400)'), F.text('next', 'Próximo nível (ex.: 250/500)'), F.text('event', 'Nome do torneio do exemplo'),
      F.list('parts', 'Legenda (na ordem: nível, tempo, blinds, ante, próximo)', [F.text('title', 'Título'), F.area('text', 'Texto')]),
      F.text('cta', 'Botão'), F.url('ctaHref', 'Destino do botão'), F.text('note', 'Nota'), F.text('r18', 'Aviso +18')],
    render: (p, ctx) => {
      const L = ['A', 'B', 'C', 'D', 'E'];
      const mk = (i) => `<span class="rl-marca" aria-hidden="true">${L[i]}</span>`;
      const tempo = /^\d{1,2}:[0-5]\d$/.test(String(p.time || '').trim()) ? String(p.time).trim() : '12:00';
      return `<section class="b rl-anatomia"><div class="wrap">
        <div class="rl-anat-copy"><h1>${esc(p.title)}</h1>${p.subtitle ? `<p class="rl-sub">${rich(p.subtitle)}</p>` : ''}
          ${p.cta ? `<div class="rl-acoes">${btn(p.cta, p.ctaHref, ctx, 'btn btn-lg')}</div>` : ''}${p.r18 ? `<p class="rl-r18-linha">${r18(p.r18)}</p>` : ''}</div>
        <figure class="rl-anat-fig"><div class="rl-mon" data-rl-nivel data-tempo="${esc(tempo)}">
          <div class="rl-anat-topo"><p class="rl-rot">${esc(p.event || 'Torneio de exemplo')}</p><p class="rl-anat-nivel">${mk(0)}<span class="rl-rot">Nível</span><b data-rl="nv">${esc(p.level)}</b></p></div>
          <div class="rl-anat-tempo">${mk(1)}<p class="rl-relogio" data-rl="tempo" role="timer" aria-live="off">${esc(tempo)}</p></div>
          <div class="rl-anat-fita">
            <div>${mk(2)}<p class="rl-rot">Blinds</p><p class="v">${esc(p.blinds)}</p></div>
            <div>${mk(3)}<p class="rl-rot">Ante</p><p class="v">${esc(p.ante || '—')}</p></div>
            <div>${mk(4)}<p class="rl-rot">Próximo nível</p><p class="v">${esc(p.next)}</p></div>
          </div></div>
          <figcaption><ol class="rl-legenda">${list(p.parts).slice(0, 5).map((x, i) => `<li><span class="rl-marca" aria-hidden="true">${L[i]}</span><div><strong>${esc(x.title)}</strong>${x.text ? `<span>${rich(x.text)}</span>` : ''}</div></li>`).join('')}</ol>
          ${p.note ? `<p class="rl-nota">${esc(p.note)}</p>` : ''}</figcaption></figure>
      </div></section>`;
    },
  },

  relogio_artigos: {
    label: 'Relógio de blinds · lista de leitura (artigos e guias)',
    fields: [F.text('title', 'Título'), F.area('subtitle', 'Texto (use **assim** para destacar)'),
      F.list('items', 'Artigos', [F.text('time', 'Leitura (ex.: 6 min)'), F.text('tag', 'Assunto'), F.text('title', 'Título'), F.area('text', 'Resumo'), F.url('href', 'Link')]),
      F.text('note', 'Nota'), F.text('cta', 'Link do fim'), F.url('ctaHref', 'Destino')],
    render: (p, ctx) => `<section class="b rl-artigos"><div class="wrap">${cab(p)}
      <ol class="rl-lista-leitura">${list(p.items).map((i) => `<li><a href="${safeHref(i.href, ctx.base)}">
        <span class="tm">${esc(i.time)}<small>de leitura</small></span>
        <span class="tx">${i.tag ? `<span class="rl-tag">${esc(i.tag)}</span>` : ''}<strong>${esc(i.title)}</strong>${i.text ? `<span class="rs">${esc(i.text)}</span>` : ''}</span>
        <span class="ir">${ICO.seta}</span></a></li>`).join('')}</ol>
      ${p.note || p.cta ? `<div class="rl-grade-pe">${p.note ? `<span>${esc(p.note)}</span>` : ''}${p.cta ? `<a class="rl-link" href="${safeHref(p.ctaHref, ctx.base)}" data-cta="${esc(p.cta)}">${esc(p.cta)}${ICO.seta}</a>` : ''}</div>` : ''}
    </div></section>`,
  },

  relogio_termos: {
    label: 'Relógio de blinds · termos e regras (glossário)',
    fields: [F.text('title', 'Título'), F.area('subtitle', 'Texto (use **assim** para destacar)'),
      F.list('items', 'Termos', [F.text('term', 'Termo / regra'), F.area('text', 'Explicação (use **assim** para destacar)')]),
      F.text('note', 'Nota'), F.select('variant', 'Composição', ['glossario', 'regras'])],
    render: (p) => {
      const v = variant(p, ['glossario', 'regras'], 'glossario');
      return `<section class="b rl-termos v-${v}"><div class="wrap">${cab(p)}
        <dl class="rl-dl">${list(p.items).map((i) => `<div><dt>${esc(i.term)}</dt><dd>${richPara(i.text)}</dd></div>`).join('')}</dl>
        ${p.note ? `<p class="rl-nota">${esc(p.note)}</p>` : ''}</div></section>`;
    },
  },

  relogio_cabecalho: {
    label: 'Relógio de blinds · cabeçalho de página interna',
    fields: [F.text('title', 'Título (H1)'), F.area('subtitle', 'Texto (use **assim** para destacar)'),
      F.list('items', 'Leituras ao lado (até 3)', [F.text('label', 'Rótulo'), F.text('value', 'Valor')]),
      F.text('cta', 'Botão'), F.url('ctaHref', 'Destino do botão'), F.text('r18', 'Aviso +18')],
    render: (p, ctx) => {
      const items = list(p.items).slice(0, 3);
      return `<section class="b rl-cabecalho"><div class="wrap"><div class="rl-mon">
        <div class="rl-cab-corpo"><div class="rl-cab-copy"><h1>${esc(p.title)}</h1>${p.subtitle ? `<p class="rl-sub">${rich(p.subtitle)}</p>` : ''}
          ${p.cta ? `<div class="rl-acoes">${btn(p.cta, p.ctaHref, ctx, 'btn')}</div>` : ''}</div>
          ${items.length ? `<dl class="rl-cab-leituras">${items.map((i) => `<div><dt class="rl-rot">${esc(i.label)}</dt><dd>${esc(i.value)}</dd></div>`).join('')}</dl>` : ''}</div>
        ${p.r18 ? `<div class="rl-mon-foot"><span></span>${r18(p.r18)}</div>` : ''}
      </div></div></section>`;
    },
  },

  relogio_aviso: {
    label: 'Relógio de blinds · aviso com selo (+18, segurança)',
    fields: [F.text('badge', 'Selo (ex.: +18)'), F.area('text', 'Texto (use **assim** para destacar)'), F.text('linkLabel', 'Link'), F.url('href', 'Destino do link')],
    render: (p, ctx) => `<aside class="b rl-aviso"><div class="wrap"><div class="rl-aviso-caixa">
      <b class="rl-selo">${esc(p.badge || '+18')}</b><div class="tx">${richPara(p.text)}</div>
      ${p.linkLabel ? `<a class="rl-link" href="${safeHref(p.href, ctx.base)}">${esc(p.linkLabel)}${ICO.seta}</a>` : ''}</div></div></aside>`,
  },

  relogio_registro: {
    label: 'Relógio de blinds · balcão de registro (formulário, vai para o CRM)',
    fields: [F.text('title', 'Título'), F.area('text', 'Texto (use **assim** para destacar)'), F.select('fields', 'Campos', ['email', 'email_nome', 'email_nome_telefone']),
      F.text('button', 'Texto do botão'), F.text('success', 'Mensagem de sucesso'), F.area('consent', 'Texto de consentimento'),
      F.text('note', 'Nota abaixo do formulário'), F.text('r18', 'Aviso +18')],
    render: (p, ctx) => {
      const f = p.fields || 'email';
      const consent = p.consent || 'Concordo em receber contato sobre esta oferta. Posso sair quando quiser.';
      const botao = `<button class="btn btn-lg" type="submit">${esc(p.button || 'Enviar')}</button>`;
      const id = `rl-email-${esc(ctx.page.slug || 'inicio')}`;
      const so = f === 'email';
      return `<section class="b rl-registro" id="registro"><div class="wrap"><div class="rl-balcao">
        <div class="rl-balcao-copy"><h2>${esc(p.title || 'Registro aberto')}</h2>${p.text ? `<div class="apoio">${richPara(p.text)}</div>` : ''}${p.r18 ? `<p class="rl-r18-linha">${r18(p.r18)}</p>` : ''}</div>
        <form class="lead-form rl-form" method="post" action="${esc(ctx.formAction)}" data-success="${esc(p.success || 'Recebemos! Vamos falar com você em breve.')}">
          <input type="hidden" name="page" value="${esc(ctx.page.slug)}">
          ${f.includes('nome') ? '<label>Nome<input name="name" autocomplete="name" maxlength="80" required></label>' : ''}
          ${so ? `<label class="rl-campo-rot" for="${id}">Seu e-mail</label><div class="rl-campo"><input id="${id}" name="email" type="email" inputmode="email" autocomplete="email" maxlength="120" placeholder="nome@gmail.com" required>${botao}</div>`
    : '<label>E-mail<input name="email" type="email" inputmode="email" autocomplete="email" maxlength="120" placeholder="nome@gmail.com" required></label>'}
          ${f.includes('telefone') ? '<label>WhatsApp<input name="phone" type="tel" autocomplete="tel" maxlength="20" placeholder="(11) 90000-0000"></label>' : ''}
          <label class="check"><input type="checkbox" name="consent" value="1" required> <span>${esc(consent)}</span></label>
          <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
          ${so ? '' : botao}
          <p class="form-msg" role="status" aria-live="polite"></p>
          ${p.note ? `<p class="pq">${esc(p.note)}</p>` : ''}
        </form></div></div></section>`;
    },
  },
};
