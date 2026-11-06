# Hot Poker — brief comum das 5 páginas (prévias para o dono escolher)

Cada página é um arquivo HTML único (CSS e JS embutidos), em pt-BR, nesta pasta. Depois que o dono escolher, a vencedora vira um "mundo" do portal; então escreva HTML/CSS limpos e portáveis (sem framework, sem build).

## Fatos (só estes; não invente nada além)
- Marca: **Hot Poker**, clube de poker dentro do app oficial **Suprema Poker** (grupo SX).
- **Clube 33548**, **agente 768286**.
- Caminho: deixar o e-mail no site → baixar o Suprema Poker (grátis, nas lojas) e abrir pelo link do clube (entrar pelo link já cai dentro do clube com o agente) → comprar fichas por **PIX no canal de fichas** (Fichas 24h: https://app.fichas24horas.com.br/signup). Na primeira compra a pessoa informa o **ID de jogador** (fica no perfil do app), o **clube 33548** e o **agente 768286**. Saque também por PIX, na chave do próprio CPF.
- Suporte humano 24h no WhatsApp, sempre com a mensagem padrão:
  `https://wa.me/5511952138293?text=Oi!%20Venho%20do%20clube%2033548%2C%20agente%20768286%2C%20e%20gostaria%20de%20suporte.`
- Redes: Instagram https://www.instagram.com/hotpoker_sx (@hotpoker_sx) · Grupo no Facebook https://www.facebook.com/share/g/1KJNHrXUSF/
- O site não pede senha do app nem documentos.
- Somente maiores de 18 anos; "Jogue com responsabilidade" visível, não escondido no rodapé.

## Proibido (regra da Meta e do clube)
- Bônus, fichas grátis, promessa de ganho, "ganhe dinheiro", depoimentos, número de jogadores, prêmios pagos, avaliações/estrelas. **Não use o slogan "Quanto mais você joga, mais você ganha"** (lê como promessa de ganho).
- Qualquer grade de torneios, mesa, valor ou mão é **ilustração**: rotule visivelmente ("grade de exemplo", "ilustração").

## Marca (referência: referencia-logo.png)
- Fundo preto; chama laranja em degradê (#f7941d → #e8501c) com filete branco: use **chama.svg** desta pasta (embuta o SVG inline na página, não como arquivo externo). A chama é a marca; não a redesenhe.
- Letreiro "HOT POKER" branco, geométrico, muito pesado e largo. Use **Archivo** do Google Fonts com eixo de largura (`wdth` 125, `wght` 900) para o letreiro em todas as direções, para a marca ficar igual nas 5. O resto da tipografia é de cada direção (fuja de Inter, DM Sans, Space Grotesk, Syne, Outfit, Fraunces, Playfair, IBM Plex, Plus Jakarta, Instrument).
- Raio/relâmpago laranja fino aparece no fundo da arte original: pode virar elemento da direção.
- Cores fora do preto/laranja/branco só se a direção pedir, com moderação.

## Conversão (obrigatório)
- Primeira tela (1440×900 e 390×844): diz o que é (clube de poker no app Suprema Poker, fichas por PIX, suporte 24h), tem o **formulário de e-mail funcionando** (label, `type=email`, `autocomplete=email`, caixa "Tenho mais de 18 anos e aceito receber o passo a passo por e-mail", botão "Quero jogar"), mostra clube 33548 e agente 768286 com botão de copiar, e o +18.
- Envio (simulado no front): `preventDefault`, valida, estados de erro (nomeia o problema e como resolver), carregando e sucesso. O sucesso mostra o próximo passo: botão "Abrir o app pelo link do clube" (href `#link-do-clube`, placeholder) e "Comprar fichas por PIX" (Fichas 24h). Sem JS, o formulário continua visível e o resto da página legível.
- Barra fixa no celular com "Quero jogar" (vai ao formulário) + WhatsApp.
- Botões de copiar clube/agente com retorno ("Copiado").
- Prova por fatos verificáveis (app oficial, PIX no CPF, suporte humano, link que já cai no clube), nunca por promessa.

## Indexação (obrigatório)
- `<html lang="pt-BR">`, `<title>` até 60 caracteres com "Hot Poker", "clube", "Suprema Poker"; meta description até 155; `link rel=canonical` = `https://sx.kbsa.app/s/hot-poker/` (provisório); `robots index,follow`; Open Graph e Twitter card; `theme-color`; favicon SVG inline (data URI da chama).
- JSON-LD em `@graph`: `Organization` (name, url, logo, sameAs com Instagram e Facebook, contactPoint com o WhatsApp), `WebSite`, `WebPage`, `FAQPage` com **as mesmas perguntas e respostas visíveis** na página. Nada de Review/AggregateRating.
- Um único `h1` com "Hot Poker" e "clube de poker" (pode ser estilizado à vontade). Seções com `h2`/`h3` em ordem: como entrar (3 passos), fichas por PIX (primeira compra), mesas/torneios (exemplo rotulado), por que o Hot Poker (só fatos), dúvidas (6 a 8 perguntas reais de iniciante e de quem já joga), jogo responsável, rodapé com redes.
- 900 a 1.300 palavras de texto visível útil, escrito para gente (não lista de palavras-chave). Termos naturais: clube de poker online, Suprema Poker, fichas por PIX, ID do clube, código do agente, torneios, Texas Hold'em (NLH), Omaha (PLO).
- Desempenho: nenhuma imagem externa; SVG inline; `preconnect` + `display=swap` nas fontes; JS pequeno; respeita `prefers-reduced-motion`; nada de rolagem lateral em 390 px.

## Acabamento (piso)
- Contraste ≥ 4.5:1 no texto; foco visível; seleção, cursor, barra de rolagem e sublinhado com as cores da direção.
- Proibido: rótulo pequeno acima de título (kicker/eyebrow), números de seção 01/02/03 decorativos, grade de cards iguais (ícone+título+texto), texto em degradê, vidro/blur de enfeite, sombra dura deslocada, emoji no lugar de ícone, borda colorida grossa na lateral de card.
- Títulos até 6rem; texto corrido 65–75 caracteres por linha; mais espaço acima do título que abaixo.
- Um momento de movimento autoral por página (não animação igual em toda seção); conteúdo visível por padrão.
- A direção é o mundo inteiro da página (navegação, botões, campos, rodapé no vocabulário dela), não um enfeite sobre um template. Mas a página continua funcionando como página: links legíveis, ação principal inconfundível.

## Fotos para conferir
Edge sem tela (troque ARQ e SAIDA):
`"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1440,900 --screenshot="SAIDA.png" "file:///C:/Users/Administrator/Desktop/portal-afiliacao/portal/mocks/hot-poker/ARQ.html"`
Para a página inteira, aumente a altura da janela (ex.: 1440,6000) e, para o celular, 390,844 e 390,9000. Abra cada foto (ferramenta Read) e corrija o que estiver errado antes de entregar. No máximo duas rodadas de correção.

Atenção: com `--window-size` alto, elementos em `100vh` esticam na foto longa. Limite a primeira tela com `min-height: min(100svh, 980px)` (ou similar) e confira a primeira tela também numa foto 1440×900 e 390×844 separada.
