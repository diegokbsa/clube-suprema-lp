"""Capa do perfil no Bluesky (1500x500, 3:1), no mesmo estilo da arte do site (anuncio_og.py).
O avatar do Bluesky cobre o canto de baixo à esquerda, então o texto fica no meio e o celular à direita.

Uso (na raiz do projeto): python tools/imagens/capa_bluesky.py . CAMINHO/Montserrat.ttf
Saída: marketing/redes/bluesky-capa-1500x500.jpg
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import luxo

ROOT, FONT = sys.argv[1], sys.argv[2]
GOLD = (239, 161, 68)
WHITE = (255, 255, 255)
MUTED = (185, 187, 190)
EYEBROW = "Suprema Poker · Clube 10001"
TITLE = "Clube Suprema"
SUBTITLE = ["Poker online 24h direto no celular", "Fichas por PIX · suporte 24h no WhatsApp"]
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


img = luxo.black_background(1500, 500)
d = ImageDraw.Draw(img)

# Texto na faixa do meio (x 330 a ~1000): longe do avatar (canto de baixo à esquerda) e do celular à direita.
x, y = 330, 78
d.text((x, y), EYEBROW.upper(), font=font(26, 700), fill=GOLD)
d.text((x, y + 40), TITLE, font=font(88, 800), fill=WHITE)
fs = font(28, 500)
for i, line in enumerate(SUBTITLE):
    d.text((x, y + 152 + i * 40), line, font=fs, fill=MUTED)

by = y + 252
bf = font(24, 700)
tw = d.textlength(BADGE, font=bf)
layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
ImageDraw.Draw(layer).rounded_rectangle((x, by, x + tw + 48, by + 52), radius=26, fill=(14, 10, 5, 178), outline=GOLD, width=3)
img.alpha_composite(layer)
ImageDraw.Draw(img).text((x + 24, by + 12), BADGE, font=bf, fill=GOLD)
d = ImageDraw.Draw(img)
d.text((x + tw + 76, by + 12), "suprema.blog", font=font(24, 600), fill=WHITE)

ph = phone(420)
with_shadow(img, ph, (1500 - 70 - ph.width, 40))

out = os.path.join(ROOT, "marketing", "redes", "bluesky-capa-1500x500.jpg")
os.makedirs(os.path.dirname(out), exist_ok=True)
img.convert("RGB").save(out, "JPEG", quality=90, optimize=True, progressive=True)
print("ok", os.path.relpath(out, ROOT), os.path.getsize(out) // 1024, "KB")
