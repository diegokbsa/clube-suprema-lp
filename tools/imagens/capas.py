"""Capas ilustradas por tema (1200x630): fundo preto com brilho dourado, texto à esquerda e uma ilustração à direita."""
import os
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import luxo
import logo

ROOT = sys.argv[1]
FONT = sys.argv[2]
SYMBOL_FONT = r"C:\Windows\Fonts\seguisym.ttf"
GOLD = (239, 161, 68)
GOLD_DARK = (190, 125, 45)
INK = (28, 28, 28)
WHITE = (255, 255, 255)
MUTED = (185, 187, 190)
GREEN = (37, 211, 102)
RED = (220, 53, 69)
W, H = 1200, 630
RIGHT = (740, 110, 1140, 500)  # área da ilustração


def font(size, weight=800, path=None):
    f = ImageFont.truetype(path or FONT, size)
    if not path:
        try:
            f.set_variation_by_axes([weight])
        except Exception:
            pass
    return f


def symbol(size):
    return ImageFont.truetype(SYMBOL_FONT, size)


def overlay(img, fn):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    fn(ImageDraw.Draw(layer))
    return Image.alpha_composite(img, layer)


def background():
    return luxo.black_background(W, H)

def logo_box(img, x, y, s):
    """Logo 'S' (degrade vivo) centralizado num quadrado s x s."""
    img.alpha_composite(logo.mark_in_box(s, 1.0), (int(x), int(y)))


def wrap(d, text, f, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=f) <= max_w:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


# ---------- peças das ilustrações ----------

def feathered(img_src, box_size, radius=28, feather=18):
    """Redimensiona uma imagem para o tamanho dado e suaviza as bordas (cantos arredondados + degradê)."""
    im = img_src.convert("RGBA").resize(box_size, Image.LANCZOS)
    mask = Image.new("L", box_size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((feather, feather, box_size[0] - feather, box_size[1] - feather), radius=radius, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(feather))
    im.putalpha(mask)
    return im


def phone_from(path, crop, height):
    im = Image.open(path).crop(crop)
    w = int(im.width * height / im.height)
    return feathered(im, (w, height), radius=40, feather=14)


def card(rank, suit, w=120, h=168, angle=0):
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=14, fill=WHITE, outline=(200, 200, 200))
    color = RED if suit in "\u2665\u2666" else INK
    d.text((14, 10), rank, font=font(34, 800), fill=color)
    d.text((16, 48), suit, font=symbol(30), fill=color)
    d.text((w / 2, h / 2 + 18), suit, font=symbol(84), fill=color, anchor="mm")
    if angle:
        im = im.rotate(angle, expand=True, resample=Image.BICUBIC)
    return im


def chip(size, color=GOLD, label="\u2660"):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for i in range(16):
        d.pieslice((0, 0, size - 1, size - 1), i * 22.5, (i + 1) * 22.5, fill=color if i % 2 == 0 else INK)
    r = size * 0.36
    d.ellipse((size / 2 - r, size / 2 - r, size / 2 + r, size / 2 + r), fill=INK)
    d.ellipse((size / 2 - r, size / 2 - r, size / 2 + r, size / 2 + r), outline=color, width=max(2, size // 40))
    if label == "\u2660":
        m = logo.mark(size * 0.46, None if color == GOLD else color)
        im.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    else:
        d.text((size / 2, size / 2), label, font=symbol(int(size * 0.34)), fill=color, anchor="mm")
    return im


def shadow(im, blur=18, offset=(0, 18), alpha=150):
    sh = Image.new("RGBA", (im.width + blur * 4, im.height + blur * 4), (0, 0, 0, 0))
    a = im.split()[3].point(lambda v: int(v * alpha / 255))
    sh.paste((0, 0, 0, 255), (blur * 2 + offset[0], blur * 2 + offset[1]), a)
    return sh.filter(ImageFilter.GaussianBlur(blur))


def paste(img, im, xy, with_shadow=True):
    if with_shadow:
        sh = shadow(im)
        img.alpha_composite(sh, (xy[0] - 36, xy[1] - 36))
    img.alpha_composite(im, xy)


def pill(img, text, cx, cy, f, fill=(14, 10, 5, 178), outline=GOLD, color=(250, 208, 125), pad=18):
    tw = ImageDraw.Draw(img).textlength(text, font=f)
    th = f.size

    def cap(d):
        d.rounded_rectangle((cx - tw / 2 - pad, cy - th / 2 - 10, cx + tw / 2 + pad, cy + th / 2 + 10), radius=th, fill=fill, outline=outline, width=2)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    cap(ImageDraw.Draw(layer))
    img.alpha_composite(layer)
    ImageDraw.Draw(img).text((cx, cy), text, font=f, fill=color, anchor="mm")


# ---------- ilustrações por tema ----------

def illus_instalar(img):
    ph = phone_from(os.path.join(ROOT, "public/img/app-abertura.webp"), (250, 90, 700, 836), 400)
    x = 980 - ph.width // 2
    paste(img, ph, (x, 95))
    d = ImageDraw.Draw(img)
    # selo de download
    cx, cy = x + 10, 420
    d.ellipse((cx - 44, cy - 44, cx + 44, cy + 44), fill=GOLD)
    d.line((cx, cy - 20, cx, cy + 14), fill=INK, width=9)
    d.polygon([(cx - 18, cy + 4), (cx + 18, cy + 4), (cx, cy + 24)], fill=INK)
    d.line((cx - 20, cy + 30, cx + 20, cy + 30), fill=INK, width=7)
    f = font(16, 700)
    for i, t in enumerate(["Android", "iPhone", "Windows"]):
        pill(img, t, 790 + i * 125, 522, f)


def illus_entrar(img):
    d = ImageDraw.Draw(img)
    # cartão do clube
    x0, y0, x1, y1 = 760, 150, 1130, 400
    d.rounded_rectangle((x0 + 6, y0 + 10, x1 + 6, y1 + 10), radius=26, fill=(0, 0, 0, 140))
    d.rounded_rectangle((x0, y0, x1, y1), radius=26, fill=(26, 26, 29, 255), outline=GOLD, width=2)
    d.text((x0 + 28, y0 + 26), "CLUBE SUPREMA", font=font(16, 700), fill=GOLD)
    d.text((x0 + 28, y0 + 56), "ID do clube", font=font(16, 500), fill=MUTED)
    d.text((x0 + 28, y0 + 80), "10001", font=font(58, 800), fill=WHITE)
    d.text((x0 + 28, y0 + 160), "Agente", font=font(16, 500), fill=MUTED)
    d.text((x0 + 28, y0 + 184), "1439098", font=font(40, 800), fill=GOLD)
    logo_box(img, x1 - 86, y0 + 26, 58)
    # ficha e "link"
    paste(img, chip(150), (990, 330))
    d = ImageDraw.Draw(img)
    pill(img, "Convite pelo link", 865, 455, font(16, 700))


def illus_clubes(img):
    """Três cartões de clube empilhados; o da frente é o Clube Suprema (ID 10001)."""
    def card_layer(x0, y0, alpha, fill_alpha):
        def draw(d):
            d.rounded_rectangle((x0 + 6, y0 + 10, x0 + 336, y0 + 186), radius=24, fill=(0, 0, 0, int(120 * alpha)))
            d.rounded_rectangle((x0, y0, x0 + 330, y0 + 176), radius=24, fill=(26, 26, 29, fill_alpha), outline=GOLD + (int(255 * alpha),), width=2)
        return draw

    # cartões de trás (outros clubes, só o contorno e IDs ocultos)
    for x0, y0, a, name, cid in ((830, 104, 0.35, "CLUBE", "ID ••••"), (790, 176, 0.6, "CLUBE", "ID ••••")):
        img.alpha_composite(overlay(Image.new("RGBA", img.size, (0, 0, 0, 0)), card_layer(x0, y0, a, int(255 * (0.55 + a / 2)))))
        d = ImageDraw.Draw(img)
        d.text((x0 + 24, y0 + 24), f"{name}  ·  {cid}", font=font(15, 700), fill=tuple(int(c * a) for c in GOLD))
    # cartão da frente
    x0, y0 = 750, 250
    img.alpha_composite(overlay(Image.new("RGBA", img.size, (0, 0, 0, 0)), card_layer(x0, y0, 1.0, 255)))
    d = ImageDraw.Draw(img)
    d.text((x0 + 26, y0 + 24), "CLUBE SUPREMA", font=font(16, 700), fill=GOLD)
    d.text((x0 + 26, y0 + 52), "ID do clube", font=font(15, 500), fill=MUTED)
    d.text((x0 + 26, y0 + 74), "10001", font=font(54, 800), fill=WHITE)
    d.text((x0 + 26, y0 + 140), "Agente 1439098", font=font(16, 700), fill=GOLD)
    logo_box(img, x0 + 330 - 84, y0 + 22, 56)
    pill(img, "Entrar · Trocar · Sair", 915, 480, font(16, 700))


def illus_maiores(img):
    """Três pilhas de fichas crescentes; a maior tem a ficha com o logo no topo."""
    base_y = 450
    for i, (x, n) in enumerate(((790, 3), (900, 5), (1010, 8))):
        for k in range(n):
            col = GOLD if k % 2 == 0 else (70, 70, 76)
            im = chip(120, col).resize((120, 46))
            paste(img, im, (x, base_y - k * 22), with_shadow=(k == 0))
        if i == 2:
            paste(img, chip(120, GOLD), (x, base_y - n * 22 - 70), with_shadow=False)
    d = ImageDraw.Draw(img)
    d.text((1070, 172), "#1", font=font(40, 900), fill=GOLD, anchor="mm")
    pill(img, "Grupo SX · Liga Suprema", 935, 548, font(16, 700))


def illus_pool(img):
    """Pool da liga: um anel central ligado a vários clubes; o Clube Suprema em destaque."""
    import math as _m
    cx, cy, R = 940, 300, 165
    nodes = []
    for k in range(6):
        a = _m.radians(-90 + k * 60)
        nodes.append((cx + R * _m.cos(a), cy + R * _m.sin(a)))

    def lines(d):
        for x, y in nodes:
            d.line((cx, cy, x, y), fill=GOLD + (120,), width=3)
    img.alpha_composite(overlay(Image.new("RGBA", img.size, (0, 0, 0, 0)), lines))
    d = ImageDraw.Draw(img)
    d.ellipse((cx - 70, cy - 70, cx + 70, cy + 70), fill=(26, 26, 29), outline=GOLD, width=4)
    d.text((cx, cy - 12), "POOL", font=font(28, 900), fill=WHITE, anchor="mm")
    d.text((cx, cy + 20), "Liga Suprema", font=font(14, 700), fill=GOLD, anchor="mm")
    for k, (x, y) in enumerate(nodes):
        if k == 2:
            d.rounded_rectangle((x - 74, y - 34, x + 74, y + 34), radius=16, fill=(26, 26, 29), outline=GOLD, width=3)
            logo_box(img, x - 66, y - 22, 44)
            d = ImageDraw.Draw(img)
            d.text((x - 16, y - 12), "Clube", font=font(13, 700), fill=MUTED)
            d.text((x - 16, y + 2), "10001", font=font(20, 900), fill=WHITE)
        else:
            d.ellipse((x - 26, y - 26, x + 26, y + 26), fill=(36, 36, 40), outline=GOLD + (160,), width=2)
            d.text((x, y), "clube", font=font(11, 700), fill=MUTED, anchor="mm")
    pill(img, "Mesas compartilhadas", 940, 540, font(16, 700))


def illus_pc(img):
    """Notebook com o logo e o ID do clube na tela, selo de download e pílulas dos sistemas."""
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = 730, 140, 1070, 365
    d.rounded_rectangle((x0 - 14, y0 - 14, x1 + 14, y1 + 14), radius=22, fill=(48, 48, 54), outline=(90, 90, 96), width=2)
    d.rounded_rectangle((x0, y0, x1, y1), radius=8, fill=(8, 8, 9))
    d.polygon([(x0 - 60, y1 + 24), (x1 + 60, y1 + 24), (x1 + 90, y1 + 52), (x0 - 90, y1 + 52)], fill=(64, 64, 70))
    d.rounded_rectangle((x0 + 120, y1 + 26, x1 - 120, y1 + 36), radius=5, fill=(40, 40, 44))
    logo_box(img, (x0 + x1) // 2 - 40, y0 + 34, 80)
    d = ImageDraw.Draw(img)
    d.text(((x0 + x1) / 2, y0 + 140), "SUPREMA POKER", font=font(22, 900), fill=WHITE, anchor="mm")
    d.text(((x0 + x1) / 2, y0 + 176), "Clube 10001 · Agente 1439098", font=font(15, 700), fill=GOLD, anchor="mm")
    cx, cy = x1 + 10, y0 + 10
    d.ellipse((cx - 42, cy - 42, cx + 42, cy + 42), fill=GOLD)
    d.line((cx, cy - 20, cx, cy + 12), fill=INK, width=8)
    d.polygon([(cx - 16, cy + 2), (cx + 16, cy + 2), (cx, cy + 20)], fill=INK)
    d.line((cx - 18, cy + 27, cx + 18, cy + 27), fill=INK, width=6)
    fs = font(16, 700)
    for i, t in enumerate(["Windows", "Notebook", "MacBook"]):
        pill(img, t, 815 + i * 125, 520, fs)


def illus_naoabre(img):
    """Celular com o app e um selo de recarregar; pílula 'Reinstalar e entrar no 10001'."""
    import math as _m
    ph = phone_from(os.path.join(ROOT, "public/img/app-abertura.webp"), (250, 90, 700, 836), 390)
    x = 960 - ph.width // 2
    paste(img, ph, (x, 95))
    d = ImageDraw.Draw(img)
    cx, cy, r = x + 20, 400, 48
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=GOLD)
    d.arc((cx - 26, cy - 26, cx + 26, cy + 26), start=-60, end=250, fill=INK, width=8)
    a = _m.radians(-60)
    ax, ay = cx + 26 * _m.cos(a), cy + 26 * _m.sin(a)
    d.polygon([(ax + 4, ay - 16), (ax + 16, ay + 6), (ax - 10, ay + 4)], fill=INK)
    pill(img, "Reinstalar → Clube 10001", 960, 528, font(17, 700))


def illus_sair(img):
    """Cartão de um clube antigo (apagado, saldo zerado) com seta de saída; na frente, o Clube Suprema (ID 10001)."""
    # cartão de trás: clube antigo
    bx0, by0 = 830, 112

    def back(d):
        d.rounded_rectangle((bx0 + 6, by0 + 10, bx0 + 306, by0 + 166), radius=22, fill=(0, 0, 0, 70))
        d.rounded_rectangle((bx0, by0, bx0 + 300, by0 + 156), radius=22, fill=(26, 26, 29, 170), outline=GOLD + (110,), width=2)
    img.alpha_composite(overlay(Image.new("RGBA", img.size, (0, 0, 0, 0)), back))
    d = ImageDraw.Draw(img)
    dim = tuple(int(c * 0.55) for c in GOLD)
    d.text((bx0 + 24, by0 + 22), "CLUBE  ·  ID ••••", font=font(15, 700), fill=dim)
    d.text((bx0 + 24, by0 + 62), "Saldo", font=font(15, 500), fill=(120, 122, 126))
    d.text((bx0 + 24, by0 + 84), "0,00", font=font(40, 800), fill=(150, 152, 156))
    # selo de saída (seta para fora)
    cx, cy, r = bx0 + 300, by0 + 20, 40
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=GOLD)
    d.rectangle((cx - 20, cy - 16, cx - 4, cy + 16), outline=INK, width=5)
    d.line((cx - 8, cy, cx + 16, cy), fill=INK, width=7)
    d.polygon([(cx + 24, cy), (cx + 10, cy - 13), (cx + 10, cy + 13)], fill=INK)
    # cartão da frente: Clube Suprema
    x0, y0 = 750, 262

    def front(dd):
        dd.rounded_rectangle((x0 + 6, y0 + 10, x0 + 336, y0 + 186), radius=24, fill=(0, 0, 0, 130))
        dd.rounded_rectangle((x0, y0, x0 + 330, y0 + 176), radius=24, fill=(26, 26, 29, 255), outline=GOLD, width=2)
    img.alpha_composite(overlay(Image.new("RGBA", img.size, (0, 0, 0, 0)), front))
    d = ImageDraw.Draw(img)
    d.text((x0 + 26, y0 + 24), "CLUBE SUPREMA", font=font(16, 700), fill=GOLD)
    d.text((x0 + 26, y0 + 52), "ID do clube", font=font(15, 500), fill=MUTED)
    d.text((x0 + 26, y0 + 74), "10001", font=font(54, 800), fill=WHITE)
    d.text((x0 + 26, y0 + 140), "Agente 1439098", font=font(16, 700), fill=GOLD)
    logo_box(img, x0 + 330 - 84, y0 + 22, 56)
    pill(img, "Sacar → Sair → Entrar", 915, 500, font(16, 700))


def illus_fichas24(img):
    """Celular com um QR Code PIX e uma pilha de fichas; pílula 'PIX no seu CPF'."""
    import random as _r
    d = ImageDraw.Draw(img)
    # celular
    px0, py0, px1, py1 = 770, 92, 1000, 500
    d.rounded_rectangle((px0 + 8, py0 + 14, px1 + 8, py1 + 14), radius=36, fill=(0, 0, 0, 150))
    d.rounded_rectangle((px0, py0, px1, py1), radius=36, fill=(48, 48, 54), outline=(90, 90, 96), width=2)
    d.rounded_rectangle((px0 + 12, py0 + 12, px1 - 12, py1 - 12), radius=26, fill=(14, 14, 16))
    d.rounded_rectangle(((px0 + px1) // 2 - 30, py0 + 22, (px0 + px1) // 2 + 30, py0 + 30), radius=4, fill=(48, 48, 54))
    d.text(((px0 + px1) / 2, py0 + 62), "Comprar fichas", font=font(17, 800), fill=WHITE, anchor="mm")
    # QR Code (padrão fixo, só ilustrativo)
    n, cell = 21, 7
    qx = (px0 + px1) // 2 - n * cell // 2
    qy = py0 + 92
    d.rounded_rectangle((qx - 12, qy - 12, qx + n * cell + 12, qy + n * cell + 12), radius=12, fill=WHITE)
    rnd = _r.Random(24)
    finder = [(0, 0), (n - 7, 0), (0, n - 7)]

    def in_finder(i, j):
        return any(fx <= i < fx + 7 and fy <= j < fy + 7 for fx, fy in finder)
    for i in range(n):
        for j in range(n):
            if not in_finder(i, j) and rnd.random() < 0.48:
                d.rectangle((qx + i * cell, qy + j * cell, qx + i * cell + cell - 1, qy + j * cell + cell - 1), fill=INK)
    for fx, fy in finder:
        x, y = qx + fx * cell, qy + fy * cell
        d.rectangle((x, y, x + 7 * cell - 1, y + 7 * cell - 1), fill=INK)
        d.rectangle((x + cell, y + cell, x + 6 * cell - 1, y + 6 * cell - 1), fill=WHITE)
        d.rectangle((x + 2 * cell, y + 2 * cell, x + 5 * cell - 1, y + 5 * cell - 1), fill=INK)
    # botão PIX
    by = qy + n * cell + 34
    d.rounded_rectangle((px0 + 34, by, px1 - 34, by + 46), radius=23, fill=GOLD)
    d.text(((px0 + px1) / 2, by + 23), "Pagar com PIX", font=font(17, 800), fill=INK, anchor="mm")
    d.text(((px0 + px1) / 2, by + 74), "Copia e cola", font=font(14, 600), fill=MUTED, anchor="mm")
    # pilha de fichas ao lado
    for k, col in enumerate([GOLD, (70, 70, 76), GOLD]):
        im = chip(130, col).resize((130, 52))
        paste(img, im, (1000, 420 - k * 20), with_shadow=(k == 0))
    paste(img, chip(130, GOLD), (1000, 290), with_shadow=False)
    pill(img, "PIX no seu CPF", 1065, 535, font(16, 700))


def illus_torneios(img):
    cards = [("A", "\u2660", -22, (780, 185)), ("K", "\u2665", -4, (860, 160)), ("Q", "\u2666", 16, (948, 170))]
    for rank, suit, ang, pos in cards:
        paste(img, card(rank, suit, angle=ang), pos)
    # pilha de fichas
    for i, (c, dy) in enumerate([(GOLD, 0), (INK, -14), (GOLD, -28)]):
        im = chip(130, c if c != INK else (60, 60, 66))
        im = im.resize((130, 54))
        paste(img, im, (1000, 420 + dy), with_shadow=(i == 0))
    paste(img, chip(130, GOLD), (1000, 300), with_shadow=False)
    d = ImageDraw.Draw(img)
    pill(img, "NLH · PLO · Spin", 860, 455, font(16, 700))


def illus_guia(img):
    ph = phone_from(os.path.join(ROOT, "public/img/app-mesa.webp"), (40, 70, 620, 900), 420)
    paste(img, ph, (960 - ph.width // 2, 95))
    d = ImageDraw.Draw(img)
    pill(img, "Mesa · Lobby · Fichas", 940, 535, font(16, 700))


def illus_faq(img):
    d = ImageDraw.Draw(img)
    # balão verde (WhatsApp) e balão escuro com perguntas
    d.rounded_rectangle((770, 150, 1040, 230), radius=26, fill=GREEN)
    d.polygon([(790, 228), (770, 252), (812, 232)], fill=GREEN)
    d.text((796, 166), "Suporte 24h online", font=font(22, 800), fill=(5, 46, 20))
    d.text((796, 198), "Como posso ajudar?", font=font(16, 500), fill=(5, 46, 20))
    d.rounded_rectangle((850, 280, 1130, 360), radius=26, fill=(36, 36, 40), outline=GOLD, width=2)
    d.polygon([(1108, 358), (1130, 382), (1088, 360)], fill=(36, 36, 40))
    d.text((876, 294), "Paguei o PIX e as fichas", font=font(18, 700), fill=WHITE)
    d.text((876, 322), "não caíram. E agora?", font=font(18, 700), fill=WHITE)
    d.rounded_rectangle((770, 400, 1075, 470), radius=24, fill=GREEN)
    d.text((796, 416), "Me manda o comprovante", font=font(17, 700), fill=(5, 46, 20))
    d.text((796, 440), "e seu ID da Suprema", font=font(15, 500), fill=(5, 46, 20))
    pill(img, "PIX · Saque · Login", 1000, 528, font(16, 700))


def illus_spin(img):
    src = Image.open(os.path.join(ROOT, "public/img/blog/spin-suprema-como-funciona-e-primeiro-grande-ganhador/spin-suprema-mesa-multiplicador-3000x.webp"))
    shot = feathered(src.crop((70, 560, 666, 935)), (400, 252), radius=30, feather=12)
    paste(img, shot, (760, 118))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((812, 384, 1092, 460), radius=38, fill=GOLD)
    d.text((952, 422), "3.000\u00d7", font=font(44, 900), fill=INK, anchor="mm")
    pill(img, "R$ 100 \u2192 R$ 300 mil", 952, 512, font(17, 700))


def illus_og(img):
    ph = phone_from(os.path.join(ROOT, "public/img/app-mesa.webp"), (40, 70, 620, 900), 440)
    paste(img, ph, (970 - ph.width // 2, 90))


ILLUS = {
    "como-instalar-app-suprema-poker": illus_instalar,
    "como-entrar-no-clube-suprema": illus_entrar,
    "formatos-de-torneio-poker-online": illus_torneios,
    "guia-do-app-suprema-poker": illus_guia,
    "perguntas-frequentes-suporte": illus_faq,
    "spin-suprema-como-funciona-e-primeiro-grande-ganhador": illus_spin,
    "clubes-suprema-poker": illus_clubes,
    "maiores-e-melhores-clubes-suprema-poker": illus_maiores,
    "id-clube-h2-suprema-poker-pool-liga-suprema": illus_pool,
    "como-baixar-suprema-poker-no-pc": illus_pc,
    "app-suprema-poker-nao-abre": illus_naoabre,
    "como-sair-do-clube-suprema-poker": illus_sair,
    "fichas-24-horas-suprema-poker-pix": illus_fichas24,
    "og": illus_og,
}


def cover(path, key, eyebrow, title, subtitle, badge=None):
    img = background()
    ILLUS[key](img)
    d = ImageDraw.Draw(img)
    d.text((80, 96), eyebrow.upper(), font=font(22, 700), fill=GOLD)
    size = 56
    f = font(size, 800)
    lines = wrap(d, title, f, 620)
    while len(lines) > 3 and size > 40:
        size -= 2
        f = font(size, 800)
        lines = wrap(d, title, f, 620)
    y = 146
    for ln in lines:
        d.text((80, y), ln, font=f, fill=WHITE)
        y += int(size * 1.16)
    fs = font(22, 500)
    y += 12
    for ln in wrap(d, subtitle, fs, 620)[:3]:
        d.text((80, y), ln, font=fs, fill=MUTED)
        y += 31
    logo_box(img, 80, 534, 56)
    d.text((152, 540), "Clube Suprema", font=font(26, 800), fill=WHITE)
    d.text((152, 572), "suprema.blog" if key == "og" else "Blog · suprema.blog", font=font(18, 500), fill=MUTED)
    if badge:
        bf = font(18, 700)
        tw = d.textlength(badge, font=bf)
        x0 = 640 - tw - 36

        def pl(dd):
            dd.rounded_rectangle((x0, 548, 640, 590), radius=21, fill=(14, 10, 5, 178), outline=GOLD, width=2)
        img = overlay(img, pl)
        ImageDraw.Draw(img).text((x0 + 18, 559), badge, font=bf, fill=GOLD)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.convert("RGB").save(path, "JPEG", quality=86, optimize=True, progressive=True)
    print("ok", os.path.relpath(path, ROOT), os.path.getsize(path) // 1024, "KB")


posts = [
    ("como-instalar-app-suprema-poker", "Guia · App", "Como baixar o Suprema Poker no celular", "Android e iPhone · conta, e-mail e primeiros ajustes para entrar no clube", "Passo a passo"),
    ("maiores-e-melhores-clubes-suprema-poker", "Guia · Clubes", "Maiores e melhores clubes do Suprema Poker", "Por que o tamanho vem da liga, o que avaliar antes de depositar e onde jogar", "Clube 10001"),
    ("id-clube-h2-suprema-poker-pool-liga-suprema", "Guia · Ligas", "ID do clube H2 no Suprema Poker e o pool da Liga Suprema", "Como entrar no H2Club, o que é o pool e como jogar nas mesas compartilhadas da liga", "Liga Suprema"),
    ("como-baixar-suprema-poker-no-pc", "Tutorial · PC", "Como baixar o Suprema Poker no PC, notebook e MacBook", "Instalador oficial, conta e entrada no Clube Suprema com o ID 10001", "Passo a passo"),
    ("app-suprema-poker-nao-abre", "Suporte · App", "App Suprema Poker não abre? Como resolver e reinstalar", "Android, iPhone e PC, sem perder a conta, e de volta ao clube 10001", "Resolva já"),
    ("clubes-suprema-poker", "Guia · Clubes", "Clubes do Suprema Poker: como funcionam, ID, como entrar e sair", "O que é um clube, ID do clube e do agente, jogar em vários clubes e escolher um confiável", "Guia completo"),
    ("como-entrar-no-clube-suprema", "Guia · Clube", "Como entrar no Clube Suprema pelo link ou com o ID", "Clube 10001 · Agente 1439098 · o que fazer se o link abrir a loja", "Clube 10001"),
    ("formatos-de-torneio-poker-online", "Guia · Torneios", "Modalidades e formatos de torneio no poker online", "NLH, PLO, freezeout, re-entry, turbo, knockout, satélite e Spin", "Para iniciantes"),
    ("guia-do-app-suprema-poker", "Guia · App", "Guia do app Suprema Poker: lobby, mesa, fichas e configurações", "Um tour pelas telas que importam, com imagens", "Tour pelo app"),
    ("spin-suprema-como-funciona-e-primeiro-grande-ganhador", "Novidade · Spin", "Spin Suprema: como funciona e o prêmio de 3.000× na primeira semana", "Roleta de multiplicador até 50.000× · R$ 100 de buy-in viraram R$ 300 mil", "Primeira semana"),
    ("perguntas-frequentes-suporte", "Suporte 24h", "Perguntas frequentes do suporte: fichas, PIX, saque e login", "As respostas mais pedidas no WhatsApp, em um lugar só", "FAQ"),
    ("como-sair-do-clube-suprema-poker", "Guia · Clubes", "Como sair do clube no Suprema Poker", "Saque o saldo antes, onde fica a opção, quem remove e como entrar no clube 10001", "Passo a passo"),
    ("fichas-24-horas-suprema-poker-pix", "Guia · Fichas", "Fichas 24 Horas: como comprar fichas do Suprema Poker por PIX", "Conta, ID da Suprema, verificação, QR Code no seu CPF e saque", "Guia completo"),
]
ONLY = os.environ.get("ONLY")
for slug, eyebrow, title, subtitle, badge in posts:
    if ONLY and slug != ONLY:
        continue
    cover(os.path.join(ROOT, "public", "img", "blog", slug, "cover.jpg"), slug, eyebrow, title, subtitle, badge)
if not ONLY:
    cover(os.path.join(ROOT, "public", "img", "og-clube-suprema.jpg"), "og", "Suprema Poker · Clube 10001", "Entre no Clube Suprema em 2 minutos", "Ação a qualquer hora, fichas por PIX na hora e suporte 24h no WhatsApp", "Somente +18")
