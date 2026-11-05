// Funil de leads com troca de etapa, atribuição, histórico e exportação.
export async function render(el, ctx) {
  const { api, S, esc, toast, can, fmtDate } = ctx;
  const slug = S.tenant.slug;
  const etapas = [
    ['novo', 'Novo'], ['contato', 'Em contato'], ['qualificado', 'Qualificado'], ['convertido', 'Convertido'], ['perdido', 'Perdido'],
  ];
  const nomeEtapa = (key) => etapas.find(([value]) => value === key)?.[1] || key || '—';
  const nomesEtapas = Object.fromEntries(etapas);
  const state = { leads: [], responsaveis: [], historicos: new Map(), aberto: null };

  await carregar();

  async function carregar() {
    const [dados, equipe] = await Promise.all([
      api('GET', `/api/t/${slug}/leads`),
      api('GET', `/api/t/${slug}/crm/responsaveis`),
    ]);
    state.leads = dados.leads || [];
    state.responsaveis = equipe.responsaveis || [];
    desenhar();
  }

  function nomeResponsavel(id) {
    if (!id) return 'Sem responsável';
    return state.responsaveis.find((u) => u.id === id)?.name || 'Responsável indisponível';
  }

  async function atualizarHistorico(id) {
    state.historicos.delete(id);
    if (state.aberto !== id) return;
    try {
      state.historicos.set(id, await api('GET', `/api/t/${slug}/leads/${id}`));
    } catch {
      state.aberto = null;
    }
  }

  function detalheEvento(evento) {
    const dado = evento.data || {};
    if (evento.kind === 'etapa') return `${nomeEtapa(dado.de)} → ${nomeEtapa(dado.para)}${dado.nota ? ` · ${dado.nota}` : ''}`;
    if (evento.kind === 'responsavel') return `${nomeResponsavel(dado.de)} → ${nomeResponsavel(dado.para)}${dado.nota ? ` · ${dado.nota}` : ''}`;
    if (evento.kind === 'edicao' && dado.de && dado.para) {
      const partes = [];
      if (dado.de.stage !== dado.para.stage) partes.push(`Etapa: ${nomeEtapa(dado.de.stage)} → ${nomeEtapa(dado.para.stage)}`);
      if (dado.de.owner !== dado.para.owner) partes.push(`Responsável: ${nomeResponsavel(dado.de.owner)} → ${nomeResponsavel(dado.para.owner)}`);
      if (dado.nota) partes.push(dado.nota);
      return partes.join(' · ') || 'Lead atualizado.';
    }
    if (evento.kind === 'criado') return `Lead recebido${dado.origem ? ` · origem: ${dado.origem}` : ''}${dado.pagina ? ` · página: ${dado.pagina}` : ''}`;
    if (evento.kind === 'conversao') return `Conversão ${dado.kind || 'registrada'}${dado.value_cents != null ? ` · R$ ${(Number(dado.value_cents) / 100).toFixed(2).replace('.', ',')}` : ''}`;
    return Object.entries(dado).map(([chave, valor]) => `${chave}: ${typeof valor === 'object' ? JSON.stringify(valor) : valor}`).join(' · ') || 'Evento registrado.';
  }

  function historicoHtml(lead) {
    const eventos = state.historicos.get(lead.id)?.events || [];
    if (!eventos.length) return '<div class="empty">Nenhum evento registrado.</div>';
    return `<div style="display:grid;gap:8px;margin-top:10px">${eventos.map((evento) => `<div class="list-item">
      <div class="row"><strong>${esc({ criado: 'Lead recebido', etapa: 'Mudança de etapa', responsavel: 'Responsável alterado', edicao: 'Lead atualizado', conversao: 'Conversão' }[evento.kind] || evento.kind)}</strong>
        <span class="spacer"></span><span class="muted">${esc(fmtDate(evento.created_at))}</span></div>
      <div class="muted" style="font-size:13px;margin-top:4px">${esc(detalheEvento(evento))}</div>
    </div>`).join('')}</div>`;
  }

  function desenhar() {
    const podeEditar = can('leads.edit');
    const owners = state.responsaveis;
    el.innerHTML = `<div class="page-head"><div><h2>Funil de leads</h2><p class="muted">Acompanhe as etapas, defina quem atende e consulte o histórico de cada cadastro.</p></div>
      ${can('leads.export') ? `<a class="btn primary" href="/api/t/${esc(slug)}/leads.csv" download="leads-${esc(slug)}.csv">Exportar CSV</a>` : ''}</div>
      <p class="muted" style="font-size:12.5px">O quadro mostra os 500 leads mais recentes da operação. A exportação inclui até 5.000.</p>
      <div class="crm-board" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;align-items:start">
        ${etapas.map(([key, label]) => {
          const leads = state.leads.filter((lead) => lead.stage === key);
          return `<section class="card" style="margin:0;min-width:0"><div class="card-head"><h3>${esc(label)}</h3><span class="pill">${leads.length}</span></div>
            ${leads.length ? `<div style="display:grid;gap:10px">${leads.map((lead) => {
              const utm = lead.utm || {};
              const historicoAberto = state.aberto === lead.id;
              const responsavelDesconhecido = lead.ownerId && !owners.some((u) => u.id === lead.ownerId);
              return `<article class="list-item" style="display:grid;gap:8px">
                <div><strong>${esc(lead.name || lead.email || 'Lead sem nome')}</strong><div class="muted" style="font-size:12.5px">${esc(lead.email || 'Sem e-mail')}${lead.phone ? ` · ${esc(lead.phone)}` : ''}</div>
                  <div class="muted" style="font-size:12px;margin-top:4px">${esc(lead.affiliate || (utm.utm_source ? `Origem: ${utm.utm_source}` : 'Entrada direta'))} · ${esc(fmtDate(lead.createdAt))}</div></div>
                ${podeEditar ? `<label class="field" style="font-size:12px">Etapa<select data-etapa="${esc(lead.id)}">${etapas.map(([value, text]) => `<option value="${esc(value)}" ${lead.stage === value ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></label>
                  <label class="field" style="font-size:12px">Responsável<select data-responsavel="${esc(lead.id)}">
                    ${responsavelDesconhecido ? '<option value="" disabled selected>Responsável indisponível</option>' : ''}
                    <option value="" ${!lead.ownerId ? 'selected' : ''}>Sem responsável</option>
                    ${owners.map((owner) => `<option value="${esc(owner.id)}" ${lead.ownerId === owner.id ? 'selected' : ''}>${esc(owner.name)} · ${esc(owner.role === 'admin' ? 'administração' : 'marketing')}</option>`).join('')}
                  </select></label>` : `<div class="muted" style="font-size:12.5px">Responsável: ${esc(nomeResponsavel(lead.ownerId))}</div>`}
                <button class="btn sm" type="button" data-historico="${esc(lead.id)}">${historicoAberto ? 'Ocultar histórico' : 'Ver histórico'}</button>
                ${historicoAberto ? `<div><strong>Histórico</strong>${historicoHtml(lead)}</div>` : ''}
              </article>`;
            }).join('')}</div>` : '<div class="empty">Nenhum lead nesta etapa.</div>'}
          </section>`;
        }).join('')}
      </div>`;

    el.querySelectorAll('[data-etapa]').forEach((select) => select.addEventListener('change', async () => {
      const id = select.dataset.etapa;
      select.disabled = true;
      try {
        await api('PATCH', `/api/t/${slug}/crm/leads/${id}/etapa`, { stage: select.value });
        await atualizarHistorico(id);
        toast('Etapa atualizada e registrada no histórico.');
        await carregar();
      } catch (erro) {
        toast(erro.message || 'Não foi possível alterar a etapa.');
        await carregar();
      }
    }));

    el.querySelectorAll('[data-responsavel]').forEach((select) => select.addEventListener('change', async () => {
      const id = select.dataset.responsavel;
      select.disabled = true;
      try {
        await api('PATCH', `/api/t/${slug}/crm/leads/${id}/responsavel`, { ownerId: select.value || null });
        await atualizarHistorico(id);
        toast('Responsável atualizado e registrado no histórico.');
        await carregar();
      } catch (erro) {
        toast(erro.message || 'Não foi possível atualizar o responsável.');
        await carregar();
      }
    }));

    el.querySelectorAll('[data-historico]').forEach((button) => button.addEventListener('click', async () => {
      const id = button.dataset.historico;
      if (state.aberto === id) { state.aberto = null; desenhar(); return; }
      try {
        state.historicos.set(id, await api('GET', `/api/t/${slug}/leads/${id}`));
        state.aberto = id;
        desenhar();
      } catch (erro) {
        toast(erro.message || 'Não foi possível carregar o histórico.');
      }
    }));
  }
}
