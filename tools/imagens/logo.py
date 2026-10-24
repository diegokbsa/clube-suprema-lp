"""Logo "S" do Clube Suprema redesenhado em vetor (24/10/2026).

Geometria medida no logo enviado pelo usuario e limpa: diagonais exatas de 55 graus, simetria de 180 graus,
cantos arredondados consistentes. Cor mais viva: degrade laranja-dourado (#FFC24D -> #FFA51F -> #F5850C).

Uso como biblioteca (capas, YouTube) ou como script para gerar os arquivos do site:
    python logo.py <raiz-do-projeto>
"""
import math
import os
import sys
from PIL import Image, ImageDraw, ImageFilter

STOPS = [(0.0, (255, 194, 77)), (0.5, (255, 165, 31)), (1.0, (245, 133, 12))]
FLAT = (255, 165, 31)

# ---------------------------------------------------------------- geometria (unidades do desenho, centro em 0,0; y para baixo)
T = math.tan(math.radians(55))
A, B, D, E = 103.0, 38.0, -98.0, -163.0   # retas: x = k + y/T (A, B) e x = k - y/T (D, E)
HB = 23.0                                  # meia espessura da barra
CUT = 45.0                                 # altura do corte reto da ponta de cada braco
RADII = [38, 4, 4, 10, 6, 7]               # apice, ponta (2x), entalhe, encontro com a barra, ponta da barra


def _vertices():
    ay = (E - A) * T / 2
    ny = (D - B) * T / 2
    top = [
        (A + ay / T, ay),          # apice
        (A - CUT / T, -CUT),       # ponta do braco (externo)
        (B - CUT / T, -CUT),       # ponta do braco (interno)
        (B + ny / T, ny),          # entalhe
        (D + HB / T, -HB),         # entalhe encontra a barra
        (-E + HB / T, -HB),        # ponta direita da barra
    ]
    return top + [(-x, -y) for x, y in top], RADII + RADII


def _corners():
    pts, radii = _vertices()
    n = len(pts)
    out = []
    for i in range(n):
        P, V, N = pts[i - 1], pts[i], pts[(i + 1) % n]
        ux, uy = P[0] - V[0], P[1] - V[1]
        vx, vy = N[0] - V[0], N[1] - V[1]
        lu, lv = math.hypot(ux, uy), math.hypot(vx, vy)
        ux, uy, vx, vy = ux / lu, uy / lu, vx / lv, vy / lv
        phi = math.acos(max(-1.0, min(1.0, ux * vx + uy * vy)))
        r = radii[i]
        d = r / math.tan(phi / 2)
        t1 = (V[0] + ux * d, V[1] + uy * d)
        t2 = (V[0] + vx * d, V[1] + vy * d)
        bx, by = ux + vx, uy + vy
        lb = math.hypot(bx, by)
        cdist = r / math.sin(phi / 2)
        c = (V[0] + bx / lb * cdist, V[1] + by / lb * cdist)
        cross = (V[0] - P[0]) * (N[1] - V[1]) - (V[1] - P[1]) * (N[0] - V[0])
        out.append((t1, t2, c, r, 1 if cross > 0 else 0))
    return out


def outline(samples=24):
    """Pontos do contorno (cantos amostrados) para rasterizar."""
    pts = []
    for t1, t2, c, r, _ in _corners():
        a1 = math.atan2(t1[1] - c[1], t1[0] - c[0])
        a2 = math.atan2(t2[1] - c[1], t2[0] - c[0])
        da = (a2 - a1 + math.pi) % (2 * math.pi) - math.pi  # arco curto
        for k in range(samples + 1):
            a = a1 + da * k / samples
            pts.append((c[0] + r * math.cos(a), c[1] + r * math.sin(a)))
    return pts


def bbox():
    p = outline()
    xs, ys = [q[0] for q in p], [q[1] for q in p]
    return min(xs), min(ys), max(xs), max(ys)


def path_d(prec=2):
    """Path SVG (com arcos) em unidades do desenho."""
    f = lambda v: f"{v:.{prec}f}".rstrip("0").rstrip(".")
    cs = _corners()
    s = f"M{f(cs[0][0][0])} {f(cs[0][0][1])}"
    for i, (t1, t2, c, r, sw) in enumerate(cs):
        if i:
            s += f"L{f(t1[0])} {f(t1[1])}"
        s += f"A{f(r)} {f(r)} 0 0 {sw} {f(t2[0])} {f(t2[1])}"
    return s + "Z"


# ---------------------------------------------------------------- raster
def _gradient(w, h, stops=STOPS):
    col = Image.new("RGBA", (1, max(1, h)))
    for y in range(max(1, h)):
        t = y / max(1, h - 1)
        for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
            if p0 <= t <= p1:
                k = (t - p0) / (p1 - p0)
                col.putpixel((0, y), tuple(int(round(c0[j] + (c1[j] - c0[j]) * k)) for j in range(3)) + (255,))
                break
    return col.resize((max(1, w), max(1, h)), Image.BILINEAR)


def mark(width, color=None, ss=4):
    """Imagem RGBA (fundo transparente) do 'S' com a largura dada; color=None usa o degrade vivo."""
    x0, y0, x1, y1 = bbox()
    s = width / (x1 - x0)
    w, h = int(round(width)), int(round((y1 - y0) * s))
    big = Image.new("L", (w * ss, h * ss), 0)
    ImageDraw.Draw(big).polygon([((x - x0) * s * ss, (y - y0) * s * ss) for x, y in outline()], fill=255)
    m = big.resize((w, h), Image.LANCZOS)
    fill = _gradient(w, h) if color is None else Image.new("RGBA", (w, h), tuple(color[:3]) + (255,))
    fill.putalpha(m)
    return fill


def mark_in_box(box, ratio=1.0, color=None):
    """'S' centralizado num quadrado transparente box x box (largura do S = box * ratio)."""
    im = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    m = mark(box * ratio, color)
    im.alpha_composite(m, ((box - m.width) // 2, (box - m.height) // 2))
    return im


def icon(size, ratio=0.72, bg=(0, 0, 0), radius=0.0, glow=0.0):
    """Icone quadrado: fundo preto (opcionalmente arredondado) com o 'S' vivo no centro."""
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    m = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=int(size * 4 * radius), fill=255)
    base = Image.new("RGBA", (size, size), bg + (255,))
    base.putalpha(m.resize((size, size), Image.LANCZOS))
    im.alpha_composite(base)
    s = mark(size * ratio)
    pos = ((size - s.width) // 2, (size - s.height) // 2)
    if glow:
        g = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        a = s.split()[3].point(lambda v: int(v * glow))
        g.paste((255, 165, 31, 255), pos, a)
        im.alpha_composite(g.filter(ImageFilter.GaussianBlur(size * 0.04)))
    im.alpha_composite(s, pos)
    return im


# ---------------------------------------------------------------- svg
def svg(width=None, bg=None, radius=0.0, ratio=1.0, pad=0.0, grad_id="sg"):
    x0, y0, x1, y1 = bbox()
    stops = "".join(f'<stop offset="{p}" stop-color="#{c[0]:02x}{c[1]:02x}{c[2]:02x}"/>' for p, c in STOPS)
    grad = f'<linearGradient id="{grad_id}" x1="0" y1="{y0:.1f}" x2="0" y2="{y1:.1f}" gradientUnits="userSpaceOnUse">{stops}</linearGradient>'
    if bg is None:
        vb = f"{x0 - pad:.1f} {y0 - pad:.1f} {x1 - x0 + 2 * pad:.1f} {y1 - y0 + 2 * pad:.1f}"
        body = f'<path fill="url(#{grad_id})" d="{path_d()}"/>'
    else:
        side = (x1 - x0) / ratio
        vb = f"{-side / 2:.1f} {-side / 2:.1f} {side:.1f} {side:.1f}"
        rx = side * radius
        body = (f'<rect x="{-side / 2:.1f}" y="{-side / 2:.1f}" width="{side:.1f}" height="{side:.1f}" rx="{rx:.1f}" fill="{bg}"/>'
                f'<path fill="url(#{grad_id})" d="{path_d()}"/>')
    wattr = f' width="{width}"' if width else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"{wattr}><defs>{grad}</defs>{body}</svg>\n'


if __name__ == "__main__":
    root = sys.argv[1]
    pub = os.path.join(root, "public")
    img = os.path.join(pub, "img")
    mk = os.path.join(root, "marketing", "logo")
    os.makedirs(mk, exist_ok=True)

    open(os.path.join(img, "logo-mark.svg"), "w", encoding="utf-8").write(svg(grad_id="smk"))
    open(os.path.join(pub, "favicon.svg"), "w", encoding="utf-8").write(svg(bg="#000", radius=0.22, ratio=0.86, grad_id="sfv"))
    ico = icon(256, ratio=0.86, radius=0.22)
    ico.save(os.path.join(pub, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
    icon(180, ratio=0.70).convert("RGB").save(os.path.join(pub, "apple-touch-icon.png"), optimize=True)
    icon(192, ratio=0.70).convert("RGB").save(os.path.join(img, "icon-192.png"), optimize=True)
    icon(512, ratio=0.70).convert("RGB").save(os.path.join(img, "icon-512.png"), optimize=True)
    icon(512, ratio=0.72).convert("RGB").save(os.path.join(img, "logo.png"), optimize=True)

    # kit para o usuario
    open(os.path.join(mk, "logo-clube-suprema.svg"), "w", encoding="utf-8").write(svg(grad_id="slg"))
    open(os.path.join(mk, "logo-clube-suprema-fundo-preto.svg"), "w", encoding="utf-8").write(svg(bg="#000", ratio=0.72, grad_id="slp"))
    icon(1024, ratio=0.72).convert("RGB").save(os.path.join(mk, "logo-clube-suprema-1024-fundo-preto.png"), optimize=True)
    mark(1024).save(os.path.join(mk, "logo-clube-suprema-1024-transparente.png"), optimize=True)
    print("bbox", tuple(round(v, 1) for v in bbox()))
    for d in (pub, img, mk):
        for f in sorted(os.listdir(d)):
            if f.startswith(("logo", "favicon", "apple-touch", "icon-")):
                print(f"{os.path.relpath(os.path.join(d, f), root):55s} {os.path.getsize(os.path.join(d, f)):>8} B")
