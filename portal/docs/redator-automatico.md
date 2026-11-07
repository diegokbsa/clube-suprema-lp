# Redator automático: posts do blog de qualquer operação

Instrução para a tarefa agendada (Claude, Codex ou Kimi) que escreve os posts automáticos das operações do Portal de
Afiliação. Vale para **qualquer operação** que ligou a "Pauta automática" no painel. Adaptada de
`marketing/post-automatico.md` do suprema.blog: lá o post virava arquivo `.md` com `git push`; aqui o post é entregue
ao portal por API e o portal agenda, publica, avisa os buscadores (IndexNow), põe no sitemap e manda ao Bluesky.

O portal **não chama modelo de IA**. Ele guarda a fila de temas e os horários de cada operação; quem escreve é você.

## O que você precisa

- **Endereço do portal**: o da edição da operação (ex.: `https://portal.kbsa.app` ou `https://sx.kbsa.app`; local:
  `http://localhost:<porta>`). Os endereços exatos de cada operação aparecem no painel, em *Pauta automática →
  Endereços do redator*.
- **Token de serviço**: o mesmo do pesquisador de IA. Fica no servidor, em `portal/data/token-servico.txt` (ou na
  variável `PORTAL_SERVICE_TOKEN`). Leia o arquivo na hora de usar; **nunca** copie o token para nota, log, commit,
  ordem ou relatório. Todas as chamadas levam o cabeçalho `Authorization: Bearer <token>`.

## Quando rodar

Rode de hora em hora (ou nos horários das operações, ex.: 12h, 15h e 18h). Em cada rodada:

1. `GET /api/service/pauta` lista as operações com a pauta ligada:
   `{ operacoes: [{ operacao, nome, edicao, nicho, modo, proximoHorario, ehAVez, temaReservado, temasNaFila }] }`.
2. Para cada operação com `ehAVez: true` (o próximo horário livre está a menos de 1 h, ou já passou há até 3 h),
   faça **uma** rodada de post, como abaixo. As outras ficam para a próxima.

## Passo a passo de cada post

1. **Pegue o tema**: `POST /api/service/pauta/<operacao>/proximo` (corpo `{}`).
   - Reserva o primeiro tema da fila por 3 h para o próximo horário livre. Chamar de novo devolve **o mesmo** tema
     (`repetido: true`): se a rodada cair no meio, recomece daqui sem medo.
   - `tema: null` com `motivo` = pauta vazia ou sem horário: relate e siga para a próxima operação.
   - A resposta traz tudo o que você pode usar:
     - `tema` (`id`, `tema`, `notas` do dono), `horario` e `horarioLocal` (quando o post vai sair), `entrega`;
     - `operacao`: nome, número do clube, nicho, app, agente, link de convite, WhatsApp (já com a mensagem pronta),
       canal de fichas, site e o `aviso` (+18 / jogo responsável no pôquer);
     - `blog`: endereço do blog, autor e categoria padrão, `publicados` (título, slug, **url** e tags dos posts no ar)
       e `outros` (rascunhos, agendados e em revisão);
     - `formato` e `regras` (abaixo, com mais detalhe).
2. **Confira que não repete**: compare o tema com `blog.publicados` e `blog.outros`. Se já existe post parecido, ou
   se não dá para escrever com segurança (falta fato confiável), **pule** (passo 6) e peça o próximo tema.
3. **Pesquise e escreva** (regra de ouro: qualidade antes de quantidade; o Google pune conteúdo feito em série só para
   aparecer na busca). Se o tema não render um post bom, pule.
   - Conhecimento geral do nicho (regras e estratégia de pôquer, termos, conceitos): pode, conferindo números com
     cuidado. Na dúvida, não ponha o número.
   - Qualquer coisa sobre **a operação** (clube, app, fichas, saque, suporte, torneios, horários, prêmios, promoções):
     **só** o que está em `operacao` e nos posts de `blog.publicados`. Nunca invente telas, botões, prazos, bônus,
     garantidos, horários de torneio, prêmios ou regras.
   - Nada copiado de outros sites.
4. **Monte o post** no formato do portal:

   | Campo | Regra |
   |---|---|
   | `title` | até 120 caracteres; ideal até ~70, com a busca alvo no começo |
   | `seoTitle` | até 60 caracteres (o que aparece no Google); se omitido, usa o `title` |
   | `seoDescription` | 120 a 155 caracteres |
   | `excerpt` | resumo direto em 1 a 3 frases (até 300 caracteres) |
   | `content` | corpo, 900 a 1.500 palavras, até 80.000 caracteres (markdown curto, abaixo) |
   | `tags` | 2 a 4 (prefira as que já aparecem em `blog.publicados`) |
   | `category` | opcional (padrão: a categoria da operação) |
   | `slug` | opcional (sai do título); precisa ser único no site |
   | `author` | opcional (padrão: o autor da operação) |
   | `coverUrl` | opcional: imagem `https://...` ou caminho `/assets/...` |

   Markdown aceito no `content`: `## ` e `### ` para seções (títulos que respondem perguntas), listas com `- ` e
   `1. `, `**negrito**`, links `[texto](url)` e parágrafos separados por linha em branco. Sem tabelas, imagens, HTML,
   front matter nem blocos `:::` (o que não é aceito sai como texto).
   - 2 a 4 links internos usando **exatamente** a `url` de posts de `blog.publicados`.
   - Uma seção `## Perguntas frequentes` com 3 a 5 perguntas reais em `### `.
   - Feche com um parágrafo de chamada para a operação usando `operacao.convite` (ou `operacao.whatsapp`, ou
     `operacao.site`), sem promessa.
   - No pôquer (e em toda a edição SX), termine com `operacao.aviso` ou `+18 · Jogue com responsabilidade.`
5. **Entregue**: `POST /api/service/pauta/<operacao>/entregar` com `{ "temaId": "<tema.id>", "title": ..., "content": ..., ... }`.
   - `201` com `post.situacao`:
     - `agendado`: sai sozinho em `post.publicaEm` (se o horário já passou, sai em segundos). O portal avisa o
       IndexNow, atualiza o sitemap e manda ao Bluesky da operação, se estiver ligado.
     - `revisao`: a operação escolheu revisar antes, **ou** o preflight bloqueou o texto (promessa de ganho, bônus,
       ficha grátis, rakeback, menor de idade). Veja `aviso` e `preflight.bloqueios`; não tente contornar.
   - Entregar de novo o mesmo `temaId` devolve o mesmo post (`repetido: true`), sem duplicar.
   - `409` com endereço repetido: mude o `slug` só se o post for de fato diferente; se repete um post, pule o tema.
   - `400`: corrija o campo citado e entregue de novo.
6. **Pular** (quando não der post bom): `POST /api/service/pauta/<operacao>/pular` com
   `{ "temaId": "...", "motivo": "repete o post X" }`. O horário fica livre para o próximo tema (volte ao passo 1).
   Se nenhum tema render e você decidir não publicar neste horário, use `"encerrarHorario": true`: o vigia conta o
   horário como pulado de propósito, com o motivo.
7. **Relatório final** (em português): por operação, o título e a `url` do post, a situação (agendado/revisão) e qualquer
   tema pulado com o motivo. Nada de token no relatório.

## Regras que não se quebram

- Nunca prometa ganho ("ganhe dinheiro", "lucro garantido", "renda extra"); quando falar de dinheiro, lembre limites e
  jogo consciente. Nada de bônus, ficha grátis, rakeback ou cashback. Nada que fale com menor de idade.
- Pôquer e edição SX: o app e os clubes são para maiores de 18 anos; o post termina com o aviso de jogo responsável.
- Um post por chamada de `/proximo`. Não crie posts por outro caminho (painel, MCP) para "adiantar" a pauta.
- Não publique em redes, não mande mensagens e não mexa em site, Git ou servidor: o portal faz a distribuição.
- O que der errado (pauta vazia, portal fora do ar, 401 do token): relate; não tente outra rota.

## Erros comuns

| Resposta | O que fazer |
|---|---|
| `401 Token de serviço inválido.` | Confira o arquivo do token no servidor; não invente outro. Relate. |
| `409 A pauta automática está desligada` | A operação desligou: pule a operação. |
| `409 A operação ainda não tem site` | Relate ao dono da operação. |
| `tema: null` (pauta vazia) | Relate: o dono precisa incluir temas em *Pauta automática*. |
| `409 Já existe um post com o endereço ...` | Tema repetido: pule com o motivo. |
| `404 Tema não encontrado nesta operação` | Use o `temaId` que veio no `/proximo` da **mesma** operação. |

O vigia diário de cada operação (painel → *Vigia diário*) mostra, por horário, se o post saiu, foi pulado, está em
revisão ou não chegou, e se a pauta tem temas suficientes.
