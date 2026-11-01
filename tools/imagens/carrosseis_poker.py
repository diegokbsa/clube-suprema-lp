"""4 carrosséis de Instagram com os 20 anúncios de conteúdo de poker (01/11/2026), para postar e impulsionar.

Cada carrossel abre com uma capa de chamada (CTA) para o cadastro no Clube Suprema e segue com 5 cards de anuncios_poker.py.
Os cards do "Quem ganha?" são redesenhados aqui com "a resposta está na legenda", porque no post orgânico não há texto de anúncio.

Uso (na raiz do projeto): python tools/imagens/carrosseis_poker.py
Saída: marketing/instagram/carrosseis/<n>-<tema>/01-capa-cta.jpg, 02-...jpg (ordem do carrossel), legenda.txt e LEIA-ME.md
"""
import os
import shutil
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import anuncios_poker as poker  # noqa: E402
import luxo  # noqa: E402

base = poker.base
CARDS = os.path.join(base.ROOT, "marketing", "anuncios", "poker-20")
OUT = os.path.join(base.ROOT, "marketing", "instagram", "carrosseis")
LINK = base.SITE + "/?utm_source=instagram&utm_medium=boost&utm_campaign=carrossel-poker&utm_content="
POR_ID = {a["id"]: a for a in poker.ANUNCIOS}
FIM = ("\n\nJogue no Clube Suprema (ID 10001) pelo app oficial Suprema Poker. Cadastro pelo link da bio, em suprema.blog."
       "\n\n18+ · Jogue com responsabilidade.")
TAGS = "\n\n#poker #pokerbrasil #texasholdem #pokeronline #supremapoker"

CARROSSEIS = [
    dict(pasta="1-quem-ganha", tema="Quem ganha?", teaser="Arraste e veja 5 duelos clássicos: você sabe quem ganha?",
         visual=("duelo", "AsKd", "QhTc"), cards=["q1-ak-x-q10", "q2-aa-x-kk", "q3-22-x-ak", "q4-qq-x-ak", "q5-76-x-aa"],
         legenda="Quem ganha? 5 duelos de all-in antes do flop. Arraste, escolha o seu favorito e confira:\n\n"
                 "1. AK x Q10: AK vence 64% das vezes.\n2. AA x KK: AA vence 81%.\n"
                 "3. 22 x AK: o par de 2, por pouco: 53% a 47%. É a famosa corrida.\n4. QQ x AK: QQ vence 57%.\n"
                 "5. 76 de copas x AA: o 76 vence 23% das vezes.\n\nQuantas você acertou?"),
    dict(pasta="2-situacoes-de-mesa", tema="Situações de mesa", teaser="Arraste: as chances que todo jogador precisa saber",
         visual=("board", "Kh9h", "Qh7h2s", 35.0), cards=["s1-flush-draw-35", "s2-sequencia-31", "s3-trinca-12", "s4-par-1-em-17", "s5-ak-49"],
         legenda="As chances que todo jogador de poker precisa saber de cor:\n\n"
                 "Flush draw no flop fecha 35% das vezes até o river.\nSequência aberta: 31,5%.\n"
                 "Par na mão vira trinca no flop 11,8% das vezes.\nUm par na mão vem 1 vez a cada 17.\n"
                 "Com AK, um Ás ou um Rei aparece até o river 48,7% das vezes.\n\nSalve para consultar na próxima mesa."),
    dict(pasta="3-esporte-da-mente", tema="Esporte da mente", teaser="Arraste: por que o poker é esporte da mente",
         visual=("leque", "AhAsAdAc"), cards=["m1-esporte-da-mente", "m3-posicao", "m2-pot-odds-25", "m4-decisao", "m5-estudo"],
         legenda="Sabia que o poker é reconhecido como esporte da mente pela IMSA, a Associação Internacional de Esportes da Mente, "
                 "ao lado do xadrez e do bridge?\n\nPosição, pot odds, paciência e estudo: arraste e veja o que pesa em cada decisão."),
    dict(pasta="4-vem-se-divertir", tema="Vem se divertir", teaser="Arraste: tem mesa rodando a qualquer hora",
         visual=("fichas",), cards=["d1-vem-se-divertir", "d3-sexta", "d2-blefe", "d5-aa-1-em-221", "d4-all-in"],
         legenda="Vem se divertir: no Clube Suprema tem mesa rodando de manhã, de tarde e de madrugada. Texas Hold'em, Omaha, "
                 "torneios e Spin, com fichas por PIX e suporte 24h.\n\nO blefe, a sexta de mesa cheia, o par de Ases e o frio na "
                 "barriga do all-in: arraste."),
]


def capa(c, destino, seed):
    """Capa de chamada (1080x1080): JOGUE AGORA, o clube, o tema do carrossel, o visual e o botão de cadastro."""
    W = H = 1080
    img = luxo.luxury_background(W, H, seed=seed)
    a = dict(destaque="JOGUE AGORA", titulo="Poker de verdade no Clube Suprema, ID 10001 no app Suprema Poker", apoio=c["teaser"])
    y = base.textos(img, a, 70, 130, 54, 30, 936)
    f = poker.font(48, 900)
    while True:
        botao = luxo.gold_button("Cadastre-se em suprema.blog", f, pad=(44, 24), arrow_font=f)
        if botao.width <= 936:
            break
        f = poker.font(f.size - 2, 900)
    y_botao = 940 - 40 - botao.height
    livre = y_botao - y - 60
    v = poker.visual(dict(visual=c["visual"]), 936, livre * 2)  # desenha folgado e reduz para caber
    k = min(1.0, livre / v.height, 936 / v.width)
    if k < 1:
        v = v.resize((int(v.width * k), int(v.height * k)), Image.LANCZOS)
    img.alpha_composite(v, ((W - v.width) // 2, y + 20 + (livre - v.height) // 2))
    luxo.paste(img, botao, ((W - botao.width) // 2, y_botao), glow=0.25)
    base.rodape(img, 970)
    img.convert("RGB").save(destino, quality=92)


def card_quem_ganha(id_, destino, seed):
    a = dict(POR_ID[id_], apoio="A resposta está na legenda")
    W = H = 1080
    img = luxo.luxury_background(W, H, seed=seed)
    y = base.textos(img, a, 70, 130, 58, 30, 936)
    livre = 940 - y - 40
    v = poker.visual(a, 936, livre)
    k = min(1.0, livre / v.height, 936 / v.width)
    if k < 1:
        v = v.resize((int(v.width * k), int(v.height * k)), Image.LANCZOS)
    img.alpha_composite(v, ((W - v.width) // 2, y + 20 + (livre - v.height) // 2))
    base.rodape(img, 970)
    img.convert("RGB").save(destino, quality=92)


def leia_me():
    linhas = ["# 4 carrosséis de poker para o Instagram (@supremaclub)", "",
              "Gerados por `tools/imagens/carrosseis_poker.py` (01/11/2026) a partir dos 20 anúncios de `marketing/anuncios/poker-20`.",
              "Cada pasta tem as artes na ordem do carrossel (`01-capa-cta.jpg` primeiro) e a `legenda.txt`.", "",
              "Ordem de postagem: 4, 3, 2 e 1, para o \"Quem ganha?\" ficar em primeiro no perfil.", "",
              "Ao impulsionar: destino **Seu site**, botão **Cadastre-se** e o link de cada carrossel:", ""]
    for c in CARROSSEIS:
        linhas.append(f"- {c['pasta']}: {LINK}{c['pasta']}")
    caminho = os.path.join(OUT, "LEIA-ME.md")
    with open(caminho, "w", encoding="utf-8") as fh:
        fh.write("\n".join(linhas) + "\n")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    for n, c in enumerate(CARROSSEIS):
        pasta = os.path.join(OUT, c["pasta"])
        os.makedirs(pasta, exist_ok=True)
        capa(c, os.path.join(pasta, "01-capa-cta.jpg"), seed=3000 + n * 17)
        for i, id_ in enumerate(c["cards"], start=2):
            destino = os.path.join(pasta, f"{i:02d}-{id_}.jpg")
            if id_.startswith("q"):
                card_quem_ganha(id_, destino, seed=2000 + poker.ANUNCIOS.index(POR_ID[id_]) * 11)
            else:
                shutil.copyfile(os.path.join(CARDS, f"{id_}-1080x1080.jpg"), destino)
        with open(os.path.join(pasta, "legenda.txt"), "w", encoding="utf-8") as fh:
            fh.write(c["legenda"] + FIM + TAGS + "\n")
        print("ok", c["pasta"])
    leia_me()
    print("ok LEIA-ME.md")
