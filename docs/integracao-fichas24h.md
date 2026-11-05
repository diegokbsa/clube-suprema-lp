# Fichas 24h: dá para unificar com o suprema.blog? (análise de 05/11/2026)

Pergunta do dono: integrar a compra de fichas ao nosso site de forma transparente, sem o jogador perceber dois cadastros
(embutido no site ou cadastro único).

## O que o Fichas 24h é por dentro

- **App:** app.fichas24horas.com.br é um app **Flutter web** (`main.dart.js`, 4,8 MB) atrás da Cloudflare.
- **Servidores:** fala com `https://apis.fichas24horas.com.br` e usa login do **Supabase** (senha ou PKCE).
- **Empresas:** é da **Sayplus Technology**; os pagamentos e as contas são da **Asaas** (instituição de pagamento).
- **Rotas do app:** `/` (login), `/signup`, `/singup-complete-data`, `/home`, `/accounts`, `/paymentQRCode`,
  `/transactions`, `/rd` (redirecionamento) e as páginas de termos.
- **Cadastro** (`POST /users_app/register`): nome, nascimento, **CPF** (`inscription`), celular, e-mail, senha e confirmação
  da senha. Depois vem a **verificação de e-mail** por código.
- **Vincular a conta da Suprema** (`POST /user_plataforms_accounts`): `id_club`, `player_id` e `description`. A plataforma
  Suprema Poker é a de id 10.
- **Validação da conta vinculada:** sem ela aparece "Conta não verificada! Por esse motivo não pode ser usada em
  transações no app".
  1. `start-validation`: o Fichas 24h **manda umas fichas para a conta do jogador na Suprema** (pela "SX GRUPO API").
  2. `finish-validation`: o jogador **digita o valor que recebeu** (`{ value }`).
- **Depósito:** escolher a conta vinculada e o valor; o app gera o QR Code PIX (`/paymentQRCode`).
- **Análise da Asaas:** "solicitar documentos; aplicar critérios internos de risco; aprovar, reprovar ou revogar o
  acesso". Pode pedir documento a alguns jogadores.
- **Listas públicas:** `/platforms/public/list` responde sem login (`[{"id":10,"name":"Suprema Poker"}]`).
- **Sem atalhos:** não achei no código nenhum parâmetro de link para pré-preencher clube, agente ou indicação, nem
  login de parceiro.

## As alternativas

### 1. Embutir o app do Fichas 24h numa página nossa (iframe)

**Funciona hoje.** O app não manda cabeçalho que proíba ser embutido (sem X-Frame-Options ou CSP). Testado dentro de
uma página do suprema.blog: a tela de login abre, mas demora uns 15 s (`data/teste-fichas24h-embutido.jpg`).

- **A favor:**
  - nada de integração;
  - nenhum dado do jogador passa pelo nosso servidor.
- **Contra:**
  - **Não unifica nada:** o jogador faz o cadastro inteiro do Fichas 24h (CPF, nascimento, celular, e-mail, senha,
    código por e-mail, vínculo do ID da Suprema e validação por fichas), só que dentro da nossa moldura.
  - O visual é o do Fichas (azul), o app é pesado no celular e o Brave e o Safari bloqueiam o cookie de login dentro de
    iframe, então o jogador pode ter de entrar de novo a cada visita.
  - Precisa do OK da Sayplus para usar a marca e o app dentro do nosso site.

### 2. Cadastro único pelo nosso servidor (já está desenhado no projeto)

O jogador preenche **uma vez só**, no nosso site: e-mail, senha, CPF, nascimento e celular. O nosso servidor
(`lib/orchestrator.js`):

1. cria a conta na Suprema;
2. cria a conta no Fichas 24h **com o mesmo e-mail e a mesma senha**;
3. vincula o ID da Suprema (clube 10001, agente 1439098);
4. gera o PIX, que aparece na nossa página.

Se um dia ele abrir o app do Fichas 24h, entra com o mesmo e-mail e senha: para ele é uma conta só.

O fluxo, as telas e um modo de teste (simulado) já existem. Falta o adaptador real (`adapters/fichas24h.real.js` e
`adapters/suprema.real.js`, hoje só com o esqueleto). Falta também acrescentar ao orquestrador dois passos que o
Fichas 24h exige e que ainda não estão nele:

- **Código de verificação de e-mail do Fichas 24h:** pedir o código na nossa página, como já fazemos com o da Suprema.
- **Validação por fichas:** "abra o app da Suprema, veja quantas fichas chegaram e digite aqui". Como somos o agente do
  clube 10001, talvez dê para ler esse valor no painel do clube e completar sem o jogador; precisa conferir se o painel
  mostra essa transferência.

O que trava a versão real:

- **Autorização formal da Sayplus** (os termos falam de engenharia reversa) e **liberação do IP do nosso servidor** no
  Fichas 24h e na Asaas, porque vários cadastros saem do mesmo IP.
- **Acordo de tratamento de dados (LGPD):** CPF, celular e nascimento passam pelo nosso servidor.
- **Formato exato das chamadas e das respostas:** já estão listados em `docs/pedido-devs.md`.
- **Documentos para a Asaas:** alguns jogadores vão ter de mandar documento direto para a Asaas, e isso não dá para
  esconder.

### 3. Parceria oficial com o Fichas 24h (o melhor para o jogador, depende deles)

Pedir à Sayplus um dos três:

- **(a) Link de cadastro de parceiro:** já vem com plataforma Suprema, clube 10001 e agente 1439098 preenchidos e
  devolve o jogador ao suprema.blog no fim.
- **(b) Login de parceiro:** o Fichas 24h já usa Supabase com PKCE, então um "entrar com o Clube Suprema" é viável do
  lado deles.
- **(c) Aviso de PIX pago (webhook):** para a nossa página mostrar "fichas na conta" sozinha.

Com (a) e (c), o jogador nunca digita clube nem agente e volta para o nosso site já com fichas.

## Recomendação

1. **Agora:** mandar à Sayplus o pedido de `docs/pedido-devs.md`, com os três itens da alternativa 3 junto. É o mesmo
   contato e destrava as duas alternativas.
2. **Com o OK deles:** ligar a alternativa 2, que já está quase pronta no código. É a única que dá "um cadastro só" de
   verdade.
3. **Não** embutir o app (alternativa 1) como solução: ela não reduz nenhum passo e piora o celular. Fica só como plano
   B se a Sayplus negar a integração e liberar o uso da marca.

## Jornada única implementada (05/11/2026)

Feita a alternativa 2, com a conta da Suprema criada pelo próprio jogador no app, aberto pelo link oficial do clube
(`config.links.clubInvite`, o OneLink com clube 10001 e agente 1439098):

1. **Cadastro** no suprema.blog: e-mail e senha ("um acesso só": a mesma senha vale no app e nas fichas).
2. **Entrar no clube:** botão "Abrir o app no Clube Suprema" (`/baixar` leva o celular ao OneLink; no computador
   aparece o QR do mesmo convite). O jogador cria a conta no app com o mesmo e-mail e senha e cola o ID de jogador.
3. **Fichas:** nome completo, CPF, celular e nascimento, uma vez só. O servidor:
   - cria a conta no Fichas 24h com o mesmo e-mail e senha;
   - pede na própria página o código que o Fichas 24h mandou por e-mail;
   - vincula o ID ao clube;
   - inicia a validação e pede, na página, o valor das fichas que chegaram no app.
4. **PIX** na nossa página, confirmação sozinha e "Fichas na conta" com o botão para abrir o app no clube.

**Arquivos:**
- `adapters/suprema.app.js`;
- `adapters/fichas24h.real.js`, com as chamadas reais e os pontos marcados CONFERIR;
- `adapters/fichas24h.mock.js`;
- `lib/orchestrator.js`, com as etapas `f24h_email` e `f24h_validacao`;
- as rotas `/api/signup/:id/f24h-code`, `/f24h-resend` e `/validation` em `server.js`;
- as telas `#need-club`, `#need-f24h-code` e `#need-chips` em `public/index.html` e `public/app.js`.

**Testado de ponta a ponta em modo simulado** (prévia `lp-jornada-teste` em `.claude/launch.json`: `FLOW=completo`,
`SUPREMA_MODE=app`, `F24H_MODE=mock`): as 6 etapas ficam "ok", o valor errado é recusado e o PIX credita.

**Para ligar no site (no Render, variáveis de ambiente), só depois do OK formal da Sayplus e do IP liberado:**
`FLOW=completo`, `SUPREMA_MODE=app`, `F24H_MODE=real` e, se a busca automática falhar, `F24H_CLUB_ID` (id interno do
clube 10001 no Fichas 24h) e `F24H_ITEM_ID` (item de fichas do auto-atendimento).

**Antes de abrir ao público:** fazer um cadastro real de ponta a ponta com um jogador de verdade e acertar os pontos
CONFERIR do adaptador:
- formato do nascimento;
- texto de "já cadastrado";
- campos do PIX e status das transações.

## Teste real de 05/11/2026 (conta do dono)

- **O que passou:** cadastro no site, entrada no clube e ID 1822635 informado. A conta da Suprema já estava no clube,
  que aparece no app como "SX | XX POKER".
- **Onde parou:** no `POST /users_app/register` saindo do nosso servidor, o Fichas 24h respondeu **403 do firewall**
  (resposta em texto, não JSON) nas 3 tentativas. Nada foi criado no Fichas 24h.
- **Conclusão:** a API deles barra chamadas que não vêm do app oficial. Não vamos disfarçar o servidor de navegador
  para passar do bloqueio. Pedir à Sayplus a liberação do IP do servidor (ou um acesso de parceiro) é condição para
  ligar `F24H_MODE=real`.
- **Mais de um ID na mesma conta:** sim. A conta do Fichas 24h aceita vários IDs ("Cadastrar ID"), inclusive o mesmo ID
  em clubes diferentes, cada um com a própria validação.
