// Interação-assinatura do mundo "relogio": hora de Brasília ao vivo, contagem regressiva para o próximo torneio da grade editável,
// estado ao vivo da grade (registro aberto, encerrado, próximo), relógio de nível do exemplo do blog e botões Copiar.
// Sem JS a página já mostra tudo estático (a grade e o horário do primeiro torneio). Com prefers-reduced-motion: minutos, sem segundos.
(() => {
  if (document.body.dataset.world !== 'relogio') return;
  const reduz = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const DIA = 86400;
  const dois = (n) => String(n).padStart(2, '0');
  const seg = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); return m ? (+m[1]) * 3600 + (+m[2]) * 60 : null; };
  function agora() {
    const o = {};
    fmt.formatToParts(new Date()).forEach((p) => { o[p.type] = p.value; });
    const h = +o.hour % 24;
    return { s: h * 3600 + (+o.minute) * 60 + (+o.second), hm: `${dois(h)}:${o.minute}` };
  }
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const slot = (el, k) => el.querySelector(`[data-rl="${k}"]`);
  const put = (el, k, txt) => { const n = slot(el, k); if (n && n.textContent !== txt) n.textContent = txt; };

  /* hora ao vivo */
  const relogios = $$('[data-rl-relogio]');
  relogios.forEach((n) => { n.hidden = false; });

  /* monitores: contagem até o próximo horário da grade (a grade se repete todo dia) */
  const monitores = $$('[data-rl-monitor]').map((el) => {
    let g = [];
    try { g = JSON.parse(el.dataset.grade || '[]'); } catch { g = []; }
    g = g.map((t) => ({ ...t, ini: seg(t.h) })).filter((t) => t.ini != null).sort((a, b) => a.ini - b.ini);
    return { el, g, fila: el.querySelector('[data-rl-fila]'), ultimo: -1 };
  }).filter((m) => m.g.length);

  function contagem(m, s) {
    const { el, g } = m;
    let i = g.findIndex((t) => t.ini > s);
    let alvoIni;
    if (i < 0) { i = 0; alvoIni = g[0].ini + DIA; } else alvoIni = g[i].ini;
    const alvo = g[i];
    let prox = g[(i + 1) % g.length];
    for (let k = 1; k < g.length; k++) { const c = g[(i + k) % g.length]; if (c.h !== alvo.h) { prox = c; break; } }
    const falta = Math.max(0, alvoIni - s);
    const H = Math.floor(falta / 3600), M = Math.floor((falta % 3600) / 60), S = falta % 60;
    const rel = slot(el, 'relogio');
    let html;
    if (reduz.matches) {
      const mt = Math.ceil(falta / 60), hh = Math.floor(mt / 60), mm = mt % 60;
      html = hh ? `${hh}<span class="un">h</span>${dois(mm)}<span class="un">min</span>` : `${mt}<span class="un">min</span>`;
      rel.classList.remove('longo');
    } else if (H) {
      html = `${H}<span class="sep">:</span>${dois(M)}<span class="sep">:</span>${dois(S)}`;
      rel.classList.add('longo');
    } else {
      html = `${dois(M)}<span class="sep">:</span>${dois(S)}`;
      rel.classList.remove('longo');
    }
    rel.innerHTML = html;
    const rot = slot(el, 'rot');
    if (rot && rot.dataset.rot) rot.textContent = rot.dataset.rot;
    const minuto = Math.floor(s / 60);
    if (minuto === m.ultimo) return;
    m.ultimo = minuto;
    rel.setAttribute('aria-label', `Faltam ${H ? `${H} h e ` : ''}${M} min para ${alvo.nome}, às ${alvo.h}`);
    put(el, 'nome', alvo.nome);
    put(el, 'mod', [alvo.mod, `às ${alvo.h}`].filter(Boolean).join(' · '));
    const tag = slot(el, 'tag');
    if (tag) { tag.hidden = !alvo.tag; tag.textContent = alvo.tag || ''; }
    put(el, 'gar', alvo.gar || '—');
    put(el, 'buy', alvo.buy || '—');
    put(el, 'late', alvo.late ? `até ${alvo.late}` : '—');
    put(el, 'nivel-n', `abre às ${alvo.h}`);
    put(el, 'blinds', alvo.bl ? `${alvo.bl} min` : '—');
    put(el, 'blinds-n', ['por nível', alvo.stack ? `stack ${alvo.stack}` : ''].filter(Boolean).join(' · '));
    put(el, 'prox', `${prox.h} · ${prox.nome}`);
    put(el, 'prox-n', [prox.gar ? `${prox.gar} garantido` : '', prox.buy ? `buy-in ${prox.buy}` : ''].filter(Boolean).join(' · '));
    if (m.fila) {
      const itens = [];
      for (let k = 1; k <= Math.min(6, g.length - 1); k++) itens.push(g[(i + k) % g.length]);
      m.fila.innerHTML = '';
      itens.forEach((t) => {
        const li = document.createElement('li');
        const h = document.createElement('span'); h.className = 'h'; h.textContent = t.h;
        const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = t.nome;
        const sm = document.createElement('small'); sm.textContent = [t.mod, t.buy ? `buy-in ${t.buy}` : ''].filter(Boolean).join(' · '); nm.appendChild(sm);
        const gg = document.createElement('span'); gg.className = 'g'; gg.textContent = t.gar;
        li.append(h, nm, gg);
        m.fila.appendChild(li);
      });
    }
  }

  /* grades ao vivo (só quando o dono marcou que é a grade de hoje). O dia do poker vai das 7h às 7h:
     o que começa de madrugada fecha a noite anterior. */
  const ajusta = (x) => (x < 7 * 3600 ? x + DIA : x);
  const grades = $$('[data-rl-grade][data-ao-vivo]').map((el) => ({
    linhas: $$('tr[data-ini]', el).map((tr) => {
      const ini = ajusta(seg(tr.dataset.ini));
      let fim = tr.dataset.fim ? ajusta(seg(tr.dataset.fim)) : ini;
      if (fim < ini) fim += DIA;
      return { tr, ini, fim, st: tr.querySelector('.st') };
    }),
  }));
  function estadoGrade(gr, s) {
    let t = ajusta(s);
    // a noite acabou (tudo encerrado): a grade mostra o próximo dia, com o primeiro torneio como próximo
    if (gr.linhas.length && gr.linhas.every((l) => t > l.fim)) t -= DIA;
    let marcou = false;
    gr.linhas.forEach(({ tr, st, ini, fim }) => {
      tr.classList.remove('passou', 'e-prox');
      if (!st) return;
      st.className = 'st';
      st.hidden = true;
      if (t < ini) {
        if (marcou) return;
        marcou = true;
        tr.classList.add('e-prox');
        st.hidden = false;
        st.classList.add('prox');
        const f = Math.ceil((ini - t) / 60);
        st.textContent = f < 60 ? `em ${f} min` : 'próximo';
      } else if (t <= fim) {
        st.hidden = false;
        st.classList.add('aberto');
        st.innerHTML = '<span class="rl-dot" aria-hidden="true"></span>';
        st.appendChild(document.createTextNode(tr.dataset.fim ? `Registro até ${tr.dataset.fim}` : 'Registro aberto'));
      } else {
        tr.classList.add('passou');
        st.hidden = false;
        st.textContent = 'Registro encerrado';
      }
    });
  }

  /* relógio de nível do exemplo (blog): conta o nível para baixo e recomeça */
  const niveis = $$('[data-rl-nivel]').map((el) => {
    const [mm, ss] = (el.dataset.tempo || '12:00').split(':').map(Number);
    return { el, total: mm * 60 + ss, t0: Date.now(), out: slot(el, 'tempo') };
  });
  function nivel(n) {
    if (reduz.matches) { n.out.textContent = `${dois(Math.floor(n.total / 60))}:${dois(n.total % 60)}`; return; }
    const passou = Math.floor((Date.now() - n.t0) / 1000) % (n.total + 1);
    const r = n.total - passou;
    n.out.innerHTML = `${dois(Math.floor(r / 60))}<span class="sep">:</span>${dois(r % 60)}`;
  }

  let ultimoMin = -1;
  function tique() {
    const n = agora();
    relogios.forEach((el) => { const t = el.querySelector('[data-rl-agora]'); if (t && t.textContent !== n.hm) t.textContent = n.hm; });
    monitores.forEach((m) => contagem(m, n.s));
    const min = Math.floor(n.s / 60);
    if (min !== ultimoMin) { ultimoMin = min; grades.forEach((g) => estadoGrade(g, n.s)); }
    niveis.forEach(nivel);
  }
  let timer = null;
  function liga() { clearInterval(timer); timer = setInterval(tique, reduz.matches ? 15000 : 1000); tique(); }
  if (relogios.length || monitores.length || grades.length || niveis.length) {
    liga();
    if (reduz.addEventListener) reduz.addEventListener('change', liga);
  }

  /* menu: marca o link da página atual; no celular a faixa de links rola e some em degradê enquanto há link à direita */
  const aqui = location.pathname.replace(/\/+$/, '');
  $$('.b-navbar ul').forEach((ul) => {
    // só link de página (sem #âncora) conta como página atual
    const atual = $$('a', ul).find((a) => !a.hash && a.origin === location.origin && a.pathname.replace(/\/+$/, '') === aqui);
    if (atual) {
      atual.setAttribute('aria-current', 'page');
      const ra = atual.getBoundingClientRect(), ru = ul.getBoundingClientRect();
      if (ra.right > ru.right - 24) ul.scrollLeft += ra.right - ru.right + 40; // traz para a vista sem esconder o começo à toa
    }
    const marca = () => { ul.classList.toggle('rl-rola', ul.scrollLeft + ul.clientWidth < ul.scrollWidth - 4); ul.classList.toggle('rl-rola-e', ul.scrollLeft > 4); };
    ul.addEventListener('scroll', marca, { passive: true });
    window.addEventListener('resize', marca);
    marca();
  });

  /* copiar clube, agente e afins */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rl-copiar]');
    if (!b) return;
    const txt = b.dataset.rlCopiar;
    const rot = b.querySelector('span');
    const ok = () => { b.classList.add('ok'); rot.textContent = 'Copiado'; setTimeout(() => { b.classList.remove('ok'); rot.textContent = 'Copiar'; }, 1800); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(ok, () => { rot.textContent = txt; });
    else rot.textContent = txt;
  });
})();
