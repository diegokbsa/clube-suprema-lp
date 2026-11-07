// Pauta automática: fila de temas, horários e modo de entrada dos posts que o redator externo entrega por API.
// O painel não escreve post nenhum: só guarda a fila e mostra o que o redator entregou ou pulou.
export async function render(el, ctx) {
  const { api, S, esc, toast, can, fmtDate } = ctx;
  const slug = S.tenant.slug;
  const podeEditar = can('blog.edit');
  const podeLigar = can('blog.publish');
  let d = null;

  const SIT = { fila: ['', 'Na fila'], reservado: ['info', 'Com o redator'], entregue: ['ok', 'Entregue'], pulado: ['warn', 'Pulado'] };
  const POST = { publicado: ['ok', 'Publicado'], agendado: ['info', 'Agendado'], revisao: ['warn', 'Em revisão'], rascunho: ['', 'Rascunho'] };
  const pill = ([cls, label]) => `<span class="pill ${cls}"><span class="dot"></span>${esc(label)}</span>`;
  const quando = (iso) => (iso ? (fmtDate ? fmtDate(iso) : new Date(iso).toLocaleString('pt-BR')) : '—');

  async function carregar() { d = await api('GET', `/api/t/${slug}/pauta`); desenhar(); }

  function configHtml() {
    const c = d.config;
    const dis = podeLigar ? '' : 'disabled';
    return `<div class="card"><div class="card-head"><h2>Publicação automática</h2>${pill(c.ativo ? ['ok', 'Ligada'] : ['warn', 'Desligada'])}</div>
      <p class="muted">Nos horários abaixo (fuso ${esc(d.fuso)}), o redator externo pega o próximo tema da fila e entrega o post pronto.
        ${d.proximo ? `Próximo horário livre: <strong>${esc(d.proximo.local)}</strong>.` : ''}</p>
      <div class="grid2">
        <label class="field">Horários<input id="pa-horarios" value="${esc(c.horarios)}" placeholder="12:00, 15:00, 18:00" ${dis}></label>
        <label class="field">Quando o post chega<select id="pa-modo" ${dis}>
          <option value="agendar" ${c.modo === 'agendar' ? 'selected' : ''}>Agenda e publica sozinho no horário</option>
          <option value="revisao" ${c.modo === 'revisao' ? 'selected' : ''}>Fica em revisão (eu publico no Blog)</option></select></label>
        <label class="field">Site do blog<select id="pa-site" ${dis}><option value="">Primeiro site do construtor</option>
          ${d.sites.map((s) => `<option value="${esc(s.id)}" ${c.siteId === s.id ? 'selected' : ''}>${esc(s.nome)}${s.externo ? ' (externo)' : ''}</option>`).join('')}</select></label>
        <label class="field">Autor<input id="pa-autor" value="${esc(c.autor)}" placeholder="Equipe ${esc(S.tenant.name)}" ${dis}></label>
        <label class="field">Categoria padrão<input id="pa-cat" value="${esc(c.categoria)}" ${dis}></label>
        <label class="field">Mínimo de temas na fila<input id="pa-min" type="number" min="1" max="200" value="${esc(c.minimoTemas)}" ${dis}></label>
      </div>
      ${d.avisos.length ? `<ul class="muted" style="margin:12px 0 0;padding-left:18px">${d.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
      ${podeLigar ? `<div class="row end" style="margin-top:12px"><button class="btn" type="button" id="pa-salvar">Salvar</button>
        <button class="btn primary" type="button" id="pa-ligar">${c.ativo ? 'Desligar' : 'Ligar'} a automação</button></div>` : ''}
      <details style="margin-top:12px"><summary>Endereços do redator</summary>
        <p class="muted" style="font-size:12.5px">Autenticação: <span class="mono">Authorization: Bearer &lt;token de serviço&gt;</span>. Instrução completa em <span class="mono">${esc(d.redator.instrucao)}</span>.</p>
        ${['lista', 'proximo', 'entregar', 'pular'].map((k) => `<div class="copy" style="margin-top:6px"><input readonly value="${esc(d.redator[k])}"><button class="btn sm" type="button" data-copiar="${esc(d.redator[k])}">Copiar</button></div>`).join('')}
      </details></div>`;
  }

  function filaHtml() {
    const novo = podeEditar ? `<label class="field">Novos temas (um por linha)<textarea id="pa-novos" rows="4" placeholder="O que é straddle no poker&#10;Como funciona o side pot"></textarea></label>
      <div class="row end" style="margin-top:8px"><button class="btn primary" type="button" id="pa-incluir">Incluir na fila</button></div>` : '';
    const linhas = d.temas.map((t, i) => `<tr><td class="mono" style="width:36px">${i + 1}</td>
      <td><strong>${esc(t.tema)}</strong>${t.notas ? `<div class="muted" style="font-size:12.5px">${esc(t.notas)}</div>` : ''}
        ${t.situacao === 'reservado' ? `<div class="muted" style="font-size:12.5px">Para ${esc(t.horarioLocal || '')} · reserva até ${esc(quando(t.reservadoAte))}</div>` : ''}</td>
      <td>${pill(SIT[t.situacao] || ['', t.situacao])}</td>
      <td class="row end" style="gap:4px">${podeEditar ? `
        <button class="btn sm icon" type="button" data-mover="${esc(t.id)}" data-para="topo" title="Para o topo">⇑</button>
        <button class="btn sm icon" type="button" data-mover="${esc(t.id)}" data-para="cima" title="Subir">↑</button>
        <button class="btn sm icon" type="button" data-mover="${esc(t.id)}" data-para="baixo" title="Descer">↓</button>
        <button class="btn sm" type="button" data-editar="${esc(t.id)}">Editar</button>
        ${t.situacao === 'reservado' ? `<button class="btn sm" type="button" data-devolver="${esc(t.id)}">Soltar</button>` : `<button class="btn sm icon danger" type="button" data-apagar="${esc(t.id)}" title="Remover">×</button>`}` : ''}</td></tr>`).join('');
    return `<div class="card"><div class="card-head"><h2>Fila de temas</h2><span class="pill">${esc(d.contagem.fila)} na fila</span></div>
      ${novo}
      ${d.temas.length ? `<div class="table-wrap" style="margin-top:12px"><table><tbody>${linhas}</tbody></table></div>` : '<div class="empty" style="margin-top:12px">A fila está vazia. Inclua temas para o redator.</div>'}</div>`;
  }

  function historicoHtml() {
    if (!d.historico.length) return '<div class="card"><div class="card-head"><h2>Entregues e pulados</h2></div><div class="empty">Nada entregue ainda.</div></div>';
    return `<div class="card"><div class="card-head"><h2>Entregues e pulados</h2><span class="pill ok">${esc(d.contagem.entregues)} entregues</span><span class="pill warn">${esc(d.contagem.pulados)} pulados</span></div>
      <div class="table-wrap"><table><thead><tr><th>Tema</th><th>Horário</th><th>Resultado</th><th></th></tr></thead><tbody>${d.historico.map((t) => `<tr>
        <td><strong>${esc(t.tema)}</strong>${t.post ? `<div class="muted" style="font-size:12.5px">${esc(t.post.titulo)}</div>` : ''}${t.motivo ? `<div class="muted" style="font-size:12.5px">${esc(t.motivo)}</div>` : ''}</td>
        <td class="muted">${esc(t.horarioLocal || quando(t.entregueEm))}</td>
        <td>${t.post ? pill(POST[t.post.situacao] || ['', t.post.situacao]) : pill(SIT[t.situacao] || ['', t.situacao])}</td>
        <td class="row end">${t.situacao === 'pulado' && podeEditar ? `<button class="btn sm" type="button" data-devolver="${esc(t.id)}">Voltar à fila</button>` : ''}
          ${t.post ? `<a class="btn sm" href="#/t/${esc(slug)}/m/blog">Abrir no Blog</a>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  function desenhar() {
    el.innerHTML = `<p class="muted">O redator (tarefa agendada) entrega o post pronto por API com o token de serviço; o portal não chama IA.
      O texto passa pelo preflight: com promessa de ganho, bônus ou menor de idade, o post fica em revisão.</p>
      <div class="kpis"><div class="kpi"><b>${esc(d.contagem.fila)}</b><span>temas na fila</span></div>
        <div class="kpi"><b>${esc(d.contagem.reservados)}</b><span>com o redator</span></div>
        <div class="kpi"><b>${esc(d.contagem.entregues)}</b><span>entregues</span></div>
        <div class="kpi"><b>${esc(d.proximo ? d.proximo.local : '—')}</b><span>próximo horário livre</span></div></div>
      ${configHtml()}${filaHtml()}${historicoHtml()}`;
    ligar();
  }

  const acao = (sel, fn) => el.querySelectorAll(sel).forEach((b) => b.addEventListener('click', async (e) => {
    const bt = e.currentTarget; bt.disabled = true;
    try { await fn(bt); } catch (err) { toast(err.message, true); } finally { bt.disabled = false; }
  }));

  function configDaTela() {
    return { horarios: el.querySelector('#pa-horarios').value, modo: el.querySelector('#pa-modo').value, siteId: el.querySelector('#pa-site').value || null,
      autor: el.querySelector('#pa-autor').value, categoria: el.querySelector('#pa-cat').value, minimoTemas: Number(el.querySelector('#pa-min').value) };
  }

  function ligar() {
    acao('#pa-salvar', async () => { d = await api('PUT', `/api/t/${slug}/pauta/config`, configDaTela()); toast('Configuração salva.'); desenhar(); });
    acao('#pa-ligar', async () => { d = await api('PUT', `/api/t/${slug}/pauta/config`, { ...configDaTela(), ativo: !d.config.ativo }); toast(d.config.ativo ? 'Automação ligada.' : 'Automação desligada.'); desenhar(); });
    acao('#pa-incluir', async () => {
      const r = await api('POST', `/api/t/${slug}/pauta/temas`, { texto: el.querySelector('#pa-novos').value });
      toast(`${r.criados} tema(s) incluído(s)${r.repetidos ? `, ${r.repetidos} já estavam na fila` : ''}.`); await carregar();
    });
    acao('[data-mover]', async (b) => { await api('POST', `/api/t/${slug}/pauta/temas/${b.dataset.mover}/mover`, { para: b.dataset.para }); await carregar(); });
    acao('[data-apagar]', async (b) => { if (!confirm('Remover este tema da fila?')) return; await api('DELETE', `/api/t/${slug}/pauta/temas/${b.dataset.apagar}`); await carregar(); });
    acao('[data-devolver]', async (b) => { await api('PATCH', `/api/t/${slug}/pauta/temas/${b.dataset.devolver}`, { devolver: true }); toast('Tema de volta à fila.'); await carregar(); });
    acao('[data-editar]', async (b) => {
      const t = d.temas.find((x) => x.id === b.dataset.editar);
      const tema = prompt('Tema:', t?.tema || '');
      if (tema === null) return;
      const notas = prompt('Notas para o redator (opcional):', t?.notas || '');
      await api('PATCH', `/api/t/${slug}/pauta/temas/${b.dataset.editar}`, { tema, ...(notas !== null ? { notas } : {}) });
      await carregar();
    });
    el.querySelectorAll('[data-copiar]').forEach((b) => b.addEventListener('click', async () => { await navigator.clipboard.writeText(b.dataset.copiar); toast('Copiado.'); }));
  }

  await carregar();
}
