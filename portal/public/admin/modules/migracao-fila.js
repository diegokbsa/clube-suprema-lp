// Fila da trilha "Migrar para o pôquer" (PA-140), só superadmin da edição SX.
// Aprovar cria a operação do agente com tudo em rascunho e devolve um link de primeiro acesso para copiar. Nada é enviado a ninguém.
const css = () => {
  if (!document.querySelector('link[data-mg]')) document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="/admin/modules/migracao.css" data-mg>');
};

/** Miniatura desenhada de cada modelo: a forma do mundo (rack, transmissão, relógio, ingresso, comprovante) + a página do tipo, nas cores do modelo. */
export function miniatura(m, esc) {
  const c = m.cores;
  const fio = esc(c.border || '#333');
  const p = esc(c.primary);
  const a = esc(c.accent);
  const t = esc(c.text);
  const s = esc(c.surface || c.bg);
  const mundo = {
    rack: `${[0, 1, 2, 3].map((i) => [0, 1, 2, 3, 4].slice(0, 5 - (i % 3)).map((j) => `<ellipse cx="${104 + i * 14}" cy="${82 - j * 7}" rx="6.5" ry="2.6" fill="${i % 2 ? a : p}" stroke="${esc(c.bg)}" stroke-width=".8"/>`).join('')).join('')}`,
    transmissao: `<rect x="96" y="34" width="54" height="40" fill="${s}" stroke="${fio}"/><rect x="96" y="64" width="54" height="10" fill="${p}"/><circle cx="102" cy="40" r="2.2" fill="#e5484d"/><rect x="106" y="38.5" width="14" height="3" fill="${t}" opacity=".7"/>`,
    relogio: `<text x="123" y="66" text-anchor="middle" font-family="Antonio, sans-serif" font-size="25" font-weight="700" fill="${p}">12:00</text><path d="M96 74h54M96 40h54" stroke="${fio}"/><rect x="96" y="77" width="16" height="3" fill="${a}"/>`,
    ingresso: `<path d="M94 36h58v12a5 5 0 0 0 0 10v20H94V58a5 5 0 0 0 0-10z" fill="${s}" stroke="${p}"/><path d="M134 38v38" stroke="${fio}" stroke-dasharray="2 2"/><rect x="100" y="44" width="26" height="4" fill="${t}" opacity=".8"/><rect x="100" y="52" width="18" height="3" fill="${a}"/>`,
    comprovante: `<path d="M100 30h46v46l-4 3-4-3-4 3-4-3-4 3-4-3-4 3-4-3-4 3-4-3-2 2z" fill="${s}" stroke="${fio}"/>${[38, 45, 52, 59].map((y, i) => `<rect x="105" y="${y}" width="${i === 3 ? 20 : 34}" height="2.6" fill="${i === 3 ? p : t}" opacity="${i === 3 ? 1 : 0.6}"/>`).join('')}<rect x="105" y="66" width="34" height="5" fill="${p}"/>`,
  }[m.mundo] || '';
  const tipo = {
    clube: `<rect x="12" y="34" width="66" height="9" fill="${t}"/><rect x="12" y="47" width="48" height="9" fill="${t}"/><rect x="12" y="64" width="30" height="9" rx="2" fill="${p}"/>`,
    fichas: `<rect x="12" y="34" width="56" height="8" fill="${t}"/><rect x="12" y="48" width="66" height="13" fill="none" stroke="${fio}"/><rect x="14" y="51" width="22" height="7" fill="${p}"/><rect x="12" y="66" width="40" height="3" fill="${t}" opacity=".5"/>`,
    torneios: `<rect x="12" y="34" width="50" height="8" fill="${t}"/>${[48, 56, 64, 72].map((y, i) => `<rect x="12" y="${y}" width="66" height="5" fill="${i === 0 ? p : t}" opacity="${i === 0 ? 1 : 0.35}"/>`).join('')}`,
    parceiro: `<rect x="12" y="34" width="58" height="8" fill="${t}"/><rect x="12" y="48" width="66" height="7" fill="none" stroke="${fio}"/><rect x="12" y="58" width="66" height="7" fill="none" stroke="${fio}"/><rect x="12" y="69" width="66" height="7" fill="${p}"/>`,
    blog: `<rect x="12" y="34" width="62" height="8" fill="${t}"/>${[48, 54, 60, 66, 72].map((y, i) => `<rect x="12" y="${y}" width="${i === 4 ? 36 : 66}" height="2.6" fill="${t}" opacity=".45"/>`).join('')}`,
  }[m.tipo] || '';
  return `<svg viewBox="0 0 160 96" aria-hidden="true" focusable="false"><rect width="160" height="96" fill="${esc(c.bg)}"/>
    <rect x="0" y="0" width="160" height="16" fill="${s}"/><rect x="12" y="6" width="22" height="4" fill="${p}"/><rect x="110" y="5.5" width="38" height="5" rx="1" fill="none" stroke="${fio}"/>
    ${tipo}${mundo}<path d="M0 86h160" stroke="${fio}"/></svg>`;
}

const NOMES_MUNDO = { rack: 'Rack de fichas', transmissao: 'Transmissão', relogio: 'Relógio de blinds', ingresso: 'Ingresso', comprovante: 'Comprovante PIX' };

export async function render(el, ctx) {
  css();
  const { api, esc, toast, fmtDate } = ctx;
  const st = new URLSearchParams(location.hash.split('?')[1] || '').get('status') || 'nova';
  const d = await api('GET', `/api/admin/migracao?status=${encodeURIComponent(st)}`);
  const P = d.placar;
  const semCand = !d.contagens.nova && !d.contagens.aprovada && !d.contagens.recusada;
  const tabs = [['nova', 'Novas'], ['aprovada', 'Aprovadas'], ['recusada', 'Recusadas']];

  el.innerHTML = `<div class="mg">
    <div class="page-head"><div><h1>Trilha de migração</h1><p>Candidaturas de <a href="/migrar" target="_blank" rel="noopener">/migrar</a>. Aprovar cria a operação do agente com tudo em rascunho. O portal não envia nada a ninguém.</p></div>
      <span class="spacer"></span><div class="mg-estado">${d.ativa ? '<span class="pill ok"><span class="dot"></span>Trilha ativa</span>' : '<span class="pill warn"><span class="dot"></span>Trilha pausada</span>'}
      <button class="btn" type="button" id="mg-toggle">${d.ativa ? 'Pausar trilha' : 'Religar trilha'}</button></div></div>

    ${d.revisoesPendentes.length ? `<div class="card"><div class="card-head"><h2>Páginas de perguntas aguardando a revisão do Kbsa</h2><span class="pill warn">${d.revisoesPendentes.length}</span></div>
      <p class="muted">"O pôquer também foi proibido?" nasce em rascunho, com um aviso interno no topo. Leia a página e as fontes; marcar como revisada tira o aviso, mas não publica.</p>
      <div class="mg-lista">${d.revisoesPendentes.map((r) => `<div class="row"><a href="#/t/${esc(r.slug)}/editor/${esc(r.pageId)}"><strong>${esc(r.operacao)}</strong></a><span class="spacer"></span>
        <a class="btn sm" href="#/t/${esc(r.slug)}/editor/${esc(r.pageId)}">Abrir rascunho</a><button class="btn sm primary" type="button" data-revisar="${esc(r.slug)}">Marcar como revisada</button></div>`).join('')}</div></div>` : ''}

    <section class="mg-sec" aria-labelledby="mg-placar"><h2 id="mg-placar">Placar de migração</h2>
      ${semCand ? '<div class="empty">Ainda sem candidaturas. Quando alguém enviar o formulário de /migrar, ela aparece aqui. O placar usa os leads e as conversões reais das operações aprovadas.</div>' : `
      <div class="kpis mg-kpis">
        <div class="kpi"><b>${d.contagens.nova}</b><span>candidaturas novas</span></div>
        <div class="kpi"><b>${d.contagens.aprovada}</b><span>agentes aprovados</span></div>
        <div class="kpi"><b>${P.leadsLink}</b><span>leads pelo link dos agentes</span><small>${P.leadsTotal} leads no total das operações</small></div>
        <div class="kpi"><b>${P.conv7}</b><span>primeiras recargas verificadas em 7 dias</span><small>${P.conv7Link} pelo link do agente</small></div>
        <div class="kpi"><b>${P.conv30}</b><span>primeiras recargas verificadas em 30 dias</span><small>${P.conv30Link} pelo link do agente</small></div>
      </div>
      ${P.agentes && !P.leadsTotal && !P.conv30 ? '<p class="muted">Os agentes aprovados ainda não têm leads nem recargas. Os números entram quando alguém clicar no link do agente, deixar contato no site ou fizer a primeira recarga verificada (webhook de conversão).</p>' : ''}
      <div class="card"><div class="card-head"><h2>Candidaturas por origem</h2></div><div class="table-wrap"><table><thead><tr><th>Origem</th><th>Total</th><th>Aprovadas</th><th>Recusadas</th></tr></thead><tbody>
        ${d.porOrigem.map((o) => `<tr><td>${esc(o.nome)}</td><td>${o.total}</td><td>${o.aprovadas}</td><td>${o.recusadas}</td></tr>`).join('')}</tbody></table></div></div>`}
    </section>

    <section class="mg-sec" aria-labelledby="mg-fila"><h2 id="mg-fila">Fila</h2>
      <div class="mg-tabs">${tabs.map(([k, l]) => `<a class="btn ${k === st ? 'primary' : ''}" href="#/migracao?status=${k}">${l} · ${d.contagens[k] || 0}</a>`).join('')}</div>
      <div class="mg-lista" id="mg-lista">${d.candidaturas.length ? d.candidaturas.map(item).join('') : `<div class="empty">${{ nova: 'Nenhuma candidatura nova.', aprovada: 'Nenhum agente aprovado ainda.', recusada: 'Nenhuma candidatura recusada.' }[st]}</div>`}</div>
    </section></div>`;

  function item(c) {
    const dados = [['Contato', `${c.contatoTipo === 'whatsapp' ? 'WhatsApp' : 'E-mail'} · ${c.contato}`], ['Canal', c.canalNome], ['Audiência', c.audienciaNome], ['Origem', c.origemNome], ['Nicho', c.nicho || '—'], ['Enviada', fmtDate(c.createdAt)]];
    const acoes = st === 'nova' ? `<button class="btn primary" type="button" data-analisar="${esc(c.id)}">Analisar e aprovar</button><button class="btn danger" type="button" data-recusar="${esc(c.id)}">Recusar</button>`
      : st === 'aprovada' ? `<a class="btn" href="#/t/${esc(c.slug || '')}/m/migracao">Painel do agente</a><button class="btn" type="button" data-link="${esc(c.id)}">Gerar link de acesso novo</button>` : '';
    const pl = c.placar ? `<dl class="mg-dados"><div><dt>Operação</dt><dd><a href="#/t/${esc(c.slug)}">${esc(c.operacao)}</a></dd></div><div><dt>Leads pelo link</dt><dd>${c.placar.leadsLink}</dd></div>
      <div><dt>Recargas 7 dias</dt><dd>${c.placar.conv7}</dd></div><div><dt>Recargas 30 dias</dt><dd>${c.placar.conv30}</dd></div></dl>` : '';
    return `<article class="mg-cand" data-cand="${esc(c.id)}"><div class="mg-cand-topo"><strong>${esc(c.nome)}</strong><span class="pill">${esc(c.origemNome)}</span>${c.status === 'recusada' && c.motivo ? `<span class="muted">Motivo: ${esc(c.motivo)}</span>` : ''}</div>
      <dl class="mg-dados">${dados.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>${pl}
      ${acoes ? `<div class="mg-acoes">${acoes}</div>` : ''}<div class="mg-painel" hidden></div></article>`;
  }

  el.querySelector('#mg-toggle').addEventListener('click', async () => {
    const pausar = d.ativa;
    if (pausar && !confirm('Pausar a trilha? /migrar para de aceitar candidaturas e nenhuma aprovação sai até religar.')) return;
    await api('PATCH', '/api/admin/migracao/config', { ativa: !pausar });
    toast(pausar ? 'Trilha pausada.' : 'Trilha religada.');
    render(el, ctx);
  });
  el.querySelectorAll('[data-revisar]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Você leu a página e conferiu as fontes? Marcar como revisada tira o aviso interno do rascunho. A página continua sem publicar.')) return;
    try { const r = await api('POST', `/api/t/${encodeURIComponent(b.dataset.revisar)}/migracao/perguntas/revisar`); toast(r.nota); render(el, ctx); } catch (e) { toast(e.message, true); }
  }));
  el.querySelectorAll('[data-recusar]').forEach((b) => b.addEventListener('click', async () => {
    const motivo = prompt('Motivo da recusa (opcional, fica só no painel; ninguém é avisado):');
    if (motivo === null) return;
    try { const r = await api('POST', `/api/admin/migracao/${b.dataset.recusar}/recusar`, { motivo }); toast(r.nota); render(el, ctx); } catch (e) { toast(e.message, true); }
  }));
  el.querySelectorAll('[data-link]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Gerar um link de primeiro acesso novo? O anterior deixa de valer.')) return;
    try {
      const r = await api('POST', `/api/admin/migracao/${b.dataset.link}/link`);
      const painelEl = b.closest('.mg-cand').querySelector('.mg-painel');
      painelEl.hidden = false;
      painelEl.innerHTML = resultadoLink(r.link, r.expiraEm, 'Link novo de primeiro acesso');
      ligarCopiar(painelEl);
    } catch (e) { toast(e.message, true); }
  }));
  el.querySelectorAll('[data-analisar]').forEach((b) => b.addEventListener('click', () => abrir(b.dataset.analisar, b)));

  function resultadoLink(link, expiraEm, titulo, extra = '') {
    return `<div class="mg-resultado" role="status"><h3>${esc(titulo)}</h3>
      ${link ? `<label class="field">Link de primeiro acesso (vale até ${esc(fmtDate(expiraEm))}, uso único)<span class="mg-copiar"><input readonly value="${esc(link)}"><button class="btn" type="button" data-copiar="${esc(link)}">Copiar</button></span></label>` : ''}
      <p class="muted">O portal não enviou nada. Copie e mande você mesmo, se e quando quiser.</p>${extra}</div>`;
  }
  function ligarCopiar(root) {
    root.querySelectorAll('[data-copiar]').forEach((x) => x.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(x.dataset.copiar); toast('Copiado.'); } catch { x.previousElementSibling?.select?.(); toast('Selecionado: copie com Ctrl+C.'); }
    }));
  }

  function abrir(id, botao) {
    const c = d.candidaturas.find((x) => x.id === id);
    const card = botao.closest('.mg-cand');
    const painelEl = card.querySelector('.mg-painel');
    if (!painelEl.hidden) { painelEl.hidden = true; card.classList.remove('aberta'); return; }
    card.classList.add('aberta');
    painelEl.hidden = false;
    const porMundo = Object.entries(d.modelos.reduce((acc, m) => ((acc[m.mundo] ||= []).push(m), acc), {}));
    painelEl.innerHTML = `<form class="mg-sec" novalidate>
      <div class="mg-risco" role="note">${d.aviso.map((a) => `<div><strong>${esc(a.titulo)}</strong><p>${esc(a.texto)}</p></div>`).join('')}</div>
      <div class="grid2">
        <label class="field">Nome da operação do agente<input name="nome" required maxlength="80" value="${esc(`Clube ${c.nome}`.slice(0, 80))}"></label>
        <label class="field">Número do clube<input name="numero" required maxlength="20" placeholder="Ex.: 20001" inputmode="numeric"></label>
        <label class="field">Código de agente<input name="codigoAgente" required maxlength="30" placeholder="Ex.: ag-joao"></label>
        <label class="field">E-mail de acesso do agente<input name="email" type="email" required maxlength="120" value="${esc(c.contatoTipo === 'email' ? c.contato : '')}" placeholder="agente@email.com"></label>
      </div>
      <fieldset class="mg-mundos" style="border:0;padding:0;margin:0"><legend class="field" style="margin-bottom:8px">Modelo do site (${d.modelos.length} modelos de mundo)</legend>
        ${porMundo.map(([mundo, lista]) => `<div class="mg-mundo"><h3>${esc(NOMES_MUNDO[mundo] || mundo)}</h3><div class="mg-modelos">${lista.map((m) => `<label class="mg-modelo" title="${esc(m.descricao)}">
          <input type="radio" name="modelo" value="${esc(m.id)}">${miniatura(m, esc)}<span>${esc(m.tipoNome)}</span></label>`).join('')}</div></div>`).join('')}
      </fieldset>
      <label class="check"><input type="checkbox" name="ciente"> Avisei (ou vou avisar) o agente de que a conta de rede social dele pode cair pelo histórico de apostas.</label>
      <p class="err" data-err></p>
      <div class="mg-acoes"><button class="btn" type="button" data-cancelar>Cancelar</button><button class="btn primary" type="submit">Aprovar e criar a operação</button></div>
    </form>`;
    const form = painelEl.querySelector('form');
    form.querySelector('[data-cancelar]').addEventListener('click', () => { painelEl.hidden = true; card.classList.remove('aberta'); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = form.elements;
      const err = form.querySelector('[data-err]');
      if (!f.modelo.value) { err.textContent = 'Escolha um modelo do site.'; return; }
      if (!f.ciente.checked) { err.textContent = 'Marque que o agente foi (ou vai ser) avisado do risco da conta de rede social.'; return; }
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        const r = await api('POST', `/api/admin/migracao/${id}/aprovar`, { nome: f.nome.value, numero: f.numero.value, codigoAgente: f.codigoAgente.value, email: f.email.value, modelo: f.modelo.value });
        ctx.S.me = await api('GET', '/api/me');
        painelEl.innerHTML = resultadoLink(r.link, r.expiraEm, `Operação criada: ${r.tenant.label} · ${r.tenant.name}`,
          `${r.usuarioExistente ? '<p>O e-mail já tinha acesso ao portal com senha: o agente entra com a senha dele, sem link.</p>' : ''}
           <p>Site e página "O pôquer também foi proibido?" em <strong>rascunho</strong>, aguardando revisão. Kit de 7 dias gerado para o canal principal.</p>
           <div class="row"><a class="btn" href="${esc(r.adminUrl.replace('/admin/', ''))}">Abrir a operação</a><a class="btn" href="#/t/${esc(r.tenant.slug)}/m/migracao">Painel do agente</a></div>`);
        ligarCopiar(painelEl);
        card.querySelector('.mg-acoes')?.remove();
        toast('Operação criada em rascunho. Nada foi enviado.');
      } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
    });
  }
}
