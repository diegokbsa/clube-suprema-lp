"""Fundo 'luxo' para as paginas do blog: public/img/bg-luxo.webp (1920x1200) + versao estreita para celular."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import luxo

ROOT = sys.argv[1]
out = os.path.join(ROOT, "public", "img")
os.makedirs(out, exist_ok=True)

big = luxo.luxury_background(1920, 1200, seed=21, sparkles=240,
                             glows=[(0.86, 0.05, 0.55, 85), (0.06, 0.78, 0.45, 50), (0.5, 0.5, 0.6, 22)])
big.convert("RGB").save(os.path.join(out, "bg-luxo.webp"), "WEBP", quality=80, method=6)

tall = luxo.luxury_background(900, 1600, seed=23, sparkles=150, streak_ids=[0, 2, 3, 5],
                              glows=[(0.9, 0.06, 0.9, 80), (0.05, 0.75, 0.8, 45)])
tall.convert("RGB").save(os.path.join(out, "bg-luxo-m.webp"), "WEBP", quality=78, method=6)

for f in ("bg-luxo.webp", "bg-luxo-m.webp"):
    print(f, os.path.getsize(os.path.join(out, f)) // 1024, "KB")
