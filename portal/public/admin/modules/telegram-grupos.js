// Robô do Telegram nos grupos: grupos que adicionaram o bot da operação, grade de torneios do dia e comandos de grupo.
// O token e o canal ficam em Integrações; aqui só a parte dos grupos.
export async function render(el, ctx) {
  const { api, S, esc, toast, can, fmtDate } = ctx;
  const slug = S.tenant.slug;
  const pode = can('integrations.manage');
  let d = null;

  const SIT = { ativo: ['ok', 'Recebe a grade'], pausado: ['warn', 'Pausado'], saiu: ['bad', 'Bot saiu'], migrou: ['', 'Virou supergrupo'] };
  const pill = ([cls, label]) => `<span class="pill ${cls}"><span class="dot"></span>${esc(label)}</span>`;

  async function carregar() { d = await api('GET', `/api/t/${slug}/telegram/grupos`); desenhar(); }

  function desenhar() {
    const c = d.config;
    const dis = pode ? '' : 'disabled';
    el.innerHTML = `<div class="card"><div class="card-head"><h2>Bot nos grupos</h2>${pill(d.conectado ? ['ok', 'Bot conectado'] : ['warn', d.estadoLabel])}
        ${d.gradeDisponivel ? pill(['ok', 'Grade de torneios ligada']) : pill(['warn', 'Grade aguardando o módulo de torneios'])}</div>
      <p class="muted">${esc(d.ajuda)}</p>
      ${d.conectado ? '' : `<p class="err">Conecte o bot em <a href="#/t/${esc(slug)}/integracoes">Integrações</a> (token, canal e "Testar") para ele responder nos grupos.</p>`}
      ${d.linkAdicionar ? `<div class="copy" style="margin:8px 0"><input readonly value="${esc(d.linkAdicionar)}"><button class="btn sm" type="button" data-copiar="${esc(d.linkAdicionar)}">Copiar link "adicionar ao grupo"</button></div>` : ''}
      <p class="muted" style="font-size:12.5px">Comandos no grupo: ${d.comandos.map(esc).join(', ')}. ${d.ultimaLeitura ? `Última leitura das mensagens: ${esc(fmtDate(d.ultimaLeitura))}.` : 'O bot ainda não leu mensagens desde que o servidor ligou.'}</p></div>
    <div class="card"><div class="card-head"><h2>Grade do dia</h2></div>
      <div class="grid2">
        <label class="row" style="gap:6px"><input type="checkbox" id="tg-grade" ${c.gradeAtiva ? 'checked' : ''} ${dis}>Mandar a grade nos grupos todo dia</label>
        <label class="field">Horário (fuso ${esc(d.fuso)})<input id="tg-hora" value="${esc(c.gradeHora)}" placeholder="09:00" ${dis}></label>
        <label class="field">Torneios em destaque<input id="tg-dest" type="number" min="3" max="15" value="${esc(c.destaques)}" ${dis}></label>
        <label class="row" style="gap:6px"><input type="checkbox" id="tg-canal" ${c.gradeNoCanal ? 'checked' : ''} ${dis}>Também no canal ${esc(d.canal || '')}</label>
      </div>
      ${pode ? `<div class="row end" style="margin-top:12px"><button class="btn" type="button" id="tg-salvar">Salvar</button>
        <button class="btn primary" type="button" id="tg-agora" ${d.conectado && d.gradeDisponivel ? '' : 'disabled'}>Mandar a grade de hoje agora</button></div>` : ''}
      <p class="muted" style="font-size:12.5px;margin-top:8px">Cada grupo recebe a grade uma vez por dia; mandar agora não repete para quem já recebeu. Quem adiciona o bot depois do horário já recebe a do dia.</p></div>
    <div class="card"><div class="card-head"><h2>Grupos</h2><span class="pill ok">${esc(d.contagem.ativos)} ativos</span><span class="pill warn">${esc(d.contagem.pausados)} pausados</span><span class="pill">${esc(d.contagem.receberamHoje)} receberam hoje</span></div>
      ${d.grupos.length ? `<div class="table-wrap"><table><thead><tr><th>Grupo</th><th>Situação</th><th>Última grade</th><th></th></tr></thead><tbody>${d.grupos.map((g) => `<tr>
        <td><strong>${esc(g.titulo || g.chatId)}</strong><div class="muted mono" style="font-size:12px">${esc(g.chatId)} · desde ${esc(fmtDate(g.desde))}</div>${g.ultimoErro ? `<div class="err">${esc(g.ultimoErro)}</div>` : ''}</td>
        <td>${pill(SIT[g.situacao] || ['', g.situacao])}</td><td class="muted">${esc(g.ultimaGrade ? g.ultimaGrade.split('-').reverse().join('/') : '—')}</td>
        <td class="row end">${pode && g.situacao === 'ativo' ? `<button class="btn sm" type="button" data-sit="${esc(g.id)}" data-para="pausado">Pausar</button>` : ''}
          ${pode && g.situacao === 'pausado' ? `<button class="btn sm" type="button" data-sit="${esc(g.id)}" data-para="ativo">Ativar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="empty">Nenhum grupo adicionou o bot ainda. Mande o link "adicionar ao grupo" para os administradores.</div>'}</div>`;
    ligar();
  }

  const acao = (sel, fn) => el.querySelectorAll(sel).forEach((b) => b.addEventListener('click', async (e) => {
    const bt = e.currentTarget; bt.disabled = true;
    try { await fn(bt); } catch (err) { toast(err.message, true); } finally { bt.disabled = false; }
  }));

  function ligar() {
    acao('#tg-salvar', async () => {
      d = await api('PUT', `/api/t/${slug}/telegram/grupos/config`, { gradeAtiva: el.querySelector('#tg-grade').checked, gradeHora: el.querySelector('#tg-hora').value,
        destaques: Number(el.querySelector('#tg-dest').value), gradeNoCanal: el.querySelector('#tg-canal').checked });
      toast('Configuração salva.'); desenhar();
    });
    acao('#tg-agora', async () => {
      const r = await api('POST', `/api/t/${slug}/telegram/grupos/grade`);
      toast(`Grade mandada para ${r.enviados} grupo(s)${r.canal ? ' e o canal' : ''}. ${r.nota}`); await carregar();
    });
    acao('[data-sit]', async (b) => { await api('PATCH', `/api/t/${slug}/telegram/grupos/${b.dataset.sit}`, { situacao: b.dataset.para }); await carregar(); });
    el.querySelectorAll('[data-copiar]').forEach((b) => b.addEventListener('click', async () => { await navigator.clipboard.writeText(b.dataset.copiar); toast('Link copiado.'); }));
  }

  await carregar();
}
