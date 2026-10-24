"""Recorta o celular das imagens do app (remove o fundo azul-marinho) e salva com transparencia.

Uso: python recorte.py <entrada.webp> <saida.webp> <preview.png>
O fundo e detectado por cor (azul: B > G, B - R >= 6, B >= 1.5R + 3); a silhueta do aparelho e a regiao
conectada ao centro da imagem; furos internos (icones azuis da tela) sao preenchidos.
"""
import sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter

src, dst, prev = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(src).convert("RGB")
W, H = im.size
r, g, b = im.split()

c1 = ImageChops.subtract(b, g).point(lambda v: 255 if v > 0 else 0)          # B > G
c2 = ImageChops.subtract(b, r).point(lambda v: 255 if v >= 6 else 0)         # B - R >= 6
r15 = r.point(lambda v: min(255, int(v * 1.9 + 6)))
c3 = ImageChops.subtract(b, r15, 1, 1).point(lambda v: 255 if v >= 1 else 0)  # B >= 1.9R + 6 (tela escura azulada fica no celular)
bg = ImageChops.multiply(ImageChops.multiply(c1, c2), c3)
fg = ImageChops.invert(bg)

# fecha pequenos furos antes de buscar a regiao conectada
fg = fg.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))

seed = (W // 2, H // 2)
assert fg.getpixel(seed) == 255, "o centro da imagem nao caiu no celular"
ImageDraw.floodfill(fg, seed, 128)
sil = fg.point(lambda v: 255 if v == 128 else 0)

# preenche furos: tudo que nao e alcancavel a partir do canto (fundo) vira celular
inv = ImageChops.invert(sil)
for corner in ((0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1)):
    if inv.getpixel(corner) == 255:
        ImageDraw.floodfill(inv, corner, 128)
holes = inv.point(lambda v: 255 if v == 255 else 0)
sil = ImageChops.lighter(sil, holes)

# o aparelho e convexo linha a linha: preenche entre o primeiro e o ultimo pixel de cada linha
# (cobre furos encostados na borda da imagem, onde o celular sai do quadro)
d = ImageDraw.Draw(sil)
for y in range(H):
    bb = sil.crop((0, y, W, y + 1)).getbbox()
    if bb:
        d.line((bb[0], y, bb[2] - 1, y), fill=255)

# suaviza a borda e tira 1 px para nao sobrar franja azul
sil = sil.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.9))

out = im.convert("RGBA")
out.putalpha(sil)
out.save(dst, "WEBP", quality=92, method=6, exact=True)

# preview sobre preto para conferencia
pv = Image.new("RGBA", (W, H), (6, 6, 6, 255))
pv.alpha_composite(out)
pv.convert("RGB").save(prev, "PNG")
bbox = sil.getbbox()
print(dst, "ok; bbox do celular:", bbox)
