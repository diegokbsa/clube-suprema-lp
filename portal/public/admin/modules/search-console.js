// Configuração e relatórios do Google Search Console e Bing Webmaster Tools.
export async function render(el, { api, S, esc, toast, can, fmtDate }) {
  const path = `/api/t/${encodeURIComponent(S.tenant.slug)}/search-console`;
  const podeConfigurar = can('integrations.manage');
  let dados = null;
  let siteId = '';
  let relatorio = null;
  let carregandoRelatorio = false;

  const rotuloEstado = (estado) => ({ conectado: 'Conectado', pendente: 'Pendente de configuração', erro: 'Falha na última chamada' }[estado] || 'Pendente de configuração');
  const classeEstado = (estado) => ({ conectado: 'ok', erro: 'bad' }[estado] || 'warn');
  const quando = (value) => value ? esc(fmtDate(value)) : '—';

  async function carregar() {
    dados = await api('GET', path);
    if (!dados.sites.some((site) => site.id === siteId)) siteId = dados.sites[0]?.id || '';
    desenhar();
  }

  function quadroGoogle() {
    const google = dados.google;
    const site = dados.sites.find((item) => item.id === siteId);
    return `<section class="card"><div class="card-head"><h3>Google Search Console</h3><span class="pill ${classeEstado(google.estado)}">${esc(rotuloEstado(google.estado))}</span></div>
      <ol style="padding-left:22px;line-height:1.65"><li>No Google Cloud, habilite a API do Search Console e crie um cliente OAuth do tipo aplicativo da Web.</li>
        <li>Cadastre este endereço como URI de redirecionamento autorizado:<br><code style="overflow-wrap:anywhere">${esc(google.urlRetorno)}</code></li>
        <li>Informe o ID e o segredo do cliente abaixo e salve.</li><li>Conecte a conta Google que tem acesso à propriedade do site.</li></ol>
      <div class="grid2"><label class="field">ID do cliente OAuth<input id="sc-google-id" autocomplete="off" ${podeConfigurar ? '' : 'disabled'} placeholder="...apps.googleusercontent.com"></label>
        <label class="field">Segredo do cliente OAuth<input id="sc-google-secret" type="password" autocomplete="new-password" ${podeConfigurar ? '' : 'disabled'} placeholder="${google.clienteConfigurado ? 'Já salvo; deixe vazio para manter' : 'Segredo do cliente'}"></label></div>
      <p class="muted" style="font-size:12.5px">Escopo solicitado: <code>${esc(google.escopo)}</code>. As credenciais e os tokens ficam cifrados no cofre do servidor e não voltam para esta tela.</p>
      <div class="row"><span class="muted">Última verificação: ${quando(google.lastCheck)}</span><span class="spacer"></span>
        ${podeConfigurar ? '<button class="btn" type="button" data-google-salvar>Salvar credenciais</button>' : ''}
        ${podeConfigurar ? `<button class="btn primary" type="button" data-google-conectar ${google.clienteConfigurado ? '' : 'disabled'}>Conectar ao Google</button>` : ''}</div>
      ${google.ultimoErro ? `<p class="muted" style="color:var(--bad)">${esc(google.ultimoErro)}</p>` : ''}
      <div style="border-top:1px solid var(--line);margin-top:16px;padding-top:14px"><h4 style="margin:0 0 8px">Consultas e cobertura</h4>
        <div class="row"><label class="field" style="min-width:min(100%,320px)">Site<select id="sc-site" ${dados.sites.length ? '' : 'disabled'}>${dados.sites.map((item) => `<option value="${esc(item.id)}" ${item.id === siteId ? 'selected' : ''}>${esc(item.nome)} · ${esc(item.siteUrl)}</option>`).join('')}</select></label>
          <span class="spacer"></span><button class="btn" type="button" data-google-relatorio ${site && google.estado === 'conectado' && !carregandoRelatorio ? '' : 'disabled'}>${carregandoRelatorio ? 'Consultando…' : 'Atualizar relatório'}</button></div>
        ${site ? `<p class="muted" style="font-size:12.5px;margin:6px 0">Sitemap: <code>${esc(site.sitemap)}</code></p>` : '<p class="muted">Cadastre um site HTTPS nesta operação para consultar relatórios.</p>'}
        ${relatorio ? desenharRelatorio() : ''}</div></section>`;
  }

  function desenharRelatorio() {
    const r = relatorio;
    const c = r.cobertura;
    const cobertura = c ? `<div class="card" style="margin:10px 0"><strong>Inspeção da página inicial</strong><div class="row" style="margin-top:8px"><span class="pill ${c.veredito === 'PASS' ? 'ok' : 'warn'}">${esc(c.veredito || 'Sem veredito')}</span>
      <span>${esc(c.estado || 'Estado indisponível')}</span><span class="muted">Indexação: ${esc(c.indexacao || '—')} · robots.txt: ${esc(c.robots || '—')}</span></div><div class="muted" style="font-size:12px;margin-top:6px">Último rastreamento: ${quando(c.ultimoRastreamento)}</div></div>`
      : '<p class="muted">O Google não devolveu dados de inspeção para a página inicial.</p>';
    const consultas = r.consultas.length ? `<div class="table-wrap"><table><thead><tr><th>Consulta</th><th>Cliques</th><th>Impressões</th><th>CTR</th><th>Posição</th></tr></thead><tbody>${r.consultas.map((item) => `<tr><td>${esc(item.consulta)}</td><td>${item.cliques}</td><td>${item.impressoes}</td><td>${(item.ctr * 100).toFixed(1)}%</td><td>${item.posicao.toFixed(1)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted">O Google não devolveu consultas para este período.</p>';
    return `<div style="margin-top:12px"><p class="muted" style="font-size:12px">Período: ${esc(r.periodo.inicio)} a ${esc(r.periodo.fim)}</p>${cobertura}<h4>Consultas de pesquisa</h4>${consultas}${r.avisos.length ? `<p class="muted">${r.avisos.map(esc).join(' ')}</p>` : ''}</div>`;
  }

  function quadroBing() {
    const bing = dados.bing;
    const site = dados.sites.find((item) => item.id === siteId);
    return `<section class="card"><div class="card-head"><h3>Bing Webmaster Tools</h3><span class="pill ${classeEstado(bing.estado)}">${esc(rotuloEstado(bing.estado))}</span></div>
      <ol style="padding-left:22px;line-height:1.65"><li>Adicione e verifique o site no Bing Webmaster Tools.</li><li>Gere uma chave da API no painel do Bing.</li><li>Salve a chave aqui; o envio do sitemap é opcional e só ocorre ao clicar no botão.</li></ol>
      <label class="field">Chave da API Bing<input id="sc-bing-key" type="password" autocomplete="new-password" ${podeConfigurar ? '' : 'disabled'} placeholder="${bing.chaveConfigurada ? 'Já salva; deixe vazio para manter' : 'Chave da API'}"></label>
      <p class="muted" style="font-size:12.5px">A chave fica cifrada no cofre e nunca aparece no painel. O Bing só fica conectado depois de aceitar um envio de sitemap.</p>
      <div class="row"><span class="muted">Última verificação: ${quando(bing.lastCheck)}</span><span class="spacer"></span>
        ${podeConfigurar ? '<button class="btn" type="button" data-bing-salvar>Salvar chave</button>' : ''}
        ${podeConfigurar ? `<button class="btn primary" type="button" data-bing-enviar ${site && bing.chaveConfigurada ? '' : 'disabled'}>Enviar sitemap ao Bing</button>` : ''}</div>
      ${bing.ultimoErro ? `<p class="muted" style="color:var(--bad)">${esc(bing.ultimoErro)}</p>` : ''}</section>`;
  }

  function desenhar() {
    el.innerHTML = `<style>.sc-page{display:grid;gap:14px}.sc-page .grid2{margin:14px 0}.sc-page ol{margin:8px 0 14px}.sc-page code{font-size:12px}.sc-page table{width:100%;border-collapse:collapse}.sc-page th,.sc-page td{padding:8px;text-align:left;border-bottom:1px solid var(--line)}.sc-page .card-head{display:flex;align-items:center;gap:10px}.sc-page .card-head h3{margin:0}.sc-page .row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.sc-page .spacer{flex:1}</style>
      <main class="sc-page"><p class="muted" style="margin:0">Conecte as ferramentas oficiais para enviar o sitemap e consultar os dados que cada serviço disponibilizar. Nenhuma credencial é exibida após salvar.</p>
        ${quadroGoogle()}${quadroBing()}</main>`;
    const selecionar = el.querySelector('#sc-site');
    selecionar?.addEventListener('change', () => { siteId = selecionar.value; relatorio = null; desenhar(); });
    el.querySelector('[data-google-salvar]')?.addEventListener('click', async () => {
      const clientId = el.querySelector('#sc-google-id').value.trim();
      const clientSecret = el.querySelector('#sc-google-secret').value.trim();
      try {
        const body = {};
        if (clientId) body.clientId = clientId;
        if (clientSecret) body.clientSecret = clientSecret;
        await api('PUT', `${path}/google`, body);
        toast('Credenciais Google salvas no cofre.');
        await carregar();
      } catch (error) { toast(error.message || 'Não foi possível salvar as credenciais.', true); }
    });
    el.querySelector('[data-google-conectar]')?.addEventListener('click', async () => {
      try {
        const result = await api('POST', `${path}/google/autorizar`, {});
        window.location.assign(result.url);
      } catch (error) { toast(error.message || 'Não foi possível iniciar a conexão.', true); }
    });
    el.querySelector('[data-google-relatorio]')?.addEventListener('click', async () => {
      if (!siteId) return;
      carregandoRelatorio = true; desenhar();
      try {
        relatorio = await api('GET', `${path}/google/relatorio?siteId=${encodeURIComponent(siteId)}`);
        if (relatorio.avisos.length) toast(relatorio.avisos.join(' '));
      } catch (error) { toast(error.message || 'Não foi possível consultar o Search Console.', true); }
      finally { carregandoRelatorio = false; desenhar(); }
    });
    el.querySelector('[data-bing-salvar]')?.addEventListener('click', async () => {
      const apiKey = el.querySelector('#sc-bing-key').value.trim();
      try {
        await api('PUT', `${path}/bing`, apiKey ? { apiKey } : {});
        toast(apiKey ? 'Chave do Bing salva no cofre.' : 'Configuração do Bing atualizada.');
        await carregar();
      } catch (error) { toast(error.message || 'Não foi possível salvar a chave.', true); }
    });
    el.querySelector('[data-bing-enviar]')?.addEventListener('click', async () => {
      if (!siteId) return;
      try {
        await api('POST', `${path}/bing/enviar`, { siteId });
        toast('O Bing aceitou o envio do sitemap.');
        await carregar();
      } catch (error) { toast(error.message || 'O Bing não aceitou o envio do sitemap.', true); await carregar(); }
    });
  }

  try { await carregar(); }
  catch (error) { el.innerHTML = `<section class="card"><h3>Search Console</h3><p class="muted" style="color:var(--bad)">${esc(error.message || 'Não foi possível carregar as integrações.')}</p></section>`; }
}
