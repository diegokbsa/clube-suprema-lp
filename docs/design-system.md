# Design System · LP Clube Suprema

Extraído em 23/10/2026 do site oficial supremapoker.com.br (CSS publicado + capturas) e das artes do app
(celular com a mesa e tela de abertura). É a referência de `public/styles.css`: os tokens abaixo existem lá como
variáveis CSS (`--bg-0`, `--accent` etc.).

## 1. Paleta

| Papel | Token | HEX | Onde a Suprema usa |
|---|---|---|---|
| Fundo profundo | `--bg-0` | `#040404` | topo do hero (gradiente `#040404 → #1c1c1c`) |
| Fundo base | `--bg-1` | `#1c1c1c` | `body` do site |
| Superfície | `--bg-2` | `#242426` | painéis e cards escuros |
| Vidro | `--glass` | `rgba(255,255,255,.05)` | painel de torneios, rodapé (`backdrop-filter: blur(25px)`) |
| Vidro dourado | `--glass-gold` | `linear-gradient(240deg, #efa1441c, #efa14400 50%, #efa14408)` | rodapé e cards em destaque |
| Borda | `--border` | `rgba(255,255,255,.08)` | contornos sutis |
| Texto | `--text` | `#ffffff` | títulos e corpo |
| Texto secundário | `--muted` | `#b9bbbe` | legendas, parágrafos de apoio |
| Acento (primária) | `--accent` | `#efa144` | botões, palavras-chave dos títulos, números grandes |
| Acento escuro | `--accent-2` | `#df9741` | gradiente de linhas douradas `127deg #df974100 → #efa144 → #df974100` |
| Acento suave | `--accent-soft` | `rgba(239,161,68,.11)` | fundos de chips e ícones |
| Tinta sobre dourado | `--accent-ink` | `#1c1c1c` | texto dos botões dourados |
| Sucesso | `--ok` | `#28a745` | confirmações |
| Erro | `--danger` | `#dc3545` | validação |
| Feltro da mesa | `--felt` | `#1d7a4c` | referência da arte da mesa (uso pontual) |

Regra: uma cor de acento só. O dourado aparece em pequenas doses sobre o preto; nunca grandes áreas douradas.

## 2. Tipografia

A Suprema usa Termina (display) e Zeitung (corpo) pela Typekit, que não podem ser carregadas fora do domínio
deles, e carrega Montserrat e Antonio pelo Google Fonts. A LP usa os pares livres com o mesmo caráter:

| Uso | Fonte | Peso | Tamanho |
|---|---|---|---|
| Display (H1) | Montserrat | 800 | `clamp(2.2rem, 5.2vw, 3.6rem)`, `letter-spacing -.02em`, `line-height 1.08` |
| Títulos (H2) | Montserrat | 700 | `clamp(1.6rem, 3.2vw, 2.3rem)`, palavra-chave em `--accent` |
| Subtítulos (H3) | Montserrat | 700 | `1.1rem` |
| Números grandes | Antonio | 700 | `clamp(2.6rem, 6vw, 4rem)`, `letter-spacing .01em` (como o "100K" dos torneios) |
| Corpo | Montserrat | 400 / 500 | `1rem`, `line-height 1.6` |
| Legenda / eyebrow | Montserrat | 700 | `.78rem`, caixa alta, `letter-spacing .12em`, em `--accent` |
| Botões | Montserrat | 700 | `1rem` (grande `1.05rem`) |

Escala: 12 · 14 · 16 · 18 · 22 · 28 · 36 · 48 · 64 px.

## 3. Espaçamento

Base 8 px: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 · 64 · 96`.

- Seções: `96px` de respiro vertical no desktop, `56px` no celular.
- Grades de cards: `gap 20px` (o site usa `grid-gap: 20px`).
- Padding interno de cards: `24px`; de botões: `17px 22px` (grande) e `12px 18px` (normal).
- Largura de leitura: `1120px` para a página, `640px` para blocos de texto.

## 4. Raio e sombras

| Elemento | Raio | Sombra |
|---|---|---|
| Painéis grandes (hero, vidro) | `32px` | `5px 10px 100px rgba(0,0,0,.5)` |
| Cards | `16px` | `2px 2px 35px rgba(0,0,0,.5)` |
| Botões | `8px` | brilho interno `inset 10px 10px 20px rgba(255,255,255,.37)` no dourado |
| Pílulas / chips / tags | `90px` | nenhuma |
| Inputs | `10px` | foco `0 0 0 3px rgba(239,161,68,.25)` |

Brilho (glow) dourado para destaque: `0 0 40px rgba(239,161,68,.35)`.

## 5. Princípios de animação

1. **Entrada por rolagem:** fade-in + deslize de `30px` para cima, `0.8s`, easing `cubic-bezier(.16, 1, .3, 1)`.
   Elementos de uma mesma seção entram em sequência com atraso de `90ms` entre si (stagger).
2. **Elemento vivo de fundo:** ficha de poker 3D (preto com detalhes dourados e o ♠) na raiz e em `/fichas`; tambor do Spin
   Suprema (verde feltro, aros dourados, multiplicadores até 50.000×) em `/spin`. Gira devagar, acompanha o progresso da
   rolagem (posição, escala e inclinação mudam entre seções) e é arrastável. Sempre em `z-index: -1`, sem bloquear
   cliques. Em telas pequenas vira um brilho estático; com `prefers-reduced-motion` some.
3. **Celular do app:** flutua devagar (`6s`), inclina até `10°` seguindo o mouse, troca da tela de abertura para a mesa
   logo após carregar e acompanha a rolagem em parallax leve.
4. **Micro-interações:** hover em botões e cards com `scale(1.02)`, brilho que segue o cursor e sombra mais funda,
   `0.4s` (o tempo de transição padrão do site da Suprema). Clique com `translateY(1px)`.
5. **Texto cinético:** o bloco "Ação / Spin Suprema / Suporte 24h" troca de cena a cada `3s` num loop de `9s`; o rolo do Spin
   para em 50.000×, o multiplicador máximo divulgado pela Suprema.
6. **Sem movimento gratuito:** nada pisca, nada roda sem parar no texto. Tudo respeita `prefers-reduced-motion`.

## 6. Personalidade

**Premium · Intensa · Confiável.** Preto profundo com dourado em pequenas doses, números grandes e diretos,
renders 3D do produto, e um tom de voz que fala de ação e suporte, não de promessas.

## Camada "luxo" (24/10/2026)

Referência: peças oficiais da Suprema Poker (stories "Conheça o Rodeo" e "Suprema Poker Tour"). Aplicada na LP, no blog,
nas capas dos posts, na imagem social e no kit do YouTube. Na LP o fundo fica atrás da ficha 3D; os brilhos animados ficaram quase invisíveis (opacidade .1) e a grade sumiu.
Os tokens (`--gold-grad`, `--gold-text`, `--gold-hi`, `--gold-border`, `--panel`, `--card-luxo`) e as regras de `.btn`, `.eyebrow`, `.accent`/`.gold`
vivem em `public/styles.css`; os neutros ficaram quentes (`--bg-1 #15110a`, `--card #1b1610`).

| Elemento | Regra | Onde |
|---|---|---|
| Fundo | preto fosco `#060606` com textura sutil de reboco (ruído em 3 escalas, vinheta leve), sem feixes, brilhos ou barras. As barras douradas laterais da referência do usuário foram testadas em 24/10/2026 e rejeitadas por ele ("horrível"); mudanças de fundo pedem prévia antes de publicar | textura: `public/img/bg-luxo.webp` e `bg-luxo-m.webp` (`luxo.plaster_texture`), na LP em `.bg`, no blog via `body.page-blog::before` |
| Degradê dourado | `linear-gradient(180deg, #f9cf7f 0%, #efa144 52%, #d4852a 100%)` com brilho fino no topo | `--gold-grad` em `blog.css`; botões `.btn`, marca `.brand-mark`, `luxo.gold_rounded()` nas imagens |
| Botão | degradê dourado, texto `#1a1206` em caixa alta, peso 800, raio 14 px, sombra dourada suave; `.btn-ghost.btn-block` (frases longas) fica em caixa normal | `.btn` em `styles.css` |
| Botão fantasma | fundo quase transparente, borda 1 px dourada, texto `#f3b662` | `.btn-ghost` |
| Palavra de destaque | texto com degradê `--gold-text` (background-clip), sem text-shadow | `.accent` (LP: h1, h2, bloco de motion, CTA) e `.gold` (blog) |
| Pílula | fundo escuro translúcido, borda 1 px dourada, texto dourado em caixa alta com espaçamento .14 a .16 em | `.eyebrow` (LP e blog), `.post-tags span`, `luxo.outline_pill()` |
| Título | Montserrat 900; h2 das seções da LP e h1 do índice do blog em caixa alta com a palavra-chave em dourado; h1 da LP e dos posts em caixa normal | `.section-head h2`, `.cta-panel h2`, `.blog-head h1`, `.post-head h1` |
| Cards e caixas | fundo `rgba(30,22,12,.8) → rgba(12,10,8,.94)`, borda dourada a 22 % (55 % no hover), brilho dourado no hover | `.post-card`, `.post-cta`, `.toc`, `.post-faq details` |
| Divisórias | linha de 1 px com `--gold-line` (dourado que some nas pontas) | `.blog-head::after`, `.post-foot::before`, rodapé |
| Rodapé legal | "18+ · Jogue com responsabilidade." pequeno e discreto | imagens do YouTube e capas; no site, rodapé |

Os geradores estão em `tools/imagens/` (ver o LEIA-ME de lá).
