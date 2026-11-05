// Editor de artigos do blog. A autorização de publicação continua no servidor.
export async function scheduleWithValidatedTime(localValue, schedule) {
  if (!localValue) throw new Error('Escolha data e horário para agendar.');
  const parsed = Date.parse(String(localValue));
  if (!Number.isFinite(parsed) || parsed <= Date.now()) throw new Error('Escolha um horário futuro para publicar.');
  return schedule(new Date(parsed).toISOString());
}

export async function render(el, { api, S, esc, toast, can, fmtDate }) {
  const tenantPath = `/api/t/${encodeURIComponent(S.tenant.slug)}/posts`;
  const mayEdit = can('blog.edit');
  const mayPublish = can('blog.publish');
  let posts = [];
  let sites = [];
  let selectedId = '';
  let siteFilter = '';

  const styles = `<style>
    .blog-admin{display:grid;gap:16px}.blog-admin-head{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap}.blog-admin-head p{margin:4px 0 0;color:var(--ink-3)}
    .blog-workbench{display:grid;grid-template-columns:minmax(260px,330px) minmax(0,1fr);gap:14px;align-items:start}
    .blog-queue{display:grid;gap:8px}.blog-post-pick{width:100%;display:grid;gap:4px;text-align:left;white-space:normal;padding:12px;border:1px solid var(--line);border-radius:9px;background:var(--panel);color:var(--ink);font:inherit;cursor:pointer}
    .blog-post-pick:hover{border-color:var(--line-2)}.blog-post-pick.selected{border-color:var(--gold);box-shadow:0 0 0 2px var(--gold-soft)}
    .blog-post-pick strong{font-size:13.5px;line-height:1.3}.blog-post-pick small{color:var(--ink-3)}.blog-editor{display:grid;gap:14px;min-width:0}
    .blog-editor-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.blog-editor-head .spacer{flex:1}.blog-tags-help{color:var(--ink-3);font-size:12px}
    .blog-schedule{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;align-items:end;padding-top:12px;border-top:1px solid var(--line)}
    .blog-message{min-height:1.2em;margin:0;color:var(--bad);font-size:13px}.blog-empty-list{padding:20px 12px;color:var(--ink-3);text-align:center;border:1px dashed var(--line-2);border-radius:9px}
    @media(max-width:900px){.blog-workbench{grid-template-columns:1fr}.blog-queue{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}}
    @media(max-width:520px){.blog-schedule{grid-template-columns:1fr}.blog-schedule .btn{width:100%;justify-content:center}}
  </style>`;

  const dateInput = (iso) => {
    if (!iso) return '';
    const date = new Date(iso);
    return Number.isNaN(date.valueOf()) ? '' : new Date(date.valueOf() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  };
  const statusLabel = (post) => post.status === 'revisao' && post.hasPublishedVersion ? 'Revisão · versão publicada ativa'
    : ({ rascunho: 'Rascunho', revisao: 'Em revisão', agendado: 'Agendado', publicado: 'Publicado' }[post.status] || post.status);
  const statusClass = (post) => post.status === 'publicado' || post.status === 'agendado' || post.hasPublishedVersion ? 'ok'
    : post.status === 'revisao' ? 'warn' : 'info';

  async function load(nextId = selectedId) {
    const result = await api('GET', tenantPath);
    posts = result.posts || [];
    sites = result.sites || [];
    selectedId = posts.some((post) => post.id === nextId) ? nextId : '';
    draw();
  }

  function draw() {
    const visiblePosts = siteFilter ? posts.filter((post) => post.siteId === siteFilter) : posts;
    const selected = posts.find((post) => post.id === selectedId) || null;
    const siteOptions = sites.map((site) => `<option value="${esc(site.id)}" ${selected?.siteId === site.id ? 'selected' : ''}>${esc(site.name)}</option>`).join('');
    const filterOptions = sites.map((site) => `<option value="${esc(site.id)}" ${siteFilter === site.id ? 'selected' : ''}>${esc(site.name)}</option>`).join('');
    const list = visiblePosts.map((post) => `<button class="blog-post-pick ${post.id === selectedId ? 'selected' : ''}" type="button" data-post="${esc(post.id)}" aria-current="${post.id === selectedId ? 'true' : 'false'}">
      <strong>${esc(post.title)}</strong><small>${esc(post.category)} · ${esc(fmtDate(post.updatedAt))}</small><span class="pill ${statusClass(post)}">${esc(statusLabel(post))}</span></button>`).join('');
    const current = selected || { siteId: sites[0]?.id || '', title: '', slug: '', excerpt: '', content: '', category: 'Geral', tags: [], author: S.me?.user?.name || '', coverUrl: '', seoTitle: '', seoDescription: '', status: 'rascunho', scheduledAt: '' };

    el.innerHTML = `${styles}<div class="blog-admin"><header class="blog-admin-head"><div><h1>Blog</h1><p>Escreva artigos, revise e escolha quando cada versão ficará pública.</p></div><span class="spacer"></span>
      ${mayEdit ? '<button class="btn primary" id="blog-new" type="button">Novo artigo</button>' : ''}</header>
      <div class="blog-workbench"><section class="card" aria-label="Artigos"><div class="card-head"><h2>Artigos</h2><span class="spacer"></span><select id="blog-filter" aria-label="Filtrar por site"><option value="">Todos os sites</option>${filterOptions}</select></div>
        <div class="blog-queue">${list || '<div class="blog-empty-list">Nenhum artigo neste filtro.</div>'}</div></section>
        <section class="card blog-editor" aria-label="Editor de artigo"><div class="blog-editor-head"><h2>${selected ? 'Editar artigo' : 'Novo artigo'}</h2><span class="pill ${statusClass(current)}">${esc(statusLabel(current))}</span><span class="spacer"></span>
          ${selected && mayPublish && current.hasPublishedVersion ? '<button class="btn sm danger" id="blog-unpublish" type="button">Despublicar</button>' : ''}</div>
          <form id="blog-form"><div class="grid2"><label class="field">Site<select name="siteId" required ${selected ? 'disabled' : ''}>${siteOptions}</select></label>
            <label class="field">Categoria<input name="category" maxlength="80" value="${esc(current.category)}" required></label></div>
            <label class="field">Título<input name="title" maxlength="120" value="${esc(current.title)}" required></label>
            <label class="field">Slug<input name="slug" maxlength="100" value="${esc(current.slug)}" placeholder="endereco-do-artigo" required></label>
            <div class="grid2"><label class="field">Autor<input name="author" maxlength="100" value="${esc(current.author)}" required></label>
              <label class="field">Tags<input name="tags" value="${esc((current.tags || []).join(', '))}" placeholder="separadas por vírgula"><span class="blog-tags-help">Separe as tags por vírgula.</span></label></div>
            <label class="field">Resumo<input name="excerpt" maxlength="300" value="${esc(current.excerpt)}"></label>
            <label class="field">Capa · endereço de imagem<input name="coverUrl" maxlength="1000" value="${esc(current.coverUrl || '')}" placeholder="/assets/capa.webp ou https://…"></label>
            <div class="card"><div class="card-head"><h3>SEO</h3><span class="muted">Título e descrição da página pública</span></div><div class="grid2">
              <label class="field">Título SEO<input name="seoTitle" maxlength="70" value="${esc(current.seoTitle || '')}"></label>
              <label class="field">Descrição SEO<textarea name="seoDescription" maxlength="170">${esc(current.seoDescription || '')}</textarea></label></div></div>
            <label class="field">Conteúdo<textarea name="content" maxlength="80000" rows="12" required>${esc(current.content)}</textarea></label>
            <p class="blog-message" id="blog-error" role="alert"></p><div class="row end"><button class="btn primary" type="submit" ${mayEdit ? '' : 'disabled'}>Salvar rascunho</button>
              ${mayEdit ? '<button class="btn" id="blog-review" type="button">Enviar para revisão</button>' : ''}${mayPublish ? '<button class="btn gold" id="blog-publish" type="button">Publicar agora</button>' : ''}</div>
            ${mayPublish ? `<div class="blog-schedule"><label class="field">Agendar para<input id="blog-scheduled-at" type="datetime-local" value="${esc(dateInput(current.scheduledAt))}"></label><button class="btn" id="blog-schedule" type="button">Agendar publicação</button></div>` : ''}
          </form></section></div></div>`;

    el.querySelector('#blog-filter').addEventListener('change', (event) => { siteFilter = event.target.value; draw(); });
    el.querySelectorAll('[data-post]').forEach((button) => button.addEventListener('click', () => { selectedId = button.dataset.post; draw(); }));
    el.querySelector('#blog-new')?.addEventListener('click', () => { selectedId = ''; draw(); });
    el.querySelector('#blog-form').addEventListener('submit', (event) => { event.preventDefault(); void act('save'); });
    el.querySelector('#blog-review')?.addEventListener('click', () => { void act('review'); });
    el.querySelector('#blog-publish')?.addEventListener('click', () => { void act('publish'); });
    el.querySelector('#blog-schedule')?.addEventListener('click', () => { void act('schedule'); });
    el.querySelector('#blog-unpublish')?.addEventListener('click', () => { void act('unpublish'); });
  }

  function payload() {
    const form = el.querySelector('#blog-form');
    const values = new FormData(form);
    const selected = posts.find((post) => post.id === selectedId);
    return {
      siteId: selected?.siteId || values.get('siteId') || sites[0]?.id,
      title: values.get('title'), slug: values.get('slug'), category: values.get('category'), author: values.get('author'),
      tags: String(values.get('tags') || '').split(',').map((tag) => tag.trim()).filter(Boolean), excerpt: values.get('excerpt'),
      coverUrl: values.get('coverUrl'), seoTitle: values.get('seoTitle'), seoDescription: values.get('seoDescription'), content: values.get('content'),
    };
  }

  async function persist() {
    const body = payload();
    const saved = await api(selectedId ? 'PUT' : 'POST', selectedId ? `${tenantPath}/${encodeURIComponent(selectedId)}` : tenantPath, body);
    selectedId = saved.post.id;
    return saved.post;
  }

  async function act(action) {
    const error = el.querySelector('#blog-error');
    error.textContent = '';
    try {
      let post;
      if (action === 'unpublish') post = posts.find((item) => item.id === selectedId);
      if (action === 'schedule') {
        const local = el.querySelector('#blog-scheduled-at').value;
        post = await scheduleWithValidatedTime(local, async (scheduledAt) => {
          if (!selectedId) {
            const created = await persist();
            await api('POST', `${tenantPath}/${encodeURIComponent(created.id)}/schedule`, { scheduledAt });
            return created;
          }
          const saved = await api('PUT', `${tenantPath}/${encodeURIComponent(selectedId)}/schedule`, { ...payload(), scheduledAt });
          return saved.post;
        });
        selectedId = post.id;
      } else if (action !== 'unpublish') {
        post = await persist();
        if (action === 'review' || action === 'publish') await api('POST', `${tenantPath}/${encodeURIComponent(post.id)}/${action}`);
      } else await api('POST', `${tenantPath}/${encodeURIComponent(post.id)}/${action}`);
      toast(({ save: 'Artigo salvo.', review: 'Artigo enviado para revisão.', publish: 'Artigo publicado.', schedule: 'Publicação agendada.', unpublish: 'Artigo despublicado.' })[action]);
      await load(post.id);
    } catch (error) { const target = el.querySelector('#blog-error'); if (target) target.textContent = error.message || 'Não foi possível salvar o artigo.'; }
  }

  try { await load(''); }
  catch (error) { el.innerHTML = `${styles}<div class="empty">${esc(error.message || 'Não foi possível carregar os artigos.')}</div>`; }
}
