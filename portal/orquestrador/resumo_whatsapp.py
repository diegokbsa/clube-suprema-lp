"""Resumo de hora em hora do Portal no WhatsApp do Kbsa (pelo Hermes): texto curto + 1 foto do sistema + 1 foto do backoffice.

Chamado pelo relatório horário do orquestrador (tarefa "Portal - Relatorio (1 h)"). Também dá para rodar à mão:
  python -I portal/orquestrador/resumo_whatsapp.py            envia agora
  python -I portal/orquestrador/resumo_whatsapp.py --seco     monta o texto e as fotos, mostra e não envia

Destino: a conversa de WhatsApp mais recente do Kbsa com o Hermes (mesma regra do ordens.py: o id nunca é impresso).
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

AQUI = Path(__file__).resolve().parent
REPO = AQUI.parent.parent
ESTADO = AQUI / "estado" / "estado.json"
BACKLOG = AQUI / "backlog.json"
PESQ = REPO / "portal" / "pesquisador" / "estado" / "estado.json"
FOTOS = REPO / "portal" / "relatorios" / "fotos"
HOMES_PENDENTE = AQUI / "estado" / "homes-pendente.txt"   # existe = no próximo envio manda a foto da home de cada modelo (uma vez só)
SCRIPTS = Path(r"C:\Users\Administrator\Documents\Suprema-360\00-SYSTEM\scripts")
SEM_JANELA = getattr(subprocess, "CREATE_NO_WINDOW", 0)
AGENTES = {"codex": "Codex", "kimi": "Kimi", "claude-design": "Claude design", "claude": "Claude", "big": "Big"}


def ler(p: Path, padrao):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return padrao


def no_ar(url: str) -> str:
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "KBSA-Homelab/1.0"}), timeout=10) as r:
            return "no ar" if r.status == 200 else f"HTTP {r.status}"
    except Exception as e:
        return f"fora ({type(e).__name__})"


TITULOS = {"sx": "🃏 *SX · sx.kbsa.app* · Claude e agentes", "aff": "🤝 *Afiliados · aff.kbsa.app* · Codex e Kimi (Claude orquestra)"}
SX_STATUS = AQUI / "estado" / "sx-status.json"   # frentes da SX tocadas pelos agentes do Claude (fora da fila do orquestrador)
ICONE = {"pronto": "✅", "andando": "🔧", "revisao": "🔎", "bloqueado": "⚠️", "fila": "⏳"}


def texto(testes: str | None = None, area: str = "aff") -> str:
    """Kbsa, 06/11/2026: dois relatórios por hora, um da SX (Claude e agentes) e um do portal aff (Codex e Kimi)."""
    agora = datetime.now().astimezone()
    estado = ler(ESTADO, {"tarefas": {}})
    tarefas = {t["id"]: t for t in ler(BACKLOG, {"tarefas": []})["tarefas"] if t.get("area", "aff") == area}
    st = {tid: s for tid, s in estado["tarefas"].items() if tid in tarefas}
    nome = lambda tid: f"{tid} {tarefas.get(tid, {}).get('titulo', '')}"[:70]  # noqa: E731
    uma_hora = agora - timedelta(hours=1)
    feitas = [tid for tid, s in st.items() for h in s.get("historico", [])[-5:]
              if h.get("para") == "concluida" and datetime.fromisoformat(h["em"]) >= uma_hora]
    andando = [tid for tid, s in st.items() if s["status"] == "em_execucao" and tid in tarefas]
    revisao = [tid for tid, s in st.items() if s["status"] == "em_revisao" and tid in tarefas]
    bloq = [tid for tid, s in st.items() if s["status"] == "bloqueada" and tid in tarefas]
    concl = sum(1 for s in st.values() if s["status"] == "concluida")
    hoje = agora.strftime("%Y-%m-%d")
    pesq = ler(PESQ, {"totais": {}, "por_dia": {}})
    linhas = [f"{TITULOS[area]} · {agora:%d/%m %Hh}", f"Tarefas da fila concluídas: {concl} de {len(tarefas)}", ""]
    if area == "sx":
        frentes = ler(SX_STATUS, {"frentes": []}).get("frentes", [])
        if frentes:
            linhas += ["🎨 *Frentes dos agentes*"] + [f"{ICONE.get(f.get('status'), '•')} {f.get('item', '')}: {f.get('nota', '')}"[:160] for f in frentes] + [""]
    linhas.append("✅ *Na última hora*" if feitas else "✅ Na última hora: nada concluído na fila")
    linhas += [f"• {nome(t)}" for t in dict.fromkeys(feitas)]
    if andando:
        quem = lambda t: {"big": "Claude", "codex": "Codex", "kimi": "Kimi"}.get(Path(st[t].get("ordem") or "").parent.name, AGENTES.get(tarefas[t]["agente"], tarefas[t]["agente"]))  # noqa: E731
        linhas += ["", "🔧 *Em andamento*"] + [f"• {quem(t)}: {nome(t)}" for t in andando]
    if revisao:
        linhas += ["", "🔎 *Em revisão*"] + [f"• {nome(t)}" for t in revisao]
    if bloq:
        linhas += ["", "⚠️ *Bloqueadas*"] + [f"• {nome(t)}: {str(st[t].get('bloqueio') or '')[:90]}" for t in bloq]
    ideias = [i for i in ler(REPO / "portal" / "olheiro" / "ideias.json", {"ideias": []})["ideias"] if i.get("area") == area]
    levar = [i for i in ideias if i.get("status") == "levar_ao_kbsa"]
    linhas += ["", f"💡 Ideias dos olheiros: {len(ideias)} trazidas · {len(levar)} para decidirmos juntos"
               + (f" ({sum(1 for i in levar if i.get('muda_o_jogo'))} que podem mudar o jogo)" if levar else "") + ". Pergunte quando quiser ver."]
    if area == "sx":
        linhas += ["", f"🌐 sx.kbsa.app {no_ar('https://sx.kbsa.app/healthz')}", "", "Foto: um modelo novo da SX na versão mais nova (ambiente de desenvolvimento)."]
    else:
        linhas += ["", f"🧪 Testes: {testes or 'não rodaram nesta hora'}",
                   f"💡 Insights hoje: {pesq.get('por_dia', {}).get(hoje, 0)} pesquisas · {pesq.get('totais', {}).get('insights', 0)} insights no total",
                   f"📦 Ordens hoje (as duas frentes): {estado.get('ordens_hoje', {}).get(hoje, 0)}",
                   f"🌐 aff.kbsa.app {no_ar('https://aff.kbsa.app/healthz')}",
                   "", "Fotos: site e painel na versão mais nova (ambiente de desenvolvimento)."]
    return "\n".join(linhas)


def foto_sx() -> str | None:
    """Home de um modelo da SX com mundo visual, um por hora em rodízio (fotos-homes monta tudo num banco temporário)."""
    ids = []
    for f in sorted((REPO / "portal" / "templates").glob("sx-*.json")):
        try:
            if json.loads(f.read_text(encoding="utf-8")).get("theme", {}).get("world"):
                ids.append(f.stem)
        except (OSError, json.JSONDecodeError):
            continue
    if not ids:
        return None
    alvo = ids[datetime.now().hour % len(ids)]
    node = shutil.which("node") or "node"
    r = subprocess.run([node, str(REPO / "portal" / "tools" / "fotos-homes.mjs"), str(FOTOS), "--modelos", alvo], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=240, creationflags=SEM_JANELA, cwd=REPO)
    try:
        h = (json.loads((r.stdout.strip().splitlines() or ["{}"])[-1]).get("homes") or [None])[0]
        return h and h["arquivo"]
    except json.JSONDecodeError:
        return None


def fotos() -> dict:
    node = shutil.which("node") or "node"
    r = subprocess.run([node, str(REPO / "portal" / "tools" / "fotos.mjs"), str(FOTOS)], capture_output=True, text=True, encoding="utf-8", errors="replace",
                       timeout=180, creationflags=SEM_JANELA, cwd=REPO)
    try:
        return json.loads((r.stdout.strip().splitlines() or ["{}"])[-1])
    except json.JSONDecodeError:
        return {"erro": (r.stdout + r.stderr)[-300:]}


def fotos_homes() -> dict:
    node = shutil.which("node") or "node"
    r = subprocess.run([node, str(REPO / "portal" / "tools" / "fotos-homes.mjs"), str(FOTOS)], capture_output=True, text=True, encoding="utf-8", errors="replace",
                       timeout=420, creationflags=SEM_JANELA, cwd=REPO)
    try:
        return json.loads((r.stdout.strip().splitlines() or ["{}"])[-1])
    except json.JSONDecodeError:
        return {"erro": (r.stdout + r.stderr)[-300:]}


def destino() -> str | None:
    sys.path.insert(0, str(SCRIPTS))
    import ordens  # noqa: E402  (mesma regra de destino dos avisos das ordens)
    return ordens.destino("whatsapp")


def enviar(testes: str | None = None, seco: bool = False) -> dict:
    corpo_sx, corpo = texto(testes, "sx"), texto(testes, "aff")
    f = fotos()
    fsx = foto_sx()
    if seco:
        return {"texto": corpo_sx + "\n\n────────\n\n" + corpo, "fotos": {**f, "sx": fsx}}
    hermes = shutil.which("hermes")
    alvo = destino()
    if not hermes or not alvo:
        return {"enviado": False, "motivo": "hermes fora do PATH" if not hermes else "sem conversa de WhatsApp do Kbsa no log do Hermes"}
    res = []
    msg0 = corpo_sx + (f"\nMEDIA:{fsx}" if fsx else "")
    msg1 = corpo + (f"\nMEDIA:{f['sistema']}" if f.get("sistema") else "")
    msg2 = f"🖥️ Backoffice · {f.get('tela', '')}\nMEDIA:{f['backoffice']}" if f.get("backoffice") else None
    for m in [msg0, msg1, msg2]:
        if not m:
            continue
        r = subprocess.run([hermes, "-p", "codexlocal", "send", "-t", alvo, "-q", m], capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=120, creationflags=SEM_JANELA)
        res.append(r.returncode)
    homes = None
    if HOMES_PENDENTE.exists():
        h = fotos_homes()
        lista = h.get("homes") or []
        cods = []
        if lista:
            sx = sum(1 for x in lista if x["edicao"] == "sx")
            cab = f"🏠 *Homes dos modelos* ({len(lista)}: {len(lista) - sx} da edição Geral e {sx} da SX)\nSites de exemplo montados com cada modelo, dados fictícios."
            r = subprocess.run([hermes, "-p", "codexlocal", "send", "-t", alvo, "-q", cab], capture_output=True, text=True, encoding="utf-8", errors="replace",
                               timeout=120, creationflags=SEM_JANELA)
            cods.append(r.returncode)
            for i, x in enumerate(lista, 1):
                ed = "SX" if x["edicao"] == "sx" else "Geral"
                m = f"🏠 {i}/{len(lista)} · {x['nome']} ({ed})\nMEDIA:{x['arquivo']}"
                r = subprocess.run([hermes, "-p", "codexlocal", "send", "-t", alvo, "-q", m], capture_output=True, text=True, encoding="utf-8", errors="replace",
                                   timeout=120, creationflags=SEM_JANELA)
                cods.append(r.returncode)
        homes = {"fotos": len(lista), "enviadas": sum(1 for c in cods[1:] if c == 0), "erro": h.get("erro")}
        if lista and all(c == 0 for c in cods):
            HOMES_PENDENTE.unlink(missing_ok=True)   # só some quando tudo chegou; se falhar, tenta de novo na hora seguinte
    return {"homes": homes, "enviado": all(c == 0 for c in res), "codigos": res, "fotos": {k: Path(v).name for k, v in f.items() if k in ("sistema", "backoffice")}, "erro_fotos": f.get("erro")}


if __name__ == "__main__":
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    seco = "--seco" in sys.argv
    out = enviar(seco=seco)
    print(out["texto"] if seco else json.dumps(out, ensure_ascii=False))
    if seco:
        print(json.dumps(out["fotos"], ensure_ascii=False))
