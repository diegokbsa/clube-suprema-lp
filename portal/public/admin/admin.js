// Painel do Portal de Afiliação (sem framework). Rotas por hash: #/  #/nova  #/t/<op>  #/t/<op>/site  #/t/<op>/editor/<página> ...
// Módulos extras (blog, mídia, telegram...) registram tela em /admin/modules/<id>.js exportando render(el, ctx).
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const S = { me: null, meta: null, csrf: '', tenant: null, tenantData: null, ed: { id: 'geral', name: 'Portal de Afiliação', tagline: '', terms: { operations: 'Operações', newOperation: 'Nova operação' } } };
const logoMark = () => (S.ed.logo ? `<img class="logo-mark" src="${esc(S.ed.logo)}" alt="">` : `<span class="logo-mark">${esc(S.ed.name.slice(0, 1))}</span>`);
function applyEdition(ed) {
  S.ed = ed;
  document.documentElement.dataset.edition = ed.id;
  document.title = ed.name;
}
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
    <div class="logo">${logoMark()}<div>${esc(S.ed.name)}<small>${esc(S.ed.tagline)}</small></div></div>
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
    items.push(['#/nova', S.ed.terms.newOperation, route.view === 'nova']);
    items.push(['#/clientes', 'Base de clientes', route.view === 'clientes']);
    items.push(['#/insights', 'Insights de IA', route.view === 'insights']);
    if (S.ed.id === 'sx') items.push(['#/migracao', 'Trilha de migração', route.view === 'migracao']); // PA-140: fila de candidaturas
  }
  if (t) {
    items.push(['title', t.label]);
    const v = route.view;
    const add = (hash, label, perm, on, extra = '') => { if (!perm || can(perm)) items.push([`#/t/${t.slug}${hash}`, label, on, extra]); };
    add('', 'Painel', 'tenant.read', v === 'dash');
    add('/ia', 'Conectar sua IA', 'ai.connect', v === 'ia');
    add('/site', 'Sites e páginas', 'site.read', v === 'site' || v === 'editor');
    add('/seo', 'SEO', 'site.read', v === 'seo');
    add('/leads', 'Leads e CRM', 'leads.read', v === 'leads');
    add('/afiliados', 'Afiliados', 'affiliates.read', v === 'afiliados');
    add('/calendario', 'Calendário editorial', 'calendar.read', v === 'calendario');
    for (const m of S.meta.modules || []) if (!m.editions || m.editions.includes(S.ed.id)) add(`/m/${m.id}`, m.label, m.perm, v === 'module' && route.module === m.id);
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
      <div class="logo">${logoMark()}<div>${esc(S.ed.name)}<small>${esc(S.me.user.isSuper ? 'Superadministrador' : S.tenant?.role || '')}</small></div></div>
      ${tenants.length ? `<label class="tenant-pick field">Operação<select id="tenant-pick">${S.tenant ? '' : '<option value="" selected disabled>Escolha uma operação</option>'}${tenants.map((t) => `<option value="${esc(t.slug)}" ${S.tenant?.slug === t.slug ? 'selected' : ''}>${esc(t.label)} · ${esc(t.name)}${t.demo ? ' (demo)' : ''}</option>`).join('')}</select></label>` : ''}
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
  const parts = location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
  if (!parts.length) return { view: 'central' };
  if (parts[0] === 'nova') return { view: 'nova' };
  if (parts[0] === 'insights') return { view: 'insights' };
  if (parts[0] === 'clientes') return { view: 'clientes' };
  if (parts[0] === 'migracao') return { view: 'migracao' };
  if (parts[0] === 't') {
    const slug = parts[1];
    const sub = parts[2] || '';
    const views = { '': 'dash', site: 'site', editor: 'editor', seo: 'seo', ia: 'ia', leads: 'leads', afiliados: 'afiliados', integracoes: 'integracoes', usuarios: 'usuarios', calendario: 'calendario', auditoria: 'auditoria', config: 'config', m: 'module' };
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
  if (r.view === 'dash' && S.tenant && !can('tenant.read') && can('ai.connect')) { location.hash = `#/t/${S.tenant.slug}/ia`; return; } // afiliado
  const views = { central: viewCentral, nova: viewNova, insights: viewInsights, clientes: viewBaseClientes, migracao: viewMigracaoFila, dash: viewDash, site: viewSite, editor: viewEditor, seo: viewSeo, ia: viewIa, leads: viewLeads, afiliados: viewAfiliados,
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
  const main = layout(r, `<div class="page-head"><div><h1>Visão geral</h1><p>${esc(S.ed.terms.operations)}, sites, leads e integrações.</p></div><span class="spacer"></span><a class="btn primary" href="#/nova">${esc(S.ed.terms.newOperation)}</a></div>
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

// ---------- base única de clientes (superadmin, só a edição em que entrou) ----------
async function viewBaseClientes(r) {
  if (!S.me.user.isSuper) { location.hash = '#/'; return; }
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const cid = qs.get('c');
  if (cid) {
    const d = await api('GET', `/api/admin/clientes/${encodeURIComponent(cid)}`);
    layout(r, `<p><a href="#/clientes">← Base de clientes</a></p><div class="card"><h2>${esc(d.cliente.name || '(sem nome)')}</h2><p class="muted">${esc(d.cliente.email || '')}${d.cliente.phone ? ` · ${esc(d.cliente.phone)}` : ''}</p></div>
      <div class="card"><div class="card-head"><h2>Por onde passou (${d.relacionamentos.length})</h2></div><div class="table-wrap"><table><thead><tr><th>Operação</th><th>Etapa</th><th>Origem</th><th>Quando</th></tr></thead><tbody>
      ${d.relacionamentos.map((x) => `<tr><td><a href="#/t/${esc(x.slug)}/m/clientes?c=${esc(d.cliente.id)}">${esc(x.operacao)}</a></td><td><span class="pill">${esc(x.etapa)}</span></td><td>${esc(x.origem)}</td><td class="mono">${fmtDate(x.quando)}</td></tr>`).join('')}</tbody></table></div></div>`);
    return;
  }
  const q = qs.get('q') || '';
  const d = await api('GET', `/api/admin/clientes${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  const main = layout(r, `<div class="page-head"><div><h1>Base de clientes</h1><p>Uma pessoa existe uma vez só. Cada ${esc(S.ed.terms.newOperation.replace(/^Nov[oa] /, '').toLowerCase())} vê apenas quem chegou por ele; aqui você vê a base inteira de ${esc(S.ed.name)}.</p></div></div>
    <div class="kpis"><div class="kpi"><b>${d.totais.pessoas}</b><span>pessoas na base</span></div><div class="kpi"><b>${d.totais.emMaisDeUma}</b><span>em mais de uma operação</span></div></div>
    <div class="card"><div class="row"><input id="bq" placeholder="Buscar por nome, e-mail ou telefone" value="${esc(q)}" style="max-width:340px"><button class="btn" type="button" id="bbusca">Buscar</button></div></div>
    <div class="card">${d.clientes.length ? `<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Contato</th><th>Operações</th><th>Entradas</th><th>Último contato</th></tr></thead><tbody>
      ${d.clientes.map((c) => `<tr><td><a href="#/clientes?c=${esc(c.id)}"><strong>${esc(c.name || '(sem nome)')}</strong></a></td><td class="muted">${esc(c.email || '')}${c.phone ? `<br>${esc(c.phone)}` : ''}</td><td>${c.operacoes}</td><td>${c.leads}</td><td class="mono">${fmtDate(c.ultimo)}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty">Nenhum cliente ainda.</div>'}</div>`);
  const go = () => { location.hash = `#/clientes?q=${encodeURIComponent($('#bq').value)}`; };
  $('#bbusca', main).addEventListener('click', go);
  $('#bq', main).addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
}

// ---------- insights do pesquisador de IA ----------
async function viewInsights(r) {
  if (!S.me.user.isSuper) { location.hash = '#/'; return; }
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const st = qs.get('status') || 'novo';
  const d = await api('GET', `/api/admin/insights?status=${encodeURIComponent(st)}`);
  const nivel = (n) => '●'.repeat(n) + '○'.repeat(5 - n);
  const tabs = [['novo', 'Novos'], ['aceito', 'Aceitos'], ['aplicado', 'Aplicados'], ['descartado', 'Descartados']];
  // filtros (ficam no endereço, para o link guardar a busca): impacto mínimo, esforço máximo, confiança mínima, tipo, tema, texto e ordem
  const F = { imp: Number(qs.get('imp')) || 0, esf: Number(qs.get('esf')) || 0, conf: Number(qs.get('conf')) || 0,
    tipo: qs.get('tipo') || '', tema: qs.get('tema') || '', q: (qs.get('q') || '').trim(), ord: qs.get('ord') || 'prioridade' };
  const prioridade = (i) => (i.impacto * i.confianca) / Math.max(1, i.esforco) + (i.urgente ? 10 : 0);
  const ORDENS = { prioridade: ['Prioridade (impacto × confiança ÷ esforço)', (a, b) => prioridade(b) - prioridade(a)],
    impacto: ['Maior impacto', (a, b) => b.impacto - a.impacto || b.confianca - a.confianca],
    confianca: ['Maior confiança', (a, b) => b.confianca - a.confianca || b.impacto - a.impacto],
    esforco: ['Menor esforço', (a, b) => a.esforco - b.esforco || b.impacto - a.impacto],
    recentes: ['Mais recentes', (a, b) => String(b.created_at).localeCompare(String(a.created_at))] };
  const sem = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const lista = d.insights.filter((i) => (!F.imp || i.impacto >= F.imp) && (!F.esf || i.esforco <= F.esf) && (!F.conf || i.confianca >= F.conf)
      && (!F.tipo || i.tipo === F.tipo) && (!F.tema || i.tema === F.tema)
      && (!F.q || sem([i.titulo, i.resumo, i.acao, i.tema, i.tipo, ...(i.aplicavel || [])].join(' ')).includes(sem(F.q))))
    .sort((ORDENS[F.ord] || ORDENS.prioridade)[1]);
  const opcoes = (vals, atual) => vals.map((v) => `<option value="${esc(v)}" ${String(v) === String(atual) ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const niveis = (nome, rot, atual, ate) => `<label class="field" style="min-width:150px">${rot}<select data-f="${nome}"><option value="">Qualquer</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === atual ? 'selected' : ''}>${ate ? 'até' : 'a partir de'} ${n}</option>`).join('')}</select></label>`;
  const tipos = [...new Set(d.insights.map((i) => i.tipo).filter(Boolean))].sort();
  const temas = [...new Set(d.insights.map((i) => i.tema).filter(Boolean))].sort();
  const filtrosAtivos = F.imp || F.esf || F.conf || F.tipo || F.tema || F.q;
  const main = layout(r, `<div class="page-head"><div><h1>Insights de IA</h1><p>O pesquisador procura na internet a cada 20 minutos e traz achados com fonte e ação sugerida. Nada é aplicado sozinho: você aceita (vira tarefa) ou descarta.</p></div></div>
    <div class="row" style="margin-bottom:12px">${tabs.map(([k, l]) => `<a class="btn ${k === st ? 'primary' : ''}" href="#/insights?status=${k}">${l} · ${d.counts[k] || 0}</a>`).join('')}</div>
    <div class="card" id="ins-filtros"><div class="row" style="flex-wrap:wrap;gap:10px;align-items:flex-end">
      <label class="field" style="flex:1 1 220px">Buscar<input data-f="q" type="search" value="${esc(F.q)}" placeholder="título, resumo, ação, tema…"></label>
      ${niveis('imp', 'Impacto', F.imp, false)}${niveis('esf', 'Esforço', F.esf, true)}${niveis('conf', 'Confiança', F.conf, false)}
      <label class="field" style="min-width:150px">Tipo<select data-f="tipo"><option value="">Todos</option>${opcoes(tipos, F.tipo)}</select></label>
      <label class="field" style="min-width:150px">Tema<select data-f="tema"><option value="">Todos</option>${opcoes(temas, F.tema)}</select></label>
      <label class="field" style="min-width:230px">Ordenar por<select data-f="ord">${Object.entries(ORDENS).map(([k, [l]]) => `<option value="${k}" ${k === F.ord ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      ${filtrosAtivos ? '<button class="btn sm" type="button" id="ins-limpar">Limpar filtros</button>' : ''}
    </div><p class="muted" style="margin:10px 0 0;font-size:13px">${lista.length} de ${d.insights.length} ${d.insights.length === 1 ? 'insight' : 'insights'} nesta aba.</p></div>
    ${!d.insights.length ? '<div class="empty">Nada aqui ainda. O primeiro ciclo do pesquisador traz os primeiros achados.</div>'
      : !lista.length ? '<div class="empty">Nenhum insight com esses filtros. Afrouxe um deles ou limpe os filtros.</div>'
      : lista.map((i) => `<div class="card"><div class="card-head">${i.urgente ? '<span class="pill bad">urgente</span>' : ''}<span class="pill info">${esc(i.tipo)}</span><span class="pill">${esc(i.tema)}</span>
        ${i.aplicavel.map((a) => `<span class="pill gold">${esc(a)}</span>`).join('')}<span class="spacer"></span><span class="muted mono" style="font-size:12px">${fmtDate(i.created_at)}</span></div>
      <h2>${esc(i.titulo)}</h2><p style="margin-top:6px">${esc(i.resumo)}</p>
      <p><strong>Ação sugerida:</strong> ${esc(i.acao)}</p>
      <div class="row muted" style="font-size:12.5px"><span>Impacto <span class="mono">${nivel(i.impacto)}</span></span><span>Esforço <span class="mono">${nivel(i.esforco)}</span></span><span>Confiança <span class="mono">${nivel(i.confianca)}</span></span>
        <a href="${esc(i.fonte_url)}" target="_blank" rel="noopener noreferrer">fonte${i.fonte_data ? ` (${esc(i.fonte_data)})` : ''} ↗</a></div>
      ${i.nota ? `<p class="muted" style="margin-top:6px">Nota: ${esc(i.nota)}</p>` : ''}
      <div class="row end" style="margin-top:10px">${st !== 'aceito' ? `<button class="btn sm primary" type="button" data-ins="${esc(i.id)}" data-st="aceito">Aceitar</button>` : `<button class="btn sm gold" type="button" data-ins="${esc(i.id)}" data-st="aplicado">Marcar como aplicado</button>`}
        ${st !== 'descartado' ? `<button class="btn sm" type="button" data-ins="${esc(i.id)}" data-st="descartado">Descartar</button>` : ''}</div></div>`).join('')}`);
  const aplicar = () => {
    const p = new URLSearchParams({ status: st });
    $$('[data-f]', main).forEach((el) => { const v = el.value.trim(); if (v && !(el.dataset.f === 'ord' && v === 'prioridade')) p.set(el.dataset.f, v); });
    location.hash = `#/insights?${p}`;
  };
  $$('#ins-filtros select', main).forEach((el) => el.addEventListener('change', aplicar));
  const busca = $('#ins-filtros input[data-f="q"]', main);
  busca?.addEventListener('keydown', (e) => { if (e.key === 'Enter') aplicar(); });
  busca?.addEventListener('search', aplicar);
  $('#ins-limpar', main)?.addEventListener('click', () => { location.hash = `#/insights?status=${st}`; });
  $$('[data-ins]', main).forEach((b) => b.addEventListener('click', async () => {
    const nota = b.dataset.st === 'descartado' ? (prompt('Motivo (opcional):') || '') : '';
    await api('PATCH', `/api/admin/insights/${b.dataset.ins}`, { status: b.dataset.st, nota });
    toast({ aceito: 'Aceito. O coordenador transforma em tarefa.', aplicado: 'Marcado como aplicado.', descartado: 'Descartado.' }[b.dataset.st]);
    route();
  }));
}

// ---------- nova operação (assistente) ----------
async function viewNova(r) {
  if (!S.me.user.isSuper) { location.hash = '#/'; return; }
  const single = S.meta.niches.length === 1; // edição de um nicho só (SX): pula a escolha do nicho
  const W = { step: single ? 1 : 0, niche: S.meta.edition?.defaultNiche || S.meta.niches[0]?.id || 'poker', template: null, theme: {}, data: { settings: {} }, modules: null };
  const STEPS = ['Nicho', 'Dados', 'Modelo', 'Aparência', 'Módulos', 'Revisar'];
  const main = layout(r, `<div class="page-head"><div><h1>${esc(S.ed.terms.newOperation)}</h1><p>Do cadastro ao site pronto para editar, em ${single ? 'cinco' : 'seis'} passos.</p></div></div>
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
      body.innerHTML = `<h2>Escolha o modelo do site</h2><p class="muted">Veja a demo de cada modelo antes de escolher. O conteúdo nasce editável, e atualizações futuras do modelo nunca mudam o seu site sozinhas.</p>
        ${templates.length ? '<div id="w-galeria" class="gm"></div>' : '<div class="empty">Ainda não há modelos para este nicho. A operação pode ser criada sem site e ganhar um depois.</div>'}`;
      if (templates.length) {
        galeriaModelos($('#w-galeria', body), { templates, selecionado: W.template ?? null, demoBase: '/api/modelos/', semSite: true, onEscolher: (id) => {
          W.template = id;
          W.theme = { ...(templates.find((t) => t.id === W.template)?.theme || {}), ...(S.meta.edition?.siteTheme || {}) }; // edição SX: paleta da SX por padrão
        } });
      }
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
    body.insertAdjacentHTML('beforeend', `<div class="row end" style="margin-top:18px">${W.step > (single ? 1 : 0) ? '<button class="btn" type="button" id="w-back">Voltar</button>' : ''}
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

// ---------- galeria de modelos (Novo site e criação de operação) ----------
// Miniatura em /admin/modelos/<id>.jpg (sem ela, fica a amostra de cores); "Ver demo" abre o modelo inteiro, navegável, por cima da tela.
const OBJETIVOS = [['torneios', 'Torneios', /torneio|agenda/], ['fichas', 'Fichas', /fichas/], ['conteudo', 'Conteúdo', /blog|educativ|curso/],
  ['parceria', 'Parceria', /parceir/], ['clube', 'Clube', /clube|grupo|premium|membro/]];
const objetivoDe = (t) => OBJETIVOS.find(([, , rx]) => rx.test(t.id)) || ['outros', (String(t.category).split('·')[1] || t.category || 'Outros').trim().replace(/^./, (c) => c.toUpperCase())];
const amostra = (t) => `<div class="swatch gm-swatch"><div class="sw-bg" style="background:${esc(t.theme.bg)};color:${esc(t.theme.text)}"><span></span><span></span></div><i style="background:${esc(t.theme.primary)}"></i><i style="background:${esc(t.theme.accent)}"></i></div>`;

/**
 * Desenha a galeria em el. opts: { templates, selecionado, demoBase ('/api/modelos/' ou '/api/t/<slug>/modelos/'), onEscolher(id), semSite (mostra o cartão "Sem site") }.
 * Devolve { redesenhar(selecionado) }.
 */
function galeriaModelos(el, { templates, selecionado = null, demoBase, onEscolher, semSite = false }) {
  const mundos = Object.fromEntries((S.meta?.worlds || []).map((w) => [w.id, w.name]));
  const F = { mundo: '', objetivo: '' };
  let sel = selecionado;
  const opcoes = (k, valores) => [['', 'Todos'], ...valores].map(([v, l]) => `<button type="button" class="gm-chip${F[k] === v ? ' on' : ''}" data-f="${k}" data-v="${esc(v)}" aria-pressed="${F[k] === v}">${esc(l)}</button>`).join('');
  const usados = (fn) => [...new Map(templates.map((t) => fn(t)).filter(([v]) => v)).entries()];
  function draw() {
    const lista = templates.filter((t) => (!F.mundo || (t.theme.world || 'classico') === F.mundo) && (!F.objetivo || objetivoDe(t)[0] === F.objetivo));
    const filtroMundo = usados((t) => [t.theme.world || 'classico', mundos[t.theme.world] || (t.theme.world ? t.theme.world : 'Clássico')]);
    el.innerHTML = `<div class="gm-filtros">${filtroMundo.length > 1 ? `<div class="gm-grupo" role="group" aria-label="Mundo"><span>Mundo</span>${opcoes('mundo', filtroMundo)}</div>` : ''}
        <div class="gm-grupo" role="group" aria-label="Objetivo"><span>Objetivo</span>${opcoes('objetivo', usados((t) => objetivoDe(t).slice(0, 2)))}</div>
        <span class="gm-conta">${lista.length} ${lista.length === 1 ? 'modelo' : 'modelos'}</span></div>
      <div class="gm-grade">${lista.map((t) => `<article class="gm-card${sel === t.id ? ' on' : ''}" data-id="${esc(t.id)}">
          <button type="button" class="gm-thumb" data-demo="${esc(t.id)}" aria-label="Ver a demo de ${esc(t.name)}"><img src="/admin/modelos/${esc(t.id)}.jpg" alt="" loading="lazy" decoding="async" width="480" height="300"><span class="gm-ver">Ver demo</span></button>
          <div class="gm-info"><strong>${esc(t.name.replace(/\s*\(edição SX\)\s*$/, ''))}</strong>
            <small>${esc([mundos[t.theme.world] || '', objetivoDe(t)[1], `${t.pages.length} páginas`].filter(Boolean).join(' · '))}</small>
            <p>${esc(t.description)}</p></div>
          <div class="gm-acoes"><button type="button" class="btn sm" data-demo="${esc(t.id)}">Ver demo</button>
            <button type="button" class="btn sm ${sel === t.id ? 'gold' : 'primary'}" data-usar="${esc(t.id)}" aria-pressed="${sel === t.id}">${sel === t.id ? 'Escolhido ✓' : 'Usar este modelo'}</button></div>
        </article>`).join('')}
        ${semSite ? `<article class="gm-card gm-vazio${sel === '' ? ' on' : ''}"><div class="gm-info"><strong>Sem site por enquanto</strong><p>Cria só a operação. Dá para criar o site depois, em Sites e páginas.</p></div>
          <div class="gm-acoes"><button type="button" class="btn sm ${sel === '' ? 'gold' : ''}" data-usar="">${sel === '' ? 'Escolhido ✓' : 'Escolher'}</button></div></article>` : ''}
        ${lista.length ? '' : '<div class="empty">Nenhum modelo com esses filtros.</div>'}</div>`;
    $$('.gm-thumb img', el).forEach((im) => im.addEventListener('error', () => {
      const t = templates.find((x) => x.id === im.closest('[data-id]').dataset.id);
      im.replaceWith(Object.assign(document.createElement('div'), { className: 'gm-sem-foto', innerHTML: amostra(t) }));
    }, { once: true }));
    $$('[data-f]', el).forEach((b) => b.addEventListener('click', () => { F[b.dataset.f] = b.dataset.v; draw(); }));
    $$('[data-usar]', el).forEach((b) => b.addEventListener('click', () => { sel = b.dataset.usar; onEscolher(sel); draw(); }));
    $$('[data-demo]', el).forEach((b) => b.addEventListener('click', () => abrirDemo(templates.find((t) => t.id === b.dataset.demo))));
  }
  function abrirDemo(t) {
    const dlg = document.createElement('dialog');
    dlg.className = 'gm-demo';
    const url = (slug) => `${demoBase}${encodeURIComponent(t.id)}/demo/${slug}`;
    dlg.innerHTML = `<div class="gm-demo-barra"><div class="gm-demo-titulo"><strong>${esc(t.name.replace(/\s*\(edição SX\)\s*$/, ''))}</strong>
        <nav class="gm-demo-paginas" aria-label="Páginas do modelo">${t.pages.map((p, i) => `<button type="button" class="gm-chip${i === 0 ? ' on' : ''}" data-pg="${esc(p.slug)}">${esc(p.title)}</button>`).join('')}</nav></div>
      <div class="gm-demo-acoes"><div class="gm-tela" role="group" aria-label="Tamanho da tela"><button type="button" class="gm-chip on" data-tela="">Computador</button><button type="button" class="gm-chip" data-tela="celular">Celular</button></div>
        <a class="btn sm" target="_blank" rel="noopener" href="${esc(url(''))}" id="gm-aba">Abrir em nova aba ↗</a>
        <button type="button" class="btn sm primary" id="gm-usar">${sel === t.id ? 'Escolhido ✓' : 'Usar este modelo'}</button>
        <button type="button" class="btn sm" id="gm-fechar" aria-label="Fechar a demo">Fechar</button></div></div>
      <div class="gm-demo-palco"><iframe title="Demo do modelo ${esc(t.name)}" src="${esc(url(''))}"></iframe></div>`;
    document.body.appendChild(dlg);
    const ifr = $('iframe', dlg);
    $$('[data-pg]', dlg).forEach((b) => b.addEventListener('click', () => {
      $$('[data-pg]', dlg).forEach((x) => x.classList.toggle('on', x === b));
      ifr.src = url(b.dataset.pg);
      $('#gm-aba', dlg).href = url(b.dataset.pg);
    }));
    $$('[data-tela]', dlg).forEach((b) => b.addEventListener('click', () => {
      $$('[data-tela]', dlg).forEach((x) => x.classList.toggle('on', x === b));
      dlg.classList.toggle('celular', b.dataset.tela === 'celular');
    }));
    const fechar = () => { dlg.close(); dlg.remove(); };
    $('#gm-fechar', dlg).addEventListener('click', fechar);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); fechar(); });
    $('#gm-usar', dlg).addEventListener('click', () => { sel = t.id; onEscolher(sel); fechar(); draw(); });
    dlg.showModal();
  }
  draw();
  return { redesenhar: (s) => { sel = s; draw(); } };
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
    let escolhido = null;
    dlg.classList.add('wide');
    dlg.innerHTML = `<form method="dialog" id="ns"><div class="gm-cab"><div><h2>Novo site</h2><p class="muted">Escolha um modelo. A demo já mostra o nome e os links de ${esc(S.tenant.name)}; nada é publicado até você publicar.</p></div>
        <button class="btn" value="cancel" aria-label="Fechar">Fechar</button></div>
      <div id="ns-galeria" class="gm"></div>
      <p class="err" id="ns-err"></p><div class="row end gm-pe"><span class="muted" id="ns-sel">Nenhum modelo escolhido.</span><span class="spacer"></span><button class="btn" value="cancel">Cancelar</button><button class="btn primary" id="ns-go" type="button" disabled>Criar site</button></div></form>`;
    galeriaModelos($('#ns-galeria', dlg), { templates: meta.templates, demoBase: `/api/t/${encodeURIComponent(slug)}/modelos/`, onEscolher: (id) => {
      escolhido = id;
      $('#ns-go', dlg).disabled = !id;
      $('#ns-sel', dlg).textContent = `Modelo: ${meta.templates.find((t) => t.id === id)?.name || id}`;
    } });
    dlg.addEventListener('close', () => dlg.classList.toggle('wide', false), { once: true });
    dlg.showModal();
    $('#ns-go', dlg).addEventListener('click', async () => {
      if (!escolhido) return;
      try { await api('POST', `/api/t/${slug}/sites`, { template: escolhido }); dlg.close(); route(); } catch (e) { $('#ns-err', dlg).textContent = e.message; }
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

// ---------- Conectar sua IA ----------
async function viewIa(r) {
  const slug = S.tenant.slug;
  const d = await api('GET', `/api/t/${slug}/ai`);
  const url = d.mcpUrl;
  const copy = (v) => `<div class="copy"><input readonly value="${esc(v)}"><button class="btn sm" type="button" data-copy="${esc(v)}">Copiar</button></div>`;
  const clients = [
    ['Claude (claude.ai, app e celular)', `Configurações → Conectores → Adicionar conector personalizado → cole o endereço abaixo → Conectar. Entre com a sua conta do portal e escolha a operação.`],
    ['ChatGPT', `Configurações → Apps e conectores → Avançado: ative o modo desenvolvedor → Criar → cole o endereço, autenticação OAuth → entre com a sua conta do portal.`],
    ['Kimi, Codex, Claude Code e outras linhas de comando', 'Gere um token pessoal aqui embaixo e use o comando da sua ferramenta (exemplos abaixo).'],
  ];
  const main = layout(r, `<div class="page-head"><div><h1>Conectar sua IA</h1><p>Use a IA que você já assina (Claude, ChatGPT, Kimi, Codex) para criar posts, criativos e agendamentos no portal. Ela trabalha com o seu login e o seu papel; tudo nasce como rascunho para você aprovar.</p></div></div>
    <div class="card"><div class="card-head"><h2>1. Conector MCP</h2><span class="pill ok"><span class="dot"></span>Recomendado</span></div>
      <p class="muted">MCP é o padrão que as IAs usam para falar com sistemas externos. Você adiciona o portal como conector na sua IA e entra com a sua conta daqui: não precisa de chave de API e usa a sua assinatura.</p>
      <label class="field" style="max-width:560px">Endereço do conector${copy(url)}</label>
      <div class="grid2" style="margin-top:12px">${clients.map(([n, how]) => `<div class="list-item"><strong>${esc(n)}</strong><span class="muted" style="font-size:13px">${esc(how)}</span></div>`).join('')}</div>
      <details style="margin-top:12px"><summary><strong>Comandos para linha de comando</strong></summary>
        <p class="muted" style="margin-top:8px">Claude Code:</p>${copy(`claude mcp add --transport http portal ${url} --header "Authorization: Bearer SEU_TOKEN"`)}
        <p class="muted" style="margin-top:8px">Codex (arquivo ~/.codex/config.toml):</p>${copy(`[mcp_servers.portal]\nurl = "${url}"\nbearer_token_env_var = "PORTAL_TOKEN"`)}
        <p class="muted" style="margin-top:8px">Kimi e outros clientes MCP: endereço ${esc(url)} com o cabeçalho Authorization: Bearer SEU_TOKEN.</p></details>
      <div class="row" style="margin-top:14px"><input id="pat-name" placeholder="Nome do token (ex.: Kimi do notebook)" style="max-width:300px"><button class="btn primary" type="button" id="pat-new">Gerar token pessoal</button></div>
      <p class="muted" style="font-size:12.5px">Vale 90 dias. Ele só aparece uma vez.</p></div>
    <div class="card"><div class="card-head"><h2>Conexões ativas</h2></div>${d.connections.length ? `<div class="table-wrap"><table><thead><tr><th>Conexão</th><th>Tipo</th><th>Criada</th><th>Último uso</th><th></th></tr></thead><tbody>
      ${d.connections.map((c) => `<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(c.kind)}</td><td class="mono">${fmtDate(c.createdAt)}</td><td class="mono">${fmtDate(c.lastUsedAt)}</td><td class="row end"><button class="btn sm danger" type="button" data-revoke="${esc(c.family)}">Desconectar</button></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty">Nenhuma IA conectada ainda.</div>'}
      <details style="margin-top:10px"><summary>O que a sua IA pode fazer com o seu papel (${d.tools.length} ferramentas)</summary><ul class="checks" style="margin-top:8px">${d.tools.map((t) => `<li class="ok"><span>✓</span> <span><strong>${esc(t.name)}</strong>: ${esc(t.description)}</span></li>`).join('')}</ul></details></div>
    <div class="card"><div class="card-head"><h2>2. Serviços</h2></div><p class="muted">Ligue o que você quer. Pela IA conectada, você pede e ela faz na hora. Rodar sozinho nos horários (sem você conversando) exige uma chave de API no passo 3.</p>
      <div class="table-wrap"><table><thead><tr><th>Serviço</th><th>Pela sua IA</th><th>Automático</th><th>Ligado</th></tr></thead><tbody>
      ${d.services.map((s) => `<tr><td><strong>${esc(s.label)}</strong><div class="muted" style="font-size:12.5px">${esc(s.what)}</div></td>
        <td><span class="pill ${s.status.pronto.pelaIa ? 'ok' : 'warn'}">${esc(s.status.pelaIa)}</span></td><td><span class="pill ${s.status.pronto.automatico ? 'ok' : 'warn'}">${esc(s.status.automatico)}</span></td>
        <td><label class="check"><input type="checkbox" data-svc="${esc(s.id)}" ${s.enabled ? 'checked' : ''}> ${s.enabled ? 'Sim' : 'Não'}</label></td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><div class="card-head"><h2>3. Chave de API (opcional, para rotinas automáticas)</h2></div>
      <p class="muted">A chave fica cifrada no servidor e nunca volta para a tela. O uso é cobrado pelo provedor na sua conta dele.</p>
      <div class="table-wrap"><table><tbody>${d.providers.map((p) => `<tr><td style="width:24%"><strong>${esc(p.label)}</strong><div><a class="muted" style="font-size:12px" href="${esc(p.consoleUrl)}" target="_blank" rel="noopener">onde pegar a chave ↗</a></div></td>
        <td>${p.connected ? `<span class="pill ${p.status === 'valida' ? 'ok' : 'bad'}">${p.status === 'valida' ? 'Chave válida' : esc(p.lastError || 'Erro')}</span>` : '<span class="pill">Sem chave</span>'}</td>
        <td><div class="row"><input type="password" autocomplete="off" placeholder="cole a chave" data-key="${esc(p.id)}" style="max-width:280px"><button class="btn sm" type="button" data-save-key="${esc(p.id)}">Salvar e testar</button>${p.connected ? `<button class="btn sm danger" type="button" data-del-key="${esc(p.id)}">Remover</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div></div>`);
  $$('[data-copy]', main).forEach((b) => b.addEventListener('click', async () => { await navigator.clipboard.writeText(b.dataset.copy); toast('Copiado.'); }));
  $('#pat-new').addEventListener('click', async () => {
    const res = await api('POST', `/api/t/${slug}/ai/tokens`, { name: $('#pat-name').value || 'Token pessoal' });
    prompt('Seu token pessoal (copie agora; ele não aparece de novo):', res.token);
    route();
  });
  $$('[data-revoke]', main).forEach((b) => b.addEventListener('click', async () => { if (confirm('Desconectar esta IA? Ela perde o acesso na hora.')) { await api('DELETE', `/api/t/${slug}/ai/tokens/${b.dataset.revoke}`); toast('Desconectada.'); route(); } }));
  $$('[data-svc]', main).forEach((c) => c.addEventListener('change', async () => { await api('PUT', `/api/t/${slug}/ai/services/${c.dataset.svc}`, { enabled: c.checked }); toast(c.checked ? 'Serviço ligado.' : 'Serviço desligado.'); route(); }));
  $$('[data-save-key]', main).forEach((b) => b.addEventListener('click', async () => {
    const input = $(`[data-key="${b.dataset.saveKey}"]`, main);
    try { const res = await api('PUT', `/api/t/${slug}/ai/keys/${b.dataset.saveKey}`, { key: input.value }); input.value = ''; toast(res.status === 'valida' ? 'Chave válida e guardada.' : (res.lastError || 'A chave não funcionou.'), res.status !== 'valida'); route(); } catch (e) { toast(e.message, true); }
  }));
  $$('[data-del-key]', main).forEach((b) => b.addEventListener('click', async () => { if (confirm('Remover esta chave?')) { await api('DELETE', `/api/t/${slug}/ai/keys/${b.dataset.delKey}`); route(); } }));
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
// E-mail do CRM (Gmail com senha de app) e Telegram (bot + canal): o dono liga e testa daqui. Segredos só entram; nunca voltam.
function cartoesCrm(em, tg, podeGravar) {
  const pill = (e, label) => `<span class="pill ${e === 'conectado' || e === 'ativo' ? 'ok' : e === 'erro' ? 'bad' : 'warn'}"><span class="dot"></span>${esc(label)}</span>`;
  const dis = podeGravar ? '' : 'disabled';
  const emCard = em ? `<div class="card" id="card-email"><div class="card-head"><h2>E-mail do CRM</h2>${pill(em.estado, em.estadoLabel)}</div>
    <p class="muted">Manda o passo a passo para cada cadastro do site e os e-mails avulsos do CRM. ${esc(em.ajuda)}</p>
    ${em.lastError ? `<p class="err">${esc(em.lastError)}</p>` : ''}
    <div class="row" style="flex-wrap:wrap;gap:10px">
      <label class="field" style="min-width:240px">E-mail da conta<input id="em-rem" type="email" value="${esc(em.config.remetente || '')}" placeholder="clube@gmail.com" ${dis}></label>
      <label class="field" style="min-width:200px">Nome do remetente<input id="em-nome" value="${esc(em.config.nomeRemetente || '')}" placeholder="Hot Poker" ${dis}></label>
      <label class="field" style="min-width:220px">Senha de app (16 letras)<input id="em-senha" type="password" autocomplete="new-password" placeholder="${em.temSenha ? 'gravada · deixe vazio para manter' : 'cole aqui'}" ${dis}></label>
    </div>
    <div class="row" style="gap:8px;margin-top:10px"><button class="btn primary" type="button" id="em-gravar" ${dis}>Gravar</button>
      <input id="em-para" type="email" placeholder="mandar teste para…" style="max-width:240px" ${dis}><button class="btn" type="button" id="em-teste" ${dis}>Testar</button></div>
    <details style="margin-top:12px"><summary>Prévia do e-mail de boas-vindas</summary><p><strong>${esc(em.boasVindas.previa.assunto)}</strong></p><pre style="white-space:pre-wrap;font:inherit" class="muted">${esc(em.boasVindas.previa.texto)}</pre></details></div>` : '';
  const tgCard = tg ? `<div class="card" id="card-telegram"><div class="card-head"><h2>Telegram</h2>${pill(tg.estado, tg.estadoLabel)}</div>
    <p class="muted">${esc(tg.ajuda)} O bot responde ${tg.comandos.map(esc).join(', ')} no privado, e o calendário publica no canal.</p>
    ${tg.lastError ? `<p class="err">${esc(tg.lastError)}</p>` : ''}
    <div class="row" style="flex-wrap:wrap;gap:10px">
      <label class="field" style="min-width:220px">Canal<input id="tg-canal" value="${esc(tg.config.canal || '')}" placeholder="@hotpoker" ${dis}></label>
      <label class="field" style="min-width:200px">Usuário do bot<input id="tg-bot" value="${esc(tg.config.botUsuario || '')}" placeholder="@hotpoker_bot" ${dis}></label>
      <label class="field" style="min-width:260px">Token do bot<input id="tg-token" type="password" autocomplete="off" placeholder="${tg.temToken ? 'gravado · deixe vazio para manter' : 'cole o token do @BotFather'}" ${dis}></label>
    </div>
    <div class="row" style="gap:8px;margin-top:10px"><button class="btn primary" type="button" id="tg-gravar" ${dis}>Gravar</button><button class="btn" type="button" id="tg-teste" ${dis}>Testar</button></div></div>` : '';
  return emCard + tgCard;
}

async function viewIntegracoes(r) {
  const d = await api('GET', `/api/t/${S.tenant.slug}/integrations`);
  const [em, tg, hook] = await Promise.all([api('GET', `/api/t/${S.tenant.slug}/email`).catch(() => null), api('GET', `/api/t/${S.tenant.slug}/telegram`).catch(() => null),
    api('GET', `/api/t/${S.tenant.slug}/conversas/hook`).catch(() => null)]); // hook de mensagens: PA-120
  const groups = { seo: 'SEO e buscadores', mensuracao: 'Mensuração no site', relatorios: 'Relatórios', redes: 'Redes sociais', campanhas: 'Campanhas', afiliacao: 'Afiliação' };
  const main = layout(r, `<div class="page-head"><div><h1>Integrações</h1><p>Estado real de cada conexão. Nada aparece como conectado sem estar.</p></div></div>
    ${cartoesCrm(em, tg, can('integrations.manage'))}<div id="int-bluesky"></div><div id="int-planilha"></div>
    ${Object.entries(groups).map(([g, label]) => {
      const items = d.integrations.filter((i) => i.group === g);
      return items.length ? `<div class="card"><div class="card-head"><h2>${esc(label)}</h2></div><div class="table-wrap"><table><tbody>${items.map((i) => `<tr><td style="width:40%"><strong>${esc(i.label)}</strong>${i.lastError ? `<div class="err">${esc(i.lastError)}</div>` : ''}</td><td>${statusPill(i.status)}</td>
        <td class="muted">${i.kind === 'webhook_conversoes' ? `<div class="copy"><input readonly value="${esc(i.url)}"><button class="btn sm" type="button" data-copy="${esc(i.url)}">Copiar</button></div><div style="margin-top:6px">Assinatura: <span class="mono">${esc(i.header)}</span> · segredo ${esc(i.secret || '')} ${can('integrations.manage') ? '<button class="btn sm" type="button" id="rotate">Gerar novo segredo</button>' : ''}</div>`
          : i.status === 'pendente' ? (['ga4', 'gtm', 'meta_pixel'].includes(i.kind) ? 'Instale o ID em Sites → Aparência, SEO e mensuração.' : ['clarity', 'google_ads'].includes(i.kind) ? 'Instale o ID em Mensuração e pixels.' : 'Aguardando o módulo desta integração e as credenciais da operação.') : esc(JSON.stringify(i.config))}</td></tr>`).join('')}</tbody></table></div></div>` : '';
    }).join('')}
    ${hook ? `<div class="card"><div class="card-head"><h2>Webhook de mensagens</h2></div>
      <div class="grid2"><label class="field">URL<div class="copy"><input readonly value="${esc(hook.url)}"><button class="btn sm" type="button" data-copy="${esc(hook.url)}">Copiar</button></div></label>
        <div><strong>Assinatura</strong><p class="mono">${esc(hook.assinatura)}</p><strong>Segredo do hook</strong><p class="mono">${esc(hook.segredo || 'sem permissão para ver')}</p></div></div>
      <p class="muted">O webhook registra mensagens recebidas; esta caixa de entrada não envia respostas.</p>
    </div>` : ''}`);
  import('/admin/modules/planilha.js').then((m) => m.renderCartao($('#int-planilha', main), { api, S, esc, toast, can, route, fmtDate })).catch(() => {}); // cópia dos leads na planilha
  $$('[data-copy]', main).forEach((b) => b.addEventListener('click', async () => { await navigator.clipboard.writeText(b.dataset.copy); toast('Copiado.'); }));
  import('/admin/modules/bluesky.js').then((m) => m.cartao($('#int-bluesky', main), { api, S, esc, toast, can, route, fmtDate })).catch(() => {}); // PA-151
  const acao = (id, fn) => $(id)?.addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try { await fn(); } catch (err) { toast(err.message, true); } finally { b.disabled = false; }
  });
  acao('#em-gravar', async () => {
    const body = { remetente: $('#em-rem').value.trim(), nomeRemetente: $('#em-nome').value.trim() };
    if ($('#em-senha').value) body.senha = $('#em-senha').value;
    await api('PUT', `/api/t/${S.tenant.slug}/email`, body); toast('E-mail gravado. Agora use Testar.'); route();
  });
  acao('#em-teste', async () => {
    if ($('#em-senha').value) await api('PUT', `/api/t/${S.tenant.slug}/email`, { remetente: $('#em-rem').value.trim(), nomeRemetente: $('#em-nome').value.trim(), senha: $('#em-senha').value });
    const res = await api('POST', `/api/t/${S.tenant.slug}/email/teste`, { para: $('#em-para').value.trim() || $('#em-rem').value.trim() });
    toast(res.mensagem || res.message || 'Teste enviado. Confira a caixa de entrada.'); route();
  });
  acao('#tg-gravar', async () => {
    const body = { canal: $('#tg-canal').value.trim(), botUsuario: $('#tg-bot').value.trim() };
    if ($('#tg-token').value) body.token = $('#tg-token').value.trim();
    await api('PUT', `/api/t/${S.tenant.slug}/telegram`, body); toast('Telegram gravado. Agora use Testar.'); route();
  });
  acao('#tg-teste', async () => {
    if ($('#tg-token').value.trim()) { // token colado e ainda não gravado: grava antes de testar (senão o teste usaria o token antigo)
      await api('PUT', `/api/t/${S.tenant.slug}/telegram`, { canal: $('#tg-canal').value.trim(), botUsuario: $('#tg-bot').value.trim(), token: $('#tg-token').value.trim() });
    }
    const res = await api('POST', `/api/t/${S.tenant.slug}/telegram/teste`);
    toast(res.ok === false ? (res.detalhe || 'O teste falhou.') : (res.mensagem || res.detalhe || 'Bot e canal conferidos.'), res.ok === false); route();
  });
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
      <p class="err" id="c-err"></p><div class="row end"><button class="btn primary" type="button" id="c-save">Salvar</button></div></div><div id="c-recursos"></div>`);
  import('/admin/modules/recursos.js').then((m) => m.renderConfig($('#c-recursos', main), { api, S, esc, toast, can, route, fmtDate })).catch(() => {}); // torneios e /baixar (PA-150)
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

// ---------- trilha "Migrar para o pôquer" (PA-140): fila do superadmin, só na edição SX ----------
async function viewMigracaoFila(r) {
  if (!S.me.user.isSuper || S.ed.id !== 'sx') { location.hash = '#/'; return; }
  const main = layout(r, '<div id="mod"></div>');
  const mod = await import('/admin/modules/migracao-fila.js');
  await mod.render($('#mod', main), { api, S, esc, toast, can, route, fmtDate });
}

// ---------- início ----------
async function boot() {
  try {
    S.me = await api('GET', '/api/me');
    S.csrf = S.me.csrf;
    S.meta = await api('GET', '/api/meta');
    applyEdition(S.meta.edition);
  } catch { return; }
  route();
}
window.addEventListener('hashchange', route);
fetch('/api/edition').then((r) => r.json()).then(applyEdition).catch(() => {})
  .finally(() => fetch('/api/me', { headers: { Accept: 'application/json' } }).then((r) => (r.ok ? boot() : renderLogin())).catch(renderLogin));
