// Vigia diário: confere se o que devia sair hoje saiu (site, posts, calendário, Telegram, Bluesky, pauta). Só mostra; não refaz nada.
export async function render(el, ctx) {
  const { api, S, esc, toast, can, fmtDate } = ctx;
  const slug = S.tenant.slug;
  const podeConfig = can('tenant.manage');
  let d = null;
  let aberta = null;

  const EST = { ok: ['ok', 'Ok'], pendente: ['bad', 'Pendente'], na: ['', 'Não se aplica'] };
  const pill = ([cls, label]) => `<span class="pill ${cls}"><span class="dot"></span>${esc(label)}</span>`;

  async function carregar() { d = await api('GET', `/api/t/${slug}/vigia`); aberta = d.ultima; desenhar(); }

  function execHtml(x) {
    if (!x) return '<div class="empty">Nenhuma conferência ainda. Use "Conferir agora".</div>';
    return `<div class="card-head" style="flex-wrap:wrap"><h2>Conferência de ${esc(fmtDate(x.quando))}</h2>${x.pendencias ? pill(['bad', `${x.pendencias} pendência(s)`]) : pill(['ok', 'Tudo em dia'])}
        <span class="pill">${esc(x.origem === 'agenda' ? 'automática' : 'pedida no painel')}</span></div>
      <div style="display:grid;gap:10px">${x.itens.map((i) => `<div class="list-item" style="display:grid;gap:4px">
        <div class="row"><strong>${esc(i.nome)}</strong><span class="spacer"></span>${pill(EST[i.estado] || ['', i.estado])}</div>
        <div>${esc(i.detalhe)}</div>
        ${i.extras.length ? `<ul class="muted" style="margin:2px 0 0;padding-left:18px;font-size:12.5px">${i.extras.map((e) => `<li style="overflow-wrap:anywhere">${esc(e)}</li>`).join('')}</ul>` : ''}</div>`).join('')}</div>`;
  }

  function desenhar() {
    const c = d.config;
    el.innerHTML = `<p class="muted">O vigia só verifica e mostra. Ele não publica, não reenvia e não corrige nada sozinho: as pendências ficam aqui para você decidir.</p>
      <div class="card"><div class="row"><span class="muted">Conferência automática ${c.ativo ? `todo dia às <strong>${esc(c.hora)}</strong> (fuso ${esc(d.fuso)})` : 'desligada'}.</span><span class="spacer"></span>
        ${podeConfig ? `<label class="row" style="gap:6px"><input type="checkbox" id="vg-ativo" ${c.ativo ? 'checked' : ''}>automática</label>
          <input id="vg-hora" value="${esc(c.hora)}" style="max-width:90px"><button class="btn sm" type="button" id="vg-salvar">Salvar</button>` : ''}
        <button class="btn primary" type="button" id="vg-rodar">Conferir agora</button></div></div>
      <div class="card">${execHtml(aberta)}</div>
      <div class="card"><div class="card-head"><h2>Histórico</h2></div>
        ${d.historico.length ? `<div class="table-wrap"><table><thead><tr><th>Quando</th><th>Origem</th><th>Ok</th><th>Pendências</th><th></th></tr></thead><tbody>${d.historico.map((h) => `<tr>
          <td>${esc(fmtDate(h.quando))}</td><td class="muted">${esc(h.origem === 'agenda' ? 'automática' : 'manual')}</td><td class="mono">${esc(h.ok)}</td>
          <td>${h.pendencias ? pill(['bad', String(h.pendencias)]) : pill(['ok', '0'])}</td>
          <td class="row end"><button class="btn sm" type="button" data-ver="${esc(h.id)}" ${aberta?.id === h.id ? 'disabled' : ''}>Ver</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Sem histórico ainda.</div>'}</div>`;
    ligar();
  }

  const acao = (sel, fn) => el.querySelectorAll(sel).forEach((b) => b.addEventListener('click', async (e) => {
    const bt = e.currentTarget; bt.disabled = true;
    try { await fn(bt); } catch (err) { toast(err.message, true); } finally { bt.disabled = false; }
  }));

  function ligar() {
    acao('#vg-rodar', async () => {
      const r = await api('POST', `/api/t/${slug}/vigia/rodar`);
      toast(r.execucao.pendencias ? `${r.execucao.pendencias} pendência(s) encontrada(s).` : 'Tudo em dia.', Boolean(r.execucao.pendencias));
      d = await api('GET', `/api/t/${slug}/vigia`); aberta = r.execucao; desenhar();
    });
    acao('#vg-salvar', async () => {
      await api('PUT', `/api/t/${slug}/vigia/config`, { ativo: el.querySelector('#vg-ativo').checked, hora: el.querySelector('#vg-hora').value });
      toast('Horário do vigia salvo.'); await carregar();
    });
    acao('[data-ver]', async (b) => { aberta = (await api('GET', `/api/t/${slug}/vigia/${b.dataset.ver}`)).execucao; desenhar(); });
  }

  await carregar();
}
