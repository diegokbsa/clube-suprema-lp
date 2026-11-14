# -*- coding: utf-8 -*-
"""Confere na tinta do PNG o que o CSS promete: a marca encosta na esquerda, na direita e na base.
Mede pixel, não caixa de layout — é a prova que sobrevive a "a captura engana".
Uso: python portal/tools/auditar-rodape-pixel.py <pasta-das-capturas>
"""
import json
import sys
from pathlib import Path

from PIL import Image

LIMITE_BORDA = 2      # px de folga aceitos na esquerda/direita
LINHA_CHEIA = 0.12    # fração da largura com tinta que caracteriza uma linha da marca


def audita(caminho: Path) -> dict:
    img = Image.open(caminho).convert("RGB")
    larg, alt = img.size
    px = img.load()
    fundo = px[larg - 2, 2]  # canto superior direito: fundo do rodapé em todos os blogs

    def tem_tinta(c):
        return abs(c[0] - fundo[0]) + abs(c[1] - fundo[1]) + abs(c[2] - fundo[2]) > 60

    # A marca ocupa a faixa de baixo: linhas com muita tinta, varrendo de baixo para cima.
    linhas = []
    for y in range(alt - 1, int(alt * 0.4), -1):
        conta = sum(1 for x in range(0, larg, 2) if tem_tinta(px[x, y]))
        if conta * 2 >= larg * LINHA_CHEIA:
            linhas.append(y)
        elif linhas:
            break
    if not linhas:
        return {"arquivo": caminho.name, "erro": "não achei a faixa da marca"}

    topo, base = min(linhas), max(linhas)
    esq, dir_ = larg, -1
    for y in linhas:
        for x in range(larg):
            if tem_tinta(px[x, y]):
                esq = min(esq, x)
                break
        for x in range(larg - 1, -1, -1):
            if tem_tinta(px[x, y]):
                dir_ = max(dir_, x)
                break
    return {
        "arquivo": caminho.name, "largura": larg, "altura": alt,
        "marcaEsquerda": esq, "marcaDireita": larg - 1 - dir_, "marcaBase": alt - 1 - base,
        "alturaMarca": base - topo + 1,
        "fundo": "#%02x%02x%02x" % fundo,
    }


def main():
    pasta = Path(sys.argv[1])
    saida = [audita(p) for p in sorted(pasta.glob("*-*.png")) if not p.name.startswith("mosaico")]
    ruins = [s for s in saida if s.get("erro")
             or s["marcaEsquerda"] > LIMITE_BORDA or s["marcaDireita"] > LIMITE_BORDA or s["marcaBase"] > LIMITE_BORDA]
    print(json.dumps({"capturas": len(saida), "medidas": saida,
                      "reprovadas": [r["arquivo"] for r in ruins]}, ensure_ascii=False, indent=2))
    sys.exit(1 if ruins else 0)


if __name__ == "__main__":
    main()
