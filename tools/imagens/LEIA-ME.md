# Geradores de imagem (Python + Pillow)

Scripts que produzem as imagens da marca no estilo das peças oficiais da Suprema: preto profundo,
feixes de luz dourados, partículas, degradê dourado em botões e destaques, pílulas com borda dourada.
Tudo sai de `luxo.py`; os outros arquivos só montam cada peça.

| Script | Gera | Como rodar (na raiz do projeto) |
|---|---|---|
| `logo.py` | logo "S" em vetor: `public/img/logo-mark.svg`, `public/favicon.svg`, `public/favicon.ico`, `public/apple-touch-icon.png`, `public/img/icon-192.png`, `icon-512.png`, `logo.png` e o kit em `marketing/logo/` | `python tools/imagens/logo.py .` |
| `capas.py` | capas dos posts em `public/img/blog/<slug>/cover.jpg` e `public/img/og-clube-suprema.jpg` | `python tools/imagens/capas.py . CAMINHO/Montserrat.ttf` (use `ONLY=<slug>` para uma capa só) |
| `youtube.py` | banner, foto de perfil e marca d'água do canal em `marketing/youtube/` | `python tools/imagens/youtube.py marketing/youtube CAMINHO/Montserrat.ttf` |

Requisitos: Python 3.11+, `pip install pillow`, a fonte variável Montserrat (`Montserrat[wght].ttf`, do GitHub
da Google Fonts) e os naipes das cartas vêm de `C:\Windows\Fonts\seguisym.ttf` (ajuste `SYMBOL_FONT` em outro sistema).
O fundo de todas as peças é preto puro (`luxo.black_background`); a marca é o "S" de `logo.py` (`logo.mark`, `logo.icon`).
Para um post novo, acrescente a linha dele na lista `posts` de `capas.py` e uma função `illus_<tema>` com a ilustração.
