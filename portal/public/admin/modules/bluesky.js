// Cartão do Bluesky na tela de Integrações (desenhado por admin.js → viewIntegracoes). A senha de app só entra; nunca volta.
export async function cartao(el, ctx) {
  const { api, S, esc, toast, can, fmtDate } = ctx;
  const slug = S.tenant.slug;
  const pode = can('integrations.manage');
  const dis = pode ? '' : 'disabled';
  const quando = (iso) => (iso ? (fmtDate ? fmtDate(iso) : new Date(iso).toLocaleString('pt-BR')) : '—');
  const pill = (e, label) => `<span class="pill ${e === 'conectado' || e === 'enviado' ? 'ok' : e === 'erro' ? 'bad' : 'warn'}"><span class="dot"></span>${esc(label)}</span>`;
  const SIT = { pendente: 'Na fila', enviado: 'Enviado', erro: 'Erro' };
  let d;
  try { d = await api('GET', `/api/t/${slug}/bluesky`); } catch { el.innerHTML = ''; return; }

  const c = d.config;
  el.innerHTML = `<div class="card" id="card-bluesky"><div class="card-head"><h2>Bluesky</h2>${pill(d.estado, d.estadoLabel)}</div>
    <p class="muted">Posta cada post novo do blog (cartão com capa, título e resumo)${d.gradeDisponivel ? ' e a grade de torneios do dia' : ''} no perfil da operação. ${esc(d.ajuda)}</p>
    ${d.lastError ? `<p class="err">${esc(d.lastError)}</p>` : ''}
    ${d.perfil ? `<p class="muted" style="font-size:12.5px">Perfil: <a href="${esc(d.perfil)}" target="_blank" rel="noopener">${esc(d.perfil)}</a>${d.ativadoEm ? ` · ligado em ${esc(quando(d.ativadoEm))} (só posts publicados depois disso vão para o perfil)` : ''}</p>` : ''}
    <div class="row" style="flex-wrap:wrap;gap:10px">
      <label class="field" style="min-width:240px">Usuário (handle)<input id="bs-handle" value="${esc(c.handle)}" placeholder="meuclube.bsky.social" ${dis}></label>
      <label class="field" style="min-width:220px">Senha de app<input id="bs-senha" type="password" autocomplete="new-password" placeholder="${d.senhaGravada ? 'gravada · deixe vazio para manter' : 'xxxx-xxxx-xxxx-xxxx'}" ${dis}></label>
      <label class="field" style="min-width:110px">Grade às<input id="bs-hora" value="${esc(c.gradeHora)}" ${dis}></label>
    </div>
    <div class="row" style="gap:14px;margin-top:8px"><label class="row" style="gap:6px"><input type="checkbox" id="bs-blog" ${c.postarBlog ? 'checked' : ''} ${dis}>Posts do blog</label>
      <label class="row" style="gap:6px"><input type="checkbox" id="bs-grade" ${c.postarGrade ? 'checked' : ''} ${dis}>Grade do dia${d.gradeDisponivel ? '' : ' (aguardando o módulo de torneios)'}</label></div>
    ${pode ? `<div class="row" style="gap:8px;margin-top:10px"><button class="btn primary" type="button" id="bs-gravar">Gravar</button><button class="btn" type="button" id="bs-teste">Testar</button>
      <button class="btn" type="button" id="bs-enviar" ${d.conectado ? '' : 'disabled'}>Enviar pendentes agora</button></div>` : ''}
    ${d.envios.length ? `<details style="margin-top:12px"><summary>Últimos envios (${d.envios.length})</summary><div class="table-wrap"><table><tbody>${d.envios.map((e) => `<tr>
      <td><strong>${esc(e.tipo === 'grade' ? `Grade de ${e.ref}` : e.titulo || e.ref)}</strong>${e.erro ? `<div class="err">${esc(e.erro)}</div>` : ''}</td>
      <td>${pill(e.situacao, SIT[e.situacao] || e.situacao)}</td><td class="muted">${esc(quando(e.enviadoEm || e.criadoEm))}</td>
      <td class="row end">${pode && e.situacao === 'erro' ? `<button class="btn sm" type="button" data-repetir="${esc(e.id)}">Tentar de novo</button>` : ''}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
  </div>`;

  const corpo = () => {
    const b = { handle: el.querySelector('#bs-handle').value.trim(), gradeHora: el.querySelector('#bs-hora').value.trim(),
      postarBlog: el.querySelector('#bs-blog').checked, postarGrade: el.querySelector('#bs-grade').checked };
    const senha = el.querySelector('#bs-senha').value.trim();
    if (senha) b.senha = senha;
    return b;
  };
  const acao = (sel, fn) => el.querySelectorAll(sel).forEach((b) => b.addEventListener('click', async (e) => {
    const bt = e.currentTarget; bt.disabled = true;
    try { await fn(bt); } catch (err) { toast(err.message, true); } finally { bt.disabled = false; }
  }));
  const recarregar = () => cartao(el, ctx);
  acao('#bs-gravar', async () => { const r = await api('PUT', `/api/t/${slug}/bluesky`, corpo()); toast(r.nota || 'Bluesky gravado.'); await recarregar(); });
  acao('#bs-teste', async () => {
    if (el.querySelector('#bs-senha').value.trim()) await api('PUT', `/api/t/${slug}/bluesky`, corpo()); // senha colada e não gravada: grava antes de testar
    const r = await api('POST', `/api/t/${slug}/bluesky/teste`);
    toast(r.detalhe || (r.ok ? 'Conectado.' : 'O teste falhou.'), !r.ok); await recarregar();
  });
  acao('#bs-enviar', async () => { const r = await api('POST', `/api/t/${slug}/bluesky/enviar`); toast(`${r.enviados} enviado(s)${r.erros ? `, ${r.erros} com erro` : ''}.`, Boolean(r.erros)); await recarregar(); });
  acao('[data-repetir]', async (b) => { await api('POST', `/api/t/${slug}/bluesky/envios/${b.dataset.repetir}/repetir`); toast('Envio de volta à fila.'); await recarregar(); });
}
