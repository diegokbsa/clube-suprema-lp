# Pedido aos devs: cadastro integrado da LP (Clube 10001 · agente 1439098)

**Contexto:** temos uma LP onde o jogador se cadastra só com e-mail e senha. Nosso servidor cria a conta na Suprema e, no primeiro depósito, cria a conta no Fichas 24h e mostra o PIX na própria página. No fim, o jogador abre o app pelo link oficial do clube. Não precisamos de API nova: precisamos do formato das chamadas que o app e o site já usam, e da liberação para usar a partir do nosso servidor.

## Suprema (app)

1. **Criar conta:** endereço, método, cabeçalhos exigidos (versão do app, assinatura, token), campos obrigatórios e regras (e-mail, senha, apelido). Resposta de sucesso (ID do jogador) e erros possíveis (e-mail já cadastrado, apelido em uso, senha inválida).
2. **Confirmação de e-mail:** como o código é enviado, como validar e como reenviar. Cadastros vindos de parceiro podem dispensar essa etapa?
3. **Conta existente:** como conferir um ID de jogador para vincular quem já tem conta.
4. **Link de convite do clube (OneLink):** o link com `deep_link_value` expira? Dá para ter um link fixo do agente 1439098 no clube 10001? Funciona como *deferred deep link* (instala pela loja e cai no clube ao abrir), inclusive no iPhone? Hoje, aberto no **computador**, o link manda para a **App Store** (iPhone): dá para configurar no AppsFlyer o redirecionamento de desktop para a página de download (Windows/Mac)?
5. **Limites:** existe captcha, SMS ou limite de cadastros por IP? Precisamos do **IP do nosso servidor liberado**.
6. **Ambiente de teste** (staging) ou contas de teste.

## Fichas 24h (Sayplus) · apis.fichas24horas.com.br

1. **Cadastro** (`/users_app/register`): campos obrigatórios (CPF, e-mail, celular, nascimento, senha, nome?), se tem confirmação de e-mail e como obter o token de sessão.
2. **Vincular conta** (`/user_plataforms_accounts`): campos para plataforma Suprema (id 10), ID do jogador, clube 10001 e agente 1439098.
3. **Validação de conta / KYC** (`/start-validation`, `/finish-validation`): é obrigatória antes do primeiro depósito? O que pede (documento, selfie)?
4. **Gerar PIX** (`/paymentQRCode`): campos, resposta (copia e cola, identificador, expiração), valor mínimo e máximo.
5. **Confirmação do pagamento:** existe webhook de pagamento e de fichas creditadas, ou devemos consultar `/users_app/me/transactions`?
6. **Sessão** (`/login/refresh-from-cookie`): validade do token e como renovar sem pedir a senha de novo.
7. **Antifraude:** liberar o IP do nosso servidor no Fichas 24h e na Asaas (vários cadastros saindo do mesmo IP).
8. **OK formal da Sayplus** para esse uso (os termos atuais falam de engenharia reversa).

## Dados pessoais (LGPD)

- CPF, celular e nascimento passam pelo nosso servidor a caminho do Fichas 24h; a senha não é guardada. Precisamos de um acordo de tratamento de dados entre as empresas e de saber qual razão social aparece nos termos da LP.
