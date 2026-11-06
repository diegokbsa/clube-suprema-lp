// Medição das páginas próprias e do blog (GA4 e Meta Pixel), só depois do consentimento (LGPD).
// Uso: <script src="/assets/medicao.js" data-ga4="G-XXXX" data-pixel="123..." defer></script>
// Eventos: visita (page_view automático), cta_click (WhatsApp, canal de fichas, link do clube) e generate_lead
// (window.hpMedir('generate_lead'), chamado pelo envio do formulário ao CRM).
(function () {
  var eu = document.currentScript || document.querySelector('script[src*="/assets/medicao.js"]');
  var G = (eu && eu.getAttribute('data-ga4')) || '';
  var P = (eu && eu.getAttribute('data-pixel')) || '';
  if (!/^G-[A-Z0-9]{4,12}$/.test(G)) G = '';
  if (!/^\d{8,20}$/.test(P)) P = '';
  var CHAVE = 'pa.consent';
  var fila = [];
  window.hpMedir = function (nome, params) { fila.push([nome, params || {}]); };
  if (!G && !P) return;
  function ler() { try { return localStorage.getItem(CHAVE); } catch (e) { return null; } }
  function gravar(v) { try { localStorage.setItem(CHAVE, v); } catch (e) { /* modo privado */ } }
  var META = { generate_lead: 'Lead', cta_click: 'Contact', sign_up: 'CompleteRegistration' };

  function carregar() {
    if (G) {
      var s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + G;
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', G);
    }
    if (P) {
      /* eslint-disable */
      !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v;
        s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      /* eslint-enable */
      window.fbq('init', P); window.fbq('track', 'PageView');
    }
    window.hpMedir = function (nome, params) {
      if (window.gtag) window.gtag('event', nome, params || {});
      if (window.fbq && META[nome]) window.fbq('track', META[nome]);
    };
    fila.splice(0).forEach(function (e) { window.hpMedir(e[0], e[1]); });
  }

  // cliques que importam: WhatsApp, canal de fichas, link do clube, Instagram e Telegram
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var h = a.getAttribute('href') || '';
    var destino = /wa\.me|whatsapp/i.test(h) ? 'whatsapp' : /fichas24horas/i.test(h) ? 'fichas' : /t\.me/i.test(h) ? 'telegram'
      : /instagram\.com/i.test(h) ? 'instagram' : /facebook\.com/i.test(h) ? 'facebook' : '';
    if (destino) window.hpMedir('cta_click', { destino: destino });
  }, true);

  function aviso() {
    var d = document.createElement('div');
    d.setAttribute('role', 'region'); d.setAttribute('aria-label', 'Aviso de cookies');
    d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:99998;max-width:640px;margin:auto;padding:14px 16px;border-radius:10px;background:#141110;color:#f7f1ea;border:1px solid #3a2618;box-shadow:0 10px 28px rgb(0 0 0/.5);font:500 14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;display:flex;flex-wrap:wrap;gap:10px;align-items:center';
    d.innerHTML = '<span style="flex:1 1 260px">Usamos cookies de medição (Google Analytics) para entender o que funciona no site. Nada de dado de jogo ou senha.</span>'
      + '<button type="button" data-c="sim" style="cursor:pointer;border:0;border-radius:6px;padding:9px 14px;background:#f47b20;color:#150700;font:800 14px system-ui,sans-serif">Aceitar</button>'
      + '<button type="button" data-c="nao" style="cursor:pointer;border:1px solid #6b5a4c;border-radius:6px;padding:8px 13px;background:transparent;color:#f7f1ea;font:600 14px system-ui,sans-serif">Recusar</button>';
    d.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-c]');
      if (!b) return;
      gravar(b.getAttribute('data-c'));
      d.remove();
      if (b.getAttribute('data-c') === 'sim') carregar();
    });
    document.body.appendChild(d);
  }

  var c = ler();
  if (c === 'sim') carregar();
  else if (c !== 'nao') { if (document.body) aviso(); else document.addEventListener('DOMContentLoaded', aviso); }
})();
