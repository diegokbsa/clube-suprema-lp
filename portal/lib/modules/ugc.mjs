// Estúdio de UGC (PA-141): 3 influenciadores por operação, 1 por rede (YouTube Shorts, Instagram e TikTok), nas duas edições.
//
// O que o estúdio faz: monta o elenco (ficha de cada influenciador), propõe a pauta da semana, produz a peça (roteiro, legenda,
// hashtags, texto de capa e briefing) por três caminhos (IA conectada por MCP, chave de API própria, modelo de texto sem IA),
// passa tudo pelo preflight (lib/preflight.mjs) e mede cada influenciador pelo link rastreado dele.
//
// Regras que não se quebram (docs/ideias/UGC-INFLUENCIADORES.md):
//  - o portal NUNCA posta: o dono aprova, copia ou baixa a peça, posta à mão e marca como publicada;
//  - persona de IA sempre com rotulo_ia = 1 e a regra "nunca se apresenta como pessoa real";
//  - poker sem promessa, sem bônus e sem ficha grátis, com +18 e "Jogue com responsabilidade" (preflight bloqueia a aprovação);
//  - rosto de pessoa real só com a caixa "tenho autorização por escrito" marcada (grava quem e quando);
//  - nenhuma senha de rede social: as contas conectam por OAuth no módulo do canal;
//  - o custo estimado aparece antes de gerar, com teto mensal de gerações por operação (padrão 300).
import { randomBytes } from 'node:crypto';
import { now, parse, tx } from '../db.mjs';
import { HttpError } from '../http.mjs';
import { niche as nicheOf, unitLabel } from '../niches.mjs';
import { checarPeca, checarTexto, completarRodape, exigeJogoResponsavel, RODAPE_JOGO } from '../preflight.mjs';
import { calendarConfig, conexoesDosCanais, diaLocal, somarDias, instanteLocal } from './calendar.mjs';

export const tables = ['ugc_personas', 'ugc_pautas', 'ugc_pecas', 'ugc_metricas', 'ugc_geracoes', 'ugc_config'];
export const nav = { id: 'ugc', label: 'Estúdio de UGC', perm: 'ugc.read' };

const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };
const txt = (v, n) => String(v ?? '').trim().slice(0, n);
const lista = (v, max, n) => (Array.isArray(v) ? v : String(v ?? '').split(/\n|;|,(?=\s)/)).map((x) => txt(x, n)).filter(Boolean).slice(0, max);

// ---------------------------------------------------------------- redes e formatos

export const REDES = {
  youtube: { nome: 'YouTube Shorts', curto: 'YouTube', peca: 'Short de 30 a 60 s', ritmo: '1 por dia', cor: '#d6453d', dominios: ['youtube.com', 'youtu.be'], calendario: 'youtube' },
  instagram: { nome: 'Instagram', curto: 'Instagram', peca: 'Reel + 3 Stories', ritmo: '1 Reel e 3 Stories por dia', cor: '#c2407a', dominios: ['instagram.com'], calendario: 'instagram' },
  tiktok: { nome: 'TikTok', curto: 'TikTok', peca: 'Vídeo de 15 a 45 s', ritmo: '1 a 2 por dia', cor: '#1f9e95', dominios: ['tiktok.com'], calendario: null },
};
const ORDEM_REDES = ['youtube', 'instagram', 'tiktok'];

export const FORMATOS = {
  ia: { nome: 'Persona de IA', resumo: 'Personagem criado. Volume diário sem custo de pessoa.', cuidado: 'Leva o rótulo de IA da rede e nunca finge ser pessoa real.' },
  criador: { nome: 'Criador real', resumo: 'Pessoa contratada. O painel faz o roteiro e o briefing; ela grava.', cuidado: 'Contrato, direito de imagem e autorização por escrito.' },
  marca: { nome: 'Rosto da marca', resumo: 'Você ou o agente do clube. O painel faz o roteiro.', cuidado: 'Autorização por escrito de quem aparece e constância.' },
};
const STATUS_PERSONA = ['rascunho', 'ativo', 'pausado'];
export const ESTADOS_PECA = { rascunho: 'Rascunho', aprovado: 'Aprovado', publicado: 'Publicado', medido: 'Medido' };

export const REGRA_IA = 'Nunca se apresenta como pessoa real. Todo conteúdo leva o rótulo de IA da rede.';
const REGRA_FAMOSO = 'Não imita pessoa famosa nem usa rosto ou voz de alguém de verdade.';
const NUNCA_JOGO = ['Prometer ganho, renda ou lucro', 'Oferecer bônus, ficha grátis, rakeback ou cashback', 'Falar com menor de idade', 'Dizer que algum resultado é garantido'];
const NUNCA_GERAL = ['Prometer resultado garantido', 'Falar com menor de idade', 'Inventar número, depoimento ou cliente'];

// ---------------------------------------------------------------- fichas prontas por nicho

const F = (rede, formato, nome, papel, jeito, bordoes, glossario, assuntos, nunca, paleta, enquadramento, idade = '') =>
  ({ rede, formato, nome, papel, idade_aparente: idade, voz: { jeito, bordoes, glossario }, assuntos, nunca, visual: { paleta, enquadramento } });

export const SUGESTOES = {
  poker: [
    F('youtube', 'marca', 'Agente do clube', 'O que explica', 'Calmo e didático. Frases curtas, um conceito por vídeo, sempre com um exemplo de mesa.',
      ['Bora entender?', 'Guarda essa:'], ['blind', 'buy-in', 'botão', 'fold', 'mesa final'], ['Regras do jogo', 'Mãos comentadas', 'Como entrar no clube pelo app', 'Tipos de torneio'],
      [...NUNCA_JOGO, 'Falar mal de outro clube'], ['#0f5561', '#39bcff', '#f4f6f7'], 'Vertical 9:16, do peito para cima, mesa ou fichas ao fundo, legenda grande no terço de baixo.'),
    F('instagram', 'ia', 'Duda Mesa', 'O do dia a dia', 'Animada sem exagero. Fala com a comunidade, puxa enquete e conta o que rola no clube hoje.',
      ['Hoje tem!', 'Conta pra mim nos stories'], ['grade', 'late reg', 'mesa final', 'field'], ['Torneio do dia', 'Bastidores do clube', 'Enquetes de mão', 'Termos do poker'],
      [...NUNCA_JOGO, 'Se apresentar como pessoa real'], ['#171717', '#39bcff', '#e8c26a'], 'Cartões com texto grande, fotos de mesa e fichas sem rosto de pessoa real, paleta da operação.', '25 a 30 anos'),
    F('tiktok', 'ia', 'Rafa River', 'O da conversa', 'Bem-humorado. Reage a situações de mesa e usa linguagem de internet, sem palavrão.',
      ['Fold ou call?', 'Toda mesa tem um'], ['tilt', 'bad beat', 'river', 'all-in', 'blefe'], ['Tendências do nicho', 'Reações a mãos', 'Mitos do poker', 'Tipos de jogador'],
      [...NUNCA_JOGO, 'Se apresentar como pessoa real'], ['#0f0f0f', '#1f9e95', '#f4f6f7'], 'Vertical 9:16, avatar de IA em primeiro plano, texto na tela a cada frase.', '20 a 28 anos'),
  ],
  saas: [
    F('youtube', 'marca', 'Fundador do produto', 'O que explica', 'Direto e prático. Mostra a tela, resolve um problema por vídeo.',
      ['Em 40 segundos:', 'Testa aí e me conta'], ['fluxo', 'integração', 'painel', 'automação'], ['Tutoriais rápidos', 'Erros comuns', 'Antes e depois de usar o produto'],
      [...NUNCA_GERAL, 'Falar mal de concorrente'], ['#1f6f4a', '#ffffff', '#b8892b'], 'Tela do produto em 9:16 com o rosto num canto, legenda grande.'),
    F('instagram', 'ia', 'Bia Rotina', 'O do dia a dia', 'Leve e organizada. Mostra a rotina de quem usa o produto e dá uma dica por dia.',
      ['Dica do dia:', 'Salva pra depois'], ['rotina', 'checklist', 'atalho'], ['Rotina de trabalho', 'Dicas de produtividade', 'Bastidores do time', 'Novidades do produto'],
      [...NUNCA_GERAL, 'Se apresentar como pessoa real'], ['#f4f3ee', '#1f6f4a', '#111714'], 'Carrossel e Reels com texto grande, telas do produto, sem rosto de pessoa real.', '28 a 35 anos'),
    F('tiktok', 'ia', 'Téo Planilha', 'O da conversa', 'Bem-humorado. Faz POV de escritório e reage a situações de trabalho.',
      ['POV:', 'Quem nunca?'], ['planilha', 'reunião', 'prazo'], ['POV de trabalho', 'Mitos de produtividade', 'Tendências do nicho'],
      [...NUNCA_GERAL, 'Se apresentar como pessoa real'], ['#111714', '#5fbf8c', '#ffffff'], 'Vertical 9:16, avatar de IA, cortes rápidos e texto na tela.', '25 a 32 anos'),
  ],
  loja: [
    F('youtube', 'marca', 'Dono da loja', 'O que explica', 'Honesto e detalhista. Mostra o produto de perto e diz para quem ele serve.',
      ['Olha esse detalhe:', 'Vale a pena para quem…'], ['acabamento', 'tamanho', 'material'], ['Como escolher', 'Unboxing honesto', 'Cuidados com o produto'],
      [...NUNCA_GERAL, 'Prometer prazo de entrega que a loja não cumpre'], ['#1f6f4a', '#f3ead3', '#111714'], 'Mãos e produto em 9:16, luz natural, fundo limpo.'),
    F('instagram', 'ia', 'Lu Vitrine', 'O do dia a dia', 'Calorosa. Mostra a novidade do dia, o bastidor do envio e puxa enquete.',
      ['Chegou!', 'Qual você levaria?'], ['novidade', 'reposição', 'coleção'], ['Novidades da semana', 'Bastidores do envio', 'Enquetes de produto'],
      [...NUNCA_GERAL, 'Se apresentar como pessoa real'], ['#ffffff', '#b8892b', '#1d2420'], 'Fotos do produto e Stories com enquete, sem rosto de pessoa real.', '25 a 30 anos'),
    F('tiktok', 'ia', 'Nico Achado', 'O da conversa', 'Curioso. Reage a pedidos curiosos e testa o produto em situações do dia a dia.',
      ['Testei pra você', 'Achado do dia'], ['achadinho', 'teste', 'review'], ['Testes rápidos', 'Reações', 'Tendências'],
      [...NUNCA_GERAL, 'Se apresentar como pessoa real'], ['#1d2420', '#e3bd63', '#ffffff'], 'Vertical 9:16, avatar de IA com o produto, texto na tela.', '20 a 28 anos'),
  ],
  criador: [
    F('youtube', 'criador', 'O próprio criador', 'O que explica', 'Do jeito do canal. Recorta o melhor da live e explica em um minuto.',
      ['Resumo da live:', 'Fica até o fim'], ['live', 'clipe', 'setup'], ['Melhores momentos', 'Setup e bastidores', 'Respostas a perguntas da comunidade'],
      [...NUNCA_GERAL], ['#111714', '#5fbf8c', '#ffffff'], 'Corte vertical da live com a câmera em cima e o jogo embaixo.'),
    F('instagram', 'ia', 'Mel Bastidor', 'O do dia a dia', 'Próxima da comunidade. Avisa a agenda de lives e mostra bastidores.',
      ['Hoje tem live!', 'Manda sua pergunta'], ['agenda', 'collab', 'comunidade'], ['Agenda de lives', 'Bastidores', 'Perguntas da comunidade'],
      [...NUNCA_GERAL, 'Se apresentar como pessoa real'], ['#161d1a', '#e3bd63', '#ffffff'], 'Stories com contagem regressiva e cartões de agenda.', '22 a 28 anos'),
    F('tiktok', 'ia', 'Zeca Clipe', 'O da conversa', 'Rápido e engraçado. Reage aos clipes e às tendências do nicho.',
      ['Não acredito nisso', 'Parte 2?'], ['clipe', 'meme', 'trend'], ['Reações', 'Tendências', 'Desafios da comunidade'],
      [...NUNCA_GERAL, 'Se apresentar como pessoa real'], ['#0f1412', '#79cfa1', '#ffffff'], 'Vertical 9:16, avatar de IA reagindo ao clipe no fundo.', '20 a 26 anos'),
  ],
  cursos: [
    F('youtube', 'marca', 'Professor do curso', 'O que explica', 'Didático e paciente. Uma ideia por vídeo, com exemplo do dia a dia.',
      ['Anota aí:', 'Em 1 minuto:'], ['módulo', 'aula', 'exercício'], ['Aulas curtas', 'Dúvidas frequentes', 'Erros de quem começa'],
      [...NUNCA_GERAL, 'Prometer aprovação, emprego ou renda'], ['#1f6f4a', '#ffffff', '#b8892b'], 'Lousa ou tela em 9:16, rosto num canto, legenda grande.'),
    F('instagram', 'ia', 'Clara Estudos', 'O do dia a dia', 'Motivadora sem promessa. Rotina de estudo e dica do dia.',
      ['Dica de hoje:', 'Bora estudar?'], ['rotina', 'revisão', 'meta'], ['Rotina de estudo', 'Dicas práticas', 'Bastidores das aulas'],
      [...NUNCA_GERAL, 'Se apresentar como pessoa real'], ['#f4f3ee', '#2f4c9b', '#111714'], 'Carrossel e Reels com texto grande, sem rosto de pessoa real.', '25 a 32 anos'),
    F('tiktok', 'ia', 'Davi Resumo', 'O da conversa', 'Leve e rápido. Mitos e verdades sobre o assunto do curso.',
      ['Mito ou verdade?', 'Comenta aí'], ['resumo', 'macete'], ['Mitos e verdades', 'Tendências do nicho', 'Perguntas da comunidade'],
      [...NUNCA_GERAL, 'Se apresentar como pessoa real'], ['#111714', '#9db4ff', '#ffffff'], 'Vertical 9:16, avatar de IA e texto na tela.', '20 a 28 anos'),
  ],
};
const sugestoesDe = (nicho) => SUGESTOES[nicho] || SUGESTOES.saas;

// ---------------------------------------------------------------- modelos de pauta por nicho e rede (honestos)

const P = (tema, gancho) => ({ tema, gancho });
const PAUTAS = {
  poker: {
    youtube: [P('Como funciona o blind', 'Você sabe por que o blind sobe a cada nível?'), P('Buy-in, rebuy e add-on: a diferença', 'Três palavras que todo torneio usa. Em 40 segundos:'),
      P('Por que o botão é a melhor posição', 'O lugar mais forte da mesa não é o que você pensa.'), P('Como entrar no clube pelo app, passo a passo', 'Do download à primeira mesa, sem pular etapa.'),
      P('Mão comentada: quando desistir é a melhor jogada', 'Às vezes o fold é a jogada mais inteligente da noite.'), P('MTT, SNG e cash: qual combina com você', 'Três formatos, três ritmos de jogo.'),
      P('Pote dividido: o que acontece no empate', 'Empatou? Veja como o pote é dividido.'), P('Como ler a grade de torneios do clube', 'Horário, buy-in e formato: o que cada coluna quer dizer.')],
    instagram: [P('Bastidor: como o agente prepara a mesa', 'Antes da primeira carta, muita coisa acontece.'), P('Enquete: qual mão você jogaria?', 'Par de 7 no botão. E aí, joga ou passa?'),
      P('Carrossel: 5 termos do poker em 1 minuto', 'Salva para não esquecer na próxima mesa.'), P('Quem atende no clube: conheça o agente', 'Dúvida no app? É com ele que você fala.'),
      P('Stories: contagem para o torneio da noite', 'Faltam poucas horas. Já viu o horário?'), P('Resumo da semana do clube', 'O que rolou nas mesas esta semana.'),
      P('Etiqueta de mesa: o que não fazer', 'Três atitudes que irritam qualquer mesa.')],
    tiktok: [P('Tipos de jogador que toda mesa tem', 'Toda mesa tem um. Qual é você?'), P('POV: primeira vez num torneio', 'POV: você entrou no torneio e não sabe o que é late reg.'),
      P('Mito ou verdade do poker', 'Poker é só sorte? Mito ou verdade?'), P('Fold ou call? Responde nos comentários', 'Essa mão dividiu a mesa. Fold ou call?'),
      P('Gírias do poker explicadas', 'Bad beat, tilt, river: traduzindo o pokerês.'), P('O que ninguém conta sobre o tilt', 'O pior adversário da mesa pode ser você.'),
      P('Reação: a mão mais difícil da semana', 'Eu não teria coragem de jogar isso.')],
  },
  generico: {
    youtube: [P('Tutorial rápido: o recurso mais usado', 'Em 40 segundos você aprende isso.'), P('O erro mais comum de quem começa', 'Quase todo mundo erra nisso no começo.'),
      P('Perguntas frequentes respondidas', 'A pergunta que mais chega para a gente.'), P('Como escolher a opção certa para você', 'Três perguntas antes de decidir.'),
      P('Antes e depois: o que muda na prática', 'Um caso de verdade, sem número inventado.'), P('Por dentro: como funciona por trás', 'O bastidor que pouca gente vê.'),
      P('Glossário em 1 minuto', 'Cinco palavras que você vai ouvir muito.')],
    instagram: [P('Bastidor da semana', 'Um pedaço do que acontece por aqui.'), P('Enquete: o que você quer ver amanhã?', 'Você escolhe o próximo post.'),
      P('Carrossel: 5 dicas rápidas', 'Salva para consultar depois.'), P('Novidade da semana', 'Chegou coisa nova.'),
      P('Quem faz acontecer: conheça o time', 'Gente de verdade por trás do perfil.'), P('Stories: pergunta da comunidade', 'Manda sua dúvida que a gente responde.'),
      P('Resumo da semana', 'O que rolou por aqui em 30 segundos.')],
    tiktok: [P('POV do dia a dia', 'POV: segunda-feira e tudo para fazer.'), P('Mito ou verdade', 'Todo mundo fala isso. Mito ou verdade?'),
      P('Tipos de cliente que todo mundo conhece', 'Todo mundo conhece um. Qual é você?'), P('Reação à pergunta mais curiosa da semana', 'Recebemos essa pergunta e…'),
      P('Tendência do nicho explicada', 'Todo mundo comentando. O que é isso?'), P('Desafio rápido da comunidade', 'Topa o desafio?'),
      P('Erro engraçado que todo mundo comete', 'Quem nunca fez isso?')],
  },
};
const pautasModelo = (nicho, rede) => (PAUTAS[nicho] || PAUTAS.generico)[rede];

const HASHTAGS = { poker: '#poker #pokerbrasil #jogoresponsavel', saas: '#produtividade #tecnologia #dicas', loja: '#novidade #achadinhos #compras',
  criador: '#bastidores #live #comunidade', cursos: '#estudos #aprendizado #dicas' };

// ---------------------------------------------------------------- semana no relógio da operação

const fusoDe = (tenant) => calendarConfig(tenant).timezone;
const diaDaSemana = (dia) => { const [y, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
export const segundaDe = (dia) => somarDias(dia, -((diaDaSemana(dia) + 6) % 7));
const DIA = /^\d{4}-\d{2}-\d{2}$/;
function semanaPedida(tenant, valor) {
  const hoje = diaLocal(fusoDe(tenant));
  return segundaDe(DIA.test(String(valor || '')) ? String(valor) : hoje);
}
const NOMES_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

// ---------------------------------------------------------------- persona: saída, link e placar

const origemDe = (app, tenant) => (app.originOf ? app.originOf(tenant.edition) : app.origin);

/** Link rastreado do influenciador (e da peça, com utm_content próprio). utm_source = a rede. */
export function linkDaPersona(app, tenant, persona, affiliate, peca = null) {
  if (!affiliate) return null;
  const u = new URL(`/r/${encodeURIComponent(tenant.slug)}/${encodeURIComponent(affiliate.code)}`, origemDe(app, tenant));
  u.searchParams.set('utm_source', persona.rede);
  u.searchParams.set('utm_medium', 'ugc');
  u.searchParams.set('utm_campaign', `ugc-${persona.rede}`);
  u.searchParams.set('utm_content', peca ? tagDaPeca(affiliate, peca) : affiliate.code);
  return u.toString();
}
const tagDaPeca = (affiliate, peca) => `${affiliate.code}-${String(peca.id).slice(0, 8)}`;

function personaOut(app, tenant, repo, p) {
  const aff = p.affiliate_id ? repo.get('affiliates', p.affiliate_id) : null;
  return {
    id: p.id, rede: p.rede, redeNome: REDES[p.rede]?.nome || p.rede, formato: p.formato, formatoNome: FORMATOS[p.formato]?.nome || p.formato,
    nome: p.nome, papel: p.papel, idade_aparente: p.idade_aparente || '', voz: parse(p.voz, {}), assuntos: parse(p.assuntos, []), nunca: parse(p.nunca, []),
    visual: parse(p.visual, {}), regras: parse(p.regras, []), rotulo_ia: Boolean(p.rotulo_ia), status: p.status, pessoa: p.pessoa || '',
    autorizacao: p.autorizacao ? { por: p.autorizacao_nome || p.autorizacao_por, em: p.autorizacao_em } : null,
    codigo: aff?.code || null, linkAtivo: aff?.status === 'ativo', link: linkDaPersona(app, tenant, p, aff),
    precisaAutorizacao: p.formato !== 'ia' && !p.autorizacao, criadoEm: p.created_at,
  };
}

/** Placar de um influenciador numa janela: views informadas + cliques, leads e conversões verificadas do link dele. */
export function placarDe(repo, persona, dias) {
  const desde = new Date(Date.now() - dias * 864e5).toISOString();
  const aff = persona.affiliate_id;
  const pecas = repo.all('ugc_pecas', { persona_id: persona.id }, { limit: 5000, extra: "status IN ('publicado','medido') AND publicado_em >= ?", extraParams: [desde] });
  return {
    dias,
    publicadas: pecas.length,
    views: pecas.reduce((s, x) => s + (Number(x.views) || 0), 0),
    medidas: pecas.filter((x) => x.views != null).length,
    cliques: aff ? repo.count('clicks', { affiliate_id: aff }, 'created_at >= ?', [desde]) : 0,
    leads: aff ? repo.count('leads', { affiliate_id: aff }, 'created_at >= ?', [desde]) : 0,
    conversoes: aff ? repo.count('conversions', { affiliate_id: aff, verified: 1 }, 'occurred_at >= ?', [desde]) : 0,
  };
}

/** Números do link da própria peça (utm_content com o código da peça). */
function numerosDaPeca(repo, persona, peca) {
  if (!persona?.affiliate_id) return { cliques: 0, leads: 0, conversoes: 0 };
  const aff = repo.get('affiliates', persona.affiliate_id);
  if (!aff) return { cliques: 0, leads: 0, conversoes: 0 };
  const tag = tagDaPeca(aff, peca);
  const doClique = "json_extract(utm, '$.utm_content') = ?";
  return {
    cliques: repo.count('clicks', { affiliate_id: aff.id }, doClique, [tag]),
    leads: repo.count('leads', { affiliate_id: aff.id }, doClique, [tag]),
    conversoes: repo.count('conversions', { affiliate_id: aff.id, verified: 1 },
      "click_id IN (SELECT id FROM clicks WHERE tenant_id = ? AND json_extract(utm, '$.utm_content') = ?)", [repo.tenantId, tag]),
  };
}

// ---------------------------------------------------------------- validação da ficha

const PROIBIDO = /senha|password|passwd|token|secret|cookie/i;
function semSenha(body) {
  const chaves = [...Object.keys(body || {}), ...Object.keys(body?.voz || {}), ...Object.keys(body?.visual || {})];
  need(!chaves.some((k) => PROIBIDO.test(k)), 400,
    'O portal não guarda senha nem token de rede social. A conta do canal se conecta pelo login oficial (OAuth) em Integrações.');
}
const HEX = /^#[0-9a-f]{6}$/i;

function limparFicha(body, atual = null) {
  const pega = (k, fallback) => (body[k] === undefined ? fallback : body[k]);
  const formato = String(pega('formato', atual?.formato || 'ia'));
  need(FORMATOS[formato], 400, 'Formato inválido: use persona de IA, criador real ou rosto da marca.');
  const rede = String(pega('rede', atual?.rede || ''));
  need(REDES[rede], 400, 'Escolha a rede do influenciador: YouTube Shorts, Instagram ou TikTok.');
  const nome = txt(pega('nome', atual?.nome), 60);
  need(nome.length >= 2, 400, 'Dê um nome para o influenciador.');
  const vozA = atual ? parse(atual.voz, {}) : {};
  const vozB = body.voz && typeof body.voz === 'object' ? body.voz : {};
  const visualA = atual ? parse(atual.visual, {}) : {};
  const visualB = body.visual && typeof body.visual === 'object' ? body.visual : {};
  const voz = { jeito: txt(vozB.jeito ?? vozA.jeito, 400), bordoes: lista(vozB.bordoes ?? vozA.bordoes, 8, 60), glossario: lista(vozB.glossario ?? vozA.glossario, 20, 40) };
  const paleta = (Array.isArray(visualB.paleta) ? visualB.paleta : visualA.paleta || []).map((c) => String(c).trim()).filter((c) => HEX.test(c)).slice(0, 5);
  const visual = { paleta, enquadramento: txt(visualB.enquadramento ?? visualA.enquadramento, 300) };
  let nunca = lista(pega('nunca', atual ? parse(atual.nunca, []) : []), 14, 100);
  let regras = lista(pega('regras', atual ? parse(atual.regras, []) : []), 10, 200).filter((r) => r !== REGRA_IA && r !== REGRA_FAMOSO);
  if (formato === 'ia') {
    // persona de IA: rótulo sempre e as regras fixas (não dá para desligar pela API)
    regras = [REGRA_IA, REGRA_FAMOSO, ...regras];
    if (!nunca.some((n) => /pessoa real/i.test(n))) nunca.push('Se apresentar como pessoa real');
  }
  const status = String(pega('status', atual?.status || 'rascunho'));
  need(STATUS_PERSONA.includes(status), 400, 'Situação inválida: rascunho, ativo ou pausado.');
  return {
    formato, rede, nome, papel: txt(pega('papel', atual?.papel), 60), idade_aparente: txt(pega('idade_aparente', atual?.idade_aparente), 30) || null,
    voz: JSON.stringify(voz), assuntos: JSON.stringify(lista(pega('assuntos', atual ? parse(atual.assuntos, []) : []), 12, 80)), nunca: JSON.stringify(nunca),
    visual: JSON.stringify(visual), regras: JSON.stringify(regras), rotulo_ia: formato === 'ia' ? 1 : 0, status,
    pessoa: formato === 'ia' ? null : (txt(pega('pessoa', atual?.pessoa), 80) || null),
  };
}

/** Caixa "tenho autorização por escrito": grava quem e quando. Persona de IA não usa rosto real. */
function aplicarAutorizacao(ficha, body, atual, user) {
  if (ficha.formato === 'ia') return { ...ficha, autorizacao: 0, autorizacao_por: null, autorizacao_nome: null, autorizacao_em: null };
  const marcada = body.autorizacao === undefined ? Boolean(atual?.autorizacao) : Boolean(body.autorizacao);
  if (!marcada) return { ...ficha, autorizacao: 0, autorizacao_por: null, autorizacao_nome: null, autorizacao_em: null };
  if (atual?.autorizacao && atual.formato === ficha.formato) return { ...ficha, autorizacao: 1 }; // já estava marcada: mantém quem e quando
  return { ...ficha, autorizacao: 1, autorizacao_por: user.id, autorizacao_nome: user.name || user.email, autorizacao_em: now() };
}

function validarAtivacao(ficha) {
  if (ficha.status !== 'ativo' || ficha.formato === 'ia') return;
  need(ficha.pessoa, 400, 'Diga quem aparece (nome da pessoa) antes de ativar um criador real ou rosto da marca.');
  need(ficha.autorizacao, 400, 'Rosto de pessoa real só com a caixa "tenho autorização por escrito" marcada.');
}

function novoCodigo(repo) {
  for (let i = 0; i < 20; i++) {
    const code = `ugc-${randomBytes(3).toString('hex')}`;
    if (!repo.get('affiliates', { code })) return code;
  }
  throw new HttpError(500, 'Não deu para gerar o código do link. Tente de novo.');
}
const nomeDoAfiliado = (ficha) => `UGC · ${ficha.nome} (${REDES[ficha.rede].curto})`;

// ---------------------------------------------------------------- pauta da semana

/** Itens de agenda dos sites da operação (bloco "Agenda" das páginas). */
function agendaDaOperacao(repo) {
  const itens = [];
  for (const pg of repo.all('pages', {}, { order: 'position ASC', limit: 200 })) {
    for (const b of parse(pg.published || pg.draft, [])) {
      if (b?.type !== 'schedule') continue;
      for (const i of Array.isArray(b.props?.items) ? b.props.items : []) {
        if (i?.name) itens.push({ ref: `${pg.id}:${txt(i.name, 60)}`, nome: txt(i.name, 80), dia: txt(i.day, 30), hora: txt(i.time, 20), detalhe: txt(i.detail, 80) });
      }
    }
  }
  return itens.slice(0, 30);
}
function postsDoBlog(repo) {
  try { return repo.all('posts', {}, { order: 'created_at DESC', limit: 12, extra: "status IN ('publicado','agendado')" }); } catch { return []; }
}
function insightsDaEdicao(db, tenant) {
  try {
    return db.prepare("SELECT id, titulo, tipo, aplicavel FROM insights WHERE status IN ('aceito','aplicado') AND tipo IN ('conteudo','mercado','seo') ORDER BY created_at DESC LIMIT 20").all()
      .filter((r) => { const ap = parse(r.aplicavel, []); return ap.includes('todos') || ap.includes(tenant.edition) || (tenant.edition === 'sx' && ap.includes('suprema.blog')); });
  } catch { return []; }
}

/** Kit de 7 dias gerado na aprovação da trilha de migração (tabela da PA-140; operação sem kit devolve vazio). */
function kitDeMigracao(repo) {
  try { return repo.all('migracao_kits', {}, { limit: 100 }); } catch { return []; }
}

/** Candidatos de pauta para uma rede: primeiro o que a operação já tem (agenda, blog, insights), depois os modelos do nicho. */
function candidatos(rede, nicho, fontes, usarKit = false) {
  // kit de 7 dias da trilha de migração (PA-140): na primeira semana do agente aprovado, as pautas dele vêm primeiro
  const kit = usarKit ? fontes.kit.filter((k) => k.canal === rede).sort((a, b) => a.dia - b.dia)
    .map((k) => ({ tema: txt(k.tema, 160), gancho: txt(k.gancho, 200), origem: 'migracao', ref: k.id })) : [];
  if (kit.length) return [...kit, ...pautasModelo(nicho === 'poker' ? 'poker' : nicho, rede).map((x) => ({ ...x, origem: 'modelo', ref: null }))];
  const out = [];
  if (rede === 'instagram') for (const a of fontes.agenda) out.push({ tema: `${a.nome}${a.dia || a.hora ? ` · ${[a.dia, a.hora].filter(Boolean).join(' ')}` : ''}`, gancho: `Hoje tem ${a.nome}. Já separou o horário?`, origem: 'agenda', ref: a.ref });
  if (rede === 'youtube') for (const p of fontes.posts) out.push({ tema: `Explique em 45 s: ${txt(p.title, 90)}`, gancho: 'O resumo do post do blog, sem enrolação.', origem: 'blog', ref: p.id });
  if (rede === 'tiktok') for (const i of fontes.insights) out.push({ tema: `Tendência: ${txt(i.titulo, 90)}`, gancho: 'Todo mundo falando disso. O que muda para você?', origem: 'insight', ref: i.id });
  // fontes reais entram no máximo 3 vezes na semana; o resto vem dos modelos (variedade)
  const reais = out.slice(0, 3);
  return [...reais, ...pautasModelo(nicho === 'poker' ? 'poker' : nicho, rede).map((x) => ({ ...x, origem: 'modelo', ref: null }))];
}

/** Propõe a pauta da semana. Idempotente: a mesma semana, rede e dia caem na mesma chave. */
export function proporPauta(db, repo, tenant, semana) {
  const personas = repo.all('ugc_personas', {}, { limit: 10 }).filter((p) => p.status !== 'pausado');
  const fontes = { agenda: agendaDaOperacao(repo), posts: postsDoBlog(repo), insights: insightsDaEdicao(db, tenant), kit: kitDeMigracao(repo) };
  const nicho = tenant.niche_id;
  const giro = Math.floor(Date.parse(`${semana}T00:00:00Z`) / (7 * 864e5)); // muda o ponto de partida a cada semana
  const res = { criadas: 0, mantidas: 0, fontes: { agenda: fontes.agenda.length, blog: fontes.posts.length, insights: fontes.insights.length } };
  for (const p of personas) {
    // o kit entra uma vez só: na primeira semana em que a persona ainda não recebeu pauta dele
    const usarKit = fontes.kit.length > 0 && !repo.get('ugc_pautas', { persona_id: p.id, origem: 'migracao' });
    const c = candidatos(p.rede, nicho, fontes, usarKit);
    const reais = c.filter((x) => x.origem !== 'modelo').length;
    for (let i = 0; i < 7; i++) {
      const idem = `pauta|${semana}|${p.rede}|${i}`;
      if (repo.get('ugc_pautas', { idem_key: idem })) { res.mantidas++; continue; }
      const k = i < reais ? i : reais + ((i - reais + giro) % (c.length - reais));
      const item = c[k];
      repo.insert('ugc_pautas', { persona_id: p.id, semana, dia: somarDias(semana, i), ordem: i, tema: txt(item.tema, 160), gancho: txt(item.gancho, 200),
        formato_peca: REDES[p.rede].peca, origem: item.origem, origem_ref: item.ref, status: 'proposta', idem_key: idem });
      res.criadas++;
    }
  }
  return res;
}

const pautaOut = (p, pecas) => ({ id: p.id, persona_id: p.persona_id, semana: p.semana, dia: p.dia, diaNome: NOMES_DIA[diaDaSemana(p.dia)], ordem: p.ordem,
  tema: p.tema, gancho: p.gancho, formato_peca: p.formato_peca, origem: p.origem, status: p.status, peca_id: pecas.find((x) => x.pauta_id === p.id)?.id || null });

// ---------------------------------------------------------------- produção (c): modelo de texto sem IA

const PENDENTE = /\[escreva aqui[^\]]*\]/i;
function modeloDeTexto(app, tenant, repo, persona, pauta) {
  const voz = parse(persona.voz, {});
  const visual = parse(persona.visual, {});
  const aff = persona.affiliate_id ? repo.get('affiliates', persona.affiliate_id) : null;
  const n = nicheOf(tenant.niche_id);
  const unidade = unitLabel(tenant.niche_id, tenant.number);
  const bordao = voz.bordoes?.[0] || '';
  const opts = { nicho: tenant.niche_id, edicao: tenant.edition, rede: persona.rede, formato: persona.formato };
  const tema = pauta?.tema || 'Tema da peça';
  const gancho = pauta?.gancho || '[escreva aqui: a primeira frase, que segura quem está rolando a tela]';
  const roteiro = [
    `[0 a 3 s · gancho] ${gancho}`,
    `[3 a 15 s · contexto] [escreva aqui: o que a pessoa precisa saber para entender "${tema}"]`,
    `[15 a 40 s · ponto principal] [escreva aqui: a explicação, a cena ou a reação, do jeito de ${persona.nome}${voz.jeito ? `: ${voz.jeito}` : ''}]`,
    `[fechamento] ${bordao ? `${bordao} ` : ''}Link na bio para conhecer ${tenant.name}.`,
  ].join('\n');
  const legenda = completarRodape(`${gancho}\n\n[escreva aqui: duas ou três frases sobre "${tema}"]\n\nLink na bio.`, opts);
  const briefing = [
    `Peça: ${tema}`,
    `Rede: ${REDES[persona.rede].nome} · ${pauta?.formato_peca || REDES[persona.rede].peca}`,
    persona.formato === 'ia' ? 'Quem aparece: persona de IA. Marque o rótulo de conteúdo feito com IA na própria rede.' : `Quem grava: ${persona.pessoa || persona.nome}`,
    visual.enquadramento ? `Enquadramento: ${visual.enquadramento}` : '',
    visual.paleta?.length ? `Paleta: ${visual.paleta.join(', ')}` : '',
    voz.jeito ? `Jeito de falar: ${voz.jeito}` : '',
    voz.bordoes?.length ? `Bordões: ${voz.bordoes.join(' · ')}` : '',
    voz.glossario?.length ? `Palavras do glossário: ${voz.glossario.join(', ')}` : '',
    `Nunca fale: ${parse(persona.nunca, []).join('; ')}`,
    exigeJogoResponsavel(opts) ? `Obrigatório na legenda: ${RODAPE_JOGO}` : '',
    aff ? `Link rastreado: ${linkDaPersona(app, tenant, persona, aff)}` : '',
    `Operação: ${unidade} · ${tenant.name}${n ? ` (${n.name})` : ''}`,
  ].filter(Boolean).join('\n');
  return { titulo: txt(tema, 100), roteiro, legenda, hashtags: HASHTAGS[tenant.niche_id] || '#dicas', capa: txt(tema, 60), briefing };
}

// ---------------------------------------------------------------- produção (b): chave de API própria

const URL_PADRAO = { anthropic: 'https://api.anthropic.com/v1/messages', openai: 'https://api.openai.com/v1/chat/completions' };
export const MODELO_PADRAO = { anthropic: 'claude-opus-5-5', openai: 'gpt-4.1-mini' };
// preço em US$ por milhão de tokens (entrada, saída). Fora da tabela: estimativa conservadora.
const PRECOS = {
  'claude-opus-5-5': [4, 20], 'claude-opus-5': [5, 25], 'claude-opus-4-8': [5, 25], 'claude-opus-4-7': [5, 25], 'claude-opus-4-6': [5, 25],
  'claude-sonnet-5-5': [2, 10], 'claude-sonnet-5': [2, 10], 'claude-sonnet-4-6': [3, 15], 'claude-haiku-5-5': [0.1, 0.5], 'claude-haiku-4-5': [1, 5],
  'claude-fable-5-1': [10, 50], 'claude-fable-5': [10, 50],
  'gpt-4.1-mini': [0.4, 1.6], 'gpt-4.1': [2, 8], 'gpt-4o-mini': [0.15, 0.6], 'gpt-4o': [2.5, 10],
};
const CONSERVADOR = [10, 50];
const TOKENS_SAIDA_ESTIMADOS = 2500; // roteiro + legenda + briefing, com o raciocínio do modelo em esforço baixo
const MAX_TOKENS = 6000;
const mesAtual = () => new Date().toISOString().slice(0, 7);

function configDe(repo) {
  return repo.get('ugc_config', {}) || { teto_mensal: 300 };
}

/** Estado da chave do usuário: sem_chave | nao_validada | pronta | teto. */
function estadoDaApi(repo, user) {
  const chaves = repo.all('ai_keys', { user_id: user.id }).filter((k) => URL_PADRAO[k.provider]);
  const valida = chaves.find((k) => k.provider === 'anthropic' && k.status === 'valida') || chaves.find((k) => k.status === 'valida');
  const usadas = repo.count('ugc_geracoes', { mes: mesAtual(), status: 'ok' });
  const teto = Number(configDe(repo).teto_mensal);
  if (!valida) {
    return { estado: chaves.length ? 'nao_validada' : 'sem_chave', usadas, teto, provedor: chaves[0]?.provider || null,
      mensagem: chaves.length ? 'Sua chave de API não foi validada. Teste de novo em Conectar sua IA.' : 'Conecte sua IA em Conectar sua IA' };
  }
  const modelo = valida.model || MODELO_PADRAO[valida.provider];
  return { estado: usadas >= teto ? 'teto' : 'pronta', usadas, teto, provedor: valida.provider, modelo, chave: valida,
    mensagem: usadas >= teto ? `Teto mensal de ${teto} gerações atingido nesta operação.` : null };
}

/** Estimativa de custo antes de gerar: tokens de entrada pelo tamanho do pedido, saída por um teto realista. */
export function estimativaDeCusto(modelo, textoPedido) {
  const preco = PRECOS[modelo];
  const [pin, pout] = preco || CONSERVADOR;
  const entrada = Math.ceil(String(textoPedido).length / 3.2);
  const saida = TOKENS_SAIDA_ESTIMADOS;
  const usd = (entrada * pin + saida * pout) / 1e6;
  return { modelo, tokensEntrada: entrada, tokensSaida: saida, usd: Math.round(usd * 10000) / 10000, conservadora: !preco,
    texto: `≈ US$ ${usd.toFixed(usd < 0.1 ? 3 : 2).replace('.', ',')} por peça${preco ? '' : ' (estimativa conservadora: modelo fora da tabela de preços)'}` };
}
const custoReal = (modelo, tin, tout) => { const [pin, pout] = PRECOS[modelo] || CONSERVADOR; return Math.round(tin * pin + tout * pout); }; // em micros de US$

function pedidoParaIa(app, tenant, repo, persona, pauta) {
  const aff = persona.affiliate_id ? repo.get('affiliates', persona.affiliate_id) : null;
  const poker = exigeJogoResponsavel({ nicho: tenant.niche_id, edicao: tenant.edition });
  const sistema = [
    'Você escreve conteúdo curto para redes sociais em português do Brasil, na voz de um influenciador definido pela ficha.',
    'Responda SOMENTE com um objeto JSON com as chaves: titulo, roteiro, legenda, hashtags, capa, briefing (todas texto).',
    'roteiro: falas e cenas com marcação de tempo; legenda: texto do post; hashtags: 3 a 5 separadas por espaço; capa: até 60 caracteres; briefing: instruções para quem grava.',
    'Regras que nunca se quebram: sem promessa de ganho, renda ou lucro; nada é "garantido"; sem bônus, brinde em dinheiro, cashback ou rakeback; nada que fale com menor de idade; sem número, depoimento ou cliente inventado.',
    poker ? `Conteúdo de poker: nunca ofereça ficha grátis; a legenda termina com "${RODAPE_JOGO}".` : '',
    persona.formato === 'ia' ? 'Esta é uma persona de IA: nunca diga que é pessoa real, e a legenda termina com "Conteúdo feito com IA."' : '',
  ].filter(Boolean).join('\n');
  const dados = {
    operacao: { nome: tenant.name, unidade: unitLabel(tenant.niche_id, tenant.number), nicho: nicheOf(tenant.niche_id)?.name || tenant.niche_id },
    influenciador: { nome: persona.nome, papel: persona.papel, formato: FORMATOS[persona.formato].nome, rede: REDES[persona.rede].nome, voz: parse(persona.voz, {}),
      assuntos: parse(persona.assuntos, []), nunca_fala: parse(persona.nunca, []), visual: parse(persona.visual, {}), regras: parse(persona.regras, []) },
    pauta: { tema: pauta.tema, gancho: pauta.gancho, formato: pauta.formato_peca, dia: pauta.dia },
    link_rastreado: linkDaPersona(app, tenant, persona, aff),
  };
  return { sistema, usuario: `Escreva a peça desta pauta.\n${JSON.stringify(dados, null, 2)}` };
}

const comEsforco = (m) => /^claude-(opus-5|opus-4-[678]|sonnet-5|fable|haiku-5)/.test(m);
const comFallback = (m) => ['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5'].includes(m);

async function chamarProvedor(app, { provedor, modelo, chave, sistema, usuario }) {
  const url = app.ugcEndpoints?.[provedor] || URL_PADRAO[provedor];
  const fazer = app.fetchImpl || fetch;
  let init;
  if (provedor === 'anthropic') {
    const headers = { 'content-type': 'application/json', 'x-api-key': chave, 'anthropic-version': '2023-06-01' };
    const corpo = { model: modelo, max_tokens: MAX_TOKENS, system: sistema, messages: [{ role: 'user', content: usuario }] };
    if (comEsforco(modelo)) corpo.output_config = { effort: 'low' };       // texto curto: esforço baixo segura o custo
    if (comFallback(modelo)) { headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; corpo.fallbacks = 'default'; }
    init = { method: 'POST', headers, body: JSON.stringify(corpo) };
  } else {
    init = { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${chave}` },
      body: JSON.stringify({ model: modelo, max_completion_tokens: MAX_TOKENS, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: sistema }, { role: 'user', content: usuario }] }) };
  }
  let r;
  try { r = await fazer(url, { ...init, signal: AbortSignal.timeout(90_000) }); } catch { return { erro: 'Sem resposta do provedor de IA. Tente de novo em alguns minutos.' }; }
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) return { erro: 'O provedor recusou a chave. Confira em Conectar sua IA.' };
  if (r.status === 429) return { erro: 'O provedor está limitando as chamadas da sua chave. Espere um pouco e tente de novo.' };
  if (r.status !== 200) return { erro: `O provedor respondeu HTTP ${r.status}.` };
  if (provedor === 'anthropic') {
    if (data.stop_reason === 'refusal') return { erro: 'A IA recusou escrever esta pauta. Ajuste o tema e tente de novo.', tin: data.usage?.input_tokens, tout: data.usage?.output_tokens };
    const texto = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return { texto, tin: Number(data.usage?.input_tokens) || 0, tout: Number(data.usage?.output_tokens) || 0, modelo: data.model || modelo };
  }
  return { texto: data.choices?.[0]?.message?.content || '', tin: Number(data.usage?.prompt_tokens) || 0, tout: Number(data.usage?.completion_tokens) || 0, modelo: data.model || modelo };
}

function lerJson(texto) {
  const s = String(texto || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const ini = s.indexOf('{');
  const fim = s.lastIndexOf('}');
  if (ini < 0 || fim <= ini) return null;
  try { return JSON.parse(s.slice(ini, fim + 1)); } catch { return null; }
}

// ---------------------------------------------------------------- peça: limpeza, preflight e aprovação

const CAMPOS_PECA = { titulo: 140, roteiro: 6000, legenda: 4000, hashtags: 600, capa: 140, briefing: 4000 };
function limparPeca(obj = {}) {
  const out = {};
  for (const [k, n] of Object.entries(CAMPOS_PECA)) if (obj[k] !== undefined) out[k] = String(Array.isArray(obj[k]) ? obj[k].join(' ') : obj[k] ?? '').slice(0, n);
  return out;
}
const opcoesPreflight = (tenant, persona) => ({ nicho: tenant.niche_id, edicao: tenant.edition, rede: persona?.rede, formato: persona?.formato });
// a lista de proibições do briefing ("Nunca fale: bônus, ganho...") é regra para quem grava, não texto publicado
const semListaDeRegras = (t) => String(t || '').split('\n').filter((l) => !/^\s*(nunca fale|n[ãa]o fale|regras|obrigat[óo]rio na legenda)\s*:/i.test(l)).join('\n');
const preflightDe = (tenant, persona, peca) => checarPeca({ ...peca, briefing: semListaDeRegras(peca.briefing) }, opcoesPreflight(tenant, persona));

/** Tudo o que impede aprovar a peça, com o motivo em português. */
export function checarAprovacao(repo, tenant, peca) {
  const persona = repo.get('ugc_personas', peca.persona_id);
  const motivos = [];
  if (!persona) motivos.push('O influenciador desta peça não existe mais.');
  if (persona?.status === 'pausado') motivos.push(`${persona.nome} está pausado. Reative a ficha para aprovar.`);
  if (persona && persona.formato !== 'ia' && !persona.autorizacao) motivos.push(`Rosto de pessoa real sem a caixa "tenho autorização por escrito" marcada na ficha de ${persona.nome}.`);
  if (!String(peca.legenda || '').trim()) motivos.push('A legenda está vazia.');
  if (['roteiro', 'legenda', 'briefing', 'capa'].some((k) => PENDENTE.test(peca[k] || ''))) motivos.push('Ainda tem trecho do modelo para preencher ([escreva aqui...]).');
  const pf = preflightDe(tenant, persona, peca);
  for (const b of pf.bloqueios) motivos.push(`${b.motivo} Trecho: "${b.trecho}" (${b.parte}).`);
  for (const f of pf.faltando) motivos.push(f.motivo);
  return { ok: motivos.length === 0, motivos, preflight: pf, persona };
}

function pecaOut(app, tenant, repo, x, personas) {
  const persona = personas.get(x.persona_id) || repo.get('ugc_personas', x.persona_id);
  const aff = persona?.affiliate_id ? repo.get('affiliates', persona.affiliate_id) : null;
  const pf = parse(x.preflight, {});
  return {
    id: x.id, persona_id: x.persona_id, pauta_id: x.pauta_id, rede: x.rede, titulo: x.titulo, roteiro: x.roteiro, legenda: x.legenda, hashtags: x.hashtags,
    capa: x.capa, briefing: x.briefing, caminho: x.caminho, modelo_ia: x.modelo_ia, status: x.status, statusNome: ESTADOS_PECA[x.status] || x.status,
    preflight: { ok: Boolean(pf.ok), bloqueios: pf.bloqueios || [], avisos: pf.avisos || [], faltando: pf.faltando || [] },
    pendente: ['roteiro', 'legenda', 'briefing', 'capa'].some((k) => PENDENTE.test(x[k] || '')),
    aprovadoEm: x.aprovado_em, publicadoEm: x.publicado_em, postUrl: x.post_url, views: x.views, medidoEm: x.medido_em, calendarId: x.calendar_id,
    link: persona && aff ? linkDaPersona(app, tenant, persona, aff, x) : null,
    numeros: ['publicado', 'medido'].includes(x.status) ? numerosDaPeca(repo, persona, x) : null,
    criadoEm: x.created_at,
  };
}

function salvarPreflight(repo, tenant, peca) {
  const persona = repo.get('ugc_personas', peca.persona_id);
  const pf = preflightDe(tenant, persona, peca);
  return repo.update('ugc_pecas', peca.id, { preflight: JSON.stringify(pf) });
}

function aprovarUma(repo, tenant, peca, user) {
  const r = checarAprovacao(repo, tenant, peca);
  repo.update('ugc_pecas', peca.id, { preflight: JSON.stringify(r.preflight) });
  if (!r.ok) return r;
  repo.update('ugc_pecas', peca.id, { status: 'aprovado', aprovado_por: user.id, aprovado_em: now() });
  return r;
}

/** Peça aprovada vira RASCUNHO no Calendário, só se o canal tiver conta conectada lá. Não publica nada. */
function mandarParaCalendario(repo, tenant, peca) {
  const canal = REDES[peca.rede]?.calendario;
  need(canal, 400, `O Calendário ainda não tem ${REDES[peca.rede]?.nome || peca.rede}. Publique à mão e marque como publicada.`);
  need(conexoesDosCanais(repo)[canal], 400, `Sem conta de ${REDES[peca.rede].nome} conectada no Calendário. Publique à mão e marque como publicada.`);
  const idem = `ugc|${peca.id}`;
  const existe = repo.get('calendar', { idem_key: idem });
  if (existe) return existe;
  const pauta = peca.pauta_id ? repo.get('ugc_pautas', peca.pauta_id) : null;
  const tz = fusoDe(tenant);
  const dia = pauta?.dia && pauta.dia >= diaLocal(tz) ? pauta.dia : somarDias(diaLocal(tz), 1);
  const item = repo.insert('calendar', { channel: canal, scheduled_at: instanteLocal(tz, dia, '12:00').toISOString(),
    caption: [peca.legenda, peca.hashtags].filter(Boolean).join('\n\n').slice(0, 5000), status: 'rascunho', idem_key: idem });
  repo.update('ugc_pecas', peca.id, { calendar_id: item.id });
  return item;
}

// ---------------------------------------------------------------- estado da IA conectada por MCP

function estadoMcp(db, app, user, tenant) {
  const linhas = db.prepare('SELECT family, kind, expires_at FROM oauth_tokens WHERE user_id = ? AND tenant_id = ? AND revoked = 0').all(user.id, tenant.id);
  const familias = new Set(linhas.filter((r) => r.kind === 'refresh' || !r.expires_at || r.expires_at > Date.now()).map((r) => r.family));
  const ferramentas = (app.mcpTools || []).map((t) => t.name).filter((n) => n.startsWith('ugc_'));
  return { conectado: familias.size > 0, conexoes: familias.size, ferramentas };
}

// ---------------------------------------------------------------- rotas do painel

const base = '/api/t/:tenant/ugc';
const pecaDoTenant = (repo, id) => { const x = repo.get('ugc_pecas', String(id)); need(x, 404, 'Peça não encontrada.'); return x; };
const pautaDoTenant = (repo, id) => { const x = repo.get('ugc_pautas', String(id)); need(x, 404, 'Pauta não encontrada.'); return x; };
const personaDoTenant = (repo, id) => { const x = repo.get('ugc_personas', String(id)); need(x, 404, 'Influenciador não encontrado.'); return x; };
const ordenarElenco = (lista) => [...lista].sort((a, b) => ORDEM_REDES.indexOf(a.rede) - ORDEM_REDES.indexOf(b.rede));

function criarPecaDaPauta(app, tenant, repo, user, pauta, campos, caminho, modeloIa = null) {
  const persona = personaDoTenant(repo, pauta.persona_id);
  const existente = repo.all('ugc_pecas', { pauta_id: pauta.id }, { limit: 1 })[0];
  if (existente && existente.status !== 'rascunho') throw new HttpError(409, 'Esta pauta já tem peça aprovada ou publicada.');
  const dados = { ...limparPeca(campos), caminho, modelo_ia: modeloIa };
  const peca = existente
    ? repo.update('ugc_pecas', existente.id, dados)
    : repo.insert('ugc_pecas', { persona_id: persona.id, pauta_id: pauta.id, rede: persona.rede, status: 'rascunho', created_by: user.id, ...dados });
  return salvarPreflight(repo, tenant, peca);
}

export const routes = [
  {
    method: 'GET', path: base, perm: 'ugc.read',
    handler: ({ app, db, repo, tenant, user, query }) => {
      const semana = semanaPedida(tenant, query.semana);
      const personasRows = ordenarElenco(repo.all('ugc_personas', {}, { limit: 10 }));
      const personas = new Map(personasRows.map((p) => [p.id, p]));
      const pautas = repo.all('ugc_pautas', { semana }, { order: 'dia ASC, ordem ASC', limit: 200 });
      const pecasRows = repo.all('ugc_pecas', {}, { order: 'created_at DESC', limit: 200 });
      const api = estadoDaApi(repo, user);
      const persona0 = personasRows[0];
      const pauta0 = pautas[0];
      const pedido0 = persona0 && pauta0 ? pedidoParaIa(app, tenant, repo, personas.get(pauta0.persona_id) || persona0, pauta0) : { sistema: '', usuario: 'x'.repeat(3000) };
      const conexoes = conexoesDosCanais(repo);
      const n = nicheOf(tenant.niche_id);
      return {
        operacao: { edicao: tenant.edition, nicho: tenant.niche_id, nichoNome: n?.name || tenant.niche_id, unidade: unitLabel(tenant.niche_id, tenant.number),
          exigeJogo: exigeJogoResponsavel({ nicho: tenant.niche_id, edicao: tenant.edition }), rodape: RODAPE_JOGO },
        redes: ORDEM_REDES.map((id) => ({ id, ...REDES[id], calendarioConectado: REDES[id].calendario ? Boolean(conexoes[REDES[id].calendario]) : false })),
        formatos: FORMATOS,
        config: { teto_mensal: Number(configDe(repo).teto_mensal) },
        elenco: personasRows.map((p) => personaOut(app, tenant, repo, p)),
        sugestoes: { nicho: SUGESTOES[tenant.niche_id] ? tenant.niche_id : 'saas', fichas: sugestoesDe(tenant.niche_id),
          outros: tenant.edition === 'sx' ? [] : Object.keys(SUGESTOES) },
        semana: { inicio: semana, fim: somarDias(semana, 6), anterior: somarDias(semana, -7), proxima: somarDias(semana, 7), hoje: diaLocal(fusoDe(tenant)) },
        pautas: pautas.map((p) => pautaOut(p, pecasRows)),
        pecas: pecasRows.map((x) => pecaOut(app, tenant, repo, x, personas)),
        placar: personasRows.map((p) => ({ persona_id: p.id, d7: placarDe(repo, p, 7), d30: placarDe(repo, p, 30) })),
        ia: {
          mcp: estadoMcp(db, app, user, tenant),
          api: { estado: api.estado, provedor: api.provedor, modelo: api.modelo || null, usadas: api.usadas, teto: api.teto, mensagem: api.mensagem,
            estimativa: api.modelo ? estimativaDeCusto(api.modelo, pedido0.sistema + pedido0.usuario) : null },
          modelo: { estado: 'pronto' },
        },
      };
    },
  },
  {
    method: 'GET', path: `${base}/sugestoes`, perm: 'ugc.read',
    handler: ({ tenant, query }) => {
      const nicho = tenant.edition === 'sx' ? 'poker' : String(query.nicho || tenant.niche_id);
      return { nicho: SUGESTOES[nicho] ? nicho : 'saas', fichas: sugestoesDe(nicho) };
    },
  },
  {
    method: 'PUT', path: `${base}/config`, perm: 'ugc.approve',
    handler: ({ repo, body, audit }) => {
      const teto = Number(body.teto_mensal);
      need(Number.isInteger(teto) && teto >= 0 && teto <= 5000, 400, 'Teto mensal: um número inteiro de 0 a 5000 gerações.');
      const atual = repo.get('ugc_config', {});
      if (atual) repo.update('ugc_config', atual.id, { teto_mensal: teto }); else repo.insert('ugc_config', { teto_mensal: teto });
      audit('ugc.config', null, { teto });
      return { config: { teto_mensal: teto } };
    },
  },

  // ---------- elenco ----------
  {
    method: 'POST', path: `${base}/personas`, perm: 'ugc.edit',
    handler: ({ app, db, repo, tenant, user, body, audit }) => {
      semSenha(body);
      const ficha = aplicarAutorizacao(limparFicha(body), body, null, user);
      validarAtivacao(ficha);
      need(!repo.get('ugc_personas', { rede: ficha.rede }), 409, `${REDES[ficha.rede].nome} já tem influenciador. Cada um fica com uma rede: edite a ficha dele ou escolha outra rede.`);
      const p = tx(db, () => {
        const aff = repo.insert('affiliates', { name: nomeDoAfiliado(ficha), email: null, code: novoCodigo(repo), status: 'ativo' });
        return repo.insert('ugc_personas', { ...ficha, affiliate_id: aff.id });
      });
      audit('ugc.persona_criar', p.id, { rede: p.rede, formato: p.formato, autorizacao: Boolean(p.autorizacao) });
      return { status: 201, body: { persona: personaOut(app, tenant, repo, p) } };
    },
  },
  {
    method: 'PATCH', path: `${base}/personas/:id`, perm: 'ugc.edit',
    handler: ({ app, repo, tenant, user, params, body, audit }) => {
      semSenha(body);
      const atual = personaDoTenant(repo, params.id);
      const ficha = aplicarAutorizacao(limparFicha(body, atual), body, atual, user);
      validarAtivacao(ficha);
      if (ficha.rede !== atual.rede) need(!repo.get('ugc_personas', { rede: ficha.rede }), 409, `${REDES[ficha.rede].nome} já tem influenciador.`);
      const p = repo.update('ugc_personas', atual.id, ficha);
      if (p.affiliate_id) repo.update('affiliates', p.affiliate_id, { name: nomeDoAfiliado(ficha), status: p.status === 'pausado' ? 'pausado' : 'ativo' });
      audit('ugc.persona_editar', p.id, { formato: p.formato, status: p.status, autorizacao: Boolean(p.autorizacao) });
      return { persona: personaOut(app, tenant, repo, p) };
    },
  },
  {
    method: 'DELETE', path: `${base}/personas/:id`, perm: 'ugc.edit',
    handler: ({ db, repo, params, audit }) => {
      const p = personaDoTenant(repo, params.id);
      need(!repo.count('ugc_pecas', { persona_id: p.id }, "status IN ('publicado','medido')"), 409,
        'Este influenciador já tem peça publicada: pause a ficha em vez de apagar, para o placar não perder o histórico.');
      tx(db, () => {
        for (const x of repo.all('ugc_pecas', { persona_id: p.id }, { limit: 5000 })) repo.remove('ugc_pecas', x.id);
        for (const x of repo.all('ugc_pautas', { persona_id: p.id }, { limit: 5000 })) repo.remove('ugc_pautas', x.id);
        if (p.affiliate_id) repo.update('affiliates', p.affiliate_id, { status: 'pausado' }); // o link para de contar; o histórico de cliques fica
        repo.remove('ugc_personas', p.id);
      });
      audit('ugc.persona_apagar', p.id, { rede: p.rede });
      return { ok: true };
    },
  },

  // ---------- pauta ----------
  {
    method: 'POST', path: `${base}/pauta/propor`, perm: 'ugc.edit',
    handler: ({ db, repo, tenant, body, audit }) => {
      need(repo.count('ugc_personas', {}, "status != 'pausado'"), 400, 'Monte o elenco primeiro: a pauta é proposta por influenciador.');
      const semana = semanaPedida(tenant, body.semana);
      const res = tx(db, () => proporPauta(db, repo, tenant, semana));
      audit('ugc.pauta_propor', semana, res);
      return { semana, ...res, nota: res.criadas ? 'Pauta proposta. Revise, edite, reordene ou apague o que não servir.' : 'A pauta desta semana já estava proposta.' };
    },
  },
  {
    method: 'POST', path: `${base}/pautas`, perm: 'ugc.edit',
    handler: ({ repo, tenant, body, audit }) => {
      const persona = personaDoTenant(repo, body.persona_id);
      const dia = String(body.dia || '');
      need(DIA.test(dia), 400, 'Informe o dia no formato AAAA-MM-DD.');
      const tema = txt(body.tema, 160);
      need(tema.length >= 3, 400, 'Escreva o tema da pauta.');
      const semana = segundaDe(dia);
      const p = repo.insert('ugc_pautas', { persona_id: persona.id, semana, dia, ordem: 99, tema, gancho: txt(body.gancho, 200), formato_peca: REDES[persona.rede].peca,
        origem: 'manual', status: 'proposta', idem_key: `manual|${semana}|${randomBytes(6).toString('hex')}` });
      audit('ugc.pauta_criar', p.id);
      return { status: 201, body: { pauta: pautaOut(p, []) } };
    },
  },
  {
    method: 'PATCH', path: `${base}/pautas/:id`, perm: 'ugc.edit',
    handler: ({ repo, params, body, audit }) => {
      const p = pautaDoTenant(repo, params.id);
      const patch = {};
      if (body.tema !== undefined) { patch.tema = txt(body.tema, 160); need(patch.tema.length >= 3, 400, 'Escreva o tema da pauta.'); }
      if (body.gancho !== undefined) patch.gancho = txt(body.gancho, 200);
      if (body.dia !== undefined) { need(DIA.test(String(body.dia)) && segundaDe(String(body.dia)) === p.semana, 400, 'O dia precisa ser da mesma semana da pauta.'); patch.dia = String(body.dia); }
      if (body.status !== undefined) { need(['proposta', 'aprovada'].includes(body.status), 400, 'Situação da pauta: proposta ou aprovada.'); patch.status = body.status; }
      need(Object.keys(patch).length, 400, 'Nada para alterar.');
      const novo = repo.update('ugc_pautas', p.id, patch);
      audit('ugc.pauta_editar', p.id, { campos: Object.keys(patch) });
      return { pauta: pautaOut(novo, []) };
    },
  },
  {
    method: 'POST', path: `${base}/pautas/ordem`, perm: 'ugc.edit',
    handler: ({ db, repo, body, audit }) => {
      need(Array.isArray(body.ids) && body.ids.length <= 200, 400, 'Envie a lista de pautas na ordem nova.');
      const linhas = body.ids.map((id) => pautaDoTenant(repo, id)); // id de outra operação: 404
      tx(db, () => linhas.forEach((p, i) => repo.update('ugc_pautas', p.id, { ordem: i })));
      audit('ugc.pauta_ordem', null, { n: linhas.length });
      return { ok: true };
    },
  },
  {
    method: 'POST', path: `${base}/pauta/aprovar`, perm: 'ugc.edit',
    handler: ({ db, repo, tenant, body, audit }) => {
      const semana = semanaPedida(tenant, body.semana);
      const lista = repo.all('ugc_pautas', { semana, status: 'proposta' }, { limit: 500 });
      tx(db, () => lista.forEach((p) => repo.update('ugc_pautas', p.id, { status: 'aprovada' })));
      audit('ugc.pauta_aprovar', semana, { n: lista.length });
      return { semana, aprovadas: lista.length };
    },
  },
  {
    method: 'DELETE', path: `${base}/pautas/:id`, perm: 'ugc.edit',
    handler: ({ repo, params, audit }) => {
      const p = pautaDoTenant(repo, params.id);
      const peca = repo.all('ugc_pecas', { pauta_id: p.id }, { limit: 1 })[0];
      need(!peca || peca.status === 'rascunho', 409, 'Esta pauta já tem peça aprovada ou publicada.');
      if (peca) repo.remove('ugc_pecas', peca.id);
      repo.remove('ugc_pautas', p.id);
      audit('ugc.pauta_apagar', p.id);
      return { ok: true };
    },
  },

  // ---------- produção ----------
  {
    method: 'POST', path: `${base}/pautas/:id/modelo`, perm: 'ugc.edit',
    handler: ({ app, repo, tenant, user, params, audit }) => {
      const pauta = pautaDoTenant(repo, params.id);
      const persona = personaDoTenant(repo, pauta.persona_id);
      const peca = criarPecaDaPauta(app, tenant, repo, user, pauta, modeloDeTexto(app, tenant, repo, persona, pauta), 'modelo');
      audit('ugc.peca_modelo', peca.id);
      return { status: 201, body: { peca: pecaOut(app, tenant, repo, peca, new Map()) } };
    },
  },
  {
    method: 'GET', path: `${base}/pautas/:id/estimativa`, perm: 'ugc.edit',
    handler: ({ app, repo, tenant, user, params }) => {
      const pauta = pautaDoTenant(repo, params.id);
      const persona = personaDoTenant(repo, pauta.persona_id);
      const api = estadoDaApi(repo, user);
      if (!api.modelo) return { estado: api.estado, mensagem: api.mensagem, usadas: api.usadas, teto: api.teto };
      const pedido = pedidoParaIa(app, tenant, repo, persona, pauta);
      return { estado: api.estado, mensagem: api.mensagem, provedor: api.provedor, modelo: api.modelo, usadas: api.usadas, teto: api.teto, estimativa: estimativaDeCusto(api.modelo, pedido.sistema + pedido.usuario) };
    },
  },
  {
    method: 'POST', path: `${base}/pautas/:id/gerar`, perm: 'ugc.edit',
    handler: async ({ app, repo, tenant, user, params, body, audit }) => {
      const pauta = pautaDoTenant(repo, params.id);
      const persona = personaDoTenant(repo, pauta.persona_id);
      const api = estadoDaApi(repo, user);
      need(api.estado !== 'sem_chave' && api.estado !== 'nao_validada', 400, api.mensagem);
      need(api.estado !== 'teto', 429, api.mensagem);
      need(body.confirmar === true, 400, 'Confira o modelo e o custo estimado e confirme para gerar.');
      const pedido = pedidoParaIa(app, tenant, repo, persona, pauta);
      const chave = app.vault.open(api.chave.secret);
      const r = await chamarProvedor(app, { provedor: api.provedor, modelo: api.modelo, chave, ...pedido });
      const mes = mesAtual();
      const registrar = (status, extra = {}) => repo.insert('ugc_geracoes', { user_id: user.id, provedor: api.provedor, modelo: r.modelo || api.modelo, mes, status,
        tokens_entrada: r.tin || 0, tokens_saida: r.tout || 0, custo_micros: custoReal(api.modelo, r.tin || 0, r.tout || 0), ...extra });
      if (r.erro) { registrar('erro', { erro: r.erro }); throw new HttpError(502, r.erro); }
      const campos = lerJson(r.texto);
      if (!campos || !String(campos.legenda || campos.roteiro || '').trim()) {
        registrar('ok', { erro: 'resposta sem JSON' });
        throw new HttpError(502, 'A IA respondeu fora do formato combinado. Nada foi salvo; tente de novo.');
      }
      const opts = opcoesPreflight(tenant, persona);
      campos.legenda = completarRodape(String(campos.legenda || ''), opts); // o rodapé obrigatório entra sempre
      const peca = criarPecaDaPauta(app, tenant, repo, user, pauta, campos, 'api', r.modelo || api.modelo);
      const g = registrar('ok', { peca_id: peca.id });
      audit('ugc.peca_gerar', peca.id, { provedor: api.provedor, modelo: api.modelo, tokens: (r.tin || 0) + (r.tout || 0) }); // nunca a chave
      return { status: 201, body: { peca: pecaOut(app, tenant, repo, peca, new Map()), geracao: { modelo: g.modelo, tokensEntrada: g.tokens_entrada, tokensSaida: g.tokens_saida,
        custoUsd: g.custo_micros / 1e6, usadas: api.usadas + 1, teto: api.teto } } };
    },
  },
  {
    method: 'POST', path: `${base}/pecas`, perm: 'ugc.edit',
    handler: ({ app, repo, tenant, user, body, audit }) => {
      const persona = personaDoTenant(repo, body.persona_id);
      const peca = salvarPreflight(repo, tenant, repo.insert('ugc_pecas', { persona_id: persona.id, pauta_id: null, rede: persona.rede, status: 'rascunho', caminho: 'manual',
        created_by: user.id, ...limparPeca(body) }));
      audit('ugc.peca_criar', peca.id);
      return { status: 201, body: { peca: pecaOut(app, tenant, repo, peca, new Map()) } };
    },
  },
  {
    method: 'PATCH', path: `${base}/pecas/:id`, perm: 'ugc.edit',
    handler: ({ app, repo, tenant, params, body, audit }) => {
      const x = pecaDoTenant(repo, params.id);
      need(['rascunho', 'aprovado'].includes(x.status), 409, 'Peça publicada não muda mais: o texto fica como foi ao ar.');
      const patch = limparPeca(body);
      need(Object.keys(patch).length, 400, 'Nada para alterar.');
      if (x.status === 'aprovado') Object.assign(patch, { status: 'rascunho', aprovado_por: null, aprovado_em: null }); // texto mudou: precisa aprovar de novo
      const novo = salvarPreflight(repo, tenant, repo.update('ugc_pecas', x.id, patch));
      audit('ugc.peca_editar', x.id, { campos: Object.keys(limparPeca(body)), voltouParaRascunho: x.status === 'aprovado' });
      return { peca: pecaOut(app, tenant, repo, novo, new Map()) };
    },
  },
  {
    method: 'POST', path: `${base}/preflight`, perm: 'ugc.read',
    handler: ({ repo, tenant, body }) => {
      const persona = body.persona_id ? personaDoTenant(repo, body.persona_id) : null;
      return { resultado: checarPeca(limparPeca(body), opcoesPreflight(tenant, persona)) };
    },
  },
  {
    method: 'POST', path: `${base}/pecas/:id/aprovar`, perm: 'ugc.approve',
    handler: ({ app, db, repo, tenant, user, params, body, audit }) => {
      const x = pecaDoTenant(repo, params.id);
      need(x.status === 'rascunho', 409, `A peça já está ${ESTADOS_PECA[x.status].toLowerCase()}.`);
      const r = tx(db, () => aprovarUma(repo, tenant, x, user));
      if (!r.ok) throw Object.assign(new HttpError(422, `Não dá para aprovar: ${r.motivos[0]}`), { extra: { motivos: r.motivos } });
      let calendario = null;
      if (body.calendario) { try { calendario = { ok: true, id: mandarParaCalendario(repo, tenant, repo.get('ugc_pecas', x.id)).id }; } catch (e) { calendario = { ok: false, erro: e.message }; } }
      audit('ugc.peca_aprovar', x.id, { calendario: Boolean(calendario?.ok) });
      return { peca: pecaOut(app, tenant, repo, repo.get('ugc_pecas', x.id), new Map()), calendario };
    },
  },
  {
    method: 'POST', path: `${base}/aprovar-semana`, perm: 'ugc.approve',
    handler: ({ db, repo, tenant, user, body, audit }) => {
      const semana = semanaPedida(tenant, body.semana);
      const pautas = new Map(repo.all('ugc_pautas', { semana }, { limit: 500 }).map((p) => [p.id, p]));
      const fim = somarDias(semana, 7);
      const candidatas = repo.all('ugc_pecas', { status: 'rascunho' }, { limit: 1000 })
        .filter((x) => (x.pauta_id ? pautas.has(x.pauta_id) : x.created_at.slice(0, 10) >= semana && x.created_at.slice(0, 10) < fim));
      const aprovadas = [];
      const recusadas = [];
      tx(db, () => {
        for (const x of candidatas) {
          const r = aprovarUma(repo, tenant, x, user);
          if (r.ok) aprovadas.push({ id: x.id, titulo: x.titulo });
          else recusadas.push({ id: x.id, titulo: x.titulo || '(sem título)', persona: r.persona?.nome || '', motivos: r.motivos });
        }
      });
      audit('ugc.aprovar_semana', semana, { aprovadas: aprovadas.length, recusadas: recusadas.length });
      return { semana, aprovadas, recusadas, nota: candidatas.length ? null : 'Nenhuma peça em rascunho nesta semana.' };
    },
  },
  {
    method: 'POST', path: `${base}/pecas/:id/voltar`, perm: 'ugc.approve',
    handler: ({ app, repo, tenant, params, audit }) => {
      const x = pecaDoTenant(repo, params.id);
      need(x.status === 'aprovado', 409, 'Só peça aprovada volta para rascunho.');
      const novo = repo.update('ugc_pecas', x.id, { status: 'rascunho', aprovado_por: null, aprovado_em: null });
      audit('ugc.peca_voltar', x.id);
      return { peca: pecaOut(app, tenant, repo, novo, new Map()) };
    },
  },
  {
    method: 'POST', path: `${base}/pecas/:id/calendario`, perm: 'ugc.approve',
    handler: ({ repo, tenant, params, audit }) => {
      const x = pecaDoTenant(repo, params.id);
      need(x.status === 'aprovado', 409, 'Aprove a peça antes de mandar para o calendário.');
      const item = mandarParaCalendario(repo, tenant, x);
      audit('ugc.peca_calendario', x.id, { calendario: item.id });
      return { ok: true, calendario: item.id, nota: 'Rascunho criado no Calendário. Nada foi publicado.' };
    },
  },
  {
    method: 'POST', path: `${base}/pecas/:id/publicada`, perm: 'ugc.edit',
    handler: ({ app, repo, tenant, params, body, audit }) => {
      const x = pecaDoTenant(repo, params.id);
      need(x.status === 'aprovado', 409, 'Só peça aprovada pode ser marcada como publicada.');
      let u;
      try { u = new URL(String(body.post_url || '').trim()); } catch { u = null; }
      need(u && /^https?:$/.test(u.protocol), 400, 'Cole o endereço do post (começa com https://).');
      const host = u.hostname.replace(/^www\.|^m\./, '').toLowerCase();
      need(REDES[x.rede].dominios.some((d) => host === d || host.endsWith(`.${d}`)), 400, `Esse endereço não é do ${REDES[x.rede].nome}. Cole o link do post nessa rede.`);
      const novo = repo.update('ugc_pecas', x.id, { status: 'publicado', post_url: u.toString().slice(0, 500), publicado_em: now() });
      audit('ugc.peca_publicada', x.id, { rede: x.rede }); // marcação manual: o portal não postou nada
      return { peca: pecaOut(app, tenant, repo, novo, new Map()) };
    },
  },
  {
    method: 'POST', path: `${base}/pecas/:id/medir`, perm: 'ugc.edit',
    handler: ({ app, repo, tenant, user, params, body, audit }) => {
      const x = pecaDoTenant(repo, params.id);
      need(['publicado', 'medido'].includes(x.status), 409, 'Marque a peça como publicada antes de informar os números.');
      const views = Number(body.views);
      need(Number.isInteger(views) && views >= 0 && views <= 1e10, 400, 'Views: um número inteiro, do jeito que aparece na rede.');
      repo.insert('ugc_metricas', { peca_id: x.id, persona_id: x.persona_id, views, informado_por: user.id });
      const novo = repo.update('ugc_pecas', x.id, { status: 'medido', views, medido_em: now() });
      audit('ugc.peca_medir', x.id, { views });
      return { peca: pecaOut(app, tenant, repo, novo, new Map()) };
    },
  },
  {
    method: 'DELETE', path: `${base}/pecas/:id`, perm: 'ugc.edit',
    handler: ({ repo, params, audit }) => {
      const x = pecaDoTenant(repo, params.id);
      need(['rascunho', 'aprovado'].includes(x.status), 409, 'Peça publicada fica no histórico do placar.');
      repo.remove('ugc_pecas', x.id);
      audit('ugc.peca_apagar', x.id);
      return { ok: true };
    },
  },
  {
    method: 'GET', path: `${base}/pecas/:id/baixar`, perm: 'ugc.read',
    handler: ({ repo, tenant, params }) => {
      const x = pecaDoTenant(repo, params.id);
      const persona = repo.get('ugc_personas', x.persona_id);
      const corpo = [`${x.titulo || 'Peça'} · ${persona?.nome || ''} · ${REDES[x.rede]?.nome || x.rede}`, `Situação: ${ESTADOS_PECA[x.status]}`,
        '', '== TEXTO DE CAPA ==', x.capa, '', '== ROTEIRO ==', x.roteiro, '', '== LEGENDA ==', x.legenda, '', '== HASHTAGS ==', x.hashtags,
        ...(x.briefing ? ['', '== BRIEFING ==', x.briefing] : []),
        ...(persona?.rotulo_ia ? ['', 'Persona de IA: ao postar, ligue o rótulo de conteúdo feito com IA da rede.'] : []),
        '', `Operação: ${tenant.name}. O portal não posta: publique à mão e marque como publicada no Estúdio de UGC.`].join('\r\n');
      const nome = `peca-${x.rede}-${String(x.id).slice(0, 8)}.txt`;
      return { status: 200, body: corpo, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${nome}"` } };
    },
  },
  {
    method: 'GET', path: `${base}/placar`, perm: 'ugc.read',
    handler: ({ repo }) => ({ placar: ordenarElenco(repo.all('ugc_personas', {}, { limit: 10 })).map((p) => ({ persona_id: p.id, nome: p.nome, rede: p.rede, d7: placarDe(repo, p, 7), d30: placarDe(repo, p, 30) })) }),
  },
];

// ---------------------------------------------------------------- ferramentas MCP: a IA do dono escreve a peça

const fail = (msg) => { throw Object.assign(new Error(msg), { toolError: true }); };
const S = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const str = (description) => ({ type: 'string', description });

export const mcpTools = [
  {
    name: 'ugc_listar_pautas', perm: 'ugc.read',
    description: 'Lista a pauta da semana do Estúdio de UGC (tema, gancho, dia, influenciador e rede) e diz se a pauta já tem peça. Use antes de escrever uma peça.',
    inputSchema: S({ semana: str('qualquer dia da semana desejada, AAAA-MM-DD (padrão: semana atual)') }),
    handler: ({ repo, tenant, args }) => {
      const semana = semanaPedida(tenant, args.semana);
      const personas = new Map(repo.all('ugc_personas', {}, { limit: 10 }).map((p) => [p.id, p]));
      const pecas = repo.all('ugc_pecas', {}, { limit: 500 });
      return { semana, pautas: repo.all('ugc_pautas', { semana }, { order: 'dia ASC, ordem ASC', limit: 200 }).map((p) => {
        const peca = pecas.find((x) => x.pauta_id === p.id);
        return { pauta_id: p.id, dia: p.dia, tema: p.tema, gancho: p.gancho, formato: p.formato_peca, situacao: p.status,
          persona_id: p.persona_id, influenciador: personas.get(p.persona_id)?.nome, rede: personas.get(p.persona_id)?.rede, peca: peca ? { id: peca.id, situacao: peca.status } : null };
      }) };
    },
  },
  {
    name: 'ugc_ver_persona', perm: 'ugc.read',
    description: 'Mostra a ficha completa de um influenciador do elenco (voz, bordões, glossário, assuntos, o que nunca fala, visual, regras e link rastreado). Escreva sempre nessa voz.',
    inputSchema: S({ persona_id: str('id do influenciador (de ugc_listar_pautas)'), rede: { type: 'string', enum: ORDEM_REDES, description: 'ou a rede do influenciador' } }),
    handler: ({ repo, tenant, args, app }) => {
      const p = (args.persona_id && repo.get('ugc_personas', String(args.persona_id))) || (args.rede && repo.get('ugc_personas', { rede: String(args.rede) }));
      if (!p) fail('Influenciador não encontrado nesta operação.');
      const out = personaOut(app, tenant, repo, p);
      return { ...out, regras_do_texto: [
        'Sem promessa de ganho, renda ou lucro. Nada é "garantido".',
        'Sem bônus, ficha grátis, rakeback ou cashback.',
        'Nada que fale com menor de idade.',
        ...(exigeJogoResponsavel({ nicho: tenant.niche_id, edicao: tenant.edition }) ? [`A legenda leva "${RODAPE_JOGO}".`] : []),
        ...(p.formato === 'ia' ? ['Persona de IA: nunca diga que é pessoa real; a legenda leva "Conteúdo feito com IA."'] : []),
      ] };
    },
  },
  {
    name: 'ugc_checar_texto', perm: 'ugc.read',
    description: 'Passa um texto pelo preflight do portal (promessa de ganho, bônus, menor de idade, +18 e jogo responsável no poker, rótulo de IA). Use antes de salvar.',
    inputSchema: S({ texto: str('o texto'), persona_id: str('id do influenciador (opcional, para as regras da rede e do formato)'), parte: { type: 'string', enum: ['legenda', 'roteiro', 'capa', 'briefing'] } }, ['texto']),
    handler: ({ repo, tenant, args }) => {
      const p = args.persona_id ? repo.get('ugc_personas', String(args.persona_id)) : null;
      return checarTexto(String(args.texto || ''), { ...opcoesPreflight(tenant, p), parte: args.parte || 'legenda' });
    },
  },
  {
    name: 'ugc_salvar_peca', perm: 'ugc.edit',
    description: 'Salva a peça de uma pauta como RASCUNHO (roteiro, legenda, hashtags, capa e briefing). Nada é publicado: o dono revisa e aprova no painel, e a aprovação exige o preflight ok.',
    inputSchema: S({ pauta_id: str('id da pauta (de ugc_listar_pautas)'), titulo: str('título curto'), roteiro: str('roteiro com marcação de tempo'), legenda: str('legenda do post'),
      hashtags: str('3 a 5 hashtags separadas por espaço'), capa: str('texto de capa, até 60 caracteres'), briefing: str('instruções para quem grava (criador real ou rosto da marca)') }, ['pauta_id', 'legenda']),
    handler: ({ repo, tenant, args, user, app }) => {
      const pauta = repo.get('ugc_pautas', String(args.pauta_id || ''));
      if (!pauta) fail('Pauta não encontrada nesta operação.');
      let peca;
      try { peca = criarPecaDaPauta(app, tenant, repo, user, pauta, args, 'mcp', 'IA conectada'); } catch (e) { fail(e.message); }
      const pf = parse(peca.preflight, {});
      return { ok: true, peca_id: peca.id, situacao: 'rascunho', preflight: pf,
        aviso: pf.ok ? 'Rascunho salvo e preflight ok. A aprovação é do dono, no painel.' : 'Rascunho salvo, mas o preflight não passou: corrija os bloqueios e o que falta e salve de novo.' };
    },
  },
];
