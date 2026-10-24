"""Camada visual "luxo" do Clube Suprema (referencia: pecas oficiais da Suprema Poker).

Preto profundo, feixes de luz dourados, particulas e bokeh ao fundo; degrade dourado para
marca, botoes e palavras de destaque; pilulas escuras com borda dourada.
"""
import math
import random
from PIL import Image, ImageChops, ImageDraw, ImageFilter

GOLD = (239, 161, 68)
GOLD_LIGHT = (250, 208, 125)
GOLD_DEEP = (201, 125, 37)
INK = (26, 18, 6)
BLACK = (5, 5, 5)
WHITE = (255, 255, 255)
MUTED = (196, 190, 180)

# Curvas de Bezier cubicas em coordenadas normalizadas (fracao da largura/altura)
STREAKS = [
    ((-0.10, 0.80), (0.12, 0.25), (0.40, 0.05), (0.62, -0.10)),
    ((-0.08, 1.05), (0.22, 0.55), (0.40, 0.45), (0.85, 0.60)),
    ((0.35, 1.12), (0.72, 0.92), (0.96, 0.72), (1.12, 0.28)),
    ((0.58, 1.06), (0.86, 1.02), (1.00, 0.62), (1.06, 0.15)),
    ((-0.10, 0.40), (0.14, 0.34), (0.28, 0.02), (0.42, -0.10)),
    ((0.62, -0.10), (0.80, 0.18), (1.00, 0.30), (1.12, 0.52)),
]
SIDE_STREAKS = [0, 2, 3, 4, 5]   # deixam o centro livre para o conteudo
RIGHT_STREAKS = [2, 3, 5]        # so o lado direito (capas do blog: texto a esquerda)


def lerp(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def bezier(p0, p1, p2, p3, t):
    u = 1 - t
    return (
        u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
        u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1],
    )


# ------------------------------------------------------------------ degrade dourado

def gold_gradient(w, h):
    grad = Image.new("RGBA", (1, 256))
    for y in range(256):
        t = y / 255
        c = lerp(GOLD_LIGHT, GOLD, t / 0.52) if t < 0.52 else lerp(GOLD, GOLD_DEEP, (t - 0.52) / 0.48)
        grad.putpixel((0, y), c + (255,))
    return grad.resize((max(1, int(w)), max(1, int(h))), Image.BILINEAR)


def gold_rounded(w, h, radius, highlight=True):
    """Retangulo arredondado com degrade dourado e um brilho fino no topo (estilo botao)."""
    w, h = int(w), int(h)
    im = gold_gradient(w, h)
    if highlight:
        hl = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(hl).rounded_rectangle((3, 3, w - 4, int(h * 0.48)), radius=max(2, radius - 3), fill=(255, 255, 255, 42))
        hl = hl.filter(ImageFilter.GaussianBlur(max(2, h // 14)))
        im = Image.alpha_composite(im, hl)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=255)
    im.putalpha(mask)
    return im


def gold_ring(size, outer, inner):
    im = gold_gradient(size, size)
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    c = size / 2
    d.ellipse((c - outer, c - outer, c + outer, c + outer), fill=255)
    d.ellipse((c - inner, c - inner, c + inner, c + inner), fill=0)
    im.putalpha(mask)
    return im


def gold_text(img, xy, text, font, anchor="la", glow=0.4):
    """Escreve 'text' com o degrade dourado (e um brilho suave) direto em img (RGBA)."""
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = d.textbbox(xy, text, font=font, anchor=anchor)
    pad = 10
    w, h = int(x1 - x0) + pad * 2, int(y1 - y0) + pad * 2
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).text((xy[0] - x0 + pad, xy[1] - y0 + pad), text, font=font, fill=255, anchor=anchor)
    if glow:
        g = Image.new("RGBA", (w + 120, h + 120), (0, 0, 0, 0))
        g.paste(GOLD + (int(255 * glow),), (60, 60), mask)
        g = g.filter(ImageFilter.GaussianBlur(22))
        img.alpha_composite(g, (int(x0) - pad - 60, int(y0) - pad - 60))
    layer = gold_gradient(w, h)
    layer.putalpha(mask)
    img.alpha_composite(layer, (int(x0) - pad, int(y0) - pad))
    return (x0, y0, x1, y1)


# ------------------------------------------------------------------ texto espacado, pilulas, botoes

def spaced(d, xy, text, font, fill, spacing=2.0, anchor="lm"):
    """Texto com espacamento entre letras (PIL nao tem letter-spacing)."""
    widths = [d.textlength(ch, font=font) for ch in text]
    total = sum(widths) + spacing * (len(text) - 1)
    x = xy[0] - total / 2 if anchor[0] == "m" else xy[0]
    for ch, w in zip(text, widths):
        d.text((x, xy[1]), ch, font=font, fill=fill, anchor="l" + anchor[1])
        x += w + spacing
    return total


def outline_pill(text, font, pad=(26, 12), spacing=None, fill=(14, 10, 5, 178), border=GOLD, color=GOLD_LIGHT, dot=None):
    spacing = font.size * 0.12 if spacing is None else spacing
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    tw = sum(probe.textlength(ch, font=font) for ch in text) + spacing * (len(text) - 1)
    extra = int(font.size * 0.9 + 14) if dot else 0
    w, h = int(tw + pad[0] * 2 + extra), int(font.size + pad[1] * 2)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=h // 2, fill=fill, outline=border + (235,), width=2)
    x = pad[0]
    if dot:
        r = font.size * 0.28
        d.ellipse((x, h / 2 - r, x + 2 * r, h / 2 + r), fill=dot)
        x += font.size * 0.9 + 14
    spaced(d, (x, h / 2), text, font, color, spacing=spacing, anchor="lm")
    return im


def gold_button(text, font, pad=(46, 22), radius=18, arrow_font=None):
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    tw = probe.textlength(text, font=font)
    aw = (probe.textlength("→", font=arrow_font) + font.size * 0.45) if arrow_font else 0
    w, h = int(tw + aw + pad[0] * 2), int(font.size + pad[1] * 2)
    im = gold_rounded(w, h, radius)
    d = ImageDraw.Draw(im)
    d.text((pad[0], h / 2), text, font=font, fill=INK + (255,), anchor="lm")
    if arrow_font:
        d.text((pad[0] + tw + font.size * 0.45, h / 2 - 2), "→", font=arrow_font, fill=INK + (255,), anchor="lm")
    return im


def drop_shadow(im, blur=24, offset=(0, 18), alpha=150, color=(0, 0, 0)):
    sh = Image.new("RGBA", (im.width + blur * 4, im.height + blur * 4), (0, 0, 0, 0))
    a = im.split()[3].point(lambda v: int(v * alpha / 255))
    sh.paste(color + (255,), (blur * 2 + offset[0], blur * 2 + offset[1]), a)
    return sh.filter(ImageFilter.GaussianBlur(blur)), blur * 2


def paste(img, im, xy, shadow=True, glow=0.0):
    xy = (int(xy[0]), int(xy[1]))
    if shadow:
        sh, off = drop_shadow(im)
        img.alpha_composite(sh, (xy[0] - off, xy[1] - off))
    if glow:
        g, off = drop_shadow(im, blur=30, offset=(0, 0), alpha=int(255 * glow), color=GOLD)
        img.alpha_composite(g, (xy[0] - off, xy[1] - off))
    img.alpha_composite(im, xy)


def black_background(W, H):
    """Fundo 100% preto (pedido do usuario em 24/10/2026)."""
    return Image.new("RGBA", (W, H), (0, 0, 0, 255))


# ------------------------------------------------------------------ fundo "veludo preto" (opcao 1 escolhida pelo usuario em 24/10/2026)

def grain(W, H, amount=0.03, base=5):
    n = Image.effect_noise((W, H), 60).filter(ImageFilter.GaussianBlur(0.8))
    lum = n.point(lambda v: max(0, min(255, int(base + (v - 128) * amount * 1.6))))
    return Image.merge("RGB", (lum, lum, lum)).convert("RGBA")


def velvet_background(W, H, light=26, vignette=0.6):
    """Preto profundo com grao finissimo e uma luz suave e neutra no alto. Sem dourado."""
    img = grain(W, H)
    lt = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(lt).ellipse((W * 0.1, -H * 0.55, W * 0.9, H * 0.45), fill=(255, 255, 255, light))
    img = Image.alpha_composite(img, lt.filter(ImageFilter.GaussianBlur(W / 6)))
    vg = Image.new("L", (W, H), 0)
    ImageDraw.Draw(vg).ellipse((-W * 0.15, -H * 0.35, W * 1.15, H * 1.35), fill=255)
    vg = vg.filter(ImageFilter.GaussianBlur(W / 7))
    dark = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    dark.putalpha(ImageChops.invert(vg).point(lambda v: int(v * vignette)))
    return Image.alpha_composite(img, dark)


# ------------------------------------------------------------------ fundo "preto sofisticado"
# Referencia do usuario: preto fosco com textura de reboco/concreto e barras douradas finas nas laterais.

BAR_COLORS = [(74, 47, 10), (184, 122, 36), (243, 208, 127), (184, 122, 36), (74, 47, 10)]


def plaster_texture(W, H, base=8, amplitude=0.08, warm=1):
    """Textura preta fosca: ruido em tres escalas (grao, manchas medias e grandes), levemente mais claro no centro."""
    n1 = Image.effect_noise((W, H), 60).filter(ImageFilter.GaussianBlur(1.1))
    n2 = Image.effect_noise((max(2, W // 4), max(2, H // 4)), 60).resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(5))
    n3 = Image.effect_noise((max(2, W // 14), max(2, H // 14)), 60).resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(16))
    mix = Image.blend(Image.blend(n1, n2, 0.55), n3, 0.5)
    lum = mix.point(lambda v: max(0, min(255, int(base + (v - 128) * amplitude * 1.6))))
    img = Image.merge("RGB", (lum.point(lambda v: min(255, v + warm)), lum, lum.point(lambda v: max(0, v - warm)))).convert("RGBA")
    # leve luz no centro e vinheta nas bordas
    vg = Image.new("L", (W, H), 0)
    ImageDraw.Draw(vg).ellipse((-W * 0.1, -H * 0.25, W * 1.1, H * 1.25), fill=255)
    vg = vg.filter(ImageFilter.GaussianBlur(W / 6))
    light = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    light.putalpha(vg.point(lambda v: int(v * 0.05)))
    img = Image.alpha_composite(img, light)
    dark = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    dark.putalpha(ImageChops.invert(vg).point(lambda v: int(v * 0.55)))
    return Image.alpha_composite(img, dark)


def gold_bar(width, height, fade=0.3, floor=0.22):
    """Barra vertical dourada com relevo (escuro-claro-escuro) e pontas que escurecem."""
    bar = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    d = ImageDraw.Draw(bar)
    for x in range(width):
        t = x / max(1, width - 1) * 4
        i = min(3, int(t))
        c = lerp(BAR_COLORS[i], BAR_COLORS[i + 1], t - i)
        d.line((x, 0, x, height), fill=c + (255,))
    if fade:
        col = Image.new("L", (1, height))
        for y in range(height):
            t = y / max(1, height - 1)
            k = min(1.0, min(t, 1 - t) / fade)
            col.putpixel((0, y), int(255 * (floor + (1 - floor) * k)))
        dark = Image.new("RGBA", (width, height), (0, 0, 0, 255))
        dark.putalpha(ImageChops.invert(col.resize((width, height))))
        bar = Image.alpha_composite(bar, dark)
    return bar


def gold_bars(img, inset, width, glow=70, fade=0.3):
    """Desenha a barra dourada nas duas laterais de img, com um brilho suave para dentro."""
    W, H = img.size
    g = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    gd.rectangle((inset, 0, inset + width, H), fill=(243, 208, 127, glow))
    gd.rectangle((W - inset - width, 0, W - inset, H), fill=(243, 208, 127, glow))
    img.alpha_composite(g.filter(ImageFilter.GaussianBlur(max(6, width * 1.6))))
    bar = gold_bar(width, H, fade=fade)
    img.alpha_composite(bar, (inset, 0))
    img.alpha_composite(bar, (W - inset - width, 0))
    return img


def sophisticated_background(W, H, bars=True, inset=None, width=None, seed=None):
    img = plaster_texture(W, H)
    if bars:
        inset = int(W * 0.024) if inset is None else inset
        width = max(6, int(W * 0.0085)) if width is None else width
        gold_bars(img, inset, width)
    return img


# ------------------------------------------------------------------ fundo com feixes (versao anterior, mantida para referencia)

def luxury_background(W, H, seed=7, streak_ids=None, sparkles=160, glows=None, streak_alpha=1.0, glow_scale=0.55):
    """Fundo quase preto: brilhos quentes discretos (glow_scale reduz o alfa de todos), feixes, particulas e bokeh."""
    rnd = random.Random(seed)
    scale = W / 1200
    img = Image.new("RGBA", (W, H), BLACK + (255,))
    grad = Image.new("RGBA", (1, H))
    for y in range(H):
        k = math.sin(y / max(1, H - 1) * math.pi)
        grad.putpixel((0, y), lerp((4, 4, 4), (12, 9, 5), k) + (255,))
    img.paste(grad.resize((W, H)))

    # brilhos quentes (so nos cantos; o centro fica escuro para o conteudo)
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for cx, cy, r, a in (glows or [(0.9, 0.02, 0.45, 80), (0.04, 0.9, 0.38, 48)]):
        R = r * W / 2
        gd.ellipse((cx * W - R, cy * H - R, cx * W + R, cy * H + R), fill=GOLD + (int(a * glow_scale),))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(W / 10)))

    # feixes de luz curvos
    curves = STREAKS if streak_ids is None else [STREAKS[i] for i in streak_ids]
    lines = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lines)
    n = 160
    for p0, p1, p2, p3 in curves:
        P = [((px + rnd.uniform(-0.025, 0.025)) * W, (py + rnd.uniform(-0.025, 0.025)) * H) for px, py in (p0, p1, p2, p3)]
        pts = [bezier(*P, t / n) for t in range(n + 1)]
        width = max(1, int(rnd.choice([3, 4, 5]) * scale))
        alpha = rnd.randint(110, 190) * streak_alpha
        off = 10 * scale
        for j in range(n):
            fade = math.sin((j / n) * math.pi) ** 0.8
            ld.line([pts[j], pts[j + 1]], fill=GOLD_LIGHT + (int(alpha * fade),), width=width)
            ld.line([(pts[j][0], pts[j][1] + off), (pts[j + 1][0], pts[j + 1][1] + off)],
                    fill=GOLD + (int(alpha * 0.45 * fade),), width=max(1, width // 2))
    wide = lines.filter(ImageFilter.GaussianBlur(34 * scale))
    wide.putalpha(wide.split()[3].point(lambda v: int(v * 0.45)))
    img = Image.alpha_composite(img, wide)
    img = Image.alpha_composite(img, lines.filter(ImageFilter.GaussianBlur(14 * scale)))
    img = Image.alpha_composite(img, lines.filter(ImageFilter.GaussianBlur(1.2)))

    # particulas (algumas em estrela de 4 pontas)
    sp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pd = ImageDraw.Draw(sp)
    for _ in range(sparkles):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        r = rnd.uniform(0.7, 2.4) * scale
        a = rnd.randint(70, 235)
        pd.ellipse((x - r, y - r, x + r, y + r), fill=GOLD_LIGHT + (a,))
        if rnd.random() < 0.14:
            L = r * 7
            pd.line((x - L, y, x + L, y), fill=GOLD_LIGHT + (int(a * 0.8),), width=1)
            pd.line((x, y - L, x, y + L), fill=GOLD_LIGHT + (int(a * 0.8),), width=1)
    img = Image.alpha_composite(img, sp.filter(ImageFilter.GaussianBlur(4 * scale)))
    img = Image.alpha_composite(img, sp)

    # bokeh
    bk = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bk)
    for _ in range(max(6, sparkles // 10)):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        r = rnd.uniform(6, 18) * scale
        bd.ellipse((x - r, y - r, x + r, y + r), fill=GOLD + (rnd.randint(10, 26),))
    img = Image.alpha_composite(img, bk.filter(ImageFilter.GaussianBlur(6 * scale)))

    # vinheta
    vg = Image.new("L", (W, H), 0)
    ImageDraw.Draw(vg).ellipse((-W * 0.15, -H * 0.35, W * 1.15, H * 1.35), fill=255)
    vg = vg.filter(ImageFilter.GaussianBlur(W / 7))
    dark = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    dark.putalpha(ImageChops.invert(vg).point(lambda v: int(v * 0.72)))
    return Image.alpha_composite(img, dark)
