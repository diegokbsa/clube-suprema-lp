---
title: "Equity no poker: o que é, como calcular e como usar na decisão"
seoTitle: "Equity no poker: o que é e como calcular"
description: O que é equity no poker, como estimar a chance de ganhar a mão com a regra do 4 e do 2, exemplos com contas e como comparar equity com pot odds.
date: 2026-11-24
updated: 2026-11-24
cover: /img/blog/equity-no-poker/cover.jpg
coverAlt: "Capa do guia Equity no poker: a sua fatia do pote em porcentagem"
capaTema: cartas
capaChamada: "Guia · Matemática"
capaTitulo: "Equity no poker"
capaSubtitulo: "Sua fatia do pote, em porcentagem."
capaSelo: "Maiores de 18"
tags: [matemática, iniciantes, guia, jogo responsável]
resumo: Equity é a porcentagem do pote que pertence a você, em média, se a mão for até o fim sem mais apostas. Se você tem 35% de equity, ganha cerca de 35 vezes a cada 100 repetições daquela situação. Uma estimativa rápida vem da regra do 4 e do 2, que multiplica seus outs por 4 no flop e por 2 no turn. Comparada às pot odds, a equity mostra se pagar uma aposta é matematicamente razoável. Isso é uma média de longo prazo e não garante resultado em nenhuma mão.
passosTitulo: Como estimar a equity de um projeto em quatro passos
passos:
  - Conte os outs, isto é, as cartas que melhoram sua mão e que você ainda não viu.
  - No flop, com duas cartas por vir, multiplique os outs por 4. No turn, com uma carta por vir, multiplique por 2.
  - Calcule a equity necessária da aposta, dividindo o valor a pagar pelo pote final depois do seu call.
  - Compare as duas. Se a equity estimada for maior que a necessária, pagar é razoável do ponto de vista da conta, sem garantia de resultado.
faq:
  - q: O que é equity no poker?
    a: É a sua fatia esperada do pote, em porcentagem, se todas as cartas restantes fossem distribuídas sem novas apostas. Ela mede a chance de ganhar, contando empates como partes do pote.
  - q: Equity é igual a chance de ganhar?
    a: É parecida, mas não idêntica. Quando há empate, o pote é dividido, e isso entra na equity. Sem empates possíveis, equity e chance de ganhar coincidem.
  - q: Como calcular equity rápido na mesa?
    a: Use a regra do 4 e do 2. Conte seus outs e multiplique por 4 no flop ou por 2 no turn. É uma aproximação, e fica menos precisa com muitos outs.
  - q: Ter mais de 50% de equity garante que eu vou ganhar a mão?
    a: Não. Equity é uma média de muitas repetições. Com 80% de equity você ainda perde cerca de 1 vez em 5.
  - q: Qual a diferença entre equity e pot odds?
    a: Pot odds dizem quanto você precisa de equity para que pagar valha a conta. Equity diz quanto você tem. Comparando as duas, você avalia o pagamento.
---

Quando alguém diz "tenho 35% de equity", está dizendo quanto do pote é seu, em média, se a mão for até o fim. É a base da matemática do poker: antes de decidir, você compara a sua equity com o preço que o jogo cobra. Este guia explica o conceito, uma forma rápida de estimar e dois exemplos com conta.

## O que é equity

Equity é a sua fatia esperada do pote em porcentagem. Se você repetisse a mesma situação muitas vezes, com cartas sorteadas de novo a cada vez, a equity seria a parcela das repetições que você levaria, contando empates como partes do pote.

Equity é uma **média de longo prazo**. Numa única mão, você ganha ou perde, e a equity só descreve a chance antes das cartas saírem.

## Exemplos de equity antes do flop

Valores aproximados, para comparar:

| Confronto | Mão favorita | Equity aproximada |
|---|---|---|
| Ases contra reis | Ases | cerca de 82% contra 18% |
| Damas contra A-K de naipes diferentes | Damas | cerca de 57% contra 43% |
| Damas contra A-K do mesmo naipe | Damas | cerca de 54% contra 46% |

Veja que até a mão favorita perde com frequência. Ases perdem cerca de 18 vezes em 100 contra reis. Para entender por que isso acontece, leia sobre [variância no poker](/blog/variancia-no-poker) e sobre as [probabilidades do poker](/blog/probabilidades-no-poker).

## Como estimar: a regra do 4 e do 2

A conta exata exige contar combinações, mas há uma aproximação fácil para projetos de mão. Conte seus **outs**, as cartas que melhoram sua mão (veja [outs e pot odds](/blog/pot-odds-e-outs)):

- **No flop** (duas cartas por vir): outs × 4.
- **No turn** (uma carta por vir): outs × 2.

Exemplo: você tem um projeto de flush no flop, com 9 outs (13 cartas do naipe, menos as 4 que você já vê). Estimativa: 9 × 4 = 36%. A conta exata é 1 − (38/47 × 37/46), que dá cerca de 35%, bem perto. No turn, a estimativa é 9 × 2 = 18% e a conta exata é 9/46, cerca de 19,6%.

A regra tende a exagerar um pouco quando há muitos outs (acima de 8 ou 9) e supõe que seus outs são limpos, isto é, que completar a mão realmente o coloca na frente. Considere-a uma estimativa, não um número exato.

## Equity contra pot odds

A equity vira decisão quando você a compara com o preço da aposta. A **equity necessária** é o valor a pagar dividido pelo pote final depois do seu call.

Exemplo: o pote tem 100 e o adversário aposta 50, e o pote vai a 150. Para pagar, você coloca 50 e o pote final fica em 200. Equity necessária: 50 ÷ 200 = **25%**.

Se o seu projeto de flush tem cerca de 35% de equity no flop, está acima de 25%, e pagar é razoável do ponto de vista da conta. Um projeto de 4 outs no turn tem cerca de 8% pela regra do 2, abaixo dos 25%, e a conta indicaria desistir. Esta comparação é uma simplificação: ela ignora apostas futuras e como o adversário joga. Para pensar nas mãos que o adversário pode ter, veja [o que é range](/blog/o-que-e-range).

:::nota
Resposta curta: equity é a sua fatia esperada do pote, em porcentagem, se a mão fosse até o fim sem novas apostas. Estime com a regra do 4 e do 2 (outs × 4 no flop, outs × 2 no turn) e compare com a equity necessária da aposta, valor a pagar ÷ pote final. É uma média de longo prazo e não garante resultado em nenhuma mão.
:::

## Como estimar a equity de um projeto em quatro passos

1. **Conte os outs.** Cartas que melhoram sua mão e que você ainda não viu.
2. **Aplique a regra.** Outs × 4 no flop, outs × 2 no turn.
3. **Calcule a equity necessária.** Valor a pagar ÷ pote final depois do call.
4. **Compare.** Equity estimada maior que a necessária indica que pagar é razoável pela conta, sem garantia de resultado.

## Erros comuns

- **Tratar equity como previsão.** Ela vale para muitas repetições e não diz o que vai acontecer na próxima mão.
- **Contar outs que não são limpos.** Uma carta que completa seu projeto mas dá ao adversário uma mão ainda melhor não é um out de verdade.
- **Esquecer que a equity muda a cada carta.** Depois do flop, o número precisa ser refeito.
- **Decidir só pela matemática, ignorando os limites combinados.** Uma conta favorável não torna prudente jogar além do que se definiu perder.

## Jogue com consciência

Entender equity ajuda a decidir com cabeça fria, mas nenhum cálculo elimina o risco de perda. Defina antes de sentar quanto está disposto a perder e por quanto tempo, como mostra o guia de [gestão de banca](/blog/gestao-de-banca-no-poker), e respeite os dois limites.

O conteúdo é educativo e para **maiores de 18 anos**. Não há promessa de ganho: o poker envolve risco de perda. Se o jogo deixou de ser lazer, procure ajuda: o [CVV](https://www.cvv.org.br) atende de graça, 24 horas, pelo telefone 188 (apoio emocional), e os [Jogadores Anônimos Brasil](https://www.jogadoresanonimos.com.br) mantêm grupos de apoio para quem tem problemas com jogo.
