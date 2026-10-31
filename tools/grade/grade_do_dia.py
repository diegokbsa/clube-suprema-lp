"""Roteiro do Short "Grade de torneios de hoje" a partir da grade da Liga Suprema (a mesma de sx-co.com/torneios).

Fonte: API pública https://api.pokerbyte.com.br/mtt/list/106/all/<AAAA-MM-DD>/guaranteed/desc (liga 106, "Suprema"),
em que a data é o dia de Brasília e os horários vêm em UTC. Às 9h a grade do dia já está completa.

Escolhe os destaques que ainda vão começar (de agora, ou de --desde, até as 7h do dia seguinte): os 8 maiores garantidos,
sem satélites, em ordem de horário. O vídeo segue as regras do YouTube (marketing/videos-curtos.md): mostra horário,
nome, modalidade, stack e tempo de blind, mas não buy-in, garantido nem valores em reais (eles só servem para escolher
os destaques). Nomes com valor ("100K", "R$ 50") perdem esse pedaço.

Com --principais, faz o Short extra "Os principais torneios de hoje": os Main Events (completados pelos maiores
garantidos), até 4, um por tela, com horário, modalidade, stack, blinds e fim do late.

Uso (na raiz do projeto): python tools/grade/grade_do_dia.py [--principais] [--data AAAA-MM-DD] [--desde HH:MM]
Saída: data/shorts/grade-<data>.json ou principais-<data>.json (o caminho sai na última linha).
Depois: short_post.py e postar_short.py.
"""
import argparse
import datetime as dt
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
API = "https://api.pokerbyte.com.br/mtt/list/106/all/{}/guaranteed/desc"
BRT = dt.timezone(dt.timedelta(hours=-3))      # Brasília, sem horário de verão
DESTAQUES = 8
POR_TELA = 4
PRINCIPAIS = 4
DIAS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]


def baixa(dia):
    req = urllib.request.Request(API.format(dia.isoformat()), headers={"User-Agent": "Mozilla/5.0", "Origin": "https://www.sx-co.com"})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.load(r)
    if isinstance(d, dict):
        d = d.get("data") or next((v for v in d.values() if isinstance(v, list)), [])
    return d


def limpa_nome(nome):
    n = re.sub(r"R\$\s*[\d.,]+|\b\d+([.,]\d+)?\s*[KkMm]\b|\bGTD\b|garantid\w*", "", str(nome or "Torneio"))
    return re.sub(r"\s{2,}", " ", n).strip(" -·|") or "Torneio"


def modalidade(t):
    m = str(t.get("type") or "NLH").upper()
    return {"PLO4": "PLO 4", "PLO5": "PLO 5", "PLO6": "PLO 6"}.get(m, m)


def fichas(n):
    n = int(n or 0)
    return f"{n // 1000}K" if n >= 1000 else str(n)


def hora_fala(h):
    return f"{h.hour} horas" if h.minute == 0 else f"{h.hour} e {h.minute:02d}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data")
    ap.add_argument("--desde")
    ap.add_argument("--principais", action="store_true", help="Short extra: os principais torneios do dia, um por tela")
    a = ap.parse_args()
    agora = dt.datetime.now(BRT)
    dia = dt.date.fromisoformat(a.data) if a.data else agora.date()
    inicio = dt.datetime.combine(dia, dt.time.fromisoformat(a.desde) if a.desde else agora.time(), BRT) if (a.desde or not a.data) \
        else dt.datetime.combine(dia, dt.time(9, 0), BRT)
    fim = dt.datetime.combine(dia + dt.timedelta(days=1), dt.time(7, 0), BRT)

    vistos, lista = set(), []
    for d in (dia, dia + dt.timedelta(days=1)):
        for t in baixa(d):
            if t.get("id") in vistos:
                continue
            vistos.add(t.get("id"))
            h = dt.datetime.fromisoformat(str(t["date"]).replace("Z", "+00:00")).astimezone(BRT)
            if inicio <= h < fim and t.get("tournament") != "Satelite" and int(t.get("stack") or 0) > 0:
                lista.append((h, t))
    if not lista:
        sys.exit(f"sem torneios entre {inicio:%d/%m %H:%M} e {fim:%d/%m %H:%M}")
    if a.principais:
        return principais(dia, lista)
    destaque = sorted(lista, key=lambda x: -float(x[1].get("guaranteed") or 0))[:DESTAQUES]
    destaque.sort(key=lambda x: x[0])

    linhas, falas = [], []
    for h, t in destaque:
        extra = " · Main Event" if t.get("tournament") == "Main Event" else (" · KO" if t.get("isKO") else "")
        blinds = f" · blinds {t['temponivelmMeta']} min" if t.get("temponivelmMeta") else ""
        linhas.append({"hora": f"{h:%H:%M}", "nome": limpa_nome(t.get("name")),
                       "info": f"{modalidade(t)} · stack {fichas(t.get('stack'))}{blinds}{extra}"})
        falas.append(f"às {hora_fala(h)}, {limpa_nome(t.get('name'))}")

    data_txt = f"{DIAS[dia.weekday()]}, {dia:%d/%m}"
    cenas = [{"tela": f"Grade de torneios de **hoje** no Suprema Poker", "fala": f"Grade de torneios de hoje no Suprema Poker, {data_txt}. Os destaques, no horário de Brasília.", "imagem": "public/img/app-mesa.webp"}]
    for i in range(0, len(linhas), POR_TELA):
        bloco = linhas[i:i + POR_TELA]
        cenas.append({"tela": f"**{data_txt.capitalize()}** · horário de Brasília", "linhas": bloco,
                      "fala": ". ".join(f.capitalize() for f in falas[i:i + POR_TELA]) + "."})
    cenas.append({"tela": "Confira no **lobby do app**. Segue o canal: a grade sai **todo dia**!",
                  "fala": "Os horários podem mudar, então confira no lobby do app. Segue o canal: a grade sai todo dia de manhã."})

    roteiro = {
        "id": f"grade-{dia.isoformat()}",
        "tipo": "Grade de torneios",
        "titulo": f"Grade de torneios de hoje no Suprema Poker ({dia:%d/%m}) #shorts",
        "descricao": (f"Os torneios em destaque de hoje, {data_txt}, na Liga Suprema do app Suprema Poker: horário de Brasília, "
                      "modalidade, stack inicial e tempo de blind. Os horários podem mudar: confira no lobby do app.\n\n"
                      "18+ · Jogue com responsabilidade.\n\n#supremapoker #poker #pokeronline #torneiodepoker"),
        "cenas": cenas,
    }
    for ln in linhas:
        print(ln["hora"], ln["nome"], "|", ln["info"])
    grava(roteiro)


def grava(roteiro):
    out = ROOT / "data" / "shorts" / f"{roteiro['id']}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(roteiro, ensure_ascii=False, indent=2), encoding="utf-8")
    print(out)


def principais(dia, lista):
    """Short extra: os principais torneios do dia (Main Events, completados pelos maiores garantidos), um por tela."""
    por_gtd = sorted(lista, key=lambda x: -float(x[1].get("guaranteed") or 0))
    escolha = [x for x in por_gtd if x[1].get("tournament") == "Main Event"][:PRINCIPAIS]
    escolha += [x for x in por_gtd if x not in escolha][:PRINCIPAIS - len(escolha)]
    escolha.sort(key=lambda x: x[0])
    data_txt = f"{DIAS[dia.weekday()]}, {dia:%d/%m}"
    cenas = [{"tela": "Os **principais torneios** de hoje no Suprema Poker",
              "fala": "Os principais torneios de hoje na Liga Suprema.", "imagem": "public/img/app-abertura.webp"}]
    for n, (h, t) in enumerate(escolha, 1):
        nome = limpa_nome(t.get("name"))
        info = [modalidade(t), f"stack {fichas(t.get('stack'))}"]
        if t.get("temponivelmMeta"):
            info.append(f"blinds de {t['temponivelmMeta']} min")
        if t.get("late"):
            hl = dt.datetime.fromisoformat(str(t["late"]).replace("Z", "+00:00")).astimezone(BRT)
            info.append(f"late até {hl:%H:%M}")
        selo = "Main Event" if t.get("tournament") == "Main Event" else ("Knockout" if t.get("isKO") else "")
        stack = int(t.get("stack") or 0)
        cenas.append({
            "passo": n, "tela": f"**{n}º** destaque · horário de Brasília",
            "destaque": {"hora": f"{h:%H:%M}", "nome": nome, "selo": selo, "info": info},
            "fala": f"Às {hora_fala(h)}, {nome}, de {modalidade(t)}{f', stack de {stack // 1000} mil' if stack >= 1000 else ''}.",
        })
    cenas.append({"tela": "Qual você vai jogar? Confira no **lobby do app** e segue o canal!",
                  "fala": "Qual você vai jogar? Confira no lobby do app e segue o canal."})
    for h, t in escolha:
        print(f"{h:%H:%M}", limpa_nome(t.get("name")), "|", t.get("tournament"))
    grava({
        "id": f"principais-{dia.isoformat()}",
        "tipo": "Principais do dia",
        "titulo": f"Os principais torneios de hoje no Suprema Poker ({dia:%d/%m}) #shorts",
        "descricao": (f"Os torneios principais de hoje, {data_txt}, na Liga Suprema do app Suprema Poker: horário de Brasília, "
                      "modalidade, stack inicial, tempo de blind e até quando dá para entrar. Os horários podem mudar: confira "
                      "no lobby do app.\n\n18+ · Jogue com responsabilidade.\n\n#supremapoker #poker #pokeronline #torneiodepoker"),
        "cenas": cenas,
    })


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
