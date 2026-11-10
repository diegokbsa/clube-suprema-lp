// Torneios ao vivo: /torneios (HTML indexável, JSON-LD) e /torneios.txt em cada site da operação, com a grade da liga vinda
// da API pública da PokerByte (a mesma do suprema.blog): /mtt/list/<liga>/all/<AAAA-MM-DD>/guaranteed/desc, em que a data é o dia
// de Brasília e os horários vêm em UTC. O "dia de poker" vai das 7h às 7h do dia seguinte. Cada liga+dia fica 10 min em memória;
// se a API cair, vale a última resposta boa daquele dia.
// Configuração por operação (settings): torneiosAtivo (true/false), torneiosLiga (ID numérico da liga na PokerByte) e
// torneiosNome (nome mostrado, ex.: "Liga Suprema"). Desligado, /torneios segue para a página do construtor (se houver) ou 404.
// gradeDoDia(tenant) devolve a grade do dia em texto curto para outra frente postar às 9h; este módulo não posta nada.
import { HttpError } from '../http.mjs';
import { parse } from '../db.mjs';
import { templateVars } from '../tenants.mjs';
import { esc } from '../blocks.mjs';
import { head, sendHtml, absoluteSiteUrl, faqLd } from './blog.mjs';
import { siteDaOperacao, urlDoSite } from './email.mjs';
import { aplicarGradeAoVivo, pedeGradeAoVivo, cdEvento } from '../grade-ao-vivo.mjs';
import { contagem } from '../block-kit.mjs';

const API = 'https://api.pokerbyte.com.br/mtt/list/';
const TTL_MS = 10 * 60_000;
const INICIO_DIA_H = 7;
const TZ = 'America/Sao_Paulo';
const LIGA = /^\d{1,8}$/;
const cache = new Map(); // 'liga|AAAA-MM-DD' -> { at, list }
const emVoo = new Map(); // 'liga|AAAA-MM-DD' -> Promise (uma busca por vez)
const ESPERA_PAGINA_MS = 2500; // a página de um site nunca espera mais que isso pela liga
let APP = null; // guardado no init: fetch injetável (testes) e banco

const brData = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const brHora = (d) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(d));
const somaDias = (dia, n) => new Date(Date.parse(`${dia}T12:00:00-03:00`) + n * 86400_000).toISOString().slice(0, 10);
export const hhmm = (d) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
export const brl = (n) => `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 })}`;
const kilo = (n) => (n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));
const modalidade = (t) => t.replace(/^PLO(\d)$/, 'PLO $1');
const destaques = (eventos, n) => eventos.filter((e) => !e.satelite).sort((a, b) => b.garantido - a.garantido).slice(0, n).sort((a, b) => a.inicio - b.inicio);
const PERIODOS = [['Manhã', '7h às 12h', (h) => h >= 7 && h < 12], ['Tarde', '12h às 18h', (h) => h >= 12 && h < 18],
  ['Noite', '18h à meia-noite', (h) => h >= 18], ['Madrugada', 'meia-noite às 7h', (h) => h < 7]];

function rotuloDia(grade) {
  const s = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(grade.de);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const diaCurto = (grade) => `${grade.dia.slice(8, 10)}/${grade.dia.slice(5, 7)}`;

/** Configuração de torneios da operação (sempre um objeto). */
export function configTorneios(tenant) {
  const s = parse(tenant?.settings, {}) || {};
  const liga = LIGA.test(String(s.torneiosLiga || '')) ? String(s.torneiosLiga) : '';
  return { ativo: s.torneiosAtivo === true && Boolean(liga), ligado: s.torneiosAtivo === true, liga, nome: String(s.torneiosNome || '').trim().slice(0, 60) || (liga ? `Liga ${liga}` : 'Liga') };
}

/** Limpa o cache em memória (testes). */
export function limparCacheTorneios() { cache.clear(); emVoo.clear(); }

// rapido: com resposta antiga no cache, devolve ela na hora e atualiza por trás (as páginas dos sites usam assim)
async function buscarDia(liga, dia, fetchImpl, { rapido = false } = {}) {
  const chave = `${liga}|${dia}`;
  const hit = cache.get(chave);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.list;
  if (!emVoo.has(chave)) emVoo.set(chave, baixarDia(liga, dia, fetchImpl, hit).finally(() => emVoo.delete(chave)));
  if (rapido && hit) { emVoo.get(chave).catch(() => {}); return hit.list; }
  return emVoo.get(chave);
}

async function baixarDia(liga, dia, fetchImpl, hit) {
  const chave = `${liga}|${dia}`;
  try {
    const r = await fetchImpl(`${API}${liga}/all/${dia}/guaranteed/desc`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Object.values(data || {}).find(Array.isArray) || [];
    cache.set(chave, { at: Date.now(), list });
    if (cache.size > 400) cache.delete(cache.keys().next().value);
    return list;
  } catch (e) {
    console.warn(`[torneios] liga ${liga} ${dia}: ${String(e?.message || e).slice(0, 120)}`);
    return hit ? hit.list : null;
  }
}

function normalizar(t) {
  const inicio = new Date(t.date);
  const late = t.late ? new Date(t.late) : null;
  return {
    id: t.id, nome: String(t.name || 'Torneio').trim().slice(0, 120), inicio,
    late: late && !Number.isNaN(late.getTime()) ? late : null,
    tipo: String(t.type || 'NLH').toUpperCase().slice(0, 12),
    buyin: Number(t.buyin || 0) || 0, garantido: Number(t.guaranteed || 0) || 0, stack: Number(t.stack || 0) || 0,
    blinds: Number(t.temponivelmMeta || 0) || 0, mainEvent: t.tournament === 'Main Event',
    satelite: t.tournament === 'Satelite' || Number(t.stack || 0) === 0, ko: Boolean(t.isKO),
  };
}

/** { dia, de, ate, eventos } do dia de poker (7h às 7h, Brasília) da liga, ou null se a API não respondeu. */
export async function buscarGrade(liga, { agora = new Date(), fetchImpl = APP?.fetchImpl || globalThis.fetch, rapido = false } = {}) {
  if (!LIGA.test(String(liga || ''))) return null;
  const hoje = brData(agora);
  const dia = brHora(agora) < INICIO_DIA_H ? somaDias(hoje, -1) : hoje;
  const de = new Date(`${dia}T0${INICIO_DIA_H}:00:00-03:00`);
  const ate = new Date(de.getTime() + 86400_000);
  const listas = await Promise.all([buscarDia(liga, dia, fetchImpl, { rapido }), buscarDia(liga, somaDias(dia, 1), fetchImpl, { rapido })]);
  if (listas.every((l) => l === null)) return null;
  const vistos = new Set();
  const eventos = listas.flat().filter(Boolean)
    .filter((t) => t && t.date && !vistos.has(t.id) && vistos.add(t.id))
    .map(normalizar)
    .filter((e) => !Number.isNaN(e.inicio.getTime()) && e.inicio >= de && e.inicio < ate)
    .sort((a, b) => a.inicio - b.inicio || b.garantido - a.garantido);
  return { dia, de, ate, eventos };
}

const abertos = (grade, agora) => (grade ? grade.eventos.filter((e) => (e.late || e.inicio) > agora) : []);
const linhaCurta = (e) => `${hhmm(e.inicio)} · ${e.nome} · buy-in ${e.buyin ? brl(e.buyin) : 'grátis'}${e.garantido ? ` · ${brl(e.garantido)} garantidos` : ''}`;

function urlTorneios(app, tenant) {
  const base = String(urlDoSite(app, tenant, siteDaOperacao(app.db, tenant.id)) || '').replace(/\/+$/, '');
  return base ? `${base}/torneios` : '';
}

/**
 * Grade do dia em texto curto (para postar às 9h em outra frente). Devolve null quando a operação está com torneios desligados,
 * sem liga, quando a API não respondeu ou quando não há torneio aberto. opts: { agora, fetchImpl, siteUrl, max }.
 */
export async function gradeDoDia(tenant, { agora = new Date(), fetchImpl, siteUrl, max = 8 } = {}) {
  const cfg = configTorneios(tenant);
  if (!cfg.ativo) return null;
  const grade = await buscarGrade(cfg.liga, { agora, ...(fetchImpl ? { fetchImpl } : {}) });
  if (!grade) return null;
  const lista = destaques(abertos(grade, agora), Math.max(1, Math.min(20, Number(max) || 8)));
  if (!lista.length) return null;
  const link = siteUrl ? `${String(siteUrl).replace(/\/+$/, '')}/torneios` : APP ? urlTorneios(APP, tenant) : '';
  const vars = templateVars(tenant, parse(tenant.settings, {}) || {});
  return [`Torneios de hoje na ${cfg.nome} · ${rotuloDia(grade)} (horário de Brasília)`, '', ...lista.map(linhaCurta), '',
    `${grade.eventos.length} torneios no dia.${link ? ` Grade completa: ${link}` : ''}`, vars.disclaimer || 'Somente maiores de 18 anos.'].join('\n');
}

// ---------------------------------------------------------------- página

function faqTorneios(grade, cfg, vars, siteUrl) {
  const ev = grade.eventos;
  const top = destaques(ev, 3);
  const mains = ev.filter((e) => e.mainEvent);
  const lista = (xs) => xs.map((e) => `${e.nome} às ${hhmm(e.inicio)}${e.garantido ? ` (${brl(e.garantido)} garantidos)` : ''}`).join(', ');
  const appTxt = vars.app ? ` no app ${vars.app}` : '';
  const quem = [vars.unitLabel, vars.agentId && `agente ${vars.agentId}`].filter(Boolean).join(', ');
  return [
    { q: `Quais são os torneios de hoje na ${cfg.nome}?`,
      a: `Hoje, ${rotuloDia(grade).toLowerCase()}, a ${cfg.nome} tem ${ev.length} torneios, do primeiro às ${hhmm(ev[0].inicio)} ao último às ${hhmm(ev[ev.length - 1].inicio)} (horário de Brasília).${top.length ? ` Os maiores garantidos são ${lista(top)}.` : ''} A lista completa, com buy-in, stack, blinds e late, está nesta página e é atualizada ao longo do dia.` },
    ...(mains.length ? [{ q: `Quais são os Main Events de hoje na ${cfg.nome}?`, a: `Os Main Events de hoje são ${lista(mains.slice(0, 6))}.` }] : []),
    { q: 'O que é late reg nos torneios?',
      a: 'Late reg (registro tardio) é o tempo depois do início em que ainda dá para se inscrever no torneio. Quem entra no late recebe o stack inicial cheio, mas os blinds já subiram. Nesta grade, o fim do late aparece em cada torneio, e o selo "Late aberto" mostra os que já começaram e ainda aceitam inscrição.' },
    { q: `Como jogar os torneios da ${cfg.nome}?`,
      a: `Os torneios ficam no lobby dos clubes da ${cfg.nome}${appTxt}. No ${quem || vars.name}, entre pelo link oficial em ${siteUrl}/baixar.${vars.disclaimer ? ` ${vars.disclaimer}` : ''}` },
  ];
}

function itemHtml(e, agora) {
  const lateAberto = e.inicio <= agora && (!e.late || agora < e.late);
  const tags = [modalidade(e.tipo), e.ko && 'KO', e.mainEvent && 'Main Event', e.satelite && 'Satélite'].filter(Boolean);
  const info = [`Buy-in <b>${e.buyin ? esc(brl(e.buyin)) : 'grátis'}</b>`, e.garantido ? `Garantido <b>${esc(brl(e.garantido))}</b>` : '',
    e.stack ? `Stack ${esc(kilo(e.stack))}` : '', e.blinds ? `Blinds ${esc(e.blinds)} min` : '', e.late ? `Late até ${esc(hhmm(e.late))}` : ''].filter(Boolean);
  return `<li class="mtt${e.mainEvent ? ' is-main' : ''}${lateAberto ? ' is-late' : ''}"><time class="mtt-hora" datetime="${esc(e.inicio.toISOString())}">${esc(hhmm(e.inicio))}</time>
    <div><p class="mtt-nome">${esc(e.nome)} ${tags.map((t) => `<span class="mtt-tag">${esc(t)}</span>`).join('')}${lateAberto ? '<span class="mtt-tag mtt-late">Late aberto</span>' : ''}${contagem({ _cd: cdEvento(e, agora) })}</p>
    <p class="mtt-info">${info.map((s) => `<span>${s}</span>`).join('')}</p></div></li>`;
}

const CSS = `.grade-resumo{max-width:760px;margin:0 auto 22px;text-align:center;color:var(--muted)}.grade-resumo b{color:var(--text)}
  .grade-top{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:14px;margin:0 0 28px}
  .grade-destaque{border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);padding:16px}.grade-destaque h2{font:650 1.15rem/1.25 var(--font-head,var(--font));margin:4px 0}
  .grade-destaque .hora{color:var(--primary);font-weight:700;margin:0}.grade-destaque .gtd{font-weight:700;margin:4px 0}
  .grade{max-width:860px;margin:0 auto 26px}.grade h2{font:700 1.3rem/1.2 var(--font-head,var(--font));margin:0 0 10px}.grade h2 small{color:var(--muted);font-weight:500;font-size:.85rem}
  .mtt-list{list-style:none;margin:0;padding:0;display:grid;gap:8px}.mtt{display:grid;grid-template-columns:64px 1fr;gap:12px;align-items:start;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);padding:12px 14px}
  .mtt.is-main{border-color:var(--primary)}.mtt-hora{font-weight:700;color:var(--primary)}.mtt-nome{margin:0;font-weight:650}.mtt-info{margin:4px 0 0;color:var(--muted);font-size:.92rem;display:flex;flex-wrap:wrap;gap:4px 14px}
  .mtt-tag{display:inline-block;margin-left:6px;border:1px solid var(--border);border-radius:999px;padding:0 8px;font-size:.75rem;font-weight:600;color:var(--muted)}.mtt-late{color:var(--primary);border-color:var(--primary)}
  .grade-fonte{max-width:860px;margin:0 auto 26px;color:var(--muted);font-size:.9rem}.grade-faq{max-width:860px;margin:0 auto 26px}.grade-faq details{border-top:1px solid var(--border);padding:10px 0}
  .grade-faq summary{cursor:pointer;font-weight:650}.grade-cta{max-width:860px;margin:0 auto}.grade-cta a.btn-cta{display:inline-block;margin-top:6px;padding:10px 16px;border-radius:var(--radius);background:var(--primary);color:var(--primary-text,#fff);font-weight:700;text-decoration:none}`;

function paginaTorneios({ site, tenant, base, origin, grade, cfg, agora, imagem = '' }) {
  const vars = templateVars(tenant, parse(tenant.settings, {}) || {});
  const home = absoluteSiteUrl(origin, base, '/');
  const canonical = absoluteSiteUrl(origin, base, '/torneios');
  const siteUrl = absoluteSiteUrl(origin, base, '').replace(/\/+$/, '');
  const abertosAgora = abertos(grade, agora);
  const fechados = grade ? grade.eventos.length - abertosAgora.length : 0;
  const top = destaques(abertosAgora, 3);
  const maior = grade ? destaques(grade.eventos, 1)[0] : null;
  const periodos = PERIODOS.map(([nome, faixa, teste]) => [nome, faixa, abertosAgora.filter((e) => teste(brHora(e.inicio)))]).filter(([, , l]) => l.length);
  const faq = grade && grade.eventos.length ? faqTorneios(grade, cfg, vars, siteUrl) : [];
  const dia = grade ? rotuloDia(grade) : '';
  const titulo = grade ? `Torneios de hoje (${diaCurto(grade)}) na ${cfg.nome} · ${site.name}` : `Grade de torneios de hoje na ${cfg.nome} · ${site.name}`;
  const descricao = maior
    ? `Grade de hoje, ${dia.toLowerCase()}, na ${cfg.nome}: ${grade.eventos.length} torneios, maior garantido ${maior.nome} (${brl(maior.garantido)}) às ${hhmm(maior.inicio)}. Horário de Brasília, buy-in e late reg.`
    : `Torneios de hoje na ${cfg.nome}: horário de Brasília, buy-in, garantido e late reg, atualizados ao longo do dia.`;
  const eventosLd = grade && grade.eventos.length ? [{
    '@type': 'ItemList', name: `Torneios de hoje (${diaCurto(grade)}) na ${cfg.nome}`,
    itemListElement: destaques(grade.eventos, 10).map((e, i) => ({ '@type': 'ListItem', position: i + 1, item: {
      '@type': 'Event', name: `${e.nome} · ${cfg.nome} (${modalidade(e.tipo)})`, startDate: e.inicio.toISOString(),
      eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
      location: { '@type': 'VirtualLocation', url: canonical }, organizer: { '@type': 'Organization', name: cfg.nome, url: canonical },
      description: `Torneio de poker ${modalidade(e.tipo)}${vars.app ? ` no app ${vars.app}` : ''}${e.garantido ? `, ${brl(e.garantido)} garantidos` : ''}${e.stack ? `, stack ${kilo(e.stack)}` : ''}. ${vars.disclaimer || 'Somente maiores de 18 anos.'}`,
      offers: { '@type': 'Offer', price: e.buyin, priceCurrency: 'BRL', availability: 'https://schema.org/InStock', url: canonical },
    } })),
  }] : [];
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebPage', '@id': `${canonical}#pagina`, url: canonical, name: `Grade de torneios de hoje na ${cfg.nome}`, inLanguage: 'pt-BR', dateModified: agora.toISOString(), isPartOf: { '@type': 'WebSite', name: site.name, url: home } },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Início', item: home }, { '@type': 'ListItem', position: 2, name: 'Torneios de hoje', item: canonical }] },
    ...eventosLd,
    ...(faq.length ? [faqLd(faq, `${canonical}#perguntas`)] : []),
  ] };
  const corpo = `<body><main class="blog-wrap">
    <nav class="blog-top"><a class="blog-brand" href="${esc(`${base}/`)}">${esc(site.name)}</a><a href="${esc(`${base}/`)}">Página inicial</a></nav>
    <header class="blog-intro"><p class="blog-meta">${esc(cfg.nome)} · horário de Brasília</p><h1>Torneios de hoje</h1>
      <p>Os torneios da ${esc(cfg.nome)} para jogar hoje no ${esc(vars.unitLabel || site.name)}: horário, buy-in, garantido, stack, blinds e até quando dá para entrar.</p>
      ${grade ? `<p class="blog-meta">${esc(dia)} · atualizada às ${esc(hhmm(agora))}</p>` : ''}</header>
    ${maior ? `<p class="grade-resumo">Hoje a ${esc(cfg.nome)} tem <b>${grade.eventos.length} torneios</b>. O maior garantido é o <b>${esc(maior.nome)}</b>, com <b>${esc(brl(maior.garantido))}</b>, às ${esc(hhmm(maior.inicio))}. ${abertosAgora.length ? `Ainda dá para entrar em ${abertosAgora.length}.` : 'O registro de todos já fechou.'}</p>` : ''}
    ${!grade ? '<aside class="blog-box blog-box-nota grade-cta"><strong class="blog-box-title">Grade indisponível agora</strong><p>Não conseguimos carregar a grade da liga. Tente de novo em alguns minutos ou veja os torneios direto no lobby do app.</p></aside>' : ''}
    ${grade && !abertosAgora.length ? '<aside class="blog-box blog-box-nota grade-cta"><strong class="blog-box-title">Sem torneios abertos agora</strong><p>Os torneios de hoje já fecharam o registro. A grade de amanhã aparece aqui a partir das 7h.</p></aside>' : ''}
    ${top.length ? `<section class="grade-top" aria-label="Destaques de hoje">${top.map((e) => `<article class="grade-destaque"><p class="hora">${esc(hhmm(e.inicio))}</p><h2>${esc(e.nome)}</h2>
      <p class="gtd">${e.garantido ? `${esc(brl(e.garantido))} garantidos` : esc(modalidade(e.tipo))}</p><p class="blog-meta">${esc(modalidade(e.tipo))} · buy-in ${e.buyin ? esc(brl(e.buyin)) : 'grátis'}${e.stack ? ` · stack ${esc(kilo(e.stack))}` : ''}</p></article>`).join('')}</section>` : ''}
    ${periodos.map(([nome, faixa, lista]) => `<section class="grade" aria-label="${esc(nome)}"><h2>${esc(nome)} <small>${esc(faixa)}</small></h2><ol class="mtt-list">${lista.map((e) => itemHtml(e, agora)).join('')}</ol></section>`).join('')}
    ${grade ? `<p class="grade-fonte">${abertosAgora.length} torneios ainda abertos${fechados ? ` · ${fechados} já fecharam o registro hoje` : ''}. Horários de Brasília. A grade vem da ${esc(cfg.nome)} e pode mudar: confira sempre no lobby do app antes de se inscrever. Versão em texto: <a href="${esc(`${base}/torneios.txt`)}">torneios.txt</a>.${vars.disclaimer ? ` ${esc(vars.disclaimer)}` : ''}</p>` : ''}
    ${faq.length ? `<section class="grade-faq" aria-labelledby="faq-torneios"><h2 id="faq-torneios">Perguntas sobre os torneios de hoje</h2>${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>` : ''}
    <aside class="blog-box blog-box-cta grade-cta"><strong class="blog-box-title">Quer jogar esses torneios?</strong><p>Os torneios da ${esc(cfg.nome)} ficam no lobby do ${esc(vars.unitLabel || site.name)}. Entre pelo link oficial e comece hoje.</p><a class="btn-cta" href="${esc(`${base}/baixar`)}">Entrar no clube</a></aside>
    </main>${abertosAgora.length ? '<script src="/assets/contagem.js" defer></script>' : ''}</body></html>`;
  return `${head({ site, origin, base, title: titulo, description: descricao, canonical: '/torneios', image: imagem, structuredData: ld, ogType: 'website', extraCss: CSS })}${corpo}`;
}

function textoTorneios({ site, tenant, base, origin, grade, cfg, agora }) {
  const vars = templateVars(tenant, parse(tenant.settings, {}) || {});
  const pagina = absoluteSiteUrl(origin, base, '/torneios');
  if (!grade) return `# Grade de torneios da ${cfg.nome}\n\nA grade não carregou agora. Veja ${pagina} em alguns minutos.\n`;
  const linha = (e) => `- ${hhmm(e.inicio)} | ${e.nome} | ${modalidade(e.tipo)} | buy-in ${e.buyin ? brl(e.buyin) : 'grátis'} | garantido ${e.garantido ? brl(e.garantido) : '-'} | stack ${e.stack ? kilo(e.stack) : '-'} | blinds ${e.blinds ? `${e.blinds} min` : '-'} | late até ${e.late ? hhmm(e.late) : '-'}${e.mainEvent ? ' | Main Event' : ''}${e.ko ? ' | KO' : ''}${e.satelite ? ' | satélite' : ''}`;
  const quem = [vars.unitLabel, vars.agentId && `agente ${vars.agentId}`, vars.app && `no app ${vars.app}`].filter(Boolean).join(', ');
  return `# Torneios de hoje na ${cfg.nome}: ${rotuloDia(grade)}

Fonte: grade oficial da liga (API PokerByte, liga ${cfg.liga}). Atualizada às ${hhmm(agora)} (horário de Brasília).
Página completa: ${pagina}
Para jogar: ${site.name}${quem ? ` (${quem})` : ''}. ${vars.disclaimer || 'Somente maiores de 18 anos.'}

## Destaques (maiores garantidos)
${destaques(grade.eventos, 5).map(linha).join('\n')}

## Todos os torneios do dia (${grade.eventos.length}), das 7h às 7h do dia seguinte
Formato: horário | nome | modalidade | buy-in | garantido | stack inicial | tempo de blind | fim do registro tardio
${grade.eventos.map(linha).join('\n')}
`;
}

/** Imagem de compartilhamento da página: a do SEO do site ou, sem ela, o og:image que a página inicial própria já publica (SEO de 10/11). */
function imagemDoSite({ site, app }) {
  try {
    const seo = JSON.parse(site.seo || '{}');
    if (/^https:\/\//.test(seo.image || '')) return seo.image;
    const raiz = app?.db?.prepare("SELECT html FROM paginas_proprias WHERE site_id = ? AND caminho = ''").get(site.id);
    return /<meta property="og:image" content="(https:\/\/[^"]+)"/.exec(raiz?.html || '')?.[1] || '';
  } catch { return ''; }
}

async function servir(ctx, txt) {
  const { req, res, send, tenant } = ctx;
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const cfg = configTorneios(tenant);
  if (!cfg.ativo) return false; // desligado: segue para a página do construtor (se houver) ou 404
  const agora = new Date();
  let grade = null;
  try { grade = await buscarGrade(cfg.liga, { agora, fetchImpl: ctx.app.fetchImpl || globalThis.fetch }); } catch { grade = null; }
  const dados = { ...ctx, grade, cfg, agora, imagem: imagemDoSite(ctx) };
  if (txt) return send(res, 200, textoTorneios(dados), { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=120' });
  sendHtml(send, res, paginaTorneios(dados));
  return undefined;
}

export const publicRoutes = [
  { path: '/torneios.txt', handler: (ctx) => servir(ctx, true) },
  { path: '/torneios', handler: (ctx) => servir(ctx, false) },
];

/** Sitemap: /torneios quando ligado (e sem página do construtor publicada no mesmo caminho). */
export function sitemapEntries({ site, tenant, repo }) {
  if (!configTorneios(tenant).ativo) return [];
  if (repo.all('pages', { site_id: site.id, slug: 'torneios' }, { limit: 1, extra: 'published IS NOT NULL' }).length) return [];
  return [{ path: '/torneios', lastmod: new Date().toISOString().slice(0, 10) }];
}

/** Grava chaves na settings da operação (mescla; não passa pelo cleanSettings do núcleo, que só conhece as chaves básicas). */
export function gravarSettings(db, tenant, patch) {
  const settings = { ...(parse(tenant.settings, {}) || {}), ...patch };
  db.prepare('UPDATE tenants SET settings = ? WHERE id = ?').run(JSON.stringify(settings), tenant.id);
  return settings;
}

export const routes = [
  {
    method: 'PUT', path: '/api/t/:tenant/torneios/config', perm: 'tenant.manage', handler: ({ db, tenant, body, audit }) => {
      const ativo = body?.ativo === true || body?.ativo === 'true' || body?.ativo === 1;
      const liga = String(body?.liga ?? '').trim();
      if (liga && !LIGA.test(liga)) throw new HttpError(400, 'A liga é o número dela na PokerByte (ex.: 106).');
      if (ativo && !liga) throw new HttpError(400, 'Para ligar os torneios, informe o número da liga.');
      const nome = String(body?.nome ?? '').trim().replace(/[\r\n<>]/g, '').slice(0, 60);
      const settings = gravarSettings(db, tenant, { torneiosAtivo: ativo, torneiosLiga: liga, torneiosNome: nome });
      audit('torneios.config', tenant.id, { ativo, liga });
      return { torneios: configTorneios({ settings: JSON.stringify(settings) }) };
    },
  },
  {
    method: 'GET', path: '/api/t/:tenant/torneios/previa', perm: 'tenant.read', handler: async ({ tenant, app }) => {
      const cfg = configTorneios(tenant);
      if (!cfg.liga) return { torneios: cfg, texto: null, total: 0, erro: 'Sem liga configurada.' };
      const grade = await buscarGrade(cfg.liga, { fetchImpl: app.fetchImpl || globalThis.fetch });
      const texto = cfg.ativo ? await gradeDoDia(tenant, { fetchImpl: app.fetchImpl || globalThis.fetch }) : null;
      return { torneios: cfg, total: grade ? grade.eventos.length : 0, texto, erro: grade ? null : 'A API da liga não respondeu agora.' };
    },
  },
];

// Grade estruturada para o robô dos grupos e o Bluesky (lib/automacao.mjs → obterGrade lê app.gradeDoDia):
// { dia, url, eventos: [{ inicio, nome, garantido, buyin, ... }] } do dia de poker da operação, ou null.
export async function gradeEstruturada(tenant, { agora = new Date(), app = APP } = {}) {
  const cfg = configTorneios(tenant);
  if (!cfg.ativo) return null;
  const grade = await buscarGrade(cfg.liga, { agora, fetchImpl: app?.fetchImpl || globalThis.fetch });
  if (!grade || !grade.eventos.length) return null;
  return { dia: grade.dia, url: app ? urlTorneios(app, tenant) : '', eventos: grade.eventos };
}

/**
 * Blocos de grade com "aoVivo" (modelos prontos) recebem os torneios abertos da liga na hora de desenhar a página.
 * A página espera a liga no máximo ESPERA_PAGINA_MS (app.esperaGradeMs nos testes); sem resposta, fica com os itens digitados.
 */
export async function prepararBlocosAoVivo(app, tenant, blocks, { agora = new Date() } = {}) {
  if (!pedeGradeAoVivo(blocks)) return blocks;
  const cfg = configTorneios(tenant);
  if (!cfg.ativo) return blocks;
  let timer;
  const limite = new Promise((r) => { timer = setTimeout(() => r(null), app.esperaGradeMs ?? ESPERA_PAGINA_MS); });
  const grade = await Promise.race([buscarGrade(cfg.liga, { agora, fetchImpl: app.fetchImpl || globalThis.fetch, rapido: true }).catch(() => null), limite]);
  clearTimeout(timer);
  return grade ? aplicarGradeAoVivo(blocks, grade, { agora, nome: cfg.nome }) : blocks;
}

export function init(app) {
  APP = app;
  if (typeof app.gradeDoDia !== 'function') app.gradeDoDia = (tenant, opts = {}) => gradeEstruturada(tenant, { ...opts, app });
  const antes = app.prepararBlocos;
  app.prepararBlocos = async (tenant, blocks) => prepararBlocosAoVivo(app, tenant, antes ? await antes(tenant, blocks) : blocks);
}
