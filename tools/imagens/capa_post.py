"""Capa de um post novo (1200x630) a partir do front matter, sem editar capas.py: usado pela rotina de posts automáticos.

Campos lidos de content/blog/<slug>.md (todos opcionais):
  capaTema      cartas (padrão), mesa, app, clube, suporte, torneio: escolhe a ilustração da direita
  capaChamada   linha dourada de cima, ex. "Guia · Regras"
  capaTitulo    título curto da capa (padrão: title)
  capaSubtitulo uma frase embaixo do título (padrão: description cortada)
  capaSelo      pílula do rodapé, ex. "Para iniciantes"
  capaEtiqueta  texto da pílula da ilustração (temas cartas e mesa)

Uso (na raiz do projeto): python tools/imagens/capa_post.py <slug>
Saída: public/img/blog/<slug>/cover.jpg + cover.webp + cover-600.webp
"""
import hashlib
import os
import re
import sys
import tempfile
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
FONT = os.path.join(tempfile.gettempdir(), "fonts", "Montserrat.ttf")
if not os.path.exists(FONT):
    os.makedirs(os.path.dirname(FONT), exist_ok=True)
    urllib.request.urlretrieve("https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf", FONT)

SLUG = sys.argv[1]
sys.path.insert(0, os.path.join(ROOT, "tools", "imagens"))
os.environ["ONLY"] = "__nenhum__"          # importa capas.py sem refazer nenhuma capa antiga
sys.argv = [sys.argv[0], ROOT, FONT]
import capas  # noqa: E402
import capas_webp  # noqa: E402

GOLD, INK = capas.GOLD, capas.INK
SUITS = ["♠", "♥", "♦", "♣"]
RANKS = ["A", "K", "Q", "J", "10", "9", "8", "7"]


def front_matter(slug):
    txt = open(os.path.join(ROOT, "content", "blog", f"{slug}.md"), encoding="utf-8").read().replace("\r\n", "\n")
    m = re.match(r"^---\n(.*?)\n---", txt, re.S)
    data = {}
    for line in (m.group(1) if m else "").split("\n"):
        kv = re.match(r"^([a-zA-Z_]+):\s*(.+)$", line)
        if kv:
            data[kv.group(1)] = kv.group(2).strip().strip('"').strip("'")
    return data


def illus_cartas(etiqueta):
    """Duas ou três cartas e uma pilha de fichas; as cartas mudam com o slug, para as capas não ficarem iguais."""
    h = int(hashlib.md5(SLUG.encode()).hexdigest(), 16)
    n = 2 + h % 2
    cards = [(RANKS[(h >> (4 * i)) % len(RANKS)], SUITS[(h >> (4 * i + 2)) % 4]) for i in range(n)]
    pos = [(-14, (800, 175)), (10, (905, 160))] if n == 2 else [(-22, (780, 185)), (-4, (860, 160)), (16, (948, 170))]

    def desenha(img):
        for (rank, suit), (ang, xy) in zip(cards, pos):
            capas.paste(img, capas.card(rank, suit, angle=ang), xy)
        for i, (c, dy) in enumerate([(GOLD, 0), ((60, 60, 66), -14), (GOLD, -28)]):
            capas.paste(img, capas.chip(130, c).resize((130, 54)), (1000, 420 + dy), with_shadow=(i == 0))
        capas.paste(img, capas.chip(130, GOLD), (1000, 300), with_shadow=False)
        capas.pill(img, etiqueta or "Texas Hold'em", 860, 455, capas.font(16, 700))
    return desenha


def illus_mesa(etiqueta):
    def desenha(img):
        ph = capas.phone_from(os.path.join(ROOT, "public/img/app-mesa.webp"), (40, 70, 620, 900), 420)
        capas.paste(img, ph, (960 - ph.width // 2, 95))
        capas.pill(img, etiqueta or "Mesa · Lobby · Fichas", 940, 535, capas.font(16, 700))
    return desenha


data = front_matter(SLUG)
tema = data.get("capaTema", "cartas")
etiqueta = data.get("capaEtiqueta", "")
capas.ILLUS[SLUG] = {
    "cartas": illus_cartas(etiqueta),
    "mesa": illus_mesa(etiqueta),
    "app": capas.illus_instalar,
    "clube": capas.illus_entrar,
    "suporte": capas.illus_faq,
    "torneio": capas.illus_torneios,
}.get(tema) or illus_cartas(etiqueta)

desc = data.get("description", "")
sub = data.get("capaSubtitulo") or (desc[:110].rsplit(" ", 1)[0] + "…" if len(desc) > 110 else desc)
jpg = os.path.join(ROOT, "public", "img", "blog", SLUG, "cover.jpg")
capas.cover(jpg, SLUG, data.get("capaChamada", "Blog · Poker"), data.get("capaTitulo") or data.get("title", SLUG), sub,
            data.get("capaSelo") or None)
print("  ", ", ".join(capas_webp.variantes(jpg)))
