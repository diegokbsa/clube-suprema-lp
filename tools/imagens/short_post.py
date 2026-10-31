"""Vídeo curto em pé (1080x1920, Shorts/Reels) a partir de um roteiro em JSON, no visual do site (preto e dourado).

Cada cena vira uma tela com o texto grande (trechos entre **asteriscos** em dourado), uma imagem opcional embaixo
e a narração da cena na voz pt-BR do Windows (Microsoft Maria). A tela fica o tempo da fala + uma pausa curta,
com um zoom lento. No topo, a barra de progresso das cenas; no rodapé, "18+ · Jogue com responsabilidade."
O texto fica no terço de cima e no meio: embaixo e à direita o YouTube põe título e botões.

Roteiro (marketing/shorts/<id>.json):
  {"id": "...", "tipo": "Tutorial", "titulo": "...", "descricao": "...",
   "cenas": [{"tela": "Texto com **destaque**", "fala": "o que a voz diz", "imagem": "public/img/app-mesa.webp"}, ...]}
"imagem" é opcional (caminho a partir da raiz do projeto). Regras do que pode ir para o YouTube: marketing/videos-curtos.md.

Uso (na raiz do projeto): python tools/imagens/short_post.py marketing/shorts/<id>.json
Saída: data/shorts/<id>.mp4 (data/ fica fora do git). Precisa do ffmpeg no PATH.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import wave
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import luxo  # noqa: E402

W, H, FPS = 1080, 1920, 30
GOLD = (239, 161, 68)
WHITE = (255, 255, 255)
MUTED = (185, 187, 190)
DIM = (70, 70, 74)
FONT_URL = "https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf"
FONT = os.path.join(tempfile.gettempdir(), "fonts", "Montserrat.ttf")
VOZ = "Microsoft Maria Desktop"
PAUSA = 0.55       # segundos de tela depois da fala
MIN_CENA = 2.2


def fonte():
    """A Montserrat variável fica em %TMP%/fonts (como nos outros geradores); baixa do GitHub se sumir."""
    if not os.path.exists(FONT):
        os.makedirs(os.path.dirname(FONT), exist_ok=True)
        urllib.request.urlretrieve(FONT_URL, FONT)
    return FONT


def font(size, weight=800):
    f = ImageFont.truetype(fonte(), size)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f


def palavras(texto):
    """[(palavra, dourada?, colada?)] a partir do texto com **destaques**. "Colada" é a pontuação logo depois de um
    destaque ("**Poker**:"), que fica grudada na palavra anterior, sem espaço."""
    out, gold = [], False
    for parte in re.split(r"(\*\*)", texto):
        if parte == "**":
            gold = not gold
            continue
        ws = parte.split()
        out += [(w, gold, i == 0 and bool(out) and not parte[:1].isspace() and bool(re.match(r"[:;,.!?…)]", w)))
                for i, w in enumerate(ws)]
    return out


def junta(ws):
    return "".join(("" if i == 0 or cola else " ") + w for i, (w, _, cola) in enumerate(ws))


def linhas(d, ws, f, max_w):
    res, cur = [], []
    for w in ws:
        if cur and not w[2] and d.textlength(junta(cur + [w]), font=f) > max_w:
            res.append(cur)
            cur = [w]
        else:
            cur.append(w)
    if cur:
        res.append(cur)
    return res


def texto_central(img, texto, y_meio, max_w=920, size=92, max_linhas=6):
    d = ImageDraw.Draw(img)
    ws = palavras(texto)
    f = font(size)
    ls = linhas(d, ws, f, max_w)
    while len(ls) > max_linhas and size > 56:
        size -= 4
        f = font(size)
        ls = linhas(d, ws, f, max_w)
    alt = int(size * 1.18)
    y = y_meio - alt * len(ls) // 2
    esp = d.textlength(" ", font=f)
    for ln in ls:
        x = (W - d.textlength(junta(ln), font=f)) / 2
        for k, (w, gold, cola) in enumerate(ln):
            if k and not cola:
                x += esp
            d.text((x, y), w, font=f, fill=GOLD if gold else WHITE)
            x += d.textlength(w, font=f)
        y += alt


def imagem(img, caminho, box):
    """Imagem do app (ou do post) com cantos arredondados e borda suavizada, centrada na caixa."""
    x0, y0, x1, y1 = box
    im = Image.open(os.path.join(ROOT, caminho)).convert("RGBA")
    esc = min((x1 - x0) / im.width, (y1 - y0) / im.height)
    im = im.resize((int(im.width * esc), int(im.height * esc)), Image.LANCZOS)
    mask = Image.new("L", im.size, 0)
    f = 10
    ImageDraw.Draw(mask).rounded_rectangle((f, f, im.width - f, im.height - f), radius=36, fill=255)
    im.putalpha(Image.composite(im.split()[3], Image.new("L", im.size, 0), mask.filter(ImageFilter.GaussianBlur(f))))
    luxo.paste(img, im, (x0 + (x1 - x0 - im.width) // 2, y0 + (y1 - y0 - im.height) // 2))


def tela(roteiro, i):
    cena = roteiro["cenas"][i]
    n = len(roteiro["cenas"])
    img = luxo.black_background(W, H)
    d = ImageDraw.Draw(img)
    # barra de progresso das cenas (como nos stories)
    gap, x0, x1 = 10, 70, W - 70
    seg = (x1 - x0 - gap * (n - 1)) / n
    for k in range(n):
        a = x0 + k * (seg + gap)
        d.rounded_rectangle((a, 96, a + seg, 104), radius=4, fill=GOLD if k <= i else DIM)
    luxo.spaced(d, (W // 2, 170), roteiro.get("tipo", "Suprema Poker").upper(), font(30, 700), GOLD, spacing=4, anchor="mm")
    if cena.get("passo"):
        cx, cy, r = W // 2, 290, 52
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=GOLD)
        d.text((cx, cy + 2), str(cena["passo"]), font=font(56, 900), fill=(28, 20, 8), anchor="mm")
    if cena.get("imagem"):
        texto_central(img, cena["tela"], 640, size=84, max_linhas=5)
        imagem(img, cena["imagem"], (150, 960, W - 150, 1480))
    else:
        texto_central(img, cena["tela"], 800)
    d = ImageDraw.Draw(img)
    d.text((W // 2, 1540), "18+ · Jogue com responsabilidade.", font=font(30, 600), fill=MUTED, anchor="mm")
    return img.convert("RGB")


def narrar(texto, wav, pasta):
    """Fala da cena em WAV com a voz pt-BR do Windows (SAPI). O texto vai por arquivo para não brigar com aspas."""
    txt = os.path.join(pasta, os.path.basename(wav) + ".txt")
    ps1 = os.path.join(pasta, "voz.ps1")
    with open(txt, "w", encoding="utf-8") as fh:
        fh.write(texto)
    with open(ps1, "w", encoding="utf-8-sig") as fh:
        fh.write(
            "param($txt, $out)\n"
            "Add-Type -AssemblyName System.Speech\n"
            "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer\n"
            f"$s.SelectVoice('{VOZ}')\n"
            "$s.Rate = 1\n"
            "$s.SetOutputToWaveFile($out)\n"
            "$s.Speak((Get-Content -Raw -Encoding UTF8 $txt))\n"
            "$s.Dispose()\n"
        )
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, txt, wav], check=True, capture_output=True)
    with wave.open(wav) as w:
        return w.getnframes() / w.getframerate()


def segmento(png, wav, dur, mp4):
    frames = int(round(dur * FPS))
    # zoom de 0 a ~4% ao longo da cena; a imagem é ampliada antes para o zoompan não tremer
    vf = (f"scale={W * 2}:{H * 2},zoompan=z='1+0.04*on/{frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
          f":d={frames}:s={W}x{H}:fps={FPS},format=yuv420p")
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", png, "-i", wav,
        "-vf", vf, "-af", "apad", "-t", f"{dur:.3f}",
        "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-r", str(FPS),
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2", mp4,
    ], check=True)


def main(spec):
    with open(spec, encoding="utf-8") as fh:
        roteiro = json.load(fh)
    rid = roteiro["id"]
    out = os.path.join(ROOT, "data", "shorts", f"{rid}.mp4")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    pasta = tempfile.mkdtemp(prefix="short-")
    try:
        segs, total = [], 0.0
        for i, cena in enumerate(roteiro["cenas"]):
            png = os.path.join(pasta, f"c{i}.png")
            wav = os.path.join(pasta, f"c{i}.wav")
            mp4 = os.path.join(pasta, f"c{i}.mp4")
            tela(roteiro, i).save(png)
            dur = max(MIN_CENA, narrar(cena["fala"], wav, pasta) + PAUSA)
            segmento(png, wav, dur, mp4)
            segs.append(mp4)
            total += dur
        lista = os.path.join(pasta, "lista.txt")
        with open(lista, "w", encoding="utf-8") as fh:
            fh.write("".join(f"file '{s.replace(os.sep, '/')}'\n" for s in segs))
        # a voz do SAPI sai baixa: normaliza para o volume de redes (-14 LUFS)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lista,
                        "-c:v", "copy", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
                        "-movflags", "+faststart", out], check=True)
        tela(roteiro, 0).save(os.path.join(ROOT, "data", "shorts", f"{rid}.jpg"), quality=88)  # prévia da 1ª tela
    finally:
        shutil.rmtree(pasta, ignore_errors=True)
    if total > 59:
        print(f"atenção: {total:.0f} s, passa de 59 s (Shorts antigos aceitam até 60 s)")
    print("ok", os.path.relpath(out, ROOT), f"{total:.1f} s", os.path.getsize(out) // 1024, "KB")


if __name__ == "__main__":
    main(sys.argv[1])
