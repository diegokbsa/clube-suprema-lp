# Estúdio de UGC: 3 influenciadores, 1 por rede (modelo para debater)

Ideia do Kbsa em 06/11/2026: "dentro do painel criar modelo de UGC, onde selecionamos 3 influencers, criamos e deixamos 1 pra cada rede social pra postar conteúdo". Pediu para guardar a ideia e modelar o quanto antes, para decidirmos juntos.

Este documento é o modelo. **Nada foi construído ainda.** Ao lado de cada decisão está o que eu recomendo.

## 1. O que é, em uma frase

Cada operação (um clube na SX ou um afiliado no aff) ganha um **elenco de 3 influenciadores**, um fixo em cada rede. O painel gera o conteúdo de cada um com a voz e o estilo dele, o dono aprova, e a publicação sai programada.

Cada influenciador vira um canal próprio da operação, que posta sem parar e não depende de criador externo.

## 2. Três formatos de influenciador (o dono escolhe por influenciador)

| Formato | Como é | Quando usar | Cuidado |
|---|---|---|---|
| **Persona de IA** | Personagem criado: nome, rosto gerado, voz sintética, história | Volume diário sem custo de pessoa | Rótulo de conteúdo gerado por IA (Meta, TikTok e YouTube exigem), nunca fingir que é pessoa real |
| **Criador real contratado** | Pessoa de verdade; o painel gera roteiro, legenda e briefing, e ela grava | Credibilidade, rosto humano | Contrato, direito de imagem, pagamento fora do painel |
| **Rosto da marca** | O próprio dono ou agente do clube; o painel faz roteiro e edita | Clube pequeno, confiança local | Constância (o painel cobra a pauta) |

**Recomendo:** começar com **Persona de IA** em 2 redes e **Rosto da marca** em 1. É o mais barato para provar que funciona.

## 3. Uma rede para cada um (padrão sugerido)

| Influenciador | Rede | Formato do conteúdo | Ritmo |
|---|---|---|---|
| A · "o que explica" | YouTube Shorts | Vídeo de 30–60 s ensinando (regra, mão comentada, como entrar no clube) | 1 por dia |
| B · "o do dia a dia" | Instagram (Reels + Stories) | Bastidor, torneio de hoje, enquete, carrossel | 1 Reel + 3 Stories por dia |
| C · "o da conversa" | TikTok | Tendência, reação, humor leve do nicho | 1–2 por dia |

Cada influenciador tem uma **ficha**: nome, idade aparente, jeito de falar (glossário próprio, bordões), assuntos que domina, o que **nunca** fala, paleta e enquadramento visual, e a rede dele.

## 4. Como encaixa no portal (o que já existe e o que falta)

Já existe e reaproveita:
- **Operação, módulos e permissões.** O estúdio vira o módulo `ugc` (`lib/modules/ugc.mjs`, tela `public/admin/modules/ugc.js`).
- **Rotinas de IA (PA-111) e IA do afiliado conectada por MCP.** O afiliado gera usando a chave dele (sem chave = "pendente de configuração").
- **Calendário editorial (PA-031)**, para programar posts.
- **Criativos (PA-030)**, com formatos 1:1, 4:5 e 9:16.
- **Atribuição.** Cada influenciador tem o seu link rastreado, o que permite medir qual deles traz cadastro e PIX.
- **Instagram pela API oficial (PA-041).** Para TikTok e YouTube faltam integrações novas.

Tabelas novas, todas com `tenant_id`:
- `ugc_personas`: ficha (nome, formato, rede, voz, regras, visual, status).
- `ugc_pautas`: tema, gancho, rede, data, persona.
- `ugc_pecas`: roteiro, legenda, mídia, status rascunho → aprovado → programado → publicado → medido.
- `ugc_metricas`: views, cliques no link da persona, cadastros e conversões atribuídos.

## 5. Fluxo no painel

1. **Montar o elenco.** Assistente em 3 passos: escolher o formato de cada um, preencher ou gerar a ficha e ligar a rede. Prévia de um post de exemplo de cada um, para o dono aprovar a voz.
2. **Pauta da semana.** O sistema propõe a pauta cruzando a agenda do clube (torneios), o blog e os insights do pesquisador. O dono arrasta e aprova.
3. **Produção.** Para cada item da pauta sai a peça pronta: roteiro, legenda, hashtags e capa. Para persona de IA sai também imagem ou vídeo. Para criador real sai o briefing.
4. **Aprovação.** Nada publica sem o OK do dono, e o portal não posta nada sozinho na primeira versão. Fila de aprovação com o botão "aprovar a semana".
5. **Publicação e medição.** Programado pela integração oficial de cada rede, ou baixado para postar à mão onde não houver API. O painel mostra o placar por influenciador: views, cliques, cadastros e PIX atribuídos.

## 6. Regras que não se quebram

- **Conteúdo gerado por IA** sempre com o rótulo de cada rede. Persona de IA nunca se apresenta como pessoa real.
- **Poker e jogo:** sem promessa de ganho, sem bônus e sem fichas grátis; somente +18 e "Jogue com responsabilidade" na legenda. Na Meta, anúncio de jogo de dinheiro exige autorização; post orgânico também segue as regras de conteúdo.
- **Rosto de pessoa real só com autorização por escrito.** Nada de imitar pessoa famosa.
- **Contas das redes são do dono.** O portal se conecta pelo login oficial (OAuth) e não guarda senha.
- **Custo de geração de imagem e vídeo** aparece antes de gerar, com teto mensal por operação.

## 7. Como provar antes de construir tudo (fase 0, uma semana)

1. Uma operação de teste, com 1 persona de IA no Instagram e 1 rosto da marca no YouTube Shorts.
2. Geração só de roteiro, legenda e capa (sem vídeo de IA), com aprovação manual e postagem à mão.
3. Medir pelo link rastreado de cada influenciador os cliques e cadastros em 7 dias.
4. Se trouxer cadastro, segue para a fase 1: módulo no painel, tabelas, calendário e Instagram oficial. Se não trouxer, ajustamos a voz ou o formato antes de gastar com vídeo.

## 8. Para decidirmos juntos

1. **Formatos.** Persona de IA, criador real, rosto da marca, ou a mistura que eu recomendo (2 IA + 1 rosto da marca)?
2. **Frente.** Começa na SX (clubes de poker) ou no aff (qualquer nicho)? Eu começaria na SX: o Clube 10001 serve de teste com dados reais.
3. **Vídeo de IA** (avatar falando) na fase 1, ou só depois que roteiro e legenda provarem resultado?
4. **Publicação.** Começa com aprovação e postagem manual, ou já integrada? Recomendo manual na fase 0 e integrada na fase 1.
