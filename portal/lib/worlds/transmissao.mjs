// Mundo "Transmissão de TV": a mesa ao vivo como numa transmissão de torneio. Placa da mão com cartas desenhadas e % de vitória
// calculadas de verdade (enumeração completa), seletor pré-flop/flop/turn/river, faixa de torneios correndo, selo AO VIVO e
// tipografia de grafismo de TV (Barlow Condensed nos nomes, Antonio nos números, Montserrat no texto).
// Pele em public/assets/worlds/transmissao.css · interação em public/assets/worlds/transmissao.js (sem JS a página mostra o river).
import { esc, safeHref, list, img, variant, F, AO_VIVO, contagem } from '../block-kit.mjs';

export const world = {
  name: 'Transmissão de TV',
  description: 'Mesa ao vivo como numa transmissão: placa da mão com % de vitória, seletor de ruas, faixa de torneios correndo e grafismo de TV.',
  // fontes que a pele usa (todas em FONTS de lib/templates.mjs): títulos, números (no lugar da mono) e texto
  fonts: ['Barlow Condensed', 'Antonio', 'Montserrat', 'Saira Condensed', 'Barlow'],
  palettes: [
    { id: 'suprema', name: 'Preto e dourado', colors: { mode: 'escuro', bg: '#15110a', surface: '#1e1810', text: '#f6eddc', muted: '#ad9a78', primary: '#efa144', primaryText: '#030303', accent: '#2bb673', border: '#3b2f1f' } },
    { id: 'sx', name: 'Preto e azul SX', colors: { mode: 'escuro', bg: '#0c0f12', surface: '#141a20', text: '#eef3f6', muted: '#9aa8b3', primary: '#39bcff', primaryText: '#03121c', accent: '#2bd17e', border: '#26303a' } },
    { id: 'estudio', name: 'Estúdio azul-noite e lima', colors: { mode: 'escuro', bg: '#0b1220', surface: '#121b2d', text: '#eef1f6', muted: '#9fabc2', primary: '#d4f24a', primaryText: '#0b1220', accent: '#ff5a4a', border: '#243149' } },
    { id: 'chama', name: 'Preto e laranja chama', colors: { mode: 'escuro', bg: '#0b0908', surface: '#17110d', text: '#f7f1ea', muted: '#bfb1a5', primary: '#f47b20', primaryText: '#150700', accent: '#ffc48a', border: '#3a2618' } },
  ],
};

/* ---------------------------------------------------------------- utilidades */

// **trecho** vira negrito; o resto é texto escapado.
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const svg = (body) => `<svg class="tx-i" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
const ICO = {
  seta: svg('<path d="M4 12h15M13 6l6 6-6 6"/>'),
  check: svg('<path d="M4 12.5l5 5L20 6.5"/>'),
  cam: svg('<path d="M2 6h13v12H2zM15 10l7-4v12l-7-4z"/>'),
  pix: svg('<path d="M4 5h16v14H4zM4 9h16M8 14h4"/>'),
  saque: svg('<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>'),
  suporte: svg('<path d="M4.5 19.5l1.2-3.8A8 8 0 1 1 9 19.1z"/><path d="M9.2 9.2c.3 2.4 2.2 4.4 4.6 4.9l1.2-1.2 1.6.9"/>'),
  alerta: svg('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 17.5v.5"/>'),
  relogio: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
  escudo: svg('<path d="M12 3l8 3v6c0 4.6-3.4 8.1-8 9-4.6-.9-8-4.4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
  pausa: '<svg class="tx-i tx-cheio" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
};
const ICONES = ['pix', 'saque', 'suporte', 'alerta', 'relogio', 'escudo', 'check'];
// marca genérica (quando a operação não tem logo): ficha vista de cima dentro de um quadro chanfrado
const MARCA = '<svg class="tx-marca-svg" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path d="M2 2h29l7 7v29H2z" fill="none" stroke="currentColor" stroke-width="2.6"/><circle cx="20" cy="20" r="9.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M20 6.5v5.5M20 28v5.5M6.5 20H12M28 20h5.5" stroke="currentColor" stroke-width="2.6"/><circle cx="20" cy="20" r="3.4" fill="currentColor"/></svg>';

const botao = (label, href, ctx, cls = 'btn') => (label ? `<a class="${cls}" href="${safeHref(href, ctx.base)}" data-cta="${esc(label)}">${esc(label)}${ICO.seta}</a>` : '');
const cabecalho = (p) => (p.title || p.intro ? `<header class="tx-cab">${p.title ? `<h2>${esc(p.title)}</h2>` : ''}${p.intro ? `<p class="tx-intro">${rich(p.intro)}</p>` : ''}</header>` : '');
const HEADF = [F.text('title', 'Título'), F.area('intro', 'Texto de abertura (use **assim** para negrito)')];

/* ---------------------------------------------------------------- cartas e % de vitória */

const NAIPES = {
  s: { svg: '<path d="M12 1.8C9.4 5.6 3.8 8.6 3.8 13.3c0 2.6 2 4.6 4.5 4.6 1.4 0 2.6-.6 3.2-1.5-.3 2.2-1.3 3.9-2.7 5.2h6.4c-1.4-1.3-2.4-3-2.7-5.2.6.9 1.8 1.5 3.2 1.5 2.5 0 4.5-2 4.5-4.6 0-4.7-5.6-7.7-8.2-11.5z"/>', v: false, nome: 'espadas' },
  h: { svg: '<path d="M12 21.2S3.4 15.7 3.4 9.4C3.4 6.3 5.6 4 8.4 4c1.6 0 2.9.8 3.6 2 .7-1.2 2-2 3.6-2 2.8 0 5 2.3 5 5.4 0 6.3-8.6 11.8-8.6 11.8z"/>', v: true, nome: 'copas' },
  d: { svg: '<path d="M12 1.6l7.6 10.4L12 22.4 4.4 12z"/>', v: true, nome: 'ouros' },
  c: { svg: '<circle cx="12" cy="6.8" r="4.4"/><circle cx="6.6" cy="13.4" r="4.4"/><circle cx="17.4" cy="13.4" r="4.4"/><path d="M10.9 11.5h2.2l1.4 10.2h-5z"/>', v: false, nome: 'paus' },
};
const RANKS = '23456789TJQKA';
const NOME = { 2: 'dois', 3: 'três', 4: 'quatro', 5: 'cinco', 6: 'seis', 7: 'sete', 8: 'oito', 9: 'nove', 10: 'dez', 11: 'valete', 12: 'dama', 13: 'rei', 14: 'ás' };
const PLURAL = { 2: 'dois', 3: 'três', 4: 'quatros', 5: 'cincos', 6: 'seis', 7: 'setes', 8: 'oitos', 9: 'noves', 10: 'dez', 11: 'valetes', 12: 'damas', 13: 'reis', 14: 'ases' };
const ROTULO = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const rotulo = (r) => ROTULO[r] || String(r);
const naRua = (r) => (r >= 11 ? NOME[r] : String(r)); // "turn rei", "river 4"

/** "As Kd", "10h", "Q♦" -> [{ r: 14, s: 's', n: 50 }, ...] ou null. Naipes: s espadas, h copas, d ouros, c paus. */
function lerCartas(txt) {
  const sym = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c', '♤': 's', '♡': 'h', '♢': 'd', '♧': 'c' };
  const toks = String(txt || '').trim().split(/[\s,;/]+/).filter(Boolean);
  const out = [];
  for (let t of toks) {
    t = t.replace(/[♠♥♦♣♤♡♢♧]/g, (m) => sym[m]).toUpperCase().replace(/^10/, 'T');
    const m = t.match(/^([2-9TJQKA])([SHDC])$/);
    if (!m) return null;
    const ri = RANKS.indexOf(m[1]);
    const s = m[2].toLowerCase();
    out.push({ r: ri + 2, s, n: ri * 4 + 'shdc'.indexOf(s) });
  }
  return out;
}

const STRAIGHTS = [];
for (let hi = 14; hi >= 5; hi--) {
  let m = 0;
  for (let k = 0; k < 5; k++) m |= 1 << (hi - k === 1 ? 14 : hi - k);
  STRAIGHTS.push([hi, m]);
}
const seqAlta = (mask) => { for (const [hi, m] of STRAIGHTS) if ((mask & m) === m) return hi; return 0; };
const topo = (mask, n) => { let o = 0, k = 0; for (let r = 14; r >= 2 && k < n; r--) if (mask & (1 << r)) { o = o * 16 + r; k++; } while (k < n) { o *= 16; k++; } return o; };
const CAT = 1048576;
const cnt = new Int8Array(15);
/** força de 2 a 7 cartas (números 0..51): maior é melhor. Categoria = Math.floor(força / CAT). */
function forca(cards, n) {
  cnt.fill(0);
  const sc = [0, 0, 0, 0], sm = [0, 0, 0, 0];
  let rm = 0;
  for (let i = 0; i < n; i++) { const c = cards[i]; const r = (c >> 2) + 2, s = c & 3; cnt[r]++; sc[s]++; sm[s] |= 1 << r; rm |= 1 << r; }
  for (let s = 0; s < 4; s++) if (sc[s] >= 5) { const h = seqAlta(sm[s]); return h ? 8 * CAT + h : 5 * CAT + topo(sm[s], 5); }
  let q = 0, t1 = 0, t2 = 0, p1 = 0, p2 = 0;
  for (let r = 14; r >= 2; r--) {
    const k = cnt[r];
    if (k === 4) q = r; else if (k === 3) { if (!t1) t1 = r; else if (!t2) t2 = r; } else if (k === 2) { if (!p1) p1 = r; else if (!p2) p2 = r; }
  }
  if (q) return 7 * CAT + q * 16 + topo(rm & ~(1 << q), 1);
  if (t1 && (t2 || p1)) return 6 * CAT + t1 * 16 + Math.max(t2, p1);
  const h = seqAlta(rm);
  if (h) return 4 * CAT + h;
  if (t1) return 3 * CAT + t1 * 256 + topo(rm & ~(1 << t1), 2);
  if (p1 && p2) return 2 * CAT + p1 * 256 + p2 * 16 + topo(rm & ~(1 << p1) & ~(1 << p2), 1);
  if (p1) return CAT + p1 * 4096 + topo(rm & ~(1 << p1), 3);
  return topo(rm, 5);
}

/** nome do jogo feito, em português ("Par de reis", "Dama alta"). */
function jogo(cards) {
  const sc = forca(cards.map((c) => c.n), cards.length);
  const cat = Math.floor(sc / CAT);
  const rs = cards.map((c) => c.r);
  const conta = (r) => rs.filter((x) => x === r).length;
  const maior = (k) => Math.max(...rs.filter((r) => conta(r) >= k));
  const alto = Math.max(...rs);
  switch (cat) {
    case 0: return alto === 12 ? 'Dama alta' : `${cap(NOME[alto])} alto`;
    case 1: return `Par de ${PLURAL[maior(2)]}`;
    case 2: { const ps = [...new Set(rs.filter((r) => conta(r) >= 2))].sort((a, b) => b - a); return `Dois pares, ${PLURAL[ps[0]]} e ${PLURAL[ps[1]]}`; }
    case 3: return `Trinca de ${PLURAL[maior(3)]}`;
    case 4: return 'Sequência';
    case 5: return 'Flush';
    case 6: return 'Full house';
    case 7: return `Quadra de ${PLURAL[maior(4)]}`;
    default: return sc % CAT === 14 ? 'Royal flush' : 'Straight flush';
  }
}

// Equidade de A (vitórias + metade dos empates) por enumeração completa das cartas que faltam.
// A mesma mão não é recalculada; a mão do modelo (A♠K♦ x Q♣10♥ no pré-flop: 63,8% + 0,4% de empate) já vem pronta.
const MEMO = new Map([['48,46|43,33|', 0.6395035577794598]]);
function equidade(a, b, board) {
  const chave = `${a.map((c) => c.n)}|${b.map((c) => c.n)}|${board.map((c) => c.n)}`;
  if (MEMO.has(chave)) return MEMO.get(chave);
  const usadas = new Set([...a, ...b, ...board].map((c) => c.n));
  const baralho = [];
  for (let c = 0; c < 52; c++) if (!usadas.has(c)) baralho.push(c);
  const falta = 5 - board.length;
  const A = new Int32Array(7), B = new Int32Array(7);
  A[0] = a[0].n; A[1] = a[1].n; B[0] = b[0].n; B[1] = b[1].n;
  board.forEach((c, i) => { A[2 + i] = c.n; B[2 + i] = c.n; });
  let w = 0, t = 0, tot = 0;
  const base = 2 + board.length;
  const rec = (ini, d) => {
    if (d === falta) { const x = forca(A, 7), y = forca(B, 7); if (x > y) w++; else if (x === y) t++; tot++; return; }
    for (let i = ini; i < baralho.length; i++) { A[base + d] = baralho[i]; B[base + d] = baralho[i]; rec(i + 1, d + 1); }
  };
  rec(0, 0);
  const eq = (w + t / 2) / tot;
  if (MEMO.size > 200) MEMO.clear();
  MEMO.set(chave, eq);
  return eq;
}

const nomeMao = (h) => {
  const [x, y] = [...h].sort((p, q) => q.r - p.r);
  return x.r === y.r ? cap(PLURAL[x.r]) : `${cap(NOME[x.r])}-${cap(NOME[y.r])}`;
};
const falaCarta = (c) => `${NOME[c.r]} de ${NAIPES[c.s].nome}`;

/** As 4 ruas da mão: % de A e de B, jogo de cada um e a legenda (editável; vazia = automática). null se as cartas não fecham. */
function ruasDaMao(p) {
  const a = lerCartas(p.cardsA), b = lerCartas(p.cardsB), bd = lerCartas(p.board);
  if (!a || !b || !bd || a.length !== 2 || b.length !== 2 || bd.length !== 5) return null;
  if (new Set([...a, ...b, ...bd].map((c) => c.n)).size !== 9) return null;
  const nA = p.nameA || nomeMao(a), nB = p.nameB || nomeMao(b);
  // par na mão vira nome no plural ("Valetes"): o verbo acompanha
  const pl = { [nA]: !p.nameA && a[0].r === a[1].r, [nB]: !p.nameB && b[0].r === b[1].r };
  const vb = (quem, sing, plur) => (pl[quem] ? plur : sing);
  const nomes = ['Pré-flop', 'Flop', 'Turn', 'River'];
  const legs = [p.legPre, p.legFlop, p.legTurn, p.legRiver];
  const ruas = [0, 3, 4, 5].map((k, i) => {
    const mesa = bd.slice(0, k);
    const pa = Math.round(equidade(a, b, mesa) * 100);
    return { nome: nomes[i], abre: k, a: pa, b: 100 - pa, ja: jogo([...a, ...mesa]), jb: jogo([...b, ...mesa]) };
  });
  const pre = ruas[0];
  ruas.forEach((r, i) => {
    if (legs[i]) { r.leg = legs[i]; return; }
    const lider = r.a > r.b ? [nA, r.ja] : r.b > r.a ? [nB, r.jb] : null;
    if (i === 0) r.leg = lider ? `Pré-flop: ${lider[0]} ${vb(lider[0], 'sai', 'saem')} na frente, ${Math.max(r.a, r.b)}% contra ${Math.min(r.a, r.b)}%.` : 'Pré-flop: as duas mãos saem empatadas.';
    else if (i === 1) r.leg = `Flop ${bd.slice(0, 3).map((c) => naRua(c.r)).join(', ')}: ${lider ? `${lider[0]} ${vb(lider[0], 'lidera', 'lideram')} com ${lider[1].toLowerCase()}` : 'as duas mãos seguem empatadas'}.`;
    else if (i === 2) r.leg = `Turn ${naRua(bd[3].r)}: ${lider ? `${lider[0]} ${vb(lider[0], 'está', 'estão')} na frente com ${lider[1].toLowerCase()}` : 'empate por enquanto'}.`;
    else r.leg = `River ${naRua(bd[4].r)}: ${lider ? `${lider[0]} ${vb(lider[0], 'leva', 'levam')} o pote com ${lider[1].toLowerCase()}` : `pote dividido, as duas mãos fazem ${r.ja.toLowerCase()}`}. Antes do flop, ${pre.a}% contra ${pre.b}%.`;
  });
  return { a, b, bd, nA, nB, ruas };
}

const VERSO = '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path d="M20 4l14 16-14 16L6 20z" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M20 12l7 8-7 8-7-8z" fill="currentColor"/></svg>';
const carta = (c, { peq = false } = {}) => `<span class="tx-carta${NAIPES[c.s].v ? ' v' : ''}${peq ? ' peq' : ' aberta'}">${peq ? '' : `<span class="tx-verso">${VERSO}</span>`}<span class="tx-face"><b>${rotulo(c.r)}</b><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${NAIPES[c.s].svg}</svg></span></span>`;

/* ---------------------------------------------------------------- telas do multiview (SVG 16:9, cores pelas classes k-* da pele) */

const TELAS = ['mesa', 'pix', 'grade', 'conversa', 'relogio', 'letreiro'];
const FONTE = { mesa: 'Mesa', pix: 'Caixa', grade: 'Grade', conversa: 'Suporte', relogio: 'Relógio', letreiro: 'Letreiro' };
const GUIAS = (w, h, d = 10, l = 14) => `<path class="k-guia" d="M${d} ${d + l}V${d}h${l}M${w - d - l} ${d}h${l}v${l}M${w - d} ${h - d - l}v${l}h-${l}M${d + l} ${h - d}H${d}v-${l}"/>`;
const tv = (corpo, w = 320, h = 180) => `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" focusable="false"><rect class="k-fundo" width="${w}" height="${h}"/>${corpo}${GUIAS(w, h, w / 32, w / 23)}</svg>`;
const ret = (cls, x, y, w, h, rx = 0) => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}"${rx ? ` rx="${rx}"` : ''}/>`;

// mesa vista de cima (câmera aérea): trilho, feltro, linha de aposta, assentos com placa, cartas comunitárias, fichas e botão do dealer
function mesaCima({ cx, cy, rx, ry, carta: cw, abertas = 3, assentos = 6, ativo = 1, comCartas = true, naMao = [] }) {
  const ch = cw * 1.4;
  const cartas = !comCartas ? '' : [0, 1, 2, 3, 4].map((i) => {
    const x = cx - (cw * 5 + 4 * cw * 0.18) / 2 + i * cw * 1.18, y = cy - ch / 2 - ry * 0.06;
    return i < abertas
      ? `${ret('k-carta', x, y, cw, ch, cw * 0.08)}${ret(i % 2 ? 'k-naipe-v' : 'k-naipe', x + cw * 0.16, y + cw * 0.16, cw * 0.26, cw * 0.36)}<circle class="${i % 2 ? 'k-naipe-v' : 'k-naipe'}" cx="${x + cw * 0.66}" cy="${y + ch * 0.72}" r="${cw * 0.17}"/>`
      : `${ret('k-verso', x, y, cw, ch, cw * 0.08)}<path class="k-verso-m" d="M${x + cw / 2} ${y + ch * 0.25}l${cw * 0.24} ${ch * 0.25}-${cw * 0.24} ${ch * 0.25}-${cw * 0.24}-${ch * 0.25}z"/>`;
  }).join('');
  const pw = rx * 0.27, ph = ry * 0.2;
  const lugares = Array.from({ length: assentos }, (_, i) => {
    const a = (-90 + 360 / assentos * (i + 0.5)) * Math.PI / 180;
    const x = cx + Math.cos(a) * (rx + pw * 0.08) - pw / 2, y = cy + Math.sin(a) * (ry + ph * 0.55) - ph / 2;
    return `${ret(i === ativo ? 'k-placa-ouro' : 'k-placa', x.toFixed(1), y.toFixed(1), pw.toFixed(1), ph.toFixed(1))}${ret(i === ativo ? 'k-sobre-ouro' : 'k-barra-forte', (x + pw * 0.12).toFixed(1), (y + ph * 0.32).toFixed(1), (pw * 0.56).toFixed(1), (ph * 0.36).toFixed(1))}`;
  }).join('');
  // cartas fechadas na frente de quem está na mão
  const fechadas = naMao.map((i) => {
    const a = (-90 + 360 / assentos * (i + 0.5)) * Math.PI / 180, w = cw * 0.62, h = w * 1.4;
    const x = cx + Math.cos(a) * rx * 0.7, y = cy + Math.sin(a) * ry * 0.62;
    return [-0.32, 0.32].map((d) => ret('k-verso', (x + d * w * 1.1 - w / 2).toFixed(1), (y - h / 2).toFixed(1), w.toFixed(1), h.toFixed(1), (w * 0.1).toFixed(1))).join('');
  }).join('');
  const ficha = (x, y, n) => Array.from({ length: n }, (_, k) => `<ellipse class="${k === n - 1 ? 'k-ficha-topo' : 'k-ficha'}" cx="${x}" cy="${(y - k * cw * 0.13).toFixed(1)}" rx="${(cw * 0.36).toFixed(1)}" ry="${(cw * 0.2).toFixed(1)}"/>`).join('');
  return `<ellipse class="k-trilho" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/><ellipse class="k-feltro" cx="${cx}" cy="${cy}" rx="${rx * 0.9}" ry="${ry * 0.8}"/>
    <ellipse class="k-risco" cx="${cx}" cy="${cy}" rx="${rx * 0.64}" ry="${ry * 0.52}"/>${lugares}${fechadas}${cartas}
    ${ficha(cx - rx * 0.05, cy + ry * 0.46, 4)}${ficha(cx + rx * 0.09, cy + ry * 0.44, 3)}
    <circle class="k-botao" cx="${cx + rx * 0.42}" cy="${cy - ry * 0.4}" r="${cw * 0.3}"/>`;
}

// "QR" desenhado (padrão fixo, não lê nada): só para a tela de pagamento parecer uma tela de pagamento
const QR = (() => {
  const n = 21, on = new Set();
  let s = 7;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const canto = (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12);
    s = (s * 1103515245 + 12345) % 2147483648;
    if (!canto && (s >> 16) % 5 < 2) on.add(`${x},${y}`);
  }
  const mod = [...on].map((k) => { const [x, y] = k.split(','); return `M${x} ${y}h1v1h-1z`; }).join('');
  const olho = (x, y) => `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`;
  return `<path class="k-naipe" fill-rule="evenodd" d="${olho(0, 0)}${olho(14, 0)}${olho(0, 14)}${mod}"/>`;
})();

const TELA_SVG = {
  mesa: tv(mesaCima({ cx: 160, cy: 92, rx: 128, ry: 58, carta: 20 })),
  conversa: tv(`${ret('k-tela', 92, 10, 136, 160, 12)}${ret('k-cab', 92, 10, 136, 28, 12)}${ret('k-cab', 92, 26, 136, 12)}
    <circle class="k-barra-forte" cx="110" cy="24" r="7.5"/><circle class="k-vivo" cx="115.5" cy="29.5" r="3"/>${ret('k-texto', 124, 19, 52, 6)}${ret('k-barra', 124, 28, 32, 4)}
    ${ret('k-balao', 102, 48, 86, 20, 3)}${ret('k-barra-forte', 109, 55, 62, 5)}
    ${ret('k-ouro', 144, 74, 76, 20, 3)}${ret('k-sobre-ouro', 151, 81, 52, 5)}
    ${ret('k-balao', 102, 100, 104, 30, 3)}${ret('k-barra-forte', 109, 107, 86, 5)}${ret('k-barra-forte', 109, 117, 58, 5)}
    ${ret('k-ouro', 158, 136, 62, 16, 3)}${ret('k-sobre-ouro', 165, 141.5, 38, 5)}
    ${ret('k-balao', 102, 154, 34, 10, 3)}<circle class="k-texto" cx="111" cy="159" r="1.8"/><circle class="k-barra-forte" cx="119" cy="159" r="1.8"/><circle class="k-barra" cx="127" cy="159" r="1.8"/>`),
  pix: tv(`${ret('k-tela', 22, 20, 276, 140, 4)}${ret('k-carta', 38, 32, 116, 116, 3)}<g transform="translate(45.5 39.5) scale(4.857)">${QR}</g>
    <circle class="k-vivo" cx="222" cy="64" r="21"/><path class="k-traco" d="M211.5 64.5l7 7 14-15"/>
    ${ret('k-texto', 174, 98, 96, 8)}${ret('k-barra', 174, 112, 66, 5)}${ret('k-ouro', 174, 128, 84, 16)}${ret('k-sobre-ouro', 181, 134, 44, 4)}`),
  grade: tv(`${ret('k-cab', 0, 0, 320, 30)}${ret('k-ouro', 0, 30, 320, 2)}<circle class="k-vivo" cx="22" cy="15" r="4"/>${ret('k-texto', 34, 11.5, 92, 7)}${ret('k-ouro', 262, 10, 44, 10)}
    ${[110, 92, 124, 80, 102].map((w, i) => { const y = 36 + i * 28, d = i === 1; return `${ret(d ? 'k-destaque' : i % 2 ? 'k-tela' : 'k-fundo-2', 0, y, 320, 26)}${ret('k-ouro', 14, y + 8, 30, 10)}${ret('k-texto', 56, y + 6, w, 7)}${ret('k-barra', 56, y + 16, [52, 64, 40, 58, 46][i], 4)}${ret(d ? 'k-ouro' : 'k-barra-forte', 262, y + 9, 44, 8)}`; }).join('')}`),
  relogio: tv(`<circle class="k-anel" cx="98" cy="92" r="56"/><circle class="k-anel-ouro" cx="98" cy="92" r="56" stroke-dasharray="236 352" transform="rotate(-90 98 92)"/>
    ${Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return `<path class="k-tique" d="M${(98 + Math.sin(a) * 38).toFixed(1)} ${(92 - Math.cos(a) * 38).toFixed(1)}L${(98 + Math.sin(a) * 43).toFixed(1)} ${(92 - Math.cos(a) * 43).toFixed(1)}"/>`; }).join('')}
    ${ret('k-texto', 72, 82, 52, 12)}${ret('k-barra', 82, 100, 32, 5)}
    ${[[96, 'k-ouro'], [72, 'k-texto'], [108, 'k-texto']].map(([w, c], i) => `${ret('k-barra', 180, 38 + i * 42, 38, 5)}${ret(c, 180, 48 + i * 42, w, 13)}`).join('')}`),
  letreiro: tv(`${mesaCima({ cx: 160, cy: 66, rx: 112, ry: 44, carta: 14, abertas: 5 })}
    ${ret('k-cab', 20, 116, 176, 22)}${ret('k-ouro', 20, 114, 176, 2)}${ret('k-texto', 30, 122, 84, 6)}${ret('k-barra', 30, 131, 52, 3)}${ret('k-ouro', 196, 114, 34, 24)}
    ${ret('k-tela', 0, 148, 320, 32)}${ret('k-ouro', 0, 146, 320, 2)}${ret('k-ouro', 0, 148, 56, 32)}<circle class="k-sobre-ouro" cx="14" cy="164" r="4"/>${ret('k-sobre-ouro', 23, 161, 24, 6)}
    ${[66, 150, 234].map((x) => `${ret('k-ouro', x, 160, 20, 8)}${ret('k-texto', x + 26, 160, 40, 8)}${ret('k-barra', x + 74, 152, 1, 24)}`).join('')}`),
};

// tela principal do multiview: mesa ao vivo vista de cima, com as cartas do flop e as faixas das duas mãos (% calculadas de verdade)
const MAO_PADRAO = { cardsA: 'As Kd', cardsB: 'Qc 10h', board: 'Qd 7s 2c Ks 4h' };
function telaPrincipal(p, ctx) {
  const m = ruasDaMao({ cardsA: p.cardsA || MAO_PADRAO.cardsA, cardsB: p.cardsB || MAO_PADRAO.cardsB, board: p.board || MAO_PADRAO.board }) || ruasDaMao(MAO_PADRAO);
  const r = m.ruas[1];
  const verso = `<span class="tx-carta peq tx-carta-fechada"><span class="tx-verso">${VERSO}</span></span>`;
  const faixa = (h, nome, tag, pct, jg, lider) => `<div class="tx-tv-f${lider ? ' lider' : ''}"><span class="tx-tv-f-cartas">${h.map((c) => carta(c, { peq: true })).join('')}</span>
    <span class="tx-tv-f-nome"><small>${esc(tag)}</small><strong>${esc(nome)}</strong><span>${esc(jg)}</span></span><span class="tx-tv-f-pct tx-num">${pct}<small>%</small></span></div>`;
  return `<div class="tx-tv tx-tv-pgm" aria-hidden="true">${tv(mesaCima({ cx: 320, cy: 190, rx: 268, ry: 124, carta: 40, assentos: 8, ativo: 2, comCartas: false, naMao: [2, 6] }), 640, 360)}
      <span class="tx-tv-bug">${MARCA}<b>${esc(ctx.site?.name || 'Seu clube')}</b></span><span class="tx-tv-rua">${esc(r.nome)}</span>
      <div class="tx-tv-board">${m.bd.map((c, i) => (i < 3 ? carta(c, { peq: true }) : verso)).join('')}</div>
      <span class="tx-tv-ex">${esc(p.sample || 'Mão de exemplo · % calculadas')}</span></div>
    <div class="tx-tv-faixas" aria-hidden="true">${faixa(m.a, m.nA, 'Mão A', r.a, r.ja, r.a >= r.b)}${faixa(m.b, m.nB, 'Mão B', r.b, r.jb, r.b > r.a)}</div>
    <p class="tx-sr">Tela principal: mão de exemplo no flop ${m.bd.slice(0, 3).map(falaCarta).join(', ')}. ${esc(m.nA)} com ${r.a}% e ${esc(m.nB)} com ${r.b}% de chance de vitória.</p>`;
}

/* ---------------------------------------------------------------- blocos */

export const blocks = {
  transmissao_topo: {
    label: 'Transmissão · topo com menu',
    fields: [F.text('brand', 'Nome da marca'), F.text('sub', 'Linha de baixo (ex.: Clube 123123)'), F.url('logo', 'Logo (URL; vazio usa a marca desenhada)'),
      F.list('links', 'Links', [F.text('label', 'Texto'), F.url('href', 'Destino'), F.check('live', 'Com ponto de ao vivo')]),
      F.text('cta', 'Botão'), F.url('ctaHref', 'Destino do botão')],
    render: (p, ctx) => `<header class="tx-topo"><div class="tx-caixa tx-topo-in">
      <a class="tx-marca" href="${safeHref('/', ctx.base)}">${img(p.logo, p.brand, 'tx-marca-img') || MARCA}<span><strong>${esc(p.brand || ctx.site.name)}</strong>${p.sub ? `<small>${esc(p.sub)}</small>` : ''}</span></a>
      ${list(p.links).length ? `<nav class="tx-menu" aria-label="Menu">${list(p.links).map((l) => `<a href="${safeHref(l.href, ctx.base)}"${l.live ? ' class="tx-vivo"' : ''}>${l.live ? '<i class="tx-ponto" aria-hidden="true"></i>' : ''}${esc(l.label)}</a>`).join('')}</nav>` : ''}
      ${p.cta ? `<a class="btn btn-sm" href="${safeHref(p.ctaHref, ctx.base)}" data-cta="${esc(p.cta)}">${esc(p.cta)}</a>` : ''}</div></header>`,
  },

  transmissao_abertura: {
    label: 'Transmissão · abertura (placar + título)',
    fields: [F.text('badge', 'Selo do placar (ex.: Ao vivo)'), F.check('live', 'Selo com ponto piscando'), F.text('league', 'Faixa do placar (ex.: NLH · PLO · 24h)'),
      F.text('responsible', 'Aviso +18 do placar'), F.text('title', 'Título'), F.text('titleAccent', 'Fim do título (em destaque)'),
      F.area('lead', 'Texto (use **assim** para negrito)'), F.text('cta', 'Botão principal'), F.url('ctaHref', 'Destino do botão'),
      F.text('secondary', 'Botão secundário'), F.url('secondaryHref', 'Destino secundário'), F.text('note', 'Nota pequena'),
      F.select('variant', 'Composição', ['tese', 'empilhado', 'pagina'])],
    render: (p, ctx) => {
      const v = variant(p, ['tese', 'empilhado', 'pagina'], 'tese');
      const acoes = p.cta || p.secondary ? `<div class="tx-acoes">${botao(p.cta, p.ctaHref, ctx, `btn${v === 'empilhado' ? ' btn-lg' : ''}`)}${p.secondary ? `<a class="btn btn-ghost${v === 'empilhado' ? ' btn-lg' : ''}" href="${safeHref(p.secondaryHref, ctx.base)}" data-cta="${esc(p.secondary)}">${esc(p.secondary)}</a>` : ''}</div>` : '';
      return `<section class="tx-abertura v-${v}"><div class="tx-caixa">
        <div class="tx-placar">${p.badge ? `<span class="tx-selo">${p.live ? '<i class="tx-pisca" aria-hidden="true"></i>' : ''}${esc(p.badge)}</span>` : ''}${p.league ? `<span class="tx-liga">${esc(p.league)}</span>` : ''}${p.responsible ? `<span class="tx-resp"><b>+18</b> ${esc(p.responsible)}</span>` : ''}</div>
        <div class="tx-tese"><h1>${esc(p.title)}${p.titleAccent ? ` <span>${esc(p.titleAccent)}</span>` : ''}</h1>
        ${p.lead || acoes || p.note ? `<div class="tx-lide">${p.lead ? `<p>${rich(p.lead)}</p>` : ''}${acoes}${p.note ? `<p class="tx-nota">${esc(p.note)}</p>` : ''}</div>` : ''}</div>
      </div></section>`;
    },
  },

  transmissao_mao: {
    label: 'Transmissão · mão ao vivo (cartas e % de vitória)',
    fields: [F.text('title', 'Título da seção (opcional)'), F.area('intro', 'Texto da seção (opcional)'),
      F.text('label', 'Placa (ex.: Mão ao vivo · Hold\'em)'), F.text('sample', 'Aviso de exemplo (ex.: Mão de exemplo · % calculadas)'),
      F.text('cardsA', 'Cartas da mão A (ex.: As Kd · naipes s h d c)'), F.text('nameA', 'Nome da mão A (vazio = automático)'), F.text('tagA', 'Rótulo da mão A'),
      F.text('cardsB', 'Cartas da mão B (ex.: Qc 10h)'), F.text('nameB', 'Nome da mão B (vazio = automático)'), F.text('tagB', 'Rótulo da mão B'),
      F.text('board', 'Mesa: 5 cartas (ex.: Qd 7s 2c Ks 4h)'),
      F.text('legPre', 'Legenda do pré-flop (vazio = automática)'), F.text('legFlop', 'Legenda do flop'), F.text('legTurn', 'Legenda do turn'), F.text('legRiver', 'Legenda do river'),
      F.select('variant', 'Composição', ['palco', 'comentada'])],
    render: (p) => {
      const v = variant(p, ['palco', 'comentada'], 'palco');
      const m = ruasDaMao(p);
      const head = cabecalho(p);
      if (!m) {
        return `<section class="tx-mao v-${v}"><div class="tx-caixa">${head}<div class="tx-palco tx-palco-erro"><div class="tx-palco-cab"><span>${esc(p.label || 'Mão ao vivo')}</span></div>
          <p class="tx-legenda">Confira as cartas desta mão no painel: 2 cartas em cada mão e 5 na mesa, sem repetir (ex.: As Kd · Qc 10h · Qd 7s 2c Ks 4h).</p></div></div></section>`;
      }
      const r = m.ruas[3];
      const faixa = (lado, h, nome, tag, pct, jg, lider) => `<div class="tx-faixa" data-lado="${lado}"${lider ? ' data-lider' : ''}>
          <div class="tx-faixa-cartas" aria-hidden="true">${h.map((c) => carta(c, { peq: true })).join('')}</div>
          <div class="tx-faixa-nome"><small>${esc(tag || (lado === 'a' ? 'Mão A' : 'Mão B'))}</small><strong>${esc(nome)}</strong><span data-jogo>${esc(jg)}</span></div>
          <div class="tx-faixa-pct"><span class="tx-num"><span data-pct>${pct}</span><small>%</small></span></div>
          <span class="tx-sr">${esc(nome)}: ${h.map(falaCarta).join(' e ')}.</span></div>`;
      const dados = m.ruas.map(({ nome, abre, a, b, ja, jb, leg }) => ({ nome, abre, a, b, ja, jb, leg }));
      const replay = v === 'comentada' ? `<ol class="tx-replay">${m.ruas.map((x, i) => `<li data-rua-i="${i}"><span class="tx-replay-rua">${esc(x.nome)}</span><span class="tx-num">${x.a}<small>%</small> <i>×</i> ${x.b}<small>%</small></span><p>${esc(x.leg)}</p></li>`).join('')}</ol>` : '';
      return `<section class="tx-mao v-${v}"><div class="tx-caixa">${head}
        <div class="tx-palco" data-tx-mao data-ruas="${esc(JSON.stringify(dados))}">
          <div class="tx-palco-cab"><span>${esc(p.label || 'Mão ao vivo · Hold\'em')}</span>${p.sample ? `<span class="tx-exemplo">${ICO.cam}${esc(p.sample)}</span>` : ''}</div>
          <div class="tx-palco-corpo">
            ${faixa('a', m.a, m.nA, p.tagA, r.a, r.ja, r.a >= r.b)}
            <div class="tx-mesa-cartas"><span class="tx-rua" data-rua>${esc(r.nome)}</span><div class="tx-board" aria-hidden="true">${m.bd.map((c) => carta(c)).join('')}</div>
              <span class="tx-sr">Mesa: ${m.bd.map(falaCarta).join(', ')}.</span></div>
            ${faixa('b', m.b, m.nB, p.tagB, r.b, r.jb, r.b > r.a)}
            <div class="tx-divisao" aria-hidden="true"><i class="da" style="width:${r.a}%"></i><i class="db" style="width:${r.b}%"></i></div>
          </div>
          <div class="tx-palco-pe">
            <div class="tx-ruas" role="group" aria-label="Escolha a rua da mão" hidden>${m.ruas.map((x, i) => `<button type="button" data-ir="${i}" aria-pressed="${i === 3}">${esc(x.nome)}</button>`).join('')}</div>
            <button type="button" class="tx-tocar" hidden>${ICO.pausa}<span>Pausar</span></button>
            <p class="tx-legenda" data-legenda>${esc(r.leg)}</p>
          </div>
        </div>${replay}</div></section>`;
    },
  },

  transmissao_chamada: {
    label: 'Transmissão · faixa de chamada (preto sólido)',
    fields: [F.text('title', 'Frase grande'), F.area('text', 'Texto'), F.text('cta', 'Botão'), F.url('ctaHref', 'Destino'), F.text('note', 'Nota sob o botão'),
      F.select('variant', 'Composição', ['faixa', 'larga'])],
    render: (p, ctx) => `<section class="tx-chamada v-${variant(p, ['faixa', 'larga'], 'faixa')}"><div class="tx-caixa"><div class="tx-chamada-in">
      <p class="tx-chamada-frase">${esc(p.title)}${p.text ? `<span>${rich(p.text)}</span>` : ''}</p>
      ${p.cta || p.note ? `<div class="tx-lado">${botao(p.cta, p.ctaHref, ctx, 'btn btn-lg')}${p.note ? `<small>${esc(p.note)}</small>` : ''}</div>` : ''}</div></div></section>`,
  },

  transmissao_mesa_final: {
    label: 'Transmissão · passos em placa de mesa final',
    fields: [...HEADF, F.text('colStep', 'Coluna 1 (ex.: Passo)'), F.text('colText', 'Coluna 2 (ex.: O que fazer)'), F.text('colValue', 'Coluna 3 (ex.: Leva)'),
      F.list('items', 'Linhas', [F.text('title', 'Título'), F.area('text', 'Texto'), F.text('value', 'Valor da coluna 3'), F.check('lead', 'Linha em destaque')]),
      F.area('note', 'Nota abaixo'), F.select('variant', 'Composição', ['dupla', 'larga'])],
    render: (p) => {
      const v = variant(p, ['dupla', 'larga'], 'dupla');
      const itens = list(p.items);
      const temValor = itens.some((i) => i.value);
      const tabela = `<div class="tx-mf${temValor ? '' : ' sem-valor'}" role="list">
        <div class="tx-mf-cab" aria-hidden="true"><span>${esc(p.colStep || 'Passo')}</span><span>${esc(p.colText || 'O que fazer')}</span>${temValor ? `<span>${esc(p.colValue || 'Leva')}</span>` : ''}</div>
        ${itens.map((i, n) => `<div class="tx-mf-linha${i.lead ? ' lider' : ''}" role="listitem"><span class="tx-mf-pos">${n + 1}</span><div class="tx-mf-txt"><strong>${esc(i.title)}</strong>${i.text ? `<span>${rich(i.text)}</span>` : ''}</div>${temValor ? `<span class="tx-mf-val">${esc(i.value)}</span>` : ''}</div>`).join('')}
      </div>${p.note ? `<p class="tx-mf-nota">${rich(p.note)}</p>` : ''}`;
      return `<section class="tx-secao tx-mesa v-${v}"><div class="tx-caixa${v === 'dupla' ? ' tx-dupla' : ''}">${cabecalho(p)}<div>${tabela}</div></div></section>`;
    },
  },

  transmissao_pix: {
    label: 'Transmissão · quadro do PIX (dados da primeira compra)',
    fields: [F.text('title', 'Título do quadro'), F.text('text', 'Texto ao lado do título'),
      F.list('items', 'Dados', [F.text('label', 'Rótulo'), F.text('value', 'Valor'), F.text('text', 'Explicação'), F.select('style', 'Estilo do valor', ['numero', 'texto'])]),
      F.list('flow', 'Linha de baixo', [F.select('icon', 'Ícone', ICONES), F.text('strong', 'Início em negrito'), F.text('text', 'Resto da frase')]),
      F.text('link', 'Link final'), F.url('linkHref', 'Destino do link')],
    render: (p, ctx) => {
      const itens = list(p.items), fluxo = list(p.flow);
      return `<section class="tx-secao tx-pix"><div class="tx-caixa"><div class="tx-pix-quadro">
        <div class="tx-pix-cab"><h2>${esc(p.title)}</h2>${p.text ? `<p>${rich(p.text)}</p>` : ''}</div>
        ${itens.length ? `<dl class="tx-pix-dados" style="--n:${Math.min(itens.length, 4)}">${itens.map((i) => `<div><dt>${esc(i.label)}</dt><dd class="${i.style === 'texto' ? 'txt' : 'tx-num'}">${esc(i.value || '—')}</dd>${i.text ? `<dd class="tx-pix-exp">${rich(i.text)}</dd>` : ''}</div>`).join('')}</dl>` : ''}
        ${fluxo.length || p.link ? `<ul class="tx-pix-fluxo">${fluxo.map((f) => `<li>${ICO[ICONES.includes(f.icon) ? f.icon : 'check']}<span>${f.strong ? `<strong>${esc(f.strong)}</strong> ` : ''}${esc(f.text)}</span></li>`).join('')}${p.link ? `<li class="tx-acao"><a class="tx-link-seta" href="${safeHref(p.linkHref, ctx.base)}">${esc(p.link)}${ICO.seta}</a></li>` : ''}</ul>` : ''}
      </div></div></section>`;
    },
  },

  transmissao_canais: {
    label: 'Transmissão · faixa de jogos / canais',
    fields: [...HEADF, F.list('items', 'Itens', [F.text('name', 'Nome'), F.area('text', 'Texto'), F.check('lead', 'Em destaque')])],
    render: (p) => {
      const itens = list(p.items);
      return `<section class="tx-secao tx-canais-sec"><div class="tx-caixa">${cabecalho(p)}<div class="tx-canais" style="--n:${Math.min(Math.max(itens.length, 1), 4)}">${itens.map((i) => `<div${i.lead ? ' class="lider"' : ''}><strong>${esc(i.name)}</strong>${i.text ? `<span>${rich(i.text)}</span>` : ''}</div>`).join('')}</div></div></section>`;
    },
  },

  transmissao_grade: {
    label: 'Transmissão · grade de torneios',
    fields: [...HEADF, F.text('heading', 'Placa da grade (ex.: Destaques da noite)'), F.text('source', 'Fonte / atualização'), F.check('sample', 'É grade de exemplo (mostra o selo Exemplo)'),
      F.list('items', 'Torneios', [F.text('period', 'Faixa do dia (opcional: Manhã, Tarde, Noite)'), F.text('time', 'Hora'), F.text('name', 'Torneio'), F.text('game', 'Jogo'), F.text('buyin', 'Buy-in'), F.text('prize', 'Garantido'), F.check('lead', 'Em destaque')]),
      F.text('foot', 'Texto do rodapé da grade'), F.text('link', 'Link'), F.url('linkHref', 'Destino do link'), ...AO_VIVO],
    render: (p, ctx) => {
      let periodo = '';
      const linhas = list(p.items).map((i) => {
        const cab = i.period && i.period !== periodo ? `<tr class="tx-periodo"><th colspan="5" scope="colgroup">${esc(i.period)}</th></tr>` : '';
        if (i.period) periodo = i.period;
        return `${cab}<tr${i.lead ? ' class="top"' : ''}><td class="h">${esc(i.time)}</td><td class="n">${esc(i.name)}${contagem(i)}</td><td class="j" data-buyin="${i.buyin ? ` · ${esc(i.buyin)}` : ''}">${esc(i.game)}</td><td class="bi">${esc(i.buyin)}</td><td class="g">${esc(i.prize)}</td></tr>`;
      }).join('');
      return `<section class="tx-secao tx-grade-sec"><div class="tx-caixa">${cabecalho(p)}<div class="tx-grade">
        <div class="tx-grade-cab"><strong><i class="tx-ponto" aria-hidden="true"></i>${esc(p.heading || 'Grade do dia')}</strong><span>${p.sample ? '<b class="tx-tag">Exemplo</b>' : ''}${esc(p.source)}</span></div>
        <table><caption class="tx-sr">${esc(p.title || p.heading || 'Grade de torneios')}${p.sample ? ' (exemplo)' : ''}</caption>
        <thead><tr><th scope="col">Hora</th><th scope="col">Torneio</th><th scope="col">Jogo</th><th scope="col" class="bi">Buy-in</th><th scope="col" class="g">Garantido</th></tr></thead><tbody>${linhas}</tbody></table>
        ${p.foot || p.link ? `<div class="tx-grade-pe"><span>${rich(p.foot)}</span>${p.link ? `<a class="tx-link-seta" href="${safeHref(p.linkHref, ctx.base)}">${esc(p.link)}${ICO.seta}</a>` : ''}</div>` : ''}
      </div></div></section>`;
    },
  },

  transmissao_letreiro: {
    label: 'Transmissão · letreiro fixo de torneios (rodapé da tela)',
    fields: [F.text('label', 'Rótulo (ex.: Hoje na liga)'), F.text('labelShort', 'Rótulo curto no celular (ex.: Hoje)'), F.url('href', 'Destino do rótulo'),
      F.check('sample', 'É grade de exemplo (mostra Exemplo no rótulo)'),
      F.list('items', 'Itens', [F.text('time', 'Hora'), F.text('name', 'Nome'), F.text('detail', 'Detalhe (jogo, buy-in, garantido)')]), ...AO_VIVO],
    render: (p, ctx) => {
      const li = list(p.items).map((i) => `<li><span class="tx-num">${esc(i.time)}</span><b>${esc(i.name)}</b>${esc(i.detail)}</li>`).join('');
      const rot = p.label || 'Hoje';
      return `<div class="tx-letreiro" role="region" aria-label="${esc(rot)}">
        <a class="tx-letreiro-rot" href="${safeHref(p.href, ctx.base)}"><i class="tx-ponto" aria-hidden="true"></i><span class="l">${esc(rot)}</span><span class="c">${esc(p.labelShort || rot)}</span>${p.sample ? '<em>Exemplo</em>' : ''}</a>
        <div class="tx-letreiro-trilho" tabindex="0" aria-label="Lista: ${esc(rot)}"><div class="tx-letreiro-faixa"><ul>${li}</ul><ul aria-hidden="true">${li}</ul></div></div>
        <button type="button" class="tx-letreiro-pausa" aria-label="Pausar o letreiro" aria-pressed="false" hidden>${ICO.pausa}</button></div>`;
    },
  },

  transmissao_confronto: {
    label: 'Transmissão · placa de confronto (rótulo, número, texto)',
    fields: [...HEADF, F.list('items', 'Linhas', [F.text('label', 'Rótulo'), F.text('value', 'Valor grande (curto: 24, PIX, +18)'), F.text('unit', 'Unidade pequena (h, min)'), F.area('text', 'Texto (use **assim** para negrito)')])],
    render: (p) => `<section class="tx-secao tx-confronto-sec"><div class="tx-caixa">${cabecalho(p)}<dl class="tx-confronto">${list(p.items).map((i) => `<div class="tx-cf"><dt>${esc(i.label)}</dt><dd class="v"><span class="tx-num">${esc(i.value)}${i.unit ? `<small>${esc(i.unit)}</small>` : ''}</span></dd><dd class="d">${rich(i.text)}</dd></div>`).join('')}</dl></div></section>`,
  },

  transmissao_multiview: {
    label: 'Transmissão · multiview (tela principal + monitores)',
    fields: [...HEADF, F.list('items', 'Monitores (o primeiro é a tela principal)', [F.text('cam', 'Etiqueta (ex.: CAM 1)'), F.text('title', 'Título'), F.area('text', 'Texto'),
      F.select('art', 'Grafismo', TELAS)]), F.area('note', 'Nota abaixo'),
      F.text('cardsA', 'Tela principal · cartas da mão A (ex.: As Kd)'), F.text('cardsB', 'Tela principal · cartas da mão B (ex.: Qc 10h)'),
      F.text('board', 'Tela principal · mesa, 5 cartas (mostra o flop)'), F.text('sample', 'Tela principal · aviso de exemplo')],
    render: (p, ctx) => {
      const itens = list(p.items);
      return `<section class="tx-secao tx-multiview"><div class="tx-caixa">${cabecalho(p)}<div class="tx-mv${itens.length < 2 ? ' so-um' : ''}">${itens.map((i, n) => {
        const art = TELAS.includes(i.art) ? i.art : 'mesa';
        const tela = n === 0 && art === 'mesa' ? telaPrincipal(p, ctx) : `<div class="tx-tv" aria-hidden="true">${TELA_SVG[art]}</div>`;
        return `<article class="tx-mv-tela${n === 0 ? ' pgm' : ''}" data-tela="${art}">
        <header class="tx-mv-cab"><span class="tx-mv-cam">${n === 0 ? '<i class="tx-tally" aria-hidden="true"></i>' : ''}${esc(i.cam || `CAM ${n + 1}`)}</span>${n === 0 ? '<span class="tx-mv-noar">No ar</span>' : `<span class="tx-mv-fonte">${esc(FONTE[art])}</span>`}</header>
        <div class="tx-mv-corpo">${tela}<div class="tx-mv-faixa"><h3>${esc(i.title)}</h3>${i.text ? `<p>${rich(i.text)}</p>` : ''}</div></div></article>`;
      }).join('')}</div>${p.note ? `<p class="tx-mf-nota">${rich(p.note)}</p>` : ''}</div></section>`;
    },
  },

  transmissao_pauta: {
    label: 'Transmissão · pauta (conteúdos como guia de programação)',
    fields: [...HEADF, F.list('items', 'Conteúdos', [F.text('slot', 'Selo (ex.: Replay, Guia, Básico)'), F.text('title', 'Título'), F.area('text', 'Resumo'), F.text('meta', 'Detalhe (ex.: 6 min de leitura)'), F.url('href', 'Link')]),
      F.text('link', 'Link final'), F.url('linkHref', 'Destino do link final'), F.select('variant', 'Composição', ['destaque', 'lista'])],
    render: (p, ctx) => {
      const v = variant(p, ['destaque', 'lista'], 'destaque');
      const itens = list(p.items);
      const ar = v === 'destaque' && itens.length ? itens[0] : null;
      const resto = ar ? itens.slice(1) : itens;
      return `<section class="tx-secao tx-pauta v-${v}"><div class="tx-caixa">${cabecalho(p)}<div class="tx-pauta-grade">
        ${ar ? `<a class="tx-pauta-ar" href="${safeHref(ar.href, ctx.base)}"><span class="tx-pauta-selo"><i class="tx-tally" aria-hidden="true"></i>${esc(ar.slot || 'Em destaque')}</span><h3>${esc(ar.title)}</h3>${ar.text ? `<p>${rich(ar.text)}</p>` : ''}<span class="tx-pauta-meta">${esc(ar.meta)}${ICO.seta}</span></a>` : ''}
        ${resto.length ? `<ol class="tx-pauta-lista">${resto.map((i) => `<li><a href="${safeHref(i.href, ctx.base)}"><span class="tx-pauta-hora">${esc(i.slot)}</span><span class="tx-pauta-txt"><strong>${esc(i.title)}</strong>${i.text ? `<span>${rich(i.text)}</span>` : ''}</span><span class="tx-pauta-meta">${esc(i.meta)}${ICO.seta}</span></a></li>`).join('')}</ol>` : ''}
      </div>${p.link ? `<p class="tx-pauta-pe"><a class="tx-link-seta" href="${safeHref(p.linkHref, ctx.base)}">${esc(p.link)}${ICO.seta}</a></p>` : ''}</div></section>`;
    },
  },

  transmissao_glossario: {
    label: 'Transmissão · glossário com índice de letras',
    fields: [...HEADF, F.list('items', 'Termos', [F.text('term', 'Termo'), F.text('abbr', 'Sigla (opcional)'), F.area('text', 'Definição')])],
    render: (p) => {
      const letra = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().charAt(0).toUpperCase();
      const grupos = new Map();
      for (const i of [...list(p.items)].sort((x, y) => String(x.term).localeCompare(String(y.term), 'pt-BR'))) {
        const l = /[A-Z]/.test(letra(i.term)) ? letra(i.term) : '#';
        if (!grupos.has(l)) grupos.set(l, []);
        grupos.get(l).push(i);
      }
      const id = (l) => `gl-${l === '#' ? 'num' : l.toLowerCase()}`;
      return `<section class="tx-secao tx-glossario"><div class="tx-caixa">${cabecalho(p)}
        <nav class="tx-gl-indice" aria-label="Letras do glossário">${[...grupos.keys()].map((l) => `<a href="#${id(l)}">${esc(l)}</a>`).join('')}</nav>
        <div class="tx-gl-grupos">${[...grupos].map(([l, itens]) => `<div class="tx-gl-grupo" id="${id(l)}"><span class="tx-gl-letra" aria-hidden="true">${esc(l)}</span><dl>${itens.map((i) => `<div class="tx-gl-item"><dt>${esc(i.term)}${i.abbr ? ` <abbr>${esc(i.abbr)}</abbr>` : ''}</dt><dd>${rich(i.text)}</dd></div>`).join('')}</dl></div>`).join('')}</div>
      </div></section>`;
    },
  },

  transmissao_final: {
    label: 'Transmissão · chamada final com formulário (vai para o CRM)',
    fields: [F.text('title', 'Título'), F.text('titleAccent', 'Fim do título (em destaque)'), F.area('text', 'Texto'), F.text('responsible', 'Aviso +18'),
      F.select('fields', 'Campos', ['email', 'email_nome', 'email_nome_telefone']), F.text('button', 'Texto do botão'), F.text('help', 'Ajuda sob o formulário'),
      F.text('success', 'Mensagem de sucesso'), F.area('consent', 'Texto de consentimento')],
    render: (p, ctx) => {
      const f = ['email', 'email_nome', 'email_nome_telefone'].includes(p.fields) ? p.fields : 'email';
      const consent = p.consent || 'Concordo em receber contato sobre o clube. Posso sair quando quiser.';
      const so = f === 'email';
      const email = '<label class="tx-campo"><span>Seu e-mail</span><input name="email" type="email" inputmode="email" autocomplete="email" maxlength="120" placeholder="voce@email.com" required></label>';
      const enviar = `<button class="btn btn-lg" type="submit">${esc(p.button || 'Enviar')}${ICO.seta}</button>`;
      return `<section class="tx-final"><div class="tx-caixa tx-final-in">
        <div><h2>${esc(p.title)}${p.titleAccent ? ` <span>${esc(p.titleAccent)}</span>` : ''}</h2>${p.text ? `<p class="tx-intro">${rich(p.text)}</p>` : ''}${p.responsible ? `<p class="tx-responsa"><b>+18</b> ${esc(p.responsible)}</p>` : ''}</div>
        <form class="lead-form tx-form${so ? ' so-email' : ''}" method="post" action="${esc(ctx.formAction)}" data-success="${esc(p.success || 'Recebemos! Confira o seu e-mail.')}">
          <input type="hidden" name="page" value="${esc(ctx.page.slug)}">
          ${f.includes('nome') ? '<label class="tx-campo"><span>Nome</span><input name="name" autocomplete="name" maxlength="80" required></label>' : ''}
          ${so ? `<div class="tx-linha">${email}${enviar}</div>` : email}
          ${f.includes('telefone') ? '<label class="tx-campo"><span>WhatsApp</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="(11) 90000-0000"></label>' : ''}
          <label class="check"><input type="checkbox" name="consent" value="1" required> <span>${esc(consent)}</span></label>
          <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
          ${so ? '' : enviar}
          <p class="form-msg" role="status" aria-live="polite"></p>
          ${p.help ? `<p class="tx-ajuda">${esc(p.help)}</p>` : ''}
        </form></div></section>`;
    },
  },
};
