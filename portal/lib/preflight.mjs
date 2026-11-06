// provisório da PA-140: o da PA-141 substitui
// Checagem mínima de texto antes de ir ao público (página, post, pauta). Mesma assinatura do preflight da PA-141:
//   checarTexto(texto, { nicho, edicao, rede }) -> { ok, bloqueios, avisos, faltando }
//   - bloqueios: o texto não pode sair assim (promessa de ganho, renda, lucro; bônus, ficha grátis, rakeback ao público; "garantido").
//   - faltando:  o que a edição exige e não está no texto (SX: +18 e "Jogue com responsabilidade").
//   - avisos:    não impede, mas alguém deve olhar.
// ok = sem bloqueio e sem nada faltando. Regras simples de propósito: a versão completa (por rede, por nicho) é a da PA-141.

const sem = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// [rótulo, expressão sobre o texto sem acento e em minúsculas]
const BLOQUEIOS = [
  ['Promessa de ganho', /\b(ganhe|ganhar|ganha|ganhos?|ganhou|fature|faturar)\b/],
  ['Promessa de renda', /\brenda\b/],
  ['Promessa de lucro', /\blucr(o|os|ar|ativo|ativa)\b/],
  ['Dinheiro fácil ou rápido', /\bdinheiro (facil|rapido)\b|\bfique rico\b|\bmude de vida\b/],
  ['Bônus ao público', /\bbonus\b/],
  ['Ficha grátis ao público', /\bfichas? (gratis|gratuitas?|de graca|de presente)\b|\bfreeroll gratis\b/],
  ['Rakeback ao público', /\brake ?back\b/],
  ['"Garantido"', /\bgarantid[oa]s?\b/],
];

// Frases que negam a promessa ("sem bônus", "nada de ficha grátis", "não prometemos ganho") não contam como promessa.
const NEGA = /\b(sem|nada de|nenhum|nenhuma|nao (ha|tem|existe|prometemos|promete|oferecemos|oferece|da|damos|e)|nunca|nem)\b[^.!?\n]{0,30}$/;

function achados(textoSemAcento) {
  const out = [];
  for (const [rotulo, rx] of BLOQUEIOS) {
    const g = new RegExp(rx.source, 'g');
    let m;
    while ((m = g.exec(textoSemAcento))) {
      const antes = textoSemAcento.slice(Math.max(0, m.index - 40), m.index);
      if (NEGA.test(antes)) continue;
      out.push({ regra: rotulo, trecho: textoSemAcento.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20).trim() });
      break;
    }
  }
  return out;
}

export function checarTexto(texto, { nicho = 'poker', edicao = 'sx', rede = 'site' } = {}) {
  const t = sem(texto);
  const bloqueios = achados(t);
  const faltando = [];
  const avisos = [];
  if (edicao === 'sx') {
    if (!/\+ ?18\b|maiores de 18|18 anos/.test(t)) faltando.push('+18');
    if (!/jogue com responsabilidade/.test(t)) faltando.push('Jogue com responsabilidade');
  }
  if (nicho === 'poker' && /\b(aposta|apostas|bet|bets|cassino|slot|slots)\b/.test(t) && !/\bhabilidade\b/.test(t)) {
    avisos.push('Fala de aposta ou cassino sem explicar que o pôquer é jogo de habilidade.');
  }
  if (['instagram', 'tiktok', 'youtube'].includes(rede) && /\bpix\b/.test(t)) avisos.push('Menção a PIX em rede social costuma derrubar o alcance.');
  return { ok: !bloqueios.length && !faltando.length, bloqueios, avisos, faltando };
}
