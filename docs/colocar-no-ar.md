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
- **Limites do plano Free:** o serviço dorme após 15 min sem visitas (a primeira visita seguinte demora até 1 min) e a lista de leads zera a cada reinício ou novo deploy. Para guardar os leads: cartão na conta Render, plano `0.5c-512mb` e um disco em `/var/data` com `DATA_DIR=/var/data` (o `render.yaml` tem o comentário com o que mudar).
- **Mudar DNS no GoDaddy:** cada alteração pede um código por SMS (proteção total do domínio).

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
