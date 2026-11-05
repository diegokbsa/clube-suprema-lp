"""Publica um Short no canal do YouTube (Suprema Poker Live) pelo celular POCO F5, com o app oficial do YouTube.

Usa a mesma base do Liora-Cuts (projeto forge): adb pelo Wi-Fi + uiautomator2 no celular. Rode com o Python do forge,
que já tem o uiautomator2:
    <forge>\\.venv\\Scripts\\python.exe tools\\youtube\\postar_short.py marketing\\shorts\\<id>.json [--seco]
--seco faz tudo até a tela final e para antes de "Enviar Shorts" (descarta o rascunho).

Fluxo (YouTube 21.41, pt-BR, conferido em 30/10/2026):
  vídeo para /sdcard/Movies/ClubeSuprema → YouTube → Criar → Vídeo → "Selecionar na galeria" (seletor do Android:
  o YouTube não precisa de acesso às fotos, e a câmera fica recusada) → o vídeo mais novo, conferido pela duração →
  Concluir → Avançar → título → Mostrar mais → público "Não é conteúdo para crianças" → descrição → Enviar Shorts.
O "compartilhar" direto (intent SEND) não serve: o YouTube fecha com erro de permissão do arquivo.
Várias linhas da tela de detalhes não têm texto acessível; elas são achadas pela ordem (Visibilidade, Público, Descrição).

Prints de cada etapa em data/shorts/telas/ e registro em data/shorts/publicados.json (o mesmo id não sai duas vezes).
O forge posta TikTok pelo mesmo celular: se houver tarefa dele rodando, espera até 10 min.
"""
import datetime as dt
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import uiautomator2 as u2

ROOT = Path(__file__).resolve().parents[2]
ADB = os.environ.get("FORGE_ADB", r"C:\LDPlayer\LDPlayer9\adb.exe")
WIFI = "192.168.16.11:5555"   # POCO F5 pelo Wi-Fi (o forge chama de "POCO F5")
MODELO = "23049PCD8G"         # POCO F5, para achá-lo pelo cabo USB quando o Wi-Fi do celular está desligado


def achar_celular():
    """Serial do POCO F5: YT_SERIAL, se definido; senão o Wi-Fi; senão o aparelho desse modelo ligado no USB."""
    if os.environ.get("YT_SERIAL"):
        return os.environ["YT_SERIAL"]

    def prontos():
        out = subprocess.run([ADB, "devices", "-l"], capture_output=True, text=True, timeout=20).stdout
        return [ln.split() for ln in out.splitlines() if len(ln.split()) > 1 and ln.split()[1] == "device"]

    try:
        devs = prontos()
        if not any(d[0] == WIFI for d in devs):
            try:
                subprocess.run([ADB, "connect", WIFI], capture_output=True, timeout=25)
            except subprocess.TimeoutExpired:  # Wi-Fi do celular desligado: o connect fica esperando
                pass
            devs = prontos()
        if any(d[0] == WIFI for d in devs):
            return WIFI
        usb = [d[0] for d in devs if f"model:{MODELO}" in d]
        return usb[0] if usb else WIFI
    except Exception:  # noqa: BLE001
        return WIFI


SERIAL = achar_celular()
FORGE = Path(os.environ.get("FORGE_DIR", r"C:\Users\Administrator\Documents\Codex\2026-10-16\vej\outputs\chile-football-viral-cl\forge"))
YT = "com.google.android.youtube"
REMOTE = "/sdcard/Movies/ClubeSuprema"
TELAS = ROOT / "data" / "shorts" / "telas"
REGISTRO = ROOT / "data" / "shorts" / "publicados.json"


class Falha(RuntimeError):
    pass


def adb(*args, timeout=120, check=True):
    r = subprocess.run([ADB, "-s", SERIAL, *map(str, args)], capture_output=True, text=True, timeout=timeout,
                       encoding="utf-8", errors="replace")
    if check and r.returncode:
        raise Falha((r.stderr or r.stdout).strip()[:300])
    return r.stdout


def sh(cmd, **kw):
    return adb("shell", cmd, **kw)


def duracao(video):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)],
                         capture_output=True, text=True).stdout
    return float(out.strip())


def forge_ocupado():
    """Tarefa do forge rodando neste celular agora (ele posta TikTok pelo mesmo aparelho)."""
    try:
        t = json.loads((FORGE / "auto" / "phone_tasks.json").read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return False
    ts = t if isinstance(t, list) else t.get("tasks", [])
    return any(x.get("serial") == SERIAL and x.get("status") == "running" for x in ts)


class Celular:
    def __init__(self, rid):
        self.rid = rid
        self.d = u2.connect(SERIAL)
        self.prints = []

    def tela(self, nome):
        TELAS.mkdir(parents=True, exist_ok=True)
        f = TELAS / f"{dt.datetime.now():%Y%m%d-%H%M%S}-{self.rid[:40]}-{nome}.png"
        try:
            self.d.screenshot(str(f))
            self.prints.append(f.name)
        except Exception:  # noqa: BLE001
            pass

    def achar(self, textos, timeout=20, contem=False):
        fim = time.time() + timeout
        while time.time() < fim:
            for t in textos:
                for sel in ([dict(textContains=t), dict(descriptionContains=t)] if contem else [dict(text=t), dict(description=t)]):
                    el = self.d(**sel)
                    if el.exists:
                        return el
            time.sleep(1)
        return None

    def tocar(self, textos, timeout=20, contem=False, depois=2.5, opcional=False):
        el = self.achar(textos, timeout, contem)
        if el is None:
            if opcional:
                return False
            self.tela("erro")
            raise Falha(f"não achei na tela: {', '.join(textos)}")
        el.click()
        time.sleep(depois)
        return True

    def linhas(self, y0, y1):
        """Linhas clicáveis de largura total entre y0 e y1 (os itens sem texto da tela de detalhes), de cima para baixo."""
        xml = self.d.dump_hierarchy()
        res = []
        for m in re.finditer(r'<node [^>]*?clickable="true"[^>]*?bounds="\[0,(\d+)\]\[1080,(\d+)\]"', xml):
            a, b = int(m.group(1)), int(m.group(2))
            if y0 <= a and b <= y1 and 100 < b - a < 260:
                res.append((a, b))
        return sorted(set(res))

    def escrever(self, texto):
        box = self.d(className="android.widget.EditText")
        if not box.wait(timeout=10):
            self.tela("erro")
            raise Falha("não achei o campo de texto")
        box.set_text(texto)
        time.sleep(1.2)
        got = box.get_text() or ""
        if texto.splitlines()[0][:30] not in got:          # set_text não pegou: digita pelo teclado do uiautomator2
            box.click()
            time.sleep(0.8)
            box.clear_text()
            self.d.send_keys(texto)
            time.sleep(1.2)
            got = box.get_text() or ""
            if texto.splitlines()[0][:30] not in got:
                self.tela("erro")
                raise Falha(f"o texto não entrou no campo (ficou {got[:60]!r})")

    def fechar_teclado(self):
        if "mInputShown=true" in sh("dumpsys input_method", check=False):
            self.d.press("back")
            time.sleep(1)


def publicar(spec, seco=False):
    roteiro = json.loads(Path(spec).read_text(encoding="utf-8"))
    rid = roteiro["id"]
    video = ROOT / "data" / "shorts" / f"{rid}.mp4"
    if not video.exists():
        raise Falha(f"vídeo não existe: {video} (rode antes tools/imagens/short_post.py)")
    registro = json.loads(REGISTRO.read_text(encoding="utf-8")) if REGISTRO.exists() else {}
    if rid in registro and not seco:
        print(f"{rid} já foi publicado em {registro[rid]['quando']}")
        return registro[rid]
    titulo = roteiro["titulo"][:100]
    descricao = roteiro.get("descricao", "")[:4900]

    if SERIAL not in adb("devices", check=False) or "\tdevice" not in subprocess.run(
            [ADB, "devices"], capture_output=True, text=True).stdout:
        subprocess.run([ADB, "connect", SERIAL], capture_output=True, timeout=20)
    for _ in range(60):                       # até 10 min
        if not forge_ocupado():
            break
        time.sleep(10)

    c = Celular(rid)
    sh("input keyevent KEYCODE_WAKEUP", check=False)
    time.sleep(1)
    if "isKeyguardShowing=true" in sh("dumpsys window", check=False):
        sh("input swipe 540 1800 540 600 250", check=False)
        time.sleep(1.5)
        if "isKeyguardShowing=true" in sh("dumpsys window", check=False):
            raise Falha("o celular está bloqueado com senha")

    # vídeo na galeria, como o mais novo (o seletor do Android mostra o mais recente primeiro)
    remoto = f"{REMOTE}/{rid}.mp4"
    sh(f'mkdir -p {REMOTE}; find {REMOTE} -type f -name "*.mp4" -mtime +2 -delete', check=False)
    adb("push", str(video), remoto, timeout=600)
    sh(f'touch "{remoto}"; am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://{remoto}"', check=False)
    caminho = remoto.replace("/sdcard/", "/storage/emulated/0/")
    for _ in range(20):
        if "_id=" in sh(f"content query --uri content://media/external/video/media --projection _id --where \"_data='{caminho}'\"", check=False):
            break
        time.sleep(1.5)
    else:
        raise Falha("o celular não pôs o vídeo na galeria")
    seg = duracao(video)
    marcas = {f"{int(seg) // 60:02d}:{int(seg) % 60:02d}", f"{int(round(seg)) // 60:02d}:{int(round(seg)) % 60:02d}"}

    c.d.app_start(YT, stop=True)
    time.sleep(7)
    c.tocar(["Criar"], timeout=25)
    c.tocar(["Não permitir"], timeout=4, opcional=True)          # câmera: não precisa
    c.tocar(["Vídeo"], timeout=15)
    c.tocar(["Não permitir"], timeout=4, opcional=True)          # fotos: o seletor do Android dispensa a permissão
    c.tocar(["Selecionar na galeria"], timeout=15, depois=4)

    # seletor do Android: o primeiro vídeo com a duração certa
    alvo = None
    fim = time.time() + 20
    while alvo is None and time.time() < fim:
        itens = []
        for m in re.finditer(r'content-desc="(Vídeo gravado em [^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', c.d.dump_hierarchy()):
            desc, x0, y0, x1, y1 = m.group(1), *map(int, m.groups()[1:])
            if any(f"com {mk} de" in desc for mk in marcas):
                itens.append((y0, x0, (x0 + x1) // 2, (y0 + y1) // 2, desc))
        if itens:
            alvo = sorted(itens)[0]
        else:
            time.sleep(1.5)
    if alvo is None:
        c.tela("erro")
        raise Falha(f"o vídeo de {sorted(marcas)} não apareceu no seletor da galeria")
    print("vídeo escolhido:", alvo[4])
    c.d.click(alvo[2], alvo[3])
    time.sleep(1.5)
    c.tocar(["Concluir"], timeout=10, depois=6)
    c.tocar(["Avançar"], timeout=60, depois=5)

    # detalhes: título
    if c.achar(["Legende seu Shorts", "Adicionar detalhes"], timeout=30) is None:
        c.tela("erro")
        raise Falha("não chegou na tela de detalhes")
    c.escrever(titulo)
    c.fechar_teclado()
    c.tocar(["Mostrar mais"], timeout=6, opcional=True)
    rows = c.linhas(800, 2110)
    if len(rows) < 3:
        c.tela("erro")
        raise Falha(f"tela de detalhes diferente do esperado ({len(rows)} linhas)")
    # público: 2ª linha → 2ª opção ("Não é conteúdo para crianças")
    a, b = rows[1]
    c.d.click(540, (a + b) // 2)
    time.sleep(3)
    opcoes = c.linhas(500, 1300)
    if len(opcoes) < 2:
        c.tela("erro")
        raise Falha("não achei as opções de público")
    a, b = opcoes[1]
    c.d.click(540, (a + b) // 2)
    time.sleep(1.5)
    c.tela("publico")
    c.d.press("back")
    time.sleep(2.5)
    # descrição: 3ª linha
    if descricao:
        rows = c.linhas(800, 2110)
        a, b = rows[2]
        c.d.click(540, (a + b) // 2)
        time.sleep(3)
        c.escrever(descricao)
        c.fechar_teclado()
        c.d.press("back")
        time.sleep(2.5)
    if c.achar(["Enviar Shorts"], timeout=10) is None:
        c.tela("erro")
        raise Falha("não voltou para a tela de detalhes")
    c.tela("antes-de-enviar")
    if seco:
        print("teste seco: parou antes de Enviar Shorts")
        c.d.app_stop(YT)
        return {"seco": True, "prints": c.prints}

    c.tocar(["Enviar Shorts"], timeout=10, depois=8)
    if c.achar(["Enviar Shorts"], timeout=3) is not None:
        c.tela("erro")
        raise Falha("continua na tela de detalhes depois de Enviar Shorts")
    time.sleep(20)                              # o envio continua sozinho em segundo plano
    c.tela("depois-de-enviar")
    registro[rid] = {"quando": dt.datetime.now().isoformat(timespec="seconds"), "titulo": titulo, "prints": c.prints}
    REGISTRO.write_text(json.dumps(registro, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"publicado: {titulo}")
    return registro[rid]


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        publicar(sys.argv[1], seco="--seco" in sys.argv)
    except Falha as e:
        print(f"FALHOU: {e}")
        sys.exit(1)
