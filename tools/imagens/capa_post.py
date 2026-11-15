"""Capa de um post novo (1200x630) a partir do front matter, sem editar capas.py: usado pela rotina de posts automáticos.

Campos lidos de content/blog/<slug>.md (todos opcionais):
  capaTema      cartas (padrão), mesa, app, clube, suporte, torneio, prazos, erros, liga, saque: escolhe a ilustração da direita
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


# ---- ilustrações novas (15/11/2026): prazos, erros e liga; cada post de fichas/liga ganha uma arte própria ----
import math  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

_CARD = (26, 26, 29)
_MUTED = capas.MUTED


def _painel(img, x0, y0, x1, y1):
    def body(d):
        d.rounded_rectangle((x0 + 6, y0 + 10, x1 + 6, y1 + 10), radius=26, fill=(0, 0, 0, 130))
        d.rounded_rectangle((x0, y0, x1, y1), radius=26, fill=_CARD + (255,), outline=GOLD, width=2)
    img.alpha_composite(capas.overlay(Image.new("RGBA", img.size, (0, 0, 0, 0)), body))
    return ImageDraw.Draw(img)


def illus_prazos(img):
    x0, y0, x1, y1 = 748, 112, 1124, 432
    d = _painel(img, x0, y0, x1, y1)
    d.text((x0 + 28, y0 + 26), "PRAZOS · FICHAS 24H", font=capas.font(16, 700), fill=GOLD)
    d.text((x0 + 28, y0 + 52), "Segundo o próprio Fichas 24h", font=capas.font(15, 500), fill=_MUTED)
    rows = [("Compra pelo QR Code", "automática"), ("Atraso raro do PIX", "até 2 h"), ("Revisão do saque", "até 24 h"), ("PIX errado, devolução", "24 a 72 h")]
    for i, (a, b) in enumerate(rows):
        cy = y0 + 118 + i * 52
        d.text((x0 + 28, cy), a, font=capas.font(18, 600), fill=capas.WHITE, anchor="lm")
        d.text((x1 - 28, cy), b, font=capas.font(18, 800), fill=GOLD, anchor="rm")
        if i < len(rows) - 1:
            d.line((x0 + 28, cy + 26, x1 - 28, cy + 26), fill=(52, 52, 58), width=1)
    cx, cy, r = x1 - 8, y0 + 6, 48
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=GOLD)
    d.ellipse((cx - 32, cy - 32, cx + 32, cy + 32), outline=INK, width=6)
    d.line((cx, cy, cx, cy - 20), fill=INK, width=5)
    d.line((cx, cy, cx + 15, cy + 8), fill=INK, width=5)
    d.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), fill=INK)
    capas.pill(img, "Compra e saque", 936, 494, capas.font(16, 700))


def illus_erros(img):
    x0, y0, x1, y1 = 748, 112, 1124, 432
    d = _painel(img, x0, y0, x1, y1)
    d.text((x0 + 28, y0 + 26), "ANTES DE PAGAR O PIX", font=capas.font(16, 700), fill=GOLD)
    d.text((x0 + 28, y0 + 52), "Erros que travam a compra", font=capas.font(15, 500), fill=_MUTED)
    rows = ["PIX de conta de outra pessoa", "PIX sem gerar o QR Code", "Apelido no lugar do ID", "Valor abaixo do mínimo"]
    for i, tx in enumerate(rows):
        cy = y0 + 118 + i * 52
        cx = x0 + 46
        d.ellipse((cx - 16, cy - 16, cx + 16, cy + 16), outline=GOLD, width=3)
        d.line((cx - 7, cy - 7, cx + 7, cy + 7), fill=GOLD, width=4)
        d.line((cx - 7, cy + 7, cx + 7, cy - 7), fill=GOLD, width=4)
        d.text((cx + 32, cy), tx, font=capas.font(18, 700), fill=capas.WHITE, anchor="lm")
        if i < len(rows) - 1:
            d.line((x0 + 28, cy + 26, x1 - 28, cy + 26), fill=(52, 52, 58), width=1)
    capas.pill(img, "7 erros · 1 checklist", 936, 494, capas.font(16, 700))


def illus_liga(img):
    d = ImageDraw.Draw(img)
    clubes = [("Clube 10001", True), ("Outro clube", False), ("Outro clube", False)]
    for i, (nome, ouro) in enumerate(clubes):
        x0, y0 = 748, 120 + i * 96
        d.rounded_rectangle((x0, y0, x0 + 190, y0 + 74), radius=18, fill=_CARD, outline=GOLD if ouro else (90, 90, 96), width=2)
        d.text((x0 + 20, y0 + 37), nome, font=capas.font(17, 700), fill=GOLD if ouro else capas.WHITE, anchor="lm")
        d.line((x0 + 190, y0 + 37, x0 + 232, 232), fill=GOLD, width=3)
    d.rounded_rectangle((980, 160, 1140, 304), radius=22, fill=GOLD)
    d.text((1060, 214), "POOL", font=capas.font(30, 900), fill=INK, anchor="mm")
    d.text((1060, 250), "mesas e torneios", font=capas.font(14, 700), fill=INK, anchor="mm")
    capas.pill(img, "Mesas compartilhadas", 944, 440, capas.font(16, 700))



def illus_saque(img):
    x0, y0, x1, y1 = 748, 112, 1124, 432
    d = _painel(img, x0, y0, x1, y1)
    d.text((x0 + 28, y0 + 26), "SAQUE · 4 PASSOS", font=capas.font(16, 700), fill=GOLD)
    d.text((x0 + 28, y0 + 52), "No Fichas 24h", font=capas.font(15, 500), fill=_MUTED)
    rows = ["Chaves Pix", "Retirar Fichas", "Revisão de até 24 h", "Histórico de Transações"]
    for i, tx in enumerate(rows):
        cy = y0 + 118 + i * 52
        cx = x0 + 46
        d.ellipse((cx - 16, cy - 16, cx + 16, cy + 16), fill=GOLD)
        d.text((cx, cy), str(i + 1), font=capas.font(18, 900), fill=INK, anchor="mm")
        d.text((cx + 32, cy), tx, font=capas.font(18, 700), fill=capas.WHITE, anchor="lm")
        if i < len(rows) - 1:
            d.line((x0 + 28, cy + 26, x1 - 28, cy + 26), fill=(52, 52, 58), width=1)
    capas.pill(img, "Passo a passo", 936, 494, capas.font(16, 700))


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
    "prazos": illus_prazos,
    "erros": illus_erros,
    "liga": illus_liga,
    "saque": illus_saque,
}.get(tema) or illus_cartas(etiqueta)

desc = data.get("description", "")
sub = data.get("capaSubtitulo") or (desc[:110].rsplit(" ", 1)[0] + "…" if len(desc) > 110 else desc)
jpg = os.path.join(ROOT, "public", "img", "blog", SLUG, "cover.jpg")
capas.cover(jpg, SLUG, data.get("capaChamada", "Blog · Poker"), data.get("capaTitulo") or data.get("title", SLUG), sub,
            data.get("capaSelo") or None)
print("  ", ", ".join(capas_webp.variantes(jpg)))
