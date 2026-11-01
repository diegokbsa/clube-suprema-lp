"""20 anúncios de conteúdo de poker do Clube Suprema (01/11/2026), sem tela do app: "Quem ganha?", situações de mesa em %,
"Vem se divertir" e poker como esporte da mente. Cartas, barras, fichas e mesa desenhadas aqui; o resto (fundo, textos,
rodapé) vem de anuncios_clube.py.

Os números foram calculados, não copiados: as disputas pré-flop por enumeração de todos os boards (scratch equity.py,
mãos com os naipes desenhados aqui) e as situações de mesa por combinatória (outs / cartas que faltam).
O "esporte da mente" é o reconhecimento da IMSA (Associação Internacional de Esportes da Mente), ao lado do xadrez e do bridge.

Uso (na raiz do projeto): python tools/imagens/anuncios_poker.py [prefixo]
Saída: marketing/anuncios/poker-20/<id>-1080x1080.jpg, <id>-1080x1920.jpg e textos.md
"""
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import anuncios_clube as base  # noqa: E402
import luxo  # noqa: E402

base.OUT = os.path.join(base.ROOT, "marketing", "anuncios", "poker-20")
SYMBOL = r"C:\Windows\Fonts\seguisym.ttf"
UTM = "utm_source=meta&utm_medium=paid&utm_campaign=conteudo-poker&utm_content="
RED, INK, GOLD = (200, 32, 44), (20, 20, 22), luxo.GOLD
NAIPE = {"s": "♠", "h": "♥", "d": "♦", "c": "♣"}
FIM = "\n\nJogue no Clube Suprema (ID 10001) pelo app oficial Suprema Poker.\n\n18+ · Jogue com responsabilidade."

ANUNCIOS = [
    # Quem ganha? (pré-flop, all-in; a resposta fica no texto do anúncio)
    dict(id="q1-ak-x-q10", destaque="QUEM GANHA?", titulo="AK contra Q10, all-in antes do flop",
         apoio="A resposta está no texto do anúncio", visual=("duelo", "AsKd", "QhTc"),
         texto="AK contra Q10, all-in antes do flop: quem ganha?\n\nResposta: AK vence 64% das vezes, Q10 36%. O Ás e o Rei dominam "
               "o Q10, que precisa acertar a mesa para virar." + FIM,
         manchete="AK × Q10: quem ganha?", descricao="AK vence 64% das vezes"),
    dict(id="q2-aa-x-kk", destaque="QUEM GANHA?", titulo="AA contra KK, o pesadelo de quem tem reis",
         apoio="A resposta está no texto do anúncio", visual=("duelo", "AsAd", "KhKc"),
         texto="AA contra KK, as duas maiores mãos do poker frente a frente: quem ganha?\n\nResposta: AA vence 81% das vezes. O KK "
               "precisa de um Rei na mesa (ou de uma sequência ou flush)." + FIM,
         manchete="AA × KK: quem ganha?", descricao="AA vence 81% das vezes"),
    dict(id="q3-22-x-ak", destaque="QUEM GANHA?", titulo="Par de 2 contra AK: quem é o favorito?",
         apoio="A resposta está no texto do anúncio", visual=("duelo", "2s2d", "AhKc"),
         texto="Par de 2 contra AK, a famosa corrida: quem é o favorito?\n\nResposta: o par de 2, por pouco: 53% contra 47%. "
               "Por isso se chama corrida: é quase uma moeda." + FIM,
         manchete="22 × AK: quem é favorito?", descricao="O par pequeno: 53% a 47%"),
    dict(id="q4-qq-x-ak", destaque="QUEM GANHA?", titulo="QQ contra AK: a dúvida de todo torneio",
         apoio="A resposta está no texto do anúncio", visual=("duelo", "QsQd", "AhKc"),
         texto="QQ contra AK, a dúvida de todo torneio: quem ganha?\n\nResposta: QQ vence 57% das vezes, AK 43%. As damas "
               "saem na frente, mas um Ás ou um Rei na mesa vira o jogo." + FIM,
         manchete="QQ × AK: quem ganha?", descricao="QQ vence 57% das vezes"),
    dict(id="q5-76-x-aa", destaque="QUEM GANHA?", titulo="76 de copas contra AA: tem chance?",
         apoio="A resposta está no texto do anúncio", visual=("duelo", "7h6h", "AsAc"),
         texto="76 de copas contra AA: tem chance?\n\nResposta: tem, e mais do que parece: 23% das vezes o 76 vence, com "
               "sequência, flush ou dois pares. O AA leva 77%." + FIM,
         manchete="76 de copas × AA: tem chance?", descricao="Sim: 23% das vezes"),
    # Situações de mesa em %
    dict(id="s1-flush-draw-35", destaque="35%", titulo="Flush draw no flop: a chance de fechar até o river",
         apoio="9 cartas de copas ajudam, com duas cartas por vir", visual=("board", "Kh9h", "Qh7h2s", 35.0),
         texto="Quatro cartas do mesmo naipe no flop? Até o river, o flush fecha 35% das vezes: são 9 cartas que ajudam e duas "
               "chances de elas aparecerem." + FIM,
         manchete="Flush draw: 35% até o river", descricao="9 outs, duas cartas por vir"),
    dict(id="s2-sequencia-31", destaque="31%", titulo="Sequência aberta no flop: 8 cartas fecham o jogo",
         apoio="Um 10 ou um 5 completa; 31,5% até o river", visual=("board", "9s8d", "7c6hKd", 31.5),
         texto="Com 9-8 e um flop 7-6-K, qualquer 10 ou 5 fecha a sequência: são 8 cartas. Até o river, a sequência vem 31,5% "
               "das vezes." + FIM,
         manchete="Sequência aberta: 31,5%", descricao="8 outs até o river"),
    dict(id="s3-trinca-12", destaque="12%", titulo="Par na mão vira trinca no flop 12% das vezes",
         apoio="Quase 1 em cada 8 flops", visual=("board", "7c7d", "7hKs2d", 11.8),
         texto="Recebeu um par? O flop traz a trinca 11,8% das vezes, quase 1 em cada 8. É por isso que todo par pequeno quer "
               "ver o flop barato." + FIM,
         manchete="Par vira trinca: 12% no flop", descricao="Quase 1 em cada 8 flops"),
    dict(id="s4-par-1-em-17", destaque="1 em 17", titulo="É a chance de receber um par na mão",
         apoio="5,9% das mãos começam com um par", visual=("maos", "8s8h", "JdJc", "4h4c"),
         texto="Só 1 em cada 17 mãos começa com um par (5,9%). Quando vier, a decisão é sua: aumentar, pagar ou montar a armadilha." + FIM,
         manchete="Par na mão: 1 em 17", descricao="5,9% das mãos"),
    dict(id="s5-ak-49", destaque="49%", titulo="Com AK, um Ás ou um Rei aparece até o river",
         apoio="Quase metade das vezes, com 6 cartas que ajudam", visual=("board", "AsKd", "", 48.7),
         texto="Com AK na mão, um Ás ou um Rei aparece na mesa até o river 48,7% das vezes. Na outra metade, o AK continua só com "
               "a carta alta: é aí que entra a leitura de mesa." + FIM,
         manchete="AK acerta a mesa 49% das vezes", descricao="Ás ou Rei até o river"),
    # Vem se divertir
    dict(id="d1-vem-se-divertir", destaque="VEM", titulo="Vem se divertir: tem mesa rodando a qualquer hora",
         apoio="Texas Hold'em, Omaha, torneios e Spin", visual=("leque", "AsKhQdJcTs"),
         texto="Vem se divertir: no Clube Suprema tem mesa rodando de manhã, de tarde e de madrugada. Texas Hold'em, Omaha, torneios "
               "e Spin, com fichas por PIX e suporte 24h." + FIM,
         manchete="Vem se divertir no poker", descricao="Mesa a qualquer hora"),
    dict(id="d2-blefe", destaque="BLEFE", titulo="Um blefe bem dado vale a noite inteira",
         apoio="O que você tem na mão? Só você sabe.", visual=("verso", 2),
         texto="Um blefe bem dado vale a noite inteira. No poker, o que você tem na mão só você sabe: o resto é coragem e leitura de mesa." + FIM,
         manchete="Um blefe bem dado vale a noite", descricao="Só você sabe suas cartas"),
    dict(id="d3-sexta", destaque="SEXTA", titulo="Sexta à noite é dia de mesa cheia",
         apoio="Torneios e cash game no Clube Suprema", visual=("fichas",),
         texto="Sexta à noite é dia de mesa cheia: torneios garantidos, cash game e os amigos do clube. Chegue cedo e pegue seu lugar." + FIM,
         manchete="Sexta à noite tem mesa cheia", descricao="Torneios e cash game"),
    dict(id="d4-all-in", destaque="ALL-IN", titulo="Aquele frio na barriga do all-in, direto do celular",
         apoio="Torneios o dia todo na Liga Suprema", visual=("fichas",),
         texto="Aquele frio na barriga do all-in, direto do celular. Torneios o dia todo na Liga Suprema e o Clube Suprema esperando você." + FIM,
         manchete="O frio na barriga do all-in", descricao="Torneios o dia todo"),
    dict(id="d5-aa-1-em-221", destaque="1 em 221", titulo="É a chance de receber AA. Quando vier, esteja na mesa.",
         apoio="0,45% das mãos começam com o par de Ases", visual=("duas", "AsAh"),
         texto="O par de Ases vem 1 vez a cada 221 mãos (0,45%). Quando ele aparecer, você vai querer estar sentado numa mesa." + FIM,
         manchete="AA: 1 em 221 mãos", descricao="Esteja na mesa quando vier"),
    # Esporte da mente
    dict(id="m1-esporte-da-mente", destaque="MENTE", titulo="Sabia que poker é esporte da mente?",
         apoio="Reconhecido pela IMSA, ao lado do xadrez e do bridge", visual=("leque", "AhAsAdAc"),
         texto="Sabia que o poker é reconhecido como esporte da mente pela IMSA, a Associação Internacional de Esportes da Mente, ao "
               "lado do xadrez e do bridge? Matemática, leitura e controle emocional em cada mão." + FIM,
         manchete="Poker é esporte da mente", descricao="Reconhecido pela IMSA"),
    dict(id="m2-pot-odds-25", destaque="25%", titulo="Pote de 30 e aposta de 10: basta vencer 25% das vezes",
         apoio="Pot odds: a conta por trás de cada call", visual=("barra", 25.0, "chance mínima de vencer para o call valer", None),
         texto="Pote de 30 e você paga 10 para disputar 40: o call compensa se você vencer 25% das vezes. Isso é pot odds, a conta "
               "que os bons jogadores fazem antes de cada decisão." + FIM,
         manchete="Pot odds: a conta do call", descricao="Pague 10, dispute 40"),
    dict(id="m3-posicao", destaque="POSIÇÃO", titulo="Agir por último é vantagem: você vê o que todos fizeram",
         apoio="No poker, o botão vale fichas", visual=("mesa",),
         texto="Agir por último é uma das maiores vantagens do poker: você decide depois de ver o que todos fizeram. Por isso o botão "
               "é o melhor lugar da mesa." + FIM,
         manchete="Posição é vantagem no poker", descricao="O botão vale fichas"),
    dict(id="m4-decisao", destaque="DECISÃO", titulo="Cada mão é uma decisão. Foldar também é jogar.",
         apoio="Paciência, leitura e matemática", visual=("verso", 2),
         texto="Cada mão é uma decisão, e foldar também é jogar. Paciência para esperar a mão certa, leitura para entender a mesa e "
               "matemática para saber quando pagar." + FIM,
         manchete="Foldar também é jogar", descricao="Paciência, leitura e matemática"),
    dict(id="m5-estudo", destaque="ESTUDO", titulo="Os melhores jogadores revisam as mãos que jogam",
         apoio="Ranking das mãos, posição e pot odds no nosso blog", visual=("leque", "Ts9s8s7s6s"),
         texto="Os melhores jogadores revisam as mãos que jogam. No blog do Clube Suprema tem o ranking das mãos, as regras e as "
               "ações da mesa, explicados do zero." + FIM,
         manchete="Quem estuda joga melhor", descricao="Guias de poker no blog"),
]


def font(size, weight=800):
    return base.font(size, weight)


def symbol(size):
    return ImageFont.truetype(SYMBOL, size)


def carta(codigo, h):
    """Carta aberta (ex.: 'As', 'Th') com h pixels de altura."""
    w = int(h * 0.71)
    rank = "10" if codigo[0] == "T" else codigo[0]
    cor = RED if codigo[1] in "hd" else INK
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=int(h * 0.08), fill=(250, 248, 244), outline=(210, 205, 196), width=2)
    fr, fs = font(int(h * 0.24), 800), symbol(int(h * 0.17))
    d.text((int(h * 0.07), int(h * 0.04)), rank, font=fr, fill=cor)
    d.text((int(h * 0.075), int(h * 0.29)), NAIPE[codigo[1]], font=fs, fill=cor)
    d.text((w / 2, h * 0.6), NAIPE[codigo[1]], font=symbol(int(h * 0.42)), fill=cor, anchor="mm")
    return im


def verso(h):
    """Carta virada: preta com borda e losangos dourados."""
    w = int(h * 0.71)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=int(h * 0.08), fill=(14, 11, 7), outline=GOLD, width=4)
    m = int(h * 0.07)
    d.rounded_rectangle((m, m, w - m, h - m), radius=int(h * 0.05), outline=(120, 82, 30), width=2)
    passo = int(h * 0.11)
    for y in range(m + passo // 2, h - m, passo):
        for x in range(m + passo // 2, w - m, passo):
            d.polygon([(x, y - passo * 0.32), (x + passo * 0.32, y), (x, y + passo * 0.32), (x - passo * 0.32, y)], outline=(150, 104, 40))
    d.text((w / 2, h / 2), "S", font=font(int(h * 0.3), 900), fill=GOLD, anchor="mm")
    return im


def sombra(im, blur=18, off=12):
    sh = Image.new("RGBA", (im.width + blur * 4, im.height + blur * 4), (0, 0, 0, 0))
    sh.paste((0, 0, 0, 170), (blur * 2, blur * 2 + off), im.split()[3])
    return sh.filter(ImageFilter.GaussianBlur(blur)), blur * 2


def colar(dest, im, xy):
    sh, o = sombra(im)
    dest.alpha_composite(sh, (int(xy[0]) - o, int(xy[1]) - o))
    dest.alpha_composite(im, (int(xy[0]), int(xy[1])))


def mao(codigos, h, gap=0.12):
    """Cartas lado a lado, levemente sobrepostas."""
    cs = [carta(codigos[i:i + 2], h) for i in range(0, len(codigos), 2)]
    w = cs[0].width
    passo = int(w * (1 - gap))
    im = Image.new("RGBA", (passo * (len(cs) - 1) + w + 60, h + 60), (0, 0, 0, 0))
    for i, c in enumerate(cs):
        colar(im, c, (30 + i * passo, 24))
    return im


def barra(pct, w, h, rotulo_esq=None, rotulo_dir=None):
    """Barra dourada com a porcentagem; o resto em cinza."""
    im = Image.new("RGBA", (w, h + int(h * 0.9)), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w - 1, h), radius=h // 2, fill=(40, 36, 30), outline=(90, 76, 50), width=2)
    fill = max(h, int(w * pct / 100))
    g = luxo.gold_gradient(fill, h)
    mask = Image.new("L", (fill, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, fill - 1, h - 1), radius=h // 2, fill=255)
    g.putalpha(mask)
    im.alpha_composite(g, (0, 0))
    txt = f"{pct:.1f}%".replace(".0%", "%").replace(".", ",")
    f = font(int(h * 0.55), 900)
    d.text((fill - int(h * 0.4), h / 2), txt, font=f, fill=luxo.INK, anchor="rm") if fill > w * 0.22 else \
        d.text((fill + int(h * 0.4), h / 2), txt, font=f, fill=luxo.GOLD_LIGHT, anchor="lm")
    fl = font(int(h * 0.36), 600)
    if rotulo_esq:
        d.text((0, h + int(h * 0.25)), rotulo_esq, font=fl, fill=base.MUTED)
    if rotulo_dir:
        d.text((w, h + int(h * 0.25)), rotulo_dir, font=fl, fill=base.MUTED, anchor="ra")
    return im


def leque(codigos, h):
    """Cartas abertas em leque."""
    cs = [carta(codigos[i:i + 2], h) for i in range(0, len(codigos), 2)]
    n = len(cs)
    tam = int(h * 2.4)
    im = Image.new("RGBA", (tam * 2, int(h * 1.9)), (0, 0, 0, 0))
    cx, cy = tam, int(h * 1.75)
    for i, c in enumerate(cs):
        ang = (i - (n - 1) / 2) * 13
        r = c.rotate(-ang, expand=True, resample=Image.BICUBIC)
        rad = math.radians(ang)
        x = cx + math.sin(rad) * h * 1.05 - r.width / 2
        y = cy - math.cos(rad) * h * 1.05 - r.height / 2
        colar(im, r, (x, y))
    return im.crop(im.getbbox())


def ficha(r, cor):
    im = Image.new("RGBA", (r * 2, int(r * 0.62) + 10), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    alt = int(r * 0.22)
    escuro = tuple(int(v * 0.6) for v in cor)
    d.ellipse((0, alt, r * 2 - 1, int(r * 0.62) + alt - 12), fill=escuro)
    d.rectangle((0, int(r * 0.31), r * 2 - 1, int(r * 0.31) + alt - 6), fill=escuro)
    d.ellipse((0, 0, r * 2 - 1, int(r * 0.62) - 6), fill=cor, outline=(250, 240, 220), width=3)
    for k in range(8):
        a = k * math.pi / 4
        x, y = r + math.cos(a) * r * 0.82, (int(r * 0.62) - 6) / 2 + math.sin(a) * r * 0.25
        d.ellipse((x - r * 0.1, y - r * 0.05, x + r * 0.1, y + r * 0.05), fill=(250, 245, 235))
    d.ellipse((r * 0.45, (int(r * 0.62) - 6) * 0.25, r * 1.55, (int(r * 0.62) - 6) * 0.75), outline=(250, 240, 220), width=2)
    return im


def fichas(h):
    """Três pilhas de fichas (preta, dourada e vermelha)."""
    r = int(h * 0.3)
    cores = [(28, 26, 24), GOLD, (170, 30, 40)]
    alturas = [7, 10, 5]
    im = Image.new("RGBA", (int(r * 2 * 3.4), h + r), (0, 0, 0, 0))
    for p, (cor, n) in enumerate(zip(cores, alturas)):
        x = int(p * r * 2.2)
        f = ficha(r, cor)
        for k in range(n):
            colar(im, f, (x, h - k * int(r * 0.2) - f.height // 2)) if k == 0 else im.alpha_composite(f, (x, h - k * int(r * 0.2) - f.height // 2))
    return im.crop(im.getbbox())


def mesa(w):
    """Mesa oval de 6 lugares com o botão (BTN) em destaque."""
    h = int(w * 0.62)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    m = int(w * 0.12)
    d.rounded_rectangle((m, m, w - m, h - m), radius=(h - 2 * m) // 2, fill=(16, 64, 44), outline=GOLD, width=6)
    d.rounded_rectangle((m + 22, m + 22, w - m - 22, h - m - 22), radius=(h - 2 * m) // 2 - 22, outline=(40, 110, 76), width=3)
    lugares = [("SB", 0.30, 0.0), ("BB", 0.70, 0.0), ("UTG", 1.0, 0.5), ("MP", 0.70, 1.0), ("CO", 0.30, 1.0), ("BTN", 0.0, 0.5)]
    r = int(w * 0.075)
    for nome, fx, fy in lugares:
        x = m + fx * (w - 2 * m)
        y = m + fy * (h - 2 * m)
        destaque = nome == "BTN"
        cor = GOLD if destaque else (34, 30, 26)
        d.ellipse((x - r, y - r, x + r, y + r), fill=cor, outline=luxo.GOLD_LIGHT if destaque else (110, 96, 70), width=3)
        d.text((x, y), nome, font=font(int(r * (0.62 if len(nome) > 2 else 0.72)), 800), fill=luxo.INK if destaque else base.MUTED, anchor="mm")
    d.text((w / 2, h / 2), "age por último", font=font(int(w * 0.045), 700), fill=luxo.GOLD_LIGHT, anchor="mm")
    return im


def visual(a, largura, altura):
    """Monta o visual do anúncio no tamanho disponível (largura x altura)."""
    tipo, *args = a["visual"]
    if tipo == "duelo":
        hc = int(min(altura * 0.78, largura * 0.33))
        m1, m2 = mao(args[0], hc), mao(args[1], hc)
        vs = font(int(hc * 0.42), 900)
        gap = int(hc * 0.55)
        im = Image.new("RGBA", (m1.width + m2.width + gap, max(m1.height, m2.height)), (0, 0, 0, 0))
        im.alpha_composite(m1, (0, 0))
        im.alpha_composite(m2, (m1.width + gap, 0))
        luxo.gold_text(im, (m1.width + gap / 2, im.height / 2), "×", vs, anchor="mm", glow=0.3)
        return im
    if tipo == "board":
        mao_c, flop, pct = args
        hc = int(min(altura * 0.42, largura * 0.2))
        partes = [mao(mao_c, hc)] + ([mao(flop, hc, gap=-0.06)] if flop else [])
        gap = int(hc * 0.35)
        lw = sum(p.width for p in partes) + gap * (len(partes) - 1)
        b = barra(pct, min(largura, max(lw, int(largura * 0.8))), int(hc * 0.36))
        im = Image.new("RGBA", (max(lw, b.width), partes[0].height + int(hc * 0.25) + b.height), (0, 0, 0, 0))
        x = (im.width - lw) // 2
        for p in partes:
            im.alpha_composite(p, (x, 0))
            x += p.width + gap
        im.alpha_composite(b, ((im.width - b.width) // 2, partes[0].height + int(hc * 0.25)))
        return im
    if tipo == "maos":
        hc = int(min(altura * 0.7, largura * 0.22))
        ms = [mao(c, hc) for c in args]
        gap = int(hc * 0.18)
        im = Image.new("RGBA", (sum(m.width for m in ms) + gap * (len(ms) - 1), ms[0].height), (0, 0, 0, 0))
        x = 0
        for m in ms:
            im.alpha_composite(m, (x, 0))
            x += m.width + gap
        return im
    if tipo == "duas":
        return mao(args[0], int(min(altura * 0.85, largura * 0.42)), gap=-0.05)
    if tipo == "leque":
        n = len(args[0]) // 2
        return leque(args[0], int(min(altura * 0.5, largura * (0.36 if n <= 4 else 0.3))))
    if tipo == "verso":
        hc = int(min(altura * 0.8, largura * 0.4))
        c1, c2 = verso(hc).rotate(8, expand=True, resample=Image.BICUBIC), verso(hc).rotate(-6, expand=True, resample=Image.BICUBIC)
        im = Image.new("RGBA", (int(c1.width * 1.75) + 60, max(c1.height, c2.height) + 60), (0, 0, 0, 0))
        colar(im, c1, (30, 30))
        colar(im, c2, (30 + int(c1.width * 0.72), 36))
        return im
    if tipo == "fichas":
        return fichas(int(min(altura * 0.75, largura * 0.42)))
    if tipo == "barra":
        pct, esq, dir_ = args
        return barra(pct, int(largura * 0.92), int(min(altura * 0.2, 96)), esq, dir_)
    if tipo == "mesa":
        return mesa(int(min(largura, altura * 1.5)))
    raise ValueError(tipo)


def gerar(a, seed):
    for (W, H, y0, dest, tit, apoio, fim, rod) in ((1080, 1080, 70, 130, 58, 30, 940, 970), (1080, 1920, 260, 170, 74, 36, 1440, 1480)):
        img = luxo.luxury_background(W, H, seed=seed + (0 if H == 1080 else 50))
        y = base.textos(img, a, y0, dest, tit, apoio, 936)
        livre = fim - y - 40
        v = visual(a, 936, livre)
        k = min(1.0, livre / v.height, 936 / v.width)          # nunca passa das margens de 72 px nem do espaço livre
        if k < 1:
            v = v.resize((int(v.width * k), int(v.height * k)), Image.LANCZOS)
        img.alpha_composite(v, ((W - v.width) // 2, y + 20 + (livre - v.height) // 2))
        base.rodape(img, rod)
        base.salvar(img, f"{a['id']}-{W}x{H}.jpg")


def textos_md():
    linhas = ["# 20 anúncios de conteúdo de poker do Clube Suprema", "",
              "Gerado por `tools/imagens/anuncios_poker.py` (01/11/2026), sem tela do app. Chamada: **Cadastre-se**. "
              "Porcentagens calculadas (enumeração dos boards e combinatória); IMSA = Associação Internacional de Esportes da Mente.", ""]
    for a in ANUNCIOS:
        linhas += [f"## {a['id']}", "",
                   f"- Artes: `{a['id']}-1080x1080.jpg` (feed) e `{a['id']}-1080x1920.jpg` (Stories e Reels)",
                   f"- Título: **{a['manchete']}** ({len(a['manchete'])} caracteres)",
                   f"- Descrição: {a['descricao']}",
                   f"- Link: {base.SITE}/?{UTM}{a['id']}", "", "Texto principal:", "", "```", a["texto"], "```", ""]
    caminho = os.path.join(base.OUT, "textos.md")
    with open(caminho, "w", encoding="utf-8") as fh:
        fh.write("\n".join(linhas))
    return caminho


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    so = sys.argv[1] if len(sys.argv) > 1 else ""
    for i, a in enumerate(ANUNCIOS):
        if so and not a["id"].startswith(so):
            continue
        gerar(a, seed=2000 + i * 11)
        print("ok", a["id"])
    os.makedirs(base.OUT, exist_ok=True)
    print("ok", os.path.relpath(textos_md(), base.ROOT))
