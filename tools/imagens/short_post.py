"""Vídeo curto em pé (1080x1920, Shorts/Reels) a partir de um roteiro em JSON, no visual do site (preto e dourado).

Cada cena tem o texto grande (trechos entre **asteriscos** em dourado), uma imagem opcional embaixo e a narração da
cena com voz neural pt-BR (edge-tts, a mesma do forge; reserva: voz do Windows). A cena dura o tempo da fala + uma
pausa curta. No topo, a barra de progresso das cenas; no rodapé, "18+ · Jogue com responsabilidade."
O texto fica no terço de cima e no meio: embaixo e à direita o YouTube põe título e botões.

Animado (tools/imagens/motion): palavras entrando uma a uma, horários que rolam como contador, cartões em 3D, feixes de
luz e naipes ao fundo, troca de cena com faixa de luz e um "whoosh" baixinho. O Chrome sem janela fotografa cada quadro
(30 por segundo) e o ffmpeg junta com as falas. Se o Chrome ou o Node falharem, sai o modelo parado (uma tela por cena
com zoom lento), para a automação não ficar sem vídeo. O animado é o padrão; SHORT_ANIMADO=0 força o parado.

Roteiro (marketing/shorts/<id>.json):
  {"id": "...", "tipo": "Tutorial", "titulo": "...", "descricao": "...",
   "cenas": [{"tela": "Texto com **destaque**", "fala": "o que a voz diz", "imagem": "public/img/app-mesa.webp"}, ...]}
"imagem" é opcional (caminho a partir da raiz do projeto). Regras do que pode ir para o YouTube: marketing/videos-curtos.md.

Uso (na raiz do projeto): python tools/imagens/short_post.py marketing/shorts/<id>.json [pasta de saída]
Saída: data/shorts/<id>.mp4 (data/ fica fora do git) e a prévia <id>.jpg. Precisa do ffmpeg no PATH (e, para o
animado, do Node e do Chrome ou Edge).
"""
import json
import math
import os
import pathlib
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
VOZ = "Microsoft Maria Desktop"          # reserva (SAPI do Windows)
VOZ_NEURAL = "pt-BR-AntonioNeural"        # edge-tts; o roteiro pode trocar com "voz" (ex.: pt-BR-FranciscaNeural)
VELOCIDADE = "+8%"
FORGE_PY = os.environ.get("FORGE_PY", r"C:\Users\Administrator\Documents\Codex\2026-10-16\vej\outputs\chile-football-viral-cl\forge\.venv\Scripts\python.exe")
PAUSA = 0.55       # segundos de tela depois da fala
MIN_CENA = 2.2
MOTION = os.path.join(os.path.dirname(os.path.abspath(__file__)), "motion")
ANIMADO = os.environ.get("SHORT_ANIMADO", "1") != "0"
EXIT_PREVIA = 0.45  # a prévia (jpg) sai antes da saída da 1ª cena (0,32 s no cena.html)


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


def corta(d, texto, f, max_w):
    if d.textlength(texto, font=f) <= max_w:
        return texto
    while texto and d.textlength(texto + "…", font=f) > max_w:
        texto = texto[:-1]
    return texto.rstrip() + "…"


def tabela(img, cena):
    """Cena de lista (grade de torneios): até 4 cartões com horário em dourado, nome e uma linha de detalhes."""
    texto_central(img, cena["tela"], 330, size=56, max_linhas=2)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    dl = ImageDraw.Draw(layer)
    y = 450
    for _ in cena["linhas"][:4]:
        dl.rounded_rectangle((80, y, W - 80, y + 214), radius=28, fill=(20, 18, 15, 255), outline=(92, 66, 28, 255), width=2)
        y += 240
    img.alpha_composite(layer)
    d = ImageDraw.Draw(img)
    fh, fn, fi = font(64, 900), font(50, 800), font(30, 600)
    y = 450
    for ln in cena["linhas"][:4]:
        d.text((120, y + 107), ln["hora"], font=fh, fill=GOLD, anchor="lm")
        d.text((360, y + 72), corta(d, ln["nome"], fn, W - 80 - 360 - 30), font=fn, fill=WHITE, anchor="lm")
        d.text((360, y + 146), corta(d, ln.get("info", ""), fi, W - 80 - 360 - 30), font=fi, fill=MUTED, anchor="lm")
        y += 240


def destaque(img, cena):
    """Cena de um torneio só (Short dos principais do dia): horário enorme, nome, selo e os detalhes em linhas."""
    t = cena["destaque"]
    texto_central(img, cena["tela"], 400, size=46, max_linhas=1)
    d = ImageDraw.Draw(img)
    d.text((W // 2, 590), t["hora"], font=font(190, 900), fill=GOLD, anchor="mm")
    texto_central(img, t["nome"], 800, size=96, max_linhas=2)
    y = 930
    if t.get("selo"):
        f = font(34, 800)
        tw = d.textlength(t["selo"].upper(), font=f)
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ImageDraw.Draw(layer).rounded_rectangle((W / 2 - tw / 2 - 30, y - 34, W / 2 + tw / 2 + 30, y + 34), radius=34,
                                               fill=(14, 10, 5, 200), outline=GOLD, width=3)
        img.alpha_composite(layer)
        d = ImageDraw.Draw(img)
        d.text((W // 2, y), t["selo"].upper(), font=f, fill=GOLD, anchor="mm")
        y += 110
    for ln in t.get("info", [])[:5]:
        d.text((W // 2, y), ln, font=font(44, 600), fill=MUTED, anchor="mm")
        y += 72


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
    if cena.get("passo") and not cena.get("destaque"):
        cx, cy, r = W // 2, 290, 52
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=GOLD)
        d.text((cx, cy + 2), str(cena["passo"]), font=font(56, 900), fill=(28, 20, 8), anchor="mm")
    if cena.get("destaque"):
        destaque(img, cena)
    elif cena.get("linhas"):
        tabela(img, cena)
    elif cena.get("imagem"):
        texto_central(img, cena["tela"], 640, size=84, max_linhas=5)
        imagem(img, cena["imagem"], (150, 960, W - 150, 1480))
    else:
        texto_central(img, cena["tela"], 800)
    d = ImageDraw.Draw(img)
    d.text((W // 2, 1540), "18+ · Jogue com responsabilidade.", font=font(30, 600), fill=MUTED, anchor="mm")
    return img.convert("RGB")


def narrar(texto, wav, pasta, voz=None):
    """Fala da cena em WAV. Primeiro a voz neural pt-BR do edge-tts (a mesma do Liora-Cuts/forge, que já tem o pacote);
    se falhar (sem internet, API fora), a voz pt-BR do Windows (SAPI)."""
    mp3 = os.path.join(pasta, os.path.basename(wav) + ".mp3")
    if os.path.exists(FORGE_PY):
        try:
            subprocess.run([FORGE_PY, "-m", "edge_tts", "--voice", voz or VOZ_NEURAL, f"--rate={VELOCIDADE}", "--text", texto,
                            "--write-media", mp3], check=True, capture_output=True, timeout=60)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", mp3, "-ar", "44100", "-ac", "1", wav], check=True)
            with wave.open(wav) as w:
                return w.getnframes() / w.getframerate()
        except (subprocess.SubprocessError, OSError, wave.Error) as err:
            print(f"edge-tts falhou ({err}); usando a voz do Windows")
    return narrar_sapi(texto, wav, pasta)


def narrar_sapi(texto, wav, pasta):
    """Fala da cena com a voz pt-BR do Windows (SAPI). O texto vai por arquivo para não brigar com aspas."""
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


def video_parado(roteiro, falas, pasta, out, jpg):
    segs = []
    for i, (wav, dur) in enumerate(falas):
        png = os.path.join(pasta, f"c{i}.png")
        mp4 = os.path.join(pasta, f"c{i}.mp4")
        tela(roteiro, i).save(png)
        segmento(png, wav, dur, mp4)
        segs.append(mp4)
    lista = os.path.join(pasta, "lista.txt")
    with open(lista, "w", encoding="utf-8") as fh:
        fh.write("".join(f"file '{s.replace(os.sep, '/')}'\n" for s in segs))
    # a voz do SAPI sai baixa: normaliza para o volume de redes (-14 LUFS)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lista,
                    "-c:v", "copy", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
                    "-movflags", "+faststart", out], check=True)
    tela(roteiro, 0).save(jpg, quality=88)  # prévia da 1ª tela


def video_animado(roteiro, falas, pasta, out, jpg):
    """Cenas animadas: o motion/render.mjs fotografa o motion/cena.html quadro a quadro; aqui entram as falas, cada uma
    no começo da sua cena, e um whoosh baixinho em cada troca de cena."""
    cenas, ini = [], 0.0
    for cena, (_, dur) in zip(roteiro["cenas"], falas):
        c = {k: cena[k] for k in ("tela", "passo", "linhas", "destaque") if k in cena}
        if cena.get("imagem"):
            c["imagem"] = pathlib.Path(ROOT, cena["imagem"]).as_uri()
        c.update(ini=round(ini, 4), dur=round(dur, 4))
        cenas.append(c)
        ini += dur
    timeline = {"fps": FPS, "w": W, "h": H, "frames": math.ceil(ini * FPS), "fonte": pathlib.Path(fonte()).as_uri(),
                "tipo": roteiro.get("tipo", "Suprema Poker"), "rodape": "18+ · Jogue com responsabilidade.", "cenas": cenas}
    tl = os.path.join(pasta, "timeline.json")
    with open(tl, "w", encoding="utf-8") as fh:
        json.dump(timeline, fh, ensure_ascii=False)
    mudo = os.path.join(pasta, "animado.mp4")
    subprocess.run(["node", os.path.join(MOTION, "render.mjs"), tl, mudo], check=True, timeout=3600)

    n = len(falas)
    entradas, filtros = [], []
    for i, (wav, dur) in enumerate(falas):
        entradas += ["-i", wav]
        filtros.append(f"[{i + 1}:a]aresample=44100,aformat=channel_layouts=mono,apad,atrim=0:{dur:.4f},asetpts=N/SR/TB[f{i}]")
    filtros.append("".join(f"[f{i}]" for i in range(n)) + f"concat=n={n}:v=0:a=1[voz]")
    trocas = [c["ini"] for c in cenas[1:]]
    for k, t in enumerate(trocas):
        ms = max(0, int((t - 0.3) * 1000))
        filtros.append(f"anoisesrc=d=0.65:c=pink:r=44100:a=0.5:seed={k + 1},highpass=f=450,lowpass=f=4200,"
                       f"afade=t=in:d=0.3,afade=t=out:st=0.3:d=0.35,volume=0.6,adelay={ms}:all=1[w{k}]")
    filtros.append("[voz]" + "".join(f"[w{k}]" for k in range(len(trocas))) +
                   f"amix=inputs={len(trocas) + 1}:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=11[a]")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", mudo, *entradas, "-filter_complex", ";".join(filtros),
                    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
                    "-shortest", "-movflags", "+faststart", out], check=True)
    # prévia: a 1ª cena já montada
    t = max(0.0, min(1.8, falas[0][1] - EXIT_PREVIA))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", out, "-frames:v", "1", "-q:v", "3", jpg],
                   check=True)


def main(spec, saida=None):
    with open(spec, encoding="utf-8") as fh:
        roteiro = json.load(fh)
    rid = roteiro["id"]
    saida = saida or os.path.join(ROOT, "data", "shorts")
    out = os.path.join(saida, f"{rid}.mp4")
    jpg = os.path.join(saida, f"{rid}.jpg")
    os.makedirs(saida, exist_ok=True)
    pasta = tempfile.mkdtemp(prefix="short-")
    try:
        falas = []
        for i, cena in enumerate(roteiro["cenas"]):
            wav = os.path.join(pasta, f"c{i}.wav")
            falas.append((wav, max(MIN_CENA, narrar(cena["fala"], wav, pasta, roteiro.get("voz")) + PAUSA)))
        modo = "animado" if ANIMADO else "parado"
        if ANIMADO:
            try:
                video_animado(roteiro, falas, pasta, out, jpg)
            except (subprocess.SubprocessError, OSError, ValueError) as err:
                print(f"animação falhou ({err}); usando as telas paradas")
                modo = "parado"
        if modo == "parado":
            video_parado(roteiro, falas, pasta, out, jpg)
    finally:
        shutil.rmtree(pasta, ignore_errors=True)
    total = sum(d for _, d in falas)
    if total > 59:
        print(f"atenção: {total:.0f} s, passa de 59 s (Shorts antigos aceitam até 60 s)")
    print("ok", modo, os.path.relpath(out, ROOT), f"{total:.1f} s", os.path.getsize(out) // 1024, "KB")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
