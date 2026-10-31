# Rotina de posts e Shorts automáticos

Roda 3 vezes por dia (12h, 15h e 18h, horário de Brasília) pela tarefa agendada "Post e Short automáticos" do app
Claude (neste computador). Cada rodada faz **um post novo no blog** e **um Short no YouTube** (canal Suprema Poker Live,
pelo celular POCO F5). O resto sai sozinho a partir do push: o Render publica o site, o IndexNow avisa o Bing, o post vai
ao canal do Telegram e ao Bluesky (`lib/novos-posts.js`) e entra no e-mail semanal de novidades (`tools/planilha/Code.gs`).

## Regra de ouro: qualidade antes de quantidade

O Google pune sites que publicam muitas páginas feitas em série só para aparecer na busca ("scaled content abuse").
Cada post precisa responder de verdade a uma busca, com conteúdo melhor que o dos concorrentes. Se o tema da vez
não render um post bom, ou faltar fato confiável, **não publique post**: marque o tema como pulado e faça só o Short.

## Passo a passo de cada rodada

1. `git pull --ff-only`. Se a árvore tiver mudanças de outra pessoa, não mexa nelas: só adicione os seus arquivos.
2. **Tema**: o primeiro `- [ ]` de `marketing/pauta-blog.md`. Confira com `ls content/blog` e os títulos que não há
   post parecido. Se repetir ou não der para escrever com segurança, marque `- [-] AAAA-MM-DD motivo` e pegue o próximo.
3. **Pesquisa e fatos**:
   - Teoria de poker (regras, estratégia, termos): pode usar conhecimento geral, conferindo números (probabilidades,
     contas) com cuidado. Na dúvida, não ponha o número.
   - Qualquer coisa sobre o app Suprema Poker, o Clube Suprema, fichas, Fichas 24h, saque, suporte ou torneios: **só o que
     já está escrito nos posts publicados**, em `content/sobre.md` e em `config.js`. Nunca invente telas, botões, prazos,
     bônus, promoções, garantidos, horários de torneio, prêmios ou regras do clube.
   - Nada de copiar texto de outros sites.
4. **Escreva** `content/blog/<slug>.md` no mesmo formato dos posts existentes (leia dois deles antes, por exemplo
   `formatos-de-torneio-poker-online.md` e `fichas-24-horas-suprema-poker-pix.md`):
   - Front matter: `title` (até ~70 caracteres, com a busca alvo), `description` (140 a 200 caracteres), `date` e `updated`
     com a data de hoje em Brasília, `cover: /img/blog/<slug>/cover.jpg`, `coverAlt`, `tags` (2 a 4, das que já existem),
     `resumo` (resposta direta em 3 a 5 frases), `passosTitulo` e `passos` quando houver passo a passo, `faq` com 3 a 5
     perguntas reais, e os campos da capa: `capaTema` (cartas, mesa, app, clube, suporte ou torneio), `capaChamada`
     (ex.: "Guia · Regras"), `capaTitulo` (curto), `capaSubtitulo` (uma frase), `capaSelo` (ex.: "Para iniciantes") e
     `capaEtiqueta` (pílula da ilustração, temas cartas e mesa).
   - Corpo: 900 a 1.500 palavras, português do Brasil, frases curtas, seções `##` com títulos que respondem perguntas,
     exemplos concretos, tabela quando ajudar, um bloco `:::nota` com a resposta curta, 2 a 4 links internos para posts
     existentes e um bloco `:::cta` levando ao Clube Suprema (`/baixar` ou `/blog/como-entrar-no-clube-suprema`).
   - Sempre: nada de promessa de ganho ("ganhe dinheiro", "lucro garantido"); quando falar de dinheiro, lembre limites
     e jogo consciente; o app e os clubes são para maiores de 18 anos.
5. **Capa**: `python tools/imagens/capa_post.py <slug>`. Abra `public/img/blog/<slug>/cover.jpg` e confira se o texto
   coube (até 3 linhas no título). Se não, encurte `capaTitulo`/`capaSubtitulo` e gere de novo.
6. **Confira o post**: `node -e "import('./lib/blog.js').then(m=>{const p=m.getPost('<slug>');if(!p)process.exit(1);console.log(p.title,p.words,p.faq.length)})"`.
7. **Short** (`marketing/shorts/<id>.json`): em geral do próprio post (`id` = slug). Se o post for de dinheiro (saque,
   fichas, PIX), faça o Short de um post antigo que ainda não tem arquivo em `marketing/shorts/`. Formato: ver
   `marketing/shorts/como-baixar-suprema-poker.json`. Regras do YouTube (`marketing/videos-curtos.md`):
   - **Pode**: regras e dicas de poker, como usar o app (baixar, entrar num clube, lobby, formatos, Spin).
   - **Não pode** (nem na tela, nem na fala, nem na descrição): link para o site, ID do clube ou do agente, PIX, saque,
     Fichas 24h, valores ou prêmios em reais, "ganhe dinheiro", promessa de ganho.
   - 5 a 7 cenas, até ~50 s no total. 1ª cena = gancho forte em até 8 palavras; cenas do meio com `passo` quando for
     passo a passo; última cena "Segue o canal" chamando o próximo tema. `tela` curta (até ~10 palavras, destaques entre
     `**`), `fala` natural (a voz lê exatamente a fala). `imagem` opcional: `public/img/app-mesa.webp`,
     `public/img/app-abertura.webp` ou imagens do post sem valores em reais.
   - `titulo` até 90 caracteres terminando em ` #shorts`; `descricao` com 2 ou 3 linhas, "18+ · Jogue com
     responsabilidade." e 3 a 5 hashtags (#poker #pokeronline #texasholdem #supremapoker...); `tipo` (ex.: "Regras do
     poker", "Dica rápida", "Tutorial · App").
   - Gere: `python tools/imagens/short_post.py marketing/shorts/<id>.json` e confira `data/shorts/<id>.jpg`.
8. **Publique o site**: marque o tema na pauta como `- [x] AAAA-MM-DD`, depois
   `git add content/blog/<slug>.md public/img/blog/<slug> marketing/shorts/<id>.json marketing/pauta-blog.md`,
   commit "Blog: <título curto> (post automático)" com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
   e `git push`. Se o push for recusado: `git pull --rebase` e push de novo; se der conflito, pare e relate.
9. **Publique o Short** pelo celular, com o Python do forge (Liora-Cuts), que tem o uiautomator2:
   `& "C:\Users\Administrator\Documents\Codex\2026-10-16\vej\outputs\chile-football-viral-cl\forge\.venv\Scripts\python.exe" tools\youtube\postar_short.py marketing\shorts\<id>.json`
   Se falhar, veja o print em `data/shorts/telas/` e tente uma vez de novo. Celular desconectado ou bloqueado: relate e
   siga (o Short fica pronto para a próxima rodada; antes de fazer outro, publique os que ficaram para trás, conferindo
   `data/shorts/publicados.json`).
10. **Confira o site** uns 3 minutos depois do push: `curl -s -o /dev/null -w "%{http_code}" https://suprema.blog/blog/<slug>` = 200.
11. **Relatório final** (em português): título e link do post, se o Short saiu, e qualquer falha.

## Grade de torneios em vídeo

Ainda sem fonte: falta definir de onde vem a grade do dia (print do lobby, imagem oficial da Suprema...). Até lá a
rotina não faz vídeo de grade, para não inventar horários nem garantidos. No YouTube a grade não pode mostrar valores
em reais.
