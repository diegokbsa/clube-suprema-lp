// Fluxos da LP:
//   convite:  e-mail -> link oficial do clube + Fichas 24h (sem integrações)
//   completo: cadastro único -> confirmação -> PIX -> link do clube
import { PASSWORD_RULES, validateLead, validateSignup, validatePayer, passwordError, maskCpf, maskPhone, onlyDigits } from '/shared/validate.js';

const KEYS = {
  signup: 'clube.signupId',
  deposit: 'clube.depositId',
  lead: 'clube.leadId',
  leadEmail: 'clube.leadEmail',
  utm: 'clube.utm',
  tracked: 'clube.tracked',
  f24hData: 'clube.f24hDados', // dados para copiar no Fichas 24h (modo guiado): só neste aparelho
};
const FLOW_VIEWS = {
  convite: [['lead', 'Seu e-mail'], ['invite', 'Entrar no clube']],
  completo: [['form', 'Cadastro'], ['confirm', 'Entrar no clube'], ['deposit', 'Fichas'], ['app', 'Jogar']],
};
const WA_LABELS = {
  geral: 'entrar no clube',
  convite: 'entrar no clube e comprar fichas',
  cadastro: 'terminar meu cadastro',
  deposito: 'fazer meu depósito',
  app: 'entrar no app e jogar',
};
const META_EVENTS = { signup_start: 'Lead', signup_complete: 'CompleteRegistration', deposit_paid: 'Purchase' };

const state = { config: null, signup: null, deposit: null, view: null, selectedAmount: null, lastDeposited: null, shownNeed: null, stops: new Set() };

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* sem armazenamento: segue sem retomar */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* idem */ } },
};

async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('Sem conexão. Confira sua internet e tente de novo.'), { status: 0 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Algo deu errado. Tente de novo.'), { status: res.status, data });
  return data;
}

// ---------- Timers (param todos ao trocar de tela) ----------

function poll(fn, ms) {
  let stopped = false;
  let handle;
  const tick = async () => {
    if (stopped) return;
    try { await fn(); } finally { if (!stopped) handle = setTimeout(tick, ms); }
  };
  handle = setTimeout(tick, ms);
  const stop = () => { stopped = true; clearTimeout(handle); };
  state.stops.add(stop);
  return stop;
}

function every(fn, ms) {
  const id = setInterval(fn, ms);
  const stop = () => clearInterval(id);
  state.stops.add(stop);
  return stop;
}

function stopAll() {
  state.stops.forEach((stop) => stop());
  state.stops.clear();
}

// ---------- Tracking ----------

window.dataLayer = window.dataLayer || [];

function track(event, params = {}) {
  window.dataLayer.push({ event, ...params });
  if (typeof window.gtag === 'function') window.gtag('event', event, params);
  if (typeof window.fbq === 'function' && META_EVENTS[event]) window.fbq('track', META_EVENTS[event], params);
  // No Clarity o evento vira filtro de gravações e etapa de funil.
  if (typeof window.clarity === 'function') window.clarity('event', event);
  console.debug('[track]', event, params);
}

function trackOnce(key, event, params) {
  let tracked = {};
  try { tracked = JSON.parse(storage.get(KEYS.tracked) || '{}'); } catch { /* recomeça */ }
  if (tracked[key]) return;
  tracked[key] = 1;
  storage.set(KEYS.tracked, JSON.stringify(tracked));
  track(event, params);
}

function loadTracking({ ga4Id, metaPixelId }) {
  if (ga4Id) {
    // O Google tag do Google Ads já vem no <head> da página; se existir, só acrescenta a configuração do GA4.
    if (typeof window.gtag !== 'function') {
      const s = document.createElement('script');
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4Id)}`;
      document.head.append(s);
      window.gtag = function gtag() { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
    }
    // A LP já configura o GA4 no <head>; configurar de novo contaria a visualização duas vezes.
    if (!window.dataLayer.some((a) => a && a[0] === 'config' && a[1] === ga4Id)) window.gtag('config', ga4Id);
  }
  if (metaPixelId) {
    const fbq = function () { fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments); };
    Object.assign(fbq, { push: fbq, loaded: true, version: '2.0', queue: [] });
    window.fbq = window._fbq = fbq;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.append(s);
    window.fbq('init', metaPixelId);
    window.fbq('track', 'PageView');
  }
}

// Versão da LP pela rota: /fichas e /spin (motion ligado, cada uma com sua arte 3D); a raiz é a padrão.
function lpVariant() {
  const m = location.pathname.match(/^[/](fichas|spin)[/]?$/);
  return m ? m[1] : 'padrao';
}

// Primeiro contato do visitante: UTMs, site de onde veio (google.com, instagram.com...) e página de entrada.
// O blog grava o mesmo registro (TRACKING_HEAD em lib/blog.js), então quem lê um post e depois se cadastra
// chega na planilha com o post de entrada. Um clique de campanha depois de uma visita sem campanha substitui o registro.
function captureUtm() {
  const params = new URLSearchParams(location.search);
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid', 'ref'];
  const found = Object.fromEntries(keys.filter((k) => params.get(k)).map((k) => [k, params.get(k).slice(0, 200)]));
  const saved = utm();
  const campaign = (u) => keys.some((k) => u[k]);
  if (saved.at && !(campaign(found) && !campaign(saved))) return;
  let referrer = '';
  try { referrer = new URL(document.referrer).hostname; } catch { /* acesso direto */ }
  if (referrer === location.hostname) referrer = '';
  storage.set(KEYS.utm, JSON.stringify({ ...found, referrer, landing: location.pathname, at: new Date().toISOString() }));
}

// Origem resumida para o GA4 e o Clarity: campanha, site de origem ou "direto".
function leadOrigin(u = utm()) {
  return u.utm_source || (u.gclid && 'google-ads') || (u.fbclid && 'facebook') || u.referrer || 'direto';
}

function utm() {
  try { return JSON.parse(storage.get(KEYS.utm) || '{}'); } catch { return {}; }
}

// ---------- Utilidades de tela ----------

// O balão flutuante ("ajuda") usa a mesma mensagem do botão de suporte da etapa em que o jogador está.
const VIEW_WA = { lead: 'convite', invite: 'convite', form: 'cadastro', confirm: 'cadastro', deposit: 'deposito', app: 'app' };

function waLink(kind) {
  const { club, supportWhatsapp, flow } = state.config;
  if (kind === 'ajuda') kind = VIEW_WA[state.view] || (flow === 'convite' ? 'convite' : 'geral');
  const email = state.signup?.player?.email || storage.get(KEYS.leadEmail) || $('#f-email')?.value?.trim();
  const who = email ? ` Meu e-mail de cadastro é ${email}.` : '';
  const text = `Oi! Venho do clube ${club.id}, agente ${club.agentId}, e gostaria de suporte para ${WA_LABELS[kind] || WA_LABELS.geral}.${who}`;
  return `https://wa.me/${supportWhatsapp}?text=${encodeURIComponent(text)}`;
}

function bindDynamic(root = document) {
  const { club, links } = state.config;
  $$('[data-wa]', root).forEach((a) => { a.href = waLink(a.dataset.wa); });
  $$('[data-link]', root).forEach((a) => { a.href = links[a.dataset.link]; });
  $$('[data-buy]', root).forEach((a) => { a.href = links.buyChips; });
  $$('[data-bind="club-line"]', root).forEach((el) => { el.textContent = `ID ${club.id}`; });
  $$('[data-bind="club-id"]', root).forEach((el) => { el.textContent = club.id; });
  $$('[data-bind="agent-id"]', root).forEach((el) => { el.textContent = club.agentId; });
  $$('[data-bind="lead-email"]', root).forEach((el) => { el.textContent = storage.get(KEYS.leadEmail) || 'o seu e-mail'; });
  $$('[data-bind="club-full"]', root).forEach((el) => { el.textContent = `${club.name} · ID ${club.id}`; });
  $$('[data-bind="email"]', root).forEach((el) => { el.textContent = state.signup?.player?.email || ''; });
}

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 2200);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const tmp = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(tmp);
    tmp.select();
    document.execCommand('copy');
    tmp.remove();
  }
}

const hasFinePointer = () => window.matchMedia('(pointer: fine)').matches;

function forgetSignup() {
  storage.remove(KEYS.signup);
  storage.remove(KEYS.deposit);
  state.signup = null;
  state.deposit = null;
  state.lastDeposited = null;
  state.shownNeed = null;
}

// ---------- Painel do fluxo ----------

function openSheet(view) {
  const sheet = $('#sheet');
  if (sheet.hidden) {
    state.lastFocus = document.activeElement;
    sheet.hidden = false;
    document.body.classList.add('no-scroll');
  }
  render(view);
}

function closeSheet() {
  stopAll();
  $('#sheet').hidden = true;
  document.body.classList.remove('no-scroll');
  state.view = null;
  refreshResume();
  state.lastFocus?.focus?.();
}

function render(view) {
  stopAll();
  state.view = view;
  const body = $('#sheet-body');
  body.replaceChildren($(`#tpl-${view}`).content.cloneNode(true));
  const steps = FLOW_VIEWS[state.config.flow];
  const index = steps.findIndex(([key]) => key === view);
  $('#progress').innerHTML = steps
    .map(([, label], i) => `<li class="${i < index ? 'done' : i === index ? 'active' : ''}">${esc(label)}</li>`)
    .join('');
  bindDynamic(body);
  $('.sheet-panel').scrollTop = 0;
  ({ lead: initLead, invite: initInvite, form: initForm, confirm: initConfirm, deposit: initDeposit, fichas: initFichas, app: initApp })[view]();
}

const resumeKey = () => (state.config.flow === 'convite' ? KEYS.lead : KEYS.signup);
const afterAccount = () => (state.config.f24h?.guided ? 'fichas' : 'deposit');

function refreshResume() {
  $('#resume').hidden = !storage.get(resumeKey());
}

async function resume() {
  if (state.config.flow === 'convite') return openSheet(storage.get(KEYS.lead) ? 'invite' : 'lead');
  const id = storage.get(KEYS.signup);
  if (!id) return openSheet('form');
  try {
    state.signup = await api(`/api/signup/${id}`);
  } catch {
    forgetSignup();
    refreshResume();
    return openSheet('form');
  }
  if (!state.signup.accountReady) return openSheet('confirm');
  if (state.config.f24h?.guided) return openSheet('fichas');
  try {
    const deposits = await api(`/api/signup/${id}/deposits`);
    const credited = deposits.find((d) => d.status === 'creditado');
    if (credited && !storage.get(KEYS.deposit)) {
      state.lastDeposited = credited.amount;
      return openSheet('app');
    }
  } catch { /* segue para o depósito */ }
  openSheet('deposit');
}

const start = () => {
  if (storage.get(resumeKey())) return resume();
  openSheet(state.config.flow === 'convite' ? 'lead' : 'form');
};

// ---------- Versão convite ----------

function initLead() {
  const form = $('#lead-form');
  form.addEventListener('input', (e) => setFieldError(form, e.target.name, ''));
  form.addEventListener('change', (e) => setFieldError(form, e.target.name, ''));
  form.addEventListener('submit', submitLead);
  form.elements.whatsapp?.addEventListener('input', (e) => { e.target.value = maskPhone(e.target.value); });
  if (hasFinePointer()) form.elements.email.focus();
  trackOnce('signup_start', 'signup_start');
}

async function submitLead(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const f = form.elements;
  const whatsapp = f.whatsapp?.value || ''; // campo opcional (pode não existir numa versão antiga da página em cache)
  const input = { email: f.email.value, whatsapp, acceptedTerms: f.acceptedTerms.checked };
  const { errors } = validateLead(input);
  showFormError('');
  if (Object.keys(errors).length) return showErrors(form, errors);

  const button = $('#lead-submit');
  button.disabled = true;
  button.textContent = 'Enviando…';
  try {
    const lead = await api('/api/lead', { method: 'POST', body: { ...input, utm: utm() } });
    storage.set(KEYS.lead, lead.id);
    storage.set(KEYS.leadEmail, lead.email);
    const u = utm();
    trackOnce(`lead:${lead.id}`, 'signup_complete', { origem: leadOrigin(u), pagina_entrada: u.landing || location.pathname, com_whatsapp: whatsapp ? 'sim' : 'nao' });
    render('invite');
  } catch (err) {
    if (err.data?.errors) showErrors(form, err.data.errors);
    showFormError(err.message);
    button.disabled = false;
    button.textContent = 'Continuar';
  }
}

// Link único do app: o servidor (/baixar) manda cada aparelho para o lugar certo.
// O "l" identifica o lead para o painel saber em qual aparelho ele baixou.
function appLink() {
  const leadId = storage.get(KEYS.lead);
  return `${location.origin}/baixar${leadId && state.config.flow === 'convite' ? `?l=${encodeURIComponent(leadId)}` : ''}`;
}

// No computador, mostra também o QR do mesmo link para abrir no celular.
function setupInvite() {
  const link = appLink();
  $$('[data-app-link]').forEach((a) => { a.href = link; });
  const mobile = ['android', 'ios'].includes(detectOs());
  $('#invite-mobile-hint').hidden = !mobile;
  $('#invite-desktop').hidden = mobile;
  if (!mobile) renderQr(link, $('#invite-qr'));
}

function initInvite() {
  setupInvite();
}

// Registra no painel cada passo que o lead clicou (sem travar a navegação).
function leadEvent(type) {
  const id = storage.get(KEYS.lead);
  if (!id || state.config?.flow !== 'convite') return;
  const url = `/api/lead/${id}/event`;
  const body = JSON.stringify({ type });
  const sent = navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' }));
  if (!sent) fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
}

// ---------- 1. Cadastro ----------

function initForm() {
  const form = $('#signup-form');
  const f = form.elements;
  const rules = $('#pwd-rules');
  rules.innerHTML = PASSWORD_RULES.map((r) => `<li data-rule="${r.key}">${esc(r.label)}</li>`).join('');
  const updateRules = () => PASSWORD_RULES.forEach((r) => {
    rules.querySelector(`[data-rule="${r.key}"]`).classList.toggle('ok', r.test(f.password.value));
  });

  f.password.addEventListener('input', updateRules);
  form.addEventListener('input', (e) => setFieldError(form, e.target.name, ''));
  form.addEventListener('change', (e) => setFieldError(form, e.target.name, ''));
  form.addEventListener('submit', submitSignup);

  $('[data-action="fill-test"]').hidden = !state.config.testMode;
  if (hasFinePointer()) f.email.focus();
  trackOnce('signup_start', 'signup_start');
}

function setupPayerMasks(form) {
  const f = form.elements;
  f.cpf.addEventListener('input', () => { f.cpf.value = maskCpf(f.cpf.value); });
  f.phone.addEventListener('input', () => { f.phone.value = maskPhone(f.phone.value); });
  const maxBirth = new Date();
  maxBirth.setFullYear(maxBirth.getFullYear() - 18);
  f.birth.max = maxBirth.toISOString().slice(0, 10);
  f.birth.min = '1900-01-01';
  form.addEventListener('input', (e) => setFieldError(form, e.target.name, ''));
  form.addEventListener('change', (e) => setFieldError(form, e.target.name, ''));
}

function setFieldError(form, name, message) {
  if (!name) return;
  const slot = $(`[data-error="${name}"]`, form);
  if (slot) slot.textContent = message;
  const input = form.elements[name];
  if (input && input.setAttribute) input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function showErrors(form, errors) {
  $$('[data-error]', form).forEach((slot) => setFieldError(form, slot.dataset.error, errors[slot.dataset.error] || ''));
  const first = Object.keys(errors)[0];
  form.elements[first]?.focus?.();
}

function showFormError(message) {
  const box = $('#form-error');
  box.textContent = message || '';
  box.hidden = !message;
}

async function submitSignup(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const f = form.elements;
  const input = {
    email: f.email.value,
    password: f.password.value,
    acceptedTerms: f.acceptedTerms.checked,
  };
  const { errors } = validateSignup(input);
  showFormError('');
  if (Object.keys(errors).length) return showErrors(form, errors);

  const button = $('#signup-submit');
  button.disabled = true;
  button.textContent = 'Criando sua conta…';
  try {
    const signup = await api('/api/signup', { method: 'POST', body: { ...input, utm: utm() } });
    state.signup = signup;
    state.shownNeed = null;
    storage.set(KEYS.signup, signup.id);
    storage.remove(KEYS.deposit);
    track('signup_submit');
    render('confirm');
  } catch (err) {
    if (err.data?.errors) showErrors(form, err.data.errors);
    showFormError(err.message);
    button.disabled = false;
    button.textContent = 'Criar minha conta';
  }
}

function fillTest() {
  const form = $('#signup-form');
  if (!form) return;
  const f = form.elements;
  const n = Math.floor(1000 + Math.random() * 9000);
  f.email.value = `teste${n}@exemplo.com`;
  f.password.value = 'Teste@123';
  f.acceptedTerms.checked = true;
  f.password.dispatchEvent(new Event('input', { bubbles: true }));
}

function togglePassword(button) {
  const input = button.previousElementSibling;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  button.textContent = show ? 'Ocultar' : 'Mostrar';
}

// ---------- 2. Confirmação ----------

function initConfirm() {
  if (state.signup) renderSignup(state.signup);
  $('#code-form').addEventListener('submit', submitCode);
  $('#id-form').addEventListener('submit', submitSupremaId);
  $('#club-form').addEventListener('submit', (e) => submitSupremaId(e, '#f-club-sid', '#club-error'));
  setupInvite();
  poll(refreshSignup, 1200);
}

async function refreshSignup() {
  const id = storage.get(KEYS.signup);
  if (!id) return;
  try {
    state.signup = await api(`/api/signup/${id}`);
    renderSignup(state.signup);
  } catch (err) {
    if (err.status === 404) {
      forgetSignup();
      render('form');
    }
  }
}

const STEP_ICONS = { ok: '✓', erro: '!', aguardando: '!', rodando: '', pendente: '' };

function renderSignup(s) {
  if (state.view !== 'confirm') return;
  $('#checklist').innerHTML = s.steps
    .filter((st) => st.phase === 'conta')
    .map((st) => `<li class="${esc(st.state)}"><span class="ico" aria-hidden="true">${STEP_ICONS[st.state] ?? ''}</span><span>${esc(st.label)}</span></li>`)
    .join('');
  $$('[data-bind="email"]').forEach((el) => { el.textContent = s.player.email; });

  const waiting = s.status === 'aguardando_jogador';
  const needCode = waiting && s.needs === 'codigo_email';
  const needId = waiting && s.needs === 'id_suprema';
  const needClub = waiting && s.needs === 'entrar_clube';
  const failed = s.status === 'falhou' && !s.retrying && !s.accountReady;
  $('#need-code').hidden = !needCode;
  $('#need-id').hidden = !needId;
  $('#need-club').hidden = !needClub;
  $('#failed').hidden = !failed;

  if (needCode) {
    const hint = $('#code-hint');
    hint.hidden = !s.testHints?.emailCode;
    if (s.testHints?.emailCode) hint.textContent = `Modo teste: o código é ${s.testHints.emailCode}.`;
  }
  if (failed) $('#failed-msg').textContent = s.error || 'Tente de novo em instantes.';

  const need = needCode ? 'code' : needId ? 'id' : needClub ? 'club' : null;
  if (need && state.shownNeed !== need) {
    state.shownNeed = need;
    if (need !== 'club' || hasFinePointer()) $({ code: '#f-code', id: '#f-sid', club: '#f-club-sid' }[need]).focus();
  }

  $('#confirm-sub').textContent =
    s.status === 'falhou' && s.retrying ? 'Deu um problema rápido. Tentando de novo…'
      : needCode ? 'Falta só confirmar seu e-mail.'
        : needId ? 'Falta só vincular sua conta.'
          : needClub ? 'Sua conta do site está criada. Agora, a do app, já dentro do clube.'
          : failed ? ''
            : s.accountReady ? 'Tudo certo! Indo para o depósito…'
              : 'Isso leva só alguns segundos.';

  if (needClub) $('#sheet-title').textContent = 'Agora, entre no clube';
  if (s.accountReady) {
    $('#sheet-title').textContent = 'Conta criada!';
    trackOnce(`complete:${s.id}`, 'signup_complete');
    stopAll();
    setTimeout(() => { if (state.view === 'confirm') render(afterAccount()); }, 900);
  }
}

async function submitCode(e) {
  e.preventDefault();
  const input = $('#f-code');
  const error = $('#code-error');
  const code = onlyDigits(input.value);
  if (code.length !== 6) {
    error.textContent = 'Digite os 6 números do código.';
    return;
  }
  error.textContent = '';
  const button = e.currentTarget.querySelector('button');
  button.disabled = true;
  try {
    await api(`/api/signup/${state.signup.id}/email-code`, { method: 'POST', body: { code } });
    input.value = '';
    await refreshSignup();
  } catch (err) {
    error.textContent = err.message;
  } finally {
    button.disabled = false;
  }
}

async function resendCode() {
  try {
    await api(`/api/signup/${state.signup.id}/resend-code`, { method: 'POST' });
    toast('Código reenviado. Confira seu e-mail.');
  } catch (err) {
    toast(err.message);
  }
}

async function submitSupremaId(e, inputSel = '#f-sid', errorSel = '#id-error') {
  e.preventDefault();
  const input = $(inputSel);
  const error = $(errorSel);
  const supremaId = onlyDigits(input.value);
  if (supremaId.length < 4) {
    error.textContent = 'Digite o seu ID de jogador da Suprema (só números, fica no seu perfil no app).';
    return;
  }
  error.textContent = '';
  const button = e.currentTarget.querySelector('button');
  button.disabled = true;
  try {
    await api(`/api/signup/${state.signup.id}/suprema-id`, { method: 'POST', body: { supremaId } });
    await refreshSignup();
  } catch (err) {
    error.textContent = err.message;
  } finally {
    button.disabled = false;
  }
}

async function retrySignup() {
  try {
    await api(`/api/signup/${state.signup.id}/retry`, { method: 'POST' });
    await refreshSignup();
  } catch (err) {
    toast(err.message);
  }
}

// ---------- 3. Depósito ----------

function parseAmount(raw) {
  const text = String(raw).trim();
  if (!text) return NaN;
  return Number(text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text);
}

function syncAmounts() {
  const custom = $('#f-amount').value.trim();
  $$('#amounts [data-amount]').forEach((b) => {
    b.setAttribute('aria-checked', String(!custom && Number(b.dataset.amount) === state.selectedAmount));
  });
}

async function initDeposit() {
  const { presets, min, max } = state.config.deposit;
  if (!Number.isFinite(state.selectedAmount)) state.selectedAmount = presets.includes(50) ? 50 : presets[0];

  const box = $('#amounts');
  box.innerHTML = presets.map((v) => `<button type="button" class="amount" role="radio" data-amount="${v}">R$ ${v}</button>`).join('');
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-amount]');
    if (!b) return;
    state.selectedAmount = Number(b.dataset.amount);
    $('#f-amount').value = '';
    $('#amount-error').textContent = '';
    syncAmounts();
  });
  syncAmounts();

  $('#amount-hint').textContent = `Mínimo ${brl(min)} · máximo ${brl(max)}`;
  $('#f-amount').addEventListener('input', (e) => {
    const value = parseAmount(e.target.value);
    state.selectedAmount = Number.isFinite(value) ? value : null;
    $('#amount-error').textContent = '';
    syncAmounts();
  });
  $('#pix-generate').addEventListener('click', generatePix);
  $('#f24h-code-form').addEventListener('submit', (e) => sendDepositNeed(e, 'f24h-code', '#f-f24h-code', '#f24h-code-error', 'code',
    (v) => (/^\d{6,8}$/.test(onlyDigits(v)) ? '' : 'Digite os números do código que chegou no e-mail.')));
  $('#chips-form').addEventListener('submit', (e) => sendDepositNeed(e, 'validation', '#f-chips', '#chips-error', 'value',
    (v) => (/^\d+([.,]\d{1,2})?$/.test(String(v).trim()) ? '' : 'Digite o valor que chegou, como aparece no app (ex.: 3,5).')));
  $('#simulate-paid').addEventListener('click', simulatePaid);

  const payer = $('#payer-form');
  setupPayerMasks(payer);
  payer.addEventListener('submit', (e) => { e.preventDefault(); generatePix(); });
  try { state.signup = await api(`/api/signup/${state.signup.id}`); } catch { /* usa o que já tem */ }
  if (state.view !== 'deposit') return;
  payer.hidden = state.signup.status === 'pronto';
  $('#payer-password').hidden = !state.signup.needsPassword;

  const pendingId = storage.get(KEYS.deposit);
  if (pendingId) {
    try {
      const d = await api(`/api/deposit/${pendingId}`);
      if (d.status === 'aguardando_pagamento' || d.status === 'pago') return showPix(d);
    } catch { /* gera outro */ }
    storage.remove(KEYS.deposit);
  }
}

function showDepositError(message) {
  const box = $('#deposit-error');
  if (!box) return;
  box.textContent = message || '';
  box.hidden = !message;
}

// Primeiro depósito: manda os dados do pagador e espera a camada criar a conta no Fichas 24h.
async function submitPayer() {
  const form = $('#payer-form');
  const f = form.elements;
  const input = { name: f.name.value, cpf: f.cpf.value, phone: f.phone.value, birth: f.birth.value };
  const { errors } = validatePayer(input, { allowTestCpf: state.config.testMode });
  if (!$('#payer-password').hidden) {
    input.password = f.password.value;
    const pwdError = passwordError(input.password);
    if (pwdError) errors.password = pwdError;
  }
  if (Object.keys(errors).length) {
    showErrors(form, errors);
    return false;
  }
  try {
    await api(`/api/signup/${state.signup.id}/payer`, { method: 'POST', body: input });
  } catch (err) {
    if (err.data?.errors?.password) $('#payer-password').hidden = false;
    if (err.data?.errors) showErrors(form, err.data.errors);
    throw err;
  }
  await waitForPixReady();
  form.hidden = true;
  track('payer_complete');
  return true;
}

// Etapas do Fichas 24h que dependem do jogador, mostradas na própria tela do depósito.
function showDepositNeed(s) {
  const need = s.status === 'aguardando_jogador' ? s.needs : null;
  const code = $('#need-f24h-code');
  const chips = $('#need-chips');
  if (!code || !chips) return null;
  code.hidden = need !== 'codigo_f24h';
  chips.hidden = need !== 'valor_fichas';
  $$('[data-bind="email"]', code).forEach((el) => { el.textContent = s.player.email; });
  const codeHint = $('#f24h-code-hint');
  codeHint.hidden = !s.testHints?.f24hCode;
  if (s.testHints?.f24hCode) codeHint.textContent = `Modo teste: o código é ${s.testHints.f24hCode}.`;
  const chipsHint = $('#chips-hint');
  chipsHint.hidden = !s.testHints?.validationValue;
  if (s.testHints?.validationValue) chipsHint.textContent = `Modo teste: chegaram ${String(s.testHints.validationValue).replace('.', ',')} fichas.`;
  if (need === 'codigo_f24h' || need === 'valor_fichas') {
    if (state.shownNeed !== need) {
      state.shownNeed = need;
      $('#pix-generate').hidden = true;
      $('#payer-form').hidden = true;
      if (hasFinePointer()) $(need === 'codigo_f24h' ? '#f-f24h-code' : '#f-chips').focus();
    }
    return need;
  }
  return null;
}

async function sendDepositNeed(e, path, inputSel, errorSel, key, check) {
  e.preventDefault();
  const input = $(inputSel);
  const error = $(errorSel);
  const problem = check(input.value);
  error.textContent = problem || '';
  if (problem) return;
  const button = e.currentTarget.querySelector('button');
  button.disabled = true;
  try {
    await api(`/api/signup/${state.signup.id}/${path}`, { method: 'POST', body: { [key]: input.value } });
    input.value = '';
    input.closest('.card-inline').hidden = true;
    state.shownNeed = null;
  } catch (err) {
    error.textContent = err.message;
  } finally {
    button.disabled = false;
  }
}

async function waitForPixReady(timeoutMs = 45_000) {
  let started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 1000));
    if (state.view !== 'deposit') throw new Error('Cancelado.');
    const s = (state.signup = await api(`/api/signup/${state.signup.id}`));
    if (showDepositNeed(s)) { started = Date.now(); continue; } // esperando o jogador: sem prazo
    if (s.status === 'pronto') {
      $('#pix-generate').hidden = false;
      return;
    }
    if (s.status === 'falhou' && !s.retrying) throw new Error(s.error || 'Não conseguimos preparar seu PIX. Tente de novo.');
    if (s.status === 'aguardando_jogador' && s.needs === 'dados_pix') {
      $('#payer-password').hidden = !s.needsPassword;
      throw new Error('Confira seus dados e tente de novo.');
    }
  }
  throw new Error('Está demorando mais que o normal. Tente de novo em instantes.');
}

async function generatePix() {
  const amount = state.selectedAmount;
  const { min, max } = state.config.deposit;
  if (!Number.isFinite(amount) || amount < min || amount > max) {
    $('#amount-error').textContent = `Escolha um valor entre ${brl(min)} e ${brl(max)}.`;
    return;
  }
  const button = $('#pix-generate');
  const busy = (text) => {
    button.disabled = Boolean(text);
    button.textContent = text || 'Gerar PIX';
  };
  showDepositError('');
  try {
    if (state.signup.status !== 'pronto') {
      busy('Preparando seu PIX…');
      if (!(await submitPayer())) return;
    }
    busy('Gerando PIX…');
    const d = await api(`/api/signup/${state.signup.id}/deposit`, { method: 'POST', body: { amount } });
    storage.set(KEYS.deposit, d.id);
    track('deposit_pix_created', { value: d.amount, currency: 'BRL' });
    showPix(d);
  } catch (err) {
    if (state.view === 'deposit') showDepositError(err.message);
  } finally {
    if ($('#pix-generate')) busy('');
  }
}

function renderQr(text, box = $('#qr')) {
  if (typeof window.qrcode !== 'function') {
    box.textContent = box.id === 'qr' ? 'Use o PIX copia e cola abaixo.' : 'Use o botão "Abrir link do clube".';
    return;
  }
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

function showPix(d) {
  state.deposit = d;
  $('#deposit-choose').hidden = true;
  $('#deposit-pay').hidden = false;
  $('#pix-value').textContent = d.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  $('#pix-code').value = d.copiaECola;
  renderQr(d.copiaECola);
  $('#simulate-paid').hidden = !state.config.testMode;

  const timer = $('#pix-timer');
  const tick = () => {
    const ms = Date.parse(d.expiresAt) - Date.now();
    if (ms <= 0) { timer.textContent = ''; return; }
    const m = Math.floor(ms / 60000);
    const s = Math.floor(ms / 1000) % 60;
    timer.textContent = `· expira em ${m}:${String(s).padStart(2, '0')}`;
  };
  tick();
  every(tick, 1000);
  poll(refreshDeposit, 2000);
  updatePixStatus(d);
}

async function refreshDeposit() {
  if (!state.deposit) return;
  try {
    state.deposit = await api(`/api/deposit/${state.deposit.id}`);
    updatePixStatus(state.deposit);
  } catch { /* tenta de novo no próximo ciclo */ }
}

function updatePixStatus(d) {
  const box = $('#pix-status');
  if (!box) return;
  const text = $('#pix-status-text');
  box.classList.toggle('paid', d.status === 'pago' || d.status === 'creditado');
  box.classList.toggle('expired', d.status === 'expirado');

  if (d.status === 'aguardando_pagamento') text.textContent = 'Aguardando pagamento…';
  if (d.status === 'pago') {
    text.textContent = 'Pagamento recebido! Creditando suas fichas…';
    $('#pix-timer').textContent = '';
    $('#simulate-paid').hidden = true;
  }
  if (d.status === 'expirado') {
    stopAll();
    storage.remove(KEYS.deposit);
    text.textContent = 'Este PIX expirou. Gere um novo.';
    $('#pix-timer').textContent = '';
    $('#simulate-paid').hidden = true;
  }
  if (d.status === 'creditado') {
    stopAll();
    storage.remove(KEYS.deposit);
    text.textContent = 'Fichas creditadas!';
    $('#pix-timer').textContent = '';
    trackOnce(`paid:${d.id}`, 'deposit_paid', { value: d.amount, currency: 'BRL' });
    state.lastDeposited = d.amount;
    setTimeout(() => { if (state.view === 'deposit') render('app'); }, 1000);
  }
}

async function simulatePaid() {
  if (!state.deposit) return;
  try {
    await api(`/api/deposit/${state.deposit.id}/simulate-paid`, { method: 'POST' });
    await refreshDeposit();
  } catch (err) {
    toast(err.message);
  }
}

async function copyPix() {
  await copyText($('#pix-code').value);
  toast('Código PIX copiado!');
  track('pix_copy');
}

// ---------- 3b. Fichas 24h guiado ----------
// O cadastro do Fichas 24h não aceita dados por link: a página guarda os dados neste aparelho e mostra cada um,
// na ordem do formulário deles, com Copiar; o botão abre o sistema oficial do Fichas 24h numa aba nova.

function f24hData() {
  try { return JSON.parse(storage.get(KEYS.f24hData) || 'null'); } catch { return null; }
}

const fmtBirth = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso);

function copyRows(rows) {
  return rows.map(([label, value, copy = true]) => `
    <div class="copy-item"><dt>${esc(label)}</dt><dd data-clarity-mask="True">${esc(value)}</dd>${copy
      ? `<button class="btn btn-sm btn-ghost" type="button" data-action="copy-value" data-value="${esc(value)}">Copiar</button>` : ''}</div>`).join('');
}

function showFichasGuide(d) {
  const s = state.signup;
  $('#f24h-form').hidden = true;
  $('#f24h-guide').hidden = false;
  $('#fichas-sub').textContent = 'Seus dados estão prontos. Siga os 4 passos: em cada um, é só copiar e colar.';
  $('#copy-cadastro').innerHTML = copyRows([
    ['E-mail', s.player.email],
    ['Senha', 'a mesma que você criou aqui', false],
    ['Nome completo', d.name],
    ['CPF', maskCpf(d.cpf)],
    ['Nascimento', fmtBirth(d.birth)],
    ['Celular', maskPhone(d.phone)],
  ]);
  $('#copy-id').innerHTML = copyRows([
    ['Seu ID de jogador', s.supremaId || '(o ID do seu perfil no app)', Boolean(s.supremaId)],
    ['Clube', `${state.config.club.id}`],
    ['Agente', `${state.config.club.agentId}`],
  ]);
}

function initFichas() {
  // O formulário é ligado primeiro: sem o preventDefault, o navegador mandaria o CPF na barra de endereço.
  const form = $('#f24h-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = form.elements;
    const { errors, data } = validatePayer({ name: f.name.value, cpf: f.cpf.value, phone: f.phone.value, birth: f.birth.value });
    if (Object.keys(errors).length) return showErrors(form, errors);
    storage.set(KEYS.f24hData, JSON.stringify(data));
    track('payer_complete');
    showFichasGuide(data);
    $('.sheet-panel').scrollTop = 0;
  });
  const { f24h } = state.config;
  $('#f24h-open').href = f24h.signupUrl;
  $('#f24h-buy').href = f24h.homeUrl;
  $$('[data-bind="f24h-club"]').forEach((el) => { el.textContent = f24h.clubName; });
  $$('[data-app-link]').forEach((a) => { a.href = appLink(); });
  setupPayerMasks(form);
  const saved = f24hData();
  if (saved) {
    const f = form.elements;
    f.name.value = saved.name;
    f.cpf.value = maskCpf(saved.cpf);
    f.phone.value = maskPhone(saved.phone);
    f.birth.value = saved.birth;
    showFichasGuide(saved);
  }
  $('#f24h-open').addEventListener('click', () => track('f24h_signup_open'));
  $('#f24h-buy').addEventListener('click', () => track('buy_chips_click'));
}

// ---------- 4. Baixar e jogar ----------

function detectOs() {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/windows/i.test(ua)) return 'windows';
  return 'other';
}

function initApp() {
  const { club } = state.config;
  const deposited = state.lastDeposited;
  $('#sheet-title').textContent = deposited ? 'Fichas na conta! Agora é só jogar' : 'Conta pronta! Agora, o app';
  $('#app-sub').textContent = deposited
    ? `${brl(deposited)} em fichas no ${club.name}.`
    : 'Quando quiser, volte aqui para depositar por PIX.';
  $('#app-deposit-link').hidden = Boolean(deposited);
  setupInvite();
}

// ---------- Landing ----------

const ACTIONS = {
  start,
  resume,
  close: closeSheet,
  'fill-test': fillTest,
  'toggle-pwd': (el) => togglePassword(el),
  'resend-code': resendCode,
  'f24h-resend': async () => {
    try {
      await api(`/api/signup/${state.signup.id}/f24h-resend`, { method: 'POST' });
      toast('Código reenviado. Confira seu e-mail.');
    } catch (err) {
      toast(err.message);
    }
  },
  retry: retrySignup,
  restart: () => { forgetSignup(); render('form'); },
  'skip-deposit': () => { state.lastDeposited = null; render('app'); },
  'go-deposit': () => render('deposit'),
  'new-amount': () => { storage.remove(KEYS.deposit); state.deposit = null; render('deposit'); },
  'copy-pix': copyPix,
  'copy-value': async (el) => {
    await copyText(el.dataset.value);
    el.closest('.copy-item')?.classList.add('copied');
    el.textContent = 'Copiado';
    toast('Copiado!');
  },
  'f24h-edit': () => {
    $('#f24h-guide').hidden = true;
    $('#f24h-form').hidden = false;
  },
  'f24h-done': () => {
    storage.remove(KEYS.f24hData);
    track('deposit_paid_self_report');
    state.lastDeposited = null;
    render('app');
    $('#sheet-title').textContent = 'Tudo pronto! Agora é só jogar';
    $('#app-sub').textContent = `Suas fichas caem na sua conta do ${state.config.club.name}.`;
    $('#app-deposit-link').hidden = true;
  },
  copy: async (el) => {
    const { club } = state.config;
    await copyText(el.dataset.copyBind === 'agent-id' ? club.agentId : club.id);
    toast('Copiado!');
  },
  'restart-lead': () => {
    storage.remove(KEYS.lead);
    storage.remove(KEYS.leadEmail);
    render('lead');
  },
};

document.addEventListener('click', (e) => {
  const wa = e.target.closest('[data-wa]');
  if (wa && state.config) {
    wa.href = waLink(wa.dataset.wa);
    track('whatsapp_click', { step: wa.dataset.wa });
    leadEvent('whatsapp_click');
  }
  // O clique no link do app é registrado pelo próprio servidor (/baixar).
  if (e.target.closest('[data-app-link]')) track('app_download_click', { device: detectOs() });
  if (e.target.closest('[data-buy]')) {
    track('buy_chips_click');
    leadEvent('buy_chips_click');
  }

  if (e.target === $('#sheet')) return closeSheet();
  const el = e.target.closest('[data-action]');
  if (el && ACTIONS[el.dataset.action] && state.config) ACTIONS[el.dataset.action](el);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
});

window.addEventListener('hashchange', () => {
  if (location.hash === '#cadastro' && state.config && $('#sheet').hidden) start();
});

async function init() {
  captureUtm();
  try {
    state.config = await api('/api/config');
  } catch {
    document.body.insertAdjacentHTML('afterbegin', '<div class="test-banner">Não foi possível carregar a página. Recarregue para tentar de novo.</div>');
    return;
  }
  $('#test-banner').hidden = !state.config.testMode;
  if (state.config.f24h?.guided) {
    FLOW_VIEWS.completo = [['form', 'Cadastro'], ['confirm', 'Entrar no clube'], ['fichas', 'Fichas'], ['app', 'Jogar']];
  }
  $$('[data-flow]').forEach((el) => { el.hidden = el.dataset.flow !== state.config.flow; });
  loadTracking(state.config.tracking);
  bindDynamic();
  refreshResume();
  if (typeof window.clarity === 'function') window.clarity('set', 'variante', lpVariant());
  track('lp_view', { variant: lpVariant() });
  // Avisa o motion.js que a página está pronta (fluxo certo visível) para animar as entradas.
  document.dispatchEvent(new CustomEvent('lp:ready'));
  if (location.hash === '#cadastro') start();
}

init();
