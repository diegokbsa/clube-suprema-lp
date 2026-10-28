# Versões WebP das capas do blog (1200 e 600 px) a partir do cover.jpg de cada post.
# O site usa as duas no srcset (no celular baixa a de 600 px, ~4x mais leve que o JPG);
# o JPG continua sendo a imagem das redes sociais (og:image) e do RSS.
#
# Uso (na raiz do projeto): python tools/imagens/capas_webp.py .
# O capas.py já chama variantes() depois de desenhar cada capa.
import os
import sys
from PIL import Image

LARGURAS = {"cover.webp": 1200, "cover-600.webp": 600}


def variantes(jpg):
    pasta = os.path.dirname(jpg)
    img = Image.open(jpg).convert("RGB")
    tamanhos = []
    for nome, w in LARGURAS.items():
        out = img if w == img.width else img.resize((w, round(img.height * w / img.width)), Image.LANCZOS)
        destino = os.path.join(pasta, nome)
        out.save(destino, "WEBP", quality=82, method=6)
        tamanhos.append(f"{nome} {os.path.getsize(destino) // 1024} KB")
    return tamanhos


if __name__ == "__main__":
    raiz = os.path.join(sys.argv[1] if len(sys.argv) > 1 else ".", "public", "img", "blog")
    for slug in sorted(os.listdir(raiz)):
        jpg = os.path.join(raiz, slug, "cover.jpg")
        if os.path.exists(jpg):
            print("ok", slug, os.path.getsize(jpg) // 1024, "KB jpg ->", ", ".join(variantes(jpg)))
