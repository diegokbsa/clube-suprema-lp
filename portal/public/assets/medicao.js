// Medição das páginas próprias e do blog (GA4, Meta Pixel, Microsoft Clarity e Google Ads), só depois do consentimento (LGPD).
// Uso: <script src="/assets/medicao.js" data-ga4="G-XXXX" data-pixel="123..." data-clarity="abcd1234" data-ads="AW-123" data-ads-label="rotulo" defer></script>
// Google Ads: com o rótulo, o generate_lead também vira conversão do Ads (send_to AW-…/rótulo).
// Eventos: visita (page_view automático), cta_click (WhatsApp, canal de fichas, link do clube) e generate_lead
// (window.hpMedir('generate_lead'), chamado pelo envio do formulário ao CRM).
(function () {
  var eu = document.currentScript || document.querySelector('script[src*="/assets/medicao.js"]');
  var G = (eu && eu.getAttribute('data-ga4')) || '';
  var P = (eu && eu.getAttribute('data-pixel')) || '';
  if (!/^G-[A-Z0-9]{4,12}$/.test(G)) G = '';
  if (!/^\d{8,20}$/.test(P)) P = '';
  var C = (eu && eu.getAttribute('data-clarity')) || '';
  var A = (eu && eu.getAttribute('data-ads')) || '';
  var AL = (eu && eu.getAttribute('data-ads-label')) || '';
  if (!/^[a-z0-9]{6,16}$/.test(C)) C = '';
  if (!/^AW-\d{6,14}$/.test(A)) A = '';
  if (!A || !/^[A-Za-z0-9_-]{4,40}$/.test(AL)) AL = '';
  var CHAVE = 'pa.consent';
  var fila = [];
  window.hpMedir = function (nome, params) { fila.push([nome, params || {}]); };
  if (!G && !P && !C && !A) return;
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
    if (A) {
      window.dataLayer = window.dataLayer || [];
      if (!window.gtag) { window.gtag = function () { window.dataLayer.push(arguments); }; window.gtag('js', new Date()); }
      window.gtag('config', A);
      if (!G) { var sa = document.createElement('script'); sa.async = true; sa.src = 'https://www.googletagmanager.com/gtag/js?id=' + A; document.head.appendChild(sa); }
    }
    if (C) {
      /* eslint-disable */
      (function (c, l, a, r, i, t, y) { c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
        t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i; y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y); })(window, document, 'clarity', 'script', C);
      /* eslint-enable */
      window.clarity('consent');
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
      if (window.gtag && A && AL && nome === 'generate_lead') window.gtag('event', 'conversion', { send_to: A + '/' + AL });
      if (window.clarity && C) window.clarity('event', nome);
    };
    fila.splice(0).forEach(function (e) { window.hpMedir(e[0], e[1]); });
  }

  // cliques que importam: link de afiliado (Kiwify/Hotmart), WhatsApp, canal de fichas, link do clube, Instagram e Telegram
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var h = a.getAttribute('href') || '';
    var destino = /kiwify\.(app|com\.br)|hotmart\.com|hotm\.art/i.test(h) ? 'afiliado' : /wa\.me|whatsapp/i.test(h) ? 'whatsapp' : /fichas24horas/i.test(h) ? 'fichas' : /t\.me/i.test(h) ? 'telegram'
      : /instagram\.com/i.test(h) ? 'instagram' : /facebook\.com/i.test(h) ? 'facebook' : '';
    if (destino) window.hpMedir('cta_click', { destino: destino });
  }, true);

  var nomes = [(G || A) && 'Google', P && 'Meta', C && 'Microsoft Clarity'].filter(Boolean);
  var quem = nomes.length > 1 ? nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1] : nomes[0];
  // Blogs de afiliado (página com <meta name="scripts-depois">, 12/11/2026): faixa baixa no rodapé, nas cores do tema do blog
  // (variáveis CSS da página), sem cobrir título nem foto. Os outros sites seguem com o cartão abaixo.
  function faixa() {
    var d = document.createElement('div');
    d.setAttribute('role', 'region'); d.setAttribute('aria-label', 'Aviso de cookies');
    d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99998;padding:8px 16px calc(8px + env(safe-area-inset-bottom));background:var(--papel,#fff);color:var(--suave,#4f5563);border-top:1px solid var(--linha,#e3e5ea);font:400 13px/1.4 var(--fb,system-ui,sans-serif);display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;justify-content:center';
    d.innerHTML = '<span>Cookies de medição (' + quem + ') só com a sua permissão.</span>'
      + '<span style="display:flex;gap:6px"><button type="button" data-c="sim" style="cursor:pointer;border:0;border-radius:5px;padding:6px 12px;background:var(--a,#1d3a5c);color:var(--sa,#fff);font:700 13px var(--fb,system-ui,sans-serif)">Aceitar</button>'
      + '<button type="button" data-c="nao" style="cursor:pointer;border:1px solid var(--linha,#ccc);border-radius:5px;padding:5px 11px;background:transparent;color:var(--tinta,#15171c);font:600 13px var(--fb,system-ui,sans-serif)">Recusar</button></span>';
    return d;
  }
  function aviso() {
    if (document.querySelector('meta[name="scripts-depois"]')) { var f = faixa(); f.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-c]'); if (!b) return; gravar(b.getAttribute('data-c')); f.remove(); if (b.getAttribute('data-c') === 'sim') carregar();
    }); document.body.appendChild(f); return; }
    var d = document.createElement('div');
    d.setAttribute('role', 'region'); d.setAttribute('aria-label', 'Aviso de cookies');
    d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:99998;max-width:640px;margin:auto;padding:14px 16px;border-radius:10px;background:#141110;color:#f7f1ea;border:1px solid #3a2618;box-shadow:0 10px 28px rgb(0 0 0/.5);font:500 14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;display:flex;flex-wrap:wrap;gap:10px;align-items:center';
    d.innerHTML = '<span style="flex:1 1 260px">Usamos cookies de medição (' + quem + ') para entender o que funciona no site. Nada de senha ou dado de pagamento.</span>'
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
