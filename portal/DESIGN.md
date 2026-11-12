# Design: blogs de afiliado ("ficha de conferência")

Escopo: as páginas próprias dos 10 blogs de afiliado, geradas por `tools/afiliacao-visual.mjs` com os temas de
`tools/afiliacao-temas.mjs`. Feito em 12/11/2026 (ordem do Kbsa: premium, convidativo, sem cara de IA, PageSpeed 100).
Produto e público: `PRODUCT.md`. Modo: leitura (Read) nos posts e na lista; a home é uma edição do dia.

## Ideia
Cada indicação sai com **quem conferiu, quando e o que conferir**. A voz do blog (personagem criado com IA, declarado) assina
tudo com um **carimbo de conferência** (borda dupla, levemente girado, nome em fonte de título e data curta). O mundo do nicho
mora na moldura (topo, títulos, carimbo, réguas, etiquetas de oferta); a coluna de leitura fica calma.

## Tokens (por blog, claro e escuro)
`fundo`, `papel` (superfície), `tinta` (texto), `suave` (secundário), `linha`, `acento` (link e botão, com `sobreAcento`),
`marca` (segunda cor do nicho, superfícies pequenas, com `sobreMarca`). Todas as combinações passam no AA
(`test/afiliacao-temas.test.mjs`). Modo escuro pelo sistema e pelo botão do topo (`data-tema`, guardado no navegador).

| Blog | Voz | Fonte de título | Acento | Marca | Mundo |
|---|---|---|---|---|---|
| sublimacao | Léo da Estampa | Young Serif | teal da tinta | magenta | bancada, CMY |
| fornecedores | Márcio | Archivo Narrow | kraft | azul de carimbo | depósito de atacado |
| criativos | Nina | Gabarito | rosa de prova | amarelo post-it | mesa de criação |
| ia | Duda | Schibsted Grotesk | grafite | verde marca-texto | caderno de estudo |
| achadinhos | Bia | Bricolage Grotesque | vermelho de oferta | amarelo de etiqueta | corredor de loja |
| manutencao | Zé | Barlow Condensed | verde de máquina | amarelo de segurança | oficina |
| gamer | Kaique | Chakra Petch | vermelho "ao vivo" | grafite | mesa de transmissão |
| afiliado | Carla | Familjen Grotesk | marinho de livro-caixa | vermelho de correção | planilha e recibo |
| milhas | Rafa | Overpass | azul de pista | amarelo de placa | aeroporto |
| automacao | Gabi | Nunito | verde de mensagem | balão claro | conversa de atendimento |

Texto corrido: Atkinson Hyperlegible Next (variável 200–800, com itálico). Fontes servidas pelo Portal
(`public/assets/fontes/*.woff2`, recorte latin, OFL), com preload do texto e do título; fallback métrico Arial ajustado.

## Composição
- **Home:** abertura (h1 = tagline, linha de edição, cartão da voz) + destaque de hoje (foto 16:9, bordão da voz como título
  da seção) → "Você parou em" (só quem já leu) → Comece por aqui (trilha numerada de 3) → Mais lidos (contador do Portal, 30 dias,
  só com 3+) e Séries (`SERIES` do tema) → Saiu esta semana (grade de 6) → Fichas de compra (tabela, "Publicidade") e kit
  → newsletter + Telegram → FAQ → "Como <voz> escolhe".
- **Post:** breadcrumb, h1, linha fina (resposta curta), ficha com carimbo e datas, foto limpa (`fotos/<slug>.webp`; a capa com
  título fica só para og:image/Story), índice (lateral que acompanha a leitura no computador, `<details>` no celular),
  tabela "Melhor escolha" ou etiqueta da escolha, texto (68ch, 1,13rem/1,75), caixas como ficha com régua no topo e
  checklist de quadradinhos, etiqueta de oferta com "Publicidade" e preço com data, assinatura da voz, relacionados.
- **Barra de oferta no celular:** só aparece depois do topo do post sair da tela.

## Plantas (12/11/2026, para os blogs não terem a mesma estrutura)
`PLANTAS` em `afiliacao-temas.mjs`; nenhum par home+post se repete (teste em `afiliacao-visual.test.mjs`).

| Home | Como é | Blogs |
|---|---|---|
| a, edição | voz ao lado do título, destaque 7/5, trilha em 3 colunas, mais lidos + séries, grade de 6 | afiliado, automacao |
| b, revista | topo centrado, foto do destaque larga (21:9), lista de linhas com lateral fixa (voz + séries), trilha com fotos | sublimacao, gamer, milhas |
| c, almanaque | barra do topo invertida, sem foto na 1ª dobra, trilha numerada grande, destaque em ficha, índice lateral fixo | fornecedores, ia, manutencao |
| d, perguntas | o leitor escolhe o assunto (séries em blocos) logo abaixo do título, destaque invertido, grade de 2, voz em faixa | achadinhos, criativos |

| Post | Como é | Blogs |
|---|---|---|
| 1 | índice à direita | milhas, automacao |
| 2 | índice à esquerda | fornecedores, afiliado |
| 3 | revista: foto larga primeiro, cabeçalho e coluna centrados, índice aberto | sublimacao, achadinhos, manutencao |
| 4 | cabeçalho dividido (texto + foto 4:3), índice em chips | criativos, ia, gamer |

Oferta com menor destaque em todas: 1 bloco por post depois do conteúdo útil, sem barra fixa nem cartão lateral; home com até 4 fichas no fim.
Aviso de cookies (`medicao.js`): nos blogs vira faixa baixa no rodapé com as cores do tema.

## Movimento
Um momento só: o carimbo "carimba" ao abrir o post (0,55 s, ease-out). Barra de progresso de leitura por scroll-timeline
(sem JS). Zoom leve na foto do destaque. Tudo some com `prefers-reduced-motion`.

## Não fazer
Gradiente, vidro, rótulo acima de título, cards iguais com ícone, emoji como ícone, borda colorida grossa à esquerda,
"testei", preço sem data, Google Fonts nas páginas (só na Web Story AMP).
