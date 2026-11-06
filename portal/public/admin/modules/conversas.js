// Caixa de entrada da operação: lista de conversas, linha do tempo de mensagens e notas internas.
// O painel não envia nada para o cliente: resposta escrita aqui fica registrada como pendente de envio.
export async function render(el, ctx) {
  const { api, S, esc, toast, can, fmtDate } = ctx;
  const slug = S.tenant.slug;
  const podeEditar = can('leads.edit');
  const rotuloStatus = { aberta: 'Aberta', aguardando: 'Aguardando', resolvida: 'Resolvida' };
  const corStatus = { aberta: 'info', aguardando: 'warn', resolvida: 'ok' };
  const rotuloCanal = { whatsapp: 'WhatsApp', telegram: 'Telegram', email: 'E-mail', site: 'Site', manual: 'Manual' };
  const rotuloDirecao = { entrada: 'Cliente', saida: 'Atendimento', nota: 'Nota interna' };
  const rotuloEvento = { aberta: 'Conversa aberta', status: 'Status alterado', atendente: 'Atendente alterado', assunto: 'Assunto alterado' };
  const filtros = { q: '', status: '', canal: '', atendente: '' };
  const state = { dados: null, abertaId: null, detalhe: null, nova: false, rascunho: '', direcao: 'saida', ocupado: false };

  await carregar();

  async function carregar() {
    const busca = new URLSearchParams();
    for (const [chave, valor] of Object.entries(filtros)) if (valor) busca.set(chave, valor);
    state.dados = await api('GET', `/api/t/${slug}/conversas${busca.toString() ? `?${busca}` : ''}`);
    desenhar();
  }

  function nomeAtendente(id) {
    if (!id) return 'Sem atendente';
    return state.dados?.atendentes.find((u) => u.id === id)?.name || 'Atendente indisponível';
  }

  async function abrir(id) {
    try {
      state.detalhe = await api('GET', `/api/t/${slug}/conversas/${id}`);
      state.abertaId = id;
      state.rascunho = '';
      if (podeEditar && state.detalhe.conversa.naoLidas > 0) {
        await api('PATCH', `/api/t/${slug}/conversas/${id}`, { lida: true });
        state.detalhe.conversa.naoLidas = 0;
        await carregar();
        return;
      }
      desenhar();
    } catch (erro) {
      toast(erro.message || 'Não foi possível abrir a conversa.', true);
    }
  }

  function itemLista(c) {
    const destaque = c.id === state.abertaId ? 'border-color:var(--brand);box-shadow:0 0 0 2px var(--gold-soft)' : '';
    return `<button type="button" class="list-item" data-conversa="${esc(c.id)}"
      style="text-align:left;width:100%;cursor:pointer;font:inherit;color:inherit;gap:6px;${destaque}">
      <div class="row" style="gap:6px"><strong style="font-size:13.5px">${esc(c.cliente?.nome || '(sem nome)')}</strong>
        <span class="spacer"></span>${c.naoLidas ? `<span class="pill bad">${c.naoLidas} não lida${c.naoLidas > 1 ? 's' : ''}</span>` : ''}</div>
      <div class="row" style="gap:6px"><span class="pill ${corStatus[c.status] || ''}">${esc(rotuloStatus[c.status] || c.status)}</span>
        <span class="pill">${esc(rotuloCanal[c.canal] || c.canal)}</span></div>
      ${c.assunto ? `<div style="font-size:12.5px">${esc(c.assunto)}</div>` : ''}
      <div class="muted" style="font-size:12.5px">${c.ultima ? `${c.ultimaDirecao === 'saida' ? 'Atendimento: ' : ''}${esc(c.ultima)}` : 'Sem mensagens.'}</div>
      <div class="muted mono" style="font-size:11.5px">${esc(fmtDate(c.ultimaEm || c.criadaEm))} · ${esc(nomeAtendente(c.atendente))}</div>
    </button>`;
  }

  function mensagemHtml(m) {
    const estilo = {
      entrada: 'border-left:3px solid var(--line-2)',
      saida: 'border-left:3px solid var(--brand);margin-left:28px',
      nota: 'border-left:3px solid var(--warn);background:var(--warn-soft)',
    }[m.direcao] || '';
    return `<div class="list-item" style="gap:5px;${estilo}">
      <div class="row" style="gap:6px"><strong style="font-size:12.5px">${esc(rotuloDirecao[m.direcao] || m.direcao)}</strong>
        ${m.autor ? `<span class="muted" style="font-size:12.5px">${esc(m.autor)}</span>` : ''}
        ${m.status === 'pendente_envio' ? '<span class="pill warn">pendente de envio</span>' : ''}
        <span class="spacer"></span><span class="muted mono" style="font-size:11.5px">${esc(fmtDate(m.quando))}</span></div>
      ${m.direcao === 'nota' ? '<div class="muted" style="font-size:12px">Nota interna — o cliente não vê.</div>' : ''}
      <div style="white-space:pre-wrap;font-size:13.5px">${esc(m.texto)}</div>
    </div>`;
  }

  function detalheEvento(e) {
    const d = e.dados || {};
    if (e.tipo === 'status') return `${esc(rotuloStatus[d.de] || d.de || '—')} → ${esc(rotuloStatus[d.para] || d.para || '—')}`;
    if (e.tipo === 'atendente') return `${esc(nomeAtendente(d.de))} → ${esc(nomeAtendente(d.para))}`;
    if (e.tipo === 'assunto') return `${esc(d.de || '(sem assunto)')} → ${esc(d.para || '(sem assunto)')}`;
    if (e.tipo === 'aberta') return `Canal ${esc(rotuloCanal[d.canal] || d.canal || '—')} · origem: ${esc(d.por === 'integracao' ? 'integração do canal' : 'painel')}`;
    return esc(JSON.stringify(d)).slice(0, 160);
  }

  function painelHtml() {
    if (!state.abertaId || !state.detalhe) return '<div class="card"><div class="empty">Escolha uma conversa na lista para ver as mensagens.</div></div>';
    const { conversa: c, mensagens, eventos, lead } = state.detalhe;
    const desconhecido = c.atendente && !state.dados.atendentes.some((u) => u.id === c.atendente);
    return `<div class="card">
      <div class="card-head"><h2>${esc(c.cliente?.nome || '(sem nome)')}</h2>
        <span class="pill ${corStatus[c.status] || ''}">${esc(rotuloStatus[c.status] || c.status)}</span>
        <span class="pill">${esc(rotuloCanal[c.canal] || c.canal)}</span></div>
      <p class="muted" style="font-size:12.5px">${esc(c.cliente?.email || 'Sem e-mail')}${c.cliente?.telefone ? ` · ${esc(c.cliente.telefone)}` : ''}
        ${c.cliente?.id ? ` · <a href="#/t/${esc(slug)}/m/clientes?c=${esc(c.cliente.id)}">ver ficha do cliente</a>` : ''}
        ${lead ? ` · lead na etapa ${esc(lead.etapa)}` : ''}</p>
      ${c.assunto ? `<p style="font-size:13.5px">Assunto: ${esc(c.assunto)}</p>` : ''}
      ${podeEditar ? `<div class="grid2">
        <label class="field">Status<select id="cv-status">${state.dados.status.map((s) => `<option value="${esc(s)}" ${c.status === s ? 'selected' : ''}>${esc(rotuloStatus[s] || s)}</option>`).join('')}</select></label>
        <label class="field">Atendente<select id="cv-atendente">
          ${desconhecido ? '<option value="" disabled selected>Atendente indisponível</option>' : ''}
          <option value="" ${!c.atendente ? 'selected' : ''}>Sem atendente</option>
          ${state.dados.atendentes.map((u) => `<option value="${esc(u.id)}" ${c.atendente === u.id ? 'selected' : ''}>${esc(u.name)} · ${esc(u.role === 'admin' ? 'administração' : 'marketing')}</option>`).join('')}
        </select></label></div>`
      : `<p class="muted" style="font-size:12.5px">Atendente: ${esc(nomeAtendente(c.atendente))}</p>`}
      <div style="display:grid;gap:8px;margin-top:14px">
        ${mensagens.length ? mensagens.map(mensagemHtml).join('') : '<div class="empty">Nenhuma mensagem nesta conversa.</div>'}
      </div>
      ${podeEditar ? `<div style="display:grid;gap:8px;margin-top:14px;border-top:1px solid var(--line);padding-top:14px">
        <label class="field">Escrever<textarea id="cv-texto" placeholder="Escreva aqui">${esc(state.rascunho)}</textarea></label>
        <div class="row">
          <label class="field" style="flex:1;min-width:220px">Registrar como<select id="cv-direcao">
            <option value="saida" ${state.direcao === 'saida' ? 'selected' : ''}>Responder (atendimento)</option>
            <option value="entrada" ${state.direcao === 'entrada' ? 'selected' : ''}>Registrar mensagem do cliente</option>
            <option value="nota" ${state.direcao === 'nota' ? 'selected' : ''}>Nota interna</option>
          </select></label>
          <span class="spacer"></span><button class="btn primary" type="button" id="cv-enviar" ${state.ocupado ? 'disabled' : ''}>Registrar mensagem</button>
        </div>
        <p class="muted" style="font-size:12.5px;margin:0">A resposta fica guardada como pendente de envio: este canal ainda não tem integração configurada, então nada sai daqui para o cliente.</p>
      </div>` : ''}
      <div style="margin-top:16px"><strong style="font-size:13px">Histórico</strong>
        ${eventos.length ? `<div style="display:grid;gap:6px;margin-top:8px">${eventos.map((e) => `<div class="list-item" style="gap:4px">
          <div class="row" style="gap:6px"><strong style="font-size:12.5px">${esc(rotuloEvento[e.tipo] || e.tipo)}</strong>
            <span class="spacer"></span><span class="muted mono" style="font-size:11.5px">${esc(fmtDate(e.quando))}</span></div>
          <div class="muted" style="font-size:12.5px">${detalheEvento(e)}${e.por ? ` · por ${esc(nomeAtendente(e.por))}` : ''}</div>
        </div>`).join('')}</div>` : '<div class="empty">Sem registros.</div>'}
      </div>
    </div>`;
  }

  function novaHtml() {
    if (!state.nova) return '';
    return `<div class="card"><div class="card-head"><h2>Nova conversa</h2></div>
      <div class="grid2">
        <label class="field">Canal<select id="nv-canal">${state.dados.canais.map((ch) => `<option value="${esc(ch)}" ${ch === 'manual' ? 'selected' : ''}>${esc(rotuloCanal[ch] || ch)}</option>`).join('')}</select></label>
        <label class="field">Nome<input id="nv-nome" placeholder="Nome do cliente"></label>
        <label class="field">E-mail<input id="nv-email" type="email" placeholder="cliente@exemplo.com"></label>
        <label class="field">Telefone<input id="nv-telefone" placeholder="+55 11 90000-0000"></label>
      </div>
      <label class="field" style="margin-top:10px">Assunto<input id="nv-assunto" placeholder="Assunto da conversa"></label>
      <label class="field" style="margin-top:10px">Primeira mensagem do cliente (opcional)<textarea id="nv-texto" placeholder="O que a pessoa pediu"></textarea></label>
      <p class="muted" style="font-size:12.5px;margin:10px 0 0">Informe pelo menos o e-mail ou o telefone para achar a pessoa na base.</p>
      <div class="row end" style="margin-top:10px"><button class="btn" type="button" id="nv-cancelar">Cancelar</button>
        <button class="btn primary" type="button" id="nv-salvar">Abrir conversa</button></div>
    </div>`;
  }

  function desenhar() {
    const d = state.dados;
    const t = d.totais;
    el.innerHTML = `<div class="page-head"><div><h2>Caixa de entrada</h2>
        <p class="muted">Caixa de entrada desta operação: mensagens do cliente, respostas do atendimento e notas internas no mesmo lugar.</p></div>
      <span class="spacer"></span>${podeEditar ? '<button class="btn primary" type="button" id="cv-nova">Nova conversa</button>' : ''}</div>
      ${novaHtml()}
      <div class="card"><div class="row">
        <input id="f-q" placeholder="Buscar por nome, e-mail, telefone ou assunto" value="${esc(filtros.q)}" style="max-width:320px">
        <label class="field">Status<select id="f-status">
          <option value="" ${!filtros.status ? 'selected' : ''}>Todas (${t.todas})</option>
          ${d.status.map((s) => `<option value="${esc(s)}" ${filtros.status === s ? 'selected' : ''}>${esc(rotuloStatus[s] || s)} (${t[s] || 0})</option>`).join('')}
        </select></label>
        <label class="field">Canal<select id="f-canal"><option value="">Todos os canais</option>
          ${d.canais.map((ch) => `<option value="${esc(ch)}" ${filtros.canal === ch ? 'selected' : ''}>${esc(rotuloCanal[ch] || ch)}</option>`).join('')}
        </select></label>
        <label class="field">Atendente<select id="f-atendente">
          <option value="" ${!filtros.atendente ? 'selected' : ''}>Todos</option>
          <option value="meus" ${filtros.atendente === 'meus' ? 'selected' : ''}>Minhas</option>
          <option value="sem" ${filtros.atendente === 'sem' ? 'selected' : ''}>Sem atendente (${t.semAtendente})</option>
          ${d.atendentes.map((u) => `<option value="${esc(u.id)}" ${filtros.atendente === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
        </select></label>
        <span class="spacer"></span><span class="pill ${t.naoLidas ? 'bad' : ''}">${t.naoLidas} com mensagem não lida</span>
        <button class="btn" type="button" id="f-buscar">Buscar</button>
      </div></div>
      <div style="display:grid;grid-template-columns:minmax(250px,330px) 1fr;gap:14px;align-items:start;margin-top:14px">
        <div style="display:grid;gap:8px;min-width:0">${d.conversas.length ? d.conversas.map(itemLista).join('') : '<div class="empty">Nenhuma conversa com esses filtros.</div>'}</div>
        <div style="min-width:0">${painelHtml()}</div>
      </div>`;
    ligarEventos();
  }

  function ligarEventos() {
    const campoBusca = el.querySelector('#f-q');
    const aplicar = async () => {
      filtros.q = campoBusca.value.trim();
      filtros.status = el.querySelector('#f-status').value;
      filtros.canal = el.querySelector('#f-canal').value;
      filtros.atendente = el.querySelector('#f-atendente').value;
      try { await carregar(); } catch (erro) { toast(erro.message || 'Não foi possível carregar as conversas.', true); }
    };
    el.querySelector('#f-buscar').addEventListener('click', aplicar);
    campoBusca.addEventListener('keydown', (e) => { if (e.key === 'Enter') aplicar(); });
    ['#f-status', '#f-canal', '#f-atendente'].forEach((sel) => el.querySelector(sel).addEventListener('change', aplicar));
    el.querySelectorAll('[data-conversa]').forEach((botao) => botao.addEventListener('click', () => abrir(botao.dataset.conversa)));

    const texto = el.querySelector('#cv-texto');
    if (texto) texto.addEventListener('input', () => { state.rascunho = texto.value; });
    const direcao = el.querySelector('#cv-direcao');
    if (direcao) direcao.addEventListener('change', () => { state.direcao = direcao.value; });
    const enviar = el.querySelector('#cv-enviar');
    if (enviar) enviar.addEventListener('click', () => registrarMensagem());

    const selStatus = el.querySelector('#cv-status');
    if (selStatus) selStatus.addEventListener('change', () => aplicarPatch({ status: selStatus.value }, 'Status atualizado.'));
    const selAtendente = el.querySelector('#cv-atendente');
    if (selAtendente) selAtendente.addEventListener('change', () => aplicarPatch({ atendente: selAtendente.value || null }, 'Atendente atualizado.'));

    const nova = el.querySelector('#cv-nova');
    if (nova) nova.addEventListener('click', () => { state.nova = !state.nova; desenhar(); });
    const cancelar = el.querySelector('#nv-cancelar');
    if (cancelar) cancelar.addEventListener('click', () => { state.nova = false; desenhar(); });
    const salvar = el.querySelector('#nv-salvar');
    if (salvar) salvar.addEventListener('click', () => criarConversa());
  }

  async function aplicarPatch(corpo, sucesso) {
    try {
      await api('PATCH', `/api/t/${slug}/conversas/${state.abertaId}`, corpo);
      state.detalhe = await api('GET', `/api/t/${slug}/conversas/${state.abertaId}`);
      toast(sucesso);
      await carregar();
    } catch (erro) {
      toast(erro.message || 'Não foi possível atualizar a conversa.', true);
      await carregar();
    }
  }

  async function registrarMensagem() {
    const texto = (el.querySelector('#cv-texto')?.value || '').trim();
    if (!texto) { toast('Escreva o texto da mensagem.', true); return; }
    state.ocupado = true;
    try {
      const r = await api('POST', `/api/t/${slug}/conversas/${state.abertaId}/mensagens`, { texto, direcao: state.direcao });
      state.rascunho = '';
      state.detalhe = await api('GET', `/api/t/${slug}/conversas/${state.abertaId}`);
      toast(r.duplicada ? 'Esta mensagem já estava registrada.' : (r.aviso || 'Mensagem registrada na conversa.'));
      await carregar();
    } catch (erro) {
      toast(erro.message || 'Não foi possível registrar a mensagem.', true);
    } finally {
      state.ocupado = false;
    }
  }

  async function criarConversa() {
    const valor = (id) => (el.querySelector(id)?.value || '').trim();
    const corpo = {
      canal: valor('#nv-canal'), nome: valor('#nv-nome'), email: valor('#nv-email'),
      telefone: valor('#nv-telefone'), assunto: valor('#nv-assunto'), texto: valor('#nv-texto'), direcao: 'entrada',
    };
    if (!corpo.email && !corpo.telefone) { toast('Informe o e-mail ou o telefone do cliente.', true); return; }
    try {
      const r = await api('POST', `/api/t/${slug}/conversas`, corpo);
      state.nova = false;
      toast('Conversa aberta.');
      await carregar();
      await abrir(r.conversa.id);
    } catch (erro) {
      toast(erro.message || 'Não foi possível abrir a conversa.', true);
    }
  }
}
