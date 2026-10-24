"""Kit do canal do YouTube do Clube Suprema no estilo das pecas oficiais da Suprema (camada 'luxo').

Gera na pasta de saida: banner 2560x1440 (area segura 1546x423), perfil 800x800, marca d'agua 150x150 e previews.
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import luxo
from luxo import GOLD, GOLD_LIGHT, INK, WHITE, MUTED

OUT = sys.argv[1]
FONT = sys.argv[2]
SYMBOL_FONT = r"C:\Windows\Fonts\seguisym.ttf"
GREEN = (37, 211, 102)
RED = (220, 53, 69)
DARK = (28, 28, 28)
os.makedirs(OUT, exist_ok=True)


def font(size, weight=800):
    f = ImageFont.truetype(FONT, size)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f


def symbol(size):
    return ImageFont.truetype(SYMBOL_FONT, size)


def brand_mark(size, alpha=255):
    im = luxo.gold_rounded(size, size, int(size * 0.28))
    ImageDraw.Draw(im).text((size / 2, size / 2 + size * 0.02), "\u2660", font=symbol(int(size * 0.62)), fill=INK + (255,), anchor="mm")
    if alpha < 255:
        im.putalpha(im.split()[3].point(lambda v: int(v * alpha / 255)))
    return im


def card(rank, suit, w=120, h=168, angle=0):
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=int(w * 0.12), fill=WHITE, outline=(200, 200, 200))
    color = RED if suit in "\u2665\u2666" else DARK
    d.text((int(w * 0.12), int(h * 0.06)), rank, font=font(int(w * 0.28), 800), fill=color)
    d.text((int(w * 0.13), int(h * 0.29)), suit, font=symbol(int(w * 0.25)), fill=color)
    d.text((w / 2, h / 2 + h * 0.1), suit, font=symbol(int(w * 0.7)), fill=color, anchor="mm")
    if angle:
        im = im.rotate(angle, expand=True, resample=Image.BICUBIC)
    return im


def chip(size, color=GOLD, label="\u2660"):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for i in range(16):
        d.pieslice((0, 0, size - 1, size - 1), i * 22.5, (i + 1) * 22.5, fill=color if i % 2 == 0 else DARK)
    if color == GOLD:  # segmentos dourados com degrade
        grad = luxo.gold_gradient(size, size)
        mask = Image.new("L", (size, size), 0)
        md = ImageDraw.Draw(mask)
        for i in range(0, 16, 2):
            md.pieslice((0, 0, size - 1, size - 1), i * 22.5, (i + 1) * 22.5, fill=255)
        grad.putalpha(mask)
        im = Image.alpha_composite(im, grad)
        d = ImageDraw.Draw(im)
    r = size * 0.36
    d.ellipse((size / 2 - r, size / 2 - r, size / 2 + r, size / 2 + r), fill=DARK)
    d.ellipse((size / 2 - r, size / 2 - r, size / 2 + r, size / 2 + r), outline=color, width=max(2, size // 40))
    d.text((size / 2, size / 2), label, font=symbol(int(size * 0.34)), fill=color, anchor="mm")
    return im


# ------------------------------------------------------------------ banner
W, H = 2560, 1440
SAFE_W, SAFE_H = 1546, 423
SX0, SY0 = (W - SAFE_W) // 2, (H - SAFE_H) // 2  # 507, 508
SX1, SY1 = SX0 + SAFE_W, SY0 + SAFE_H            # 2053, 931


def banner():
    img = luxo.sophisticated_background(W, H, bars=False)

    # decoracao fora da area segura (aparece no desktop e na TV)
    luxo.paste(img, chip(250), (120, SY0 + 70))
    luxo.paste(img, chip(170, color=(226, 226, 226), label="\u2663"), (330, SY0 + 230))
    luxo.paste(img, card("A", "\u2660", 150, 210, angle=14), (60, SY0 + 160))
    luxo.paste(img, card("K", "\u2665", 160, 224, angle=-18), (2140, SY0 + 110))
    luxo.paste(img, card("Q", "\u2666", 160, 224, angle=-4), (2270, SY0 + 90))
    luxo.paste(img, chip(200), (2310, SY0 + 200))
    luxo.paste(img, chip(130, color=GREEN, label="\u2660"), (2190, SY0 + 275))

    d = ImageDraw.Draw(img)
    mark, gap = 132, 36
    inner_w = SAFE_W - 80
    x = SX0 + 40
    t1, t2 = "CLUBE ", "SUPREMA"
    title_font = font(118, 900)
    while d.textlength(t1 + t2, font=title_font) > inner_w - mark - gap and title_font.size > 60:
        title_font = font(title_font.size - 2, 900)
    sub_font = font(40, 500)
    sub = "Poker online no app Suprema Poker  \u00b7  Fichas por PIX  \u00b7  Suporte 24h"
    while d.textlength(sub, font=sub_font) > inner_w and sub_font.size > 24:
        sub_font = font(sub_font.size - 1, 500)
    pill_font = font(28, 700)
    btn = luxo.gold_button("SUPREMA.BLOG", font(34, 800), pad=(36, 16), radius=16, arrow_font=symbol(30))
    foot_font = font(22, 500)

    pills = [("CLUBE ID 10001", None), ("PIX NA HORA", None), ("SUPORTE 24H", GREEN)]

    def build(pf):
        ims = [luxo.outline_pill(t, pf, dot=dot) for t, dot in pills]
        return sum(i.width for i in ims) + 18 * len(ims) + 24 + btn.width, ims
    total, pill_ims = build(pill_font)
    while total > inner_w and pill_font.size > 20:
        pill_font = font(pill_font.size - 1, 700)
        total, pill_ims = build(pill_font)
    row_h = max(max(i.height for i in pill_ims), btn.height)

    block_h = mark + 24 + sub_font.size + 30 + row_h + 24 + foot_font.size
    y = SY0 + (SAFE_H - block_h) // 2

    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((x + 150, y - 220, x + 1350, y + 420), fill=(239, 161, 68, 36))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(120)))

    luxo.paste(img, brand_mark(mark), (x, y), glow=0.35)
    d = ImageDraw.Draw(img)
    tx = x + mark + gap
    d.text((tx, y + mark / 2), t1, font=title_font, fill=WHITE, anchor="lm")
    luxo.gold_text(img, (tx + d.textlength(t1, font=title_font), y + mark / 2), t2, title_font, anchor="lm", glow=0.45)
    d = ImageDraw.Draw(img)
    y2 = y + mark + 24
    d.text((x, y2), sub, font=sub_font, fill=MUTED)
    y3 = y2 + sub_font.size + 30
    px = x
    for im in pill_ims:
        img.alpha_composite(im, (int(px), int(y3 + (row_h - im.height) / 2)))
        px += im.width + 18
    luxo.paste(img, btn, (SX1 - 40 - btn.width, int(y3 + (row_h - btn.height) / 2)), glow=0.45)
    d = ImageDraw.Draw(img)
    d.text((SX0 + SAFE_W / 2, y3 + row_h + 24 + foot_font.size / 2), "18+  \u00b7  Jogue com responsabilidade.", font=foot_font, fill=(156, 148, 134), anchor="mm")

    line = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(line)
    for xx in range(0, W, 2):
        t = abs((xx - W / 2) / (W / 2))
        ld.line((xx, SY1 - 1, xx + 1, SY1 - 1), fill=GOLD + (int(180 * max(0.0, 1 - t ** 1.5)),))
    img = Image.alpha_composite(img, line)

    rgb = img.convert("RGB")
    rgb.save(os.path.join(OUT, "banner-youtube-2560x1440.jpg"), quality=90, optimize=True, subsampling=0)
    rgb.crop((0, SY0, W, SY1)).save(os.path.join(OUT, "preview-banner-desktop.jpg"), quality=88)
    rgb.crop((SX0, SY0, SX1, SY1)).save(os.path.join(OUT, "preview-banner-celular.jpg"), quality=88)
    return rgb


# ------------------------------------------------------------------ perfil
def profile():
    S = 800
    img = luxo.sophisticated_background(S, S, bars=False)
    luxo.paste(img, luxo.gold_ring(S, 352, 341), (0, 0), shadow=False, glow=0.35)
    luxo.gold_text(img, (S / 2, S / 2 + 22), "\u2660", symbol(500), anchor="mm", glow=0.6)
    img.convert("RGB").save(os.path.join(OUT, "perfil-youtube-800x800.png"), optimize=True)
    return img


# ------------------------------------------------------------------ marca d'agua
def watermark():
    im = brand_mark(150, alpha=235)
    im.save(os.path.join(OUT, "marca-dagua-youtube-150x150.png"), optimize=True)
    return im


# ------------------------------------------------------------------ simulacao da pagina do canal
def channel_preview(banner_rgb, profile_img):
    PW = 1280
    strip = banner_rgb.crop((0, SY0, W, SY1)).resize((PW, int(PW * SAFE_H / W)), Image.LANCZOS)
    page = Image.new("RGB", (PW, strip.height + 300), (15, 15, 15))
    page.paste(strip, (0, 0))
    av = profile_img.convert("RGBA").resize((160, 160), Image.LANCZOS)
    mask = Image.new("L", av.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, 159, 159), fill=255)
    page.paste(av, (60, strip.height + 50), mask)
    d = ImageDraw.Draw(page)
    d.text((250, strip.height + 62), "Clube Suprema", font=font(44, 800), fill=WHITE)
    d.text((250, strip.height + 124), "@clubesuprema  \u00b7  suprema.blog", font=font(26, 500), fill=MUTED)
    d.text((250, strip.height + 164), "Poker online no app Suprema Poker. Fichas por PIX e suporte 24h.", font=font(24, 400), fill=MUTED)
    bx, by = 250, strip.height + 220
    d.rounded_rectangle((bx, by, bx + 200, by + 48), radius=24, fill=WHITE)
    d.text((bx + 100, by + 24), "Inscrever-se", font=font(22, 700), fill=DARK, anchor="mm")
    page.save(os.path.join(OUT, "preview-canal.jpg"), quality=88)


if __name__ == "__main__":
    b = banner()
    p = profile()
    watermark()
    channel_preview(b, p)
    for f in sorted(os.listdir(OUT)):
        print(f"{f:40s} {os.path.getsize(os.path.join(OUT, f)) / 1024:8.0f} KB")
