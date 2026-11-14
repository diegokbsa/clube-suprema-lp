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
# 8% de folga na altura prevista da maiúscula. Medido nas 40 capturas boas: o desvio real vai de
# -3,5% (claro-automacao-390: marca de 71 px, onde 1 px já são 1,4%) a +1,0%. 4% deixaria 0,5 pp de
# margem e daria vermelho falso no primeiro arredondamento; 8% ainda pega qualquer erro de escala
# que importe — um viewBox pela metade dá +100%.
LIMITE_PROPORCAO = 0.08

# A altura prevista vem de rodape-marcas-medidas.json (a fonte real), NÃO do viewBox em uso: um viewBox
# editado à mão muda o render e mudaria junto a própria previsão, e o portão nunca acusaria nada.
MEDIDAS = Path(__file__).with_name("rodape-marcas-medidas.json")


def altura_prevista(blog: str, largura_img: int) -> float | None:
    """Altura em px que a maiúscula tem de ter nesta largura de imagem, pela medição da fonte."""
    marcas = json.loads(MEDIDAS.read_text(encoding="utf-8"))["marcas"]
    m = marcas.get(blog)
    if not m:
        return None
    largura_vb = float(m["viewBox"].split()[2])
    # O SVG tem width:100%, então a escala é largura_da_imagem / largura do viewBox.
    # A tinta que a faixa cheia enxerga é a maiúscula: o acento do Á é estreito demais para entrar.
    return largura_img * float(m["alturaMaiuscula"]) / largura_vb


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
    # A lista vem do capturas.json, não de um glob: a pasta de entrega também guarda prancha e
    # referências, e um glob por nome já reprovou a prancha como se fosse rodapé de blog.
    registro = json.loads((pasta / "capturas.json").read_text(encoding="utf-8"))
    alvos = [(Path(r["png"]), r.get("blog")) for r in registro if r.get("png") and not r.get("mosaico")]
    if len(alvos) != 40:
        print(json.dumps({"erro": f"esperava 40 capturas de blog no capturas.json, achei {len(alvos)}"}, ensure_ascii=False))
        sys.exit(1)
    saida = []
    for caminho, blog in alvos:
        medida = audita(caminho)
        medida["blog"] = blog
        # Portão da proporção: marca com o dobro da altura encosta nas três bordas igual e passaria
        # por aqui. Medido: viewBox do achadinhos pela metade leva a marca de 152 px para ~304 px.
        prevista = None if medida.get("erro") else altura_prevista(blog, medida["largura"])
        if prevista:
            medida["alturaPrevista"] = round(prevista, 1)
            medida["desvioProporcao"] = round(medida["alturaMarca"] / prevista - 1, 4)
            if abs(medida["desvioProporcao"]) > LIMITE_PROPORCAO:
                medida["erro"] = (f"altura da marca {medida['alturaMarca']} px contra {prevista:.1f} px previstos "
                                  f"pela fonte ({medida['desvioProporcao'] * 100:+.1f}%) — viewBox fora de escala")
        saida.append(medida)
    ruins = [s for s in saida if s.get("erro")
             or s["marcaEsquerda"] > LIMITE_BORDA or s["marcaDireita"] > LIMITE_BORDA or s["marcaBase"] > LIMITE_BORDA]
    print(json.dumps({"capturas": len(saida), "medidas": saida,
                      "reprovadas": [r["arquivo"] for r in ruins]}, ensure_ascii=False, indent=2))
    sys.exit(1 if ruins else 0)


if __name__ == "__main__":
    main()
