// Estúdio de UGC: elenco de 3 influenciadores (1 por rede), pauta da semana, fila de aprovação e placar.
// A tela nunca posta nada: o dono aprova, copia ou baixa a peça, posta à mão e marca como publicada.
const CSS_ID = 'ugc-css';
const CSS = `
.ugc { --yt: #d6453d; --ig: #c2407a; --tt: #1f9e95; display: grid; gap: 18px; min-width: 0; }
.ugc * { min-width: 0; }
.ugc .lead { margin: -8px 0 0; color: var(--ink-3); max-width: 70ch; }
.ugc .net-youtube { --net: var(--yt); } .ugc .net-instagram { --net: var(--ig); } .ugc .net-tiktok { --net: var(--tt); }
.ugc .paths { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
.ugc .path { padding: 12px 14px; display: grid; gap: 3px; border-left: 1px solid var(--line); font-size: 12.5px; }
.ugc .path:first-child { border-left: 0; }
.ugc .path b { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-3); font-weight: 700; }
.ugc .path strong { font-size: 13.5px; color: var(--ink-strong); display: flex; align-items: center; gap: 7px; }
.ugc .path .st { width: 8px; height: 8px; border-radius: 50%; background: var(--line-2); flex: none; }
.ugc .path .st.ok { background: var(--ok); } .ugc .path .st.warn { background: var(--warn); }
.ugc .path a { color: var(--info); font-weight: 600; }
.ugc .sec-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.ugc .sec-head h2 { font-size: 1.05rem; }
.ugc .sec-head .muted { font-size: 12.5px; }
.ugc .cast { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.ugc .pcard { position: relative; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 0; display: grid; grid-template-rows: auto 1fr auto; overflow: hidden; }
.ugc .pcard::before { content: ''; height: 4px; background: var(--net); display: block; }
.ugc .pc-top { display: flex; align-items: center; gap: 8px; padding: 12px 16px 0; font-size: 12px; font-weight: 650; color: var(--net); }
.ugc .pc-top .ritmo { color: var(--ink-3); font-weight: 500; margin-left: auto; }
.ugc .pc-body { padding: 10px 16px 14px; display: grid; gap: 10px; align-content: start; }
.ugc .who { display: flex; gap: 12px; align-items: center; }
.ugc .avatar { width: 48px; height: 48px; border-radius: 14px; flex: none; display: grid; place-items: center; font-weight: 800; font-size: 17px; color: #fff; background: var(--net); position: relative; }
.ugc .avatar i { position: absolute; right: -5px; bottom: -5px; font: 700 9.5px/1 var(--font); font-style: normal; background: var(--ink-strong); color: var(--panel); border: 2px solid var(--panel); border-radius: 6px; padding: 3px 4px; letter-spacing: .04em; }
.ugc .who h3 { font-size: 1.02rem; }
.ugc .who small { color: var(--ink-3); font-size: 12.5px; display: block; }
.ugc .tags { display: flex; gap: 6px; flex-wrap: wrap; }
.ugc .quote { margin: 0; font-size: 13px; color: var(--ink-2); border-left: 2px solid var(--net); padding: 2px 0 2px 10px; }
.ugc .mini { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--line); }
.ugc .mini div { padding: 10px 12px; border-left: 1px solid var(--line); }
.ugc .mini div:first-child { border-left: 0; }
.ugc .mini b { display: block; font: 600 1.15rem/1.1 var(--mono); color: var(--ink-strong); }
.ugc .mini span { font-size: 11.5px; color: var(--ink-3); }
.ugc .pc-foot { display: flex; gap: 8px; padding: 0 16px 14px; flex-wrap: wrap; }
.ugc .next { font-size: 12.5px; color: var(--ink-2); background: var(--bg); border-radius: 8px; padding: 8px 10px; }
.ugc .next b { color: var(--ink-3); font-weight: 650; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; display: block; }
.ugc .slot { border: 1.5px dashed var(--line-2); border-radius: 12px; padding: 18px 16px; display: grid; gap: 8px; align-content: center; justify-items: start; background: transparent; }
.ugc .slot .pc-top { padding: 0; }
.ugc .icon-net { width: 18px; height: 18px; flex: none; }
.ugc .hero { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 22px; display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 24px; align-items: center; }
.ugc .hero h2 { font-size: 1.3rem; margin-bottom: 6px; }
.ugc .hero p { color: var(--ink-2); }
.ugc .rec { display: grid; gap: 8px; }
.ugc .rec-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); }
.ugc .rec-row .bar { width: 4px; align-self: stretch; border-radius: 4px; background: var(--net); }
.ugc .rec-row strong { font-size: 13.5px; }
.ugc .rec-row small { color: var(--ink-3); display: block; font-size: 12px; }
.ugc .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); }
.ugc .tab { appearance: none; border: 0; background: none; font: 650 13.5px var(--font); color: var(--ink-3); padding: 10px 14px; min-height: 44px; border-bottom: 2px solid transparent; margin-bottom: -1px; cursor: pointer; display: inline-flex; align-items: center; }
.ugc .tab.on { color: var(--ink-strong); border-bottom-color: var(--brand); }
.ugc .tab .n { margin-left: 7px; font: 600 11px var(--mono); background: var(--bg); border: 1px solid var(--line); border-radius: 999px; padding: 1px 7px; color: var(--ink-2); }
.ugc .toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ugc .week { display: inline-flex; align-items: center; border: 1px solid var(--line-2); border-radius: 8px; background: var(--panel); }
.ugc .week button { appearance: none; border: 0; background: none; min-width: 36px; min-height: 36px; font: 600 15px var(--font); color: var(--ink-2); cursor: pointer; }
.ugc .week span { font: 600 13px var(--font); padding: 0 6px; white-space: nowrap; }
.ugc .days { display: grid; gap: 14px; }
.ugc .day h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-3); margin: 0 0 6px; display: flex; gap: 8px; align-items: center; }
.ugc .day.hoje h3 { color: var(--brand-2); }
.ugc .day.hoje h3::after { content: 'hoje'; font-size: 10.5px; background: var(--info-soft); color: var(--info); padding: 1px 7px; border-radius: 999px; letter-spacing: .04em; }
.ugc .items { display: grid; gap: 6px; }
.ugc .item { display: grid; grid-template-columns: 4px 150px minmax(0, 1fr) auto auto; gap: 14px; align-items: center; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px 8px 0; }
.ugc .item .bar { align-self: stretch; background: var(--net); border-radius: 0 4px 4px 0; }
.ugc .item .t { display: grid; gap: 2px; }
.ugc .item .t strong { font-size: 14px; color: var(--ink-strong); }
.ugc .item .t em { font-style: normal; color: var(--ink-3); font-size: 12.5px; }
.ugc .item .meta { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; font-size: 12px; color: var(--ink-3); }
.ugc .item .acts { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.ugc .who-line { font-weight: 650; color: var(--net); font-size: 12px; line-height: 1.3; }
.ugc .item .who-line small { display: block; color: var(--ink-3); font-weight: 500; }
.ugc .how { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); }
.ugc .how div { padding: 14px 16px; border-left: 1px solid var(--line); display: grid; gap: 4px; align-content: start; }
.ugc .how div:first-child { border-left: 0; }
.ugc .how b { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--brand-2); }
.ugc .how strong { color: var(--ink-strong); font-size: 14px; }
.ugc .how span { color: var(--ink-3); font-size: 12.5px; }
.ugc .filters { display: flex; gap: 6px; flex-wrap: wrap; }
.ugc .chip { appearance: none; border: 1px solid var(--line-2); background: var(--panel); border-radius: 999px; padding: 0 12px; min-height: 34px; font: 600 12.5px var(--font); color: var(--ink-2); cursor: pointer; display: inline-flex; gap: 6px; align-items: center; }
.ugc .chip.on { background: var(--ink-strong); color: var(--panel); border-color: var(--ink-strong); }
.ugc .chip b { font: 600 11.5px var(--mono); opacity: .8; }
.ugc .pecas { display: grid; gap: 10px; }
.ugc .peca { background: var(--panel); border: 1px solid var(--line); border-left: 4px solid var(--net); border-radius: 10px; }
.ugc .peca-head { display: flex; gap: 10px; align-items: center; padding: 12px 14px; flex-wrap: wrap; cursor: pointer; }
.ugc .peca-head .t { display: grid; gap: 2px; flex: 1 1 220px; }
.ugc .peca-head strong { color: var(--ink-strong); }
.ugc .peca-body { border-top: 1px solid var(--line); padding: 14px; display: grid; gap: 12px; }
.ugc .fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
.ugc .fields .wide { grid-column: 1 / -1; }
.ugc .fields > * { align-content: start; }
.ugc [role=tabpanel] { display: grid; gap: 14px; }
.ugc .pf { display: grid; gap: 6px; font-size: 13px; }
.ugc .pf-row { display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; border-radius: 8px; }
.ugc .pf-row.bad { background: var(--bad-soft); color: var(--bad); }
.ugc .pf-row.warn { background: var(--warn-soft); color: var(--warn); }
.ugc .pf-row.ok { background: var(--ok-soft); color: var(--ok); }
.ugc .pf-row b { font-weight: 700; }
.ugc .linkbox { display: flex; gap: 6px; align-items: stretch; }
.ugc .linkbox input { font: 12px var(--mono); }
.ugc .nums { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12.5px; color: var(--ink-3); }
.ugc .nums b { font: 600 14px var(--mono); color: var(--ink-strong); margin-right: 3px; }
.ugc .result { border-radius: 10px; padding: 14px 16px; background: var(--panel); border: 1px solid var(--line); display: grid; gap: 8px; }
.ugc .result ul { margin: 0; padding-left: 18px; display: grid; gap: 4px; font-size: 13px; }
.ugc .score { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.ugc .score table { font-size: 14px; }
.ugc .score th, .ugc .score td { padding: 12px 14px; }
.ugc .score td.n { font: 600 15px var(--mono); color: var(--ink-strong); white-space: nowrap; }
.ugc .score .hbar { height: 6px; border-radius: 3px; background: var(--net); margin-top: 6px; min-width: 2px; }
.ugc .score .pname { display: flex; gap: 10px; align-items: center; }
.ugc .score .pname .avatar { width: 34px; height: 34px; border-radius: 10px; font-size: 13px; }
.ugc .note { font-size: 12.5px; color: var(--ink-3); }
.ugc .empty-state { border: 1.5px dashed var(--line-2); border-radius: 12px; padding: 26px 20px; display: grid; gap: 10px; justify-items: center; text-align: center; color: var(--ink-2); }
.ugc .empty-state h3 { font-size: 1rem; }
.ugc .empty-state p { max-width: 56ch; color: var(--ink-3); margin: 0; }
.ugc details.cfg { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 0 14px; }
.ugc details.cfg summary { min-height: 44px; display: flex; align-items: center; cursor: pointer; font-weight: 650; font-size: 13.5px; }
.ugc details.cfg > div { padding: 0 0 14px; display: flex; gap: 10px; align-items: end; flex-wrap: wrap; }
dialog.ugc-dlg { width: min(760px, calc(100% - 24px)); max-height: calc(100vh - 24px); }
dialog.ugc-dlg form { padding: 0; gap: 0; }
dialog.ugc-dlg .dlg-head { padding: 18px 20px 12px; display: grid; gap: 4px; border-bottom: 1px solid var(--line); }
dialog.ugc-dlg .dlg-body { padding: 16px 20px; display: grid; gap: 14px; align-content: start; overflow-y: auto; max-height: calc(100vh - 210px); }
dialog.ugc-dlg .dlg-foot { padding: 12px 20px 16px; display: flex; gap: 8px; justify-content: flex-end; border-top: 1px solid var(--line); flex-wrap: wrap; }
dialog.ugc-dlg .steps { display: flex; gap: 6px; list-style: none; padding: 0; margin: 6px 0 0; font-size: 12.5px; font-weight: 650; color: var(--ink-3); flex-wrap: wrap; }
dialog.ugc-dlg .steps li { padding: 4px 10px; border-radius: 999px; border: 1px solid var(--line); }
dialog.ugc-dlg .steps li.on { background: var(--ink-strong); color: var(--panel); border-color: var(--ink-strong); }
dialog.ugc-dlg .steps li.done { color: var(--ok); border-color: var(--ok-soft); background: var(--ok-soft); }
dialog.ugc-dlg .fmt-row { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 12px; align-items: start; padding: 12px 0; border-top: 1px solid var(--line); }
dialog.ugc-dlg .fmt-row:first-child { border-top: 0; }
dialog.ugc-dlg .fmt-net { display: flex; gap: 8px; align-items: center; font-weight: 700; color: var(--net); padding-top: 8px; }
dialog.ugc-dlg .seg { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
dialog.ugc-dlg .seg button { appearance: none; text-align: left; border: 1.5px solid var(--line); background: var(--panel); border-radius: 9px; padding: 9px 10px; font: 600 13px var(--font); color: var(--ink); cursor: pointer; display: grid; gap: 2px; align-content: start; min-height: 44px; }
dialog.ugc-dlg .seg button small { font-weight: 500; color: var(--ink-3); font-size: 11.5px; }
dialog.ugc-dlg .seg button.on { border-color: var(--brand); box-shadow: 0 0 0 3px var(--gold-soft); }
dialog.ugc-dlg .subtabs { display: flex; gap: 6px; flex-wrap: wrap; }
dialog.ugc-dlg .palette { display: flex; gap: 8px; }
dialog.ugc-dlg .palette input { width: 52px; height: 40px; }
dialog.ugc-dlg .rule { font-size: 12.5px; padding: 9px 11px; border-radius: 8px; background: var(--info-soft); color: var(--info); }
dialog.ugc-dlg .auth { display: grid; gap: 4px; padding: 10px 12px; border-radius: 9px; border: 1px solid var(--line); background: var(--bg); }
dialog.ugc-dlg .review { display: grid; gap: 8px; }
dialog.ugc-dlg .review .rec-row { background: var(--bg); }
dialog.ugc-dlg .pathopt { display: grid; gap: 6px; padding: 14px; border: 1px solid var(--line); border-radius: 10px; }
dialog.ugc-dlg .pathopt h3 { display: flex; gap: 8px; align-items: center; }
dialog.ugc-dlg .pathopt p { margin: 0; font-size: 13px; color: var(--ink-2); }
dialog.ugc-dlg .cost { font: 600 13px var(--mono); color: var(--ink-strong); }
@media (max-width: 1180px) { .ugc .item { grid-template-columns: 4px 130px minmax(0, 1fr) auto; } .ugc .item .meta { grid-column: 3; } .ugc .item .acts { grid-column: 4; grid-row: 1 / span 2; } }
@media (max-width: 960px) { .ugc .cast { grid-template-columns: 1fr; } .ugc .hero { grid-template-columns: 1fr; } .ugc .how { grid-template-columns: 1fr 1fr; }
  .ugc .how div:nth-child(3) { border-left: 0; } .ugc .how div:nth-child(n+3) { border-top: 1px solid var(--line); } }
@media (max-width: 700px) {
  .ugc .paths { grid-template-columns: 1fr; }
  .ugc .path { border-left: 0; border-top: 1px solid var(--line); }
  .ugc .path:first-child { border-top: 0; }
  .ugc .btn, .ugc .chip, .ugc .week button { min-height: 44px; }
  .ugc .btn.sm { min-height: 44px; padding: 0 12px; }
  .ugc .btn.icon { width: 44px; }
  .ugc .item { grid-template-columns: 4px minmax(0, 1fr); padding-right: 12px; gap: 6px 12px; }
  .ugc .item > :not(.bar) { grid-column: 2; grid-row: auto; }
  .ugc .item .bar { grid-row: 1 / span 4; }
  .ugc .item .who-line small { display: inline; }
  .ugc .item .acts { justify-content: flex-start; }
  .ugc .how { grid-template-columns: 1fr; }
  .ugc .how div, .ugc .how div:nth-child(3) { border-left: 0; border-top: 1px solid var(--line); }
  .ugc .how div:first-child { border-top: 0; }
  .ugc .fields { grid-template-columns: 1fr; }
  .ugc .score thead { display: none; }
  .ugc .score tr { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--line); }
  .ugc .score tr:last-child { border-bottom: 0; }
  .ugc .score td { border: 0; padding: 8px 14px; }
  .ugc .score td.pn { grid-column: 1 / -1; padding-top: 14px; }
  .ugc .score td.n::before { content: attr(data-l); display: block; font: 500 11.5px var(--font); color: var(--ink-3); }
  .ugc .tabs { overflow-x: auto; }
  .ugc .tab { padding: 10px 12px; }
  .ugc .tab .lg { display: none; }
  .ugc .hero { padding: 18px; }
  /* celular: elenco enxuto e o trabalho (abas) logo abaixo; os caminhos de produção vão para o fim */
  .ugc .pcard .quote, .ugc .pcard .next { display: none; }
  .ugc .pc-body { padding-bottom: 10px; }
  .ugc .mini b { font-size: 1rem; }
  .ugc .mini div { padding: 8px 12px; }
  .ugc .paths { order: 1; }
  .ugc details.cfg { order: 2; }
  .ugc input:not([type=checkbox]), .ugc select { min-height: 44px; }
  dialog.ugc-dlg input:not([type=checkbox]):not([type=color]), dialog.ugc-dlg select { min-height: 44px; }
  dialog.ugc-dlg .palette input { width: 56px; height: 44px; }
  .ugc .score td.n:last-child { grid-column: 1 / -1; }
  /* celular: o diálogo ocupa a tela, rola inteiro e os botões ficam presos embaixo */
  dialog.ugc-dlg { display: block; width: 100%; max-width: 100%; max-height: 100%; height: 100%; margin: 0; border-radius: 0; overflow-y: auto; }
  dialog.ugc-dlg form { display: flex; flex-direction: column; min-height: 100%; }
  dialog.ugc-dlg .dlg-body { max-height: none; overflow: visible; flex: 1 0 auto; }
  dialog.ugc-dlg .dlg-foot { position: sticky; bottom: 0; background: var(--panel); z-index: 2; box-shadow: 0 -8px 16px -12px rgb(0 0 0 / .25); }
  dialog.ugc-dlg .fmt-row { grid-template-columns: 1fr; gap: 6px; }
  dialog.ugc-dlg .fmt-net { padding-top: 0; }
  dialog.ugc-dlg .seg { grid-template-columns: 1fr; }
  dialog.ugc-dlg .btn { min-height: 44px; }
}
`;

const ICON = {
  youtube: '<svg class="icon-net" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="4" fill="currentColor"/><path d="M10 9.2v5.6l4.8-2.8z" fill="#fff"/></svg>',
  instagram: '<svg class="icon-net" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none"/></svg>',
  tiktok: '<svg class="icon-net" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h3c.3 2 1.6 3.4 3.5 3.6v3c-1.4 0-2.6-.4-3.5-1v6.2a5.3 5.3 0 1 1-5.3-5.3c.3 0 .6 0 .8.1v3.1a2.3 2.3 0 1 0 1.5 2.1z" fill="currentColor"/></svg>',
};
const REDES = ['youtube', 'instagram', 'tiktok'];
const ORIGEM = { agenda: 'Agenda', blog: 'Blog', insight: 'Insight', modelo: 'Modelo', manual: 'Manual' };
const CAMINHO = { modelo: 'Modelo de texto', api: 'Minha IA', mcp: 'IA conectada', manual: 'Escrita à mão' };
const PECA_F = { rascunho: 'em rascunho', aprovado: 'aprovada', publicado: 'publicada', medido: 'medida' };
const PILL_PECA = { rascunho: 'info', aprovado: 'ok', publicado: 'gold', medido: 'ok' };

export async function render(el, ctx) {
  const { api, S, esc, toast, can, fmtDate } = ctx;
  if (!document.getElementById(CSS_ID)) document.head.insertAdjacentHTML('beforeend', `<style id="${CSS_ID}">${CSS}</style>`);
  const slug = S.tenant.slug;
  const podeEditar = can('ugc.edit');
  const podeAprovar = can('ugc.approve');
  const st = { d: null, aba: null, semana: null, filtro: 'rascunho', janela: 'd7', aberta: null, resultado: null, quem: 'todos' };
  // diálogo aberto não sobrevive à troca de tela
  window.addEventListener('hashchange', () => document.getElementById('ugc-dlg')?.close(), { once: true });
  const n = (v) => Number(v || 0).toLocaleString('pt-BR');
  const iniciais = (nome) => String(nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const dataCurta = (dia) => { const [y, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' }); };
  const diaSemana = (dia) => { const [y, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'short' }).replace('.', ''); };
  const persona = (id) => st.d.elenco.find((p) => p.id === id);
  const rede = (id) => st.d.redes.find((r) => r.id === id);
  const copiar = async (texto) => {
    try { await navigator.clipboard.writeText(texto); toast('Copiado.'); } catch {
      const t = document.createElement('textarea'); t.value = texto; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); toast('Copiado.');
    }
  };
  const falhou = (e) => toast(e.message, true);

  async function carregar() {
    st.d = await api('GET', `/api/t/${slug}/ugc${st.semana ? `?semana=${st.semana}` : ''}`);
    st.semana = st.d.semana.inicio;
    if (!st.aba) st.aba = st.d.pecas.some((x) => x.status === 'rascunho') ? 'fila' : 'pauta';
    desenhar();
  }

  // ---------------------------------------------------------------- topo: os três caminhos de produção, com o estado real
  function caminhosHtml() {
    const ia = st.d.ia;
    const apiTxt = { pronta: [`${esc(ia.api.modelo)}`, 'ok', `${n(ia.api.usadas)} de ${n(ia.api.teto)} gerações neste mês · ${esc(ia.api.estimativa?.texto || '')}`],
      teto: ['Teto do mês atingido', 'warn', `${n(ia.api.usadas)} de ${n(ia.api.teto)} gerações. Aumente o teto em Configurações do estúdio.`],
      nao_validada: ['Chave não validada', 'warn', `<a href="#/t/${esc(slug)}/ia">Testar de novo em Conectar sua IA</a>`],
      sem_chave: ['Sem chave de API', '', `<a href="#/t/${esc(slug)}/ia">Conecte sua IA em Conectar sua IA</a>`] }[ia.api.estado];
    return `<div class="paths" aria-label="Como produzir as peças">
      <div class="path"><b>IA conectada (MCP)</b><strong><span class="st ${ia.mcp.conectado ? 'ok' : ''}"></span>${ia.mcp.conectado ? `Conectada${ia.mcp.conexoes > 1 ? ` · ${ia.mcp.conexoes} conexões` : ''}` : 'Nenhuma IA conectada'}</strong>
        <span class="muted">${ia.mcp.conectado ? 'Peça para a sua IA escrever a pauta: ela salva como rascunho.' : `<a href="#/t/${esc(slug)}/ia">Conectar sua IA</a> e pedir as peças por conversa.`}</span></div>
      <div class="path"><b>Minha IA (chave própria)</b><strong><span class="st ${apiTxt[1]}"></span>${apiTxt[0]}</strong><span class="muted">${apiTxt[2]}</span></div>
      <div class="path"><b>Modelo de texto</b><strong><span class="st ok"></span>Sempre disponível</strong><span class="muted">Esqueleto na voz do influenciador para você preencher, sem IA.</span></div>
    </div>`;
  }

  // ---------------------------------------------------------------- elenco
  function cardPersona(p) {
    const r = rede(p.rede);
    const pl = st.d.placar.find((x) => x.persona_id === p.id)?.d7 || {};
    const prox = st.d.pautas.find((x) => x.persona_id === p.id && x.dia >= st.d.semana.hoje && !x.peca_id);
    const bordao = p.voz?.bordoes?.[0];
    const status = { ativo: ['ok', 'Ativo'], rascunho: ['info', 'Rascunho'], pausado: ['warn', 'Pausado'] }[p.status] || ['', p.status];
    return `<article class="pcard net-${esc(p.rede)}">
      <div class="pc-top">${ICON[p.rede]}${esc(r.nome)}<span class="ritmo">${esc(r.ritmo)}</span></div>
      <div class="pc-body">
        <div class="who"><div class="avatar">${esc(iniciais(p.nome))}${p.rotulo_ia ? '<i>IA</i>' : ''}</div>
          <div><h3>${esc(p.nome)}</h3><small>${esc(p.papel || p.formatoNome)}${p.pessoa ? ` · ${esc(p.pessoa)}` : ''}</small></div></div>
        <div class="tags"><span class="pill">${esc(p.formatoNome)}</span><span class="pill ${status[0]}"><span class="dot"></span>${status[1]}</span>
          ${p.precisaAutorizacao ? '<span class="pill bad">Falta autorização por escrito</span>' : ''}</div>
        ${bordao ? `<p class="quote">“${esc(bordao)}” ${p.voz.jeito ? `<span class="muted">· ${esc(p.voz.jeito.split('.')[0])}</span>` : ''}</p>` : ''}
        ${prox ? `<div class="next"><b>Próxima pauta · ${esc(diaSemana(prox.dia))} ${esc(dataCurta(prox.dia))}</b>${esc(prox.tema)}</div>` : ''}
      </div>
      <div>
        <div class="mini" title="Do link rastreado de ${esc(p.nome)}, últimos 7 dias"><div><b>${n(pl.cliques)}</b><span>cliques · 7d</span></div><div><b>${n(pl.leads)}</b><span>leads</span></div><div><b>${n(pl.conversoes)}</b><span>conversões</span></div></div>
        <div class="pc-foot" style="padding-top:12px">${p.link ? `<button class="btn sm" type="button" data-act="copiar-link" data-v="${esc(p.link)}">Copiar link rastreado</button>` : ''}
          ${podeEditar ? `<button class="btn sm" type="button" data-act="editar-persona" data-id="${esc(p.id)}">Editar ficha</button>` : ''}</div>
      </div>
    </article>`;
  }
  function vaga(redeId) {
    const r = rede(redeId);
    return `<div class="slot net-${esc(redeId)}"><div class="pc-top">${ICON[redeId]}${esc(r.nome)}</div>
      <strong>Sem influenciador nesta rede</strong><span class="note">${esc(r.peca)}, ${esc(r.ritmo)}.</span>
      ${podeEditar ? `<button class="btn sm primary" type="button" data-act="wizard">Montar a ficha</button>` : ''}</div>`;
  }
  function elencoHtml() {
    const e = st.d.elenco;
    if (!e.length) {
      const sug = st.d.sugestoes.fichas;
      return `<section class="hero">
        <div><h2>Monte o elenco: 3 influenciadores, um em cada rede</h2>
          <p>Cada influenciador vira um canal da operação, com voz própria e link rastreado. O estúdio escreve roteiro, legenda, hashtags, capa e briefing; você aprova, posta à mão e mede quem traz cadastro.</p>
          <p class="note">Recomendado para começar: 2 personas de IA e 1 rosto da marca. Dá para trocar o formato de cada um.</p>
          ${podeEditar ? '<div class="row" style="margin-top:12px"><button class="btn primary" type="button" data-act="wizard">Montar o elenco recomendado</button></div>'
            : '<p class="note">Peça a quem cuida do marketing para montar o elenco.</p>'}</div>
        <div class="rec">${sug.map((f) => `<div class="rec-row net-${esc(f.rede)}"><span class="bar"></span><span style="color:var(--net)">${ICON[f.rede]}</span>
          <div><strong>${esc(f.nome)}</strong><small>${esc(rede(f.rede).nome)} · ${esc(st.d.formatos[f.formato].nome)} · ${esc(f.papel)}</small></div></div>`).join('')}</div>
      </section>`;
    }
    const por = Object.fromEntries(e.map((p) => [p.rede, p]));
    return `<section class="cast" aria-label="Elenco">${REDES.map((r) => (por[r] ? cardPersona(por[r]) : vaga(r))).join('')}</section>`;
  }

  // ---------------------------------------------------------------- abas
  function abasHtml() {
    const rasc = st.d.pecas.filter((x) => x.status === 'rascunho').length;
    const aba = (id, label, extra = '') => `<button class="tab ${st.aba === id ? 'on' : ''}" type="button" role="tab" aria-selected="${st.aba === id}" data-act="aba" data-v="${id}">${label}${extra}</button>`;
    return `<div class="tabs" role="tablist">${aba('pauta', 'Pauta<span class="lg">&nbsp;da semana</span>', `<span class="n">${st.d.pautas.length}</span>`)}${aba('fila', 'Aprovação', rasc ? `<span class="n">${rasc}</span>` : '')}${aba('placar', 'Placar')}</div>`;
  }

  // ---------------------------------------------------------------- pauta
  function pautaHtml() {
    const sem = st.d.semana;
    const nav = `<span class="week"><button type="button" data-act="semana" data-v="${esc(sem.anterior)}" aria-label="Semana anterior">‹</button><span>${esc(dataCurta(sem.inicio))} a ${esc(dataCurta(sem.fim))}</span><button type="button" data-act="semana" data-v="${esc(sem.proxima)}" aria-label="Próxima semana">›</button></span>`;
    const temPropostas = st.d.pautas.some((p) => p.status === 'proposta');
    const bar = `<div class="toolbar">${nav}<span class="spacer"></span>
      ${podeEditar && st.d.elenco.length ? `${st.d.pautas.length ? '' : '<button class="btn primary" type="button" data-act="propor">Propor a pauta da semana</button>'}
        ${temPropostas ? '<button class="btn" type="button" data-act="aprovar-pauta">Aprovar a pauta</button>' : ''}
        <button class="btn" type="button" data-act="nova-pauta">Nova pauta</button>` : ''}</div>`;
    if (!st.d.elenco.length) return `${bar}<div class="empty-state"><h3>A pauta sai do elenco</h3><p>Monte os influenciadores primeiro. Depois o sistema propõe 7 pautas por semana para cada um, a partir da agenda do site, do blog e dos insights.</p>${podeEditar ? '<button class="btn primary" type="button" data-act="wizard">Montar o elenco</button>' : ''}</div>`;
    if (!st.d.pautas.length) return `${bar}<div class="empty-state"><h3>Nenhuma pauta nesta semana</h3><p>O sistema propõe a semana cruzando o que a operação já tem: agenda de torneios e eventos do site, posts do blog e insights aprovados. O que faltar vem de modelos honestos do nicho. Você edita, reordena ou apaga.</p>${podeEditar ? '<button class="btn primary" type="button" data-act="propor">Propor a pauta da semana</button>' : ''}</div>`;
    const dias = [...Array(7)].map((_, i) => { const [y, m, d] = sem.inicio.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + i)); return t.toISOString().slice(0, 10); });
    const quem = `<div class="filters" aria-label="Filtrar por influenciador"><button class="chip ${st.quem === 'todos' ? 'on' : ''}" type="button" data-act="quem" data-v="todos">Todos <b>${st.d.pautas.length}</b></button>${st.d.elenco.map((x) =>
      `<button class="chip net-${esc(x.rede)} ${st.quem === x.id ? 'on' : ''}" type="button" data-act="quem" data-v="${esc(x.id)}">${esc(x.nome)} <b>${st.d.pautas.filter((p) => p.persona_id === x.id).length}</b></button>`).join('')}</div>`;
    const visiveis = st.d.pautas.filter((p) => st.quem === 'todos' || p.persona_id === st.quem);
    return `${bar}${quem}<div class="days">${dias.map((dia) => {
      const itens = visiveis.filter((p) => p.dia === dia).sort((a, b) => a.ordem - b.ordem || REDES.indexOf(persona(a.persona_id)?.rede) - REDES.indexOf(persona(b.persona_id)?.rede));
      if (!itens.length) return '';
      return `<section class="day ${dia === sem.hoje ? 'hoje' : ''}"><h3>${esc(diaSemana(dia))} · ${esc(dataCurta(dia))}</h3><div class="items">${itens.map((p, i) => itemPauta(p, i, itens)).join('')}</div></section>`;
    }).join('')}</div>`;
  }
  function itemPauta(p, i, irmaos) {
    const pe = persona(p.persona_id);
    const peca = p.peca_id ? st.d.pecas.find((x) => x.id === p.peca_id) : null;
    return `<div class="item net-${esc(pe?.rede || '')}"><span class="bar"></span>
      <span class="who-line">${esc(pe?.nome || '')}<small> · ${esc(rede(pe?.rede)?.curto || '')}</small></span>
      <div class="t"><strong>${esc(p.tema)}</strong>${p.gancho ? `<em>${esc(p.gancho)}</em>` : ''}</div>
      <span class="meta">${p.origem !== 'modelo' ? `<span class="pill info">${esc(ORIGEM[p.origem] || p.origem)}</span>` : ''}${p.status === 'aprovada' ? '<span class="pill ok"><span class="dot"></span>Aprovada</span>' : ''}
        ${peca ? `<span class="pill ${PILL_PECA[peca.status]}">Peça ${esc(PECA_F[peca.status] || peca.statusNome)}</span>` : ''}</span>
      <div class="acts">${peca ? `<button class="btn sm" type="button" data-act="ver-peca" data-id="${esc(peca.id)}">Ver peça</button>`
        : podeEditar ? `<button class="btn sm primary" type="button" data-act="produzir" data-id="${esc(p.id)}">Produzir</button>` : ''}
        ${podeEditar ? `<button class="btn sm" type="button" data-act="editar-pauta" data-id="${esc(p.id)}">Editar</button>
          ${irmaos.length > 1 ? `<button class="btn sm icon" type="button" data-act="subir" data-id="${esc(p.id)}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>` : ''}
          <button class="btn sm icon danger" type="button" data-act="apagar-pauta" data-id="${esc(p.id)}" aria-label="Apagar pauta">×</button>` : ''}</div>
    </div>`;
  }

  // ---------------------------------------------------------------- fila de aprovação
  function filaHtml() {
    const cont = (s) => st.d.pecas.filter((x) => x.status === s).length;
    const lista = st.d.pecas.filter((x) => x.status === st.filtro);
    const chips = ['rascunho', 'aprovado', 'publicado', 'medido'].map((s) => `<button class="chip ${st.filtro === s ? 'on' : ''}" type="button" data-act="filtro" data-v="${s}">${{ rascunho: 'Rascunho', aprovado: 'Aprovado', publicado: 'Publicado', medido: 'Medido' }[s]} <b>${cont(s)}</b></button>`).join('');
    const res = st.resultado ? `<div class="result" role="status"><strong>${n(st.resultado.aprovadas.length)} aprovada(s) · ${n(st.resultado.recusadas.length)} não passaram</strong>
      ${st.resultado.recusadas.length ? `<ul>${st.resultado.recusadas.map((r) => `<li><b>${esc(r.titulo)}</b>${r.persona ? ` (${esc(r.persona)})` : ''}: ${esc(r.motivos[0])}${r.motivos.length > 1 ? ` <span class="muted">e mais ${r.motivos.length - 1}</span>` : ''}</li>`).join('')}</ul>` : ''}
      ${st.resultado.nota ? `<span class="note">${esc(st.resultado.nota)}</span>` : ''}</div>` : '';
    const bar = `<div class="toolbar"><div class="filters">${chips}</div><span class="spacer"></span>${podeAprovar && cont('rascunho') ? '<button class="btn primary" type="button" data-act="aprovar-semana">Aprovar a semana</button>' : ''}</div>`;
    const vazio = { rascunho: ['Nada esperando aprovação', 'Produza as peças a partir da pauta: pelo modelo de texto, pela sua IA ou pela IA conectada.', st.d.pautas.length ? ['Ir para a pauta', 'aba', 'pauta'] : null],
      aprovado: ['Nenhuma peça aprovada', 'Peças aprovadas ficam aqui para você copiar ou baixar, postar à mão e marcar como publicada.', null],
      publicado: ['Nenhuma peça publicada', 'Depois de postar, cole o endereço do post na peça aprovada.', null],
      medido: ['Ainda sem números', 'Na peça publicada, informe as views que a rede mostra. Cliques, leads e conversões o portal soma sozinho.', null] }[st.filtro];
    const corpo = lista.length ? `<div class="pecas">${lista.map(cardPeca).join('')}</div>`
      : `<div class="empty-state"><h3>${vazio[0]}</h3><p>${vazio[1]}</p>${vazio[2] ? `<button class="btn" type="button" data-act="${vazio[2][1]}" data-v="${vazio[2][2]}">${vazio[2][0]}</button>` : ''}</div>`;
    return `${bar}${res}${corpo}`;
  }
  function resumoPreflight(x) {
    const pf = x.preflight;
    if (x.pendente) return '<span class="pill warn">Falta preencher o modelo</span>';
    if (pf.ok) return `<span class="pill ok"><span class="dot"></span>Preflight ok${pf.avisos.length ? ` · ${pf.avisos.length} aviso(s)` : ''}</span>`;
    return `<span class="pill bad"><span class="dot"></span>${new Set(pf.bloqueios.map((b) => `${b.regra}|${b.parte}`)).size + pf.faltando.length} problema(s)</span>`;
  }
  function preflightLista(pf, pendente) {
    const linhas = [];
    if (pendente) linhas.push('<div class="pf-row warn"><span><b>Modelo:</b> ainda tem trecho “[escreva aqui…]” para preencher.</span></div>');
    // um alerta por regra e parte, com os trechos juntos (texto ruim não vira parede de alertas)
    const agrupar = (lista) => { const m = new Map(); for (const x of lista) { const k = `${x.regra}|${x.parte || ''}`; if (!m.has(k)) m.set(k, { ...x, trechos: [] }); if (x.trecho) m.get(k).trechos.push(x.trecho); } return [...m.values()]; };
    const trechos = (g) => (g.trechos.length ? `${[...new Set(g.trechos)].slice(0, 4).map((t) => `“${esc(t)}”`).join(', ')}. ` : '');
    for (const g of agrupar(pf.bloqueios)) linhas.push(`<div class="pf-row bad"><span><b>Bloqueia${g.parte ? ` (${esc(g.parte)})` : ''}:</b> ${trechos(g)}${esc(g.motivo)}</span></div>`);
    for (const f of pf.faltando) linhas.push(`<div class="pf-row bad"><span><b>Falta:</b> ${esc(f.trecho)}. ${esc(f.motivo)}</span></div>`);
    for (const g of agrupar(pf.avisos)) linhas.push(`<div class="pf-row warn"><span><b>Aviso:</b> ${trechos(g)}${esc(g.motivo)}</span></div>`);
    if (!linhas.length) linhas.push('<div class="pf-row ok"><span><b>Preflight ok:</b> sem promessa, sem bônus e com tudo o que a legenda exige.</span></div>');
    return linhas.join('');
  }
  function cardPeca(x) {
    const pe = persona(x.persona_id);
    const r = rede(x.rede);
    const aberta = st.aberta === x.id;
    const editavel = podeEditar && ['rascunho', 'aprovado'].includes(x.status);
    const ro = editavel ? '' : 'readonly';
    const campo = (k, label, rows, wide = true) => `<label class="field ${wide ? 'wide' : ''}">${label}<textarea data-campo="${k}" rows="${rows}" ${ro}>${esc(x[k])}</textarea></label>`;
    return `<article class="peca net-${esc(x.rede)}" id="peca-${esc(x.id)}">
      <div class="peca-head" data-act="abrir" data-id="${esc(x.id)}" role="button" tabindex="0" aria-expanded="${aberta}">
        <div class="t"><span class="who-line">${esc(pe?.nome || 'Influenciador removido')} · ${esc(r?.curto || x.rede)}</span><strong>${esc(x.titulo || x.capa || 'Peça sem título')}</strong>
          <span class="note">${esc(CAMINHO[x.caminho] || x.caminho)}${x.modelo_ia && x.caminho === 'api' ? ` · ${esc(x.modelo_ia)}` : ''} · ${esc(fmtDate(x.criadoEm))}</span></div>
        ${resumoPreflight(x)}<span class="pill ${PILL_PECA[x.status]}"><span class="dot"></span>${esc(x.statusNome)}</span>
      </div>
      ${aberta ? `<div class="peca-body">
        <div class="fields">${campo('roteiro', 'Roteiro', 6)}${campo('legenda', 'Legenda', 9, false)}<div class="field" style="display:grid;gap:12px">${campo('hashtags', 'Hashtags', 2)}${campo('capa', 'Texto de capa', 2)}</div>${campo('briefing', pe?.formato === 'ia' ? 'Briefing (produção da persona de IA)' : 'Briefing para quem grava', 5)}</div>
        <div class="pf" data-pf>${preflightLista(x.preflight, x.pendente)}</div>
        ${x.link ? `<div class="field"><span style="font-size:12.5px;font-weight:600;color:var(--ink-2)">Link desta peça (põe na bio ou no CTA)</span><div class="linkbox"><input readonly value="${esc(x.link)}"><button class="btn sm" type="button" data-act="copiar-link" data-v="${esc(x.link)}">Copiar</button></div></div>` : ''}
        ${x.numeros ? `<div class="nums"><span><b>${n(x.views)}</b>views informadas</span><span><b>${n(x.numeros.cliques)}</b>cliques</span><span><b>${n(x.numeros.leads)}</b>leads</span><span><b>${n(x.numeros.conversoes)}</b>conversões</span>${x.postUrl ? `<a href="${esc(x.postUrl)}" target="_blank" rel="noopener">Abrir o post</a>` : ''}</div>` : ''}
        <div class="row">
          ${editavel ? `<button class="btn primary" type="button" data-act="salvar-peca" data-id="${esc(x.id)}">Salvar texto</button>
            ${st.d.operacao.exigeJogo || pe?.rotulo_ia ? `<button class="btn" type="button" data-act="rodape" data-id="${esc(x.id)}">Completar rodapé obrigatório</button>` : ''}` : ''}
          ${x.status === 'rascunho' && podeAprovar ? `<button class="btn gold" type="button" data-act="aprovar" data-id="${esc(x.id)}">Aprovar</button>` : ''}
          ${x.status === 'aprovado' ? `<button class="btn" type="button" data-act="copiar-legenda" data-id="${esc(x.id)}">Copiar legenda</button>` : ''}
          <a class="btn" href="/api/t/${esc(slug)}/ugc/pecas/${esc(x.id)}/baixar" download>Baixar .txt</a>
          ${x.status === 'aprovado' && podeAprovar && r?.calendarioConectado && !x.calendarId ? `<button class="btn" type="button" data-act="calendario" data-id="${esc(x.id)}">Rascunho no calendário</button>` : ''}
          ${x.calendarId ? '<span class="pill info">No calendário como rascunho</span>' : ''}
          ${x.status === 'aprovado' && podeAprovar ? `<button class="btn sm" type="button" data-act="voltar" data-id="${esc(x.id)}">Voltar para rascunho</button>` : ''}
          <span class="spacer"></span>
          ${podeEditar && ['rascunho', 'aprovado'].includes(x.status) ? `<button class="btn sm danger" type="button" data-act="apagar-peca" data-id="${esc(x.id)}">Apagar</button>` : ''}
        </div>
        ${x.status === 'aprovado' && podeEditar ? `<div class="field"><span style="font-size:12.5px;font-weight:600;color:var(--ink-2)">Já postou à mão? Cole o endereço do post no ${esc(r.nome)}</span>
          <div class="linkbox"><input data-url placeholder="https://${esc(r.dominios[0])}/..." inputmode="url"><button class="btn primary" type="button" data-act="publicada" data-id="${esc(x.id)}">Marcar como publicada</button></div></div>` : ''}
        ${['publicado', 'medido'].includes(x.status) && podeEditar ? `<div class="field"><span style="font-size:12.5px;font-weight:600;color:var(--ink-2)">Views que a rede mostra${x.medidoEm ? ` (última: ${esc(fmtDate(x.medidoEm))})` : ''}</span>
          <div class="linkbox"><input data-views type="number" min="0" inputmode="numeric" value="${x.views ?? ''}" style="max-width:180px"><button class="btn primary" type="button" data-act="medir" data-id="${esc(x.id)}">Salvar views</button></div></div>` : ''}
      </div>` : ''}
    </article>`;
  }

  // ---------------------------------------------------------------- placar
  function placarHtml() {
    const j = st.janela;
    const linhas = st.d.elenco.map((p) => ({ p, v: st.d.placar.find((x) => x.persona_id === p.id)?.[j] || {} }));
    const max = Math.max(1, ...linhas.map((l) => l.v.cliques || 0));
    const toggle = `<div class="filters">${[['d7', '7 dias'], ['d30', '30 dias']].map(([k, l]) => `<button class="chip ${j === k ? 'on' : ''}" type="button" data-act="janela" data-v="${k}">${l}</button>`).join('')}</div>`;
    if (!linhas.length) return `<div class="empty-state"><h3>O placar começa com o elenco</h3><p>Cada influenciador ganha um link rastreado. O placar mostra, por influenciador, as views que você informar e os cliques, leads e conversões verificadas do link dele.</p>${podeEditar ? '<button class="btn primary" type="button" data-act="wizard">Montar o elenco</button>' : ''}</div>`;
    const semNada = linhas.every((l) => !l.v.cliques && !l.v.views && !l.v.leads);
    return `<div class="toolbar">${toggle}<span class="spacer"></span><span class="note">Views: informadas por você. Cliques, leads e conversões: do link rastreado de cada um.</span></div>
      <div class="score"><table><thead><tr><th>Influenciador</th><th>Views</th><th>Cliques</th><th>Leads</th><th>Conversões</th><th>Publicadas</th></tr></thead><tbody>
      ${linhas.map(({ p, v }) => `<tr class="net-${esc(p.rede)}"><td class="pn"><div class="pname"><div class="avatar">${esc(iniciais(p.nome))}</div><div><strong>${esc(p.nome)}</strong><div class="note">${esc(rede(p.rede).nome)}</div></div></div></td>
        <td class="n" data-l="Views">${n(v.views)}${v.publicadas && v.medidas < v.publicadas ? `<div class="note" style="font:500 11px var(--font)">${v.publicadas - v.medidas} sem número</div>` : ''}</td>
        <td class="n" data-l="Cliques">${n(v.cliques)}${v.cliques ? `<div class="hbar" style="width:${Math.round((v.cliques / max) * 100)}%"></div>` : ""}</td>
        <td class="n" data-l="Leads">${n(v.leads)}</td><td class="n" data-l="Conversões verificadas">${n(v.conversoes)}</td><td class="n" data-l="Peças publicadas">${n(v.publicadas)}</td></tr>`).join('')}
      </tbody></table></div>
      ${semNada ? '<p class="note">Ainda sem números nesta janela. Publique uma peça aprovada, cole o link do post e informe as views; os cliques entram sozinhos pelo link de cada influenciador.</p>' : ''}`;
  }

  function configHtml() {
    if (!podeAprovar) return '';
    return `<details class="cfg"><summary>Configurações do estúdio</summary><div>
      <label class="field">Teto mensal de gerações com a sua IA<input id="ugc-teto" type="number" min="0" max="5000" value="${esc(st.d.config.teto_mensal)}" style="max-width:160px"></label>
      <button class="btn" type="button" data-act="salvar-teto">Salvar teto</button>
      <span class="note">Conta todas as pessoas da operação. Ao bater o teto, o botão para de gerar até o mês virar.</span></div></details>`;
  }

  function comoFuncionaHtml() {
    return `<section class="how" aria-label="Como funciona">
      <div><b>Passo 1</b><strong>Elenco</strong><span>Ficha de cada influenciador e um link rastreado por rede.</span></div>
      <div><b>Passo 2</b><strong>Pauta da semana</strong><span>Proposta a partir da agenda, do blog e dos insights. Você edita.</span></div>
      <div><b>Passo 3</b><strong>Peça</strong><span>Roteiro, legenda, hashtags, capa e briefing: pelo modelo, pela sua IA ou pela IA conectada.</span></div>
      <div><b>Passo 4</b><strong>Aprovação e placar</strong><span>O preflight confere; você aprova, posta à mão e mede quem traz cadastro.</span></div></section>`;
  }

  function desenhar() {
    const lead = `<p class="lead">${st.d.operacao.exigeJogo ? 'Poker: sem promessa, sem bônus e sem ficha grátis, sempre com +18 e “Jogue com responsabilidade”. ' : ''}O estúdio escreve; você aprova e posta à mão. Nada sai sozinho.</p>`;
    if (!st.d.elenco.length) { el.innerHTML = `<div class="ugc">${lead}${elencoHtml()}${comoFuncionaHtml()}${caminhosHtml()}${configHtml()}</div>`; return; }
    const corpo = { pauta: pautaHtml, fila: filaHtml, placar: placarHtml }[st.aba]();
    el.innerHTML = `<div class="ugc">
      <p class="lead">${st.d.operacao.exigeJogo ? 'Poker: sem promessa, sem bônus e sem ficha grátis, sempre com +18 e “Jogue com responsabilidade”. ' : ''}O estúdio escreve; você aprova e posta à mão. Nada sai sozinho.</p>
      ${elencoHtml()}${caminhosHtml()}${abasHtml()}<div role="tabpanel">${corpo}</div>${configHtml()}</div>`;
  }

  // ---------------------------------------------------------------- ficha (assistente e edição)
  function fichaForm(f, { edicao = false } = {}) {
    const real = f.formato !== 'ia';
    const pal = [...(f.visual?.paleta || []), '#333333', '#999999', '#ffffff'].slice(0, 3);
    return `<div class="grid2">
        <label class="field">Nome<input data-f="nome" value="${esc(f.nome)}" maxlength="60" required></label>
        <label class="field">Papel no elenco<input data-f="papel" value="${esc(f.papel)}" maxlength="60" placeholder="O que explica"></label>
        ${real ? `<label class="field">Quem aparece (nome da pessoa)<input data-f="pessoa" value="${esc(f.pessoa || '')}" maxlength="80"></label>`
          : `<label class="field">Idade aparente<input data-f="idade_aparente" value="${esc(f.idade_aparente || '')}" maxlength="30" placeholder="25 a 30 anos"></label>`}
        ${edicao ? `<label class="field">Situação<select data-f="status">${[['rascunho', 'Rascunho'], ['ativo', 'Ativo'], ['pausado', 'Pausado']].map(([k, l]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
      </div>
      <label class="field">Jeito de falar<textarea data-f="jeito" rows="2" maxlength="400">${esc(f.voz?.jeito || '')}</textarea></label>
      <div class="grid2">
        <label class="field">Bordões (separe com ;)<input data-f="bordoes" value="${esc((f.voz?.bordoes || []).join('; '))}"></label>
        <label class="field">Glossário (separe com vírgula)<input data-f="glossario" value="${esc((f.voz?.glossario || []).join(', '))}"></label>
      </div>
      <div class="grid2">
        <label class="field">Assuntos que domina (um por linha)<textarea data-f="assuntos" rows="4">${esc((f.assuntos || []).join('\n'))}</textarea></label>
        <label class="field">O que nunca fala (um por linha)<textarea data-f="nunca" rows="4">${esc((f.nunca || []).join('\n'))}</textarea></label>
      </div>
      <div class="grid2">
        <div class="field">Paleta<div class="palette">${pal.map((c, i) => `<input type="color" data-cor="${i}" value="${esc(c)}" aria-label="Cor ${i + 1}">`).join('')}</div></div>
        <label class="field">Enquadramento<textarea data-f="enquadramento" rows="2" maxlength="300">${esc(f.visual?.enquadramento || '')}</textarea></label>
      </div>
      ${real ? `<label class="auth"><span class="check"><input type="checkbox" data-f="autorizacao" ${f.autorizacao ? 'checked' : ''}> Tenho autorização por escrito de quem aparece</span>
          <span class="note">${f.autorizacao?.por ? `Marcado por ${esc(f.autorizacao.por)} em ${esc(fmtDate(f.autorizacao.em))}.` : 'O portal grava quem marcou e quando. Sem isso, o influenciador não ativa e as peças dele não são aprovadas.'}</span></label>`
        : `<p class="rule">Persona de IA: sempre com o rótulo de conteúdo feito com IA e nunca se apresenta como pessoa real. Também não imita pessoa famosa.</p>`}
      <p class="note">Nada de senha de rede social aqui: a conta do canal se conecta pelo login oficial, em Integrações.</p>`;
  }
  function lerFicha(box, base) {
    const v = (k) => box.querySelector(`[data-f="${k}"]`);
    const val = (k) => (v(k) ? v(k).value : undefined);
    const split = (s, re) => String(s || '').split(re).map((x) => x.trim()).filter(Boolean);
    const out = { ...base, nome: val('nome'), papel: val('papel'),
      voz: { jeito: val('jeito'), bordoes: split(val('bordoes'), /;|\n/), glossario: split(val('glossario'), /,|\n/) },
      assuntos: split(val('assuntos'), /\n/), nunca: split(val('nunca'), /\n/),
      visual: { paleta: [...box.querySelectorAll('[data-cor]')].map((i) => i.value), enquadramento: val('enquadramento') } };
    if (v('pessoa')) out.pessoa = val('pessoa');
    if (v('idade_aparente')) out.idade_aparente = val('idade_aparente');
    if (v('status')) out.status = val('status');
    if (v('autorizacao')) out.autorizacao = v('autorizacao').checked;
    return out;
  }

  function dialogo(html) {
    document.getElementById('ugc-dlg')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<dialog class="ugc-dlg ugc" id="ugc-dlg">${html}</dialog>`);
    const d = document.getElementById('ugc-dlg');
    d.addEventListener('close', () => d.remove());
    d.showModal();
    return d;
  }

  // assistente em 3 passos: formato, ficha e rede
  async function assistente() {
    const faltam = REDES.filter((r) => !st.d.elenco.some((p) => p.rede === r));
    if (!faltam.length) return toast('O elenco já tem um influenciador em cada rede.');
    const W = { passo: 1, ativa: faltam[0], fichas: {}, redes: {}, ativar: false };
    const carregarSug = (lista) => { for (const r of faltam) { const s = lista.find((f) => f.rede === r) || lista[0]; W.fichas[r] = JSON.parse(JSON.stringify({ ...s, rede: r, formato: W.fichas[r]?.formato || s.formato })); W.redes[r] = r; } };
    carregarSug(st.d.sugestoes.fichas);
    const d = dialogo('<form method="dialog" id="wiz"></form>');
    const form = d.querySelector('#wiz');
    const guardar = () => { if (W.passo === 2) { const box = form.querySelector('[data-ficha]'); if (box) W.fichas[W.ativa] = lerFicha(box, W.fichas[W.ativa]); } };
    function pintar() {
      const passos = ['Formato de cada um', 'Ficha', 'Rede e revisão'];
      let corpo = '';
      if (W.passo === 1) {
        corpo = faltam.map((r) => `<div class="fmt-row net-${r}"><div class="fmt-net">${ICON[r]}${esc(rede(r).nome)}</div><div class="seg">${Object.entries(st.d.formatos).map(([k, f]) =>
          `<button type="button" data-fmt="${k}" data-rede="${r}" class="${W.fichas[r].formato === k ? 'on' : ''}" aria-pressed="${W.fichas[r].formato === k}">${esc(f.nome)}<small>${esc(f.resumo)}</small></button>`).join('')}</div></div>`).join('')
          + '<p class="note">Recomendado para começar: 2 personas de IA e 1 rosto da marca. Nesta fase não há vídeo de IA: o estúdio escreve roteiro, legenda, hashtags, capa e briefing.</p>';
      } else if (W.passo === 2) {
        const f = W.fichas[W.ativa];
        corpo = `<div class="subtabs">${faltam.map((r) => `<button type="button" class="chip ${W.ativa === r ? 'on' : ''}" data-sub="${r}">${esc(rede(r).curto)} · ${esc(W.fichas[r].nome)}</button>`).join('')}</div>
          ${st.d.sugestoes.outros.length ? `<label class="field" style="max-width:320px">Fichas prontas do nicho<select data-nicho>${st.d.sugestoes.outros.map((k) => `<option value="${k}" ${k === (W.nicho || st.d.sugestoes.nicho) ? 'selected' : ''}>${esc({ poker: 'Poker', saas: 'Software e SaaS', loja: 'Loja', criador: 'Criadores', cursos: 'Cursos' }[k] || k)}</option>`).join('')}</select></label>` : ''}
          <div data-ficha class="net-${W.ativa}" style="display:grid;gap:12px"><p class="note" style="margin:0"><b style="color:var(--net)">${esc(rede(W.ativa).nome)}</b> · ${esc(st.d.formatos[f.formato].nome)}</p>${fichaForm(f)}</div>`;
      } else {
        corpo = `<div class="review">${faltam.map((r) => { const f = W.fichas[r]; const real = f.formato !== 'ia'; return `<div class="rec-row net-${W.redes[r]}"><span class="bar"></span>
          <div style="flex:1"><strong>${esc(f.nome)}</strong><small>${esc(st.d.formatos[f.formato].nome)} · ${esc(f.papel || '')}${real && !f.autorizacao ? ' · <span style="color:var(--bad)">sem autorização por escrito</span>' : ''}</small></div>
          <label class="field" style="min-width:150px">Rede<select data-rede-de="${r}">${faltam.map((x) => `<option value="${x}" ${W.redes[r] === x ? 'selected' : ''}>${esc(rede(x).nome)}</option>`).join('')}</select></label></div>`; }).join('')}</div>
          <label class="check"><input type="checkbox" data-ativar ${W.ativar ? 'checked' : ''}> Ativar já (rosto de pessoa real só ativa com a autorização marcada)</label>
          <p class="note">Cada influenciador ganha um link rastreado próprio (com a rede no utm_source) para o placar medir cliques, leads e conversões dele.</p><p class="err" data-err></p>`;
      }
      form.innerHTML = `<div class="dlg-head"><h2>Montar o elenco</h2><span class="note">Um influenciador por rede. Você troca o formato de cada um quando quiser.</span>
          <ol class="steps">${passos.map((p, i) => `<li class="${W.passo === i + 1 ? 'on' : W.passo > i + 1 ? 'done' : ''}">${i + 1}. ${p}</li>`).join('')}</ol></div>
        <div class="dlg-body">${corpo}</div>
        <div class="dlg-foot"><button class="btn" type="button" data-w="fechar">Cancelar</button><span class="spacer"></span>
          ${W.passo > 1 ? '<button class="btn" type="button" data-w="voltar">Voltar</button>' : ''}
          ${W.passo < 3 ? '<button class="btn primary" type="button" data-w="seguir">Continuar</button>' : `<button class="btn primary" type="button" data-w="salvar">Salvar elenco</button>`}</div>`;
    }
    form.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.fmt) { W.fichas[b.dataset.rede].formato = b.dataset.fmt; return pintar(); }
      if (b.dataset.sub) { guardar(); W.ativa = b.dataset.sub; return pintar(); }
      const w = b.dataset.w;
      if (w === 'fechar') return d.close();
      if (w === 'voltar') { guardar(); W.passo--; return pintar(); }
      if (w === 'seguir') { guardar(); W.passo++; return pintar(); }
      if (w === 'salvar') {
        W.ativar = form.querySelector('[data-ativar]')?.checked;
        const destinos = faltam.map((r) => form.querySelector(`[data-rede-de="${r}"]`).value);
        if (new Set(destinos).size !== destinos.length) { form.querySelector('[data-err]').textContent = 'Cada rede fica com um influenciador só.'; return; }
        b.disabled = true;
        const erros = [];
        for (const r of faltam) {
          const f = { ...W.fichas[r], rede: W.redes[r] = form.querySelector(`[data-rede-de="${r}"]`).value };
          f.status = W.ativar && (f.formato === 'ia' || f.autorizacao) ? 'ativo' : 'rascunho';
          try { await api('POST', `/api/t/${slug}/ugc/personas`, f); } catch (err) { erros.push(`${f.nome}: ${err.message}`); }
        }
        if (erros.length) { form.querySelector('[data-err]').textContent = erros.join(' · '); b.disabled = false; await carregar(); return; }
        d.close(); toast('Elenco salvo.'); await carregar();
      }
    });
    form.addEventListener('change', async (e) => {
      if (e.target.matches('[data-nicho]')) {
        guardar();
        W.nicho = e.target.value;
        try { const s = await api('GET', `/api/t/${slug}/ugc/sugestoes?nicho=${encodeURIComponent(W.nicho)}`); for (const r of faltam) W.fichas[r].formato = W.fichas[r].formato; carregarSug(s.fichas); pintar(); } catch (err) { falhou(err); }
      }
    });
    pintar();
  }

  function editarPersona(id) {
    const p = persona(id);
    const d = dialogo(`<form method="dialog"><div class="dlg-head net-${esc(p.rede)}"><h2>Ficha de ${esc(p.nome)}</h2><span class="note" style="color:var(--net);font-weight:650">${esc(rede(p.rede).nome)} · ${esc(p.formatoNome)}</span></div>
      <div class="dlg-body" data-ficha>
        <div class="field">Formato<div class="seg">${Object.entries(st.d.formatos).map(([k, f]) => `<button type="button" data-fmt="${k}" class="${p.formato === k ? 'on' : ''}" aria-pressed="${p.formato === k}">${esc(f.nome)}<small>${esc(f.cuidado)}</small></button>`).join('')}</div></div>
        <div data-campos>${fichaForm(p, { edicao: true })}</div><p class="err" data-err></p></div>
      <div class="dlg-foot"><button class="btn danger" type="button" data-e="apagar">Apagar</button><span class="spacer"></span><button class="btn" type="button" data-e="fechar">Cancelar</button><button class="btn primary" type="button" data-e="salvar">Salvar ficha</button></div></form>`);
    let formato = p.formato;
    d.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.fmt) {
        const atual = lerFicha(d.querySelector('[data-ficha]'), p);
        formato = b.dataset.fmt;
        d.querySelectorAll('[data-fmt]').forEach((x) => { x.classList.toggle('on', x.dataset.fmt === formato); x.setAttribute('aria-pressed', x.dataset.fmt === formato); });
        d.querySelector('[data-campos]').innerHTML = fichaForm({ ...atual, formato, autorizacao: formato === p.formato ? p.autorizacao : null }, { edicao: true });
        return;
      }
      if (b.dataset.e === 'fechar') return d.close();
      if (b.dataset.e === 'apagar') {
        if (!confirm(`Apagar ${p.nome}? As pautas e os rascunhos dele saem junto e o link rastreado para de contar.`)) return;
        try { await api('DELETE', `/api/t/${slug}/ugc/personas/${p.id}`); d.close(); toast('Influenciador apagado.'); await carregar(); } catch (err) { d.querySelector('[data-err]').textContent = err.message; }
      }
      if (b.dataset.e === 'salvar') {
        const f = lerFicha(d.querySelector('[data-ficha]'), {});
        f.formato = formato; f.rede = p.rede;
        try { await api('PATCH', `/api/t/${slug}/ugc/personas/${p.id}`, f); d.close(); toast('Ficha salva.'); await carregar(); } catch (err) { d.querySelector('[data-err]').textContent = err.message; }
      }
    });
  }

  function editarPauta(id) {
    const p = id ? st.d.pautas.find((x) => x.id === id) : null;
    const sem = st.d.semana;
    const dias = [...Array(7)].map((_, i) => { const [y, m, dd] = sem.inicio.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + i)).toISOString().slice(0, 10); });
    const d = dialogo(`<form method="dialog"><div class="dlg-head"><h2>${p ? 'Editar pauta' : 'Nova pauta'}</h2></div><div class="dlg-body">
      ${p ? '' : `<label class="field">Influenciador<select data-p="persona_id">${st.d.elenco.map((x) => `<option value="${esc(x.id)}">${esc(x.nome)} · ${esc(rede(x.rede).curto)}</option>`).join('')}</select></label>`}
      <label class="field">Dia<select data-p="dia">${dias.map((x) => `<option value="${x}" ${(p?.dia || sem.hoje) === x ? 'selected' : ''}>${esc(diaSemana(x))} · ${esc(dataCurta(x))}</option>`).join('')}</select></label>
      <label class="field">Tema<input data-p="tema" value="${esc(p?.tema || '')}" maxlength="160" required></label>
      <label class="field">Gancho (a primeira frase)<input data-p="gancho" value="${esc(p?.gancho || '')}" maxlength="200"></label>
      ${p ? `<label class="check"><input type="checkbox" data-p="aprovada" ${p.status === 'aprovada' ? 'checked' : ''}> Pauta aprovada</label>` : ''}<p class="err" data-err></p></div>
      <div class="dlg-foot"><button class="btn" type="button" data-e="fechar">Cancelar</button><button class="btn primary" type="button" data-e="salvar">Salvar</button></div></form>`);
    d.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.e === 'fechar') return d.close();
      if (b.dataset.e !== 'salvar') return;
      const v = (k) => d.querySelector(`[data-p="${k}"]`);
      try {
        if (p) await api('PATCH', `/api/t/${slug}/ugc/pautas/${p.id}`, { tema: v('tema').value, gancho: v('gancho').value, dia: v('dia').value, status: v('aprovada').checked ? 'aprovada' : 'proposta' });
        else await api('POST', `/api/t/${slug}/ugc/pautas`, { persona_id: v('persona_id').value, tema: v('tema').value, gancho: v('gancho').value, dia: v('dia').value });
        d.close(); toast('Pauta salva.'); await carregar();
      } catch (err) { d.querySelector('[data-err]').textContent = err.message; }
    });
  }

  // produção: os três caminhos com o estado real de cada um
  async function produzir(id) {
    const p = st.d.pautas.find((x) => x.id === id);
    const pe = persona(p.persona_id);
    let est = null;
    try { est = await api('GET', `/api/t/${slug}/ugc/pautas/${id}/estimativa`); } catch { est = null; }
    const pedido = `Use as ferramentas do Estúdio de UGC: leia a ficha de ${pe.nome} com ugc_ver_persona e escreva a peça da pauta "${p.tema}" (pauta_id ${p.id}). Passe o texto em ugc_checar_texto e salve com ugc_salvar_peca.`;
    const mcp = st.d.ia.mcp;
    const pronta = est?.estado === 'pronta';
    const apiBloco = pronta
      ? `<p>Modelo <b>${esc(est.modelo)}</b> · <span class="cost">${esc(est.estimativa.texto)}</span></p><p class="note">${n(est.usadas)} de ${n(est.teto)} gerações neste mês nesta operação. O texto entra como rascunho e passa pelo preflight.</p>
        <div class="row"><button class="btn primary" type="button" data-g="gerar">Gerar com a minha IA (${esc(est.estimativa.texto.split(' por')[0])})</button></div>`
      : `<p>${est?.estado === 'teto' ? esc(est.mensagem) : 'Sem chave de API própria válida: nada é gerado até você conectar.'}</p><div class="row">${est?.estado === 'teto' ? '' : `<a class="btn" href="#/t/${esc(slug)}/ia">Conecte sua IA em Conectar sua IA</a>`}</div>`;
    const d = dialogo(`<form method="dialog"><div class="dlg-head net-${esc(pe.rede)}"><h2>Produzir a peça</h2><span class="note"><b style="color:var(--net)">${esc(pe.nome)} · ${esc(rede(pe.rede).nome)}</b> · ${esc(p.tema)}</span></div>
      <div class="dlg-body">
        <div class="pathopt"><h3>Modelo de texto <span class="pill ok">sem IA</span></h3><p>Esqueleto de roteiro, legenda, hashtags, capa e briefing na voz de ${esc(pe.nome)}, já com o rodapé obrigatório. Você preenche os trechos marcados.</p>
          <div class="row"><button class="btn ${pronta ? '' : 'primary'}" type="button" data-g="modelo">Usar o modelo de texto</button></div></div>
        <div class="pathopt"><h3>Minha IA <span class="pill ${pronta ? 'ok' : 'warn'}">${pronta ? 'chave válida' : est?.estado === 'teto' ? 'teto do mês' : 'sem chave'}</span></h3>${apiBloco}</div>
        <div class="pathopt"><h3>IA conectada (MCP) <span class="pill ${mcp.conectado ? 'ok' : ''}">${mcp.conectado ? 'conectada' : 'não conectada'}</span></h3>
          <p>${mcp.conectado ? 'Copie o pedido e mande para a sua IA. A peça aparece na fila de aprovação como rascunho.' : 'Conecte o Claude, o ChatGPT ou outra IA em Conectar sua IA e peça as peças por conversa.'}</p>
          <div class="row">${mcp.conectado ? '<button class="btn" type="button" data-g="pedido">Copiar o pedido para a IA</button>' : `<a class="btn" href="#/t/${esc(slug)}/ia">Conectar sua IA</a>`}</div></div>
        <p class="err" data-err></p></div>
      <div class="dlg-foot"><button class="btn" type="button" data-g="fechar">Fechar</button></div></form>`);
    d.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const g = b.dataset.g;
      if (g === 'fechar') return d.close();
      if (g === 'pedido') return copiar(pedido);
      if (g === 'modelo' || g === 'gerar') {
        b.disabled = true;
        b.textContent = g === 'gerar' ? 'Gerando…' : 'Montando…';
        try {
          const r = g === 'gerar' ? await api('POST', `/api/t/${slug}/ugc/pautas/${id}/gerar`, { confirmar: true }) : await api('POST', `/api/t/${slug}/ugc/pautas/${id}/modelo`);
          d.close();
          toast(g === 'gerar' ? `Peça gerada (${r.geracao.tokensEntrada + r.geracao.tokensSaida} tokens). Revise e aprove.` : 'Modelo pronto. Preencha os trechos marcados.');
          st.aba = 'fila'; st.filtro = 'rascunho'; st.aberta = r.peca.id;
          await carregar();
          document.getElementById(`peca-${r.peca.id}`)?.scrollIntoView({ block: 'start' });
        } catch (err) { d.querySelector('[data-err]').textContent = err.message; b.disabled = false; b.textContent = g === 'gerar' ? 'Gerar com a minha IA' : 'Usar o modelo de texto'; }
      }
    });
  }

  function camposDaPeca(id) {
    const box = document.getElementById(`peca-${id}`);
    return Object.fromEntries([...box.querySelectorAll('[data-campo]')].map((t) => [t.dataset.campo, t.value]));
  }
  let pfTimer = null;
  el.addEventListener('input', (e) => {
    const t = e.target.closest('[data-campo]');
    if (!t) return;
    const box = t.closest('.peca');
    const id = box.id.replace('peca-', '');
    clearTimeout(pfTimer);
    pfTimer = setTimeout(async () => {
      try {
        const x = st.d.pecas.find((y) => y.id === id);
        const r = await api('POST', `/api/t/${slug}/ugc/preflight`, { persona_id: x.persona_id, ...camposDaPeca(id) });
        const pend = Object.values(camposDaPeca(id)).some((v) => /\[escreva aqui/i.test(v));
        box.querySelector('[data-pf]').innerHTML = preflightLista(r.resultado, pend);
      } catch { /* sem rede: confere ao salvar */ }
    }, 600);
  });

  // ---------------------------------------------------------------- ações
  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const { act, id, v } = { act: b.dataset.act, id: b.dataset.id, v: b.dataset.v };
    try {
      switch (act) {
        case 'aba': st.aba = v; st.resultado = null; return desenhar();
        case 'filtro': st.filtro = v; return desenhar();
        case 'janela': st.janela = v; return desenhar();
        case 'quem': st.quem = v; return desenhar();
        case 'semana': st.semana = v; return carregar();
        case 'abrir': st.aberta = st.aberta === id ? null : id; return desenhar();
        case 'wizard': return assistente();
        case 'editar-persona': return editarPersona(id);
        case 'copiar-link': return copiar(v);
        case 'propor': { const r = await api('POST', `/api/t/${slug}/ugc/pauta/propor`, { semana: st.semana }); toast(r.nota); return carregar(); }
        case 'aprovar-pauta': { const r = await api('POST', `/api/t/${slug}/ugc/pauta/aprovar`, { semana: st.semana }); toast(`${r.aprovadas} pauta(s) aprovada(s).`); return carregar(); }
        case 'nova-pauta': return editarPauta(null);
        case 'editar-pauta': return editarPauta(id);
        case 'apagar-pauta': if (!confirm('Apagar esta pauta?')) return; await api('DELETE', `/api/t/${slug}/ugc/pautas/${id}`); toast('Pauta apagada.'); return carregar();
        case 'subir': {
          const p = st.d.pautas.find((x) => x.id === id);
          const irmaos = st.d.pautas.filter((x) => x.dia === p.dia).sort((a, b2) => a.ordem - b2.ordem);
          const i = irmaos.findIndex((x) => x.id === id);
          if (i > 0) [irmaos[i - 1], irmaos[i]] = [irmaos[i], irmaos[i - 1]];
          await api('POST', `/api/t/${slug}/ugc/pautas/ordem`, { ids: irmaos.map((x) => x.id) });
          return carregar();
        }
        case 'produzir': return produzir(id);
        case 'ver-peca': { const x = st.d.pecas.find((y) => y.id === id); st.aba = 'fila'; st.filtro = x.status; st.aberta = id; desenhar(); document.getElementById(`peca-${id}`)?.scrollIntoView({ block: 'start' }); return; }
        case 'salvar-peca': { const r = await api('PATCH', `/api/t/${slug}/ugc/pecas/${id}`, camposDaPeca(id)); toast(r.peca.status === 'rascunho' && r.peca.preflight.ok ? 'Texto salvo. Preflight ok.' : 'Texto salvo.'); return carregar(); }
        case 'rodape': {
          const box = document.getElementById(`peca-${id}`);
          const t = box.querySelector('[data-campo="legenda"]');
          const x = st.d.pecas.find((y) => y.id === id);
          const extra = [];
          if (st.d.operacao.exigeJogo && !/jogue com responsabilidade/i.test(t.value) && !/\+\s?18|18\s?\+/.test(t.value)) extra.push(st.d.operacao.rodape);
          else if (st.d.operacao.exigeJogo && !/jogue com responsabilidade/i.test(t.value)) extra.push('Jogue com responsabilidade.');
          else if (st.d.operacao.exigeJogo && !/\+\s?18|18\s?\+/.test(t.value)) extra.push('+18.');
          if (persona(x.persona_id)?.rotulo_ia && !/feito com ia|#ia\b/i.test(t.value)) extra.push('Conteúdo feito com IA.');
          if (!extra.length) return toast('O rodapé obrigatório já está na legenda.');
          t.value = `${t.value.trimEnd()}\n\n${extra.join(' ')}`;
          t.dispatchEvent(new Event('input', { bubbles: true }));
          return toast('Rodapé acrescentado. Salve o texto.');
        }
        case 'aprovar': {
          await api('PATCH', `/api/t/${slug}/ugc/pecas/${id}`, camposDaPeca(id)).catch(() => {});
          try { await api('POST', `/api/t/${slug}/ugc/pecas/${id}/aprovar`); toast('Peça aprovada. Copie ou baixe e poste à mão.'); }
          catch (err) { toast(err.message, true); }
          return carregar();
        }
        case 'aprovar-semana': { st.resultado = await api('POST', `/api/t/${slug}/ugc/aprovar-semana`, { semana: st.semana }); return carregar(); }
        case 'voltar': await api('POST', `/api/t/${slug}/ugc/pecas/${id}/voltar`); return carregar();
        case 'calendario': { const r = await api('POST', `/api/t/${slug}/ugc/pecas/${id}/calendario`); toast(r.nota); return carregar(); }
        case 'copiar-legenda': { const x = st.d.pecas.find((y) => y.id === id); return copiar([x.legenda, x.hashtags].filter(Boolean).join('\n\n')); }
        case 'publicada': {
          const url = document.getElementById(`peca-${id}`).querySelector('[data-url]').value;
          await api('POST', `/api/t/${slug}/ugc/pecas/${id}/publicada`, { post_url: url }); toast('Marcada como publicada.'); st.filtro = 'publicado'; return carregar();
        }
        case 'medir': {
          const views = Number(document.getElementById(`peca-${id}`).querySelector('[data-views]').value);
          await api('POST', `/api/t/${slug}/ugc/pecas/${id}/medir`, { views }); toast('Views salvas.'); st.filtro = 'medido'; return carregar();
        }
        case 'apagar-peca': if (!confirm('Apagar esta peça?')) return; await api('DELETE', `/api/t/${slug}/ugc/pecas/${id}`); st.aberta = null; return carregar();
        case 'salvar-teto': await api('PUT', `/api/t/${slug}/ugc/config`, { teto_mensal: Number(document.getElementById('ugc-teto').value) }); toast('Teto salvo.'); return carregar();
        default: return undefined;
      }
    } catch (err) { falhou(err); }
  };
  el.onkeydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.peca-head')) { e.preventDefault(); e.target.click(); } };

  await carregar();
}
