// Interação-assinatura do mundo "transmissao": a mão roda pré-flop → flop → turn → river como numa transmissão
// (cartas abrem, % contam, faixa do líder acende), com seletor de ruas e botão de pausar; o letreiro de torneios ganha pausa.
// Sem JS a página mostra o river e o letreiro corre sozinho (pausa no hover). Respeita prefers-reduced-motion.
(() => {
  if (document.body.dataset.world !== 'transmissao') return;
  const reduz = window.matchMedia('(prefers-reduced-motion: reduce)');
  const PAUSA = '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';
  const TOCAR = '<path d="M6 3l15 9-15 9z"/>';

  function conta(el, de, para) {
    if (reduz.matches || de === para) { el.textContent = para; return; }
    const dur = 650;
    let t0 = null;
    const passo = (t) => {
      if (!t0) t0 = t;
      const k = Math.min(1, (t - t0) / dur);
      const e = k === 1 ? 1 : 1 - 2 ** (-10 * k);
      el.textContent = Math.round(de + (para - de) * e);
      if (k < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }

  document.querySelectorAll('[data-tx-mao]').forEach((palco) => {
    let ruas;
    try { ruas = JSON.parse(palco.dataset.ruas || '[]'); } catch { return; }
    if (ruas.length !== 4) return;
    const cartas = palco.querySelectorAll('.tx-board .tx-carta');
    const fa = palco.querySelector('[data-lado="a"]'), fb = palco.querySelector('[data-lado="b"]');
    const pa = fa.querySelector('[data-pct]'), pb = fb.querySelector('[data-pct]');
    const ja = fa.querySelector('[data-jogo]'), jb = fb.querySelector('[data-jogo]');
    const rua = palco.querySelector('[data-rua]'), leg = palco.querySelector('[data-legenda]');
    const da = palco.querySelector('.tx-divisao .da'), db = palco.querySelector('.tx-divisao .db');
    const grupo = palco.querySelector('.tx-ruas');
    const botoes = palco.querySelectorAll('[data-ir]');
    const tocar = palco.querySelector('.tx-tocar');
    const replay = palco.parentElement.querySelectorAll('.tx-replay [data-rua-i]');
    let atual = 3, timer = null, rodando = false, emCima = false, visivel = true;

    function mostra(i) {
      const r = ruas[i];
      cartas.forEach((c, n) => c.classList.toggle('aberta', n < r.abre));
      conta(pa, +pa.textContent, r.a);
      conta(pb, +pb.textContent, r.b);
      ja.textContent = r.ja; jb.textContent = r.jb; rua.textContent = r.nome; leg.textContent = r.leg;
      da.style.width = `${r.a}%`; db.style.width = `${r.b}%`;
      if (r.a >= r.b) { fa.setAttribute('data-lider', ''); fb.removeAttribute('data-lider'); } else { fb.setAttribute('data-lider', ''); fa.removeAttribute('data-lider'); }
      botoes.forEach((b) => b.setAttribute('aria-pressed', +b.dataset.ir === i ? 'true' : 'false'));
      replay.forEach((li) => li.classList.toggle('agora', +li.dataset.ruaI === i));
      atual = i;
    }
    function agenda() {
      clearTimeout(timer);
      if (!rodando || emCima || !visivel || document.hidden) return;
      timer = setTimeout(() => { mostra((atual + 1) % ruas.length); agenda(); }, atual === 3 ? 4200 : 2800);
    }
    function setRodando(v) {
      rodando = v;
      tocar.querySelector('svg').innerHTML = v ? PAUSA : TOCAR;
      tocar.querySelector('span').textContent = v ? 'Pausar' : 'Rodar a mão';
      tocar.setAttribute('aria-pressed', v ? 'true' : 'false');
      agenda();
    }
    botoes.forEach((b) => b.addEventListener('click', () => { mostra(+b.dataset.ir); setRodando(false); }));
    tocar.addEventListener('click', () => { if (!rodando && atual === 3) mostra(0); setRodando(!rodando); });
    palco.addEventListener('mouseenter', () => { emCima = true; clearTimeout(timer); });
    palco.addEventListener('mouseleave', () => { emCima = false; agenda(); });
    palco.addEventListener('focusin', () => { emCima = true; clearTimeout(timer); });
    palco.addEventListener('focusout', () => { emCima = false; agenda(); });
    document.addEventListener('visibilitychange', agenda);
    // só roda enquanto o palco está na tela
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => { visivel = es[0].isIntersecting; agenda(); }, { threshold: 0.25 }).observe(palco);
    }
    grupo.hidden = false;
    tocar.hidden = false;
    replay.forEach((li) => li.classList.toggle('agora', +li.dataset.ruaI === 3));
    // começa no river (a mão completa, igual à página sem JS), segura e depois roda desde o pré-flop
    setRodando(!reduz.matches);
  });

  // letreiro: pausa manual (o hover e o foco já pausam pelo CSS)
  document.querySelectorAll('.tx-letreiro').forEach((let_) => {
    const bt = let_.querySelector('.tx-letreiro-pausa');
    if (!bt || reduz.matches) return;
    bt.hidden = false;
    bt.addEventListener('click', () => {
      const parado = let_.classList.toggle('parado');
      bt.setAttribute('aria-pressed', parado ? 'true' : 'false');
      bt.setAttribute('aria-label', parado ? 'Retomar o letreiro' : 'Pausar o letreiro');
      bt.querySelector('svg').innerHTML = parado ? TOCAR : PAUSA;
    });
  });
})();
