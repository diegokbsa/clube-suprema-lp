// Cartão "Planilha do Google" na tela de Integrações: URL do app da Web (só entra, nunca volta inteira),
// teste, reenvio dos que falharam e o estado real dos envios. Chamado por viewIntegracoes em admin.js.
export async function renderCartao(el, ctx) {
  const { api, S, esc, toast, can, fmtDate } = ctx;
  const slug = S.tenant.slug;
  const pode = can('integrations.manage');
  let d;
  try { d = await api('GET', `/api/t/${slug}/planilha`); } catch { el.innerHTML = ''; return; }

  function desenhar() {
    const cls = d.estado === 'conectado' ? 'ok' : d.estado === 'erro' ? 'bad' : 'warn';
    const dis = pode ? '' : 'disabled';
    el.innerHTML = `<div class="card" id="card-planilha"><div class="card-head"><h2>Planilha do Google</h2><span class="pill ${cls}"><span class="dot"></span>${esc(d.estadoLabel)}</span></div>
      <p class="muted">Cada lead novo desta operação ganha uma linha na planilha (Apps Script), com as UTMs e a variante da jornada na coluna de indicação (jornada-a, jornada-b). Se a planilha falhar, o lead continua salvo no CRM.</p>
      <p class="muted" style="font-size:12.5px">${esc(d.ajuda)}</p>
      ${d.lastError ? `<p class="err">${esc(d.lastError)}</p>` : ''}
      <div class="row" style="flex-wrap:wrap;gap:10px">
        <label class="field" style="min-width:360px;flex:1">URL do app da Web<input id="pl-url" type="url" autocomplete="off" placeholder="${d.temUrl ? `guardada (${esc(d.urlMascarada || '')}) · cole outra só para trocar` : 'https://script.google.com/macros/s/…/exec'}" ${dis}></label>
      </div>
      <div class="row" style="gap:8px;margin-top:10px"><button class="btn primary" type="button" id="pl-gravar" ${dis}>Gravar</button>
        <button class="btn" type="button" id="pl-teste" ${pode && d.temUrl ? '' : 'disabled'}>Testar</button>
        <button class="btn" type="button" id="pl-reenviar" ${pode && d.temUrl && d.envios.erros ? '' : 'disabled'}>Reenviar os que falharam (${d.envios.erros})</button>
        ${d.temUrl && pode ? '<button class="btn danger" type="button" id="pl-remover">Remover</button>' : ''}</div>
      <p class="muted" style="margin-top:10px;font-size:12.5px">${d.envios.salvos} lead(s) salvo(s) · ${d.envios.erros} com erro${d.lastCheck ? ` · última verificação ${esc(fmtDate(d.lastCheck))}` : ''}</p>
      ${d.envios.ultimos.length ? `<details><summary>Últimos envios</summary><div class="table-wrap"><table><tbody>${d.envios.ultimos.map((e) => `<tr><td class="muted">${esc(fmtDate(e.em || e.criado))}</td>
        <td><span class="pill ${e.status === 'salvo' ? 'ok' : e.status === 'erro' ? 'bad' : ''}">${esc(e.status || '')}</span></td><td class="muted" style="font-size:12.5px">${esc(e.detalhe || '')}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
    </div>`;
    const acao = (sel, fn) => el.querySelector(sel)?.addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try { await fn(); } catch (err) { toast(err.message, true); b.disabled = false; }
    });
    acao('#pl-gravar', async () => { d = await api('PUT', `/api/t/${slug}/planilha`, { url: el.querySelector('#pl-url').value.trim() }); toast(d.nota); desenhar(); });
    acao('#pl-teste', async () => { d = await api('POST', `/api/t/${slug}/planilha/teste`); toast(d.detalhe, !d.ok); desenhar(); });
    acao('#pl-reenviar', async () => { d = await api('POST', `/api/t/${slug}/planilha/reenviar`); toast(`${d.salvos} de ${d.tentados} reenviado(s).`); desenhar(); });
    acao('#pl-remover', async () => {
      if (!confirm('Apagar a URL da planilha? Os próximos leads não vão mais para lá.')) { desenhar(); return; }
      d = await api('DELETE', `/api/t/${slug}/planilha`); toast(d.nota); desenhar();
    });
  }
  desenhar();
}
