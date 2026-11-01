"""Os 10 anúncios de cadastro do Clube Suprema (01/11/2026): arte quadrada 1080x1080 (feeds) e vertical 1080x1920
(Stories e Reels, com o texto fora das faixas que o Instagram cobre) + o texto de cada um, num lugar só.

Partiu da Biblioteca de Anúncios da Meta (busca "suprema poker" e vizinhas, 01/11/2026): o que roda no Brasil é oferta direta
(bônus, fichas grátis, ticket), a dor de depender do agente para sacar (7K Poker), cartaz "PROCURA-SE" (Brotherhood) e
"poker 24h". Aqui ficam só os ângulos que o clube cumpre de verdade: nada de bônus que não existe.

Uso (na raiz do projeto): python tools/imagens/anuncios_clube.py
Saída: marketing/anuncios/clube-10/<id>-1080x1080.jpg, <id>-1080x1920.jpg e textos.md
"""
import os
import sys
import tempfile
import urllib.request
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import luxo  # noqa: E402
import logo  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "marketing", "anuncios", "clube-10")
FONT = os.path.join(tempfile.gettempdir(), "fonts", "Montserrat.ttf")
if not os.path.exists(FONT):
    os.makedirs(os.path.dirname(FONT), exist_ok=True)
    urllib.request.urlretrieve("https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf", FONT)

WHITE, MUTED, GOLD = luxo.WHITE, (190, 186, 178), luxo.GOLD
SITE = "https://suprema.blog"
UTM = "utm_source=meta&utm_medium=paid&utm_campaign=cadastro-novembro&utm_content="

# destaque: palavra ou número grande em dourado; titulo: frase principal; apoio: uma linha de contexto;
# visual: phone-mesa | phone-abertura | passos | chat | nenhum; pagina: versão da LP que repete o que o anúncio mostra.
ANUNCIOS = [
    dict(id="01-procura-se", destaque="PROCURA-SE", titulo="Jogadores para mesas que rodam a qualquer hora",
         apoio="Cash game, torneios e Spin no app Suprema Poker", visual="phone-mesa", pagina="/",
         texto="Procura-se jogador de poker que quer mesa rodando de manhã, de tarde e de madrugada.\n\nNo Clube Suprema (ID 10001) "
               "você joga pelo app oficial, compra fichas por PIX e tem suporte 24h no WhatsApp. Cadastro em 2 minutos.\n\n18+ · Jogue com responsabilidade.",
         manchete="Mesa rodando a qualquer hora", descricao="Clube Suprema · ID 10001"),
    dict(id="02-pix-no-cpf", destaque="PIX", titulo="Fichas por PIX. Saque na chave do seu CPF.",
         apoio="Pelo Fichas 24h, sem passar dinheiro para terceiro", visual="passos-pix", pagina="/fichas",
         texto="Seu dinheiro entra e sai pelo PIX no seu CPF.\n\nNo Clube Suprema as fichas são compradas no Fichas 24h e o saque cai na "
               "chave PIX do seu CPF. Sem depender de ninguém para mandar ou receber.\n\n18+ · Jogue com responsabilidade.",
         manchete="Fichas e saque pelo PIX", descricao="No seu CPF, pelo Fichas 24h"),
    dict(id="03-suporte-24h", destaque="24h", titulo="Suporte humano no WhatsApp, a qualquer hora",
         apoio="Depósito, saque, login ou clube: alguém responde", visual="chat", pagina="/",
         texto="Depósito não caiu? Esqueceu a senha? Quer saber onde fica o clube?\n\nNo Clube Suprema o suporte é de gente, no WhatsApp, "
               "24 horas por dia. Você não fica esperando agente sumido.\n\n18+ · Jogue com responsabilidade.",
         manchete="Suporte 24h no WhatsApp", descricao="Gente de verdade responde"),
    dict(id="04-em-2-minutos", destaque="2 min", titulo="Para entrar no clube e sentar na mesa",
         apoio="", visual="passos", pagina="/",
         texto="Do cadastro à mesa em 2 minutos:\n1. Baixe o app oficial Suprema Poker\n2. Entre no Clube Suprema (ID 10001)\n"
               "3. Compre fichas por PIX\n\nO passo a passo está no site, com suporte 24h se travar.\n\n18+ · Jogue com responsabilidade.",
         manchete="Entre no clube em 2 minutos", descricao="App oficial · PIX · suporte 24h"),
    dict(id="05-spin-suprema", destaque="50.000×", titulo="Spin Suprema: o prêmio pode multiplicar até 50.000×",
         apoio="Mesas de 3 ou 6 jogadores, partidas rápidas", visual="phone-mesa", pagina="/spin",
         texto="O Spin Suprema chegou ao app: mesas de 3 ou 6, partidas rápidas e o prêmio sorteado no começo, de 2× até 50.000× o buy-in.\n\n"
               "Jogue no Clube Suprema (ID 10001), com fichas por PIX e suporte 24h.\n\n18+ · Jogue com responsabilidade.",
         manchete="Spin Suprema: até 50.000×", descricao="Mesas de 3 ou 6 no app"),
    dict(id="06-torneios-todo-dia", destaque="TORNEIOS", titulo="Grade nova toda manhã na Liga Suprema",
         apoio="Garantidos, turbo, knockout e satélites o dia todo", visual="phone-abertura", pagina="/",
         texto="Todo dia tem grade nova de torneios na Liga Suprema: garantidos, turbo, knockout e satélites do começo da tarde à madrugada.\n\n"
               "Entre no Clube Suprema (ID 10001) e jogue pelo app oficial.\n\n18+ · Jogue com responsabilidade.",
         manchete="Torneios o dia todo", descricao="Grade nova toda manhã"),
    dict(id="07-poker-24h", destaque="24h", titulo="Poker online direto no celular",
         apoio="Baixe grátis, compre fichas por PIX e jogue no Clube Suprema", visual="phone-abertura", pagina="/",
         texto="Poker online 24h, direto no celular.\n\nBaixe o app Suprema Poker grátis, compre fichas por PIX e jogue no Clube Suprema "
               "(ID 10001), com suporte 24h no WhatsApp.\n\n18+ · Jogue com responsabilidade.",
         manchete="Poker online 24h no celular", descricao="Clube Suprema · ID 10001"),
    dict(id="08-liga-suprema", destaque="LIGA", titulo="Um clube da Liga Suprema: mesas com jogadores de toda a liga",
         apoio="Do grupo SX, com mais de 100 clubes parceiros", visual="phone-mesa", pagina="/",
         texto="Clube pequeno é mesa vazia. No Clube Suprema (ID 10001) você joga nas mesas compartilhadas da Liga Suprema, do grupo SX, "
               "com jogadores de mais de 100 clubes.\n\nFichas por PIX e suporte 24h.\n\n18+ · Jogue com responsabilidade.",
         manchete="Mesas cheias da Liga Suprema", descricao="Grupo SX · 100+ clubes"),
    dict(id="09-primeira-mesa", destaque="DO ZERO", titulo="Nunca jogou? A gente explica até a primeira mesa",
         apoio="Guias de regras, mãos e ações + suporte 24h", visual="passos-iniciante", pagina="/",
         texto="Nunca jogou poker online? Comece pelo básico: no site tem guia de regras, ranking das mãos e as ações da mesa, "
               "e o suporte 24h ajuda até você sentar na primeira mesa.\n\nClube Suprema · ID 10001.\n\n18+ · Jogue com responsabilidade.",
         manchete="Do zero à primeira mesa", descricao="Guias + suporte 24h"),
    dict(id="10-app-oficial", destaque="OFICIAL", titulo="Só app oficial: Google Play e App Store",
         apoio="Conta sua, clube 10001, fichas por PIX", visual="phone-abertura", pagina="/",
         texto="Sem APK estranho e sem atalho: o Suprema Poker se baixa no Google Play e na App Store.\n\nDepois é só entrar no "
               "Clube Suprema (ID 10001) e comprar fichas por PIX. Suporte 24h no WhatsApp.\n\n18+ · Jogue com responsabilidade.",
         manchete="App oficial, clube 10001", descricao="Google Play e App Store"),
]


def font(size, weight=800):
    f = ImageFont.truetype(FONT, size)
    try:
        f.set_variation_by_axes([weight])
    except Exception:  # noqa: BLE001
        pass
    return f


def wrap(d, text, f, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=f) <= max_w or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    return lines + ([cur] if cur else [])


def phone(nome, height):
    """Tela do app recortada, com bordas suavizadas (mesmo recorte do anuncio_og.py)."""
    im = Image.open(os.path.join(ROOT, "public", "img", f"app-{nome}.webp")).convert("RGBA")
    w = int(im.width * height / im.height)
    im = im.resize((w, height), Image.LANCZOS)
    return im


def passos(itens, w, size):
    """Lista numerada em círculos dourados."""
    f, fn = font(size, 700), font(int(size * 0.95), 800)
    lh = int(size * 2.3)
    im = Image.new("RGBA", (w, lh * len(itens)), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = int(size * 0.85)
    for i, t in enumerate(itens):
        cy = i * lh + lh // 2
        ring = luxo.gold_rounded(2 * r, 2 * r, r)
        im.alpha_composite(ring, (0, cy - r))
        d.text((r, cy), str(i + 1), font=fn, fill=luxo.INK, anchor="mm")
        d.text((2 * r + int(size * 0.7), cy), t, font=f, fill=WHITE, anchor="lm")
    return im


def chat(w, size):
    """Duas bolhas de conversa (jogador e suporte)."""
    f = font(size, 600)
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    falas = [("Meu depósito ainda não caiu…", False), ("Já conferi: caiu agora no seu saldo. Boa mesa!", True)]
    blocos, h = [], 0
    for txt, sup in falas:
        lines = wrap(probe, txt, f, int(w * 0.68))
        bw = int(max(probe.textlength(l, font=f) for l in lines) + size * 1.6)
        bh = int(len(lines) * size * 1.35 + size * 1.2)
        blocos.append((lines, sup, bw, bh))
        h += bh + int(size * 0.8)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    y = 0
    for lines, sup, bw, bh in blocos:
        x = w - bw if sup else 0
        cor = (37, 211, 102, 235) if sup else (38, 34, 28, 235)
        d.rounded_rectangle((x, y, x + bw, y + bh), radius=int(size * 0.9), fill=cor)
        for i, l in enumerate(lines):
            d.text((x + size * 0.8, y + size * 0.6 + i * size * 1.35), l, font=f, fill=(8, 30, 16) if sup else WHITE)
        y += bh + int(size * 0.8)
    return im


def visual(a, w, h, size=40):
    v = a["visual"]
    if v.startswith("phone"):
        return phone(v.split("-")[1], h)
    if v == "chat":
        return chat(w, int(size * 0.9))
    itens = {"passos": ["Baixe o app oficial", "Entre no clube 10001", "Fichas por PIX"],
             "passos-pix": ["PIX no Fichas 24h", "Fichas no app, no clube", "Saque no PIX do seu CPF"],
             "passos-iniciante": ["Regras em 1 minuto", "Ranking das mãos", "Suporte até a 1ª mesa"]}[v]
    return passos(itens, w, size)


def rodape(img, y, x=72):
    d = ImageDraw.Draw(img)
    img.alpha_composite(logo.mark_in_box(76, 1.0), (x, y))
    d.text((x + 96, y + 6), "Clube Suprema", font=font(36, 800), fill=WHITE)
    d.text((x + 96, y + 50), "suprema.blog · ID 10001", font=font(26, 500), fill=MUTED)
    pill = luxo.outline_pill("18+", font(26, 800))
    img.alpha_composite(pill, (img.width - x - pill.width, y + 16))


def textos(img, a, y, size_dest, size_tit, size_apoio, max_w, x=72):
    d = ImageDraw.Draw(img)
    fd = font(size_dest, 900)
    while d.textlength(a["destaque"], font=fd) > max_w:
        size_dest -= 6
        fd = font(size_dest, 900)
    luxo.gold_text(img, (x - 4, y), a["destaque"], fd, glow=0.35)
    y += int(size_dest * 1.08)
    ft = font(size_tit, 800)
    for ln in wrap(d, a["titulo"], ft, max_w):
        d.text((x, y), ln, font=ft, fill=WHITE)
        y += int(size_tit * 1.16)
    if a["apoio"]:
        y += int(size_apoio * 0.5)
        fa = font(size_apoio, 500)
        for ln in wrap(d, a["apoio"], fa, max_w):
            d.text((x, y), ln, font=fa, fill=MUTED)
            y += int(size_apoio * 1.4)
    return y


def salvar(img, nome):
    os.makedirs(OUT, exist_ok=True)
    caminho = os.path.join(OUT, nome)
    img.convert("RGB").save(caminho, "JPEG", quality=90, optimize=True, progressive=True)
    return caminho


def gerar(a, seed):
    # Quadrado: textos em cima; visual embaixo à direita (celular) ou centrado (passos/chat); marca no rodapé.
    sq = luxo.luxury_background(1080, 1080, seed=seed)
    y = textos(sq, a, 70, 130, 58, 30, 936)
    fim = 940
    if a["visual"].startswith("phone"):
        ph = visual(a, 0, min(500, fim - y - 10))
        luxo.paste(sq, ph, (1080 - 60 - ph.width, fim - ph.height))
    else:
        v = visual(a, 936, 0, size=46)
        luxo.paste(sq, v, (72, y + max(20, (fim - y - v.height) // 2)), shadow=False)
    rodape(sq, 970)
    salvar(sq, f"{a['id']}-1080x1080.jpg")

    # Vertical: livres os ~250 px de cima e os ~340 px de baixo (interface dos Stories e Reels); o visual fica centrado
    # no espaço entre os textos e a marca, que vai sempre na mesma altura.
    vt = luxo.luxury_background(1080, 1920, seed=seed + 50)
    y = textos(vt, a, 260, 170, 74, 36, 936)
    fim = 1480 - 40
    if a["visual"].startswith("phone"):
        ph = visual(a, 0, min(760, fim - y - 60))
        luxo.paste(vt, ph, ((1080 - ph.width) // 2, y + (fim - y - ph.height) // 2))
    else:
        v = visual(a, 936, 0, size=58)
        luxo.paste(vt, v, (72, y + (fim - y - v.height) // 2), shadow=False)
    rodape(vt, 1480)
    salvar(vt, f"{a['id']}-1080x1920.jpg")


def textos_md():
    linhas = ["# 10 anúncios de cadastro do Clube Suprema", "",
              "Gerado por `tools/imagens/anuncios_clube.py` (01/11/2026). Chamada para ação de todos: **Cadastre-se**.",
              "Cada anúncio leva a versão da página que repete o que a arte mostra; o `utm_content` diz qual anúncio trouxe o cadastro.", ""]
    for a in ANUNCIOS:
        url = f"{SITE}{a['pagina']}?{UTM}{a['id']}"          # /?… na home e /fichas?… sem barra (sem redirecionamento)
        linhas += [f"## {a['id']}", "",
                   f"- Artes: `{a['id']}-1080x1080.jpg` (feed) e `{a['id']}-1080x1920.jpg` (Stories e Reels)",
                   f"- Título: **{a['manchete']}** ({len(a['manchete'])} caracteres)",
                   f"- Descrição: {a['descricao']}",
                   f"- Link: {url}", "", "Texto principal:", "", "```", a["texto"], "```", ""]
    caminho = os.path.join(OUT, "textos.md")
    with open(caminho, "w", encoding="utf-8") as fh:
        fh.write("\n".join(linhas))
    return caminho


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    so = sys.argv[1] if len(sys.argv) > 1 else ""
    for i, a in enumerate(ANUNCIOS):
        if so and not a["id"].startswith(so):
            continue
        gerar(a, seed=11 + i * 7)
        print("ok", a["id"])
    print("ok", os.path.relpath(textos_md(), ROOT))
