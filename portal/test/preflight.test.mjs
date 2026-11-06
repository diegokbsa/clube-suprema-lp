// Preflight de texto (lib/preflight.mjs): bons e maus exemplos. A PA-140 também importa este módulo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checarTexto, checarPeca, completarRodape, exigeJogoResponsavel, RODAPE_JOGO, REGRAS } from '../lib/preflight.mjs';

const SX = { edicao: 'sx', nicho: 'poker', rede: 'instagram' };
const GERAL = { edicao: 'geral', nicho: 'saas', rede: 'tiktok' };
const regras = (r) => r.bloqueios.map((b) => b.regra);

test('formato da resposta é estável', () => {
  const r = checarTexto('Torneio hoje às 20h no clube. +18 · Jogue com responsabilidade.', SX);
  assert.deepEqual(Object.keys(r).sort(), ['avisos', 'bloqueios', 'faltando', 'ok']);
  assert.equal(r.ok, true, JSON.stringify(r));
  const ruim = checarTexto('Ganhe dinheiro fácil', SX);
  for (const b of ruim.bloqueios) {
    assert.deepEqual(Object.keys(b).sort(), ['motivo', 'pos', 'regra', 'trecho']);
    assert.ok(REGRAS[b.regra]);
  }
  assert.equal(checarTexto(null).ok, true); // texto vazio fora do poker não quebra
});

const MAUS_PROMESSA = [
  'Ganhe muito no clube hoje',
  'GANHEEE com a gente',
  'g4nhe todo dia',
  'Faça uma renda extra jogando',
  'renda-extra garantida',
  'Lucro garantido para quem entrar',
  'Quer ficar rico? Vem pro clube',
  'Fique rico com o poker',
  'Dinheiro fácil, só entrar',
  'dinheiro facil',
  'Lucre jogando poker',
  'Dá pra ganhar R$ 500 por dia',
  'ganhando dinheiro todos os dias',
  'Viva de poker como eu',
  'Multiplique sua banca em uma semana',
  'É risco zero',
];
for (const txt of MAUS_PROMESSA) {
  test(`bloqueia promessa: "${txt}"`, () => {
    const r = checarTexto(`${txt}. +18 · Jogue com responsabilidade.`, SX);
    assert.equal(r.ok, false);
    assert.ok(regras(r).includes('promessa_ganho') || regras(r).includes('resultado_garantido'), JSON.stringify(r.bloqueios));
  });
}

const MAUS_BONUS = [
  'Bônus de boas-vindas para novos jogadores',
  'bonus no primeiro depósito',
  'B0NUS liberado',
  'Fichas grátis para quem entrar hoje',
  'ficha gratuita no cadastro',
  'Ganhe 100 fichas',
  'Rakeback de 30% toda semana',
  'rake-back semanal',
  'Cashback nas suas compras de fichas',
  'Depósito em dobro só hoje',
  'fichas de graça',
];
for (const txt of MAUS_BONUS) {
  test(`bloqueia bônus no poker: "${txt}"`, () => {
    const r = checarTexto(`${txt}. +18 · Jogue com responsabilidade.`, SX);
    assert.ok(regras(r).includes('bonus'), JSON.stringify(r));
    assert.equal(r.ok, false);
  });
}

test('bloqueia "garantido" em resultado e só avisa no resto', () => {
  for (const txt of ['Vitória garantida no torneio', 'Resultado garantido', 'Garantimos o seu lucro', '100% garantido', 'retorno garantido em 30 dias']) {
    const r = checarTexto(`${txt}. +18 · Jogue com responsabilidade.`, SX);
    assert.ok(regras(r).includes('resultado_garantido') || regras(r).includes('promessa_ganho'), `${txt}: ${JSON.stringify(r.bloqueios)}`);
  }
  const vaga = checarTexto('Sua vaga garantida na mesa de sábado. +18 · Jogue com responsabilidade.', SX);
  assert.equal(vaga.ok, true, JSON.stringify(vaga.bloqueios));
  assert.ok(vaga.avisos.some((a) => a.regra === 'garantido'));
});

const MAUS_MENOR = [
  'Chama a galera da escola pra jogar',
  'Para adolescentes que curtem cartas',
  'Ideal para crianças',
  'Use sua mesada no clube',
  'Liberado a partir de 16 anos',
  'Quem tem 15 anos pode entrar?',
  'Novinhos são bem-vindos',
  'Conteúdo +16!',
  'Galera do ensino médio, chegou a hora',
];
for (const txt of MAUS_MENOR) {
  test(`bloqueia menor de idade: "${txt}"`, () => {
    const r = checarTexto(`${txt}. +18 · Jogue com responsabilidade.`, SX);
    assert.ok(regras(r).includes('menor_de_idade'), JSON.stringify(r));
  });
}

const BONS = [
  'Torneio de sábado às 20h. Mesa cheia, jogo limpo. +18 · Jogue com responsabilidade.',
  'Como funciona o blind? Explico em 30 segundos. +18. Jogue com responsabilidade.',
  'Proibido para menores de 18 anos. Jogue com responsabilidade.',
  'Aqui não tem bônus: tem jogo limpo e agente que responde. 18+ Jogue com responsabilidade.',
  'Sem promessa, sem dinheiro fácil: poker é jogo de decisão. +18 · Jogue com responsabilidade.',
  'Escola de poker do clube: aula de mãos comentadas. +18 · Jogue com responsabilidade.',
  'O clube faz 15 anos de história hoje. +18 · Jogue com responsabilidade.',
  'São +16 torneios por semana na grade. +18 · Jogue com responsabilidade.',
  'Bastidor: como o agente prepara a mesa. Somente maiores de 18. Jogue com responsabilidade.',
];
for (const txt of BONS) {
  test(`passa (bom exemplo): "${txt.slice(0, 50)}"`, () => {
    const r = checarTexto(txt, SX);
    assert.equal(r.ok, true, JSON.stringify({ b: r.bloqueios, f: r.faltando }));
  });
}

test('SX ou poker exige +18 e "Jogue com responsabilidade"', () => {
  const r = checarTexto('Torneio hoje às 20h', SX);
  assert.equal(r.ok, false);
  assert.deepEqual(r.faltando.map((f) => f.regra).sort(), ['jogo_responsavel', 'mais_18']);
  assert.equal(r.bloqueios.length, 0);
  // nicho poker na edição Geral também exige
  assert.equal(checarTexto('Torneio hoje', { edicao: 'geral', nicho: 'poker' }).faltando.length, 2);
  // edição SX exige mesmo sem nicho informado
  assert.equal(checarTexto('Torneio hoje', { edicao: 'sx' }).faltando.length, 2);
  // só +18
  assert.deepEqual(checarTexto('Torneio hoje. Jogue com responsabilidade', SX).faltando.map((f) => f.regra), ['mais_18']);
  // acentos e caixa não atrapalham
  assert.equal(checarTexto('TORNEIO HOJE. +18 JOGUE COM RESPONSABILIDADE', SX).faltando.length, 0);
  // roteiro não precisa do rodapé (vai na legenda)
  assert.equal(checarTexto('Fala, pessoal!', { ...SX, parte: 'roteiro' }).faltando.length, 0);
  assert.equal(exigeJogoResponsavel({ edicao: 'sx' }), true);
  assert.equal(exigeJogoResponsavel({ edicao: 'geral', nicho: 'loja' }), false);
});

test('edição Geral: sem rodapé de jogo; promessa e menor seguem bloqueados; bônus e cashback viram aviso', () => {
  const ok = checarTexto('Organize seus clientes em 5 minutos. Teste grátis por 14 dias.', GERAL);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.faltando.length, 0);
  assert.equal(checarTexto('Ganhe tempo com o nosso CRM', GERAL).ok, true);
  assert.equal(checarTexto('Ganhe dinheiro com o nosso CRM', GERAL).ok, false);
  assert.equal(checarTexto('Renda extra trabalhando de casa', { edicao: 'geral', nicho: 'criador' }).ok, false);
  assert.equal(checarTexto('Ideal para crianças', { edicao: 'geral', nicho: 'loja' }).ok, false);
  const cash = checarTexto('Cashback de 5% na loja', { edicao: 'geral', nicho: 'loja' });
  assert.equal(cash.ok, true);
  assert.ok(cash.avisos.some((a) => a.regra === 'bonus'));
  assert.equal(checarTexto('Rakeback de 30%', { edicao: 'geral', nicho: 'loja' }).ok, false);
});

test('avisos: palavrão, caixa alta e link encurtado (não bloqueiam)', () => {
  const r = checarTexto('Que porra de mão! VEM PRO CLUBE AGORA MESMO, link em bit.ly/abc123 +18 · Jogue com responsabilidade.', SX);
  assert.equal(r.ok, true, JSON.stringify(r.bloqueios));
  const tipos = r.avisos.map((a) => a.regra);
  assert.ok(tipos.includes('palavrao'));
  assert.ok(tipos.includes('caixa_alta'));
  assert.ok(tipos.includes('link_encurtado'));
  assert.equal(r.avisos.find((a) => a.regra === 'link_encurtado').trecho, 'bit.ly/abc123');
  // siglas do poker não contam como grito
  assert.equal(checarTexto('Hoje tem MTT e SNG, PIX na hora. +18 · Jogue com responsabilidade.', SX).avisos.length, 0);
  // "disputa" não é palavrão
  assert.equal(checarTexto('A disputa final foi linda. +18 · Jogue com responsabilidade.', SX).avisos.length, 0);
});

test('trecho devolve o texto original, com acento e caixa', () => {
  const r = checarTexto('Olá! Bônus de R$ 50 pra você', SX);
  const b = r.bloqueios.find((x) => x.regra === 'bonus');
  assert.equal(b.trecho, 'Bônus');
  assert.equal(b.pos, 5);
});

test('persona de IA: rótulo obrigatório e nunca se diz pessoa real', () => {
  const sem = checarTexto('Dica do dia sobre blinds.', { edicao: 'geral', nicho: 'saas', formato: 'ia' });
  assert.deepEqual(sem.faltando.map((f) => f.regra), ['rotulo_ia']);
  assert.equal(checarTexto('Dica do dia. Conteúdo feito com IA.', { edicao: 'geral', nicho: 'saas', formato: 'ia' }).ok, true);
  assert.equal(checarTexto('Dica do dia #IA', { edicao: 'geral', nicho: 'saas', formato: 'ia' }).ok, true);
  const finge = checarTexto('Oi, eu não sou IA, sou de carne e osso! #IA', { edicao: 'geral', nicho: 'saas', formato: 'ia' });
  assert.ok(regras(finge).includes('ia_finge_pessoa'));
  // criador real não precisa do rótulo
  assert.equal(checarTexto('Dica do dia.', { edicao: 'geral', nicho: 'saas', formato: 'criador' }).ok, true);
});

test('limites da rede', () => {
  const tags = Array.from({ length: 12 }, (_, i) => `#tag${i}`).join(' ');
  assert.ok(checarTexto(`Vídeo novo ${tags}`, { edicao: 'geral', nicho: 'saas', rede: 'tiktok' }).avisos.some((a) => a.regra === 'hashtags_demais'));
  assert.ok(checarTexto('x'.repeat(2300), { edicao: 'geral', nicho: 'saas', rede: 'instagram' }).avisos.some((a) => a.regra === 'tamanho_rede'));
});

test('checarPeca junta as partes e completarRodape acrescenta o que falta', () => {
  const p = checarPeca({ roteiro: 'Ganhe fichas grátis!', legenda: 'Torneio hoje', hashtags: '#poker' }, { ...SX, formato: 'ia' });
  assert.equal(p.ok, false);
  assert.ok(p.bloqueios.every((b) => b.parte === 'roteiro'));
  assert.deepEqual(p.faltando.map((f) => f.regra).sort(), ['jogo_responsavel', 'mais_18', 'rotulo_ia']);
  const ok = checarPeca({ roteiro: 'Hoje explico o blind.', legenda: completarRodape('Torneio hoje', { ...SX, formato: 'ia' }), hashtags: '#poker' }, { ...SX, formato: 'ia' });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(completarRodape('Torneio hoje', SX), `Torneio hoje\n\n${RODAPE_JOGO}`);
  assert.equal(completarRodape(`Torneio hoje\n\n${RODAPE_JOGO}`, SX), `Torneio hoje\n\n${RODAPE_JOGO}`);
});
