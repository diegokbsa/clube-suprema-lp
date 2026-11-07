// Recursos do site (PA-150): torneios ao vivo, /baixar por aparelho, /sobre de cada site e /llms.txt.
// render(): tela completa do módulo. renderConfig(): só torneios e /baixar, embutida em Configurações.
const ROTULOS = { ios: 'iPhone / iPad (App Store ou convite)', android: 'Android (Google Play ou convite)', windows: 'Windows (instalador)', apk: 'Android sem loja (APK)' };
const CHAVES = { ios: 'baixarIos', android: 'baixarAndroid', windows: 'baixarWindows', apk: 'baixarApk' };

const urlSite = (s) => (s.externalUrl ? '' : s.domain ? `https://${s.domain}` : String(s.url || '').replace(/\/+$/, ''));

async function recarregarOperacao(ctx) {
  const { api, S } = ctx;
  const slug = S.tenant.slug;
  S.me = await api('GET', '/api/me');
  S.tenant = S.me.tenants.find((t) => t.slug === slug) || S.tenant;
}

function cartaoTorneios(ctx, sites) {
  const { esc, can, S } = ctx;
  const s = S.tenant.settings || {};
  const pode = can('tenant.manage');
  const ligado = s.torneiosAtivo === true;
  const links = sites.filter(urlSite).map((x) => `<a href="${esc(`${urlSite(x)}/torneios`)}" target="_blank" rel="noopener">${esc(x.name)} /torneios ↗</a>`).join(' · ');
  return `<section class="card" data-rec="torneios"><div class="card-head"><h3>Torneios ao vivo</h3><span class="pill ${ligado && s.torneiosLiga ? 'ok' : ''}">${ligado && s.torneiosLiga ? 'Ligado' : 'Desligado'}</span></div>
    <p class="muted" style="font-size:12.5px">Página <code>/torneios</code> em cada site, com a grade do dia da liga (API PokerByte, atualizada a cada 10 minutos) e a versão em texto <code>/torneios.txt</code>.
      Desligado, o caminho volta a mostrar a página do construtor (se houver).</p>
    <div class="grid2">
      <label class="field">Número da liga na PokerByte<input data-t="liga" inputmode="numeric" value="${esc(s.torneiosLiga || '')}" placeholder="Ex.: 106 (Liga Suprema)" ${pode ? '' : 'disabled'}></label>
      <label class="field">Nome mostrado<input data-t="nome" value="${esc(s.torneiosNome || '')}" placeholder="Ex.: Liga Suprema" ${pode ? '' : 'disabled'}></label>
    </div>
    <label class="row" style="gap:8px;margin-top:6px"><input type="checkbox" data-t="ativo" ${ligado ? 'checked' : ''} ${pode ? '' : 'disabled'}> Mostrar a grade de torneios nos sites desta operação</label>
    ${links ? `<p class="muted" style="font-size:12.5px;margin-top:8px">${links}</p>` : ''}
    <pre class="muted" data-t="previa" style="white-space:pre-wrap;font-size:12.5px;margin:10px 0 0" hidden></pre>
    <p class="err" data-t="erro"></p>
    <div class="row end"><button class="btn sm" type="button" data-t="ver">Ver a grade de hoje</button>${pode ? '<button class="btn primary sm" type="button" data-t="salvar">Salvar torneios</button>' : ''}</div></section>`;
}

function cartaoBaixar(ctx, sites) {
  const { esc, can, S } = ctx;
  const s = S.tenant.settings || {};
  const pode = can('tenant.manage');
  const links = sites.filter(urlSite).map((x) => `<a href="${esc(`${urlSite(x)}/baixar`)}" target="_blank" rel="noopener">${esc(x.name)} /baixar ↗</a>`).join(' · ');
  return `<section class="card" data-rec="baixar"><div class="card-head"><h3>Link único do app (/baixar)</h3></div>
    <p class="muted" style="font-size:12.5px">Cada aparelho vai para o lugar certo. Campo vazio usa o link de convite do clube${s.inviteLink ? ` (<code>${esc(s.inviteLink)}</code>)` : ' (ainda não configurado: sem nenhum link, o /baixar volta para a página inicial)'}.
      Só endereços <code>https://</code>.</p>
    <div class="grid2">${Object.keys(CHAVES).map((k) => `<label class="field">${esc(ROTULOS[k])}<input data-b="${k}" value="${esc(s[CHAVES[k]] || '')}" placeholder="https://..." ${pode ? '' : 'disabled'}></label>`).join('')}</div>
    ${links ? `<p class="muted" style="font-size:12.5px;margin-top:8px">${links}</p>` : ''}
    <p class="err" data-b="erro"></p>
    ${pode ? '<div class="row end"><button class="btn primary sm" type="button" data-b="salvar">Salvar links</button></div>' : ''}</section>`;
}

function ligarConfig(el, ctx, redesenhar) {
  const { api, S, toast } = ctx;
  const slug = S.tenant.slug;
  const t = (n) => el.querySelector(`[data-rec="torneios"] [data-t="${n}"]`);
  t('ver')?.addEventListener('click', async () => {
    const previa = t('previa');
    t('erro').textContent = '';
    try {
      const r = await api('GET', `/api/t/${slug}/torneios/previa`);
      previa.hidden = false;
      previa.textContent = r.texto || (r.erro ? r.erro : `${r.total} torneios hoje. Ligue os torneios para ver o texto curto (o mesmo que vai para a postagem das 9h).`);
    } catch (e) { t('erro').textContent = e.message; }
  });
  t('salvar')?.addEventListener('click', async () => {
    t('erro').textContent = '';
    try {
      await api('PUT', `/api/t/${slug}/torneios/config`, { ativo: t('ativo').checked, liga: t('liga').value.trim(), nome: t('nome').value.trim() });
      await recarregarOperacao(ctx);
      toast('Torneios salvos.');
      await redesenhar();
    } catch (e) { t('erro').textContent = e.message; }
  });
  const b = (n) => el.querySelector(`[data-rec="baixar"] [data-b="${n}"]`);
  b('salvar')?.addEventListener('click', async () => {
    b('erro').textContent = '';
    const corpo = Object.fromEntries(Object.keys(CHAVES).map((k) => [k, b(k).value.trim()]));
    try {
      await api('PUT', `/api/t/${slug}/baixar/config`, corpo);
      await recarregarOperacao(ctx);
      toast('Links do /baixar salvos.');
      await redesenhar();
    } catch (e) { b('erro').textContent = e.message; }
  });
}

/** Parte que entra em Configurações: torneios e /baixar. */
export async function renderConfig(el, ctx) {
  const { api, S } = ctx;
  const desenhar = async () => {
    const sites = ctx.can('site.read') ? (await api('GET', `/api/t/${S.tenant.slug}/sites`)).sites : [];
    el.innerHTML = cartaoTorneios(ctx, sites) + cartaoBaixar(ctx, sites);
    ligarConfig(el, ctx, desenhar);
  };
  await desenhar();
}

function formSobre(ctx, site, d) {
  const { esc, can } = ctx;
  const pode = can('site.edit');
  const dis = pode ? '' : 'disabled';
  const base = urlSite(site);
  return `<section class="card" data-rec="sobre"><div class="card-head"><h3>Página /sobre</h3><span class="pill ${d.ativo ? 'ok' : ''}">${d.ativo ? 'Publicada' : 'Desativada'}</span></div>
    <p class="muted" style="font-size:12.5px">Quem somos, autor e como o conteúdo é feito (E-E-A-T). Vira <code>/sobre</code> no site, com JSON-LD de organização e pessoa.
      O texto aceita o markdown curto do blog: <code>## título</code>, <code>- lista</code>, <code>**negrito**</code>, <code>[link](https://...)</code> e as caixas <code>:::nota</code>, <code>:::dica</code> e <code>:::cta</code> (fechadas com <code>:::</code>).</p>
    <div class="grid2">
      <label class="field">Título<input data-o="titulo" value="${esc(d.titulo)}" placeholder="Sobre ${esc(site.name)}" ${dis}></label>
      <label class="field">Resumo (descrição da página)<input data-o="resumo" value="${esc(d.resumo)}" ${dis}></label>
      <label class="field">Quem assina<select data-o="tipo" ${dis}><option value="Organization" ${d.tipo !== 'Person' ? 'selected' : ''}>Organização (clube, empresa)</option><option value="Person" ${d.tipo === 'Person' ? 'selected' : ''}>Pessoa (autor do site)</option></select></label>
      <label class="field">Perfis oficiais (um por linha, https)<textarea data-o="links" rows="2" ${dis}>${esc((d.links || []).join('\n'))}</textarea></label>
      <label class="field">Autor ou responsável<input data-o="autorNome" value="${esc(d.autorNome)}" ${dis}></label>
      <label class="field">Cargo<input data-o="autorCargo" value="${esc(d.autorCargo)}" placeholder="Ex.: Editora do blog" ${dis}></label>
      <label class="field">Foto do autor (https ou /assets/...)<input data-o="autorFoto" value="${esc(d.autorFoto)}" ${dis}></label>
      <label class="field">Mini bio<input data-o="autorBio" value="${esc(d.autorBio)}" ${dis}></label>
    </div>
    <label class="field">Texto<textarea data-o="conteudo" rows="12" ${dis}>${esc(d.conteudo)}</textarea></label>
    <label class="row" style="gap:8px"><input type="checkbox" data-o="ativo" ${d.ativo ? 'checked' : ''} ${dis}> Publicar o /sobre neste site</label>
    ${base && d.ativo ? `<p class="muted" style="font-size:12.5px"><a href="${esc(`${base}/sobre`)}" target="_blank" rel="noopener">Abrir ${esc(base)}/sobre ↗</a></p>` : ''}
    <p class="err" data-o="erro"></p>
    ${pode ? '<div class="row end"><button class="btn primary sm" type="button" data-o="salvar">Salvar /sobre</button></div>' : ''}</section>`;
}

function cartaoLlms(ctx, sites) {
  const { esc } = ctx;
  const proprios = sites.filter(urlSite);
  return `<section class="card"><div class="card-head"><h3>llms.txt para assistentes de IA</h3><span class="pill ok">Automático</span></div>
    <p class="muted" style="font-size:12.5px">Cada site publica <code>/llms.txt</code> (resumo, páginas indexáveis e artigos) e <code>/llms-full.txt</code> (com o texto do /sobre e de cada artigo).
      Sai sozinho do que já está publicado: rascunho e página com noindex ficam de fora.</p>
    ${proprios.length ? `<ul style="margin:0;padding-left:18px">${proprios.map((s) => `<li>${esc(s.name)}: <a href="${esc(`${urlSite(s)}/llms.txt`)}" target="_blank" rel="noopener">llms.txt ↗</a> · <a href="${esc(`${urlSite(s)}/llms-full.txt`)}" target="_blank" rel="noopener">llms-full.txt ↗</a></li>`).join('')}</ul>` : '<div class="empty">Nenhum site servido pelo portal nesta operação.</div>'}</section>`;
}

/** Tela completa do módulo. */
export async function render(el, ctx) {
  const { api, S, esc, toast } = ctx;
  const slug = S.tenant.slug;
  let sites = (await api('GET', `/api/t/${slug}/sites`)).sites;
  let atual = sites.find((s) => !s.externalUrl)?.id || sites[0]?.id || '';

  async function desenhar() {
    sites = (await api('GET', `/api/t/${slug}/sites`)).sites;
    const site = sites.find((s) => s.id === atual);
    const sobre = site ? (await api('GET', `/api/t/${slug}/sites/${site.id}/sobre`)).sobre : null;
    el.innerHTML = `<p class="muted" style="margin:0 0 16px">Recursos que valem para todos os sites da operação: grade de torneios ao vivo, link único do app, página /sobre e llms.txt.</p>
      ${cartaoTorneios(ctx, sites)}${cartaoBaixar(ctx, sites)}
      ${sites.length > 1 ? `<label class="field" style="max-width:360px">Site do /sobre<select id="rec-site">${sites.map((s) => `<option value="${esc(s.id)}" ${s.id === atual ? 'selected' : ''}>${esc(s.name)}${s.externalUrl ? ' (externo)' : ''}</option>`).join('')}</select></label>` : ''}
      ${site ? (site.externalUrl ? '<section class="card"><div class="empty">Site externo (redireciona): o /sobre deste site fica no próprio site atual.</div></section>' : formSobre(ctx, site, sobre)) : '<section class="card"><div class="empty">Esta operação ainda não tem site.</div></section>'}
      ${cartaoLlms(ctx, sites)}`;
    ligarConfig(el, ctx, desenhar);
    el.querySelector('#rec-site')?.addEventListener('change', (e) => { atual = e.target.value; desenhar(); });
    const o = (n) => el.querySelector(`[data-rec="sobre"] [data-o="${n}"]`);
    o('salvar')?.addEventListener('click', async () => {
      o('erro').textContent = '';
      const corpo = { ativo: o('ativo').checked, links: o('links').value.split(/\s+/).filter(Boolean) };
      for (const k of ['titulo', 'resumo', 'tipo', 'autorNome', 'autorCargo', 'autorFoto', 'autorBio', 'conteudo']) corpo[k] = o(k).value;
      try {
        await api('PUT', `/api/t/${slug}/sites/${atual}/sobre`, corpo);
        toast('Página /sobre salva.');
        await desenhar();
      } catch (e) { o('erro').textContent = e.message; }
    });
  }
  await desenhar();
}
