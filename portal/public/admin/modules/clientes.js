// Clientes da operação: as pessoas que chegaram por ela (base única; outras operações não aparecem).
export async function render(el, ctx) {
  const { api, S, esc, fmtDate } = ctx;
  const slug = S.tenant.slug;
  const id = new URLSearchParams(location.hash.split('?')[1] || '').get('c');
  if (id) return detalhe(id);
  return lista('');

  async function lista(q) {
    const d = await api('GET', `/api/t/${slug}/clientes${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    el.innerHTML = `<p class="muted">Pessoas que chegaram por esta operação. A mesma pessoa existe uma vez na base; aqui só aparece o que ela fez com vocês.</p>
      <div class="card"><div class="row"><input id="cq" placeholder="Buscar por nome, e-mail ou telefone" value="${esc(q)}" style="max-width:340px"><button class="btn" type="button" id="cbusca">Buscar</button><span class="spacer"></span><span class="pill">${d.total} clientes</span></div></div>
      <div class="card">${d.clientes.length ? `<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Contato</th><th>Etapa</th><th>Origem</th><th>Entradas</th><th>Último contato</th></tr></thead><tbody>
        ${d.clientes.map((c) => `<tr><td><a href="#/t/${esc(slug)}/m/clientes?c=${esc(c.id)}"><strong>${esc(c.name || '(sem nome)')}</strong></a></td><td class="muted">${esc(c.email || '')}${c.phone ? `<br>${esc(c.phone)}` : ''}</td>
          <td><span class="pill">${esc(c.etapa || '')}</span></td><td>${esc(c.origem || 'direto')}</td><td>${c.leads}</td><td class="mono">${fmtDate(c.ultimo)}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="empty">Nenhum cliente ainda. Os formulários e as jornadas do site criam os clientes aqui.</div>'}</div>`;
    const go = () => lista(el.querySelector('#cq').value);
    el.querySelector('#cbusca').addEventListener('click', go);
    el.querySelector('#cq').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }

  async function detalhe(cid) {
    const d = await api('GET', `/api/t/${slug}/clientes/${cid}`);
    const c = d.cliente;
    el.innerHTML = `<p><a href="#/t/${esc(slug)}/m/clientes">← Clientes</a></p>
      <div class="card"><h2>${esc(c.name || '(sem nome)')}</h2><p class="muted">${esc(c.email || '')}${c.phone ? ` · ${esc(c.phone)}` : ''}</p></div>
      <div class="grid2"><div class="card"><div class="card-head"><h2>Entradas nesta operação</h2></div><div class="table-wrap"><table><tbody>
        ${d.leads.map((l) => `<tr><td class="mono">${fmtDate(l.criado)}</td><td><span class="pill">${esc(l.etapa)}</span></td><td>${esc(l.utm.utm_source || 'direto')}${l.utm.variante ? ` · jornada ${esc(l.utm.variante.toUpperCase())}` : ''}</td><td class="muted">/${esc(l.pagina || '')}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><div class="card-head"><h2>Conversões</h2></div>${d.conversoes.length ? `<div class="table-wrap"><table><tbody>${d.conversoes.map((v) => `<tr><td class="mono">${fmtDate(v.quando)}</td><td>${esc(v.tipo)}</td><td>${(v.valor / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td><td>${v.verificada ? '<span class="pill ok">verificada</span>' : '<span class="pill warn">não verificada</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Sem conversões.</div>'}</div></div>
      <div class="card"><div class="card-head"><h2>Histórico</h2></div>${d.eventos.length ? `<div class="table-wrap"><table><tbody>${d.eventos.map((e) => `<tr><td class="mono">${fmtDate(e.created_at)}</td><td>${esc(e.kind)}</td><td class="muted">${esc(JSON.stringify(e.data)).slice(0, 160)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Sem histórico.</div>'}</div>`;
  }
}
