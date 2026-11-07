// Script dos sites públicos: consentimento antes de qualquer medição, UTM no formulário, envio do lead sem recarregar e eventos padrão.
(() => {
  const body = document.body;
  const ids = { ga4: body.dataset.ga4, gtm: body.dataset.gtm, pixel: body.dataset.pixel, clarity: body.dataset.clarity, ads: body.dataset.ads, adsLabel: body.dataset.adsLabel };
  const KEY = 'pa.consent';
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } } };
  const queue = [];
  let loaded = false;

  // id do evento compartilhado entre navegador e servidor (deduplicação da Conversions API)
  const eventId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  function load() {
    if (loaded) return;
    loaded = true;
    if (ids.gtm) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      add(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(ids.gtm)}`);
    }
    if (ids.ga4) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function gtag() { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', ids.ga4, { send_page_view: false }); // a visita sai abaixo, com event_id
      add(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ids.ga4)}`);
    }
    if (ids.ads) { // Google Ads: a mesma gtag.js serve as duas tags; sem GA4, carrega pela própria tag AW-
      window.dataLayer = window.dataLayer || [];
      if (!window.gtag) { window.gtag = function gtag() { window.dataLayer.push(arguments); }; window.gtag('js', new Date()); }
      window.gtag('config', ids.ads);
      if (!ids.ga4) add(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ids.ads)}`);
    }
    if (ids.clarity) { // Microsoft Clarity: só aqui, depois do "aceitar"; dados marcados com data-clarity-mask não saem
      const c = window.clarity = window.clarity || function clarity() { (c.q = c.q || []).push(arguments); };
      add(`https://www.clarity.ms/tag/${encodeURIComponent(ids.clarity)}`);
      window.clarity('consent');
    }
    if (ids.pixel) {
      const f = window.fbq = function fbq() { f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments); };
      f.push = f; f.loaded = true; f.version = '2.0'; f.queue = [];
      add('https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init', ids.pixel);
    }
    queue.splice(0).forEach(([n, p]) => send(n, p));
    send('page_view', { page: body.dataset.page });
  }
  function add(src) { const s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s); }
  function send(name, params) {
    const id = params.event_id || eventId();
    if (window.gtag) window.gtag('event', name, { ...params, event_id: id });
    if (window.fbq) {
      const map = { page_view: 'PageView', generate_lead: 'Lead', sign_up: 'CompleteRegistration', purchase: 'Purchase', cta_click: 'Contact' };
      if (map[name]) window.fbq('track', map[name], params, { eventID: id });
    }
    if (window.dataLayer && ids.gtm) window.dataLayer.push({ event: name, ...params, event_id: id });
    if (window.gtag && ids.ads && ids.adsLabel && name === 'generate_lead') window.gtag('event', 'conversion', { send_to: `${ids.ads}/${ids.adsLabel}`, transaction_id: id });
    if (window.clarity && ids.clarity) {
      window.clarity('event', name);
      if (params.variante) window.clarity('set', 'variante', String(params.variante));
      if (params.jornada) window.clarity('set', 'jornada', String(params.jornada));
    }
    mirror(name, id, params);
  }
  // O mesmo evento vai para o servidor com o MESMO event_id: é assim que a Conversions API da Meta evita contar duas vezes.
  // Só roda depois do consentimento (send() só é chamado por load()) e nunca na prévia do painel.
  function mirror(name, id, params) {
    if (body.dataset.preview) return;
    const url = `${body.dataset.base || ''}/pa/evento`;
    const payload = JSON.stringify({ name, event_id: id, consent: 1, page: body.dataset.page, ...params });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
      else fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true });
    } catch { /* medição nunca pode quebrar a página */ }
  }
  window.portalTrack = (name, params = {}) => (loaded ? send(name, params) : queue.push([name, params]));

  const banner = document.getElementById('consent');
  if (banner) {
    const choice = store.get(KEY);
    if (choice === 'sim') load();
    else if (!choice) banner.hidden = false;
    banner.addEventListener('click', (e) => {
      const b = e.target.closest('[data-consent]');
      if (!b) return;
      store.set(KEY, b.dataset.consent);
      banner.hidden = true;
      if (b.dataset.consent === 'sim') load();
    });
  }

  // UTM da URL viaja com o formulário
  const params = new URLSearchParams(location.search);
  const utm = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].filter((k) => params.get(k));
  document.querySelectorAll('form.lead-form').forEach((form) => {
    utm.forEach((k) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = params.get(k).slice(0, 120); form.appendChild(i); });
    const msg = form.querySelector('.form-msg');
    if (params.get('enviado')) { msg.textContent = form.dataset.success; form.classList.add('ok'); }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      msg.textContent = 'Enviando…';
      try {
        const r = await fetch(form.action, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(new FormData(form)) });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || 'Não deu certo. Tente de novo.');
        msg.textContent = form.dataset.success;
        form.classList.add('ok');
        form.reset();
        window.portalTrack('generate_lead', { page: body.dataset.page });
      } catch (err) {
        msg.textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    });
  });

  // Jornada guiada (teste A/B): carrega o script só se a página tiver o bloco
  if (document.querySelector('[data-journey]')) {
    const s = document.createElement('script');
    s.src = '/assets/journey.js';
    s.defer = true;
    document.body.appendChild(s);
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-cta]');
    if (a) window.portalTrack('cta_click', { label: a.dataset.cta, page: body.dataset.page });
  });
})();
