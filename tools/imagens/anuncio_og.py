"""Arte do anúncio "Entre no Clube Suprema em 2 minutos" (a mesma do og-clube-suprema.jpg) nos formatos da Meta:
quadrado 1080x1080 (feeds) e vertical 1080x1920 (Stories e Reels, com o texto fora das faixas que a interface cobre).

Uso (na raiz do projeto): python tools/imagens/anuncio_og.py . CAMINHO/Montserrat.ttf
Saída: marketing/anuncios/og-1080x1080.jpg e og-1080x1920.jpg
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import luxo
import logo

ROOT, FONT = sys.argv[1], sys.argv[2]
GOLD = (239, 161, 68)
WHITE = (255, 255, 255)
MUTED = (185, 187, 190)
EYEBROW = "Suprema Poker · Clube 10001"
TITLE = "Entre no Clube Suprema em 2 minutos"
SUBTITLE = "Ação a qualquer hora, fichas por PIX na hora e suporte 24h no WhatsApp"
BADGE = "Somente +18"


def font(size, weight=800):
    f = ImageFont.truetype(FONT, size)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f


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


def phone(height):
    """Mesmo recorte do celular da arte do site (capas.py → illus_og), com bordas suavizadas e sombra."""
    im = Image.open(os.path.join(ROOT, "public/img/app-mesa.webp")).crop((40, 70, 620, 900)).convert("RGBA")
    w = int(im.width * height / im.height)
    im = im.resize((w, height), Image.LANCZOS)
    mask = Image.new("L", im.size, 0)
    f = 14
    ImageDraw.Draw(mask).rounded_rectangle((f, f, w - f, height - f), radius=40, fill=255)
    im.putalpha(mask.filter(ImageFilter.GaussianBlur(f)))
    return im


def with_shadow(img, im, xy, blur=24):
    sh = Image.new("RGBA", (im.width + blur * 4, im.height + blur * 4), (0, 0, 0, 0))
    sh.paste((0, 0, 0, 255), (blur * 2, blur * 2 + 24), im.split()[3].point(lambda v: int(v * 0.6)))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(blur)), (xy[0] - blur * 2, xy[1] - blur * 2))
    img.alpha_composite(im, xy)


def footer(img, y, x=72):
    d = ImageDraw.Draw(img)
    img.alpha_composite(logo.mark_in_box(76, 1.0), (x, y))
    d.text((x + 96, y + 6), "Clube Suprema", font=font(36, 800), fill=WHITE)
    d.text((x + 96, y + 50), "suprema.blog", font=font(26, 500), fill=MUTED)
    bf = font(26, 700)
    tw = d.textlength(BADGE, font=bf)
    x1 = img.width - x
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle((x1 - tw - 52, y + 12, x1, y + 68), radius=28, fill=(14, 10, 5, 178), outline=GOLD, width=3)
    img.alpha_composite(layer)
    ImageDraw.Draw(img).text((x1 - tw - 26, y + 25), BADGE, font=bf, fill=GOLD)


def texts(img, y, title_size, sub_size, max_w, x=72):
    d = ImageDraw.Draw(img)
    d.text((x, y), EYEBROW.upper(), font=font(int(title_size * 0.36), 700), fill=GOLD)
    y += int(title_size * 0.75)
    f = font(title_size, 800)
    for ln in wrap(d, TITLE, f, max_w):
        d.text((x, y), ln, font=f, fill=WHITE)
        y += int(title_size * 1.14)
    y += int(sub_size * 0.6)
    fs = font(sub_size, 500)
    for ln in wrap(d, SUBTITLE, fs, max_w):
        d.text((x, y), ln, font=fs, fill=MUTED)
        y += int(sub_size * 1.4)
    return y


def save(img, name):
    out = os.path.join(ROOT, "marketing", "anuncios", name)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.convert("RGB").save(out, "JPEG", quality=90, optimize=True, progressive=True)
    print("ok", os.path.relpath(out, ROOT), os.path.getsize(out) // 1024, "KB")


# Quadrado: texto em cima, celular embaixo à direita, marca no rodapé.
sq = luxo.black_background(1080, 1080)
texts(sq, 76, 80, 32, 936)
ph = phone(500)
with_shadow(sq, ph, (1080 - 72 - ph.width, 470))
footer(sq, 960)
save(sq, "og-1080x1080.jpg")

# Vertical: deixa livres os ~250 px de cima e os ~340 px de baixo, que o Instagram cobre nos Stories e Reels.
vt = luxo.black_background(1080, 1920)
y = texts(vt, 270, 92, 36, 936)
ph = phone(640)
with_shadow(vt, ph, ((1080 - ph.width) // 2, y + 40))
footer(vt, y + 40 + 640 + 40)
save(vt, "og-1080x1920.jpg")
