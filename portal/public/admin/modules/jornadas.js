// Jornadas e teste A/B: lista, editor de variantes e passos, divisão do tráfego e resultados por passo.
export async function render(el, ctx) {
  const { api, S, esc, toast, can } = ctx;
  const slug = S.tenant.slug;
  const pct = (x) => `${(x * 100).toFixed(1).replace('.', ',')}%`;
  const statusPill = (s) => `<span class="pill ${{ rodando: 'ok', pausada: 'warn', encerrada: '', rascunho: 'info' }[s] || ''}"><span class="dot"></span>${esc({ rodando: 'Rodando', pausada: 'Pausada', encerrada: 'Encerrada', rascunho: 'Rascunho' }[s] || s)}</span>`;
  const id = new URLSearchParams(location.hash.split('?')[1] || '').get('j');
  if (id) return editor(id);
  return list();

  async function list() {
    const d = await api('GET', `/api/t/${slug}/journeys`);
    el.innerHTML = `<p class="muted">Monte a jornada do visitante em passos (formulário, abrir o app, copiar dados, ir para outro sistema, confirmar) e teste versões diferentes. O site sorteia a variante de cada visitante e mede cada passo.</p>
      ${can('site.edit') ? `<div class="card"><div class="card-head"><h2>Nova jornada</h2></div><div class="grid2">${d.presets.map((p) => `<div class="list-item"><strong>${esc(p.name)}</strong><span class="muted" style="font-size:13px">${esc(p.description)}</span><div><button class="btn sm primary" type="button" data-preset="${esc(p.id)}">Usar este modelo</button></div></div>`).join('')}</div></div>` : ''}
      <div class="card"><div class="card-head"><h2>Jornadas</h2></div>${d.journeys.length ? `<div class="table-wrap"><table><thead><tr><th>Jornada</th><th>Situação</th><th>Variantes (tráfego · visitantes · conversão)</th><th></th></tr></thead><tbody>
        ${d.journeys.map((j) => `<tr><td><strong>${esc(j.name)}</strong>${j.winner ? ` <span class="pill ok">vencedora: ${esc(j.winner.toUpperCase())}</span>` : ''}</td><td>${statusPill(j.status)}</td>
          <td>${j.variants.map((v) => `<div><strong>${esc(v.key.toUpperCase())}</strong> ${v.weight}% · ${v.visitors} · ${pct(v.conversion)}</div>`).join('')}</td>
          <td class="row end"><a class="btn sm primary" href="#/t/${esc(slug)}/m/jornadas?j=${esc(j.id)}">Abrir</a></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nenhuma jornada ainda. Comece por um modelo acima.</div>'}</div>`;
    el.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', async () => {
      const r = await api('POST', `/api/t/${slug}/journeys`, { preset: b.dataset.preset });
      location.hash = `#/t/${slug}/m/jornadas?j=${r.journey.id}`;
    }));
  }

  async function editor(jid) {
    const d = await api('GET', `/api/t/${slug}/journeys/${jid}`);
    const J = { name: d.journey.name, variants: structuredClone(d.variants), tab: 0, open: null };
    const types = d.stepTypes;
    const res = Object.fromEntries(d.results.map((r) => [r.key, r]));

    function stepFields(s, vi, si) {
      return types[s.type].fields.map((f) => {
        const path = `${vi}.${si}.${f.k}`;
        if (f.t === 'textarea') return `<label class="field">${esc(f.label)}<textarea data-p="${path}">${esc(s[f.k] || '')}</textarea></label>`;
        if (f.t === 'select') return `<label class="field">${esc(f.label)}<select data-p="${path}">${f.options.map((o) => `<option ${o === s[f.k] ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
        if (f.t === 'list') return `<div class="list-field"><div class="row"><strong style="font-size:12.5px">${esc(f.label)}</strong><span class="spacer"></span><button class="btn sm" type="button" data-li-add="${path}">+ Dado</button></div>
          ${(s[f.k] || []).map((it, i) => `<div class="list-item"><div class="row"><span class="muted">#${i + 1}</span><span class="spacer"></span><button class="btn sm icon danger" type="button" data-li-del="${path}" data-i="${i}">×</button></div>
            ${f.of.map((x) => `<label class="field">${esc(x.label)}<input data-p="${path}.${i}.${x.k}" value="${esc(it[x.k] || '')}"></label>`).join('')}</div>`).join('')}</div>`;
        return `<label class="field">${esc(f.label)}<input data-p="${path}" value="${esc(s[f.k] || '')}"></label>`;
      }).join('');
    }

    function resultsHtml() {
      if (!d.results.some((r) => r.visitors)) return '<div class="empty">Sem visitas ainda. Inicie o teste e coloque a jornada numa página publicada.</div>';
      return `<div class="table-wrap"><table><thead><tr><th>Variante</th><th>Tráfego</th><th>Visitantes</th><th>Leads</th><th>Chegaram ao fim</th><th>Conversão</th><th>Leitura</th><th></th></tr></thead><tbody>
        ${d.results.map((r, i) => `<tr><td><strong>${esc(r.name)}</strong></td><td>${r.weight}%</td><td>${r.visitors}</td><td>${r.leads}</td><td>${r.goal}</td><td><strong>${pct(r.conversion)}</strong>${r.lift != null ? ` <span class="muted">(${r.lift >= 0 ? '+' : ''}${pct(r.lift)} vs A)</span>` : ''}</td>
          <td class="muted" style="font-size:12.5px">${i === 0 ? 'base de comparação' : esc(r.verdict || '')}</td>
          <td>${can('site.publish') && d.journey.winner !== r.key ? `<button class="btn sm" type="button" data-win="${esc(r.key)}">Declarar vencedora</button>` : d.journey.winner === r.key ? '<span class="pill ok">vencedora</span>' : ''}</td></tr>`).join('')}</tbody></table></div>
        <h3 style="margin-top:14px">Funil por passo</h3><div class="grid2" style="margin-top:8px">${d.results.map((r) => `<div class="list-item"><strong>${esc(r.name)}</strong>
          ${r.funnel.map((f, i) => { const w = r.visitors ? Math.round((f.viram / r.visitors) * 100) : 0; return `<div style="font-size:12.5px"><div class="row"><span>${i + 1}. ${esc(f.title)}</span><span class="spacer"></span><span class="mono">${f.viram} viram · ${f.concluiram} concluíram</span></div>
            <div style="height:6px;background:var(--line);border-radius:4px;overflow:hidden"><div style="width:${w}%;height:100%;background:var(--brand)"></div></div></div>`; }).join('')}</div>`).join('')}</div>`;
    }

    function draw() {
      const v = J.variants[J.tab];
      const total = J.variants.reduce((s, x) => s + (Number(x.weight) || 0), 0) || 1;
      el.innerHTML = `<p><a href="#/t/${esc(slug)}/m/jornadas">← Jornadas</a></p>
        <div class="card"><div class="row"><label class="field" style="flex:1;min-width:240px">Nome da jornada<input id="j-name" value="${esc(J.name)}"></label>
          ${statusPill(d.journey.status)}<span class="spacer"></span>
          ${can('site.edit') ? '<button class="btn primary" type="button" id="j-save">Salvar</button>' : ''}
          ${can('site.publish') ? (d.journey.status === 'rodando' ? '<button class="btn" type="button" data-st="pausada">Pausar teste</button>' : '<button class="btn gold" type="button" data-st="rodando">Iniciar teste</button>') : ''}</div>
          <p class="muted" style="font-size:12.5px;margin-top:8px">Tráfego: ${J.variants.map((x) => `${esc(x.key.toUpperCase())} ${Math.round(((Number(x.weight) || 0) / total) * 100)}%`).join(' · ')}. O visitante fica sempre na mesma variante; para ver uma delas, abra a página com <span class="mono">?jornada=a</span> ou <span class="mono">?jornada=b</span>.</p>
          ${d.site ? `<div class="row" style="margin-top:10px">${can('site.edit') ? `<select id="j-page" style="max-width:260px">${d.pages.map((p) => `<option value="${esc(p.id)}">${esc(p.title)} (/${esc(p.slug)})</option>`).join('')}</select><button class="btn" type="button" id="j-place">Colocar no site</button>` : ''}
            <a class="btn" href="/s/${esc(d.site.slug)}/?jornada=${esc(v.key)}&abrir=${esc(d.journey.id)}" target="_blank" rel="noopener">Ver a variante ${esc(v.key.toUpperCase())} no site ↗</a></div>` : ''}</div>
        <div class="card"><div class="card-head"><h2>Resultados</h2></div>${resultsHtml()}</div>
        <div class="card"><div class="row">${J.variants.map((x, i) => `<button class="btn ${i === J.tab ? 'primary' : ''}" type="button" data-tab="${i}">${esc(x.key.toUpperCase())}${res[x.key] ? ` · ${res[x.key].visitors}` : ''}</button>`).join('')}
          ${J.variants.length < 8 && can('site.edit') ? '<button class="btn" type="button" id="v-add">+ Variante (cópia desta)</button>' : ''}<span class="spacer"></span>
          ${J.variants.length > 1 && can('site.edit') ? '<button class="btn danger" type="button" id="v-del">Remover esta variante</button>' : ''}</div>
          <div class="grid2" style="margin-top:12px"><label class="field">Nome da variante<input data-v="name" value="${esc(v.name)}"></label><label class="field">Peso no tráfego (0 a 100)<input type="number" min="0" max="100" data-v="weight" value="${esc(v.weight)}"></label></div>
          <h3 style="margin-top:14px">Passos</h3><div class="blocks" style="margin-top:8px">${v.steps.map((s, i) => `<div class="blk ${J.open === i ? 'open' : ''}"><div class="blk-head" data-toggle="${i}"><strong>${i + 1}. ${esc(types[s.type].label)}</strong><span class="muted">${esc(s.title || '')}</span>
            <button class="btn sm icon" type="button" title="Subir" data-mv="${i}" data-d="-1">↑</button><button class="btn sm icon" type="button" title="Descer" data-mv="${i}" data-d="1">↓</button><button class="btn sm icon danger" type="button" title="Remover" data-rm="${i}">×</button></div>
            ${J.open === i ? `<div class="blk-body">${stepFields(s, J.tab, i)}</div>` : ''}</div>`).join('')}</div>
          ${can('site.edit') ? `<div class="row" style="margin-top:10px"><select id="s-type" style="max-width:280px">${Object.entries(types).map(([k, t]) => `<option value="${esc(k)}">${esc(t.label)}</option>`).join('')}</select><button class="btn" type="button" id="s-add">Adicionar passo</button></div>` : ''}
          <p class="muted" style="font-size:12.5px;margin-top:10px">Nos textos: {{name}}, {{number}}, {{inviteLink}}, {{chipsUrl}}, {{agentId}} e {{whatsappLink}} vêm da operação; [[nome]], [[email]] e [[telefone]] vêm do formulário da própria jornada.</p></div>`;
      bind();
    }

    const setPath = (path, val) => { const ks = path.split('.'); const last = ks.pop(); const o = ks.reduce((a, k) => a[k], J.variants.map((x) => x.steps)); o[last] = val; };
    function bind() {
      el.querySelector('#j-name')?.addEventListener('input', (e) => { J.name = e.target.value; });
      el.querySelectorAll('[data-v]').forEach((i) => i.addEventListener('input', () => { J.variants[J.tab][i.dataset.v] = i.dataset.v === 'weight' ? Number(i.value) : i.value; }));
      el.querySelectorAll('[data-p]').forEach((i) => i.addEventListener('input', () => setPath(i.dataset.p, i.value)));
      el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { J.tab = +b.dataset.tab; J.open = null; draw(); }));
      el.querySelectorAll('[data-toggle]').forEach((h) => h.addEventListener('click', (e) => { if (e.target.closest('button')) return; J.open = J.open === +h.dataset.toggle ? null : +h.dataset.toggle; draw(); }));
      const steps = () => J.variants[J.tab].steps;
      el.querySelectorAll('[data-mv]').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.mv; const j = i + +b.dataset.d; if (j < 0 || j >= steps().length) return; [steps()[i], steps()[j]] = [steps()[j], steps()[i]]; J.open = null; draw(); }));
      el.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { if (steps().length > 1 && confirm('Remover este passo?')) { steps().splice(+b.dataset.rm, 1); J.open = null; draw(); } }));
      el.querySelectorAll('[data-li-add]').forEach((b) => b.addEventListener('click', () => { const ks = b.dataset.liAdd.split('.'); const s = J.variants[+ks[0]].steps[+ks[1]]; (s[ks[2]] ||= []).push({ label: '', value: '' }); draw(); }));
      el.querySelectorAll('[data-li-del]').forEach((b) => b.addEventListener('click', () => { const ks = b.dataset.liDel.split('.'); J.variants[+ks[0]].steps[+ks[1]][ks[2]].splice(+b.dataset.i, 1); draw(); }));
      el.querySelector('#s-add')?.addEventListener('click', () => { const type = el.querySelector('#s-type').value; steps().push({ type, title: types[type].label }); J.open = steps().length - 1; draw(); });
      el.querySelector('#v-add')?.addEventListener('click', () => { const c = structuredClone(J.variants[J.tab]); c.key = 'abcdefgh'[J.variants.length]; c.name = `${c.key.toUpperCase()} · cópia de ${J.variants[J.tab].key.toUpperCase()}`; J.variants.push(c); J.tab = J.variants.length - 1; draw(); });
      el.querySelector('#v-del')?.addEventListener('click', () => { if (confirm('Remover esta variante? Os resultados dela deixam de aparecer.')) { J.variants.splice(J.tab, 1); J.tab = 0; draw(); } });
      el.querySelector('#j-save')?.addEventListener('click', async () => {
        try { const r = await api('PUT', `/api/t/${slug}/journeys/${jid}`, { name: J.name, variants: J.variants }); toast(r.warning || 'Jornada salva.', Boolean(r.warning)); editor(jid); } catch (e) { toast(e.message, true); }
      });
      el.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', async () => { await api('PUT', `/api/t/${slug}/journeys/${jid}`, { name: J.name, variants: J.variants }); await api('POST', `/api/t/${slug}/journeys/${jid}/status`, { status: b.dataset.st }); toast(b.dataset.st === 'rodando' ? 'Teste rodando.' : 'Teste pausado.'); editor(jid); }));
      el.querySelector('#j-place')?.addEventListener('click', async () => { const r = await api('POST', `/api/t/${slug}/journeys/${jid}/place`, { pageId: el.querySelector('#j-page').value, title: 'Comece agora', cta: 'Quero começar' }); toast(r.note); });
      el.querySelectorAll('[data-win]').forEach((b) => b.addEventListener('click', async () => { if (confirm(`Mandar todo o tráfego para a variante ${b.dataset.win.toUpperCase()}?`)) { const r = await api('POST', `/api/t/${slug}/journeys/${jid}/winner`, { key: b.dataset.win }); toast(r.note); editor(jid); } }));
    }
    draw();
  }
}
