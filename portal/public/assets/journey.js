// Jornada guiada no site público (teste A/B montado no painel).
// Sorteia a variante pelo peso e guarda no aparelho (?jornada=b força), mostra um passo por vez numa folha,
// guarda o progresso (fechar e voltar continua de onde parou) e manda eventos "ver", "concluir" e "clicar".
(() => {
  const body = document.body;
  const base = body.dataset.base || '';
  const preview = body.dataset.preview === '1';
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } },
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const para = (t) => String(t || '').split(/\n{2,}/).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const safeUrl = (u) => (/^(https?:|mailto:|tel:)/i.test(String(u || '').trim()) ? String(u).trim() : '');
  let visitor = store.get('pa.v');
  if (!visitor) { visitor = Math.random().toString(36).slice(2) + Date.now().toString(36); store.set('pa.v', visitor); }

  function pickVariant(cfg) {
    const forced = new URLSearchParams(location.search).get('jornada');
    if (forced && cfg.variants.some((v) => v.key === forced)) return forced;
    const saved = store.get(`pa.j.${cfg.id}`);
    if (saved?.variant && cfg.variants.some((v) => v.key === saved.variant && (v.weight > 0 || preview))) return saved.variant;
    const total = cfg.variants.reduce((s, v) => s + v.weight, 0) || 1;
    let r = Math.random() * total;
    for (const v of cfg.variants) { r -= v.weight; if (r <= 0) return v.key; }
    return cfg.variants[0].key;
  }

  function send(id, variant, step, kind) {
    if (preview) return;
    fetch(`${base}/j/${id}/evento`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor, variant, step, kind }), keepalive: true }).catch(() => {});
    if (kind === 'concluir' && window.portalTrack) window.portalTrack('journey_step', { jornada: id, variante: variant, passo: step });
  }

  async function open(id) {
    let cfg;
    try {
      const r = await fetch(`${base}/j/${id}/config${preview ? '?previa=1' : ''}`);
      if (!r.ok) throw new Error();
      cfg = await r.json();
    } catch { alert('Esta jornada não está disponível agora.'); return; }
    const key = pickVariant(cfg);
    const variant = cfg.variants.find((v) => v.key === key);
    const stateKey = `pa.j.${cfg.id}`;
    const st = { variant: key, step: 0, data: {}, ...(store.get(stateKey)?.variant === key ? store.get(stateKey) : {}) };
    if (st.step >= variant.steps.length) st.step = 0;
    store.set(stateKey, st);

    const overlay = document.createElement('div');
    overlay.className = 'jx-overlay';
    overlay.innerHTML = '<div class="jx-sheet" role="dialog" aria-modal="true" aria-labelledby="jx-title"><button class="jx-close" type="button" aria-label="Fechar">×</button><div class="jx-progress"><i></i></div><div class="jx-body"></div></div>';
    document.body.appendChild(overlay);
    document.documentElement.classList.add('jx-open');
    const sheet = overlay.querySelector('.jx-body');
    const close = () => { overlay.remove(); document.documentElement.classList.remove('jx-open'); };
    overlay.querySelector('.jx-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } });

    const fill = (t) => String(t || '').replace(/\[\[(nome|email|telefone)\]\]/g, (m, k) => st.data[k] || '');
    const next = () => {
      send(cfg.id, key, st.step, 'concluir');
      st.step = Math.min(st.step + 1, variant.steps.length - 1);
      store.set(stateKey, st);
      draw();
    };

    function draw() {
      const s = variant.steps[st.step];
      const n = variant.steps.length;
      overlay.querySelector('.jx-progress i').style.width = `${((st.step + 1) / n) * 100}%`;
      send(cfg.id, key, st.step, 'ver');
      const head = `<p class="jx-count">Passo ${st.step + 1} de ${n}</p><h2 id="jx-title">${esc(fill(s.title))}</h2>${para(fill(s.text))}`;
      const back = st.step > 0 && s.type !== 'final' ? '<button class="btn btn-ghost btn-sm jx-back" type="button">Voltar</button>' : '';
      if (s.type === 'formulario') {
        const f = s.fields || 'email_nome';
        sheet.innerHTML = `${head}<form class="lead-form jx-form" novalidate>
          ${f.includes('nome') ? `<label>Nome completo<input name="name" autocomplete="name" maxlength="80" required value="${esc(st.data.nome || '')}"></label>` : ''}
          <label>E-mail<input name="email" type="email" autocomplete="email" maxlength="120" required value="${esc(st.data.email || '')}"></label>
          ${f.includes('telefone') ? `<label>WhatsApp<input name="phone" type="tel" autocomplete="tel" maxlength="20" value="${esc(st.data.telefone || '')}"></label>` : ''}
          <label class="check"><input type="checkbox" name="consent" value="1" required> <span>${esc(s.consent || 'Concordo em receber contato sobre esta oferta.')}</span></label>
          <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
          <button class="btn btn-lg" type="submit">${esc(s.button || 'Continuar')}</button><p class="form-msg" role="status" aria-live="polite"></p></form>${back}`;
        const form = sheet.querySelector('form');
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const msg = form.querySelector('.form-msg');
          if (!form.checkValidity()) { msg.textContent = 'Confira os campos e marque o consentimento.'; return; }
          const fd = new FormData(form);
          fd.append('page', body.dataset.page || '');
          fd.append('journey_id', cfg.id);
          fd.append('variant', key);
          new URLSearchParams(location.search).forEach((v, k) => { if (k.startsWith('utm_')) fd.append(k, v.slice(0, 120)); });
          form.querySelector('button').disabled = true;
          try {
            const r = preview ? { ok: true } : await fetch(cfg.formAction, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fd) });
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Não deu certo. Tente de novo.');
            st.data = { nome: fd.get('name') || '', email: fd.get('email') || '', telefone: fd.get('phone') || '' };
            if (window.portalTrack) window.portalTrack('generate_lead', { jornada: cfg.id, variante: key });
            next();
          } catch (err) { msg.textContent = err.message; form.querySelector('button').disabled = false; }
        });
      } else if (s.type === 'link_app' || s.type === 'link_externo') {
        const url = safeUrl(fill(s.url));
        sheet.innerHTML = `${head}${url ? `<a class="btn btn-lg jx-go" href="${esc(url)}" target="_blank" rel="noopener">${esc(s.button || 'Abrir')}</a>` : '<p class="note">Link ainda não configurado.</p>'}
          ${s.type === 'link_app' && url ? `<div class="jx-copy"><span>Link</span><code>${esc(url)}</code><button class="btn btn-ghost btn-sm" type="button" data-copy="${esc(url)}">Copiar</button></div>` : ''}
          <button class="btn ${url ? 'btn-ghost' : ''} jx-next" type="button" ${url ? 'hidden' : ''}>${esc(s.done || 'Pronto, continuar')}</button>${back}`;
        sheet.querySelector('.jx-go')?.addEventListener('click', () => { send(cfg.id, key, st.step, 'clicar'); sheet.querySelector('.jx-next').hidden = false; });
      } else if (s.type === 'copiar') {
        sheet.innerHTML = `${head}<ul class="jx-list">${(s.items || []).map((it) => { const v = fill(it.value); return v ? `<li class="jx-copy"><span>${esc(it.label)}</span><code>${esc(v)}</code><button class="btn btn-ghost btn-sm" type="button" data-copy="${esc(v)}">Copiar</button></li>` : ''; }).join('')}</ul>
          <button class="btn btn-lg jx-next" type="button">${esc(s.button || 'Continuar')}</button>${back}`;
      } else if (s.type === 'final') {
        const url = safeUrl(fill(s.url));
        if (!st.done) { st.done = true; store.set(stateKey, st); }
        sheet.innerHTML = `<div class="jx-final">${head}${url && s.button ? `<a class="btn btn-lg" href="${esc(url)}" target="_blank" rel="noopener">${esc(s.button)}</a>` : ''}</div>`;
      } else {
        sheet.innerHTML = `${head}<button class="btn btn-lg jx-next" type="button">${esc(s.button || 'Continuar')}</button>${back}`;
      }
      sheet.querySelector('.jx-next')?.addEventListener('click', next);
      sheet.querySelector('.jx-back')?.addEventListener('click', () => { st.step = Math.max(0, st.step - 1); store.set(stateKey, st); draw(); });
      sheet.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copiado'; setTimeout(() => { b.textContent = 'Copiar'; }, 1500); } catch { /* sem permissão de cópia */ }
      }));
      sheet.querySelector('input, .btn')?.focus();
    }
    draw();
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-journey]');
    if (b) { e.preventDefault(); open(b.dataset.journey); }
  });
  const auto = new URLSearchParams(location.search).get('abrir');
  if (auto && document.querySelector(`[data-journey="${CSS.escape(auto)}"]`)) open(auto);
})();
