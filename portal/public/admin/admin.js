// Painel do Portal de Afiliação (sem framework). Rotas por hash: #/  #/nova  #/t/<op>  #/t/<op>/site  #/t/<op>/editor/<página> ...
// Módulos extras (blog, mídia, telegram...) registram tela em /admin/modules/<id>.js exportando render(el, ctx).
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const S = { me: null, meta: null, csrf: '', tenant: null, tenantData: null };
const app = $('#app');

// ---------- API ----------
async function api(method, path, body) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF'] = S.csrf;
  const r = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/api/login') { S.me = null; renderLogin(); throw new Error('Entre para continuar.'); }
  if (!r.ok) throw Object.assign(new Error(data.error || `Erro ${r.status}`), { status: r.status, data });
  return data;
}
function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast${bad ? ' bad' : ''}`;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, 3200);
}
const can = (perm) => S.me?.user.isSuper || (S.tenant?.perms || []).includes(perm);
const statusPill = (s) => {
  const map = { ativo: ['ok', 'Ativo'], instalado: ['ok', 'ID instalado'], conectado: ['ok', 'Conectado'], pendente: ['warn', 'Pendente de configuração'],
    erro: ['bad', 'Erro'], publicado: ['ok', 'Publicado'], rascunho: ['info', 'Rascunho'], externo: ['gold', 'Site atual (externo)'], pausado: ['warn', 'Pausado'] };
  const [cls, label] = map[s] || ['', s];
  return `<span class="pill ${cls}"><span class="dot"></span>${esc(label)}</span>`;
};

// ---------- login ----------
function renderLogin() {
  app.className = '';
  app.innerHTML = `<div class="login"><form id="login-form">
    <div class="logo"><span class="logo-mark">S</span><div>Portal de Afiliação<small>Painel de operações</small></div></div>
    <label class="field">E-mail<input name="email" type="email" autocomplete="username" required></label>
    <label class="field">Senha<input name="password" type="password" autocomplete="current-password" required></label>
    <p class="err" id="login-err"></p>
    <button class="btn primary" type="submit">Entrar</button></form></div>`;
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    try {
      const r = await api('POST', '/api/login', { email: f.email.value, password: f.password.value });
      S.csrf = r.csrf;
      await boot();
    } catch (err) { $('#login-err').textContent = err.message; }
  });
}

// ---------- estrutura ----------
function navLinks(route) {
  const t = S.tenant;
  const items = [];
  if (S.me.user.isSuper) {
    items.push(['title', 'Administração central']);
    items.push(['#/', 'Visão geral', route.view === 'central']);
    items.push(['#/nova', 'Nova operação', route.view === 'nova']);
  }
  if (t) {
    items.push(['title', t.label]);
    const v = route.view;
    const add = (hash, label, perm, on, extra = '') => { if (!perm || can(perm)) items.push([`#/t/${t.slug}${hash}`, label, on, extra]); };
    add('', 'Painel', 'tenant.read', v === 'dash');
    add('/site', 'Sites e páginas', 'site.read', v === 'site' || v === 'editor');
    add('/seo', 'SEO', 'site.read', v === 'seo');
    add('/leads', 'Leads e CRM', 'leads.read', v === 'leads');
    add('/afiliados', 'Afiliados', 'affiliates.read', v === 'afiliados');
    add('/calendario', 'Calendário editorial', 'calendar.read', v === 'calendario');
    for (const m of S.meta.modules || []) add(`/m/${m.id}`, m.label, m.perm, v === 'module' && route.module === m.id);
    add('/integracoes', 'Integrações', 'integrations.read', v === 'integracoes');
    add('/usuarios', 'Usuários', 'users.manage', v === 'usuarios');
    add('/config', 'Configurações', 'tenant.manage', v === 'config');
    add('/auditoria', 'Auditoria', 'audit.read', v === 'auditoria');
  }
  return items.map(([h, label, on]) => (h === 'title' ? `<div class="nav-title">${esc(label)}</div>` : `<a href="${h}" class="${on ? 'on' : ''}">${esc(label)}</a>`)).join('');
}

function layout(route, inner) {
  app.className = '';
  const tenants = S.me.tenants;
  app.innerHTML = `<div class="shell" id="shell"><aside class="side">
      <div class="logo"><span class="logo-mark">S</span><div>Portal de Afiliação<small>${esc(S.me.user.isSuper ? 'Superadministrador' : S.tenant?.role || '')}</small></div></div>
      ${tenants.length ? `<label class="tenant-pick field">Operação<select id="tenant-pick">${tenants.map((t) => `<option value="${esc(t.slug)}" ${S.tenant?.slug === t.slug ? 'selected' : ''}>${esc(t.label)} · ${esc(t.name)}${t.demo ? ' (demo)' : ''}</option>`).join('')}</select></label>` : ''}
      <nav class="nav">${navLinks(route)}</nav>
      <div class="side-foot"><div>${esc(S.me.user.name)}</div><div class="muted">${esc(S.me.user.email)}</div><div class="row" style="margin-top:8px"><button class="btn sm" id="logout" type="button">Sair</button></div></div>
    </aside><main class="main" id="main"><button class="btn sm menu-btn" id="menu-btn" type="button">☰ Menu</button>${inner}</main></div>`;
  $('#tenant-pick')?.addEventListener('change', (e) => { location.hash = `#/t/${e.target.value}`; });
  $('#logout').addEventListener('click', async () => { await api('POST', '/api/logout'); S.me = null; renderLogin(); });
  $('#menu-btn').addEventListener('click', () => $('#shell').classList.toggle('open'));
  return $('#main');
}

// ---------- rotas ----------
function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (!parts.length) return { view: 'central' };
  if (parts[0] === 'nova') return { view: 'nova' };
  if (parts[0] === 't') {
    const slug = parts[1];
    const sub = parts[2] || '';
    const views = { '': 'dash', site: 'site', editor: 'editor', seo: 'seo', leads: 'leads', afiliados: 'afiliados', integracoes: 'integracoes', usuarios: 'usuarios', calendario: 'calendario', auditoria: 'auditoria', config: 'config', m: 'module' };
    return { view: views[sub] || 'dash', slug, id: parts[3], module: sub === 'm' ? parts[3] : null };
  }
  return { view: 'central' };
}

async function route() {
  if (!S.me) return;
  const r = parseRoute();
  if (r.slug) {
    S.tenant = S.me.tenants.find((t) => t.slug === r.slug) || null;
    if (!S.tenant) { location.hash = '#/'; return; }
  } else if (!S.me.user.isSuper) {
    if (S.me.tenants[0]) { location.hash = `#/t/${S.me.tenants[0].slug}`; return; }
  }
  const views = { central: viewCentral, nova: viewNova, dash: viewDash, site: viewSite, editor: viewEditor, seo: viewSeo, leads: viewLeads, afiliados: viewAfiliados,
    integracoes: viewIntegracoes, usuarios: viewUsuarios, calendario: viewCalendario, auditoria: viewAuditoria, config: viewConfig, module: viewModule };
  try {
    await (views[r.view] || viewCentral)(r);
  } catch (e) {
    if (e.message !== 'Entre para continuar.') layout(r, `<div class="card"><h2>Não deu para abrir esta tela</h2><p class="err">${esc(e.message)}</p></div>`);
  }
}

// ---------- administração central ----------
async function viewCentral(r) {
  if (!S.me.user.isSuper) {
    layout(r, '<div class="empty">Você ainda não tem acesso a nenhuma operação. Peça ao administrador para incluir você.</div>');
    return;
  }
  const d = await api('GET', '/api/admin/overview');
  const main = layout(r, `<div class="page-head"><div><h1>Visão geral</h1><p>Todas as operações, sites, leads e integrações.</p></div><span class="spacer"></span><a class="btn primary" href="#/nova">Nova operação</a></div>
    <div class="kpis">
      <div class="kpi"><b>${d.totals.tenants}</b><span>operações</span></div>
      <div class="kpi"><b>${d.totals.users}</b><span>usuários</span></div>
      <div class="kpi"><b>${d.totals.leads30}</b><span>leads em 30 dias</span></div>
      <div class="kpi"><b>${d.totals.conversions30}</b><span>conversões verificadas em 30 dias</span></div>
    </div>
    <div class="card"><div class="card-head"><h2>Operações</h2></div><div class="table-wrap"><table><thead><tr><th>Operação</th><th>Nicho</th><th>Sites</th><th>Leads 30d</th><th>Conversões 30d</th><th>Afiliados</th><th>Integrações</th></tr></thead><tbody>
      ${d.tenants.map((t) => {
        const ok = t.integrations.filter((i) => i.status !== 'pendente').length;
        const err = t.integrations.filter((i) => i.status === 'erro').length;
        return `<tr><td><a href="#/t/${esc(t.slug)}"><strong>${esc(t.label)}</strong></a> · ${esc(t.name)} ${t.demo ? '<span class="pill info">demo</span>' : ''}</td><td>${esc(S.meta.niches.find((n) => n.id === t.niche)?.name || t.niche)}</td>
          <td>${t.sites}</td><td>${t.leads30}</td><td>${t.conversions30}</td><td>${t.affiliates}</td>
          <td>${err ? `<span class="pill bad">${err} com erro</span> ` : ''}<span class="pill ${ok ? 'ok' : 'warn'}">${ok}/${t.integrations.length} configuradas</span></td></tr>`;
      }).join('') || '<tr><td colspan="7" class="muted">Nenhuma operação ainda.</td></tr>'}
    </tbody></table></div></div>
    <div class="grid2" style="margin-top:14px">
      <div class="card"><div class="card-head"><h2>Últimas ações</h2></div>${auditTable(d.audit.slice(0, 12), true)}</div>
      <div class="card"><div class="card-head"><h2>Custos de IA e serviços</h2></div><p class="muted">${esc(d.costs.note)}</p></div>
    </div>`);
  return main;
}

function auditTable(rows, withTenant = false) {
  if (!rows.length) return '<div class="empty">Sem registros.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Quando</th><th>Ação</th>${withTenant ? '<th>Quem</th>' : ''}<th>Detalhe</th></tr></thead><tbody>${rows.map((a) => `<tr><td class="mono">${fmtDate(a.created_at)}</td><td>${esc(a.action)}</td>${withTenant ? `<td>${esc(a.email || '—')}</td>` : ''}<td class="muted">${esc(JSON.stringify(a.data)).slice(0, 120)}</td></tr>`).join('')}</tbody></table></div>`;
}

// ---------- nova operação (assistente) ----------
async function viewNova(r) {
  if (!S.me.user.isSuper) { location.hash = '#/'; return; }
  const W = { step: 0, niche: 'poker', template: null, theme: {}, data: { settings: {} }, modules: null };
  const STEPS = ['Nicho', 'Dados', 'Modelo', 'Aparência', 'Módulos', 'Revisar'];
  const main = layout(r, `<div class="page-head"><div><h1>Nova operação</h1><p>Do cadastro ao site pronto para editar, em seis passos.</p></div></div>
    <div class="wizard"><ol class="wiz-steps" id="wiz-steps"></ol><div class="card" id="wiz-body"></div></div>`);
  const body = $('#wiz-body', main);
  const niche = () => S.meta.niches.find((n) => n.id === W.niche);
  let templates = [];

  async function draw() {
    $('#wiz-steps').innerHTML = STEPS.map((s, i) => `<li class="${i === W.step ? 'on' : i < W.step ? 'done' : ''}"><b>${i + 1}</b>${esc(s)}</li>`).join('');
    const n = niche();
    if (W.step === 0) {
      body.innerHTML = `<h2>Qual é o nicho?</h2><p class="muted">O nicho define os termos do painel e do site, os eventos de conversão e a regra de comissão padrão.</p>
        <div class="choice-grid">${S.meta.niches.map((x) => `<button type="button" class="choice ${x.id === W.niche ? 'on' : ''}" data-niche="${esc(x.id)}"><strong>${esc(x.name)}</strong><small>Ex.: ${esc(x.terms.unit)} 10002 · ${esc(x.terms.customers)} · ${esc(x.conversions.map((c) => c.label).join(', '))}</small></button>`).join('')}</div>`;
      $$('[data-niche]', body).forEach((b) => b.addEventListener('click', () => { W.niche = b.dataset.niche; W.template = null; W.modules = null; draw(); }));
    }
    if (W.step === 1) {
      const s = W.data.settings;
      body.innerHTML = `<h2>Dados da operação</h2><div class="grid2" style="margin-top:12px">
        <label class="field">Nome<input id="w-name" value="${esc(W.data.name || '')}" placeholder="Ex.: Clube Estrela" required></label>
        <label class="field">${esc(n.terms.number)}<input id="w-number" value="${esc(W.data.number || '')}" placeholder="Ex.: 10002"></label>
        <label class="field">Frase curta (aparece no SEO)<input data-s="tagline" value="${esc(s.tagline || '')}"></label>
        <label class="field">Logo (URL de imagem)<input data-s="logo" value="${esc(s.logo || '')}" placeholder="https://..."></label>
        <label class="field">WhatsApp (com DDI)<input data-s="whatsapp" value="${esc(s.whatsapp || '')}" placeholder="5511999999999"></label>
        <label class="field">Telegram<input data-s="telegram" value="${esc(s.telegram || '')}" placeholder="@canal"></label>
        <label class="field">Instagram<input data-s="instagram" value="${esc(s.instagram || '')}" placeholder="@perfil"></label>
        <label class="field">E-mail de contato<input data-s="email" value="${esc(s.email || '')}"></label>
        <label class="field">Domínio (opcional)<input id="w-domain" value="${esc(W.data.domain || '')}" placeholder="clube.com.br"></label>
        ${n.fields.map((f) => `<label class="field">${esc(f.label)}<input data-s="${esc(f.key)}" value="${esc(s[f.key] || '')}" placeholder="${esc(f.placeholder || '')}"></label>`).join('')}
      </div><p class="err" id="w-err"></p>`;
    }
    if (W.step === 2) {
      templates = (await api('GET', `/api/meta?niche=${encodeURIComponent(W.niche)}`)).templates;
      body.innerHTML = `<h2>Escolha o modelo do site</h2><p class="muted">O conteúdo nasce editável. Atualizações futuras do modelo nunca mudam o seu site sozinhas.</p>
        ${templates.length ? `<div class="choice-grid">${templates.map((t) => `<button type="button" class="choice ${W.template === t.id ? 'on' : ''}" data-tpl="${esc(t.id)}">
          <div class="swatch"><div class="sw-bg" style="background:${esc(t.theme.bg)};color:${esc(t.theme.text)}"><span></span><span></span></div><i style="background:${esc(t.theme.primary)}"></i><i style="background:${esc(t.theme.accent)}"></i></div>
          <strong>${esc(t.name)}</strong><small>${esc(t.category)} · ${t.pages.length} páginas</small><small>${esc(t.description)}</small></button>`).join('')}
          <button type="button" class="choice ${W.template === '' ? 'on' : ''}" data-tpl=""><strong>Sem site por enquanto</strong><small>Cria só a operação. Dá para criar o site depois.</small></button></div>`
          : '<div class="empty">Ainda não há modelos para este nicho. A operação pode ser criada sem site e ganhar um depois.</div>'}`;
      $$('[data-tpl]', body).forEach((b) => b.addEventListener('click', () => {
        W.template = b.dataset.tpl;
        W.theme = { ...(templates.find((t) => t.id === W.template)?.theme || {}) };
        draw();
      }));
    }
    if (W.step === 3) {
      const t = W.theme;
      const color = (k, label) => `<label class="field">${label}<input type="color" data-t="${k}" value="${esc(t[k] || '#000000')}"></label>`;
      body.innerHTML = `<h2>Aparência</h2><p class="muted">Cores e fontes do site. Tudo continua editável no construtor.</p>
        <div class="grid2" style="margin-top:12px">${color('primary', 'Cor principal (botões)')}${color('accent', 'Cor de apoio')}${color('bg', 'Fundo')}${color('surface', 'Cartões')}${color('text', 'Texto')}${color('muted', 'Texto secundário')}
        <label class="field">Fonte dos títulos<select data-t="fontHead">${S.meta.fonts.map((f) => `<option ${t.fontHead === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
        <label class="field">Fonte do texto<select data-t="font">${S.meta.fonts.map((f) => `<option ${t.font === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
        <label class="field">Modo<select data-t="mode"><option ${t.mode === 'escuro' ? 'selected' : ''}>escuro</option><option ${t.mode === 'claro' ? 'selected' : ''}>claro</option></select></label>
        <label class="field">Arredondamento (px)<input type="number" min="0" max="28" data-t="radius" value="${esc(t.radius ?? 14)}"></label></div>
        ${W.template ? '' : '<p class="muted" style="margin-top:10px">Sem modelo escolhido: a aparência vale para o primeiro site que você criar.</p>'}`;
    }
    if (W.step === 4) {
      W.modules ??= [...n.modules];
      const labels = { site: 'Site e construtor', blog: 'Blog', crm: 'Leads e CRM', afiliados: 'Afiliados', criativos: 'Central de criativos', calendario: 'Calendário editorial',
        telegram: 'Telegram', instagram: 'Instagram', mensuracao: 'GA4, GTM e Pixel', campanhas: 'Meta Ads (rascunhos)', comissoes: 'Comissões' };
      body.innerHTML = `<h2>Módulos</h2><p class="muted">Ligue só o que esta operação vai usar.</p><div class="grid2" style="margin-top:12px">
        ${n.modules.map((m) => `<label class="check"><input type="checkbox" data-m="${esc(m)}" ${W.modules.includes(m) ? 'checked' : ''}> ${esc(labels[m] || m)}</label>`).join('')}</div>
        <label class="field" style="margin-top:14px;max-width:280px">Publicações por dia (calendário)<input type="number" min="0" max="12" id="w-ppd" value="${esc(W.data.settings.postsPerDay ?? 3)}"></label>
        <label class="field" style="max-width:280px">Horários (fuso da operação)<input id="w-times" value="${esc(W.data.settings.postTimes || '12:00,15:00,18:00')}"></label>`;
    }
    if (W.step === 5) {
      const t = templates.find((x) => x.id === W.template);
      body.innerHTML = `<h2>Revisar e criar</h2><table style="margin-top:10px"><tbody>
        <tr><th>Operação</th><td><strong>${esc(n.terms.unit)} ${esc(W.data.number || '')}</strong> · ${esc(W.data.name)}</td></tr>
        <tr><th>Nicho</th><td>${esc(n.name)}</td></tr>
        <tr><th>Modelo</th><td>${t ? esc(t.name) : 'Sem site por enquanto'}</td></tr>
        <tr><th>Módulos</th><td>${esc((W.modules || []).join(', '))}</td></tr>
        <tr><th>Comissão padrão</th><td>${esc(n.commission.model)} · janela de ${n.commission.windowDays} dias (ajustável depois)</td></tr>
        <tr><th>Integrações</th><td>Começam como <span class="pill warn">pendente de configuração</span>; nada é conectado sem você.</td></tr>
      </tbody></table><p class="err" id="w-err"></p>`;
    }
    body.insertAdjacentHTML('beforeend', `<div class="row end" style="margin-top:18px">${W.step ? '<button class="btn" type="button" id="w-back">Voltar</button>' : ''}
      <button class="btn primary" type="button" id="w-next">${W.step === STEPS.length - 1 ? 'Criar operação' : 'Continuar'}</button></div>`);
    $('#w-back')?.addEventListener('click', () => { collect(); W.step--; draw(); });
    $('#w-next').addEventListener('click', next);
  }
  function collect() {
    if (W.step === 1) {
      W.data.name = $('#w-name').value.trim();
      W.data.number = $('#w-number').value.trim();
      W.data.domain = $('#w-domain').value.trim();
      $$('[data-s]', body).forEach((i) => { W.data.settings[i.dataset.s] = i.value.trim(); });
    }
    if (W.step === 3) $$('[data-t]', body).forEach((i) => { W.theme[i.dataset.t] = i.type === 'number' ? Number(i.value) : i.value; });
    if (W.step === 4) {
      W.modules = $$('[data-m]', body).filter((i) => i.checked).map((i) => i.dataset.m);
      W.data.settings.postsPerDay = Number($('#w-ppd').value);
      W.data.settings.postTimes = $('#w-times').value.trim();
    }
  }
  async function next() {
    collect();
    if (W.step === 1 && W.data.name.length < 2) { $('#w-err').textContent = 'Dê um nome para a operação.'; return; }
    if (W.step === 2 && W.template === null) { toast('Escolha um modelo (ou "Sem site por enquanto").', true); return; }
    if (W.step < STEPS.length - 1) { W.step++; draw(); return; }
    const btn = $('#w-next');
    btn.disabled = true;
    try {
      const res = await api('POST', '/api/tenants', { name: W.data.name, number: W.data.number, niche: W.niche, template: W.template || undefined,
        theme: W.theme, settings: W.data.settings, modules: W.modules, domain: W.data.domain || undefined });
      S.me = await api('GET', '/api/me');
      toast(`${res.tenant.label} criada.`);
      location.hash = `#/t/${res.tenant.slug}/site`;
    } catch (e) { $('#w-err').textContent = e.message; btn.disabled = false; }
  }
  draw();
}

// ---------- painel da operação ----------
async function viewDash(r) {
  const d = await api('GET', `/api/t/${S.tenant.slug}`);
  S.tenantData = d;
  const k = d.dashboard;
  const terms = d.niche.terms;
  layout(r, `<div class="page-head"><div><h1>${esc(d.tenant.label)} · ${esc(d.tenant.name)}</h1><p>${esc(d.niche.name)} ${d.tenant.demo ? '· <span class="pill info">operação de demonstração</span>' : ''}</p></div>
      <span class="spacer"></span>${can('site.read') ? `<a class="btn primary" href="#/t/${esc(S.tenant.slug)}/site">Abrir o site</a>` : ''}</div>
    <div class="kpis">
      <div class="kpi"><b>${k.leads30}</b><span>leads em 30 dias (${k.leadsTotal} no total)</span></div>
      <div class="kpi"><b>${k.clicks30}</b><span>cliques de afiliados em 30 dias</span></div>
      <div class="kpi"><b>${k.conversions30}</b><span>conversões verificadas em 30 dias</span></div>
      <div class="kpi"><b>${k.affiliates}</b><span>${esc(terms.partner.toLowerCase())}s / afiliados ativos</span></div>
      <div class="kpi"><b>${k.published}</b><span>páginas publicadas</span></div>
      <div class="kpi"><b>${k.pendingIntegrations}</b><span>integrações pendentes</span></div>
    </div>
    <div class="card"><div class="card-head"><h2>Leads recentes</h2><span class="spacer"></span>${can('leads.read') ? `<a class="btn sm" href="#/t/${esc(S.tenant.slug)}/leads">Ver todos</a>` : ''}</div>
      ${d.recentLeads.length ? `<div class="table-wrap"><table><thead><tr><th>Quando</th><th>Contato</th><th>Origem</th><th>Etapa</th></tr></thead><tbody>${d.recentLeads.map((l) => `<tr><td class="mono">${fmtDate(l.createdAt)}</td><td>${esc(l.name || '')} <span class="muted">${esc(l.email)}</span></td><td>${esc(l.utm.utm_source || 'direto')}${l.utm.utm_campaign ? ` · ${esc(l.utm.utm_campaign)}` : ''}</td><td><span class="pill">${esc(l.stage)}</span></td></tr>`).join('')}</tbody></table></div>`
        : '<div class="empty">Nenhum lead ainda. Os formulários do site enviam para cá, com a origem de cada contato.</div>'}</div>`);
}

// ---------- sites e páginas ----------
async function viewSite(r) {
  const { sites } = await api('GET', `/api/t/${S.tenant.slug}/sites`);
  const meta = await api('GET', `/api/meta?niche=${encodeURIComponent(S.tenant.niche)}`);
  const slug = S.tenant.slug;
  const main = layout(r, `<div class="page-head"><div><h1>Sites e páginas</h1><p>Edite por blocos, veja a prévia e publique quando estiver pronto.</p></div><span class="spacer"></span>
      ${can('site.edit') ? '<button class="btn" type="button" id="new-site">Novo site</button>' : ''}</div>
    ${sites.length ? sites.map((s) => `<div class="card" data-site="${esc(s.id)}"><div class="card-head"><h2>${esc(s.name)}</h2>${statusPill(s.status)}<span class="spacer"></span>
        <a class="btn sm" href="${esc(s.url)}" target="_blank" rel="noopener">Abrir site ↗</a>${can('site.edit') && !s.externalUrl ? `<button class="btn sm" type="button" data-settings="${esc(s.id)}">Aparência, SEO e mensuração</button>` : ''}</div>
      ${s.externalUrl ? `<p class="muted">Este é o site atual da operação, fora do construtor: <a href="${esc(s.externalUrl)}" target="_blank" rel="noopener">${esc(s.externalUrl)}</a>. Leads e afiliados podem ser ligados a ele pelo webhook de conversões.</p>` : `
      <p class="muted">Modelo: ${esc(s.templateId || '—')} v${esc(s.templateVersion || '')} · endereço: <span class="mono">${esc(s.url)}</span>${s.domain ? ` · domínio: <span class="mono">${esc(s.domain)}</span>` : ''}</p>
      <div class="table-wrap"><table><thead><tr><th>Página</th><th>Endereço</th><th>Situação</th><th>Atualizada</th><th></th></tr></thead><tbody>
      ${s.pages.map((p) => `<tr><td><strong>${esc(p.title)}</strong></td><td class="mono">/${esc(p.slug)}</td><td>${p.published ? (p.dirty ? '<span class="pill warn">Publicada, com alterações</span>' : statusPill('publicado')) : statusPill('rascunho')}</td><td class="mono">${fmtDate(p.updatedAt)}</td>
        <td class="row end"><a class="btn sm primary" href="#/t/${esc(slug)}/editor/${esc(p.id)}">Editar</a>${can('site.edit') ? `<button class="btn sm" type="button" data-dup="${esc(p.id)}" data-site-id="${esc(s.id)}">Duplicar</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>${can('site.edit') ? `<div class="row" style="margin-top:10px"><button class="btn sm" type="button" data-newpage="${esc(s.id)}">Nova página</button></div>` : ''}`}</div>`).join('')
      : '<div class="empty">Esta operação ainda não tem site. Crie um a partir de um modelo.</div>'}
    <dialog id="dlg"></dialog>`);
  const dlg = $('#dlg', main);
  $$('[data-dup]', main).forEach((b) => b.addEventListener('click', async () => {
    const res = await api('POST', `/api/t/${slug}/sites/${b.dataset.siteId}/pages`, { duplicateFrom: b.dataset.dup });
    toast('Página duplicada.');
    location.hash = `#/t/${slug}/editor/${res.page.id}`;
  }));
  $$('[data-newpage]', main).forEach((b) => b.addEventListener('click', async () => {
    const title = prompt('Nome da nova página');
    if (!title) return;
    const res = await api('POST', `/api/t/${slug}/sites/${b.dataset.newpage}/pages`, { title });
    location.hash = `#/t/${slug}/editor/${res.page.id}`;
  }));
  $('#new-site')?.addEventListener('click', () => {
    dlg.innerHTML = `<form method="dialog" id="ns"><h2>Novo site</h2><label class="field">Modelo<select name="template">${meta.templates.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></label>
      <p class="err" id="ns-err"></p><div class="row end"><button class="btn" value="cancel">Cancelar</button><button class="btn primary" id="ns-go" type="button">Criar</button></div></form>`;
    dlg.showModal();
    $('#ns-go', dlg).addEventListener('click', async () => {
      try { await api('POST', `/api/t/${slug}/sites`, { template: $('[name=template]', dlg).value }); dlg.close(); route(); } catch (e) { $('#ns-err', dlg).textContent = e.message; }
    });
  });
  $$('[data-settings]', main).forEach((b) => b.addEventListener('click', () => siteSettings(dlg, sites.find((s) => s.id === b.dataset.settings))));
}

function siteSettings(dlg, s) {
  const t = s.theme;
  const color = (k, label) => `<label class="field">${label}<input type="color" data-t="${k}" value="${esc(t[k] || '#000000')}"></label>`;
  dlg.innerHTML = `<form method="dialog"><h2>${esc(s.name)}</h2>
    <h3>Aparência</h3><div class="grid2">${color('primary', 'Principal')}${color('accent', 'Apoio')}${color('bg', 'Fundo')}${color('surface', 'Cartões')}${color('text', 'Texto')}${color('muted', 'Secundário')}
      <label class="field">Títulos<select data-t="fontHead">${S.meta.fonts.map((f) => `<option ${t.fontHead === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
      <label class="field">Texto<select data-t="font">${S.meta.fonts.map((f) => `<option ${t.font === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label></div>
    <h3>SEO do site</h3><label class="field">Título<input id="seo-t" maxlength="70" value="${esc(s.seo.title || '')}"></label>
    <label class="field">Descrição<textarea id="seo-d" maxlength="170">${esc(s.seo.description || '')}</textarea></label>
    <label class="field">Imagem de compartilhamento (URL)<input id="seo-i" value="${esc(s.seo.image || '')}"></label>
    <h3>Mensuração</h3><p class="muted">Instalar o ID faz o site enviar eventos (depois do consentimento do visitante). Ver relatórios exige conectar a conta em Integrações.</p>
    <div class="grid2"><label class="field">GA4 (G-XXXX)<input id="tr-ga4" value="${esc(s.tracking.ga4 || '')}"></label><label class="field">GTM (GTM-XXXX)<input id="tr-gtm" value="${esc(s.tracking.gtm || '')}"></label><label class="field">Meta Pixel (número)<input id="tr-px" value="${esc(s.tracking.pixel || '')}"></label></div>
    <h3>Domínio</h3><label class="field">Domínio próprio<input id="dom" value="${esc(s.domain || '')}" placeholder="clube.com.br"></label>
    <p class="muted">No DNS do domínio, crie um CNAME apontando para o endereço do portal. O site passa a responder no domínio assim que o DNS propagar.</p>
    <p class="err" id="ss-err"></p><div class="row end"><button class="btn" value="cancel">Fechar</button><button class="btn primary" type="button" id="ss-save">Salvar</button></div></form>`;
  dlg.showModal();
  $('#ss-save', dlg).addEventListener('click', async () => {
    const theme = {};
    $$('[data-t]', dlg).forEach((i) => { theme[i.dataset.t] = i.value; });
    try {
      await api('PATCH', `/api/t/${S.tenant.slug}/sites/${s.id}`, { theme, seo: { title: $('#seo-t', dlg).value, description: $('#seo-d', dlg).value, image: $('#seo-i', dlg).value },
        tracking: { ga4: $('#tr-ga4', dlg).value.trim(), gtm: $('#tr-gtm', dlg).value.trim(), pixel: $('#tr-px', dlg).value.trim() }, domain: $('#dom', dlg).value.trim() });
      dlg.close();
      toast('Site salvo.');
      route();
    } catch (e) { $('#ss-err', dlg).textContent = e.message; }
  });
}

// ---------- construtor ----------
async function viewEditor(r) {
  const slug = S.tenant.slug;
  const data = await api('GET', `/api/t/${slug}/pages/${r.id}`);
  const schema = S.meta.blocks;
  const E = { page: data.page, blocks: structuredClone(data.page.draft), open: null, timer: null, saving: false, mobile: false };
  const main = layout(r, `<div class="page-head"><div><h1>${esc(data.page.title)}</h1><p><a href="#/t/${esc(slug)}/site">← ${esc(data.site.name)}</a> · <span class="mono">/${esc(data.page.slug)}</span></p></div><span class="spacer"></span>
      <span class="save-state" id="save-state">Tudo salvo</span>
      <button class="btn" type="button" id="versions">Versões</button>
      <a class="btn" href="/s/${esc(data.site.slug)}/${esc(data.page.slug)}" target="_blank" rel="noopener">Ver publicada ↗</a>
      ${can('site.publish') ? '<button class="btn gold" type="button" id="publish">Publicar</button>' : '<span class="pill">Seu papel não publica</span>'}</div>
    <div class="builder"><div class="builder-side">
      <div class="card"><h3>Página</h3><div class="grid2" style="margin-top:8px"><label class="field">Título<input id="p-title" value="${esc(E.page.title)}"></label>
        <label class="field">Endereço<input id="p-slug" value="${esc(E.page.slug)}" ${E.page.slug === '' ? 'disabled title="A página inicial fica no endereço raiz"' : ''}></label></div>
        <label class="field" style="margin-top:8px">Título para o Google<input id="p-seo-t" maxlength="70" value="${esc(E.page.seo.title || '')}"></label>
        <label class="field">Descrição para o Google<textarea id="p-seo-d" maxlength="170">${esc(E.page.seo.description || '')}</textarea></label>
        <label class="check"><input type="checkbox" id="p-noindex" ${E.page.seo.noindex ? 'checked' : ''}> Esconder dos buscadores</label>
        <h3 style="margin-top:12px">Checklist de SEO</h3><div id="seo-checks">${checksHtml(data.seo || [])}</div>
        <p class="muted" style="font-size:12px">Ao publicar, o portal avisa o Bing e os outros buscadores do IndexNow e atualiza o sitemap que o Google lê.</p></div>
      <div class="card"><div class="card-head"><h3>Blocos</h3><span class="spacer"></span><select id="add-type" style="width:auto">${Object.entries(schema).map(([k, b]) => `<option value="${esc(k)}">${esc(b.label)}</option>`).join('')}</select><button class="btn sm" type="button" id="add-blk">Adicionar</button></div>
        <div class="blocks" id="blocks"></div></div>
    </div>
    <div class="preview-wrap"><div class="preview-bar"><strong>Prévia do rascunho</strong><span class="spacer"></span><button class="btn sm" type="button" id="pv-desk">Computador</button><button class="btn sm" type="button" id="pv-mob">Celular</button><button class="btn sm" type="button" id="pv-reload">Atualizar</button></div>
      <iframe class="preview-frame" id="pv" title="Prévia da página" src="/api/t/${esc(slug)}/pages/${esc(E.page.id)}/preview"></iframe></div></div>
    <dialog id="dlg"></dialog>`);

  const summary = (b) => b.props.title || b.props.brand || b.props.text?.slice?.(0, 40) || (b.props.items?.[0] && (b.props.items[0].title || b.props.items[0].text || b.props.items[0].name || b.props.items[0].q)) || '';
  function fieldHtml(f, value, path) {
    const id = `f-${path.replace(/[^a-z0-9]/gi, '-')}`;
    if (f.t === 'textarea') return `<label class="field" for="${id}">${esc(f.label)}<textarea id="${id}" data-path="${esc(path)}">${esc(value || '')}</textarea></label>`;
    if (f.t === 'select') return `<label class="field" for="${id}">${esc(f.label)}<select id="${id}" data-path="${esc(path)}">${f.options.map((o) => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
    if (f.t === 'checkbox') return `<label class="check"><input type="checkbox" data-path="${esc(path)}" ${value ? 'checked' : ''}> ${esc(f.label)}</label>`;
    if (f.t === 'list') {
      const items = Array.isArray(value) ? value : [];
      return `<div class="list-field"><div class="row"><strong style="font-size:12.5px">${esc(f.label)}</strong><span class="spacer"></span><button class="btn sm" type="button" data-list-add="${esc(path)}">+ Item</button></div>
        ${items.map((it, i) => `<div class="list-item"><div class="row"><span class="muted">#${i + 1}</span><span class="spacer"></span><button class="btn sm icon" type="button" title="Subir" data-list-up="${esc(path)}" data-i="${i}">↑</button><button class="btn sm icon danger" type="button" title="Remover" data-list-del="${esc(path)}" data-i="${i}">×</button></div>
          ${f.of.map((sf) => fieldHtml(sf, it[sf.k], `${path}.${i}.${sf.k}`)).join('')}</div>`).join('')}</div>`;
    }
    return `<label class="field" for="${id}">${esc(f.label)}<input id="${id}" data-path="${esc(path)}" value="${esc(value || '')}" ${f.t === 'url' ? 'placeholder="https://... ou /pagina ou #ancora"' : ''}></label>`;
  }
  const getAt = (path) => path.split('.').reduce((o, k) => o?.[k], E.blocks);
  const setAt = (path, v) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((o, k) => o[k], E.blocks)[last] = v; };

  function drawBlocks() {
    const box = $('#blocks', main);
    box.innerHTML = E.blocks.map((b, i) => {
      const def = schema[b.type];
      return `<div class="blk ${E.open === i ? 'open' : ''}"><div class="blk-head" data-toggle="${i}"><strong>${esc(def?.label || b.type)}</strong><span class="muted">${esc(String(summary(b)).slice(0, 28))}</span>
        <button class="btn sm icon" type="button" title="Subir" data-move="${i}" data-d="-1">↑</button><button class="btn sm icon" type="button" title="Descer" data-move="${i}" data-d="1">↓</button>
        <button class="btn sm icon" type="button" title="Duplicar" data-dupb="${i}">⧉</button><button class="btn sm icon danger" type="button" title="Remover" data-del="${i}">×</button></div>
        ${E.open === i ? `<div class="blk-body">${def.fields.map((f) => fieldHtml(f, b.props[f.k], `${i}.props.${f.k}`)).join('')}</div>` : ''}</div>`;
    }).join('') || '<div class="empty">Página vazia. Adicione um bloco.</div>';
  }
  function changed() {
    $('#save-state').textContent = 'Salvando…';
    clearTimeout(E.timer);
    E.timer = setTimeout(save, 900);
  }
  async function save() {
    try {
      const res = await api('PUT', `/api/t/${slug}/pages/${E.page.id}/draft`, { blocks: E.blocks, title: $('#p-title').value,
        slug: E.page.slug === '' ? undefined : $('#p-slug').value, seo: { title: $('#p-seo-t').value, description: $('#p-seo-d').value, noindex: $('#p-noindex').checked } });
      E.page = res.page;
      if (res.seo) $('#seo-checks').innerHTML = checksHtml(res.seo);
      E.blocks = res.page.draft.map((b, i) => ({ ...b, props: E.blocks[i]?.type === b.type ? { ...b.props } : b.props }));
      $('#save-state').textContent = `Rascunho salvo às ${new Date(res.savedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      $('#pv').contentWindow.location.reload();
    } catch (e) { $('#save-state').textContent = 'Não salvou'; toast(e.message, true); }
  }
  main.addEventListener('click', (e) => {
    const t = e.target.closest('button, .blk-head');
    if (!t) return;
    const d = t.dataset;
    if (d.move != null) { e.stopPropagation(); const i = +d.move; const j = i + +d.d; if (j < 0 || j >= E.blocks.length) return; [E.blocks[i], E.blocks[j]] = [E.blocks[j], E.blocks[i]]; E.open = E.open === i ? j : E.open; drawBlocks(); changed(); return; }
    if (d.dupb != null) { e.stopPropagation(); const i = +d.dupb; E.blocks.splice(i + 1, 0, { ...structuredClone(E.blocks[i]), id: Math.random().toString(36).slice(2, 10) }); drawBlocks(); changed(); return; }
    if (d.del != null) { e.stopPropagation(); if (!confirm('Remover este bloco?')) return; E.blocks.splice(+d.del, 1); E.open = null; drawBlocks(); changed(); return; }
    if (d.listAdd) { const arr = getAt(d.listAdd) || []; arr.push({}); setAt(d.listAdd, arr); drawBlocks(); changed(); return; }
    if (d.listDel) { getAt(d.listDel).splice(+d.i, 1); drawBlocks(); changed(); return; }
    if (d.listUp) { const arr = getAt(d.listUp); const i = +d.i; if (i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; drawBlocks(); changed(); return; }
    if (d.toggle != null) { E.open = E.open === +d.toggle ? null : +d.toggle; drawBlocks(); }
  });
  main.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.path) { setAt(el.dataset.path, el.type === 'checkbox' ? el.checked : el.value); changed(); }
    else if (['p-title', 'p-slug', 'p-seo-t', 'p-seo-d', 'p-noindex'].includes(el.id)) changed();
  });
  $('#add-blk').addEventListener('click', () => {
    const type = $('#add-type').value;
    const props = Object.fromEntries(schema[type].fields.map((f) => [f.k, f.t === 'list' ? [{}] : f.t === 'select' ? f.options[0] : f.t === 'checkbox' ? false : '']));
    const at = E.open != null ? E.open + 1 : E.blocks.length;
    E.blocks.splice(at, 0, { id: Math.random().toString(36).slice(2, 10), type, props });
    E.open = at;
    drawBlocks();
    changed();
  });
  $('#pv-desk').addEventListener('click', () => $('#pv').classList.remove('mobile'));
  $('#pv-mob').addEventListener('click', () => $('#pv').classList.add('mobile'));
  $('#pv-reload').addEventListener('click', () => $('#pv').contentWindow.location.reload());
  $('#publish')?.addEventListener('click', async () => {
    clearTimeout(E.timer);
    await save();
    await api('POST', `/api/t/${slug}/pages/${E.page.id}/publish`);
    toast('Página publicada.');
  });
  $('#versions').addEventListener('click', async () => {
    const d = await api('GET', `/api/t/${slug}/pages/${E.page.id}`);
    const dlg = $('#dlg', main);
    dlg.innerHTML = `<form method="dialog"><h2>Versões</h2><p class="muted">Restaurar troca o rascunho; a versão atual fica guardada antes.</p>
      <div class="table-wrap"><table><tbody>${d.versions.map((v) => `<tr><td class="mono">${fmtDate(v.createdAt)}</td><td>${esc(v.note || '')}</td><td>${v.blocks} blocos</td><td><button class="btn sm" type="button" data-restore="${esc(v.id)}">Restaurar</button></td></tr>`).join('')}</tbody></table></div>
      <div class="row end"><button class="btn" type="button" id="snap">Guardar versão atual</button><button class="btn" value="cancel">Fechar</button></div></form>`;
    dlg.showModal();
    $$('[data-restore]', dlg).forEach((b) => b.addEventListener('click', async () => {
      const res = await api('POST', `/api/t/${slug}/pages/${E.page.id}/restore`, { versionId: b.dataset.restore });
      E.blocks = res.page.draft;
      E.open = null;
      dlg.close();
      drawBlocks();
      $('#pv').contentWindow.location.reload();
      toast('Versão restaurada no rascunho.');
    }));
    $('#snap', dlg).addEventListener('click', async () => { await api('POST', `/api/t/${slug}/pages/${E.page.id}/snapshot`, { note: 'versão salva' }); dlg.close(); toast('Versão guardada.'); });
  });
  drawBlocks();
}

// ---------- SEO ----------
const checksHtml = (checks) => `<ul class="checks">${checks.map((c) => `<li class="${c.ok ? 'ok' : `falta ${esc(c.nivel)}`}"><span aria-hidden="true">${c.ok ? '✓' : '•'}</span> ${esc(c.msg)}</li>`).join('')}</ul>`;

async function viewSeo(r) {
  const d = await api('GET', `/api/t/${S.tenant.slug}/seo`);
  const st = { recebido: 'ok', enviado: 'ok', erro: 'bad', pendente_conexao: 'warn', ignorado_local: 'info' };
  const label = { recebido: 'Recebido', enviado: 'Enviado', erro: 'Erro', pendente_conexao: 'Pendente de conexão', ignorado_local: 'Não enviado (endereço local)' };
  layout(r, `<div class="page-head"><div><h1>SEO</h1><p>Cada publicação avisa os buscadores sozinha. Aqui você vê o que foi enviado, o que falta conectar e o checklist de cada página.</p></div></div>
    <div class="card"><div class="card-head"><h2>Buscadores</h2></div><div class="table-wrap"><table><tbody>${d.engines.map((e) => `<tr><td style="width:32%"><strong>${esc(e.label)}</strong></td><td>${statusPill(e.status === 'ativo' || e.status === 'conectado' ? 'ativo' : 'pendente')}</td><td class="muted">${esc(e.how)}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted" style="margin-top:10px">O Google não aceita aviso por URL para páginas comuns. Ele descobre pelo sitemap e pelo robots.txt; conectando o Search Console, o portal também envia o sitemap a cada publicação.</p></div>
    ${d.sites.map((s) => `<div class="card"><div class="card-head"><h2>${esc(s.name)}</h2></div>
      <p class="muted">Sitemap: <a class="mono" href="${esc(s.sitemap)}" target="_blank" rel="noopener">${esc(s.sitemap)}</a> · robots: <a class="mono" href="${esc(s.robots)}" target="_blank" rel="noopener">${esc(s.robots)}</a> · chave IndexNow: <a class="mono" href="${esc(s.indexnowKey)}" target="_blank" rel="noopener">arquivo</a></p>
      <div class="table-wrap"><table><thead><tr><th>Página</th><th>Situação</th><th>Checklist</th></tr></thead><tbody>${s.pages.map((p) => {
        const falta = p.checks.filter((c) => !c.ok);
        return `<tr><td><a href="#/t/${esc(S.tenant.slug)}/editor/${esc(p.id)}"><strong>${esc(p.title)}</strong></a> <span class="mono muted">/${esc(p.slug)}</span></td><td>${statusPill(p.published ? 'publicado' : 'rascunho')}</td>
          <td>${falta.length ? `<details><summary>${p.checks.length - falta.length}/${p.checks.length} ok · ${falta.length} a melhorar</summary>${checksHtml(falta)}</details>` : `<span class="pill ok">${p.checks.length}/${p.checks.length} ok</span>`}</td></tr>`;
      }).join('')}</tbody></table></div></div>`).join('')}
    <div class="card"><div class="card-head"><h2>Envios aos buscadores</h2></div>${d.events.length ? `<div class="table-wrap"><table><thead><tr><th>Quando</th><th>Motivo</th><th>Buscador</th><th>Resultado</th><th>URLs</th><th>Detalhe</th></tr></thead><tbody>
      ${d.events.map((e) => `<tr><td class="mono">${fmtDate(e.created_at)}</td><td>${esc(e.reason)}</td><td>${esc(e.engine)}</td><td><span class="pill ${st[e.status] || ''}">${esc(label[e.status] || e.status)}</span></td><td class="mono" style="font-size:12px">${e.urls.map(esc).join('<br>')}</td><td class="muted">${esc(e.detail || '')}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty">Nenhum envio ainda. Publique uma página ou um post.</div>'}</div>`);
}

// ---------- leads ----------
async function viewLeads(r) {
  const d = await api('GET', `/api/t/${S.tenant.slug}/leads`);
  const main = layout(r, `<div class="page-head"><div><h1>Leads e CRM</h1><p>Todo formulário do site cai aqui, com a origem (UTM e afiliado).</p></div></div>
    ${d.leads.length ? `<div class="kanban">${d.stages.map((st) => `<div class="col"><div class="row"><strong>${esc(st)}</strong><span class="spacer"></span><span class="pill">${d.leads.filter((l) => l.stage === st).length}</span></div>
      <div class="stage-col" style="margin-top:8px">${d.leads.filter((l) => l.stage === st).map((l) => `<div class="lead"><strong>${esc(l.name || l.email)}</strong><span class="muted">${esc(l.email)}${l.phone ? ` · ${esc(l.phone)}` : ''}</span>
        <span>${esc(l.utm.utm_source || 'direto')}${l.utm.utm_campaign ? ` · ${esc(l.utm.utm_campaign)}` : ''}${l.affiliate ? ` · afiliado: ${esc(l.affiliate)}` : ''}</span><span class="muted mono">${fmtDate(l.createdAt)}</span>
        ${can('leads.edit') ? `<select data-lead="${esc(l.id)}">${d.stages.map((s) => `<option ${s === l.stage ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>` : ''}</div>`).join('')}</div></div>`).join('')}</div>`
      : '<div class="empty">Nenhum lead ainda. Publique uma página com formulário e envie um teste.</div>'}`);
  $$('[data-lead]', main).forEach((s) => s.addEventListener('change', async () => { await api('PATCH', `/api/t/${S.tenant.slug}/leads/${s.dataset.lead}`, { stage: s.value }); toast('Etapa atualizada.'); route(); }));
}

// ---------- afiliados ----------
async function viewAfiliados(r) {
  const d = await api('GET', `/api/t/${S.tenant.slug}/affiliates`);
  const main = layout(r, `<div class="page-head"><div><h1>Afiliados</h1><p>Cada afiliado tem um código e um link com UTM padronizada. Crédito: último clique válido dentro da janela da operação (${esc(S.tenant.settings.attributionWindowDays || 30)} dias).</p></div></div>
    ${can('affiliates.manage') ? `<div class="card"><div class="row"><input id="af-name" placeholder="Nome do afiliado" style="max-width:240px"><input id="af-email" placeholder="E-mail (opcional)" style="max-width:240px"><input id="af-code" placeholder="Código (opcional)" style="max-width:160px"><button class="btn primary" type="button" id="af-add">Adicionar afiliado</button></div><p class="err" id="af-err"></p></div>` : ''}
    <div class="card">${d.affiliates.length ? `<div class="table-wrap"><table><thead><tr><th>Afiliado</th><th>Código</th><th>Cliques</th><th>Leads</th><th>Conversões</th><th>Situação</th><th>Link</th></tr></thead><tbody>
      ${d.affiliates.map((a) => `<tr><td><strong>${esc(a.name)}</strong><div class="muted">${esc(a.email || '')}</div></td><td class="mono">${esc(a.code)}</td><td>${a.clicks}</td><td>${a.leads}</td><td>${a.conversions}</td>
        <td>${statusPill(a.status)} ${can('affiliates.manage') ? `<button class="btn sm" type="button" data-af="${esc(a.id)}" data-st="${a.status === 'ativo' ? 'pausado' : 'ativo'}">${a.status === 'ativo' ? 'Pausar' : 'Reativar'}</button>` : ''}</td>
        <td><div class="copy"><input readonly value="${esc(a.link)}"><button class="btn sm" type="button" data-copy="${esc(a.link)}">Copiar</button></div></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty">Nenhum afiliado ainda.</div>'}</div>`);
  $('#af-add')?.addEventListener('click', async () => {
    try { await api('POST', `/api/t/${S.tenant.slug}/affiliates`, { name: $('#af-name').value, email: $('#af-email').value, code: $('#af-code').value }); toast('Afiliado criado.'); route(); } catch (e) { $('#af-err').textContent = e.message; }
  });
  $$('[data-af]', main).forEach((b) => b.addEventListener('click', async () => { await api('PATCH', `/api/t/${S.tenant.slug}/affiliates/${b.dataset.af}`, { status: b.dataset.st }); route(); }));
  $$('[data-copy]', main).forEach((b) => b.addEventListener('click', async () => { await navigator.clipboard.writeText(b.dataset.copy); toast('Link copiado.'); }));
}

// ---------- integrações ----------
async function viewIntegracoes(r) {
  const d = await api('GET', `/api/t/${S.tenant.slug}/integrations`);
  const groups = { seo: 'SEO e buscadores', mensuracao: 'Mensuração no site', relatorios: 'Relatórios', redes: 'Redes sociais', campanhas: 'Campanhas', afiliacao: 'Afiliação' };
  const main = layout(r, `<div class="page-head"><div><h1>Integrações</h1><p>Estado real de cada conexão. Nada aparece como conectado sem estar.</p></div></div>
    ${Object.entries(groups).map(([g, label]) => {
      const items = d.integrations.filter((i) => i.group === g);
      return items.length ? `<div class="card"><div class="card-head"><h2>${esc(label)}</h2></div><div class="table-wrap"><table><tbody>${items.map((i) => `<tr><td style="width:40%"><strong>${esc(i.label)}</strong>${i.lastError ? `<div class="err">${esc(i.lastError)}</div>` : ''}</td><td>${statusPill(i.status)}</td>
        <td class="muted">${i.kind === 'webhook_conversoes' ? `<div class="copy"><input readonly value="${esc(i.url)}"><button class="btn sm" type="button" data-copy="${esc(i.url)}">Copiar</button></div><div style="margin-top:6px">Assinatura: <span class="mono">${esc(i.header)}</span> · segredo ${esc(i.secret || '')} ${can('integrations.manage') ? '<button class="btn sm" type="button" id="rotate">Gerar novo segredo</button>' : ''}</div>`
          : i.status === 'pendente' ? (['ga4', 'gtm', 'meta_pixel'].includes(i.kind) ? 'Instale o ID em Sites → Aparência, SEO e mensuração.' : 'Aguardando o módulo desta integração e as credenciais da operação.') : esc(JSON.stringify(i.config))}</td></tr>`).join('')}</tbody></table></div></div>` : '';
    }).join('')}`);
  $$('[data-copy]', main).forEach((b) => b.addEventListener('click', async () => { await navigator.clipboard.writeText(b.dataset.copy); toast('Copiado.'); }));
  $('#rotate')?.addEventListener('click', async () => {
    if (!confirm('Gerar um novo segredo? O antigo para de valer na hora.')) return;
    const res = await api('POST', `/api/t/${S.tenant.slug}/webhook/rotate`);
    prompt(res.note, res.secret);
    route();
  });
}

// ---------- usuários ----------
async function viewUsuarios(r) {
  const d = await api('GET', `/api/t/${S.tenant.slug}/users`);
  const main = layout(r, `<div class="page-head"><div><h1>Usuários</h1><p>Papéis: ${Object.values(S.meta.roles).map(esc).join(', ')}. As permissões são conferidas no servidor.</p></div></div>
    <div class="card"><div class="row"><input id="u-email" type="email" placeholder="E-mail" style="max-width:260px"><input id="u-name" placeholder="Nome" style="max-width:200px">
      <select id="u-role" style="max-width:220px">${Object.entries(S.meta.roles).map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join('')}</select><button class="btn primary" type="button" id="u-add">Incluir</button></div><p class="err" id="u-err"></p></div>
    <div class="card"><div class="table-wrap"><table><thead><tr><th>Usuário</th><th>Papel</th><th></th></tr></thead><tbody>${d.users.map((u) => `<tr><td><strong>${esc(u.name)}</strong> <span class="muted">${esc(u.email)}</span></td><td>${esc(S.meta.roles[u.role] || u.role)}</td><td class="row end">${u.id !== S.me.user.id ? `<button class="btn sm danger" type="button" data-rm="${esc(u.id)}">Remover acesso</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Só o superadministrador por enquanto.</td></tr>'}</tbody></table></div></div>`);
  $('#u-add').addEventListener('click', async () => {
    try {
      const res = await api('POST', `/api/t/${S.tenant.slug}/users`, { email: $('#u-email').value, name: $('#u-name').value, role: $('#u-role').value });
      if (res.tempPassword) prompt('Senha provisória (passe para a pessoa por um canal seguro; ela troca depois):', res.tempPassword);
      route();
    } catch (e) { $('#u-err').textContent = e.message; }
  });
  $$('[data-rm]', main).forEach((b) => b.addEventListener('click', async () => { if (confirm('Remover o acesso desta pessoa à operação?')) { await api('DELETE', `/api/t/${S.tenant.slug}/users/${b.dataset.rm}`); route(); } }));
}

// ---------- calendário (visão; geração e publicação ficam no módulo de calendário) ----------
async function viewCalendario(r) {
  const s = S.tenant.settings;
  const times = String(s.postTimes || '12:00,15:00,18:00').split(',').map((x) => x.trim()).filter(Boolean).slice(0, Number(s.postsPerDay || 3));
  const days = [...Array(7)].map((_, i) => new Date(Date.now() + i * 864e5));
  layout(r, `<div class="page-head"><div><h1>Calendário editorial</h1><p>Meta: ${esc(s.postsPerDay || 3)} publicações por dia, no fuso ${esc(s.timezone || 'America/Sao_Paulo')}. Sem conta conectada, os itens ficam aguardando conexão; nada é publicado de mentira.</p></div></div>
    <div class="cal">${days.map((d) => `<div class="day"><strong>${d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</strong>${times.map((t) => `<div class="slot">${esc(t)} · <span class="muted">vaga livre</span></div>`).join('')}</div>`).join('')}</div>
    <p class="muted" style="margin-top:12px">Os horários mudam em Configurações. A geração automática dos rascunhos, o vínculo com criativos e a publicação chegam com os módulos de calendário e Instagram.</p>`);
}

// ---------- configurações ----------
async function viewConfig(r) {
  const t = S.tenant;
  const n = S.meta.niches.find((x) => x.id === t.niche);
  const s = t.settings;
  const main = layout(r, `<div class="page-head"><div><h1>Configurações</h1><p>${esc(t.label)} · ${esc(n.name)}</p></div></div>
    <div class="card"><div class="grid2"><label class="field">Nome<input id="c-name" value="${esc(t.name)}"></label>
      ${['whatsapp', 'telegram', 'instagram', 'email', 'tagline', 'logo', 'timezone'].map((k) => `<label class="field">${esc(k)}<input data-s="${k}" value="${esc(s[k] || '')}"></label>`).join('')}
      ${n.fields.map((f) => `<label class="field">${esc(f.label)}<input data-s="${esc(f.key)}" value="${esc(s[f.key] || '')}"></label>`).join('')}
      <label class="field">Janela de atribuição (dias)<input data-s="attributionWindowDays" type="number" min="1" max="365" value="${esc(s.attributionWindowDays || 30)}"></label>
      <label class="field">Publicações por dia<input data-s="postsPerDay" type="number" min="0" max="12" value="${esc(s.postsPerDay ?? 3)}"></label>
      <label class="field">Horários<input data-s="postTimes" value="${esc(s.postTimes || '')}"></label></div>
      <p class="err" id="c-err"></p><div class="row end"><button class="btn primary" type="button" id="c-save">Salvar</button></div></div>`);
  $('#c-save').addEventListener('click', async () => {
    const settings = {};
    $$('[data-s]', main).forEach((i) => { settings[i.dataset.s] = i.type === 'number' ? Number(i.value) : i.value.trim(); });
    try { await api('PATCH', `/api/t/${t.slug}`, { name: $('#c-name').value, settings }); S.me = await api('GET', '/api/me'); toast('Configurações salvas.'); route(); } catch (e) { $('#c-err').textContent = e.message; }
  });
}

async function viewAuditoria(r) {
  const d = await api('GET', `/api/t/${S.tenant.slug}/audit`);
  layout(r, `<div class="page-head"><div><h1>Auditoria</h1><p>Ações administrativas desta operação.</p></div></div><div class="card">${auditTable(d.audit)}</div>`);
}

async function viewModule(r) {
  const m = (S.meta.modules || []).find((x) => x.id === r.module);
  const main = layout(r, `<div class="page-head"><div><h1>${esc(m?.label || r.module)}</h1></div></div><div id="mod"></div>`);
  if (!m) { $('#mod', main).innerHTML = '<div class="empty">Módulo não instalado.</div>'; return; }
  const mod = await import(`/admin/modules/${encodeURIComponent(m.id)}.js`);
  await mod.render($('#mod', main), { api, S, esc, toast, can, route, fmtDate });
}

// ---------- início ----------
async function boot() {
  try {
    S.me = await api('GET', '/api/me');
    S.csrf = S.me.csrf;
    S.meta = await api('GET', '/api/meta');
  } catch { return; }
  route();
}
window.addEventListener('hashchange', route);
fetch('/api/me', { headers: { Accept: 'application/json' } }).then((r) => (r.ok ? boot() : renderLogin())).catch(renderLogin);
