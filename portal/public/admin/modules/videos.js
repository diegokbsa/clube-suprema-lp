// Vídeos curtos: fila por operação (vídeo, legenda, canais e horário) e o estado real de cada envio.
// Quem posta é o executor externo (API com token de serviço); esta tela nunca marca nada como publicado sozinha.
export async function render(el, ctx) {
  const { api, S, esc, toast, can, fmtDate } = ctx;
  const slug = S.tenant.slug;
  const pode = can('calendar.edit');
  const ST = { pendente: ['Na fila', ''], reservado: ['Publicando', 'info'], publicado: ['Publicado', 'ok'], erro: ['Erro', 'bad'] };
  const SIT = { agendado: ['Agendado', 'info'], na_fila: ['Na fila', 'warn'], publicando: ['Publicando', 'info'], parcial: ['Parcial', 'warn'], publicado: ['Publicado', 'ok'], erro: ['Com erro', 'bad'], cancelado: ['Cancelado', ''] };
  const pill = ([t, c]) => `<span class="pill ${c}">${esc(t)}</span>`;
  const local = (iso) => { const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  let d;

  async function carregar() { d = await api('GET', `/api/t/${slug}/videos`); desenhar(); }

  async function enviarArquivo(id, file) {
    const r = await fetch(`/envio-video/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`, { method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': file.type || 'video/mp4', 'X-CSRF': S.csrf, Accept: 'application/json' }, body: file });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Não deu para enviar o vídeo.');
    return j;
  }

  function form() {
    if (!pode) return '';
    return `<div class="card"><div class="card-head"><h2>Novo vídeo na fila</h2></div>
      <div class="grid2">
        <label class="field">Título (até 100)<input id="v-titulo" maxlength="100" placeholder="All-in e side pot: como funciona #shorts"></label>
        <label class="field">Identificador do roteiro (opcional)<input id="v-ref" maxlength="80" placeholder="all-in-e-side-pot"></label>
        <label class="field">Publicar a partir de<input id="v-quando" type="datetime-local" value="${esc(local(new Date().toISOString()))}"></label>
        <div class="field">Canais<div class="row" style="gap:12px;flex-wrap:wrap">${Object.entries(d.canais).map(([k, l]) => `<label class="check" style="white-space:nowrap"><input type="checkbox" data-canal="${esc(k)}" ${k !== 'tiktok' ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div></div>
      </div>
      <label class="field">Legenda / descrição<textarea id="v-legenda" maxlength="4900" rows="4"></textarea></label>
      <label class="field">Legenda própria do Instagram (opcional)<textarea id="v-legenda-ig" maxlength="2200" rows="2"></textarea></label>
      <div class="grid2">
        <label class="field">Enviar o arquivo (até ${esc(d.maxMb)} MB)<input id="v-arquivo" type="file" accept="video/mp4,video/quicktime,video/webm"></label>
        <label class="field">…ou endereço do vídeo (https ou caminho no executor)<input id="v-url" placeholder="data/shorts/all-in-e-side-pot.mp4"></label>
      </div>
      <p class="err" id="v-err"></p><div class="row end"><button class="btn primary" type="button" id="v-criar">Pôr na fila</button></div></div>`;
  }

  function lista() {
    if (!d.videos.length) return '<div class="card"><div class="empty">Nenhum vídeo na fila ainda.</div></div>';
    return `<div class="card"><div class="card-head"><h2>Fila</h2></div><div class="table-wrap"><table><thead><tr><th>Quando</th><th>Vídeo</th><th>Arquivo</th><th>Canais</th><th>Situação</th><th></th></tr></thead><tbody>
      ${d.videos.map((v) => `<tr data-v="${esc(v.id)}"><td class="muted">${esc(fmtDate(v.agendadoPara))}</td>
        <td><strong>${esc(v.titulo)}</strong>${v.ref ? `<div class="muted" style="font-size:12px">${esc(v.ref)}</div>` : ''}<div class="muted" style="font-size:12px;max-width:340px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(v.legenda)}</div></td>
        <td class="muted" style="font-size:12.5px">${v.arquivo.enviado ? `no portal · ${Math.round((v.arquivo.bytes || 0) / 1024 / 1024 * 10) / 10} MB` : v.arquivo.url ? esc(v.arquivo.url) : '<span class="pill warn">sem arquivo</span>'}
          ${pode && !v.envios.some((e) => ['publicado', 'reservado'].includes(e.status)) ? `<div><label class="btn sm" style="margin-top:4px">Enviar arquivo<input type="file" accept="video/mp4,video/quicktime,video/webm" data-up="${esc(v.id)}" hidden></label></div>` : ''}</td>
        <td>${v.envios.map((e) => `<div style="margin-bottom:4px">${esc(e.label)} ${pill(ST[e.status] || [e.status, ''])}${e.postUrl ? ` <a href="${esc(e.postUrl)}" target="_blank" rel="noopener">ver post ↗</a>` : ''}
          ${e.erro ? `<div class="err" style="font-size:12px">${esc(e.erro)}</div>` : ''}${e.status === 'erro' && pode ? ` <button class="btn sm" type="button" data-repetir="${esc(e.canal)}">Repetir</button>` : ''}</div>`).join('')}</td>
        <td>${pill(SIT[v.situacao] || [v.situacao, ''])}</td>
        <td class="row end">${pode && !v.cancelado && v.situacao !== 'publicado' ? '<button class="btn sm" type="button" data-cancelar>Cancelar</button>' : ''}${pode && v.cancelado ? '<button class="btn sm" type="button" data-reativar>Reativar</button>' : ''}
          ${pode && !v.envios.some((e) => ['publicado', 'reservado'].includes(e.status)) ? '<button class="btn sm danger" type="button" data-apagar>Apagar</button>' : ''}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  }

  function desenhar() {
    const c = d.contagem;
    el.innerHTML = `<p class="muted">Fila dos vídeos curtos desta operação. Quem publica é o executor (o PC que fala com o celular), pela API com o token de serviço: ele pega o próximo vídeo devido e devolve publicado (com o link) ou erro. Nada aparece como publicado sem o executor confirmar.</p>
      <div class="kpis"><div class="kpi"><b>${c.pendentes}</b><span>na fila</span></div><div class="kpi"><b>${c.reservados}</b><span>publicando</span></div><div class="kpi"><b>${c.publicados}</b><span>publicados</span></div><div class="kpi"><b>${c.erros}</b><span>com erro</span></div></div>
      <div class="card"><div class="card-head"><h2>Executor</h2><span class="pill ${d.executor.ultimo ? 'ok' : 'warn'}">${d.executor.ultimo ? `último contato ${esc(fmtDate(d.executor.ultimo))}` : 'nenhum contato ainda'}</span></div>
        <p class="muted" style="font-size:12.5px;overflow-wrap:anywhere">POST <code>${esc(d.executor.reservar)}</code> com <code>Authorization: Bearer &lt;token de serviço&gt;</code> e <code>{"canal":"youtube","operacao":"${esc(d.executor.operacao)}"}</code>. Uma reserva vale ${esc(d.reservaMin)} min. Guia: <code>${esc(d.executor.guia)}</code>.</p></div>
      ${form()}${lista()}`;

    el.querySelector('#v-criar')?.addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      const err = el.querySelector('#v-err'); err.textContent = '';
      try {
        const file = el.querySelector('#v-arquivo').files[0];
        const quando = el.querySelector('#v-quando').value;
        const r = await api('POST', `/api/t/${slug}/videos`, { titulo: el.querySelector('#v-titulo').value, ref: el.querySelector('#v-ref').value.trim() || undefined,
          legenda: el.querySelector('#v-legenda').value, legendaInstagram: el.querySelector('#v-legenda-ig').value, arquivoUrl: el.querySelector('#v-url').value.trim() || undefined,
          agendadoPara: quando ? new Date(quando).toISOString() : undefined, canais: [...el.querySelectorAll('[data-canal]:checked')].map((i) => i.dataset.canal) });
        if (file) { b.textContent = 'Enviando o vídeo…'; await enviarArquivo(r.video.id, file); }
        toast('Vídeo na fila.');
        await carregar();
      } catch (e) { err.textContent = e.message; b.disabled = false; b.textContent = 'Pôr na fila'; }
    });
    el.querySelectorAll('[data-up]').forEach((i) => i.addEventListener('change', async () => {
      if (!i.files[0]) return;
      try { toast('Enviando o vídeo…'); await enviarArquivo(i.dataset.up, i.files[0]); toast('Vídeo enviado.'); await carregar(); } catch (e) { toast(e.message, true); }
    }));
    el.querySelectorAll('tr[data-v]').forEach((tr) => {
      const id = tr.dataset.v;
      const acao = (sel, fn) => tr.querySelectorAll(sel).forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true;
        try { await fn(b); await carregar(); } catch (e) { toast(e.message, true); b.disabled = false; }
      }));
      acao('[data-repetir]', (b) => api('POST', `/api/t/${slug}/videos/${id}/canais/${b.dataset.repetir}/repetir`));
      acao('[data-cancelar]', () => api('PATCH', `/api/t/${slug}/videos/${id}`, { cancelado: true }));
      acao('[data-reativar]', () => api('PATCH', `/api/t/${slug}/videos/${id}`, { cancelado: false }));
      acao('[data-apagar]', async () => { if (confirm('Apagar este vídeo da fila?')) await api('DELETE', `/api/t/${slug}/videos/${id}`); });
    });
  }

  await carregar();
}
