// Mensuração e pixels: identificadores por site, conta da Conversions API e diagnóstico do que está chegando.
// A tela separa de propósito duas coisas que costumam ser confundidas:
//   "ID instalado"    = o número do GA4/GTM/Pixel está colado no site (e só carrega depois do consentimento);
//   "conta conectada" = o portal fala com a plataforma (token validado), o que só a Conversions API tem hoje.
export async function render(el, ctx) {
  const { api, S, esc, toast, can, fmtDate } = ctx;
  const slug = S.tenant.slug;
  const podeIds = can('site.edit');
  const podeConta = can('integrations.manage');
  let d = null;

  async function carregar() {
    d = await api('GET', `/api/t/${slug}/tracking`);
    desenhar();
  }

  const pill = (estado) => ({ conectada: 'ok', instalado: 'ok', erro: 'bad', token_guardado: 'warn', ausente: '' }[estado] || '');
  const quando = (iso) => (iso ? esc(fmtDate(iso)) : '—');
  const sim = (v) => (v ? '<span class="pill ok">sim</span>' : '<span class="pill">não</span>');

  function cabecalho() {
    const conectadas = d.integracoes.filter((i) => i.conectada).length;
    const instalados = d.integracoes.filter((i) => i.tipo === 'id' && i.instalado).length;
    const eventos7d = d.eventos.reduce((n, e) => n + e.navegador7d + e.servidor7d, 0);
    const deduplicados = d.recentes.filter((e) => e.source === 'navegador' && e.deduplicado).length;
    return `<p class="muted" style="margin:0 0 16px">Identificadores por site (GA4, GTM, Pixel, Clarity e Google Ads), Conversions API da Meta e o que o portal recebeu de verdade.</p>
      <div class="kpis">
        <div class="card"><div class="muted">Identificadores instalados</div><strong style="font-size:22px">${instalados} de ${d.integracoes.filter((i) => i.tipo === 'id').length}</strong><div class="muted" style="font-size:12px">ID colado no site</div></div>
        <div class="card"><div class="muted">Contas conectadas</div><strong style="font-size:22px">${conectadas}</strong><div class="muted" style="font-size:12px">token validado com a plataforma</div></div>
        <div class="card"><div class="muted">Eventos em 7 dias</div><strong style="font-size:22px">${eventos7d}</strong><div class="muted" style="font-size:12px">navegador + servidor</div></div>
        <div class="card"><div class="muted">Pares deduplicados</div><strong style="font-size:22px">${deduplicados}</strong><div class="muted" style="font-size:12px">mesmo event_id nos dois lados</div></div>
      </div>`;
  }

  function pendencias() {
    if (!d.pendencias.length) return '<section class="card"><div class="card-head"><h3>Validação</h3><span class="pill ok">tudo certo</span></div><p class="muted">Nada pendente: os identificadores estão instalados e a medição está chegando.</p></section>';
    return `<section class="card"><div class="card-head"><h3>Validação</h3><span class="pill warn">${d.pendencias.length} ponto(s)</span></div>
      <ul style="margin:0;padding-left:18px;display:grid;gap:6px">${d.pendencias.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></section>`;
  }

  function estado() {
    return `<section class="card"><div class="card-head"><h3>Estado de cada integração</h3></div>
      <p class="muted" style="font-size:12.5px">“ID instalado” quer dizer que o número está no site. “Conta conectada” quer dizer que o portal conversou com a plataforma e ela respondeu.</p>
      <div class="table-wrap"><table><thead><tr><th>Integração</th><th>ID instalado</th><th>Conta conectada</th><th>Situação</th><th>Observação</th></tr></thead><tbody>
      ${d.integracoes.map((i) => `<tr>
        <td><strong>${esc(i.label)}</strong><div class="muted" style="font-size:12px">${i.tipo === 'id' ? 'identificador no site' : 'conta com credencial'}${i.sites.length ? ` · ${esc(i.sites.join(', '))}` : ''}</div></td>
        <td>${sim(i.instalado)}</td>
        <td>${i.tipo === 'id' ? '<span class="muted" style="font-size:12px">não se aplica</span>' : sim(i.conectada)}</td>
        <td><span class="pill ${pill(i.estado)}">${esc(i.estadoLabel)}</span></td>
        <td class="muted" style="font-size:12.5px">${esc(i.detalhe)}${i.lastError ? `<div style="margin-top:4px">${esc(i.lastError)}</div>` : ''}${i.lastCheck ? `<div style="margin-top:4px">última verificação: ${quando(i.lastCheck)}</div>` : ''}</td>
      </tr>`).join('')}
      </tbody></table></div></section>`;
  }

  function sites() {
    if (!d.sites.length) return '<section class="card"><div class="card-head"><h3>Identificadores por site</h3></div><div class="empty">Esta operação ainda não tem site.</div></section>';
    return `<section class="card"><div class="card-head"><h3>Identificadores por site</h3></div>
      <p class="muted" style="font-size:12.5px">Cada site tem os seus. Nenhum script carrega antes do visitante aceitar a medição (escolha guardada em <code>${esc(d.consentimento.chave)}</code>).</p>
      <div style="display:grid;gap:12px">${d.sites.map((s) => `<article class="list-item" data-site="${esc(s.id)}">
        <div class="row"><strong>${esc(s.name)}</strong><span class="pill">${esc(s.slug)}</span>
          <span class="pill ${s.instalados ? 'ok' : ''}">${s.instalados} de ${s.total || 5} instalados</span><span class="spacer"></span>
          <span class="muted" style="font-size:12px">${esc(s.url)}</span></div>
        ${s.externo ? '<div class="muted" style="font-size:12.5px">Site externo (redireciona): o portal não injeta script nele.</div>' : ''}
        <div class="grid2">
          <label class="field">GA4 (G-XXXXXXXXXX)<input data-id="ga4" value="${esc(s.ids.ga4)}" ${podeIds ? '' : 'disabled'} placeholder="G-XXXXXXXXXX"></label>
          <label class="field">GTM (GTM-XXXXXXX)<input data-id="gtm" value="${esc(s.ids.gtm)}" ${podeIds ? '' : 'disabled'} placeholder="GTM-XXXXXXX"></label>
          <label class="field">Meta Pixel (número)<input data-id="pixel" value="${esc(s.ids.pixel)}" ${podeIds ? '' : 'disabled'} placeholder="123456789012345"></label>
          <label class="field">Microsoft Clarity (ID do projeto)<input data-id="clarity" value="${esc(s.ids.clarity || '')}" ${podeIds ? '' : 'disabled'} placeholder="abcd1234ef"></label>
          <label class="field">Google Ads (tag AW-…)<input data-id="ads" value="${esc(s.ids.ads || '')}" ${podeIds ? '' : 'disabled'} placeholder="AW-123456789"></label>
          <label class="field">Google Ads: rótulo da conversão do lead (opcional)<input data-id="adsLabel" value="${esc(s.ids.adsLabel || '')}" ${podeIds ? '' : 'disabled'} placeholder="AbC-dEfGh12"></label>
        </div>
        <div class="muted" style="font-size:12.5px">Clarity: o ID fica em Configurações → Visão geral do projeto no clarity.microsoft.com. Google Ads: a tag AW- e o rótulo ficam em Metas → Conversões → a conversão do lead → Configuração da tag.</div>
        ${podeIds ? '<div class="row end"><button class="btn primary sm" type="button" data-salvar-site>Salvar identificadores</button></div>' : '<div class="muted" style="font-size:12.5px">Seu papel não permite alterar identificadores.</div>'}
      </article>`).join('')}</div></section>`;
  }

  function conta() {
    const c = d.capi;
    return `<section class="card"><div class="card-head"><h3>Conta conectada · Meta Conversions API</h3><span class="pill ${pill(c.estado)}">${esc(c.estadoLabel)}</span></div>
      <p class="muted" style="font-size:12.5px">É o envio pelo servidor. O portal manda o mesmo <code>event_id</code> que o navegador usou, então a Meta conta o evento uma vez só.
        O token fica no cofre do servidor e nunca volta para esta tela.</p>
      ${!podeConta ? `<div class="empty">Só o administrador da operação conecta a conta. Situação atual: ${esc(c.estadoLabel)}.</div>` : `
      <div class="grid2">
        <label class="field">Número do pixel<input id="capi-pixel" value="${esc(c.pixelId)}" placeholder="123456789012345"></label>
        <label class="field">Token de acesso<input id="capi-token" type="password" autocomplete="off" placeholder="${c.temToken ? 'guardado no cofre — preencha só para trocar' : 'cole o token da Meta'}"></label>
        <label class="field">Código de teste (opcional)<input id="capi-teste" value="${esc(c.testCode)}" placeholder="TEST12345"></label>
      </div>
      <div class="row end" style="margin-top:10px">
        ${c.temToken ? '<button class="btn danger sm" type="button" id="capi-remover">Remover token</button>' : ''}
        <button class="btn sm" type="button" id="capi-testar" ${c.temToken && c.pixelId ? '' : 'disabled'}>Testar conexão</button>
        <button class="btn primary sm" type="button" id="capi-salvar">Salvar</button>
      </div>
      <div class="muted" style="font-size:12.5px;margin-top:8px">${esc(c.tokenResumo || 'Sem token: integração pendente de configuração.')}
        ${c.lastCheck ? ` · última verificação ${quando(c.lastCheck)}` : ''}${c.lastError ? `<div style="margin-top:4px">${esc(c.lastError)}</div>` : ''}</div>`}
    </section>`;
  }

  function eventos() {
    return `<section class="card"><div class="card-head"><h3>Eventos padrão</h3></div>
      <div class="table-wrap"><table><thead><tr><th>Evento</th><th>GA4 / GTM</th><th>Meta</th><th>Navegador (7d)</th><th>Servidor (7d)</th><th>Último</th></tr></thead><tbody>
      ${d.eventos.map((e) => `<tr><td><strong>${esc(e.label)}</strong><div class="muted" style="font-size:12px">${esc(e.chave)}</div></td>
        <td><code>${esc(e.ga4)}</code></td><td>${e.meta ? `<code>${esc(e.meta)}</code>` : '<span class="muted">sem equivalente</span>'}</td>
        <td>${e.navegador7d}</td><td>${e.servidor7d}</td><td class="muted">${quando(e.ultimo)}</td></tr>`).join('')}
      </tbody></table></div></section>`;
  }

  function recentes() {
    if (!d.recentes.length) return `<section class="card"><div class="card-head"><h3>Últimos eventos recebidos</h3></div>
      <div class="empty">Nada recebido ainda. Abra um site da operação, aceite a medição e volte aqui.</div></section>`;
    return `<section class="card"><div class="card-head"><h3>Últimos eventos recebidos</h3><span class="pill">${d.recentes.length}</span></div>
      <div class="table-wrap"><table><thead><tr><th>Quando</th><th>Evento</th><th>Origem</th><th>event_id</th><th>Situação</th></tr></thead><tbody>
      ${d.recentes.map((e) => `<tr><td class="muted">${quando(e.createdAt)}</td>
        <td>${esc(e.label)}${e.page ? `<div class="muted" style="font-size:12px">/${esc(e.page)}</div>` : ''}</td>
        <td><span class="pill ${e.source === 'servidor' ? 'info' : ''}">${esc(e.source)}</span></td>
        <td><code style="font-size:11.5px">${esc(e.eventId)}</code>${e.deduplicado ? ' <span class="pill ok">deduplicado</span>' : ''}</td>
        <td><span class="pill ${e.status === 'erro' ? 'bad' : e.status === 'enviado' ? 'ok' : ''}">${esc(e.status)}</span>${e.detail ? `<div class="muted" style="font-size:12px">${esc(e.detail)}</div>` : ''}</td></tr>`).join('')}
      </tbody></table></div></section>`;
  }

  function desenhar() {
    el.innerHTML = cabecalho() + pendencias() + estado() + sites() + conta() + eventos() + recentes();

    el.querySelectorAll('[data-salvar-site]').forEach((botao) => botao.addEventListener('click', async () => {
      const card = botao.closest('[data-site]');
      const corpo = {};
      card.querySelectorAll('[data-id]').forEach((i) => { corpo[i.dataset.id] = i.value.trim(); });
      botao.disabled = true;
      try {
        const r = await api('PUT', `/api/t/${slug}/tracking/sites/${card.dataset.site}`, corpo);
        toast(r.nota || 'Identificadores salvos.');
        await carregar();
      } catch (erro) {
        toast(erro.message || 'Não foi possível salvar os identificadores.');
        botao.disabled = false;
      }
    }));

    const salvar = el.querySelector('#capi-salvar');
    if (salvar) salvar.addEventListener('click', async () => {
      salvar.disabled = true;
      try {
        const r = await api('PUT', `/api/t/${slug}/tracking/capi`, {
          pixelId: el.querySelector('#capi-pixel').value.trim(),
          token: el.querySelector('#capi-token').value.trim(),
          testCode: el.querySelector('#capi-teste').value.trim(),
        });
        toast(r.nota || 'Configuração salva.');
        await carregar();
      } catch (erro) {
        toast(erro.message || 'Não foi possível salvar a Conversions API.');
        salvar.disabled = false;
      }
    });

    const testar = el.querySelector('#capi-testar');
    if (testar) testar.addEventListener('click', async () => {
      testar.disabled = true;
      testar.textContent = 'Testando…';
      try {
        const r = await api('POST', `/api/t/${slug}/tracking/capi/teste`, {});
        toast(r.ok ? `Conta conectada. ${r.detalhe}` : `Não conectou: ${r.detalhe}`);
      } catch (erro) {
        toast(erro.message || 'Não foi possível testar a conexão.');
      }
      await carregar();
    });

    const remover = el.querySelector('#capi-remover');
    if (remover) remover.addEventListener('click', async () => {
      if (!confirm('Apagar o token da Conversions API? Os eventos do servidor param de sair.')) return;
      remover.disabled = true;
      try {
        const r = await api('DELETE', `/api/t/${slug}/tracking/capi`);
        toast(r.nota || 'Token removido.');
      } catch (erro) {
        toast(erro.message || 'Não foi possível remover o token.');
      }
      await carregar();
    });
  }

  await carregar();   // por último: desenhar() usa os ajudantes declarados acima
}
