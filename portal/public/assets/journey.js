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
  const digits = (v) => String(v ?? '').replace(/\D/g, '');
  // Cadastro no app + Fichas 24h guiado: regras do app (as mesmas do servidor em lib/modules/cadastro.mjs)
  const SENHA = [['6 a 16 caracteres', (p) => p.length >= 6 && p.length <= 16], ['uma letra maiúscula', (p) => /[A-Z]/.test(p)], ['um número', (p) => /\d/.test(p)],
    ['um símbolo: ! @ # $ % *', (p) => /[!@#$%*]/.test(p)], ['sem acento nem espaço', (p) => p.length > 0 && /^[A-Za-z0-9!@#$%*]+$/.test(p)]];
  const senhaFalta = (p) => SENHA.filter(([, t]) => !t(String(p || ''))).map(([l]) => l);
  const cpfOk = (v) => {
    const c = digits(v);
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
  };
  const foneOk = (v) => { const f = digits(v); return (f.length === 10 || f.length === 11) && f[0] !== '0' && (f.length === 10 || f[2] === '9'); };
  const idade = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return null;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    const n = new Date();
    if (d.getUTCMonth() !== +m[2] - 1 || d > n) return null;
    let a = n.getUTCFullYear() - +m[1];
    if (n.getUTCMonth() + 1 < +m[2] || (n.getUTCMonth() + 1 === +m[2] && n.getUTCDate() < +m[3])) a--;
    return a;
  };
  const mCpf = (v) => digits(v).slice(0, 11).replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  const mFone = (v) => {
    const d = digits(v).slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return d.length <= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };
  const fData = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('/') : iso || '');
  const utmDaUrl = () => {
    const o = {};
    new URLSearchParams(location.search).forEach((v, k) => { if (k.startsWith('utm_') || ['gclid', 'fbclid', 'ref'].includes(k)) o[k] = v.slice(0, 120); });
    return o;
  };
  const copyRow = (label, value, copy = true) => `<li class="jx-copy"><span>${esc(label)}</span><code data-clarity-mask="True">${esc(value)}</code>${copy && value
    ? `<button class="btn btn-ghost btn-sm" type="button" data-copy="${esc(value)}">Copiar</button>` : '<i></i>'}</li>`;
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
    let timer = null; // acompanhamento ao vivo do cadastro (a cada 1,2 s)
    const parar = () => { if (timer) clearInterval(timer); timer = null; };
    const close = () => { parar(); overlay.remove(); document.documentElement.classList.remove('jx-open'); };
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

    const f24Key = `pa.f24h.${cfg.id}`; // CPF, nascimento e celular do Fichas 24h: só neste aparelho, apagados no fim
    const cad = (p) => `${base}/cad/${p}`;
    const postJson = async (url, data) => {
      const r = await fetch(url, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Não deu certo. Tente de novo.');
      return j;
    };
    const ICO = { ok: '✓', erro: '!', aguardando: '…', rodando: '…', pendente: '' };
    const checklist = (c) => `<ul class="jx-list jx-status">${(c?.steps || []).map((e) => `<li class="jx-copy jx-${esc(e.state)}"><span>${esc(ICO[e.state] || '')}</span><code>${esc(e.label)}</code><i></i></li>`).join('')}</ul>`;

    function draw() {
      parar();
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
      } else if (s.type === 'conta_app') {
        const f = s.fields || 'email_senha';
        sheet.innerHTML = `${head}<form class="lead-form jx-form" novalidate>
          <label>E-mail<input name="email" type="email" autocomplete="email" maxlength="120" required value="${esc(st.data.email || '')}"></label>
          <label>Senha (a mesma no app e nas fichas)<input name="password" type="password" autocomplete="new-password" maxlength="16" required></label>
          <p class="note">${esc(SENHA.map(([l]) => l).join(' · '))}</p>
          ${f.includes('nome') ? `<label>Nome completo<input name="name" autocomplete="name" maxlength="80" value="${esc(st.data.nome || '')}"></label>
          <label>WhatsApp<input name="phone" type="tel" autocomplete="tel" maxlength="20" value="${esc(st.data.telefone || '')}"></label>` : ''}
          <label class="check"><input type="checkbox" name="consent" value="1" required> <span>${esc(s.consent || 'Tenho 18 anos ou mais e aceito receber contato.')}</span></label>
          <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
          <button class="btn btn-lg" type="submit">${esc(s.button || 'Criar meu acesso')}</button><p class="form-msg" role="status" aria-live="polite"></p></form>${back}`;
        const form = sheet.querySelector('form');
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const msg = form.querySelector('.form-msg');
          const fd = new FormData(form);
          const falta = senhaFalta(fd.get('password'));
          if (!form.checkValidity()) { msg.textContent = 'Confira os campos e marque o consentimento.'; return; }
          if (falta.length) { msg.textContent = `A senha precisa de: ${falta.join(', ')}.`; return; }
          form.querySelector('button').disabled = true;
          try {
            const dados = { email: String(fd.get('email') || '').trim().toLowerCase(), password: fd.get('password'), name: fd.get('name') || '', phone: fd.get('phone') || '',
              consent: 1, website: fd.get('website') || '', variant: key, page: body.dataset.page || '', utm: utmDaUrl() };
            const r = preview ? { id: 'previa', idApp: '' } : await postJson(cad(`${cfg.id}/inicio`), dados);
            form.reset(); // a senha não fica na tela nem no aparelho
            st.data = { ...st.data, email: dados.email, nome: dados.name, telefone: dados.phone, cadastro: r.id, idApp: r.idApp || '' };
            if (window.portalTrack) window.portalTrack('generate_lead', { jornada: cfg.id, variante: key });
            next();
          } catch (err) { msg.textContent = err.message; form.querySelector('button').disabled = false; }
        });
      } else if (s.type === 'entrar_clube') {
        const url = safeUrl(fill(s.url));
        if (!st.data.cadastro) {
          sheet.innerHTML = `${head}<p class="note">Crie seu acesso no passo anterior para continuar.</p>${back}`;
        } else {
          sheet.innerHTML = `${head}${url ? `<a class="btn btn-lg jx-go" href="${esc(url)}" target="_blank" rel="noopener">${esc(s.button || 'Abrir o app')}</a>
            <div class="jx-copy"><span>Link</span><code>${esc(url)}</code><button class="btn btn-ghost btn-sm" type="button" data-copy="${esc(url)}">Copiar</button></div>` : '<p class="note">Link de convite ainda não configurado.</p>'}
            <div class="jx-live"></div>
            <form class="lead-form jx-form" novalidate><label>${esc(s.idLabel || 'Seu ID de jogador')}<input name="idApp" inputmode="numeric" autocomplete="off" maxlength="14" required value="${esc(st.data.idApp || '')}"></label>
            <button class="btn btn-lg" type="submit">${esc(s.done || 'Enviar meu ID')}</button><p class="form-msg" role="status" aria-live="polite"></p></form>${back}`;
          sheet.querySelector('.jx-go')?.addEventListener('click', () => send(cfg.id, key, st.step, 'clicar'));
          const live = sheet.querySelector('.jx-live');
          const passo = st.step;
          const pronto = (c) => {
            parar();
            st.data.idApp = c.idApp || st.data.idApp;
            if (window.portalTrack) window.portalTrack('sign_up', { jornada: cfg.id, variante: key });
            if (st.step === passo) next();
          };
          const consultar = async () => {
            if (preview) return;
            try {
              const r = await fetch(cad(`${st.data.cadastro}/status`), { headers: { Accept: 'application/json' }, cache: 'no-store' });
              if (!r.ok) return;
              const c = await r.json();
              live.innerHTML = checklist(c);
              if (c.pronto && timer) pronto(c);
            } catch { /* sem rede: tenta de novo no próximo ciclo */ }
          };
          timer = setInterval(consultar, 1200);
          consultar();
          const form = sheet.querySelector('form');
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const msg = form.querySelector('.form-msg');
            const idApp = digits(new FormData(form).get('idApp'));
            if (idApp.length < 4 || idApp.length > 12) { msg.textContent = 'Digite o seu ID de jogador (só números, fica no seu perfil no app).'; return; }
            form.querySelector('button').disabled = true;
            try {
              const c = preview ? { pronto: true, idApp } : await postJson(cad(`${st.data.cadastro}/id-app`), { idApp });
              if (c.pronto) pronto(c);
              else { live.innerHTML = checklist(c); form.querySelector('button').disabled = false; }
            } catch (err) { msg.textContent = err.message; form.querySelector('button').disabled = false; }
          });
        }
      } else if (s.type === 'fichas24h') {
        const parte = ['tudo', 'cadastro', 'compra'].includes(s.parte) ? s.parte : 'tudo';
        const dados = store.get(f24Key);
        if (parte !== 'compra' && !dados) {
          sheet.innerHTML = `${head}<form class="lead-form jx-form" novalidate>
            <label>Nome completo (como no CPF)<input name="name" autocomplete="name" maxlength="80" required></label>
            <label>CPF<input name="cpf" inputmode="numeric" autocomplete="off" maxlength="14" required></label>
            <label>Celular com DDD<input name="phone" type="tel" autocomplete="tel" maxlength="16" required value="${esc(mFone(st.data.telefone || ''))}"></label>
            <label>Nascimento<input name="birth" type="date" required></label>
            <p class="note">Esses dados ficam só neste aparelho, para você copiar e colar no cadastro de fichas. Não vão para o nosso servidor.</p>
            <button class="btn btn-lg" type="submit">Mostrar meus dados prontos</button><p class="form-msg" role="status" aria-live="polite"></p></form>${back}`;
          const form = sheet.querySelector('form');
          form.elements.cpf.addEventListener('input', () => { form.elements.cpf.value = mCpf(form.elements.cpf.value); });
          form.elements.phone.addEventListener('input', () => { form.elements.phone.value = mFone(form.elements.phone.value); });
          form.addEventListener('submit', (e) => {
            e.preventDefault(); // sem isto o navegador mandaria o CPF na barra de endereço
            const el = form.elements;
            const d = { name: String(el.name.value).trim().replace(/\s+/g, ' '), cpf: digits(el.cpf.value), phone: digits(el.phone.value), birth: el.birth.value };
            const a = idade(d.birth);
            const erro = d.name.length < 5 || !d.name.includes(' ') ? 'Seu nome completo, como no CPF.' : !cpfOk(d.cpf) ? 'CPF inválido.'
              : !foneOk(d.phone) ? 'Celular com DDD, ex.: (11) 91234-5678.' : a === null || a > 110 ? 'Data de nascimento inválida.' : a < 18 ? 'Só maiores de 18 anos podem jogar.' : '';
            if (erro) { form.querySelector('.form-msg').textContent = erro; return; }
            store.set(f24Key, d);
            draw();
          });
        } else {
          const d = dados || {};
          const signup = safeUrl(fill(s.signupUrl));
          const home = safeUrl(fill(s.homeUrl));
          const idApp = st.data.idApp || '';
          const n0 = parte === 'compra' ? 0 : 1;
          sheet.innerHTML = `${head}
            ${parte !== 'compra' ? `<h3>1. Cadastro no sistema de fichas</h3><ul class="jx-list">${copyRow('E-mail', st.data.email || '')}${copyRow('Senha', 'a mesma que você criou aqui', false)}${copyRow('Nome completo', d.name || '')}${copyRow('CPF', mCpf(d.cpf))}${copyRow('Nascimento', fData(d.birth))}${copyRow('Celular', mFone(d.phone))}</ul>
              ${signup ? `<a class="btn btn-lg jx-f24-go" href="${esc(signup)}" target="_blank" rel="noopener">${esc(s.button || 'Abrir o cadastro de fichas')}</a>` : '<p class="note">Link do cadastro de fichas ainda não configurado.</p>'}
              <button class="btn btn-ghost btn-sm jx-f24-edit" type="button">Corrigir meus dados</button>` : ''}
            ${parte !== 'cadastro' ? `<h3>${n0 + 1}. Cadastrar ID${s.clubName ? ` (clube “${esc(s.clubName)}”)` : ''}</h3><ul class="jx-list">${copyRow('Seu ID de jogador', idApp || '(o ID do seu perfil no app)', Boolean(idApp))}${s.clube ? copyRow('Clube', s.clube) : ''}${s.agente ? copyRow('Agente', s.agente) : ''}</ul>
              <h3>${n0 + 2}. Validação</h3><p>O sistema de fichas manda umas fichas para a sua conta do app. Veja no app quantas chegaram e digite o valor lá para validar.</p>
              <h3>${n0 + 3}. Compra</h3>${home ? `<a class="btn btn-lg jx-f24-buy" href="${esc(home)}" target="_blank" rel="noopener">${esc(s.buyButton || 'Comprar fichas')}</a>` : '<p class="note">Link da compra ainda não configurado.</p>'}` : ''}
            <button class="btn ${parte === 'cadastro' ? '' : 'btn-ghost'} jx-next" type="button">${esc(s.done || 'Pronto, continuar')}</button>${back}`;
          const clique = (destino) => { send(cfg.id, key, st.step, 'clicar'); if (window.portalTrack) window.portalTrack('cta_click', { destino, jornada: cfg.id, variante: key }); };
          sheet.querySelector('.jx-f24-go')?.addEventListener('click', () => clique('fichas_cadastro'));
          sheet.querySelector('.jx-f24-buy')?.addEventListener('click', () => clique('fichas_compra'));
          sheet.querySelector('.jx-f24-edit')?.addEventListener('click', () => { try { localStorage.removeItem(f24Key); } catch { /* sem armazenamento */ } draw(); });
          if (!idApp && st.data.cadastro && !preview && parte !== 'cadastro') {
            fetch(cad(`${st.data.cadastro}/status`), { headers: { Accept: 'application/json' } }).then((r) => (r.ok ? r.json() : null)).then((c) => {
              if (c?.idApp && variant.steps[st.step] === s) { st.data.idApp = c.idApp; store.set(stateKey, st); draw(); }
            }).catch(() => {});
          }
        }
      } else if (s.type === 'final') {
        const url = safeUrl(fill(s.url));
        try { localStorage.removeItem(f24Key); } catch { /* sem armazenamento */ } // dados do Fichas 24h apagados no fim
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
