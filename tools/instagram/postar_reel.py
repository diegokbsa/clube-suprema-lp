"""Publica um vídeo curto como Reels no Instagram do clube (@supremaclub) pelo celular POCO F5, com o app oficial.

Mesma base do tools/youtube/postar_short.py (adb pelo Wi-Fi + uiautomator2 do forge). Rode com o Python do forge:
    <forge>\\.venv\\Scripts\\python.exe tools\\instagram\\postar_reel.py <roteiro.json> [--seco]
O vídeo é o mesmo do Short (data/shorts/<id>.mp4); a legenda sai do roteiro (titulo + descricao) e ganha o que o
Instagram permite e o YouTube não: o Clube Suprema com o ID e "link na bio" (marketing/videos-curtos.md). Um campo
"instagram" no roteiro substitui a legenda inteira.

Fluxo (Instagram 453, pt-BR, conferido em 30/10/2026): o Instagram tem acesso só às fotos e vídeos escolhidos
(acesso limitado do Android). Por isso: vídeo para /sdcard/Movies/ClubeSuprema → Perfil → Criar novo → Reel →
Gerenciar → Selecionar mais fotos → Permitir acesso limitado → no seletor do Android, o vídeo pela duração → Concluir →
o vídeo na galeria do Reels → Avançar → legenda → Avançar → (1ª vez: "Sobre o Reels" → Compartilhar).
O "compartilhar" direto (intent SEND para o Reels) não abre o editor.

Registro em data/shorts/instagram.json (o mesmo id não sai duas vezes); prints em data/shorts/telas/.
"""
import datetime as dt
import json
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "youtube"))
from postar_short import ROOT, TELAS, Falha, Celular, adb, sh, duracao, forge_ocupado  # noqa: E402

IG = "com.instagram.android"
REMOTE = "/sdcard/Movies/ClubeSuprema"
REGISTRO = ROOT / "data" / "shorts" / "instagram.json"
CLUBE = "Jogue no Clube Suprema · ID 10001 · link na bio 👆"
HASHTAGS = {
    "padrao": "#poker #pokeronline #supremapoker #pokerbrasil #texasholdem",
    "torneio": "#poker #pokeronline #supremapoker #pokerbrasil #torneiodepoker",
}


def legenda(roteiro):
    if roteiro.get("instagram"):
        return roteiro["instagram"]
    titulo = re.sub(r"\s*#shorts\b", "", roteiro["titulo"], flags=re.I).strip()
    corpo = roteiro.get("descricao", "").split("\n\n")[0].strip()
    tags = HASHTAGS["torneio" if re.search(r"grade|principais|torneio", roteiro["id"] + roteiro.get("tipo", ""), re.I) else "padrao"]
    return f"{titulo}\n\n{corpo}\n\n{CLUBE}\n18+ · Jogue com responsabilidade.\n\n{tags}"


def rotulos_de(seg):
    """Durações como o seletor do Android ("00:38") e a galeria do Reels ("0:38") mostram, truncando e arredondando."""
    marcas = {f"{int(seg) // 60:02d}:{int(seg) % 60:02d}", f"{int(round(seg)) // 60:02d}:{int(round(seg)) % 60:02d}"}
    return marcas, {f"{int(m[:2])}:{m[3:]}" for m in marcas}


def video_unico(video, rid):
    """O Instagram só mostra a duração na galeria, então dois vídeos de 0:38 se confundem (31/10: o Reel do ranking
    saiu com o vídeo das ações). Se outro vídeo de data/shorts tiver a mesma duração, faz uma cópia com o último quadro
    parado por mais 1, 2... segundos até a duração ficar única, e é essa cópia que vai para o celular."""
    ocupadas = set()
    for outro in (ROOT / "data" / "shorts").glob("*.mp4"):
        if outro.stem != rid:
            ocupadas |= rotulos_de(duracao(outro))[1]
    seg = duracao(video)
    extra = next((n for n in range(6) if not rotulos_de(seg + n)[1] & ocupadas), None)
    if extra is None:
        raise Falha(f"não achei uma duração livre para {rid} ({seg:.1f} s)")
    if extra == 0:
        return video
    copia = ROOT / "data" / "shorts" / "instagram" / f"{rid}-ig.mp4"
    copia.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(video),
                    "-vf", f"tpad=stop_mode=clone:stop_duration={extra}", "-af", f"apad=pad_dur={extra}",
                    "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
                    "-movflags", "+faststart", str(copia)], check=True, timeout=900)
    print(f"duração de {seg:.1f} s já usada por outro vídeo: vai uma cópia com {extra} s a mais")
    return copia


def tocar_xy(c, x, y, espera=2.0):
    sh(f"input tap {x} {y}", check=False)
    time.sleep(espera)


def publicar(spec, seco=False):
    roteiro = json.loads(Path(spec).read_text(encoding="utf-8"))
    rid = roteiro["id"]
    video = ROOT / "data" / "shorts" / f"{rid}.mp4"
    if not video.exists():
        raise Falha(f"vídeo não existe: {video} (rode antes tools/imagens/short_post.py)")
    registro = json.loads(REGISTRO.read_text(encoding="utf-8")) if REGISTRO.exists() else {}
    if rid in registro and not seco:
        print(f"{rid} já foi publicado no Instagram em {registro[rid]['quando']}")
        return registro[rid]
    texto = legenda(roteiro)

    for _ in range(60):
        if not forge_ocupado():
            break
        time.sleep(10)
    c = Celular(rid + "-ig")
    sh("input keyevent KEYCODE_WAKEUP", check=False)
    time.sleep(1)
    if "isKeyguardShowing=true" in sh("dumpsys window", check=False):
        sh("input swipe 540 1800 540 600 250", check=False)
        time.sleep(1.5)
        if "isKeyguardShowing=true" in sh("dumpsys window", check=False):
            raise Falha("o celular está bloqueado com senha")

    video = video_unico(video, rid)
    remoto = f"{REMOTE}/{video.name}"
    sh(f"mkdir -p {REMOTE}", check=False)
    if str(video.stat().st_size) not in sh(f'stat -c %s "{remoto}" 2>/dev/null', check=False):
        adb("push", str(video), remoto, timeout=600)
    sh(f'touch "{remoto}"; am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://{remoto}"', check=False)
    time.sleep(3)
    marcas, rotulos = rotulos_de(duracao(video))                    # a galeria do Instagram mostra "0:47"

    c.d.app_start(IG, stop=True)
    time.sleep(7)
    for _ in range(3):                      # avisos da abertura (notificações, novidades): recusa e segue
        if not c.tocar(["Não permitir", "Agora não"], timeout=3, opcional=True):
            break
    c.tocar(["Perfil"], timeout=20, depois=3)
    c.tocar(["Criar novo"], timeout=15, depois=3)
    c.tocar(["Criar novo reel"], timeout=15, depois=5)
    c.tocar(["Iniciar novo vídeo"], timeout=4, depois=4, opcional=True)   # rascunho anterior (teste seco): fica salvo

    # acesso limitado: inclui o vídeo novo pela duração no seletor do Android (se ele ainda não estiver liberado)
    def na_galeria():
        achados = [(int(m.group(4)) - 150, int(m.group(5)) - 280)       # centro aproximado da miniatura
                   for m in re.finditer(r'text="(\d+:\d\d)"[^>]*?resource-id="[^"]*gallery_grid_item_label"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',
                                        c.d.dump_hierarchy()) if m.group(1) in rotulos]
        if len(achados) > 1:                # nunca escolhe no chute: foi assim que o ranking saiu com o vídeo errado
            c.tela("erro")
            raise Falha(f"{len(achados)} vídeos de {sorted(rotulos)} na galeria do Reels; não dá para saber qual é")
        return achados[0] if achados else None
    alvo = na_galeria()
    if alvo is None:
        b = c.d(resourceIdMatches=".*btn_manage")
        if not b.wait(timeout=8):
            c.tela("erro")
            raise Falha("não achei o Gerenciar da galeria (o Instagram passou a ter acesso total?)")
        b.click()
        time.sleep(4)
        c.tocar(["Selecionar mais fotos"], timeout=10, depois=4)
        c.tocar(["Permitir acesso limitado"], timeout=10, depois=5, opcional=True)   # às vezes o seletor já abre direto
        escolha = None
        for m in re.finditer(r'content-desc="(Vídeo (?!selecionado)[^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', c.d.dump_hierarchy()):
            if any(mk in m.group(1) for mk in marcas):
                x0, y0, x1, y1 = map(int, m.groups()[1:])
                escolha = escolha or ((x0 + x1) // 2, (y0 + y1) // 2, m.group(1))
        if escolha is None:
            c.tela("erro")
            raise Falha(f"o vídeo de {sorted(marcas)} não apareceu no seletor do Android")
        print("liberado para o Instagram:", escolha[2])
        c.d.click(escolha[0], escolha[1])
        time.sleep(1.5)
        c.tocar(["Concluir"], timeout=10, depois=5)
        alvo = na_galeria()
    if alvo is None:
        c.tela("erro")
        raise Falha(f"o vídeo de {sorted(rotulos)} não apareceu na galeria do Reels")
    c.d.click(*alvo)
    time.sleep(6)

    c.tocar(["Avançar"], timeout=30, depois=6)                       # editor → tela da legenda
    if c.d(text="Continuar").exists:                                  # aviso de downloads (1ª vez)
        c.d(text="Continuar").click()
        time.sleep(1.5)
    box = c.d(resourceIdMatches=".*caption_input_text_view")
    if not box.wait(timeout=15):
        c.tela("erro")
        raise Falha("não achei o campo da legenda")
    box.click()
    time.sleep(1)
    box.set_text(texto)
    time.sleep(1.5)
    if texto.splitlines()[0][:25] not in (box.get_text() or ""):
        c.tela("erro")
        raise Falha("a legenda não entrou no campo")
    if c.d(text="OK").exists:
        c.d(text="OK").click()
        time.sleep(1.5)
    c.fechar_teclado()
    c.tela("antes-de-publicar")
    if seco:
        print("teste seco: parou antes de publicar")
        c.d.app_stop(IG)
        return {"seco": True}

    b = c.d(resourceIdMatches=".*share_button")
    if not b.exists:
        c.tela("erro")
        raise Falha("não achei o botão de publicar")
    x0, y0, x1, y1 = (b.info["bounds"][k] for k in ("left", "top", "right", "bottom"))
    tocar_xy(c, (x0 + x1) // 2, (y0 + y1) // 2, 6)                # o clique do uiautomator2 não pega nesse botão
    if c.d(text="Compartilhar").exists and c.d(textContains="Sobre o Reels").exists:   # aviso da 1ª vez
        c.d(text="Compartilhar").click()
        time.sleep(6)
    # o feed de Reels também tem um "share_button": quem diz se saiu é o campo da legenda ter sumido
    if c.d(resourceIdMatches=".*caption_input_text_view").exists:
        c.tela("erro")
        raise Falha("continua na tela da legenda depois de publicar")
    time.sleep(20)                                                   # o envio segue em segundo plano
    c.tela("depois-de-publicar")
    registro[rid] = {"quando": dt.datetime.now().isoformat(timespec="seconds"), "legenda": texto.splitlines()[0]}
    REGISTRO.write_text(json.dumps(registro, ensure_ascii=False, indent=2), encoding="utf-8")
    print("publicado no Instagram:", texto.splitlines()[0])
    return registro[rid]


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        publicar(sys.argv[1], seco="--seco" in sys.argv)
    except Falha as e:
        print(f"FALHOU: {e}")
        sys.exit(1)
