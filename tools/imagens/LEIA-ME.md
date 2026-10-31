# Geradores de imagem (Python + Pillow)

Scripts que produzem as imagens da marca no estilo das peças oficiais da Suprema: preto profundo,
feixes de luz dourados, partículas, degradê dourado em botões e destaques, pílulas com borda dourada.
Tudo sai de `luxo.py`; os outros arquivos só montam cada peça.

| Script | Gera | Como rodar (na raiz do projeto) |
|---|---|---|
| `logo.py` | logo "S" em vetor: `public/img/logo-mark.svg`, `public/favicon.svg`, `public/favicon.ico`, `public/apple-touch-icon.png`, `public/img/icon-192.png`, `icon-512.png`, `logo.png` e o kit em `marketing/logo/` | `python tools/imagens/logo.py .` |
| `capas.py` | capas dos posts em `public/img/blog/<slug>/cover.jpg` e `public/img/og-clube-suprema.jpg` | `python tools/imagens/capas.py . CAMINHO/Montserrat.ttf` (use `ONLY=<slug>` para uma capa só) |
| `capas_webp.py` | `cover.webp` (1200 px) e `cover-600.webp` ao lado de cada `cover.jpg`, usados no `srcset` do blog (o JPG fica no og:image e no RSS); o `capas.py` já chama sozinho | `python tools/imagens/capas_webp.py .` |
| `anuncio_og.py` | a arte "Entre no Clube Suprema em 2 minutos" do `og-clube-suprema.jpg` nos formatos da Meta: `marketing/anuncios/og-1080x1080.jpg` (feeds) e `og-1080x1920.jpg` (Stories e Reels, texto fora das faixas cobertas) | `python tools/imagens/anuncio_og.py . CAMINHO/Montserrat.ttf` |
| `youtube.py` | banner, foto de perfil e marca d'água do canal em `marketing/youtube/` | `python tools/imagens/youtube.py marketing/youtube CAMINHO/Montserrat.ttf` |

Requisitos: Python 3.11+, `pip install pillow`, a fonte variável Montserrat (`Montserrat[wght].ttf`, do GitHub
da Google Fonts) e os naipes das cartas vêm de `C:\Windows\Fonts\seguisym.ttf` (ajuste `SYMBOL_FONT` em outro sistema).
O fundo de todas as peças é preto puro (`luxo.black_background`); a marca é o "S" de `logo.py` (`logo.mark`, `logo.icon`).
Para um post novo, acrescente a linha dele na lista `posts` de `capas.py` e uma função `illus_<tema>` com a ilustração.

Peças da rotina de posts automáticos (`marketing/post-automatico.md`):

| Script | Gera | Como rodar (na raiz do projeto) |
|---|---|---|
| `capa_post.py` | capa de um post novo a partir dos campos `capa*` do front matter, sem editar `capas.py` | `python tools/imagens/capa_post.py <slug>` |
| `short_post.py` | vídeo em pé 1080x1920 (Shorts/Reels) com narração pt-BR (edge-tts), a partir de `marketing/shorts/<id>.json`; sai em `data/shorts/<id>.mp4`. Com `SHORT_ANIMADO=1`, as cenas são animadas por `motion/cena.html` e fotografadas quadro a quadro por `motion/render.mjs` (Chrome sem janela); se falhar, sai o modelo parado | `python tools/imagens/short_post.py marketing/shorts/<id>.json [pasta de saída]` |

Os dois baixam a Montserrat para `%TMP%\fonts` se ela não estiver lá. O `short_post.py` precisa do ffmpeg no PATH; o
animado precisa também do Node e do Chrome (ou Edge) e leva uns 2 minutos por vídeo de 40 s.

Animação (`motion/cena.html`): cada elemento é uma conta do tempo (`seek(n)` põe a cena no instante n/30 s, sem
animação CSS e sem sorteio), então dá para ajustar falando ("transição mais suave", "ficha maior") e o quadro sai igual
toda vez. Para ver um quadro: abra o `cena.html` no Chrome e rode `init(<timeline>)` e `seek(<n>)` no console (o
timeline é o JSON que o `short_post.py` grava na pasta temporária).
