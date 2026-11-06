// Kit de 7 dias da trilha "Migrar para o pôquer", versão mínima (PA-140).
// Função isolada e pura: recebe o canal e os dados do agente, devolve 7 pautas (gancho, tema, chamada com o link rastreado),
// cada uma já passada pelo preflight. O Estúdio de UGC (PA-141) vai transformar estas pautas em peças:
// o coordenador liga `montarKit` ao estúdio no merge (ex.: estudio.gerar(pauta)). Nada aqui publica ou envia.
import { checarTexto } from '../preflight.mjs';
import { FAQ_SLUG } from './faq.mjs';

export const CANAIS = {
  telegram: { nome: 'Telegram', formato: 'Post no canal (texto curto + imagem)', rede: 'telegram' },
  whatsapp: { nome: 'WhatsApp', formato: 'Mensagem no grupo + status', rede: 'whatsapp' },
  instagram: { nome: 'Instagram', formato: 'Carrossel de 5 telas ou reels de 30 s', rede: 'instagram' },
  tiktok: { nome: 'TikTok', formato: 'Vídeo de 30 a 45 s falando para a câmera', rede: 'tiktok' },
  youtube: { nome: 'YouTube', formato: 'Short de 45 s (ou live de 20 min no dia 7)', rede: 'youtube' },
  outro: { nome: 'Outro canal', formato: 'Post curto com link', rede: 'site' },
};

const RODAPE = '+18. Jogue com responsabilidade.';

// {app} = aplicativo do clube; {clube} = nome da operação. A chamada recebe o link rastreado (com destino próprio de cada dia).
const PAUTAS = [
  { destino: FAQ_SLUG, gancho: 'A MP das bets saiu. O que muda para quem me acompanha.',
    tema: 'Explicar em linguagem simples o que a MP 1.394/2026 proibiu (apostas de quota fixa) e que o saldo das casas de apostas deve ser devolvido. Dizer com franqueza que o assunto do canal passa a ser o pôquer, jogo de habilidade, e por quê.',
    chamada: 'Perguntas e respostas com as fontes oficiais' },
  { destino: FAQ_SLUG, gancho: 'O pôquer também foi proibido?',
    tema: 'Mostrar o que o texto da MP diz e o que não diz: o pôquer não aparece no texto. Deixar claro que é leitura do texto, não decisão de autoridade, e que o STF e o Congresso ainda discutem o tema.',
    chamada: 'Leia a página com as fontes e a data de revisão' },
  { destino: '', gancho: 'Pôquer não é aposta contra a casa.',
    tema: 'Explicar a diferença: na mesa você joga contra outras pessoas e as decisões de cada mão pesam ao longo do tempo (jogo de habilidade). Lembrar que a sorte das cartas existe e que ninguém deve jogar contando com dinheiro.',
    chamada: 'Conheça o {clube}' },
  { destino: '', gancho: 'Como funciona um clube no {app}.',
    tema: 'Passo a passo honesto: baixar o app, entrar no clube pelo ID, falar com o agente para tirar dúvidas. Sem prometer nada além de um clube organizado e atendimento.',
    chamada: 'Veja como entrar no {clube}' },
  { destino: '', gancho: 'Sem bônus e sem ficha grátis. De propósito.',
    tema: 'Contar por que o seu canal não vai mais empurrar promoção: quem vem das bets já ouviu promessa demais, e o pôquer é jogo de habilidade, não promoção. Falar de limite de tempo e de valor, e de parar quando não estiver divertido.',
    chamada: 'Jogo responsável no {clube}' },
  { destino: '', gancho: 'Antes da primeira mão: o básico.',
    tema: 'Aula curta: ranking das mãos, o que é posição na mesa e por que desistir de uma mão também é decisão. Conteúdo educativo, sem resultado de ninguém como exemplo.',
    chamada: 'Mais conteúdo no site do {clube}' },
  { destino: FAQ_SLUG, gancho: 'Pergunte o que quiser sobre a mudança.',
    tema: 'Responder às dúvidas reais que chegaram durante a semana. Quando não souber, dizer que não sabe e apontar a fonte oficial. Nada de garantir o que a lei ainda vai decidir.',
    chamada: 'As respostas que já temos, com fonte' },
];

const preencher = (s, v) => String(s).replace(/\{(app|clube)\}/g, (_, k) => v[k] || (k === 'app' ? 'app do clube' : 'clube'));

/**
 * Monta as 7 pautas de um canal. linkPara(destino) devolve o link rastreado do agente para aquela página do site.
 * Devolve [{ dia, canal, formato, gancho, tema, chamada, link, preflight }].
 */
export function montarKit({ canal = 'outro', app = '', clube = '', linkPara = () => '' } = {}) {
  const c = CANAIS[canal] ? canal : 'outro';
  const v = { app, clube };
  return PAUTAS.map((p, i) => {
    const link = linkPara(p.destino);
    const pauta = { dia: i + 1, canal: c, formato: c === 'youtube' && i === 6 ? 'Live de 20 min respondendo perguntas' : CANAIS[c].formato,
      gancho: preencher(p.gancho, v), tema: preencher(p.tema, v), chamada: `${preencher(p.chamada, v)}: ${link}. ${RODAPE}`, link };
    pauta.preflight = checarTexto(`${pauta.gancho}\n${pauta.tema}\n${pauta.chamada}`, { nicho: 'poker', edicao: 'sx', rede: CANAIS[c].rede });
    return pauta;
  });
}
