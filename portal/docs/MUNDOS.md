# Mundos visuais dos modelos de site

O Kbsa olhou as fotos dos modelos (06/11/2026) e achou as páginas da SX genéricas, com cara de modelo de site qualquer. Os 5 exemplos de página inicial feitos em 05/11 ele chamou de "perfeitos". Por isso os modelos passam a ser construídos sobre **mundos**: cada mundo é um sistema visual completo, com conceito, tipografia, composição, blocos-assinatura e uma interação. A régua é: **cada página tem que estar à altura desses 5 exemplos**. Nada de trabalho em volume com qualidade de modelo pronto. Palavras dele: "não faça serviço porco só porque é serviço em volume".

## Peças de um mundo (cada mundo é dono só destes arquivos)

| Arquivo | O que é |
|---|---|
| `portal/lib/worlds/<id>.mjs` | `world` (nome, descrição, fontes, paletas) e `blocks` (blocos-assinatura, nome começa por `<id>_`) |
| `portal/public/assets/worlds/<id>.css` | a pele: tudo escopado em `body[data-world="<id>"]`. Restiliza também os blocos comuns (navbar, hero, steps, faq, cta, lead_form, schedule, footer…) para a página inteira ser do mundo |
| `portal/public/assets/worlds/<id>.js` | interação-assinatura (opcional, sem dependência; respeite `prefers-reduced-motion`; a página tem que funcionar sem JS) |
| `portal/templates/<modelo>.json` | os modelos que usam o mundo: `theme.world = "<id>"` |

O registro (`lib/worlds/index.mjs`), as ferramentas (`lib/block-kit.mjs`), o motor (`lib/blocks.mjs`, `lib/site.mjs`, `lib/templates.mjs`) e o CSS base (`public/assets/site.css`) são do coordenador. **Não edite.** Se faltar algo neles, escreva no seu relatório.

## Contrato de um bloco-assinatura

```js
import { esc, safeHref, para, list, btn, img, variant, F, HEAD } from '../block-kit.mjs';
export const blocks = {
  rack_hero: {
    label: 'Rack de fichas · destaque',            // nome que o dono vê no editor
    fields: [F.text('title', 'Título'), F.list('stacks', 'Pilhas', [F.text('label', 'Rótulo')])],  // tudo editável no painel
    render: (p, ctx) => `<section class="b rack-hero">...</section>`,  // HTML; TODO texto por esc(), TODO link por safeHref(href, ctx.base)
  },
};
```

- `ctx` traz `site`, `page`, `tenant`, `base` (prefixo dos links), `formAction` (POST do formulário de lead) e `disclaimer`.
- Formulário de lead: copie o padrão do bloco `lead_form` em `lib/blocks.mjs`. Ele usa os campos `name`, `email`, `phone`, `consent` e `website` (este é o honeypot) e `form.lead-form` com `data-success`; o `site.js` envia e mostra a mensagem. O formulário precisa continuar caindo no CRM.
- Campos aceitos: `text` (até 400 caracteres), `textarea` (até 4000), `url`, `select` (opções fixas), `checkbox` e `list` (até 40 itens). Não existe campo de número, cor ou imagem enviada. Imagem é URL.
- O primeiro elemento do HTML de cada bloco recebe a âncora (`id`) automaticamente.
- Nada de `<script>` dentro do bloco. Interação fica no `<id>.js`.

## Tema do modelo

`theme`: `world`, `mode` (`escuro` ou `claro`), as cores `bg`, `surface`, `text`, `muted`, `primary`, `primaryText`, `accent` e `border` (hex), `font`, `fontHead`, `fontMono` (da lista `FONTS` em `lib/templates.mjs`; estão lá Montserrat, Antonio, Anton, Oswald, Bebas Neue, Big Shoulders Display, Saira Condensed, Archivo Narrow, Barlow, JetBrains Mono, Red Hat Mono, Chivo Mono, Familjen Grotesk, Hanken Grotesk, Schibsted Grotesk, Red Hat Display, Epilogue, Unbounded, Instrument Serif, Gloock, Bodoni Moda, Libre Caslon Text, Young Serif, Figtree, Onest, Geologica…) e `radius`.

No CSS use as variáveis `--bg --surface --text --muted --primary --primary-text --accent --border --radius --font --font-head --font-mono`, para o dono poder trocar as cores no painel sem quebrar o mundo. Tons derivados com `color-mix()`.

## Proibido (o Kbsa rejeitou o "tom de IA")

- Degradê no texto.
- Brilho ou halo colorido (box-shadow ou text-shadow sem deslocamento).
- Vidro ou blur decorativo.
- Kicker/eyebrow acima de todo título.
- Fileira de cards iguais com ícone + título + texto como estrutura de seção.
- Números de seção 01/02/03 decorativos.
- Emoji ou símbolo unicode como ícone (desenhe SVG próprio, inline no HTML do bloco).
- Sombra dura deslocada.
- Fontes proibidas nos modelos novos: Inter, DM Sans, Space Grotesk, IBM Plex, Outfit, Fraunces, Playfair, Syne, Plus Jakarta, Instrument Sans.
- Página que só troca as cores de outra: os modelos de um mesmo mundo têm composição diferente, com outra ordem, outros blocos e outra primeira tela.

Siga o piso de acabamento de `C:\Users\Administrator\.claude\skills\impeccable\reference\craft-floor.md`. Leia antes de começar.

## Conteúdo honesto (poker e qualquer nicho)

- Só textos de exemplo editáveis. Placeholders da operação:
  - Comuns: `{{name}}`, `{{number}}`, `{{unit}}`, `{{unitLabel}}`, `{{customer}}`, `{{customers}}`, `{{partner}}`, `{{whatsapp}}`, `{{whatsappLink}}`, `{{telegram}}`, `{{instagram}}`, `{{email}}`, `{{tagline}}`, `{{logo}}`, `{{disclaimer}}`.
  - Poker: `{{app}}`, `{{agentId}}`, `{{inviteLink}}`, `{{chipsUrl}}`.
  - Loja: `{{storeUrl}}`, `{{coupon}}`.
  - SaaS: `{{product}}`, `{{trialUrl}}`.
  - Criador: `{{channel}}`.
- Não invente número de jogadores, clientes ou alunos, depoimento, prêmio pago, avaliação, ranking, nem "maior do Brasil". Grade de torneios, preços e produtos são exemplos e aparecem marcados como exemplo (o validador `node portal/tools/validar-modelos.mjs` reprova métrica fictícia).
- Poker:
  - Somente +18 e "Jogue com responsabilidade" visíveis no corpo da página, não só no rodapé.
  - Sem bônus, sem fichas grátis, sem promessa de ganho (a Meta trata como jogo de azar).
  - O site nunca pede senha do app nem documento.
  - Fluxo real: cadastro → abrir o app pelo link do clube (`{{inviteLink}}`) → comprar fichas por PIX no canal de fichas (`{{chipsUrl}}`), informando ID do jogador, clube `{{number}}` e agente `{{agentId}}`.
- Português do Brasil em tudo.

## Como conferir (obrigatório antes de entregar)

```
node portal/tools/validar-modelos.mjs
node portal/tools/fotos-homes.mjs <pasta> --modelos id1,id2 --celular --paginas
```

A ferramenta de fotos monta um banco temporário do zero (não mexe em nada) e escolhe portas livres sozinha, então pode rodar junto com outros agentes. Imprime JSON com os caminhos das fotos e `larguraCelular`, que tem que dar 390 (sem rolagem lateral).

Abra as fotos com a ferramenta Read e compare com a régua:

- Os 5 exemplos de 05/11: `C:\Users\Administrator\Desktop\match3-autoplayer-extensao-v1.1.0\Nova pasta (2)\Poker-crypto\.impeccable\mocks\decision\*.html`, com fotos em `...\Poker-crypto\data\modelo-*.jpg`.

Corrija e repita até a página aguentar a comparação. Página que você não fotografou e não olhou não está pronta.

## Regras de convivência (vários agentes no mesmo worktree)

- Não faça commit, push, checkout, stash nem nenhum comando git que mude estado. O coordenador faz o commit.
- Edite só os seus arquivos (a tabela do começo) e os modelos que estão no seu nome.
- `npm run portal:test` pode falhar por causa do trabalho em andamento de outro agente. Confira só o que é seu: validador nos seus modelos, fotos e `node --test portal/test/core.test.mjs`.
- Não suba servidor em porta fixa (3400, 3401, 3490–3493). Use só a ferramenta de fotos.
