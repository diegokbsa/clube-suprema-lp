// Interação-assinatura do mundo "comprovante": o seletor de valor muda o comprovante ao vivo (número rola, status
// "carimba", código e resumo final acompanham), anotações descem até a linha que explicam e acendem junto com ela,
// botões de copiar e compartilhar, data de "amanhã" e menu do celular. Sem JS a página funciona com o valor padrão.
// Roda só em body[data-world="comprovante"]; respeita prefers-reduced-motion.
(() => {
  const body = document.body;
  if (!body || body.dataset.world !== 'comprovante') return;
  document.documentElement.classList.add('cp-js');
  const calmo = window.matchMedia('(prefers-reduced-motion: reduce)');
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const digits = (s) => String(s || '').replace(/\D/g, '');

  // "Amanhã, depois do seu cadastro" -> "Amanhã, 07/11/2026 · depois do seu cadastro"
  $$('[data-cp-quando]').forEach((el) => {
    const t = el.textContent.trim();
    if (!/^amanh[ãa]/i.test(t)) return;
    const d = new Date(); d.setDate(d.getDate() + 1);
    const data = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const resto = t.replace(/^amanh[ãa][\s,·]*/i, '');
    el.textContent = `Amanhã, ${data}${resto ? ` · ${resto}` : ''}`;
  });

  function copiar(txt) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(txt).then(() => true, () => fallback(txt));
    return Promise.resolve(fallback(txt));
  }
  function fallback(txt) {
    try {
      const t = document.createElement('textarea');
      t.value = txt; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      const ok = document.execCommand('copy'); t.remove(); return ok;
    } catch { return false; }
  }
  const replay = (el, cls) => { if (!el || calmo.matches) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

  // ---------- comprovante ao vivo ----------
  $$('[data-cp-recibo]').forEach((bloco) => {
    const radios = $$('.cp-op input', bloco);
    const int = bloco.querySelector('[data-cp-int]');
    const num = bloco.querySelector('[data-cp-num]');
    const status = bloco.querySelector('[data-cp-status]');
    const txid = bloco.querySelector('[data-cp-txid]');
    const linha = bloco.querySelector('[data-cp-linha]');
    const aviso = bloco.querySelector('[data-cp-aviso]');
    const moeda = bloco.querySelector('.cp-moeda')?.textContent || '';
    const cent = bloco.querySelector('.cp-cent')?.textContent || '';
    const titulo = bloco.querySelector('.cp-comp-cab h2')?.firstChild?.textContent || 'Comprovante';
    const fmt = (v) => `${moeda ? `${moeda} ` : ''}${v}${cent}`;

    function aplicar(r, anunciar) {
      const v = r.value;
      if (int) int.textContent = v;
      if (txid) txid.textContent = `${txid.dataset.cpTxid}${(digits(v) || '0').padStart(3, '0')}`;
      if (linha) { linha.textContent = r.dataset.line || ''; linha.hidden = !r.dataset.line; }
      $$('[data-cp-resumo]').forEach((el) => { el.textContent = fmt(v); });
      replay(num, 'cp-rola'); replay(status, 'cp-carimbo');
      if (anunciar && aviso) aviso.textContent = `${titulo}, ilustração atualizada: ${fmt(v)}${r.dataset.line ? ` · ${r.dataset.line}` : ''}.`;
      requestAnimationFrame(alinhar);
    }
    radios.forEach((r) => r.addEventListener('change', () => { if (r.checked) aplicar(r, true); }));
    const marcado = radios.find((r) => r.checked);
    if (marcado) $$('[data-cp-resumo]').forEach((el) => { el.textContent = fmt(marcado.value); });

    // compartilhar (como no app do banco): menu do sistema ou copia o link
    bloco.querySelector('[data-cp-share]')?.addEventListener('click', (e) => {
      const dados = { title: document.title, text: e.currentTarget.dataset.text || document.title, url: location.href.split('#')[0] };
      if (navigator.share) { navigator.share(dados).catch(() => {}); return; }
      copiar(dados.url).then((ok) => { if (aviso) aviso.textContent = ok ? 'Link copiado. É só colar na conversa.' : `Não deu para copiar. O link é ${dados.url}`; });
    });

    // anotações: descem até a linha que explicam (computador) e acendem junto com ela
    const notas = $$('.cp-nota', bloco);
    const alvo = (n) => bloco.querySelector(`[data-cp-row="${n.dataset.cpAlvo}"]`);
    function alinhar() {
      if (!notas.length || getComputedStyle(notas[0]).position !== 'absolute') { notas.forEach((n) => { n.style.top = ''; }); return; }
      const base = notas[0].offsetParent.getBoundingClientRect().top;
      let fim = -Infinity;
      notas.forEach((n) => {
        const a = alvo(n);
        if (!a) return;
        const r = a.getBoundingClientRect();
        let topo = r.top - base + r.height / 2 - n.offsetHeight / 2;
        topo = Math.max(topo, fim + 14);
        n.style.top = `${Math.round(topo)}px`;
        fim = topo + n.offsetHeight;
      });
    }
    const acende = (n, on) => { n.classList.toggle('is-alvo', on); alvo(n)?.classList.toggle('is-alvo', on); };
    notas.forEach((n) => {
      const a = alvo(n);
      n.addEventListener('mouseenter', () => acende(n, true));
      n.addEventListener('mouseleave', () => acende(n, false));
      a?.addEventListener('mouseenter', () => acende(n, true));
      a?.addEventListener('mouseleave', () => acende(n, false));
    });
    window.addEventListener('resize', alinhar);
    if (document.fonts?.ready) document.fonts.ready.then(alinhar);
    alinhar();
  });

  // ---------- copiar dados (clube, agente) ----------
  $$('[data-cp-copiar]').forEach((b) => {
    const rot = b.querySelector('span');
    let t;
    b.addEventListener('click', () => {
      copiar(b.dataset.cpCopiar).then((ok) => {
        rot.textContent = ok ? 'Copiado' : 'Copie à mão';
        b.classList.toggle('ok', ok);
        clearTimeout(t);
        t = setTimeout(() => { rot.textContent = 'Copiar'; b.classList.remove('ok'); }, 2200);
      });
    });
  });

  // ---------- menu do celular (details): fecha ao escolher, com Esc e ao tocar fora ----------
  $$('.cp-mmenu').forEach((d) => {
    d.addEventListener('click', (e) => { if (e.target.closest('nav a')) d.open = false; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && d.open) { d.open = false; d.querySelector('summary')?.focus(); } });
    document.addEventListener('click', (e) => { if (d.open && !d.contains(e.target)) d.open = false; });
  });
})();
