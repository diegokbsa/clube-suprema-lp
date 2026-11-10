// Visitas sem cookie dos 12 sites (lib/modules/visitas.mjs): por dia, por site, por post, origens e o funil visita → clique → venda.
export async function render(el, ctx) {
  const { api, S, esc } = ctx;
  const slug = S.tenant.slug;
  let dias = 14;
  const n = (v) => Number(v || 0).toLocaleString('pt-BR');
  const pct = (a, b) => (b ? `${((a / b) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—');
  const dataBr = (d) => d.split('-').reverse().slice(0, 2).join('/');
  const tabela = (cab, linhas) => (linhas.length
    ? `<div class="table-wrap"><table><thead><tr>${cab.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>`
    : '<div class="empty">Nada no período.</div>');
  const kpi = (rotulo, valor, nota) => `<div class="card"><div class="muted">${esc(rotulo)}</div><strong style="font-size:22px">${valor}</strong><div class="muted" style="font-size:12px">${esc(nota)}</div></div>`;

  async function carregar() {
    el.innerHTML = '<div class="empty">Carregando…</div>';
    let d;
    try { d = await api('GET', `/api/t/${encodeURIComponent(slug)}/visitas?dias=${dias}`); } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message || 'Erro ao carregar.')}</div>`; return; }
    const doDia = (dia) => d.porDia.find((x) => x.dia === dia) || { visitas: 0, visitantes: 0, cliques: 0 };
    const hoje = doDia(d.hoje);
    const ontem = doDia(d.ontem);
    const bl = d.biglinks || {};
    const vendas = bl.ok ? bl.pedidosAtribuidos : null;
    el.innerHTML = `
      <div class="row" style="flex-wrap:wrap;gap:8px;margin-bottom:12px">
        ${[1, 7, 14, 30].map((x) => `<button class="btn sm${x === dias ? ' primary' : ''}" data-dias="${x}">${x === 1 ? 'Hoje' : `${x} dias`}</button>`).join('')}
        <span class="spacer"></span><span class="muted" style="font-size:12.5px">${esc(dataBr(d.de))} a ${esc(dataBr(d.ate))} · horário de Brasília</span>
      </div>
      <div class="kpis">
        ${kpi('Visitas hoje', n(hoje.visitas), `${n(hoje.visitantes)} visitante(s)`)}
        ${kpi('Visitas ontem', n(ontem.visitas), `${n(ontem.visitantes)} visitante(s) · ${n(ontem.cliques)} clique(s)`)}
        ${kpi('Visitas no período', n(d.total.visitas), `${n(d.total.visitantes)} visitante(s) por dia somados`)}
        ${kpi('Cliques em links de afiliado', n(d.total.cliques), `${pct(d.total.cliques, d.total.visitas)} das visitas · l.kbsa.app`)}
      </div>
      <div class="card"><div class="card-head"><h2>Funil do período</h2></div>
        <div class="row" style="flex-wrap:wrap;gap:18px;align-items:baseline">
          <div><div class="muted">Visitas</div><strong style="font-size:20px">${n(d.total.visitas)}</strong></div>
          <div class="muted">→</div>
          <div><div class="muted">Cliques nos blogs (l.kbsa.app)</div><strong style="font-size:20px">${n(d.total.cliques)}</strong> <span class="muted">${pct(d.total.cliques, d.total.visitas)}</span></div>
          <div class="muted">→</div>
          <div><div class="muted">Cliques aceitos no BigLinks (todas as origens)</div><strong style="font-size:20px">${bl.ok ? n(bl.cliques) : '—'}</strong></div>
          <div class="muted">→</div>
          <div><div class="muted">Vendas atribuídas pelo sck</div><strong style="font-size:20px">${vendas == null ? '—' : n(vendas)}</strong>${bl.ok ? ` <span class="muted">de ${n(bl.pedidos)} pedido(s)</span>` : ''}</div>
        </div>
        <p class="muted" style="font-size:12.5px;margin:10px 0 0">${bl.ok ? 'BigLinks: totais do workspace no período (blogs, Instagram, Telegram e o resto). Venda por blog depende do webhook da Cakto/Shopee chegar ao BigLinks.' : `BigLinks sem dado agora: ${esc(bl.motivo || 'indisponível')}.`}</p>
      </div>
      <div class="card"><div class="card-head"><h2>Por site</h2></div>
        ${tabela(['Site', 'Visitas', 'Visitantes', 'Cliques afiliado', 'Taxa'], d.porSite.map((s) => `<tr><td>${esc(s.site)}</td><td>${n(s.visitas)}</td><td>${n(s.visitantes)}</td><td>${n(s.cliques)}</td><td>${pct(s.cliques, s.visitas)}</td></tr>`))}
      </div>
      <div class="card"><div class="card-head"><h2>Por dia</h2></div>
        ${tabela(['Dia', 'Visitas', 'Visitantes', 'Cliques afiliado', 'Outras saídas'], d.porDia.map((x) => `<tr><td>${esc(dataBr(x.dia))}</td><td>${n(x.visitas)}</td><td>${n(x.visitantes)}</td><td>${n(x.cliques)}</td><td>${n(x.saidas - x.cliques)}</td></tr>`))}
      </div>
      <div class="card"><div class="card-head"><h2>Posts e páginas mais vistos</h2></div>
        ${tabela(['Site', 'Caminho', 'Visitas', 'Visitantes', 'Cliques'], d.porPost.map((x) => `<tr><td>${esc(x.site)}</td><td>${esc(x.caminho)}</td><td>${n(x.visitas)}</td><td>${n(x.visitantes)}</td><td>${n(x.cliques)}</td></tr>`))}
      </div>
      <div class="card"><div class="card-head"><h2>Origens</h2></div>
        <p class="muted" style="font-size:12.5px;margin:0 0 8px">utm_source quando o link tem; senão o domínio de quem mandou. "(interno)" é navegação dentro do próprio site.</p>
        ${tabela(['Origem', 'Visitas'], d.origens.map((x) => `<tr><td>${esc(x.origem)}</td><td>${n(x.visitas)}</td></tr>`))}
      </div>
      <div class="card"><div class="card-head"><h2>Links mais clicados</h2></div>
        ${tabela(['Destino', 'Cliques'], d.destinos.map((x) => `<tr><td>${esc(x.destino || '?')}</td><td>${n(x.cliques)}</td></tr>`))}
      </div>
      <div class="card"><div class="card-head"><h2>Aparelho e país</h2></div>
        <div class="row" style="flex-wrap:wrap;gap:24px;align-items:flex-start">
          <div style="flex:1;min-width:220px">${tabela(['Aparelho', 'Visitas'], d.aparelhos.map((x) => `<tr><td>${esc(x.aparelho)}</td><td>${n(x.visitas)}</td></tr>`))}</div>
          <div style="flex:1;min-width:220px">${tabela(['País', 'Visitas'], d.paises.map((x) => `<tr><td>${esc(x.pais)}</td><td>${n(x.visitas)}</td></tr>`))}</div>
        </div>
      </div>
      <div class="card"><div class="card-head"><h2>O que ficou de fora</h2></div>
        <p style="margin:0">Visitas da nossa rede no período: <strong>${n(d.internas)}</strong> (gravadas à parte, fora de todas as contas acima).</p>
        <p style="margin:6px 0 0">Desde que o servidor subiu: robôs e ferramentas ${n(d.descartes.robo)} · sem Origin do site ${n(d.descartes.origem)} · inválidos ${n(d.descartes.invalido)} · acima do limite ${n(d.descartes.limite)}.</p>
        <p class="muted" style="font-size:12.5px;margin:6px 0 0">${esc(d.regras)}</p>
      </div>`;
    for (const b of el.querySelectorAll('[data-dias]')) b.addEventListener('click', () => { dias = Number(b.dataset.dias); carregar(); });
  }
  await carregar();
}
