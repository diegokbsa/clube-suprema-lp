"""Capas dos 3 posts novos, no mesmo estilo de tools/imagens/capas.py (reaproveita cover(), pill(), chip() etc.).

Uso: python capas_novas.py RAIZ_DO_PROJETO CAMINHO/Montserrat.ttf
Não altera capas.py: importa o módulo com ONLY apontando para um slug inexistente (nenhuma capa antiga é refeita).
"""
import os
import sys
import math

ROOT, FONT = sys.argv[1], sys.argv[2]
sys.path.insert(0, os.path.join(ROOT, "tools", "imagens"))
os.environ["ONLY"] = "__nenhum__"
sys.argv = [sys.argv[0], ROOT, FONT]
import capas  # noqa: E402
import capas_webp  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

GOLD, INK, WHITE, MUTED = capas.GOLD, capas.INK, capas.WHITE, capas.MUTED
font, pill, logo_box, overlay = capas.font, capas.pill, capas.logo_box, capas.overlay
CARD = (26, 26, 29)


def check(d, cx, cy, s, color=INK, width=None):
    """Marca de 'ok' desenhada com linhas (a Montserrat não tem o caractere)."""
    w = width or max(3, int(s / 4))
    d.line((cx - s * 0.5, cy, cx - s * 0.12, cy + s * 0.4), fill=color, width=w)
    d.line((cx - s * 0.12, cy + s * 0.4, cx + s * 0.55, cy - s * 0.38), fill=color, width=w)


def pills_row(img, labels, cx, cy, f, first_gold=False, gap=12, pad=18):
    d = ImageDraw.Draw(img)
    widths = [d.textlength(t, font=f) + 2 * pad for t in labels]
    x = cx - (sum(widths) + gap * (len(labels) - 1)) / 2
    for i, (t, w) in enumerate(zip(labels, widths)):
        if first_gold and i == 0:
            pill(img, t, x + w / 2, cy, f, fill=GOLD + (255,), outline=GOLD, color=INK)
        else:
            pill(img, t, x + w / 2, cy, f)
        x += w + gap


def phone(img, px0, py0, px1, py1):
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((px0 + 8, py0 + 14, px1 + 8, py1 + 14), radius=36, fill=(0, 0, 0, 150))
    d.rounded_rectangle((px0, py0, px1, py1), radius=36, fill=(48, 48, 54), outline=(90, 90, 96), width=2)
    d.rounded_rectangle((px0 + 12, py0 + 12, px1 - 12, py1 - 12), radius=26, fill=(14, 14, 16))
    d.rounded_rectangle(((px0 + px1) // 2 - 30, py0 + 22, (px0 + px1) // 2 + 30, py0 + 30), radius=4, fill=(48, 48, 54))


def illus_apk(img):
    """Celular Android no site oficial com o arquivo APK e o botão de baixar; selo de segurança; pílulas Android e iPhone."""
    px0, py0, px1, py1 = 790, 86, 1020, 480
    phone(img, px0, py0, px1, py1)
    d = ImageDraw.Draw(img)
    cx = (px0 + px1) // 2
    # barra de endereço
    d.rounded_rectangle((px0 + 28, py0 + 44, px1 - 28, py0 + 74), radius=15, fill=(36, 36, 40))
    d.text((cx, py0 + 59), "supremapoker.net", font=font(14, 700), fill=MUTED, anchor="mm")
    # arquivo APK (folha com canto dobrado)
    fx0, fy0, fw, fh = cx - 52, py0 + 100, 104, 128
    fold = 28
    d.polygon([(fx0, fy0), (fx0 + fw - fold, fy0), (fx0 + fw, fy0 + fold), (fx0 + fw, fy0 + fh), (fx0, fy0 + fh)], fill=CARD, outline=GOLD)
    d.line((fx0, fy0, fx0 + fw - fold, fy0), fill=GOLD, width=3)
    d.line((fx0 + fw - fold, fy0, fx0 + fw, fy0 + fold), fill=GOLD, width=3)
    d.line((fx0 + fw, fy0 + fold, fx0 + fw, fy0 + fh), fill=GOLD, width=3)
    d.line((fx0 + fw, fy0 + fh, fx0, fy0 + fh), fill=GOLD, width=3)
    d.line((fx0, fy0 + fh, fx0, fy0), fill=GOLD, width=3)
    d.polygon([(fx0 + fw - fold, fy0), (fx0 + fw - fold, fy0 + fold), (fx0 + fw, fy0 + fold)], fill=GOLD)
    logo_box(img, cx - 24, fy0 + 22, 48)
    d = ImageDraw.Draw(img)
    d.text((cx, fy0 + 98), "APK", font=font(24, 900), fill=WHITE, anchor="mm")
    # botão de baixar
    by = py0 + 262
    d.rounded_rectangle((px0 + 30, by, px1 - 30, by + 50), radius=25, fill=GOLD)
    fb = font(18, 800)
    tw = d.textlength("Baixar APK", font=fb)
    gx = cx - (tw + 30) / 2  # seta (18 px) + espaço (12 px) + texto, centralizados no botão
    ax = gx + 9
    d.line((ax, by + 13, ax, by + 31), fill=INK, width=5)
    d.polygon([(ax - 9, by + 26), (ax + 9, by + 26), (ax, by + 37)], fill=INK)
    d.text((gx + 30, by + 25), "Baixar APK", font=fb, fill=INK, anchor="lm")
    d.text((cx, by + 80), "Site oficial · Android", font=font(14, 600), fill=MUTED, anchor="mm")
    # selo de segurança (escudo com ok) no canto do celular
    sx, sy, r = px1 + 4, py0 + 150, 46
    d.ellipse((sx - r, sy - r, sx + r, sy + r), fill=GOLD)
    shield = [(sx, sy - 26), (sx + 22, sy - 17), (sx + 22, sy + 2), (sx + 14, sy + 17), (sx, sy + 27), (sx - 14, sy + 17), (sx - 22, sy + 2), (sx - 22, sy - 17)]
    d.polygon(shield, fill=INK)
    check(d, sx, sy, 22, color=GOLD, width=5)
    pills_row(img, ["Android · APK", "iPhone · App Store"], 940, 532, font(16, 700), first_gold=True)


def illus_deposito(img):
    """Cartão 'Depósito' com a lista de conferência do PIX e um relógio dourado; pílula do suporte."""
    x0, y0, x1, y1 = 748, 112, 1124, 432

    def body(d):
        d.rounded_rectangle((x0 + 6, y0 + 10, x1 + 6, y1 + 10), radius=26, fill=(0, 0, 0, 130))
        d.rounded_rectangle((x0, y0, x1, y1), radius=26, fill=CARD + (255,), outline=GOLD, width=2)
    img.alpha_composite(overlay(Image.new("RGBA", img.size, (0, 0, 0, 0)), body))
    d = ImageDraw.Draw(img)
    d.text((x0 + 28, y0 + 26), "DEPÓSITO · PIX", font=font(16, 700), fill=GOLD)
    d.text((x0 + 28, y0 + 52), "Clube 10001", font=font(15, 500), fill=MUTED)
    rows = ["PIX concluído no banco", "Conta no seu CPF", "QR Code da compra", "Fichas no Caixa do clube"]
    f = font(19, 700)
    for i, t in enumerate(rows):
        cy = y0 + 112 + i * 54
        cx = x0 + 46
        last = i == len(rows) - 1
        if last:
            d.ellipse((cx - 16, cy - 16, cx + 16, cy + 16), outline=GOLD, width=3)
            d.text((cx, cy), "?", font=font(18, 900), fill=GOLD, anchor="mm")
        else:
            d.ellipse((cx - 16, cy - 16, cx + 16, cy + 16), fill=GOLD)
            check(d, cx, cy, 15, color=INK, width=4)
        d.text((cx + 32, cy), t, font=f, fill=WHITE if not last else (250, 208, 125), anchor="lm")
        if not last:
            d.line((x0 + 28, cy + 27, x1 - 28, cy + 27), fill=(52, 52, 58), width=1)
    # relógio
    cx, cy, r = x1 - 8, y0 + 6, 48
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=GOLD)
    d.ellipse((cx - 32, cy - 32, cx + 32, cy + 32), outline=INK, width=6)
    for k in range(12):
        a = math.radians(k * 30)
        d.line((cx + 25 * math.cos(a), cy + 25 * math.sin(a), cx + 28 * math.cos(a), cy + 28 * math.sin(a)), fill=INK, width=3)
    d.line((cx, cy, cx, cy - 20), fill=INK, width=5)
    d.line((cx, cy, cx + 15, cy + 8), fill=INK, width=5)
    d.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), fill=INK)
    pill(img, "Comprovante → Suporte 24h", 936, 494, font(16, 700))


def shield_layer(w, h, scale=4):
    """Escudo dourado suavizado (desenhado em 4x e reduzido)."""
    W, H = w * scale, h * scale
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    def path(m):
        pts = [(W / 2, m), (W - m, m + H * 0.11), (W - m, H * 0.50)]
        # lateral direita até a ponta, em curva
        for t in [i / 16 for i in range(1, 17)]:
            x = (1 - t) ** 2 * (W - m) + 2 * (1 - t) * t * (W - m) + t ** 2 * (W / 2)
            y = (1 - t) ** 2 * (H * 0.50) + 2 * (1 - t) * t * (H * 0.80) + t ** 2 * (H - m)
            pts.append((x, y))
        right = pts[:]
        left = [(W - x, y) for x, y in reversed(right[1:-1])]
        return right + left
    d.polygon(path(0), fill=GOLD + (255,))
    d.polygon(path(9 * scale), fill=CARD + (255,))
    return im.resize((w, h), Image.LANCZOS)


def illus_confiavel(img):
    """Escudo com o logo e o selo 18+; embaixo, as três coisas a conferir."""
    sw, sh = 236, 286
    sx, sy = 940 - sw // 2, 96
    img.alpha_composite(capas.shadow(shield_layer(sw, sh)), (sx - 36, sy - 36))
    img.alpha_composite(shield_layer(sw, sh), (sx, sy))
    logo_box(img, 940 - 56, sy + 66, 112)
    d = ImageDraw.Draw(img)
    d.text((940, sy + 206), "CLUBE 10001", font=font(16, 800), fill=GOLD, anchor="mm")
    # selo 18+
    cx, cy, r = sx + sw - 6, sy + 30, 42
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=GOLD)
    d.text((cx, cy + 1), "18+", font=font(28, 900), fill=INK, anchor="mm")
    f = font(15, 700)
    pills_row(img, ["App oficial", "Clube e agente", "PIX no seu CPF"], 940, 452, f, gap=10, pad=14)


capas.ILLUS.update({
    "baixar-suprema-poker-apk": illus_apk,
    "deposito-suprema-poker-nao-caiu": illus_deposito,
    "suprema-poker-e-confiavel": illus_confiavel,
})

novos = [
    ("baixar-suprema-poker-apk", "Tutorial · Android", "Suprema Poker APK: como baixar e instalar", "Site oficial, permissão no Android, atualização e o caminho no iPhone", "Passo a passo"),
    ("deposito-suprema-poker-nao-caiu", "Suporte · Fichas", "Depósito no Suprema Poker não caiu? O que fazer", "Quanto tempo leva, onde conferir no Caixa e o que mandar ao suporte 24h", "Resolva já"),
    ("suprema-poker-e-confiavel", "Guia · Segurança", "Suprema Poker é confiável?", "Como funcionam o app, o clube e o agente, os sinais de golpe e o jogo consciente", "Somente +18"),
]
so = os.environ.get("SO")
for slug, eyebrow, title, subtitle, badge in novos:
    if so and slug != so:
        continue
    jpg = os.path.join(ROOT, "public", "img", "blog", slug, "cover.jpg")
    capas.cover(jpg, slug, eyebrow, title, subtitle, badge)
    print("  ", ", ".join(capas_webp.variantes(jpg)))
