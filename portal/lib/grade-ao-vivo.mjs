// Grade ao vivo nos blocos de grade dos modelos prontos (Rack, Relógio, Transmissão, Ingresso, Comprovante, agenda simples e letreiro).
// Quando o bloco tem "aoVivo" marcado e a operação tem torneios ligados (Recursos → Torneios ao vivo), os itens digitados à mão
// são trocados, só na hora de desenhar a página, pelos torneios da liga que ainda aceitam inscrição, no formato de cada bloco.
// Nada é gravado: se a liga não responder, o bloco mostra os itens digitados (como antes).
// Cada item ganha _cd = { ini, fim, texto, fase, urgente } para a contagem regressiva (block-kit → contagem(); site.js atualiza).

const TZ = 'America/Sao_Paulo';
export const URGENTE_MIN = 5;
const hhmm = (d) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
const brHora = (d) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(d));
const brl = (n) => `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 })}`;
const kilo = (n) => (n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));
const modalidade = (t) => String(t || 'NLH').replace(/^PLO(\d)$/, 'PLO $1');
const periodo = (d) => { const h = brHora(d); return h >= 7 && h < 12 ? 'Manhã' : h >= 12 && h < 18 ? 'Tarde' : h >= 18 ? 'Noite' : 'Madrugada'; };
const buyin = (e) => (e.buyin ? brl(e.buyin) : 'Grátis');
const gtd = (e) => (e.garantido ? brl(e.garantido) : '—');
const selo = (e) => (e.mainEvent ? 'Main Event' : e.satelite ? 'Satélite' : '');
const formato = (e) => [modalidade(e.tipo), e.ko && 'KO', e.stack && `stack ${kilo(e.stack)}`].filter(Boolean).join(' · ');

/** Blocos que sabem receber a grade ao vivo. */
export const BLOCOS_GRADE = new Set(['rack_grade', 'relogio_grade', 'transmissao_grade', 'transmissao_letreiro', 'ingresso_fita', 'comprovante_agenda', 'schedule']);

/** Duração curta em pt-BR: "12 min", "1h05", "menos de 1 min". */
export function duracao(ms) {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'menos de 1 min';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

/**
 * Estado da contagem de um torneio agora. fim = fim do late (ou o próprio início, sem late).
 * fase: 'antes' (ainda não começou), 'late' (começou, inscrição aberta), 'fim' (inscrição fechada).
 * urgente: faltam 5 min ou menos para o próximo marco (início ou fim do late).
 */
export function estadoContagem(ini, fim, agora = new Date()) {
  const a = +agora; const i = +new Date(ini); const f = Math.max(i, +new Date(fim || ini));
  if (a < i) { const r = i - a; return { fase: 'antes', texto: `começa em ${duracao(r)}`, urgente: r <= URGENTE_MIN * 60_000 }; }
  if (a < f) { const r = f - a; return { fase: 'late', texto: `late fecha em ${duracao(r)}`, urgente: r <= URGENTE_MIN * 60_000 }; }
  return { fase: 'fim', texto: 'inscrição encerrada', urgente: false };
}

/** Contagem de um torneio normalizado (torneios.mjs) para contagem() do block-kit. */
export const cdEvento = (e, agora = new Date()) => {
  const ini = e.inicio.toISOString();
  const fim = (e.late || e.inicio).toISOString();
  return { ini, fim, ...estadoContagem(ini, fim, agora) };
};

const rotuloDia = (agora) => {
  const s = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(agora);
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// item no formato de cada bloco
const MAPAS = {
  rack_grade: (e) => ({ day: '', time: hhmm(e.inicio), name: e.nome, detail: [formato(e), selo(e)].filter(Boolean).join(' · '), buyin: buyin(e), prize: gtd(e) }),
  relogio_grade: (e) => ({ day: '', time: hhmm(e.inicio), name: e.nome, mode: [modalidade(e.tipo), e.ko && 'KO'].filter(Boolean).join(' '), buyin: buyin(e), guaranteed: gtd(e),
    stack: e.stack ? kilo(e.stack) : '', blinds: e.blinds ? String(e.blinds) : '', late: e.late ? hhmm(e.late) : '', tag: e.mainEvent ? 'Main' : '' }),
  transmissao_grade: (e) => ({ period: periodo(e.inicio), time: hhmm(e.inicio), name: e.nome, game: [modalidade(e.tipo), e.ko && 'KO'].filter(Boolean).join(' '), buyin: buyin(e), prize: gtd(e), lead: e.mainEvent }),
  transmissao_letreiro: (e) => ({ time: hhmm(e.inicio), name: e.nome, detail: `${modalidade(e.tipo)} · ${buyin(e)}${e.garantido ? ` · ${gtd(e)} GTD` : ''}` }),
  ingresso_fita: (e) => ({ dia: 'Hoje', hora: hhmm(e.inicio), nome: e.nome, tipo: formato(e), selo: selo(e), rot1: 'Buy-in', val1: buyin(e), rot2: 'Garantido', val2: gtd(e), nota: e.late ? `Late até ${hhmm(e.late)}` : '' }),
  comprovante_agenda: (e) => ({ day: 'Hoje', time: hhmm(e.inicio), name: e.nome, info: `${formato(e)} · buy-in ${buyin(e)}`, label: 'Garantido', value: gtd(e) }),
  schedule: (e) => ({ day: 'Hoje', time: hhmm(e.inicio), name: e.nome, detail: `${formato(e)} · buy-in ${buyin(e)}`, prize: e.garantido ? `${gtd(e)} garantidos` : selo(e) }),
};

// textos do bloco que deixam de ser "exemplo" e passam a dizer de onde vem a grade
function cabecalho(type, props, { nome, agora }) {
  const fonte = `Ao vivo da ${nome} · atualizada às ${hhmm(agora)}`;
  switch (type) {
    case 'rack_grade': return { example: false, exampleNote: '', date: `${rotuloDia(agora)} · horário de Brasília` };
    case 'relogio_grade': return { live: false, note: fonte };
    case 'transmissao_grade': return { sample: false, source: fonte };
    case 'transmissao_letreiro': return { sample: false };
    case 'ingresso_fita': return { exemplo: false, meta: `${rotuloDia(agora)} · ${fonte}` };
    case 'comprovante_agenda': return { tag: 'AO VIVO', live: true, headRight: props.headRight || rotuloDia(agora) };
    default: return {};
  }
}

/**
 * Troca os itens dos blocos com aoVivo pela grade. grade = { eventos } (torneios.mjs → buscarGrade), cfg = { nome }.
 * Mostra só o que ainda aceita inscrição, em ordem de horário, até aoVivoMax (padrão 8, máx. 20).
 * Sem grade ou sem torneio aberto, o bloco fica como está.
 */
export function aplicarGradeAoVivo(blocks, grade, { agora = new Date(), nome = 'liga' } = {}) {
  if (!Array.isArray(blocks)) return blocks;
  const abertos = grade?.eventos?.filter((e) => +(e.late || e.inicio) > +agora) || [];
  if (!abertos.length) return blocks;
  return blocks.map((b) => {
    if (!b?.props?.aoVivo || !MAPAS[b.type]) return b;
    const max = Math.max(1, Math.min(20, Number.parseInt(b.props.aoVivoMax, 10) || 8));
    const items = abertos.slice(0, max).map((e) => ({ ...MAPAS[b.type](e), _cd: cdEvento(e, agora) }));
    return { ...b, props: { ...b.props, ...cabecalho(b.type, b.props, { nome, agora }), items, _aoVivo: true } };
  });
}

/** Algum bloco da página pede a grade ao vivo? */
export const pedeGradeAoVivo = (blocks) => Array.isArray(blocks) && blocks.some((b) => b?.props?.aoVivo && BLOCOS_GRADE.has(b.type));
