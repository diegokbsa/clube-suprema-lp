"""Capa do canal no YouTube (2560x1440), no mesmo estilo da capa do Bluesky (capa_bluesky.py).
O YouTube corta conforme o aparelho: no celular e no computador só aparece a faixa do meio (1546x423, área segura),
na TV aparece tudo. Por isso texto e celular ficam dentro da área segura, e o resto é só fundo.

Uso (na raiz do projeto): python tools/imagens/capa_youtube.py . CAMINHO/Montserrat.ttf
Saída: marketing/redes/youtube-capa-2560x1440.jpg
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import luxo

ROOT, FONT = sys.argv[1], sys.argv[2]
W, H = 2560, 1440
SAFE = ((W - 1546) // 2, (H - 423) // 2, (W + 1546) // 2, (H + 423) // 2)  # x0, y0, x1, y1
GOLD = (239, 161, 68)
WHITE = (255, 255, 255)
MUTED = (185, 187, 190)
EYEBROW = "Suprema Poker · Clube 10001"
TITLE = "Clube Suprema"
SUBTITLE = ["Tutoriais do app Suprema Poker, fichas por PIX", "e suporte 24h no WhatsApp"]
BADGE = "Somente +18"


def font(size, weight=800):
    f = ImageFont.truetype(FONT, size)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f


def phone(height):
    """Mesmo recorte do celular da arte do site, com bordas suavizadas."""
    im = Image.open(os.path.join(ROOT, "public/img/app-mesa.webp")).crop((40, 70, 620, 900)).convert("RGBA")
    w = int(im.width * height / im.height)
    im = im.resize((w, height), Image.LANCZOS)
    mask = Image.new("L", im.size, 0)
    f = 12
    ImageDraw.Draw(mask).rounded_rectangle((f, f, w - f, height - f), radius=34, fill=255)
    im.putalpha(mask.filter(ImageFilter.GaussianBlur(f)))
    return im


def with_shadow(img, im, xy, blur=20):
    sh = Image.new("RGBA", (im.width + blur * 4, im.height + blur * 4), (0, 0, 0, 0))
    sh.paste((0, 0, 0, 255), (blur * 2, blur * 2 + 18), im.split()[3].point(lambda v: int(v * 0.6)))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(blur)), (xy[0] - blur * 2, xy[1] - blur * 2))
    img.alpha_composite(im, xy)


img = luxo.black_background(W, H)
d = ImageDraw.Draw(img)
x0, y0, x1, y1 = SAFE

# Texto à esquerda da área segura, celular à direita, os dois dentro dos 423 px de altura.
x, y = x0 + 40, y0 + 30
d.text((x, y), EYEBROW.upper(), font=font(30, 700), fill=GOLD)
d.text((x, y + 44), TITLE, font=font(104, 800), fill=WHITE)
fs = font(32, 500)
for i, line in enumerate(SUBTITLE):
    d.text((x, y + 176 + i * 44), line, font=fs, fill=MUTED)

by = y + 290
bf = font(28, 700)
tw = d.textlength(BADGE, font=bf)
layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
ImageDraw.Draw(layer).rounded_rectangle((x, by, x + tw + 52, by + 58), radius=29, fill=(14, 10, 5, 178), outline=GOLD, width=3)
img.alpha_composite(layer)
ImageDraw.Draw(img).text((x + 26, by + 13), BADGE, font=bf, fill=GOLD)
d = ImageDraw.Draw(img)
d.text((x + tw + 84, by + 13), "suprema.blog", font=font(28, 600), fill=WHITE)

ph = phone(400)
with_shadow(img, ph, (x1 - 60 - ph.width, y0 + 12))

out = os.path.join(ROOT, "marketing", "redes", "youtube-capa-2560x1440.jpg")
os.makedirs(os.path.dirname(out), exist_ok=True)
img.convert("RGB").save(out, "JPEG", quality=90, optimize=True, progressive=True)
print("ok", os.path.relpath(out, ROOT), os.path.getsize(out) // 1024, "KB")

