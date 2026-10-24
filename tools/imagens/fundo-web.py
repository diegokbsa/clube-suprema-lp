"""Fundo 'luxo' para as paginas do blog: public/img/bg-luxo.webp (1920x1200) + versao estreita para celular."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import luxo

ROOT = sys.argv[1]
out = os.path.join(ROOT, "public", "img")
os.makedirs(out, exist_ok=True)

big = luxo.luxury_background(1920, 1200, seed=21, sparkles=240,
                             glows=[(0.92, 0.0, 0.5, 70), (0.03, 0.88, 0.4, 40)])
big.convert("RGB").save(os.path.join(out, "bg-luxo.webp"), "WEBP", quality=80, method=6)

tall = luxo.luxury_background(900, 1600, seed=23, sparkles=150, streak_ids=[0, 2, 3, 5],
                              glows=[(0.92, 0.03, 0.8, 60), (0.04, 0.85, 0.7, 35)])
tall.convert("RGB").save(os.path.join(out, "bg-luxo-m.webp"), "WEBP", quality=78, method=6)

for f in ("bg-luxo.webp", "bg-luxo-m.webp"):
    print(f, os.path.getsize(os.path.join(out, f)) // 1024, "KB")
