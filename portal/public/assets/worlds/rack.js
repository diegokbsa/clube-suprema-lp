// Interação-assinatura do mundo "rack": montar a pilha do primeiro PIX (bloco rack_caixa).
// Toque numa ficha e ela cai na bandeja; o total do exemplo soma na hora. Nada é cobrado: é ilustração do fluxo.
// Roda só em body[data-world="rack"]; sem JS a página continua inteira (os controles da pilha ficam escondidos).
(() => {
  if (document.body.dataset.world !== 'rack') return;
  const reduz = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // mesma geometria das fichas desenhadas no servidor (lib/worlds/rack.mjs)
  const ANG = [0, 60, 120, 180, 240, 300];
  const MEIA = (13 / 98) * (180 / Math.PI);
  const r2 = (n) => Math.round(n * 100) / 100;
  const face = (rot) => `<circle class="f" r="98"/><g class="s">${ANG.map((a) => `<rect x="-13" y="-96" width="26" height="23" rx="2" transform="rotate(${a + rot})"/>`).join('')}</g>`
    + '<circle class="r" r="69" fill="none" stroke-width="2.5"/><circle class="c" r="61"/><circle class="d" r="53" fill="none" stroke-width="2" stroke-dasharray="5 6"/>';
  function lado(ry, h, rot) {
    let polys = '';
    for (const a0 of ANG) {
      const a = (((a0 + rot) % 360) + 360) % 360;
      const ini = Math.max(90, a - MEIA); const fim = Math.min(270, a + MEIA);
      if (fim - ini < 1) continue;
      const topo = [];
      for (let k = 0; k <= 4; k++) { const f = ((ini + ((fim - ini) * k) / 4) * Math.PI) / 180; topo.push([98 * Math.sin(f), -ry * Math.cos(f)]); }
      const pts = [...topo, ...topo.slice().reverse().map(([x, y]) => [x, y + h])];
      polys += `<polygon points="${pts.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ')}"/>`;
    }
    return `<path class="e" d="M-98 0A98 ${ry} 0 0 0 98 0L98 ${h}A98 ${ry} 0 0 1 -98 ${h}Z"/><g class="s">${polys}</g><path class="l" d="M-98 ${h}A98 ${ry} 0 0 0 98 ${h}" fill="none"/>`;
  }
  const RY = 35.28; const H = 24;
  const iso = (rot) => `${lado(RY, H, rot)}<g transform="scale(1 ${r2(RY / 98)})">${face(rot)}</g>`;
  const NS = 'http://www.w3.org/2000/svg';
  const MAX = 12; const Y0 = 228.4; const PASSO = 12; const ESCALA = 0.5;

  document.querySelectorAll('[data-rk-caixa]').forEach((sec) => {
    const moeda = sec.dataset.moeda || 'R$';
    const brl = (n) => `${moeda} ${n.toLocaleString('pt-BR')}`;
    const botoes = [...sec.querySelectorAll('.rk-ficha-btn')];
    const cols = new Map([...sec.querySelectorAll('[data-col]')].map((g) => [Number(g.dataset.col), g]));
    const cont = new Map([...cols.keys()].map((v) => [v, 0]));
    const ordem = [];
    const $ = (sel) => sec.querySelector(sel);
    const tirar = $('[data-acao="tirar"]'); const zerar = $('[data-acao="zerar"]');
    const cta = $('.rk-caixa-acao .btn');
    const ctaBase = cta ? cta.textContent : '';

    function por(v) {
      const col = cols.get(v);
      if (!col || cont.get(v) >= MAX) return;
      const i = cont.get(v);
      cont.set(v, i + 1);
      ordem.push(v);
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('transform', `translate(${col.dataset.x} ${r2(Y0 - i * PASSO)}) scale(${ESCALA})`);
      const dentro = document.createElementNS(NS, 'g');
      if (!reduz) dentro.setAttribute('class', 'rk-cai');
      dentro.innerHTML = iso(i % 2 ? 30 : 0);
      g.appendChild(dentro);
      col.appendChild(g);
      atualiza();
    }
    function tira() {
      const v = ordem.pop();
      if (v === undefined) return;
      cont.set(v, cont.get(v) - 1);
      cols.get(v)?.lastElementChild?.remove();
      atualiza();
    }
    function atualiza() {
      const total = ordem.reduce((s, v) => s + v, 0);
      const n = ordem.length;
      const qtd = n === 0 ? 'nenhuma ficha' : n === 1 ? '1 ficha' : `${n} fichas`;
      $('[data-total]').textContent = brl(total);
      $('[data-qtd]').textContent = qtd;
      $('.rk-vazio').hidden = n > 0;
      tirar.disabled = n === 0;
      zerar.disabled = n === 0;
      if (cta) cta.textContent = total > 0 ? `${ctaBase} com ${brl(total)}` : ctaBase;
      $('[data-anuncio]').textContent = n === 0 ? 'Pilha vazia.' : `Total do exemplo: ${brl(total)}, em ${qtd}.`;
      botoes.forEach((b) => {
        const v = Number(b.dataset.v);
        const cheia = cont.get(v) >= MAX;
        b.disabled = cheia;
        b.setAttribute('aria-label', cheia ? `Pilha de ${brl(v)} cheia` : `Adicionar ficha de ${brl(v)}`);
        b.querySelector('span').textContent = cheia ? 'pilha cheia' : brl(v);
      });
    }
    botoes.forEach((b) => b.addEventListener('click', () => por(Number(b.dataset.v))));
    tirar.addEventListener('click', tira);
    zerar.addEventListener('click', () => { while (ordem.length) tira(); botoes[0]?.focus(); });
    sec.setAttribute('data-pronto', '');
  });

  // link para o cadastro: depois de rolar, o cursor já fica no campo de e-mail
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const alvo = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
    const campo = alvo && alvo.querySelector('.rk-form input[name="email"], .rk-form input[name="name"]');
    if (campo) setTimeout(() => campo.focus({ preventScroll: true }), reduz ? 0 : 450);
  });
})();
