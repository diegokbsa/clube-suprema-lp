from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT = Path(r"C:\Users\Administrator\Documents\Agentes-arquivos\blogs-diario\20261111\afiliado\img")
OUT.mkdir(parents=True, exist_ok=True)

NAVY = "#1d3a5c"
BG = "#f2f5f9"
WHITE = "#ffffff"
MINT = "#8ed9c9"
CORAL = "#ff9075"
PALE = "#e6edf5"
INK = "#25374b"
MUTED = "#536578"
LINE = "#9eb0c3"

FONT_REG = r"C:\Windows\Fonts\segoeui.ttf"
FONT_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"

def font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)

def centered(draw, xy, text, fnt, fill):
    draw.text(xy, text, font=fnt, fill=fill, anchor="mm")

def arrow(draw, start, end, color=CORAL, width=8):
    draw.line([start, end], fill=color, width=width)
    x1, y1 = end
    x0, y0 = start
    if abs(x1 - x0) >= abs(y1 - y0):
        sign = 1 if x1 >= x0 else -1
        draw.polygon([(x1, y1), (x1 - sign*20, y1 - 13), (x1 - sign*20, y1 + 13)], fill=color)
    else:
        sign = 1 if y1 >= y0 else -1
        draw.polygon([(x1, y1), (x1 - 13, y1 - sign*20), (x1 + 13, y1 - sign*20)], fill=color)

def header(draw, eyebrow, title):
    draw.rounded_rectangle((38, 30, 1162, 145), radius=28, fill=NAVY)
    draw.text((72, 50), eyebrow.upper(), font=font(20, True), fill=MINT)
    draw.text((72, 82), title, font=font(40, True), fill=WHITE)

def make_compatibility():
    im = Image.new("RGB", (1200, 675), BG)
    d = ImageDraw.Draw(im)
    header(d, "Checklist de pré-compra", "Siga o áudio do celular ao app")

    centers = [(205, 365), (600, 365), (995, 365)]
    for cx, cy in centers:
        d.ellipse((cx-115, cy-115, cx+115, cy+115), fill=WHITE, outline=PALE, width=5)

    d.rounded_rectangle((163, 263, 247, 439), radius=16, fill=NAVY)
    d.rounded_rectangle((171, 278, 239, 419), radius=9, fill="#d9e7f1")
    d.rounded_rectangle((193, 269, 217, 273), radius=2, fill=MINT)
    d.ellipse((200, 425, 210, 435), fill=WHITE)
    d.rounded_rectangle((194, 439, 216, 445), radius=3, fill=CORAL)

    d.rounded_rectangle((520, 325, 563, 403), radius=12, fill=NAVY)
    d.ellipse((534, 337, 549, 352), fill=MINT)
    d.line((529, 399, 555, 399), fill=WHITE, width=3)
    d.rounded_rectangle((620, 339, 679, 389), radius=12, fill="#d9e7f1", outline=NAVY, width=5)
    d.ellipse((640, 354, 652, 366), fill=CORAL)
    d.arc((561, 328, 617, 384), start=275, end=85, fill=CORAL, width=5)
    d.arc((569, 340, 610, 374), start=275, end=85, fill=MINT, width=5)

    d.rounded_rectangle((937, 270, 1053, 445), radius=17, fill=NAVY)
    d.rounded_rectangle((947, 284, 1043, 430), radius=10, fill=WHITE)
    d.rounded_rectangle((958, 298, 1032, 321), radius=7, fill=PALE)
    d.ellipse((964, 304, 978, 318), fill=CORAL)
    d.line((986, 311, 1008, 311), fill=LINE, width=3)
    wave_x = [959, 970, 980, 989, 998, 1007, 1017, 1027]
    wave_h = [14, 29, 19, 41, 25, 34, 16, 24]
    for x, h in zip(wave_x, wave_h):
        d.line((x, 365-h//2, x, 365+h//2), fill=NAVY if x != 989 else CORAL, width=5)
    d.rounded_rectangle((972, 399, 1018, 411), radius=5, fill=MINT)

    arrow(d, (330, 365), (440, 365))
    arrow(d, (760, 365), (870, 365))

    for i, (cx, label, sub) in enumerate([
        (205, "CELULAR", "modelo + entrada"),
        (600, "RECEPTOR", "conexão + kit"),
        (995, "APP", "entrada reconhecida"),
    ], start=1):
        d.ellipse((cx-23, 478, cx+23, 524), fill=CORAL if i == 2 else MINT)
        centered(d, (cx, 501), str(i), font(22, True), NAVY)
        centered(d, (cx, 553), label, font(24, True), NAVY)
        centered(d, (cx, 584), sub, font(19), MUTED)

    d.rounded_rectangle((310, 625, 890, 654), radius=14, fill=PALE)
    centered(d, (600, 639), "O encaixe físico não confirma compatibilidade", font(19, True), INK)
    im.save(OUT / "microfone-de-lapela-sem-fio-para-celular-o-que-conferir-1.png", format="PNG", optimize=True)

def make_homologation():
    im = Image.new("RGB", (1200, 675), BG)
    d = ImageDraw.Draw(im)
    header(d, "Verificação oficial", "Confira o modelo na base correta")

    d.rounded_rectangle((48, 225, 278, 493), radius=24, fill=WHITE, outline=PALE, width=4)
    d.rounded_rectangle((111, 267, 215, 379), radius=18, fill=NAVY)
    d.ellipse((151, 286, 175, 310), fill=MINT)
    d.rounded_rectangle((132, 326, 194, 353), radius=8, fill=WHITE)
    centered(d, (163, 340), "ID", font(19, True), NAVY)
    centered(d, (163, 416), "MODELO DO KIT", font(21, True), NAVY)
    centered(d, (163, 450), "fabricante + modelo", font(17), MUTED)

    d.rounded_rectangle((325, 267, 540, 451), radius=24, fill=WHITE, outline=PALE, width=4)
    d.rounded_rectangle((355, 300, 466, 376), radius=12, fill="#d9e7f1")
    d.text((373, 310), "ANATEL", font=font(17, True), fill=NAVY)
    d.text((373, 340), "número", font=font(16), fill=MUTED)
    d.ellipse((452, 345, 507, 400), outline=CORAL, width=7)
    d.line((495, 391, 521, 418), fill=CORAL, width=9)
    centered(d, (432, 425), "CÓDIGO", font(21, True), NAVY)

    d.rounded_rectangle((624, 221, 844, 321), radius=22, fill=WHITE, outline=PALE, width=4)
    d.rounded_rectangle((649, 240, 706, 300), radius=13, fill="#d9e7f1")
    centered(d, (677, 270), "SCH", font(18, True), NAVY)
    d.text((720, 240), "Mosaico", font=font(20, True), fill=NAVY)
    d.text((720, 273), "certificados antigos", font=font(15), fill=MUTED)

    d.rounded_rectangle((624, 391, 844, 491), radius=22, fill=WHITE, outline=PALE, width=4)
    d.rounded_rectangle((649, 410, 706, 470), radius=13, fill=MINT)
    centered(d, (677, 440), "NOVO", font(15, True), NAVY)
    d.text((720, 410), "Certifica", font=font(20, True), fill=NAVY)
    d.text((720, 443), "certificados recentes", font=font(15), fill=MUTED)

    d.rounded_rectangle((918, 267, 1152, 451), radius=24, fill=NAVY)
    d.ellipse((1000, 286, 1069, 355), fill=MINT)
    d.line([(1017, 321), (1033, 338), (1056, 306)], fill=NAVY, width=8)
    centered(d, (1035, 386), "COMPARE", font(22, True), WHITE)
    centered(d, (1035, 420), "modelo + fabricante", font(17), "#d9e7f1")

    arrow(d, (278, 359), (315, 359), CORAL, 7)
    arrow(d, (540, 359), (585, 359), CORAL, 7)
    d.line([(585, 359), (602, 359), (602, 271), (617, 271)], fill=CORAL, width=7)
    d.polygon([(624,271),(610,258),(610,284)], fill=CORAL)
    d.line([(585, 359), (602, 359), (602, 441), (617, 441)], fill=MINT, width=7)
    d.polygon([(624,441),(610,428),(610,454)], fill=MINT)
    d.line([(844, 271), (879, 271), (879, 359), (909, 359)], fill=CORAL, width=7)
    d.line([(844, 441), (879, 441), (879, 359)], fill=MINT, width=7)
    arrow(d, (879, 359), (910, 359), NAVY, 7)

    d.rounded_rectangle((240, 565, 960, 630), radius=18, fill=PALE)
    centered(d, (600, 597), "Se houver dúvida, consulte as duas bases oficiais", font(21, True), INK)
    im.save(OUT / "microfone-de-lapela-sem-fio-para-celular-o-que-conferir-2.png", format="PNG", optimize=True)

make_compatibility()
make_homologation()
for path in sorted(OUT.glob("microfone-de-lapela-sem-fio-para-celular-o-que-conferir-*.png")):
    with Image.open(path) as im:
        im.verify()
    with Image.open(path) as im:
        print(path.name, im.format, im.mode, im.size)