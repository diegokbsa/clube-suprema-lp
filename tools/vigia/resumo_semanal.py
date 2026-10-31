"""Resumo semanal de resultados do Clube Suprema, com o que dá para ler sem login:
  - YouTube (Suprema Poker Live): visualizações de cada Short, da página pública /shorts do canal
    (o feed RSS não existe para este canal);
  - Telegram (t.me/clubsupremapokerxx): visualizações de cada mensagem dos últimos 7 dias, da página pública;
  - Bluesky (supremapoker.bsky.social): curtidas, reposts e respostas dos últimos 7 dias, da API pública;
  - blog: posts publicados nos últimos 7 dias; vídeos publicados (registros em data/shorts/).
Os cadastros por origem vêm da planilha (a tarefa agendada lê pelo conector do Google Drive) e as visualizações do
Instagram ficam no Insights do app.

Uso (na raiz do projeto): python tools/vigia/resumo_semanal.py
Saída: Markdown no terminal e em marketing/relatorios/semana-<data>.md (a tarefa acrescenta cadastros e conclusões).
"""
import datetime as dt
import html as htmllib
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BRT = dt.timezone(dt.timedelta(hours=-3))
YOUTUBE = "https://www.youtube.com/@supremapokerlive/shorts"
TELEGRAM = "https://t.me/s/clubsupremapokerxx"
BLUESKY = "https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=supremapoker.bsky.social&limit=100"


def baixa(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130", "Accept-Language": "pt-BR"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def numero(txt):
    """'1,2 mil' → 1200; '15' → 15; '1.2K' → 1200."""
    t = txt.strip().lower().replace(" ", " ")
    m = re.match(r"([\d.,]+)\s*(mil|k|mi|m)?", t)
    if not m:
        return 0
    n = float(m.group(1).replace(".", "").replace(",", ".")) if m.group(2) else float(m.group(1).replace(".", "").replace(",", ""))
    if m.group(2) in ("mil", "k"):
        n = float(m.group(1).replace(",", ".")) * 1000
    elif m.group(2) in ("mi", "m"):
        n = float(m.group(1).replace(",", ".")) * 1_000_000
    return int(n)


def youtube():
    x = baixa(YOUTUBE)
    vistos, lista = set(), []
    for m in re.finditer(r'"accessibilityText":"([^"]{5,300}?), ([\d.,]+(?:\s*(?:mil|mi))?) visualiza', x):
        titulo = m.group(1).replace("\\u0026", "&")
        if titulo not in vistos:
            vistos.add(titulo)
            lista.append((numero(m.group(2)), titulo))
    return lista


def telegram(desde):
    x = baixa(TELEGRAM)
    lista = []
    for bloco in x.split('class="tgme_widget_message_wrap')[1:]:
        quando = re.search(r'<time datetime="([^"]+)"', bloco)
        if not quando:
            continue
        d = dt.datetime.fromisoformat(quando.group(1)).astimezone(BRT)
        if d < desde:
            continue
        views = re.search(r'tgme_widget_message_views">([^<]+)', bloco)
        texto = re.search(r'tgme_widget_message_text[^>]*>(.*?)</div>', bloco, re.S)
        resumo = htmllib.unescape(re.sub(r"<[^>]+>", " ", texto.group(1))).split("  ")[0].strip()[:70] if texto else "(mídia)"
        lista.append((numero(views.group(1)) if views else 0, d, resumo))
    return lista


def bluesky(desde):
    feed = json.loads(baixa(BLUESKY)).get("feed", [])
    lista = []
    for i in feed:
        p = i["post"]
        d = dt.datetime.fromisoformat(p["record"]["createdAt"].replace("Z", "+00:00")).astimezone(BRT)
        if d >= desde:
            lista.append((p.get("likeCount", 0), p.get("repostCount", 0), p.get("replyCount", 0), d, p["record"]["text"].split("\n")[0][:70]))
    return lista


def registro(nome, desde):
    p = ROOT / "data" / "shorts" / nome
    reg = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
    return [k for k, v in reg.items() if "quando" in v and dt.datetime.fromisoformat(v["quando"]).replace(tzinfo=BRT) >= desde]


def main():
    agora = dt.datetime.now(BRT)
    desde = agora - dt.timedelta(days=7)
    linhas = [f"# Resumo da semana: {desde:%d/%m} a {agora:%d/%m/%Y}", ""]

    posts = []
    for f in (ROOT / "content" / "blog").glob("*.md"):
        m = re.search(r"^date:\s*(\S+)", f.read_text(encoding="utf-8"), re.M)
        if m and m.group(1) >= desde.date().isoformat():
            posts.append(f.stem)
    yt_pub, ig_pub = registro("publicados.json", desde), registro("instagram.json", desde)
    linhas += ["## Produção", f"- Posts no blog: {len(posts)}", f"- Shorts no YouTube: {len(yt_pub)}", f"- Reels no Instagram: {len(ig_pub)}", ""]

    try:
        yt = youtube()
        total = sum(v for v, _ in yt)
        linhas += ["## YouTube (Suprema Poker Live)", f"- {len(yt)} Shorts na página do canal, {total} visualizações somadas"]
        linhas += [f"- {v} · {t}" for v, t in sorted(yt, reverse=True)[:10]]
    except Exception as err:  # noqa: BLE001
        linhas += ["## YouTube", f"- não consegui ler o canal ({err})"]
    linhas.append("")

    try:
        tg = telegram(desde)
        linhas += ["## Telegram (canal)", f"- {len(tg)} mensagens, {sum(v for v, _, _ in tg)} visualizações somadas"]
        linhas += [f"- {v} · {d:%d/%m} · {t}" for v, d, t in sorted(tg, key=lambda x: -x[0])[:8]]
    except Exception as err:  # noqa: BLE001
        linhas += ["## Telegram", f"- não consegui ler o canal ({err})"]
    linhas.append("")

    try:
        bs = bluesky(desde)
        linhas += ["## Bluesky", f"- {len(bs)} posts, {sum(x[0] for x in bs)} curtidas, {sum(x[1] for x in bs)} reposts, {sum(x[2] for x in bs)} respostas"]
        linhas += [f"- {c} curtidas · {d:%d/%m} · {t}" for c, _, _, d, t in sorted(bs, key=lambda x: -x[0])[:5]]
    except Exception as err:  # noqa: BLE001
        linhas += ["## Bluesky", f"- não consegui ler o perfil ({err})"]
    linhas += ["", "## Cadastros (planilha)", "- (preenchido pela tarefa com os dados da planilha)", "",
               "## Grupos do Telegram com o robô (aba Grupos da planilha)", "- (preenchido pela tarefa: ativos, pausados, entraram e saíram na semana)", "",
               "## Instagram", "- Visualizações: Insights do app (@supremaclub)", "", "## Conclusões", "- (preenchido pela tarefa)", ""]

    texto = "\n".join(linhas)
    out = ROOT / "marketing" / "relatorios" / f"semana-{agora:%Y-%m-%d}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(texto, encoding="utf-8")
    print(texto)
    print(out)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
