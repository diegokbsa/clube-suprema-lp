"""Fundo 'preto sofisticado' para o site: so a textura (as barras douradas laterais sao desenhadas em CSS,
para ficarem sempre na borda da tela em qualquer tamanho). Gera public/img/bg-luxo.webp e bg-luxo-m.webp."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import luxo

ROOT = sys.argv[1]
out = os.path.join(ROOT, "public", "img")
os.makedirs(out, exist_ok=True)

luxo.plaster_texture(1920, 1200).convert("RGB").save(os.path.join(out, "bg-luxo.webp"), "WEBP", quality=82, method=6)
luxo.plaster_texture(900, 1600).convert("RGB").save(os.path.join(out, "bg-luxo-m.webp"), "WEBP", quality=80, method=6)
for f in ("bg-luxo.webp", "bg-luxo-m.webp"):
    print(f, os.path.getsize(os.path.join(out, f)) // 1024, "KB")
