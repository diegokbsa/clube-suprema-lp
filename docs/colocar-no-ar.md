# Colocar a LP no ar (versão convite)

A versão convite não depende de nenhuma integração: pede o e-mail, mostra o link oficial do clube (abre o app já no clube 10001 com o agente 1439098) e leva para comprar fichas no Fichas 24h.

O servidor é Node puro, sem dependências. Qualquer hospedagem que rode `node server.js` serve.

## Como está no ar (desde 23/10/2026)

| Item | Onde |
|---|---|
| Site | https://suprema.blog (o `www` redireciona para a raiz) |
| Endereço do Render | https://clube-suprema-lp.onrender.com |
| Código | repositório privado https://github.com/diegokbsa/clube-suprema-lp (branch `main`) |
| Serviço | Render → Web Service **clube-suprema-lp**, região Virginia, plano **Free**, criado pelo `render.yaml` (Blueprint) |
| Senha do painel | variável `ADMIN_TOKEN`, gerada pelo Render: Render → clube-suprema-lp → **Environment** |
| DNS | GoDaddy → suprema.blog → DNS: registro `A @ → 216.24.57.1` e `CNAME www → suprema.blog` |

- **Publicar uma mudança:** `git add -A`, `git commit -m "..."` e `git push`. O Render reconstrói sozinho em cerca de 1 minuto.
- **Painel:** https://suprema.blog/admin pede a senha (`ADMIN_TOKEN`).
- **Versões para anúncios:** https://suprema.blog/fichas (ficha 3D) e https://suprema.blog/spin (tambor do Spin Suprema), as duas com motion sempre ligado; o lead guarda a rota de entrada.
- **Limites do plano Free:** o serviço dorme após 15 min sem visitas (a primeira visita seguinte demora até 1 min) e a lista de leads zera a cada reinício ou novo deploy. **Por isso cada cadastro também vai para a planilha do Google "Cadastros · Clube Suprema"** (Drive da conta h2odiegokbsa), que é o registro permanente: veja a seção Planilha de cadastros abaixo. Para guardar os leads: cartão na conta Render, plano `0.5c-512mb` e um disco em `/var/data` com `DATA_DIR=/var/data` (o `render.yaml` tem o comentário com o que mudar).
- **Mudar DNS no GoDaddy:** cada alteração pede um código por SMS (proteção total do domínio).

## Medição (configurada em 23/10/2026, conta Google h2odiegokbsa)

| Ferramenta | Identificação | Onde está no site |
|---|---|---|
| Google Tag Manager | conta "Clube Suprema", contêiner suprema.blog, `GTM-N46659WQ` (versão inicial publicada, sem tags) | só no blog (`TRACKING_HEAD` de `lib/blog.js`); saiu da LP em 29/10/2026 por estar vazio (112 KB por visita). Para usar de novo na LP, copie o snippet de lá |
| Google Analytics 4 | conta gamesbigpsn, propriedade "Clube Suprema" (560553417), fluxo web suprema.blog, `G-ZXS59RV8GR` | `config.js` (`tracking.ga4Id`) e `GA4_ID` no `render.yaml` |
| Google Ads | tag `AW-970454313` | `<head>` de `public/index.html` |
| Microsoft Clarity | projeto "Clube Suprema" (`z41gk7muip`), entrada com a conta Google h2odiegokbsa em 26/10/2026 | snippet no `<head>` de `public/index.html` e em `TRACKING_HEAD` de `lib/blog.js` |
| Search Console | duas propriedades: prefixo https://suprema.blog/ (arquivo HTML + GTM) e domínio `sc-domain:suprema.blog` (registro TXT no GoDaddy); `sitemap.xml` e `blog/feed.xml` enviados nas duas | `public/googled0da7d61222a54ee.html` (não apagar), `/sitemap.xml` e `/blog/feed.xml` gerados por `lib/blog.js`, `public/robots.txt` |

Os eventos da página (`lp_view` com `variant`, `signup_start`, `whatsapp_click` etc.) vão para o `dataLayer` e para o `gtag`,
então chegam ao GA4 e ao Google Ads (e ao GTM, se ele voltar para a LP). Para conferir: GA4 → Relatórios → Tempo real.
Atenção: o Brave bloqueia os envios do Analytics por padrão; teste em outro navegador ou com os escudos desligados.

### Microsoft Clarity (gravações e mapas de calor)

- Painel: https://clarity.microsoft.com, projeto **Clube Suprema** (`z41gk7muip`). A mesma conta tem também o projeto Batalha Esportiva; confira o nome no topo antes de olhar os dados.
- Na LP o script carrega já no `<head>`, sem esperar a página terminar, para gravar também quem sai em 2 ou 3 segundos (o caso dos anúncios).
- Já o Google tag da LP (Google Ads + GA4) espera o primeiro toque/rolagem ou 3 s depois da página carregar, desde 31/10/2026: no topo ele derrubava a LP para 69 no PageSpeed celular. Quem sai antes disso sem tocar na tela não entra no GA4 (o Clarity ainda grava).
- No blog (`TRACKING_HEAD` de `lib/blog.js`), Clarity, Google tag (Ads + GA4) e GTM entram no primeiro toque/rolagem ou 3 s depois da página carregar. Em 28/10/2026 isso levou o post do Fichas 24h de 55 para 93 no PageSpeed celular (LCP de 7,3 s para 1,4 s). Quem sai do blog antes disso sem tocar na tela não é contado.
- Cada `track()` do `public/app.js` vira um evento personalizado do Clarity (`lp_view`, `signup_start`, `signup_complete`, `whatsapp_click`, `app_download_click` etc.), e a tag `variante` (`padrao`, `fichas`, `spin`) diz qual versão da LP o visitante viu. Use os dois em Filtros → Eventos personalizados / Tags e para montar funis.
- Para ver só quem veio de anúncio: Filtros → Tráfego → Fonte/Campanha (o Clarity lê as UTMs da URL), ou Referenciador. Depois, Gravações para assistir as sessões curtas e Mapas de calor → Rolagem para ver até onde as pessoas descem.
- Privacidade: o mascaramento padrão (Equilibrado, conferido em Configurações → Mascarando) esconde o que é digitado nos campos. Os textos com o e-mail do jogador e o QR Code do PIX também têm `data-clarity-mask="True"`. Ao criar telas novas que mostrem dados pessoais, ponha o mesmo atributo.
- Os dados aparecem no painel em até 2 horas depois das primeiras visitas.

### GEO: buscadores de IA e Bing

- **Resposta rápida:** cada post tem `resumo:` no cabeçalho do .md. Ele aparece no topo da página, vai como `abstract` nos dados estruturados e entra no `/llms.txt`. Ao escrever post novo, preencha o `resumo` com 2 ou 3 frases que respondem a pergunta principal, com o ID 10001.
- **Tutoriais:** `passosTitulo:` e `passos:` (lista) viram dados estruturados HowTo.
- **Entidades:** a Organization do clube traz o ID 10001 e `memberOf` SX Poker e Liga Suprema; os posts trazem `about` (app Suprema Poker) e `mentions` (SX e Liga) quando o texto fala deles. A página `/sobre` (content/sobre.md) explica quem somos e como produzimos o conteúdo; ao revisá-la, mude `ABOUT_UPDATED` em lib/blog.js.
- **Robôs:** `public/robots.txt` libera Google, Bing e os robôs de IA (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot, Google-Extended, Applebot, Meta, Amazon, DuckAssist, Mistral, Common Crawl) e bloqueia só `/admin` e `/api/`.
- **IndexNow (Bing, que alimenta a busca do ChatGPT e do Copilot):** desde 30/10/2026 é automático: 1 min depois de cada deploy no Render o servidor avisa os posts com data ou atualização nos últimos 3 dias, mais /blog (`lib/novos-posts.js`, log `[novos-posts]`). Para mandar outras páginas na mão: `node tools/indexnow.mjs` (todas as URLs do sitemap) ou passe só as páginas. A chave pública fica em `public/<chave>.txt`; não apague.
- **Bing Webmaster Tools:** configurado em 26/10/2026 na conta Google h2odiegokbsa, importando as duas propriedades do Search Console (o Bing tem acesso só de leitura ao Search Console). Sitemap enviado e as 14 URLs mandadas em URL Submission (cota de 100 por dia). Os relatórios, incluindo o de desempenho em IA (Copilot), começam a aparecer em até 48 h em https://www.bing.com/webmasters.

### Planilha de cadastros

- Cada e-mail novo do formulário vira uma linha na planilha **Cadastros · Clube Suprema** (Google Drive da conta h2odiegokbsa), com data/hora de Brasília, e-mail, utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid, fbclid, ref, página de entrada e ID do cadastro.
- Desde 30/10/2026 (versão 2 do script) a linha também traz **Veio de (site)** (google.com, instagram.com…; vazio = acesso direto) e **WhatsApp** (link wa.me, quando o jogador preenche). A página de entrada passa a ser o post do blog por onde a pessoa chegou: o blog e a LP gravam o primeiro contato em `clube.utm` no navegador.
- Os passos de cada lead entram nas colunas **Abriu o link do app**, **Aparelho**, **Clicou em comprar fichas** e **Chamou o suporte** (data da 1ª vez), mesmo depois de um deploy, quando o painel /admin zera.
- **E-mail de boas-vindas:** o script manda a cada cadastro novo (texto em `boasVindas_` no Code.gs), pela API do Gmail só com permissão de envio, com o nome "Clube Suprema", remetente e resposta em `supremaclubxx@gmail.com`. Liga e desliga em Apps Script → Configurações do projeto → Propriedades do script → `BOAS_VINDAS` = `sim` (sem nova implantação). Só ligue depois que `supremaclubxx@gmail.com` estiver confirmado em Gmail (h2odiegokbsa) → Configurações → Contas → "Enviar e-mail como"; antes disso o Gmail troca o remetente pelo h2odiegokbsa. `testeBoasVindas` manda um exemplo para a caixa do supremaclubxx; `enviarPendentes` manda para quem se cadastrou nos últimos 3 dias e ainda não recebeu. A coluna **Boas-vindas enviado** mostra a data ou o erro.
- **Sequência de 7 e-mails** (dia 1 a 7 depois do cadastro, 1 por dia): entrar no clube, fichas por PIX, tour pelo app, formatos, Spin, PC, suporte e Telegram. Textos em `SEQUENCIA` no Code.gs, mesmo visual das boas-vindas (preto e dourado, capa do post do blog). Roda pelo acionador diário `enviarSequencia` (Apps Script → Acionadores, contador de dias, 18h–19h) e só com a propriedade `SEQUENCIA` = `sim`. Entra quem recebeu as boas-vindas; a coluna **Sequência (e-mails)** guarda quantos já foram. O link "Sair da lista" do rodapé (e o cabeçalho List-Unsubscribe) abre o app da Web com `?sair=<ID>`, marca **Saiu da lista** e para a sequência. `testeSequencia` manda os 8 e-mails para a caixa do supremaclubxx com "[Prévia]" no assunto.
- Aba **Telegram**: posts que o site já mandou ao canal (evita repetir depois de um novo deploy).
- **E-mail semanal de novidades** (desde 30/10/2026, versão 6 do script): depois de cada deploy o site anota os posts novos na aba **Posts** (título, resumo, capa). Todo domingo, entre 18h e 19h, o acionador `enviarNovidades` manda os posts registrados desde o último envio (até 6) para quem recebeu as boas-vindas, não saiu da lista e já terminou a sequência de 7 dias. Liga com a propriedade `NOVIDADES` = `sim`; `NOVIDADES_DESDE` guarda a data do último envio. `testeNovidades` manda uma prévia com os posts dos últimos 7 dias para a caixa do supremaclubxx.
- Quem grava é o projeto Apps Script **Cadastros Clube Suprema**, ligado à planilha e publicado como app da Web (executa como h2odiegokbsa, acesso "qualquer pessoa", limitado a esta planilha por `@OnlyCurrentDoc`). O código está em `tools/planilha/Code.gs`.
- O site envia pelo `lib/sheets.js` logo depois de salvar no banco, em segundo plano e com até 2 novas tentativas; a URL do app fica em `config.js` (`sheets.webhookUrl`, ou a variável `SHEETS_WEBHOOK_URL`). Falhas aparecem nos logs do Render como `[planilha]`.
- Para trocar o código do script: editar em Extensões → Apps Script, salvar e em Implantar → Gerenciar implantações → editar → Nova versão (a URL continua a mesma).
- A linha `teste@suprema.blog` e as de `teste-local@`/`teste-producao@` com origem "TESTE" são de teste e podem ser apagadas.

### Canal do Telegram (t.me/clubsupremapokerxx, "Club Suprema Poker APP Download")

- Post novo do blog vai sozinho para o canal: 1 min depois do deploy, o servidor manda capa, título, resumo e link (com `utm_source=telegram`) de cada post com data nos últimos 3 dias que ainda não está na aba Telegram da planilha.
- Para ligar (uma vez): no Telegram, falar com o @BotFather → `/newbot` → nome "Clube Suprema" e um usuário terminado em `bot` → copiar o token. No canal: Gerenciar canal → Administradores → Adicionar administrador → buscar o bot → deixar "Publicar mensagens". No Render: Environment → `TELEGRAM_BOT_TOKEN` = token → Save (faz um deploy). `TELEGRAM_CHAT_ID` é opcional (padrão `@clubsupremapokerxx`, tirado de `config.links.telegram`).
- O resultado de cada envio fica na aba **Telegram** da planilha, coluna **Situação**: "enviado" ou "falhou: <motivo do Telegram>". Post que falhou é tentado de novo a cada 30 min e a cada deploy. "bot is not a member of the channel chat" = o bot ainda não é administrador do canal. Os erros também aparecem nos logs do Render como `[novos-posts]`.
- O link do canal fica no rodapé da LP e do blog, no convite do fim de cada post e no e-mail de boas-vindas.

### Robô do Telegram nos grupos (lib/telegram-bot.js, desde 31/10/2026)

- O mesmo bot do canal responde a mensagens (long polling, só no Render): `/torneios` (os maiores do dia que ainda vão começar, com o link da grade), `/clube` (ID, agente, os 3 passos e o suporte) e `/ajuda`. No privado, qualquer mensagem recebe a ajuda, com o botão "Receber no meu grupo" (`t.me/<bot>?startgroup=grade`).
- Qualquer grupo que adicionar o robô recebe a grade todo dia a partir das 9h, junto com o canal e o Bluesky (`shareDailyGrade`). Quem adiciona depois das 9h já recebe a do dia. O admin do grupo pausa com `/pausar` e volta com `/ativar`. A grade do canal leva a linha "Quer esta grade no seu grupo todo dia?" com o link de adicionar.
- Os grupos ficam na aba **Grupos** da planilha (Apps Script v8): Situação = ativo, pausado, saiu ou migrou; Última grade = dia enviado, "enviando <dia>" ou "falhou: <motivo>". Grupo que tirou o robô vira "saiu" sozinho.
- Os links levam `utm_source=telegram` com `utm_medium=grupo` (grupos) ou `bot` (privado), e `utm_campaign=torneios` ou `clube`.
- Ao ligar, o servidor registra os comandos no Telegram, põe o nome de exibição "Torneios Suprema Poker · Clube Suprema" (para aparecer na busca; o @supremaclub_bot não muda) e a descrição do robô (só se estiver vazia no @BotFather).
- `GET /api/robo` mostra se ele está lendo mensagens (o vigia das 22h confere). Se "entraEmGrupos" for false: @BotFather → `/setjoingroups` → Enable.
- Para divulgar: cadastrar o robô e o canal no TGStat e no Telemetrio (login pelo Telegram, é o dono que faz).

### Perfil no Bluesky (bsky.app/profile/supremapoker.bsky.social, "Clube Suprema · Suprema Poker ID 10001")

- Post novo do blog vai sozinho para o perfil, junto com o Telegram (1 min depois do deploy e a cada 30 min): título, resumo, "18+ · Jogue com responsabilidade." e o cartão do link com a capa (link com `utm_source=bluesky`), em português e com as tags poker, supremapoker e pokeronline. Vale para posts com data nos últimos 3 dias.
- Não usa planilha: antes de postar, o servidor lê os últimos 50 posts do próprio perfil e pula o post do blog cujo link já está lá. Por isso, não apague do perfil um post que ainda está na janela de 3 dias, senão ele volta.
- Para ligar (uma vez): criar a conta em bsky.app → Configurações → Privacidade e segurança → Senhas de app → Adicionar senha de app → copiar. No Render: Environment → `BLUESKY_APP_PASSWORD` = a senha de app → Save (faz um deploy). Não use a senha da conta. O usuário vem de `config.links.bluesky`; `BLUESKY_HANDLE` só é preciso para usar outra conta.
- Erros aparecem nos logs do Render como `[novos-posts] Bluesky:`. Um erro no Bluesky não impede o Telegram, e vice-versa.

### Posts e Shorts automáticos (12h, 15h e 18h)

- Tarefa agendada **Post e Short automáticos** no app Claude deste computador (roda com o app aberto; se o PC ou o app estiverem fechados na hora, roda quando abrir). Cada rodada escreve um post a partir da fila `marketing/pauta-blog.md`, gera a capa (`tools/imagens/capa_post.py`), faz o push e publica um Short no canal do YouTube **Suprema Poker Live** pelo celular POCO F5. Regras completas em `marketing/post-automatico.md`.
- Short: roteiro em `marketing/shorts/<id>.json`, vídeo gerado por `tools/imagens/short_post.py` (1080x1920, cenas animadas quadro a quadro pelo Chrome sem janela, voz neural pt-BR) em `data/shorts/`, e publicado por `tools/youtube/postar_short.py` com o app do YouTube no celular (ADB pelo Wi-Fi, mesmo esquema do Liora-Cuts/forge, que posta TikTok pelo mesmo aparelho). Registro em `data/shorts/publicados.json`, prints em `data/shorts/telas/`.
- O celular precisa ficar ligado, no Wi-Fi, desbloqueado sem senha de tela e com o YouTube logado no canal. O YouTube não ganha acesso às fotos: o vídeo é escolhido pelo seletor do Android.
- No YouTube vale a versão segura de `marketing/videos-curtos.md`: sem link do site, ID do clube, PIX, Fichas 24h ou valores em reais.
- **Instagram @supremaclub** (configurado em 30/10/2026 no POCO F5): conta profissional (Empresa, categoria Jogos de azar), nome "Clube Suprema · ID 10001", foto com o "S", bio com ID, grade às 9h, PIX/suporte e 18+, e 2 links na bio (`suprema.blog` e `/torneios`, com `utm_source=instagram&utm_campaign=bio`). Todo Short também sai como Reels por `tools/instagram/postar_reel.py` (mesmo vídeo; a legenda ganha o ID do clube, "link na bio" e 5 hashtags). O Instagram tem acesso só às fotos e vídeos escolhidos (acesso limitado do Android): o script libera cada vídeo novo pelo seletor do Android. A restrição de idade 18+ não aparece nas configurações desta conta.
- **Grade e principais torneios do dia (9h):** tarefa agendada própria, que publica 2 Shorts. `tools/grade/grade_do_dia.py` busca a grade da Liga Suprema na API pública da PokerByte (a mesma de sx-co.com/torneios): sem opção, escolhe os 8 maiores garantidos que ainda vão começar (`data/shorts/grade-<data>.json`); com `--principais`, os Main Events do dia, um por tela (`data/shorts/principais-<data>.json`). Os vídeos mostram horário, nome, modalidade, stack, blinds e late, sem buy-in nem garantido.

- **Vigia (todo dia às 22h)** e **resumo semanal (domingo às 20h)**, tarefas agendadas em modo Auto. `tools/vigia/vigia.py` confere o site, os posts do dia, a pauta, cada vídeo no YouTube e no Instagram, o Telegram, o Bluesky, o celular e o git, grava `data/vigia/<data>.json` e lista as pendências; a tarefa refaz o que dá (vídeo que não saiu, push parado, pauta curta) e avisa o que depende do dono. `tools/vigia/resumo_semanal.py` lê as visualizações dos Shorts (página pública do canal), do Telegram e do Bluesky e grava `marketing/relatorios/semana-<data>.md`; a tarefa soma os cadastros da planilha (só números, sem e-mails) e escreve as conclusões.
- **Voz dos vídeos:** neural pt-BR pelo edge-tts (`pt-BR-AntonioNeural`, mesmo pacote do forge); o roteiro pode trocar com `"voz"`. Sem internet, cai na voz do Windows.
- **Lembrete de quem não abriu o app** (Apps Script v7): 2 dias depois do cadastro, uma vez, para quem tem boas-vindas e nenhuma data em "Abriu o link do app"; sai no lugar do e-mail da sequência daquele dia. Coluna "Lembrete (não abriu o app)". `testeLembrete` manda uma prévia ao supremaclubxx.

### Página /torneios (grade do dia no site)

- https://suprema.blog/torneios mostra todos os torneios do dia de poker (7h às 7h) da Liga Suprema, com buy-in, garantido, stack, blinds, late e o selo "Late aberto"; `lib/torneios.js` busca a mesma API e guarda 10 min em memória. Versão em texto para assistentes de IA: `/torneios.txt` (citada no `llms.txt`).
- Para buscadores e IAs: título com a data, resumo do dia em texto, perguntas e respostas montadas com os dados do dia (FAQPage) e os 10 maiores torneios como `Event` (schema.org). Está no sitemap com a data do dia.
- Todo dia a partir das 9h o servidor (`shareDailyGrade` em `lib/novos-posts.js`) avisa o IndexNow de `/torneios` e `/torneios.txt` e posta os maiores torneios que ainda vão começar no canal do Telegram e no Bluesky, com o link da grade. O Telegram não repete graças à aba Telegram da planilha (`grade-<data>`); o Bluesky confere o próprio perfil.

### Search Console

- **Propriedade de domínio** `sc-domain:suprema.blog`: verificada pelo registro `TXT @ google-site-verification=r2zThPfQZwvwT8QjKLCvFZXuCv0WkqELxz-28j9gFDs` no DNS do GoDaddy. Não apague esse registro: ele cobre www, http e qualquer subdomínio futuro.
- **Propriedade de prefixo** `https://suprema.blog/`: verificada pelo arquivo `public/googled0da7d61222a54ee.html` (o GTM também verificava, mas saiu da página inicial em 29/10/2026; o arquivo basta). Pode ser removida no futuro sem perda, mas hoje é ela que o Rich Results Test e a Inspeção de URL abrem por padrão.
- **Sitemaps** enviados nas duas propriedades: `https://suprema.blog/sitemap.xml` (8 páginas, com imagens) e `https://suprema.blog/blog/feed.xml` (RSS, ajuda a descobrir post novo mais rápido). Os dois são gerados pelo servidor; publicar um post novo já os atualiza.
- **Indexação pedida** em 23/10/2026 para a home, /blog e os 6 posts (Inspeção de URL → Solicitar indexação). A cota é de cerca de 10 pedidos por dia por propriedade; use para post novo ou página alterada.
- **GA4 vinculado** à propriedade de domínio (GA4 → Admin → Vinculações do Search Console). Os relatórios "Consultas" e "Páginas de destino" do GA4 aparecem em até 48 h.
- **Rich Results Test** (search.google.com/test/rich-results): os posts mostram "Artigos", "Indicadores de localização atual" e "Organização". A home mostra "Organização". O que **não** aparece e é normal: FAQPage (o Google só exibe FAQ de sites de governo e saúde desde 2023, mas o bloco continua válido e útil para IA), WebSite (não é rich result) e Organization sem `contactPoint` (a ferramenta ignora; por isso o bloco da home tem o mesmo contato do blog). Para ver todos os blocos de uma página, use o validador do schema.org: https://validator.schema.org/#url=https%3A%2F%2Fsuprema.blog%2F

## Testar de graça

### Opção A: túnel da Cloudflare (sem conta, em 2 minutos)

Deixa a LP que está rodando no seu PC acessível pela internet, com um endereço `https://….trycloudflare.com`. Bom para testar no celular (inclusive o link do clube) e mostrar para outras pessoas.

1. Instale o `cloudflared` (programa oficial da Cloudflare):

```bash
winget install --id Cloudflare.cloudflared
```

2. Com a LP rodando (`node server.js`), abra outro terminal e rode:

```bash
cloudflared tunnel --url http://localhost:3000
```

3. Ele mostra um endereço `https://algo-aleatorio.trycloudflare.com`. É só abrir no celular.

Limites: só funciona enquanto o PC estiver ligado e o comando rodando; o endereço muda a cada vez; a Cloudflare trata como ferramenta de teste. Os leads ficam no seu PC e o painel abre em `http://localhost:3000/admin` (pelo endereço do túnel ele pede a senha `ADMIN_TOKEN`).

### Opção B: Render, plano Free (fica no ar sem o PC)

Precisa do código num repositório do GitHub. No Render: **New → Web Service**, escolha o repositório, comando de start `node server.js`, plano **Free**, e as variáveis `ADMIN_TOKEN`.

Limites do plano Free: o serviço "dorme" depois de 15 minutos sem visitas e a primeira visita depois disso demora cerca de 1 minuto; ao dormir ou atualizar, o que foi gravado no disco se perde (a lista de leads zera). Serve para testar, não para rodar anúncios.

Em 27/10/2026, com o site dormindo, a primeira visita levou 22,8 s para começar a carregar (0,25 s acordado), e quem chega do anúncio desiste na tela branca. Para evitar isso o `server.js` visita o próprio endereço público (`RENDER_EXTERNAL_URL`, posto pelo Render) em `/healthz` a cada 10 minutos. Ligado o tempo todo, o serviço gasta cerca de 744 das 750 horas grátis por mês do workspace; se houver outro serviço free no mesmo workspace, as horas acabam antes do fim do mês. O plano pago (sem sono) continua sendo o jeito garantido.

## Railway (para valer, pago)

1. Crie uma conta em https://railway.app.
2. Instale a ferramenta e entre na sua conta:

```bash
npm i -g @railway/cli
```

```bash
railway login
```

3. Na pasta do projeto, crie o projeto e suba:

```bash
railway init
```

```bash
railway up
```

4. No painel do Railway, em **Variables**, adicione:

| Variável | Valor |
|---|---|
| `ADMIN_TOKEN` | uma senha forte (é a senha do painel `/admin`) |
| `DATA_DIR` | `/data` |
| `GA4_ID` | o ID do Google Analytics (opcional) |
| `META_PIXEL_ID` | o ID do Pixel da Meta (opcional) |

5. Em **Volumes**, crie um volume montado em `/data`. Sem ele, a lista de leads apaga a cada nova versão.
6. Em **Settings → Networking**, gere um domínio ou ligue o seu (ex.: `jogue.seudominio.com.br`). O HTTPS é automático.

A pasta `data/` do seu PC (com os testes) não deve subir. Se o Railway enviar mesmo assim, apague `data/db.json` antes do `railway up`.

## Outras opções

- **Render**: novo *Web Service*, comando de start `node server.js`, mesmas variáveis. Para guardar os leads precisa de *Persistent Disk* (plano pago) montado em `/data`.
- **VPS** (Hostinger, DigitalOcean etc.): Node 20+, rodar com `pm2 start server.js`, Nginx na frente com HTTPS (Certbot).

## Antes de divulgar

- [ ] Testar o link do clube num **Android** e num **iPhone**, com e sem o app instalado.
- [ ] Publicar **termos de uso** e **política de privacidade** (a página coleta e-mail: LGPD) e ligar os links no texto do aceite.
- [ ] Definir `ADMIN_TOKEN` e abrir `/admin` no domínio para conferir que pede a senha.
- [ ] Colocar os IDs do GA4 e do Pixel.
- [ ] Usar links com origem nos anúncios, ex.: `https://seudominio.com.br/?utm_source=instagram&utm_campaign=lancamento`. O link `/#cadastro` abre direto no passo do e-mail.

## Link único do app

`https://seudominio/baixar` é o link para divulgar onde precisar só do download (bio do Instagram, grupos, QR impresso). Ele manda cada aparelho para o lugar certo:

| Aparelho | Destino |
|---|---|
| Android e iPhone | link oficial do clube (abre o app, ou a loja, já com clube e agente) |
| Windows | download para Windows |
| Mac e outros | site oficial da Suprema |

Na LP, o botão e o QR usam esse mesmo link, com o código do lead para o painel mostrar em qual aparelho cada um baixou. O QR só funciona com a LP no ar (túnel ou domínio): no `localhost` o celular não consegue abrir.

## Se o link do clube parar de funcionar

O link tem a data de criação embutida. Se um dia ele não abrir mais o clube, gere um novo no app e troque em `config.js`, no campo `clubInvite`. Depois rode `railway up` de novo.

## Quando a camada real estiver pronta

Troque a variável `FLOW` para `completo` (e `SUPREMA_MODE=real`, `F24H_MODE=real`). A mesma LP passa a criar as contas e mostrar o PIX na própria página.
