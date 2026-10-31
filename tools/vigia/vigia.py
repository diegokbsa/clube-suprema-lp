"""Vigia diário das automações do Clube Suprema: confere se o que devia sair hoje saiu e lista as pendências.

Confere (dia de Brasília):
  - site no ar: /healthz, /blog e /torneios (com torneios na página);
  - posts do blog com data de hoje e quantos temas ainda há na pauta;
  - vídeos do dia: grade e principais (depois das 10h) e os roteiros de marketing/shorts/ criados hoje, cada um
    no YouTube (data/shorts/publicados.json) e no Instagram (data/shorts/instagram.json);
  - canal do Telegram e perfil do Bluesky: posts de hoje e a grade do dia;
  - celular POCO F5: conectado, destravado e carregando;
  - git: nada parado sem push.

Uso (na raiz do projeto): python tools/vigia/vigia.py
Saída: o resumo no terminal e data/vigia/<data>.json. A última linha é "PENDENCIAS: n".
A tarefa agendada das 22h lê as pendências e refaz o que dá (marketing/post-automatico.md, seção do vigia).
"""
import datetime as dt
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SITE = "https://suprema.blog"
BRT = dt.timezone(dt.timedelta(hours=-3))
ADB = r"C:\LDPlayer\LDPlayer9\adb.exe"
SERIAL = "192.168.16.11:5555"
TELEGRAM = "clubsupremapokerxx"
BLUESKY = "supremapoker.bsky.social"
PAUTA_MINIMA = 10


def baixa(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (vigia Clube Suprema)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read().decode("utf-8", "replace")


def adb(*args):
    r = subprocess.run([ADB, "-s", SERIAL, *args], capture_output=True, text=True, timeout=30, encoding="utf-8", errors="replace")
    return r.stdout


def registro(nome):
    p = ROOT / "data" / "shorts" / nome
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def main():
    agora = dt.datetime.now(BRT)
    hoje = agora.date().isoformat()
    ok, pend = [], []

    # site
    for caminho, marca in (("/healthz", "ok"), ("/blog", "post-card"), ("/torneios", 'class="mtt')):
        try:
            status, html = baixa(SITE + caminho)
            (ok if status == 200 and marca in html else pend).append(f"site {caminho}: HTTP {status}{'' if marca in html else ' sem conteúdo esperado'}")
        except Exception as err:  # noqa: BLE001
            pend.append(f"site {caminho}: fora do ar ({err})")

    # robô do Telegram dos grupos (lib/telegram-bot.js): ligado e lendo mensagens nos últimos 10 min
    try:
        robo = json.loads(baixa(SITE + "/api/robo")[1])
        leitura = robo.get("ultimaLeitura")
        atraso = (agora - dt.datetime.fromisoformat(leitura.replace("Z", "+00:00"))).total_seconds() / 60 if leitura else None
        if not robo.get("ativo"):
            pend.append("robô do Telegram: desligado (sem TELEGRAM_BOT_TOKEN ou getMe falhou)")
        elif atraso is None or atraso > 10:
            pend.append(f"robô do Telegram {robo.get('robo')}: não lê mensagens há {'?' if atraso is None else round(atraso)} min")
        elif robo.get("entraEmGrupos") is False:
            pend.append(f"robô do Telegram {robo.get('robo')}: não pode entrar em grupos (@BotFather → /setjoingroups → Enable)")
        else:
            ok.append(f"robô do Telegram {robo.get('robo')}: lendo mensagens")
    except Exception as err:  # noqa: BLE001
        pend.append(f"robô do Telegram: não consegui ler /api/robo ({err})")

    # posts do blog de hoje e pauta
    posts = []
    for f in sorted((ROOT / "content" / "blog").glob("*.md")):
        m = re.search(r"^date:\s*(\S+)", f.read_text(encoding="utf-8"), re.M)
        if m and m.group(1) == hoje:
            posts.append(f.stem)
    pauta = (ROOT / "marketing" / "pauta-blog.md").read_text(encoding="utf-8")
    restantes = len(re.findall(r"^- \[ \]", pauta, re.M))
    pulados = re.findall(rf"^- \[-\] {hoje} .*", pauta, re.M)
    rodadas = sum(1 for h in (12, 15, 18) if agora.hour >= h + 1)
    ok.append(f"posts de hoje: {len(posts)} ({', '.join(posts) or 'nenhum'}); pulados: {len(pulados)}")
    if len(posts) + len(pulados) < rodadas:
        pend.append(f"posts: {len(posts) + len(pulados)} de {rodadas} rodadas esperadas até agora")
    (ok if restantes >= PAUTA_MINIMA else pend).append(f"pauta: {restantes} temas na fila")

    # vídeos do dia
    yt, ig = registro("publicados.json"), registro("instagram.json")
    esperados = []
    if agora.hour >= 10:
        esperados += [f"grade-{hoje}", f"principais-{hoje}"]
    for f in (ROOT / "marketing" / "shorts").glob("*.json"):
        if dt.datetime.fromtimestamp(f.stat().st_mtime, BRT).date().isoformat() == hoje:
            esperados.append(f.stem)
    for rid in esperados:
        video = (ROOT / "data" / "shorts" / f"{rid}.mp4").exists()
        falta = [nome for nome, reg in (("YouTube", yt), ("Instagram", ig)) if rid not in reg]
        if falta:
            pend.append(f"vídeo {rid}: falta no {' e no '.join(falta)}{'' if video else ' (vídeo ainda não gerado)'}")
        else:
            ok.append(f"vídeo {rid}: YouTube e Instagram")

    # Telegram (página pública do canal)
    try:
        _, html = baixa(f"https://t.me/s/{TELEGRAM}")
        msgs = re.findall(r'<time datetime="([^"]+)"', html)
        de_hoje = [d for d in msgs if dt.datetime.fromisoformat(d).astimezone(BRT).date().isoformat() == hoje]
        grade = f"torneios?d={hoje}" in html
        ok.append(f"Telegram: {len(de_hoje)} mensagens hoje")
        if agora.hour >= 10 and not grade:
            pend.append("Telegram: a grade de hoje não apareceu no canal")
        for slug in posts:
            if f"/blog/{slug}" not in html:
                pend.append(f"Telegram: o post {slug} não apareceu no canal")
    except Exception as err:  # noqa: BLE001
        pend.append(f"Telegram: não consegui ler o canal ({err})")

    # Bluesky (feed público)
    try:
        _, txt = baixa(f"https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor={BLUESKY}&limit=40")
        feed = json.loads(txt).get("feed", [])
        uris = [((i["post"]["record"].get("embed") or {}).get("external") or {}).get("uri", "") for i in feed]
        de_hoje = [i for i in feed if dt.datetime.fromisoformat(i["post"]["record"]["createdAt"].replace("Z", "+00:00")).astimezone(BRT).date().isoformat() == hoje]
        ok.append(f"Bluesky: {len(de_hoje)} posts hoje")
        if agora.hour >= 10 and not any(f"torneios?d={hoje}" in u for u in uris):
            pend.append("Bluesky: a grade de hoje não apareceu no perfil")
        for slug in posts:
            if not any(f"/blog/{slug}" in u for u in uris):
                pend.append(f"Bluesky: o post {slug} não apareceu no perfil")
    except Exception as err:  # noqa: BLE001
        pend.append(f"Bluesky: não consegui ler o perfil ({err})")

    # celular
    try:
        devs = subprocess.run([ADB, "devices"], capture_output=True, text=True, timeout=20).stdout
        if f"{SERIAL}\tdevice" not in devs:
            subprocess.run([ADB, "connect", SERIAL], capture_output=True, timeout=20)
            devs = subprocess.run([ADB, "devices"], capture_output=True, text=True, timeout=20).stdout
        if f"{SERIAL}\tdevice" not in devs:
            pend.append("celular: POCO F5 desconectado do ADB (Wi-Fi ou depuração desligada)")
        else:
            bat = adb("shell", "dumpsys battery")
            nivel = re.search(r"level: (\d+)", bat)
            carregando = re.search(r"(AC|USB|Wireless) powered: true", bat) is not None
            travado = "isKeyguardShowing=true" in adb("shell", "dumpsys window")
            linha = f"celular: bateria {nivel.group(1) if nivel else '?'}%, {'carregando' if carregando else 'fora da tomada'}, {'travado' if travado else 'destravado'}"
            (pend if (not carregando and nivel and int(nivel.group(1)) < 30) else ok).append(linha)
            if travado:
                pend.append("celular: tela travada com senha (o dono precisa destravar ou tirar a senha)")
    except Exception as err:  # noqa: BLE001
        pend.append(f"celular: não consegui falar com o ADB ({err})")

    # git
    st = subprocess.run(["git", "status", "-sb"], cwd=ROOT, capture_output=True, text=True).stdout.splitlines()
    if st and "ahead" in st[0]:
        pend.append(f"git: commits sem push ({st[0]})")
    else:
        ok.append("git: tudo enviado")

    saida = ROOT / "data" / "vigia" / f"{hoje}.json"
    saida.parent.mkdir(parents=True, exist_ok=True)
    saida.write_text(json.dumps({"quando": agora.isoformat(timespec="seconds"), "ok": ok, "pendencias": pend}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Vigia {agora:%d/%m %H:%M}")
    for linha in ok:
        print("  ok  ", linha)
    for linha in pend:
        print("  FALTA", linha)
    print(f"PENDENCIAS: {len(pend)}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
