# Geradores de imagem (Python + Pillow)

Scripts que produzem as imagens da marca no estilo das peças oficiais da Suprema: preto profundo,
feixes de luz dourados, partículas, degradê dourado em botões e destaques, pílulas com borda dourada.
Tudo sai de `luxo.py`; os outros arquivos só montam cada peça.

| Script | Gera | Como rodar (na raiz do projeto) |
|---|---|---|
| `fundo-web.py` | `public/img/bg-luxo.webp` e `bg-luxo-m.webp` (fundo das páginas do blog) | `python tools/imagens/fundo-web.py .` |
| `capas.py` | capas dos posts em `public/img/blog/<slug>/cover.jpg` e `public/img/og-clube-suprema.jpg` | `python tools/imagens/capas.py . CAMINHO/Montserrat.ttf` (use `ONLY=<slug>` para uma capa só) |
| `youtube.py` | banner, foto de perfil e marca d'água do canal em `marketing/youtube/` | `python tools/imagens/youtube.py marketing/youtube CAMINHO/Montserrat.ttf` |

Requisitos: Python 3.11+, `pip install pillow`, a fonte variável Montserrat (`Montserrat[wght].ttf`, do GitHub
da Google Fonts) e o ♠ vem de `C:\Windows\Fonts\seguisym.ttf` (ajuste `SYMBOL_FONT` em outro sistema).
Para um post novo, acrescente a linha dele na lista `posts` de `capas.py` e uma função `illus_<tema>` com a ilustração.
