// Preflight de texto: confere uma legenda, roteiro ou mensagem ANTES de aprovar. Sem dependências e sem rede.
// Usado pelo Estúdio de UGC (PA-141) e pela trilha de migração da SX (PA-140). Mudar a API quebra os dois: só acrescente.
//
// ─────────────────────────────────────────────── API ESTÁVEL ───────────────────────────────────────────────
//
//   import { checarTexto, checarPeca, completarRodape, exigeJogoResponsavel, RODAPE_JOGO, REGRAS } from './preflight.mjs';
//
//   checarTexto(texto, { nicho, edicao, rede, parte, formato }) → { ok, bloqueios, avisos, faltando }
//     texto    string (null/undefined viram '')
//     nicho    'poker' | 'saas' | 'loja' | 'criador' | ... (id de lib/niches.mjs)
//     edicao   'sx' | 'geral' (lib/edition.mjs). Na SX vale tudo do poker, qualquer que seja o nicho.
//     rede     'youtube' | 'instagram' | 'tiktok' (opcional; liga os avisos de tamanho e de hashtags da rede)
//     parte    'legenda' (padrão) | 'roteiro' | 'capa' | 'briefing' | 'hashtags' | 'mensagem'
//              Os itens obrigatórios (+18, jogo responsável, rótulo de IA) só são cobrados em 'legenda' e 'mensagem'.
//     formato  'ia' | 'criador' | 'marca' (opcional). Com 'ia', exige o rótulo de IA na legenda e bloqueia "sou pessoa real".
//
//     ok         true só quando bloqueios e faltando estão vazios (avisos não impedem a aprovação)
//     bloqueios  [{ regra, trecho, motivo, pos }]  trecho = pedaço ORIGINAL do texto; pos = índice dele no texto
//     avisos     [{ regra, trecho, motivo, pos }]  (pos = -1 quando o aviso é do texto todo)
//     faltando   [{ regra, trecho, motivo }]       trecho = o texto exato que precisa entrar (ex.: '+18')
//
//   checarPeca({ roteiro, legenda, hashtags, capa, briefing }, opts) → mesmo formato, com `parte` em cada item.
//     Junta as partes: as regras de bloqueio valem em todas, os obrigatórios só na legenda (hashtags contam como legenda).
//
//   completarRodape(texto, opts) → texto com o que falta (+18, jogo responsável, rótulo de IA) acrescentado no fim.
//   exigeJogoResponsavel({ nicho, edicao }) → true na edição SX ou no nicho poker.
//   RODAPE_JOGO = '+18 · Jogue com responsabilidade.'
//   REGRAS = { id: 'descrição' } (lista para telas e relatórios)
//
// ───────────────────────────────────────────── O QUE BLOQUEIA ─────────────────────────────────────────────
//   promessa_ganho       "ganhe", "renda extra", "lucro garantido", "fique rico", "dinheiro fácil", "lucre", "viva de poker"...
//   bonus                bônus, ficha grátis, rakeback, cashback, depósito em dobro (estatuto do clube veda).
//                        Fora do poker/SX: ficha grátis e rakeback seguem bloqueando; bônus e cashback viram aviso.
//   resultado_garantido  "garantido"/"garantimos"/"garantia de" perto de ganho, lucro, vitória, resultado, retorno...
//   menor_de_idade       criança, adolescente, escola, mesada, "a partir de 16 anos"... ("proibido para menores" é permitido)
//   ia_finge_pessoa      (só formato 'ia') "sou pessoa real", "não sou IA"...
// Negação imediata libera: "sem bônus", "nada de dinheiro fácil", "não é dinheiro fácil".
// Acentos, caixa, letras repetidas e troca por números ("gr4tis", "b0nus", "rake-back") são cobertos.
//
// ───────────────────────────────────────────── O QUE AVISA ────────────────────────────────────────────────
//   palavrao, caixa_alta, link_encurtado, garantido (fora de resultado), tamanho_rede, hashtags_demais
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export const RODAPE_JOGO = '+18 · Jogue com responsabilidade.';
export const ROTULO_IA = 'Conteúdo feito com IA.';

export const REGRAS = {
  promessa_ganho: 'Promessa de ganho, renda ou lucro',
  bonus: 'Bônus, ficha grátis, rakeback ou cashback oferecido ao público',
  resultado_garantido: 'Resultado "garantido"',
  menor_de_idade: 'Mensagem que mira menor de idade',
  ia_finge_pessoa: 'Persona de IA se apresentando como pessoa real',
  mais_18: 'Falta o "+18"',
  jogo_responsavel: 'Falta o "Jogue com responsabilidade"',
  rotulo_ia: 'Falta o rótulo de conteúdo feito com IA',
  palavrao: 'Palavrão',
  caixa_alta: 'CAIXA ALTA demais',
  link_encurtado: 'Link encurtado',
  garantido: '"Garantido" fora de resultado',
  tamanho_rede: 'Texto maior que o limite da rede',
  hashtags_demais: 'Hashtags demais para a rede',
};

export const exigeJogoResponsavel = ({ nicho, edicao } = {}) => edicao === 'sx' || nicho === 'poker';

// ---------- normalização com mapa de posições (para devolver o trecho ORIGINAL) ----------
function normalizar(texto) {
  const orig = String(texto ?? '');
  let norm = '';
  const map = [];
  for (let i = 0; i < orig.length; i++) {
    const n = orig[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    for (let k = 0; k < n.length; k++) { norm += n[k]; map.push(i); }
  }
  return { orig, norm, map };
}
const trechoDe = (t, ini, fim) => (fim > ini ? t.orig.slice(t.map[ini], t.map[fim - 1] + 1) : '');

// ---------- construção de padrões tolerantes ----------
// Cada letra aceita repetição e a troca comum por número/símbolo; ' ' = separador obrigatório; '~' = separador opcional.
const LEET = { a: '[a4@]', e: '[e3]', i: '[i1!]', o: '[o0]', s: '[s5$]', t: '[t7]' };
const SEP = '[\\s\\-_.·*]';
const L = (palavra) => palavra.split('').map((c) => (c === ' ' ? `${SEP}+` : c === '~' ? `${SEP}*` : `${LEET[c] || c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}+`)).join('');
const B = '(?<![a-z0-9])';   // começo de palavra
const E = '(?![a-z0-9])';    // fim de palavra
const W = (alts) => `${B}(?:${alts.map(L).join('|')})${E}`;
const rx = (src) => new RegExp(src, 'g');

// negação logo antes do trecho: "sem bônus", "nada de dinheiro fácil", "não é dinheiro fácil"
const NEGA = /(?:^|[^a-z0-9])(?:sem|nada de|nenhum|nenhuma|zero|jamais|nunca|nao tem|nao ha|nao existe|nao e|nao sao|nao damos|nao da|nao oferecemos|nao oferece|nao prometemos|nao promete|nao vendemos|nao trabalhamos com|esqueca|fuja de|cuidado com|evite|proibido|proibida|(?:nao|nunca|jamais) (?:fale|fala|falar|diga|diz|use|usa|prometa|promete|prometer|ofereca|oferece|oferecer|cite|mencione|faca))\s+(?:o |a |os |as |de |do |da |um |uma |com |em |sobre )?$/; // "sem bônus", "nunca prometa ganho"
const negado = (t, ini) => NEGA.test(t.norm.slice(Math.max(0, ini - 40), ini));

// ressalva legítima antes de "menores": "proibido para menores", "não é permitido para menores de 18"
const RESSALVA_MENOR = /(?:proibid|vedad|nao (?:e |sao )?permitid|nao (?:e |sao )?indicad|restrit|impedid|bloquead|exceto|nao aceitamos|nao atendemos|nao e para|nao sao aceit|longe d|fora d|(?:nao|nunca|jamais) (?:fale|fala|falar|mire|mira|use|usa))[^.!?\n]{0,30}$/;

// ressalva legítima depois: "menor de idade fica fora", "menores não podem jogar", "menor de 18 não entra"
const RESSALVA_MENOR_DEPOIS = /^[^.!?\n]{0,12}(?:fica(?:m)? (?:de )?fora|esta(?:o)? fora|nao (?:pode|podem|entra|entram|joga|jogam|participa|participam|tem acesso)|e proibid|sao proibid|e vedad|sao vedad|e bloquead|sao bloquead)/;

// ---------- regras ----------
const NAO_FINANCEIRO = ['tempo', 'produtividade', 'agilidade', 'praticidade', 'foco', 'experiencia', 'confianca', 'clareza', 'controle', 'horas', 'minutos', 'espaco', 'seguidores', 'conhecimento', 'pratica', 'disciplina'];
const DINHEIRO = '(?:dinheiro|grana|renda|reais|real|r\\$|\\$|\\d|mil|milhao|todo dia|todos os dias|por dia|por mes|por semana|por hora|garantid\\w*|facil|certo|certa|extra|rapido|sem esforco|sem sair de casa)';
const RESULTADO = '(?:ganhos?|lucros?|resultados?|vitorias?|retornos?|sucesso|dinheiro|renda|premios?|premiacao|green|vencer|ganhar|lucrar|aprovacao|vendas?|clientes?|faturamento)';

const BLOQUEIOS = [
  {
    regra: 'promessa_ganho',
    motivo: 'Promete ganho, renda ou lucro. Fale da experiência e do que a operação oferece, nunca de dinheiro a ganhar.',
    padroes: [
      rx(`${B}${L('ganhe')}m?${E}(?!${SEP}+(?:${NAO_FINANCEIRO.join('|')})${E})`),
      rx(`${B}(?:${['ganhar', 'ganha', 'ganhando', 'ganho', 'ganhos', 'faturar', 'faturando', 'lucrar', 'lucro', 'lucros', 'lucrando', 'lucrativo'].map(L).join('|')})${E}(?:${SEP}+[a-z0-9$]+){0,3}?${SEP}+${DINHEIRO}`),
      rx(W(['lucre', 'lucrem', 'fature', 'faturem', 'enriqueca', 'enriquecer', 'enriquecam'])),
      rx(W(['renda extra', 'renda passiva', 'renda mensal', 'renda diaria', 'renda garantida', 'segunda renda', 'fonte de renda',
        'fique rico', 'ficar rico', 'fica rico', 'ficar rica', 'fique rica', 'dinheiro facil', 'grana facil', 'dinheiro rapido', 'grana rapida',
        'dinheiro garantido', 'dinheiro certo', 'dinheiro no bolso', 'viver de poker', 'viva de poker', 'vivo de poker', 'independencia financeira',
        'liberdade financeira', 'largue seu emprego', 'largar o emprego', 'sem risco', 'risco zero', 'nunca perde', 'impossivel perder'])),
      rx(`${B}${L('multiplique')}${SEP}+(?:seu|sua|o|a)${SEP}+(?:dinheiro|banca|grana|deposito|saldo|investimento)${E}`),
    ],
  },
  {
    regra: 'bonus',
    motivo: 'Oferece bônus, ficha grátis, rakeback ou cashback. O estatuto do clube veda qualquer vantagem desse tipo ao público.',
    padroes: [
      { re: rx(W(['bonus', 'bonificacao', 'bonificacoes'])), soPoker: true },
      { re: rx(W(['cash~back', 'cash~backs'])), soPoker: true },
      rx(W(['rake~back', 'rake~backs', 'free~bet', 'free~bets', 'freebet', 'aposta gratis', 'apostas gratis', 'giro gratis', 'giros gratis', 'free spins',
        'deposito em dobro', 'dobramos seu deposito', 'dobro do deposito', 'credito gratis', 'saldo gratis', 'credito de presente'])),
      rx(`${B}${L('ficha')}s?${SEP}+(?:${['gratis', 'gratuita', 'gratuitas', 'de graca', 'free', 'bonus', 'extra', 'extras', 'de presente', 'na faixa', 'sem custo', 'liberada', 'liberadas'].map(L).join('|')})${E}`),
      rx(`${B}(?:${['ganhe', 'receba', 'leve', 'pegue', 'resgate', 'garanta', 'damos', 'ganha'].map(L).join('|')})${SEP}+(?:\\d+${SEP}*)?(?:mil${SEP}+)?${L('ficha')}s?${E}`),
    ],
  },
  {
    regra: 'resultado_garantido',
    motivo: 'Garante resultado. Nada é garantido: tire o "garantido".',
    padroes: [
      rx(`${B}${RESULTADO}${SEP}+(?:[a-z]+${SEP}+)?${L('garantid')}(?:o|a|os|as)${E}`),
      rx(`${B}${L('garantid')}(?:o|a|os|as)${SEP}+(?:[a-z]+${SEP}+)?${RESULTADO}${E}`),
      rx(`${B}(?:${L('garantimos')}|${L('garante')}|${L('garantia de')})${SEP}+(?:[a-z]+${SEP}+){0,2}?${RESULTADO}${E}`),
      rx(`(?:100${SEP}*%|cem por cento)${SEP}*${L('garantid')}(?:o|a|os|as)${E}`),
    ],
  },
  {
    regra: 'menor_de_idade',
    motivo: 'Mira menor de idade. O conteúdo é só para maiores de 18 e não pode falar com crianças, adolescentes ou estudantes.',
    ressalva: RESSALVA_MENOR,
    ressalvaDepois: RESSALVA_MENOR_DEPOIS,
    padroes: [
      rx(W(['menor de idade', 'menores de idade', 'adolescente', 'adolescentes', 'crianca', 'criancas', 'criancada', 'ensino medio', 'ensino fundamental',
        'colegio', 'recreio', 'mesada', 'novinho', 'novinha', 'novinhos', 'novinhas', 'teen', 'teens', 'volta as aulas', 'molecada', 'pirralho', 'pirralhos'])),
      rx(`${B}menor(?:es)?${SEP}+de${SEP}+(?:18|dezoito)${E}`),
      rx(`${B}(?:na|da|pra|para a|depois da|saindo da)${SEP}+escola${E}(?!${SEP}+de${E})`),
      rx(`${B}(?:a partir d[eo]s?|com|tem|tiver|tenha|de)${SEP}+(?:[5-9]|1[0-7])${SEP}*anos${E}(?!${SEP}+(?:de|no|na|que)${E})`),
      rx(`(?<![0-9])\\+${SEP}?1[0-7](?=\\s*(?:$|[.!?,;)]))`), // "+16" solto (não "+16 torneios")
      rx(`${B}sub${SEP}?1[0-7]${E}`),
    ],
  },
  {
    regra: 'ia_finge_pessoa',
    motivo: 'Persona de IA nunca se apresenta como pessoa real.',
    soIa: true,
    padroes: [
      rx(W(['sou humano', 'sou humana', 'sou de carne e osso', 'sou uma pessoa real', 'sou pessoa real', 'sou uma pessoa de verdade', 'sou de verdade',
        'nao sou ia', 'nao sou uma ia', 'nao sou robo', 'nao sou um robo', 'nao sou bot', 'nao sou um bot', 'nao sou inteligencia artificial', 'isso nao e ia'])),
    ],
  },
];

const PALAVROES = ['porra', 'caralho', 'krl', 'crl', 'merda', 'puta', 'putaria', 'puto', 'foda', 'foder', 'fodase', 'foda~se', 'fudeu', 'fodeu', 'cacete',
  'buceta', 'pqp', 'vsf', 'fdp', 'tnc', 'bosta', 'arrombado', 'arrombada', 'cu', 'viado', 'desgracado', 'otario', 'babaca', 'cuzao'];
const ENCURTADORES = /(?<![a-z0-9.-])(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|cutt\.ly|is\.gd|ow\.ly|rebrand\.ly|shorturl\.at|encurtador\.com\.br|tiny\.cc|buff\.ly|rb\.gy|s\.id|t\.ly|v\.gd|bl\.ink|short\.io|lnkd\.in|abre\.ai|encurta\.net)\/[\w\-./?=&%#]*/gi;
const SIGLAS = new Set(['PIX', 'SX', 'ID', 'URL', 'FAQ', 'CEO', 'TV', 'UTM', 'PDF', 'CPF', 'CNPJ', 'MTT', 'SNG', 'NLH', 'PLO', 'ITM', 'BB', 'BTN', 'SB', 'API', 'CRM', 'SAAS',
  'SEO', 'LIVE', 'IA', 'AI', 'APP', 'WPT', 'WSOP', 'BSOP', 'KO', 'PKO', 'VIP', 'OK', 'BR', 'SP', 'RJ', 'MG', 'EUA', 'USA', 'YT', 'IG', 'DM', 'POV', 'FYP']);

// limites de cada rede (legenda/descrição e hashtags)
export const REDES = {
  youtube: { nome: 'YouTube Shorts', legenda: 5000, titulo: 100, hashtags: 15 },
  instagram: { nome: 'Instagram', legenda: 2200, hashtags: 30 },
  tiktok: { nome: 'TikTok', legenda: 2200, hashtags: 10 },
};

const MAIS_18 = /(?:\+\s?18(?![0-9])|(?<![0-9])18\s?\+|(?<![0-9])18\s?anos\s?ou\s?mais|maiores\s+de\s+18|proibid[oa]\s+(?:para|a)\s+menores\s+de\s+18)/;
const JOGO_RESP = /jogue\s+com\s+responsabilidade/;
const ROTULO = /(?:#ia(?![a-z0-9])|#conteudoia|#feitocomia|#geradoporia|#personaia|(?:gerad|feit|criad|produzid)[oa]s?\s+(?:com|por)\s+(?:ia|inteligencia\s+artificial)|persona(?:gem)?\s+(?:de|criad[oa]\s+por)\s+ia|(?:sou|e)\s+(?:uma\s+|um\s+)?(?:persona|personagem)\s+(?:de\s+)?ia)/;

function procurar(t, re, cb) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(t.norm))) {
    if (!m[0]) { re.lastIndex++; continue; }
    // começa no primeiro caractere não separador (os padrões podem engolir espaço no início)
    let ini = m.index;
    let fim = m.index + m[0].length;
    while (ini < fim && /[\s\-_.·*]/.test(t.norm[ini])) ini++;
    while (fim > ini && /[\s\-_.·*]/.test(t.norm[fim - 1])) fim--;
    cb(ini, fim);
  }
}

/** Confere um texto. Ver a API no topo do arquivo. */
export function checarTexto(texto, { nicho, edicao, rede, parte = 'legenda', formato } = {}) {
  const t = normalizar(texto);
  const poker = exigeJogoResponsavel({ nicho, edicao });
  const bloqueios = [];
  const avisos = [];
  const faltando = [];
  const vistos = new Set();
  const add = (lista, regra, ini, fim, motivo) => {
    const chave = `${regra}:${ini}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    lista.push({ regra, trecho: trechoDe(t, ini, fim), motivo, pos: t.map[ini] ?? -1 });
  };

  for (const r of BLOQUEIOS) {
    if (r.soIa && formato !== 'ia') continue;
    for (const p of r.padroes) {
      const re = p.re || p;
      const destino = p.soPoker && !poker ? avisos : bloqueios;
      const motivo = p.soPoker && !poker ? 'Bônus e cashback precisam estar no regulamento da oferta. Confira antes de publicar.' : r.motivo;
      procurar(t, re, (ini, fim) => {
        if (negado(t, ini)) return;
        if (r.ressalva && r.ressalva.test(t.norm.slice(Math.max(0, ini - 45), ini))) return;
        if (r.ressalvaDepois && r.ressalvaDepois.test(t.norm.slice(fim, fim + 40))) return;
        add(destino, r.regra, ini, fim, motivo);
      });
    }
  }

  // "garantido" solto (vaga garantida, entrega garantida): só avisa
  procurar(t, rx(`${B}(?:${L('garantid')}(?:o|a|os|as)|${L('garantimos')})${E}`), (ini, fim) => {
    if (bloqueios.some((b) => b.regra === 'resultado_garantido' && Math.abs(b.pos - t.map[ini]) < 40)) return;
    if (bloqueios.some((b) => b.regra === 'promessa_ganho' && Math.abs(b.pos - t.map[ini]) < 25)) return;
    add(avisos, 'garantido', ini, fim, '"Garantido" passa a ideia de promessa. Prefira uma palavra mais neutra.');
  });

  // ---------- avisos ----------
  procurar(t, rx(W(PALAVROES)), (ini, fim) => add(avisos, 'palavrao', ini, fim, 'Palavrão. A rede pode limitar o alcance e a marca perde confiança.'));
  ENCURTADORES.lastIndex = 0;
  for (const m of t.orig.matchAll(ENCURTADORES)) avisos.push({ regra: 'link_encurtado', trecho: m[0], motivo: 'Link encurtado esconde o destino e as redes desconfiam. Use o link rastreado do portal.', pos: m.index });

  const palavras = t.orig.match(/[A-Za-zÀ-ÖØ-öø-ÿ]{3,}/g) || [];
  const gritadas = palavras.filter((w) => w === w.toUpperCase() && w !== w.toLowerCase() && !SIGLAS.has(w.normalize('NFD').replace(/[̀-ͯ]/g, '')));
  let seq = 0;
  let maxSeq = 0;
  for (const w of palavras) {
    const g = w === w.toUpperCase() && w !== w.toLowerCase() && !SIGLAS.has(w.normalize('NFD').replace(/[̀-ͯ]/g, ''));
    seq = g ? seq + 1 : 0;
    maxSeq = Math.max(maxSeq, seq);
  }
  if ((gritadas.length >= 3 && gritadas.length / palavras.length > 0.4) || maxSeq >= 4) {
    avisos.push({ regra: 'caixa_alta', trecho: gritadas.slice(0, 5).join(' '), motivo: 'Texto gritado em CAIXA ALTA. Use só em uma ou duas palavras de destaque.', pos: -1 });
  }

  const r = REDES[rede];
  if (r && parte === 'legenda') {
    if (t.orig.length > r.legenda) avisos.push({ regra: 'tamanho_rede', trecho: `${t.orig.length} caracteres`, motivo: `${r.nome} aceita até ${r.legenda} caracteres.`, pos: -1 });
    const tags = (t.orig.match(/#[\p{L}\p{N}_]+/gu) || []).length;
    if (tags > r.hashtags) avisos.push({ regra: 'hashtags_demais', trecho: `${tags} hashtags`, motivo: `No ${r.nome}, use no máximo ${r.hashtags} hashtags (o ideal são 3 a 5).`, pos: -1 });
  }
  if (r && parte === 'capa' && r.titulo && t.orig.length > r.titulo) {
    avisos.push({ regra: 'tamanho_rede', trecho: `${t.orig.length} caracteres`, motivo: `O título no ${r.nome} corta depois de ${r.titulo} caracteres.`, pos: -1 });
  }

  // ---------- obrigatórios (só no texto que vai para o público) ----------
  if (parte === 'legenda' || parte === 'mensagem') {
    if (poker) {
      if (!MAIS_18.test(t.norm)) faltando.push({ regra: 'mais_18', trecho: '+18', motivo: 'Poker exige "+18" na legenda.' });
      if (!JOGO_RESP.test(t.norm)) faltando.push({ regra: 'jogo_responsavel', trecho: 'Jogue com responsabilidade', motivo: 'Poker exige "Jogue com responsabilidade" na legenda.' });
    }
    if (formato === 'ia' && !ROTULO.test(t.norm)) faltando.push({ regra: 'rotulo_ia', trecho: ROTULO_IA, motivo: 'Persona de IA leva o rótulo na legenda (além da marcação de IA da própria rede).' });
  }

  return { ok: bloqueios.length === 0 && faltando.length === 0, bloqueios, avisos, faltando };
}

/** Confere uma peça inteira (roteiro, legenda, hashtags, capa e briefing). Cada item ganha `parte`. */
export function checarPeca(peca = {}, opts = {}) {
  const out = { ok: true, bloqueios: [], avisos: [], faltando: [] };
  const legenda = [peca.legenda, peca.hashtags].filter(Boolean).join('\n\n');
  const partes = [['legenda', legenda], ['roteiro', peca.roteiro], ['capa', peca.capa], ['briefing', peca.briefing]];
  for (const [parte, texto] of partes) {
    if (parte !== 'legenda' && !texto) continue;
    const r = checarTexto(texto || '', { ...opts, parte });
    for (const k of ['bloqueios', 'avisos', 'faltando']) out[k].push(...r[k].map((x) => ({ ...x, parte })));
  }
  out.ok = out.bloqueios.length === 0 && out.faltando.length === 0;
  return out;
}

/** Acrescenta no fim o que falta (+18, jogo responsável, rótulo de IA). Não mexe no que já está lá. */
export function completarRodape(texto, opts = {}) {
  const base = String(texto ?? '').trimEnd();
  const r = checarTexto(base, { ...opts, parte: 'legenda' });
  const falta = new Set(r.faltando.map((f) => f.regra));
  const extra = [];
  if (falta.has('mais_18') && falta.has('jogo_responsavel')) extra.push(RODAPE_JOGO);
  else if (falta.has('mais_18')) extra.push('+18.');
  else if (falta.has('jogo_responsavel')) extra.push('Jogue com responsabilidade.');
  if (falta.has('rotulo_ia')) extra.push(ROTULO_IA);
  return extra.length ? `${base}${base ? '\n\n' : ''}${extra.join(' ')}` : base;
}
