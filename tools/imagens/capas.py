"""Capas ilustradas por tema (1200x630): fundo preto com brilho dourado, texto à esquerda e uma ilustração à direita."""
import os
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import luxo

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
    return luxo.velvet_background(W, H)

def brand_mark(d, x, y, s):
    d.rounded_rectangle((x, y, x + s, y + s), radius=int(s * 0.28), fill=GOLD)
    d.text((x + s / 2, y + s / 2), "\u2660", font=symbol(int(s * 0.62)), fill=INK, anchor="mm")


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
    brand_mark(d, x1 - 86, y0 + 26, 58)
    # ficha e "link"
    paste(img, chip(150), (990, 330))
    d = ImageDraw.Draw(img)
    pill(img, "Convite pelo link", 865, 455, font(16, 700))


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
    brand_mark(d, 80, 534, 56)
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
    ("como-instalar-app-suprema-poker", "Guia · App", "Como instalar o app Suprema Poker e configurar sua conta", "Android, iPhone e Windows · conta, e-mail e primeiros ajustes", "Passo a passo"),
    ("como-entrar-no-clube-suprema", "Guia · Clube", "Como entrar no Clube Suprema pelo link ou com o ID", "Clube 10001 · Agente 1439098 · o que fazer se o link abrir a loja", "Clube 10001"),
    ("formatos-de-torneio-poker-online", "Guia · Torneios", "Modalidades e formatos de torneio no poker online", "NLH, PLO, freezeout, re-entry, turbo, knockout, satélite e Spin", "Para iniciantes"),
    ("guia-do-app-suprema-poker", "Guia · App", "Guia do app Suprema Poker: lobby, mesa, fichas e configurações", "Um tour pelas telas que importam, com imagens", "Tour pelo app"),
    ("spin-suprema-como-funciona-e-primeiro-grande-ganhador", "Novidade · Spin", "Spin Suprema: como funciona e o prêmio de 3.000× na primeira semana", "Roleta de multiplicador até 50.000× · R$ 100 de buy-in viraram R$ 300 mil", "Primeira semana"),
    ("perguntas-frequentes-suporte", "Suporte 24h", "Perguntas frequentes do suporte: fichas, PIX, saque e login", "As respostas mais pedidas no WhatsApp, em um lugar só", "FAQ"),
]
ONLY = os.environ.get("ONLY")
for slug, eyebrow, title, subtitle, badge in posts:
    if ONLY and slug != ONLY:
        continue
    cover(os.path.join(ROOT, "public", "img", "blog", slug, "cover.jpg"), slug, eyebrow, title, subtitle, badge)
if not ONLY:
    cover(os.path.join(ROOT, "public", "img", "og-clube-suprema.jpg"), "og", "Suprema Poker · Clube 10001", "Entre no Clube Suprema em 2 minutos", "Ação a qualquer hora, fichas por PIX na hora e suporte 24h no WhatsApp", "Somente +18")
