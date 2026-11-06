"""Capa do carrossel: recorta a foto para 1080x1350 e aplica a chama do Hot Poker no lado direito do peito
(lado direito de quem olha a foto, como logo de camisa polo). Rosto achado pelo OpenCV; peito pela proporção do rosto.
  python compor_capa.py <foto.png> <saida.png>   → imprime JSON com a posição usada"""
import json, sys
import cv2
from PIL import Image, ImageFilter
CHAMA = r"C:\Users\Administrator\Desktop\portal-afiliacao\portal\public\assets\marcas\hot-poker-chama.png"
foto, saida = sys.argv[1], sys.argv[2]
im = Image.open(foto).convert("RGB")
W, H = im.size
alvo = 1080 / 1350
if W / H > alvo:  # larga demais: corta dos lados
    nw = int(H * alvo); im = im.crop(((W - nw) // 2, 0, (W - nw) // 2 + nw, H))
else:
    nh = int(W / alvo); im = im.crop((0, 0, W, nh))
im = im.resize((1080, 1350), Image.LANCZOS)
tmp = saida + ".tmp.png"; im.save(tmp)
cv = cv2.imread(tmp)
cas = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
faces = cas.detectMultiScale(cv2.cvtColor(cv, cv2.COLOR_BGR2GRAY), 1.1, 6, minSize=(110, 110))
if len(faces) == 0:
    print(json.dumps({"erro": "rosto não encontrado"})); sys.exit(2)
x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
lw = int(w * 0.34)                       # largura do logo
cx = x + w * 0.5 + w * 0.58              # lado direito de quem olha
cy = y + h + h * 1.02                    # altura do peito (alto, como logo de polo)
ch = Image.open(CHAMA).convert("RGBA")
bb = ch.getbbox(); ch = ch.crop(bb)
lh = int(lw * ch.height / ch.width)
ch = ch.resize((lw, lh), Image.LANCZOS)
# estampa de verdade: a chama segue a luz, as dobras e o grão da camiseta
import numpy as np
px, py = int(cx - lw / 2), int(cy - lh / 2)
base = np.asarray(im.crop((px, py, px + lw, py + lh)).convert("L"), dtype=np.float32) / 255.0
suave = np.asarray(Image.fromarray((base * 255).astype("uint8")).filter(ImageFilter.GaussianBlur(6)), dtype=np.float32) / 255.0
media = max(float(suave.mean()), 0.02)
sombra = np.clip(suave / media, 0.55, 1.25)            # luz e sombra grandes do tecido
dobra = np.clip((base + 0.02) / (suave + 0.02), 0.75, 1.3)  # vincos finos
rgba = np.asarray(ch, dtype=np.float32)
rgb = rgba[..., :3] * (sombra * dobra)[..., None] * 0.9    # tinta absorvida no algodão, um pouco mais escura
rgb += np.random.default_rng(7).normal(0, 6, rgb.shape)   # grão da câmera
alfa = rgba[..., 3] * 0.88
out = np.dstack([np.clip(rgb, 0, 255), alfa]).astype("uint8")
ch = Image.fromarray(out, "RGBA").filter(ImageFilter.GaussianBlur(0.8))
im.paste(ch, (px, py), ch)
im.save(saida)
import os; os.remove(tmp)
print(json.dumps({"rosto": [int(x), int(y), int(w), int(h)], "logo": [int(cx), int(cy), lw, lh]}))
