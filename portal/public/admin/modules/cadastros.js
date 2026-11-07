// Cadastros no app e fichas: quem criou o acesso pela jornada (passos conta_app / entrar_clube / fichas24h),
// em que etapa está, o ID do app informado e a comparação A/B. A senha nunca aparece: ela nem é gravada.
export async function render(el, ctx) {
  const { api, S, esc, toast, can, fmtDate } = ctx;
  const slug = S.tenant.slug;
  const ST = { em_andamento: ['Em andamento', 'info'], aguardando_jogador: ['Esperando o jogador', 'warn'], pronto: ['Conta pronta', 'ok'], falhou: ['Falhou', 'bad'] };
  const NEEDS = { entrar_clube: 'entrar no clube pelo app e informar o ID' };
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  const d = await api('GET', `/api/t/${slug}/cadastros`);
  const f = d.funil;
  el.innerHTML = `<p class="muted">Cadastros feitos pela jornada "Cadastro no app + Fichas 24h guiado" (Jornadas e teste A/B). Cada um é também um lead no CRM, com a variante e as UTMs.
      A senha fica só na memória do servidor por ${esc(d.senhaTtlMin)} minutos e nunca é gravada; CPF, celular e nascimento do Fichas 24h ficam só no aparelho do jogador.</p>
    <div class="kpis"><div class="kpi"><b>${f.cadastros}</b><span>cadastros</span></div><div class="kpi"><b>${f.aguardando}</b><span>esperando o jogador</span></div>
      <div class="kpi"><b>${f.comId}</b><span>com ID do app</span></div><div class="kpi"><b>${f.prontos}</b><span>contas prontas</span></div><div class="kpi"><b>${f.falhas}</b><span>falhas</span></div></div>
    ${d.porVariante.length ? `<div class="card"><div class="card-head"><h2>Por jornada e variante</h2></div><div class="table-wrap"><table><thead><tr><th>Jornada</th><th>Variante</th><th>Cadastros</th><th>Com ID</th><th>Prontos</th><th>Chegaram a pronto</th></tr></thead><tbody>
      ${d.porVariante.map((g) => `<tr><td>${esc(g.journeyName)}</td><td><strong>${esc(String(g.variant || '').toUpperCase())}</strong></td><td>${g.cadastros}</td><td>${g.comId}</td><td>${g.prontos}</td><td>${pct(g.prontos, g.cadastros)}</td></tr>`).join('')}
    </tbody></table></div><p class="muted" style="font-size:12.5px">A compra de fichas acontece no sistema de fichas (modo guiado): confira os depósitos no painel do clube.</p></div>` : ''}
    <div class="card"><div class="card-head"><h2>Últimos cadastros</h2></div>${d.cadastros.length ? `<div class="table-wrap"><table><thead><tr><th>Quando</th><th>E-mail</th><th>Variante</th><th>Etapas</th><th>ID do app</th><th>Situação</th></tr></thead><tbody>
      ${d.cadastros.map((c) => `<tr data-c="${esc(c.id)}"><td class="muted">${esc(fmtDate(c.createdAt))}</td><td>${esc(c.email)}<div class="muted" style="font-size:12px">${esc(c.journeyName || '')}</div></td>
        <td>${esc(String(c.variant || '').toUpperCase())}</td>
        <td style="font-size:12.5px">${c.steps.map((s) => `<div>${s.state === 'ok' ? '✓' : s.state === 'erro' ? '!' : '·'} ${esc(s.label)}</div>`).join('')}</td>
        <td>${c.idApp ? `<code>${esc(c.idApp)}</code>` : can('leads.edit') && c.needs === 'entrar_clube' ? `<div class="row" style="gap:6px"><input data-id inputmode="numeric" placeholder="ID" style="max-width:110px"><button class="btn sm" type="button" data-salvar>Salvar</button></div>` : '<span class="muted">—</span>'}</td>
        <td>${(([t, k]) => `<span class="pill ${k}">${esc(t)}</span>`)(ST[c.status] || [c.status, ''])}${c.needs ? `<div class="muted" style="font-size:12px">falta ${esc(NEEDS[c.needs] || c.needs)}</div>` : ''}${c.error ? `<div class="err" style="font-size:12px">${esc(c.error)}</div>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">Nenhum cadastro ainda. Crie a jornada pelo modelo "Cadastro no app + Fichas 24h guiado", inicie o teste e coloque o bloco numa página publicada.</div>'}</div>`;
  el.querySelectorAll('[data-salvar]').forEach((b) => b.addEventListener('click', async () => {
    const tr = b.closest('tr');
    b.disabled = true;
    try {
      await api('POST', `/api/t/${slug}/cadastros/${tr.dataset.c}/id-app`, { idApp: tr.querySelector('[data-id]').value });
      toast('ID salvo.');
      await render(el, ctx);
    } catch (e) { toast(e.message, true); b.disabled = false; }
  }));
}
