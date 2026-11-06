// Calendário editorial: horários da operação, geração dos espaços do dia e situação real de cada publicação.
// A tela nunca publica nada: sem conta conectada o espaço aparece como "aguardando conexão".
export async function render(el, ctx) {
  const { api, S, esc, toast, can } = ctx;
  const slug = S.tenant.slug;
  const estado = { dias: 7, dados: null, aberto: null };
  const podeEditar = can('calendar.edit');

  const PILL = { rascunho: 'info', aguardando_conexao: 'warn', agendado: 'ok', publicado: 'ok', erro: 'bad' };
  const pill = (item) => `<span class="pill ${PILL[item.situacao] || ''}"><span class="dot"></span>${esc(item.situacaoLabel)}</span>`;
  const diaLongo = (dia) => {
    const [y, m, d] = dia.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit' });
  };

  await carregar();

  async function carregar() {
    estado.dados = await api('GET', `/api/t/${slug}/calendar?dias=${estado.dias}`);
    desenhar();
  }

  function configHtml() {
    const c = estado.dados.config;
    const canais = estado.dados.canais;
    if (!podeEditar) {
      return `<div class="card"><div class="card-head"><h2>Configuração</h2></div>
        <p class="muted">Meta de ${esc(c.postsPerDay)} publicação(ões) por dia, nos horários ${esc(c.postTimesTexto || '—')}, no fuso ${esc(c.timezone)}.
        Canais: ${esc(c.canais.map((k) => canais.find((x) => x.id === k)?.label || k).join(', '))}.</p></div>`;
    }
    return `<div class="card"><div class="card-head"><h2>Configuração</h2></div>
      <div class="grid2">
        <label class="field">Publicações por dia<input id="cal-ppd" type="number" min="0" max="12" value="${esc(c.postsPerDay)}"></label>
        <label class="field">Horários (relógio da operação)<input id="cal-times" value="${esc(c.postTimesTexto)}" placeholder="12:00, 15:00, 18:00"></label>
        <label class="field">Fuso da operação<input id="cal-tz" value="${esc(c.timezone)}" placeholder="America/Sao_Paulo"></label>
        <label class="field">Dias mostrados<select id="cal-dias">${[7, 14, 30].map((n) => `<option value="${n}" ${n === estado.dias ? 'selected' : ''}>${n} dias</option>`).join('')}</select></label>
      </div>
      <div class="field" style="margin-top:10px"><strong style="font-size:12.5px">Canais</strong>
        <div class="row" style="flex-wrap:wrap;gap:12px;margin-top:6px">${canais.map((ch) => `<label class="row" style="gap:6px">
          <input type="checkbox" data-canal="${esc(ch.id)}" ${c.canais.includes(ch.id) ? 'checked' : ''}>${esc(ch.label)}
          <span class="pill ${ch.conectado ? 'ok' : 'warn'}"><span class="dot"></span>${ch.conectado ? 'conectado' : 'sem conta'}</span></label>`).join('')}</div></div>
      <div class="row end" style="margin-top:12px"><button class="btn" type="button" id="cal-salvar">Salvar horários</button>
        <button class="btn primary" type="button" id="cal-gerar">Gerar espaços dos próximos ${esc(estado.dias)} dias</button></div>
      <p class="muted" style="font-size:12.5px;margin-top:8px">Gerar duas vezes não duplica nada: cada espaço tem chave de canal, dia e horário. Rascunhos, itens aguardando conexão e agendados que saíram da configuração são removidos; publicados e erros ficam no histórico.</p></div>`;
  }

  function itemHtml(item) {
    const aberto = estado.aberto === item.id;
    const travado = item.situacao === 'publicado';
    return `<div class="list-item" style="display:grid;gap:6px">
      <div class="row"><strong class="mono">${esc(item.hora)}</strong><span class="muted">${esc(item.canalLabel)}</span><span class="spacer"></span>${pill(item)}</div>
      <div class="muted" style="font-size:12.5px">${item.legenda ? esc(item.legenda.slice(0, 120)) + (item.legenda.length > 120 ? '…' : '') : 'Sem legenda ainda.'}</div>
      ${item.erro ? `<div class="err" style="font-size:12.5px">${esc(item.erro)}</div>` : ''}
      ${podeEditar && !travado ? `<div class="row" style="gap:6px"><button class="btn sm" type="button" data-abrir="${esc(item.id)}">${aberto ? 'Fechar' : 'Legenda'}</button>
        ${item.situacao === 'agendado' ? `<button class="btn sm" type="button" data-sit="${esc(item.id)}" data-para="rascunho">Rascunho</button>`
          : `<button class="btn sm primary" type="button" data-sit="${esc(item.id)}" data-para="agendado">Agendar</button>`}
        <span class="spacer"></span><button class="btn sm icon danger" type="button" data-apagar="${esc(item.id)}" title="Remover espaço">×</button></div>` : ''}
      ${aberto ? `<label class="field">Legenda<textarea data-legenda="${esc(item.id)}" rows="4">${esc(item.legenda)}</textarea></label>
        <div class="row end"><button class="btn sm primary" type="button" data-salvar="${esc(item.id)}">Salvar legenda</button></div>` : ''}
    </div>`;
  }

  function desenhar() {
    const d = estado.dados;
    el.innerHTML = `<p class="muted">Os espaços do dia saem dos horários da operação, no fuso dela. Enquanto a conta do canal não estiver conectada em Integrações,
      o espaço fica <strong>aguardando conexão</strong> — nada é publicado nem aparece como publicado sem ter acontecido.</p>
      ${d.avisos.map((a) => `<div class="card" style="border-color:var(--warn,#c90)"><p style="margin:0">${esc(a)}</p></div>`).join('')}
      ${configHtml()}
      <div class="card"><div class="card-head"><h2>Próximos ${esc(d.dias.length)} dias</h2>
        <span class="muted">${esc(d.dias.reduce((n, x) => n + x.itens.length, 0))} espaço(s)</span></div>
        <div class="cal" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;align-items:start">
          ${d.dias.map((dia) => `<section class="day" style="display:grid;gap:8px"><strong>${esc(diaLongo(dia.dia))}</strong>
            ${dia.itens.length ? dia.itens.map(itemHtml).join('') : '<div class="empty">Nenhum espaço. Gere os espaços acima.</div>'}</section>`).join('')}
        </div></div>`;
    ligar();
  }

  function ligar() {
    el.querySelector('#cal-dias')?.addEventListener('change', async (e) => { estado.dias = Number(e.target.value); await carregar(); });
    el.querySelector('#cal-salvar')?.addEventListener('click', async () => {
      const channels = [...el.querySelectorAll('[data-canal]')].filter((i) => i.checked).map((i) => i.dataset.canal);
      try {
        const r = await api('PUT', `/api/t/${slug}/calendar/config`, {
          postsPerDay: Number(el.querySelector('#cal-ppd').value),
          postTimes: el.querySelector('#cal-times').value,
          timezone: el.querySelector('#cal-tz').value.trim(),
          channels,
        });
        toast(r.nota);
        S.me = await api('GET', '/api/me');
        S.tenant = S.me.tenants.find((t) => t.slug === slug) || S.tenant;
        await carregar();
      } catch (e) { toast(e.message, true); }
    });
    el.querySelector('#cal-gerar')?.addEventListener('click', async () => {
      try {
        const r = await api('POST', `/api/t/${slug}/calendar/gerar`, { dias: estado.dias });
        toast(`${r.nota} Criados: ${r.criados} · já existiam: ${r.mantidos} · situação revista: ${r.reavaliados} · remarcados: ${r.remarcados} · removidos: ${r.removidos || 0}.`);
        await carregar();
      } catch (e) { toast(e.message, true); }
    });
    el.querySelectorAll('[data-abrir]').forEach((b) => b.addEventListener('click', () => {
      estado.aberto = estado.aberto === b.dataset.abrir ? null : b.dataset.abrir;
      desenhar();
    }));
    el.querySelectorAll('[data-salvar]').forEach((b) => b.addEventListener('click', async () => {
      const legenda = el.querySelector(`[data-legenda="${b.dataset.salvar}"]`).value;
      try { await api('PATCH', `/api/t/${slug}/calendar/${b.dataset.salvar}`, { legenda }); estado.aberto = null; toast('Legenda salva.'); await carregar(); }
      catch (e) { toast(e.message, true); }
    }));
    el.querySelectorAll('[data-sit]').forEach((b) => b.addEventListener('click', async () => {
      try { await api('POST', `/api/t/${slug}/calendar/${b.dataset.sit}/situacao`, { situacao: b.dataset.para }); toast(b.dataset.para === 'agendado' ? 'Agendado. A publicação sai pelo módulo do canal.' : 'De volta para rascunho.'); await carregar(); }
      catch (e) { toast(e.message, true); }
    }));
    el.querySelectorAll('[data-apagar]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Remover este espaço do calendário?')) return;
      try { const r = await api('DELETE', `/api/t/${slug}/calendar/${b.dataset.apagar}`); toast(r.nota); await carregar(); }
      catch (e) { toast(e.message, true); }
    }));
  }
}
