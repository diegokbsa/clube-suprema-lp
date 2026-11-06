// Página pronta "O pôquer também foi proibido?" para o site do agente (PA-140). Nasce em RASCUNHO e marcada para revisão do Kbsa.
// Fontes conferidas em 06/11/2026 (WebFetch):
//   - Texto da MP 1.394/2026 no Planalto: art. 1º (proíbe exploração, oferta, intermediação e publicidade de loterias de aposta de quota fixa;
//     § 1º esportes reais e eventos virtuais de jogos on-line; § 2º ressalva as demais modalidades lotéricas autorizadas por lei),
//     art. 3º, I (definição de aposta de quota fixa), arts. 7º a 9º (devolução), art. 30 (vigência na publicação). Pôquer não aparece no texto.
//   - Agência Brasil, 25/09/2026: "Bets passam a ser proibidas no país e apostador receberá saldo" (calendário de devolução; usa "apostas e jogos on-line").
//   - STF, 03/11/2026: segunda audiência pública sobre as bets, relator ministro Luiz Fux; ADIs 8024, 8027, 8028 e 8035 contra a MP; sem decisão relatada.
// Não confirmado nessas fontes (não escrever como fato): prazo e andamento da votação no Congresso.
import { cleanBlocks } from '../blocks.mjs';

export const FAQ_SLUG = 'o-poker-tambem-foi-proibido';
export const FAQ_TITULO = 'O pôquer também foi proibido?';
export const REVISADO_EM = '06/11/2026';
export const ANCORA_REVISAO = 'revisao-pendente'; // o bloco de aviso interno; sai do rascunho quando o Kbsa marca como revisado

export const FONTES = [
  { nome: 'Medida Provisória 1.394/2026 (texto no Planalto)', data: '25/09/2026', url: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/mpv/mpv1394.htm',
    nota: 'Texto da MP. O próprio site avisa que não substitui a versão publicada no Diário Oficial da União.' },
  { nome: 'Agência Brasil: "Bets passam a ser proibidas no país e apostador receberá saldo"', data: '25/09/2026',
    url: 'https://agenciabrasil.ebc.com.br/economia/noticia/2026-09/mp-proibe-bets-no-brasil-e-determina-devolucao-de-saldo-ao-apostador',
    nota: 'Notícia oficial com o calendário de devolução de saldo.' },
  { nome: 'STF: "Proibição das bets: governo defende medida, e setor esportivo alerta para prejuízos"', data: '03/11/2026',
    url: 'https://noticias.stf.jus.br/postsnoticias/proibicao-das-bets-governo-defende-medida-e-setor-esportivo-alerta-para-prejuizos/',
    nota: 'Resumo da audiência pública conduzida pelo ministro Luiz Fux.' },
];

export const PERGUNTAS = [
  { q: 'O que a MP 1.394/2026 proibiu?',
    a: 'A Medida Provisória 1.394, de 25 de setembro de 2026, proíbe no Brasil a exploração, a oferta, a intermediação e a publicidade de loterias de aposta de quota fixa, em meio físico ou virtual, inclusive por empresa sediada no exterior (art. 1º).\n\nA proibição vale para apostas em eventos esportivos reais e em eventos virtuais de jogos on-line (art. 1º, § 1º). A MP entrou em vigor na data da publicação (art. 30).' },
  { q: 'O que é aposta de quota fixa?',
    a: 'Pela definição do próprio texto (art. 3º, I), é colocar um valor em risco esperando um prêmio calculado por um fator de multiplicação, a "cotação". É o modelo das casas de apostas esportivas, as bets.' },
  { q: 'O texto da MP fala de pôquer?',
    a: 'Não. Na nossa leitura do texto publicado no site do Planalto, as palavras pôquer, jogo de habilidade, jogo de cartas e clube não aparecem. O texto também diz que a proibição não se aplica às demais modalidades lotéricas autorizadas por lei (art. 1º, § 2º).\n\nA notícia da Agência Brasil sobre a MP também não cita o pôquer.' },
  { q: 'Então o pôquer está liberado?',
    a: 'Isto é uma leitura do texto, não uma decisão de autoridade. Nenhum órgão decidiu, até a data desta revisão, que a MP vale ou não vale para o pôquer.\n\nA notícia da Agência Brasil descreve a medida de forma mais ampla, como proibição de "apostas e jogos on-line". O Supremo Tribunal Federal fez audiência pública sobre o tema em 3 de novembro de 2026, com ações contra a MP em andamento, e o resumo oficial da audiência não relata decisão. Uma medida provisória ainda precisa ser votada pelo Congresso para virar lei, e o texto pode mudar nessa votação. Se mudar, esta página muda.' },
  { q: 'Por que o pôquer é diferente de uma aposta esportiva?',
    a: 'Na aposta esportiva você aposta contra a casa, numa cotação definida por ela. No pôquer em clube você joga contra outras pessoas na mesa, e as suas decisões em cada mão (pagar, aumentar ou desistir) pesam no resultado ao longo do tempo. É por isso que se fala em jogo de habilidade.\n\nA sorte das cartas continua existindo em cada mão. Ninguém deve jogar contando com dinheiro.' },
  { q: 'E o meu saldo nas casas de apostas?',
    a: 'A MP manda devolver os valores aos apostadores (arts. 7º a 9º). Pelo calendário publicado pela Agência Brasil, o saque voluntário ia até 5 de outubro, os sites saíam do ar a partir de 6 de outubro e os bancos devolveriam os valores entre 9 e 14 de outubro, na conta do CPF do apostador. Havendo impedimento, a Caixa Econômica Federal pode intermediar.\n\nSe o seu saldo não voltou, procure a empresa e o seu banco.' },
  { q: 'O clube tem promoção de boas-vindas para quem vem das bets?',
    a: 'Não. Aqui não tem bônus, não tem ficha grátis e não tem promessa de resultado. Pôquer é só para maiores de 18 anos, com um valor que você pode perder sem fazer falta.' },
  { q: 'Onde eu confiro tudo isso?',
    a: 'Nas fontes logo abaixo, com data. Leia o texto da MP direto no site do Planalto: é curto e é a fonte que vale.' },
];

export const AVISO_FINAL = `Revisado em ${REVISADO_EM}. Isto não é orientação jurídica: é a nossa leitura do texto publicado, sem decisão de autoridade sobre o pôquer. A MP pode mudar e esta página muda junto.\n\nSomente maiores de 18 anos. Jogue com responsabilidade.`;

/** Todo o texto público da página (para o preflight e para o teste). */
export const textoPublicoFaq = () => [FAQ_TITULO, ...PERGUNTAS.flatMap((p) => [p.q, p.a]), ...FONTES.flatMap((f) => [f.nome, f.nota]), AVISO_FINAL].join('\n\n');

/**
 * Blocos da página. `moldura` = { topo, rodape }: blocos copiados de uma página do próprio site (menu e rodapé do mundo),
 * para a página nova ficar com a cara do site. Tudo com blocos comuns, que todos os mundos vestem.
 */
export function faqBlocks({ topo = null, rodape = null } = {}) {
  const blocos = [
    topo,
    { type: 'notice', props: { anchor: ANCORA_REVISAO, variant: 'alerta',
      text: 'Rascunho interno: aguardando revisão do Kbsa antes de publicar. Este aviso sai sozinho quando a revisão for marcada no painel (Trilha de migração).' } },
    { type: 'hero', props: { variant: 'centralizado', title: FAQ_TITULO,
      subtitle: `O que o texto da MP 1.394/2026 diz, o que ainda está em discussão e onde conferir. Revisado em ${REVISADO_EM}.`,
      note: 'Isto não é orientação jurídica.' } },
    { type: 'faq', props: { anchor: 'perguntas', title: 'As perguntas que estão chegando', items: PERGUNTAS.map(({ q, a }) => ({ q, a })) } },
    { type: 'cards', props: { anchor: 'fontes', title: 'Fontes', subtitle: `Consultadas em ${REVISADO_EM}.`, variant: 'grade',
      items: FONTES.map((f) => ({ title: f.nome, text: f.nota, href: f.url, tag: f.data })) } },
    { type: 'notice', props: { variant: 'discreto', text: AVISO_FINAL } },
    rodape,
  ].filter(Boolean);
  return cleanBlocks(blocos);
}
