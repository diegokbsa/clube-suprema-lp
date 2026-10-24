# LP Clube Suprema

A LP tem duas versões, escolhidas pela variável `FLOW`:

- **`convite` (padrão, pronta para ir ao ar):** pede só o e-mail, mostra o link oficial do clube (abre o app já no clube 10001 com o agente 1439098) e leva para comprar fichas no Fichas 24h. Não depende de nenhuma integração. O painel mostra os leads e quem clicou em cada passo. Como publicar: [docs/colocar-no-ar.md](docs/colocar-no-ar.md).
- **`completo`:** o cadastro único descrito abaixo. Depende da camada real; o que pedir aos devs está em [docs/pedido-devs.md](docs/pedido-devs.md).

Para rodar a versão completa localmente:

```bash
FLOW=completo node server.js
```

No PowerShell: `$env:FLOW="completo"; node server.js`

## Versão completa: cadastro único

Página onde o jogador se cadastra **só com e-mail e senha** e a camada por trás cria a conta na **Suprema**. No primeiro depósito ele informa CPF, celular e nascimento (o Fichas 24h exige esses dados para processar o PIX), paga o **PIX na própria página** e recebe o **link oficial de convite do clube**, que abre o app (ou a loja) já no clube 10001 com o agente 1439098.

Hoje as duas integrações estão **simuladas** (modo teste): nada é criado de verdade e o PIX gerado não pode ser pago.

## Como rodar

Precisa só do Node 20 ou mais novo. Não há nada para instalar.

```bash
node server.js
```

- LP: http://localhost:3000
- Link que já abre o cadastro (bom para anúncios): http://localhost:3000/#cadastro
- Painel de cadastros: http://localhost:3000/admin (só abre neste computador)
- No celular, na mesma rede Wi-Fi: o endereço "Celular" que aparece no terminal

## Como testar o fluxo

Na versão convite: clique em **Quero jogar**, informe um e-mail e confira os 3 passos (link do clube, comprar fichas, suporte). Os cliques aparecem no painel.

Na versão completa (rode com `FLOW=completo`):

1. Clique em **Quero jogar** e preencha e-mail e senha. No modo teste existe o botão **Preencher com dados de teste** (senha de teste: `Teste@123`).
2. Na confirmação, o código do e-mail é **123456**. A página mostra esse código no modo teste.
3. No depósito, escolha o valor e preencha CPF, celular e nascimento. No modo teste, CPFs com todos os dígitos iguais (ex.: `111.111.111-11`) são aceitos; no modo real eles são recusados.
4. Clique em **Gerar PIX** e depois em **Simular pagamento (modo teste)**.
5. Na tela final: no celular aparece o botão do link do clube; no computador aparece o QR desse link para abrir no celular.
6. Acompanhe tudo em http://localhost:3000/admin.

Depois de mudar arquivos do servidor (`server.js`, `lib/`, `adapters/`, `config.js`), pare e rode `node server.js` de novo. Mudanças em `public/` aparecem só recarregando a página.

### Situações para testar

| Para simular | Faça assim |
|---|---|
| Conta já existente na Suprema | e-mail com `+existe`, ex.: `joao+existe@exemplo.com` (a página pede o ID da Suprema) |
| Conta já existente no Fichas 24h | e-mail com `+f24hexiste` (a camada faz login no lugar do cadastro) |
| Suprema fora do ar | apelido com `falha`, ex.: `falha01` (a 1ª tentativa falha e o sistema tenta de novo sozinho) |
| Código errado | qualquer código diferente de 123456 |
| Retomar depois | feche o painel ou recarregue a página: aparece "Continuar" |

## Como funciona por dentro

```
public/          página (index.html, app.js, styles.css) e painel (admin.html)
public/motion.js  vida da página: revelações ao rolar (GSAP), celular com parallax, ficha de poker 3D (Three.js)
public/img/      artes do app usadas no hero
docs/design-system.md  tokens de cor, tipografia e animação extraídos do site da Suprema
content/blog/    artigos do blog em Markdown (front matter + texto)
lib/blog.js      blog renderizado no servidor: páginas, JSON-LD, sitemap, feed RSS, llms.txt
lib/markdown.js  renderizador de Markdown sem dependências
public/blog.css  tipografia e cards do blog
public/shared/   validação usada pela página e pelo servidor (mesmas regras)
server.js        servidor e rotas da API
lib/orchestrator.js  etapas do cadastro, depósitos e dados do painel
adapters/        integrações: *.mock.js (simulado) e *.real.js (a fazer)
lib/store.js     dados em data/db.json (trocar por banco antes de produção)
config.js        clube, agente, WhatsApp, valores de depósito, links
```

Etapas de cada cadastro:

- **Conta** (no cadastro): conta na Suprema → e-mail confirmado.
- **PIX** (no 1º depósito): conta no Fichas 24h → ID da Suprema vinculado.
- **Clube**: pelo link oficial de convite (`links.clubInvite` em `config.js`). Se o link parar de funcionar, gere um novo no app e cole lá.

Se uma etapa falha, o sistema tenta de novo a partir dela (até 3 vezes) e depois aparece no painel com o botão **Tentar de novo**.

A senha do jogador **não vai para o arquivo**. Ela fica só na memória do servidor por até 30 minutos. Se o jogador fizer o primeiro depósito depois disso, a página pede a senha de novo junto com os dados do PIX.

## Ligar as integrações reais

1. Preencher `adapters/suprema.real.js` com as chamadas que o app da Suprema faz para criar conta e confirmar e-mail (contrato a levantar com os devs).
2. Preencher `adapters/fichas24h.real.js`. Os endereços já identificados estão listados no próprio arquivo.
3. Rodar com os modos reais:

```bash
SUPREMA_MODE=real F24H_MODE=real ADMIN_TOKEN=uma-senha-forte node server.js
```

No PowerShell:

```powershell
$env:SUPREMA_MODE="real"; $env:F24H_MODE="real"; $env:ADMIN_TOKEN="uma-senha-forte"; node server.js
```

## Versões da LP

A mesma página existe em três endereços. Nas duas versões com rota, o motion fica sempre ligado (ignora a
preferência de menos movimento do sistema), cada uma com sua arte 3D de fundo no desktop:

| Endereço | Arte 3D | Motion |
|---|---|---|
| https://suprema.blog/ | ficha de poker | segue a preferência do sistema |
| https://suprema.blog/fichas | ficha de poker (preta e dourada, logo "S" e clube) | sempre ligado |
| https://suprema.blog/spin | tambor do Spin Suprema com os multiplicadores | sempre ligado |

O evento `lp_view` leva `variant` (`padrao`, `fichas` ou `spin`) e o lead guarda a rota de entrada em `landing`,
para comparar as versões nos anúncios (ex.: `https://suprema.blog/spin?utm_source=instagram`).

## Motion e acessibilidade

A página respeita a preferência "menos movimento" do sistema: nesse caso a ficha 3D e o parallax somem, as
entradas aparecem sem animação e o bloco "Ação / Spin Suprema / Suporte 24h" só troca de cena com fade. No Windows,
essa preferência fica ativa quando "Efeitos de animação" está desligado nas configurações de acessibilidade.
Para ver a experiência completa mesmo assim, abra a página com `?motion=on` (ex.: https://suprema.blog/?motion=on).

Bibliotecas carregadas por CDN (cdnjs): GSAP 3.12.5 + ScrollTrigger e Three.js 0.170 (só em telas de 900 px ou mais).
Se alguma não carregar, a página funciona do mesmo jeito, só sem o efeito.

## Blog (SEO e descoberta por IA)

O blog fica em `/blog` e é renderizado no servidor a partir de arquivos Markdown em `content/blog/`. Para publicar um
artigo novo, crie `content/blog/meu-artigo.md` com o cabeçalho abaixo e faça o push; o servidor relê a pasta sozinho.

```markdown
---
title: Título do artigo (até 60 caracteres)
description: Resumo de 1 ou 2 frases, até 160 caracteres (vira a meta description).
date: 2026-10-23
updated: 2026-10-23
cover: /img/blog/meu-artigo/cover.jpg
coverAlt: Descrição da imagem de capa
tags: [app, guia]
faq:
  - q: Pergunta curta?
    a: Resposta direta em uma ou duas frases.
---

Texto em Markdown: títulos com ##, listas, tabelas, imagens ![alt](/img/blog/meu-artigo/foto.webp "Legenda")
e caixas :::cta, :::nota, :::dica (fechadas com :::).
```

O que cada página do blog já entrega:

- **HTML semântico no servidor** (sem depender de JavaScript), título, meta description, canonical, Open Graph e Twitter Card.
- **Dados estruturados** JSON-LD: `BlogPosting`, `BreadcrumbList`, `FAQPage` (quando há `faq`), `Organization` e `WebSite`; a página inicial tem `FAQPage` com as dúvidas do funil.
- **Sitemap dinâmico** em `/sitemap.xml` com `lastmod` e as imagens de cada página (sitemap de imagens), **feed RSS** em `/blog/feed.xml`, **`/llms.txt`** e **`/llms-full.txt`** (resumo do site e os artigos em Markdown para assistentes de IA) e `robots.txt` liberando Googlebot, Bingbot, GPTBot, ClaudeBot, PerplexityBot e Google-Extended.
- **Imagens no próprio domínio**, com nome descritivo, `alt`, largura/altura e carregamento preguiçoso; capas 1200×630 em `public/img/blog/<slug>/cover.jpg`.
- Sumário automático (a partir dos `##`), tempo de leitura, posts relacionados por tag, CTA para o funil e página 404 própria.

As capas foram geradas com Python/PIL nas cores da marca (script fora do repositório). Para trocar uma capa, basta
substituir o arquivo mantendo 1200×630. Os comentários `<!-- CAPTURA SUGERIDA -->` dentro dos posts marcam onde
entram capturas reais do app, com o nome de arquivo e o texto alternativo já definidos.

## Tracking

Os eventos já são enviados para `window.dataLayer`: `lp_view`, `signup_start`, `signup_submit`, `signup_complete`, `payer_complete`, `deposit_pix_created`, `pix_copy`, `deposit_paid`, `club_invite_click`, `app_download_click` e `whatsapp_click`. As origens (`utm_*`, `gclid`, `fbclid`) ficam salvas no cadastro e aparecem no painel.

O Google Tag Manager (`GTM-N46659WQ`, conta "Clube Suprema", contêiner suprema.blog) e o Google tag do Google Ads (`AW-970454313`) estão fixos no `<head>` de `public/index.html`, como o Google pede; os eventos acima também chegam a ele via `gtag('event', …)`. O GA4 é a propriedade "Clube Suprema" (fluxo suprema.blog, `G-ZXS59RV8GR`), definida em `config.js` e em `GA4_ID` no `render.yaml`; o Pixel da Meta liga com `META_PIXEL_ID`. O Search Console tem duas propriedades (prefixo `https://suprema.blog/` e domínio `sc-domain:suprema.blog`, esta vinculada ao GA4), com `/sitemap.xml` e `/blog/feed.xml` enviados; o passo a passo e o que o Rich Results Test mostra estão em `docs/colocar-no-ar.md`.

## Antes de ir para produção

- Trocar `data/db.json` por um banco de dados e guardar a sessão do Fichas 24h criptografada.
- Pedir liberação do IP do servidor no antifraude da Suprema, do Fichas 24h e da Asaas.
- Publicar termos de uso e política de privacidade (LGPD: a página trata CPF e senha).
- Rodar com HTTPS e `ADMIN_TOKEN` definido.
