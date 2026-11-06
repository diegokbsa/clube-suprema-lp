// Painel do agente na trilha "Migrar para o pôquer" (PA-140): placar, link rastreado, página de perguntas e kit de 7 dias.
const css = () => {
  if (!document.querySelector('link[data-mg]')) document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="/admin/modules/migracao.css" data-mg>');
};

export async function render(el, ctx) {
  css();
  const { api, S, esc, toast, can, fmtDate } = ctx;
  const slug = S.tenant.slug;
  const d = await api('GET', `/api/t/${slug}/migracao`);
  if (!d.veioDaTrilha) {
    el.innerHTML = '<div class="empty">Esta operação não veio da trilha de migração. O placar, o link rastreado e o kit de 7 dias aparecem nas operações criadas quando o superadmin aprova uma candidatura de /migrar.</div>';
    return;
  }
  const P = d.placar;
  const canalAtual = new URLSearchParams(location.hash.split('?')[1] || '').get('canal') || d.candidatura.canal;
  const canaisComKit = [...new Set(d.kit.map((k) => k.canal))];
  const kit = d.kit.filter((k) => k.canal === canalAtual);
  const nomeCanal = (id) => d.canais.find((c) => c.id === id)?.nome || id;
  const pf = (p) => (p.ok ? '<span class="pill ok"><span class="dot"></span>Preflight ok</span>'
    : `<span class="pill bad"><span class="dot"></span>Bloqueado: ${esc([...p.bloqueios.map((b) => b.regra), ...p.faltando.map((f) => `falta ${f}`)].join(', '))}</span>`);
  const pq = d.perguntas;

  el.innerHTML = `<div class="mg">
    <p class="muted">Veio da trilha em ${esc(fmtDate(d.candidatura.aprovadaEm))} · canal principal ${esc(d.candidatura.canalNome)} · ${esc(d.candidatura.origemNome)} · audiência ${esc(d.candidatura.audienciaNome.toLowerCase())}.
      ${d.ativa ? '' : '<span class="pill warn">Trilha pausada pela SX</span>'}</p>

    <section class="mg-sec" aria-labelledby="mg-pl"><h2 id="mg-pl">Placar de migração</h2>
      ${P.semDados ? '<div class="empty">Ainda sem dados. Os números aparecem quando alguém clicar no seu link, deixar contato no site ou fizer a primeira recarga verificada. Nada aqui é estimativa: só o que aconteceu.</div>' : `
      <div class="kpis mg-kpis">
        <div class="kpi"><b>${P.cliquesLink}</b><span>cliques no seu link</span></div>
        <div class="kpi"><b>${P.leadsLink}</b><span>leads pelo seu link</span><small>${P.leadsTotal} leads no total</small></div>
        <div class="kpi"><b>${P.conv7}</b><span>primeiras recargas verificadas nos primeiros 7 dias</span><small>${P.conv7Link} pelo seu link</small></div>
        <div class="kpi"><b>${P.conv30}</b><span>primeiras recargas verificadas nos primeiros 30 dias</span><small>${P.conv30Link} pelo seu link</small></div>
      </div>`}
      <p class="muted">Contado desde a criação da operação (${esc(fmtDate(P.desde))}). Recarga só entra quando chega verificada pelo webhook de conversão.</p>
    </section>

    ${d.link ? `<div class="card"><div class="card-head"><h2>Seu link rastreado</h2></div>
      <div class="mg-copiar"><input readonly value="${esc(d.link)}" aria-label="Seu link rastreado"><button class="btn" type="button" data-copiar="${esc(d.link)}">Copiar</button></div>
      <p class="muted" style="margin-top:8px">O link leva ao site da operação. Enquanto o site estiver em rascunho, ele ainda não abre para o público.</p></div>` : ''}

    ${pq ? `<div class="card"><div class="card-head"><h2>${esc(pq.titulo)}</h2>
        ${pq.revisao === 'revisado' ? '<span class="pill ok">Revisada pelo Kbsa</span>' : '<span class="pill warn">Aguardando revisão do Kbsa</span>'}
        ${pq.publicada ? '<span class="pill ok">Publicada</span>' : '<span class="pill info">Rascunho</span>'}</div>
      <p class="muted">Página pronta com as perguntas que o seu público está fazendo, as fontes oficiais e a data de revisão (${esc(pq.revisadoEmTexto)}). ${pq.revisao === 'revisado' ? 'Já pode ser publicada no construtor, se você quiser.' : 'Não publique antes da revisão: ela fala de lei e precisa de um segundo olhar.'}</p>
      <div class="row end"><a class="btn" href="#/t/${esc(slug)}/editor/${esc(pq.pageId)}">Abrir no construtor</a>
        ${S.me.user.isSuper && pq.revisao !== 'revisado' ? '<button class="btn primary" type="button" id="mg-revisar">Marcar como revisada</button>' : ''}</div></div>` : ''}

    <section class="card" aria-labelledby="mg-kit"><div class="card-head"><h2 id="mg-kit">Kit de 7 dias · ${esc(nomeCanal(canalAtual))}</h2><span class="spacer"></span>
      ${can('creatives.edit') ? `<label class="field" style="min-width:180px">Outro canal<select id="mg-canal">${d.canais.map((c) => `<option value="${esc(c.id)}" ${c.id === canalAtual ? 'selected' : ''}>${esc(c.nome)}${canaisComKit.includes(c.id) ? '' : ' (gerar)'}</option>`).join('')}</select></label>` : ''}</div>
      <p class="muted">Pautas honestas para a primeira semana, já com o seu link e passadas pelo preflight. O Estúdio de UGC transforma em peças depois. Nada é publicado daqui.</p>
      ${kit.length ? `<ol class="mg-kit">${kit.map((k) => `<li><span class="mg-dia">Dia ${k.dia}</span><div>
        <h3>${esc(k.gancho)}</h3><p>${esc(k.formato)}</p><p>${esc(k.tema)}</p><p class="mg-chamada"><strong>Chamada:</strong> ${esc(k.chamada)}</p>
        <div class="row">${pf(k.preflight)}<button class="btn sm" type="button" data-copiar="${esc(`${k.gancho}\n\n${k.chamada}`)}">Copiar gancho e chamada</button></div></div></li>`).join('')}</ol>`
        : `<div class="empty">Ainda não há kit para ${esc(nomeCanal(canalAtual))}.${can('creatives.edit') ? ' <button class="btn primary" type="button" id="mg-gerar">Gerar kit deste canal</button>' : ''}</div>`}
    </section></div>`;

  el.querySelectorAll('[data-copiar]').forEach((x) => x.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(x.dataset.copiar); toast('Copiado.'); } catch { toast('Não deu para copiar automaticamente.', true); }
  }));
  el.querySelector('#mg-canal')?.addEventListener('change', (e) => { location.hash = `#/t/${slug}/m/migracao?canal=${encodeURIComponent(e.target.value)}`; });
  el.querySelector('#mg-gerar')?.addEventListener('click', async () => {
    try { await api('POST', `/api/t/${slug}/migracao/kit`, { canal: canalAtual }); toast('Kit gerado.'); render(el, ctx); } catch (e) { toast(e.message, true); }
  });
  el.querySelector('#mg-revisar')?.addEventListener('click', async () => {
    if (!confirm('Você leu a página e conferiu as fontes? Marcar como revisada tira o aviso interno do rascunho. A página continua sem publicar.')) return;
    try { const r = await api('POST', `/api/t/${slug}/migracao/perguntas/revisar`); toast(r.nota); render(el, ctx); } catch (e) { toast(e.message, true); }
  });
}
