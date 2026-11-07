"""Pesquisador de IA do Portal: de hora em hora (Kbsa, 06/11/2026 23h40) pesquisa na internet um tema (rodízio de temas.json) e traz insights
com fonte e ação sugerida para os sistemas (edição SX, edição Geral, suprema.blog, orquestrador).

  pesquisador.py start     registra a tarefa agendada "Portal - Pesquisador (20 min)" e roda um ciclo
  pesquisador.py stop      remove a tarefa agendada (histórico fica)
  pesquisador.py pause | resume
  pesquisador.py status    tema da vez, ordem em aberto, contagens e destinos
  pesquisador.py ciclo     o que o agendador chama: recolhe resultados e, se não houver pesquisa em andamento, pede a próxima

Como funciona (sem integração simulada):
  - A pesquisa é uma ordem real pela caixa do ordens.py: Kimi por padrão (pesquisa é com ele, regra da equipe);
    se a ordem do Kimi não for pega em 40 min, a próxima vai para o Big (Claude, com busca na web).
  - O agente grava os achados em JSON em portal/pesquisador/entrada/. O ciclo seguinte valida, tira repetidos e distribui:
      * painéis do portal (Geral e SX) via POST /api/service/insights com o token de serviço de cada instalação;
      * Plane, projeto PORTAL, coluna Backlog com etiqueta "insight" (só os de impacto >= 4 e confiança >= 3, ou urgentes);
      * vault: 04-KNOWLEDGE/Research/Insights-Portal/AAAA-MM-DD.md.
  - Nada é aplicado sozinho: insight é sugestão; o coordenador decide e só então vira tarefa do orquestrador.
  - Uma pesquisa por vez; limite diário em CONFIG["max_por_dia"].
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

AQUI = Path(__file__).resolve().parent
REPO = AQUI.parent.parent
ENTRADA = AQUI / "entrada"
PROCESSADO = AQUI / "processado"
ESTADO_DIR = AQUI / "estado"
ESTADO = ESTADO_DIR / "estado.json"
LOG = ESTADO_DIR / "log.jsonl"
TEMAS = AQUI / "temas.json"
VAULT = Path(r"C:\Users\Administrator\Documents\Suprema-360")
SCRIPTS = VAULT / "00-SYSTEM" / "scripts"
ORDENS = SCRIPTS / "ordens.py"
NOTAS = VAULT / "04-KNOWLEDGE" / "Research" / "Insights-Portal"
SEGREDOS = Path(r"C:\AgentSetup\secrets\portal-servico.env")
SECO = os.environ.get("PESQUISADOR_SECO") == "1"  # teste: nota vai para estado/, não cria cartão no Plane nem pede pesquisa
if SECO:
    NOTAS = ESTADO_DIR / "notas-teste"
TAREFA = "Portal - Pesquisador (20 min)"  # nome antigo mantido para não quebrar referências; roda de hora em hora
PROJETO = "lp-clube-suprema"
SEM_JANELA = getattr(subprocess, "CREATE_NO_WINDOW", 0)

CONFIG = {
    "agente": "big",           # Kbsa, 06/11/2026: "remova o codex e kimi"; a pesquisa vai para o Claude (caixa do Big)
    "reserva": "big",
    "pegar_em_min": 40,        # ordem não pega nesse tempo -> próxima vai para a reserva
    "travada_min": 120,        # ordem em andamento há mais que isso -> desiste e segue
    "max_por_dia": 24,         # de hora em hora o dia inteiro (Kbsa, 06/11/2026); com uma pesquisa por vez, na prática sai menos
    "plane_impacto": 4,
    "plane_confianca": 3,
    "portais": [               # token: arquivo da pasta de dados (mesma máquina) ou chave no portal-servico.env
        {"nome": "Geral (local)", "url": "http://localhost:3400", "token_arquivo": str(REPO / "portal" / "data" / "token-servico.txt")},
        {"nome": "SX (local)", "url": "http://localhost:3401", "token_arquivo": str(REPO / "portal" / "data-sx" / "token-servico.txt")},
        {"nome": "Geral", "url": "https://portal.kbsa.app", "token_env": "PORTAL_GERAL_TOKEN"},
        {"nome": "SX", "url": "https://sx.kbsa.app", "token_env": "PORTAL_SX_TOKEN"},
    ],
}


# ---------------------------------------------------------------- utilidades

def agora() -> datetime:
    return datetime.now().astimezone()


def iso(d: datetime | None = None) -> str:
    return (d or agora()).isoformat(timespec="seconds")


def log(evento: str, **dados) -> None:
    ESTADO_DIR.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(json.dumps({"em": iso(), "evento": evento, **dados}, ensure_ascii=False) + "\n")


def ler(p: Path, padrao):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return padrao


def gravar(p: Path, dados) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, p)


def estado() -> dict:
    return ler(ESTADO, {"pausado": False, "proximo": 0, "ordem": None, "vistos": [], "por_dia": {}, "totais": {"pedidas": 0, "insights": 0, "repetidos": 0, "recusados": 0}, "titulos": {}})


def hash_insight(i: dict) -> str:  # mesmo cálculo do portal (lib/insights.mjs)
    url = re.sub(r"[?#].*$", "", str(i.get("fonte_url", "")).strip()[:500].lower())
    return hashlib.sha256(f"{url}|{str(i.get('titulo', '')).strip()[:200].lower()}".encode("utf-8")).hexdigest()


def cabecalho(md: str) -> dict:
    m = re.match(r"^---\n(.*?)\n---", md.replace("\r\n", "\n"), re.S)
    return dict((k.strip(), v.strip()) for k, _, v in (l.partition(":") for l in (m.group(1).splitlines() if m else [])) if k.strip())


def segredos() -> dict:
    out = {}
    if SEGREDOS.exists():
        for linha in SEGREDOS.read_text(encoding="utf-8-sig").splitlines():
            if "=" in linha and not linha.lstrip().startswith("#"):
                k, _, v = linha.partition("=")
                out[k.strip()] = v.strip().strip('"')
    return out


# ---------------------------------------------------------------- pedir pesquisa

def texto_ordem(tema: dict, arquivo: Path, recentes: list[str]) -> str:
    sistemas = ", ".join(tema["sistemas"])
    ja = "\n".join(f"- {t}" for t in recentes[-15:]) or "- (nenhum ainda)"
    return f"""# O que fazer

Pesquisa na internet para o Portal de Afiliação · tema **{tema['titulo']}** (`{tema['id']}`).

**Pergunta:** {tema['pergunta']}

Sistemas que podem usar o achado: {sistemas}.
- `sx`: edição do grupo SX (clubes de poker, agentes e parceiros; sites de clube, jornada de cadastro e fichas, blog, Instagram).
- `geral`: edição para todos os produtos e programas de afiliação (sites, blog com SEO, CRM, afiliados, criativos, jornadas A/B, conector MCP).
- `suprema.blog`: site do Clube Suprema (poker, blog automático, jornada guiada com Fichas 24h).
- `orquestrador`: a coordenação dos agentes (Claude, Codex, Kimi) e o Plane.

## Regras
- Use busca na web de verdade e só fontes dos últimos 30 dias, de preferência oficiais (blogs oficiais do Google, Bing, Meta, YouTube; diário oficial; imprensa séria).
- Cada insight precisa de um link real que você abriu. Não invente fonte, número ou data. Se não achar nada novo e útil, devolva a lista vazia.
- Nada repetido. Já trazidos neste tema:
{ja}
- Português do Brasil. Não envie mensagem, não publique, não crie conta, não mexa em código: só pesquise e grave o arquivo.
- Não use a tela do computador (o Kbsa está usando): pesquise pela ferramenta de busca/leitura web ou por navegador sem tela, nada de mouse, teclado ou janela na frente.

## Entregável
Grave **exatamente** este JSON (UTF-8) em `{arquivo}`:

```json
{{"tema": "{tema['id']}", "pesquisado_em": "AAAA-MM-DDTHH:MM-03:00", "insights": [
  {{"titulo": "frase curta do achado", "resumo": "2 a 4 frases: o que mudou e por que importa",
    "fonte_url": "https://...", "fonte_data": "AAAA-MM-DD", "tipo": "seo|produto|mercado|integracao|conteudo|conversao|risco|seguranca",
    "aplicavel_em": ["sx", "geral"], "acao": "o que fazer no sistema, concreto (tela, arquivo, texto, configuração)",
    "impacto": 1, "esforco": 1, "confianca": 1, "urgente": false}}
]}}
```

De 0 a 6 insights; impacto, esforço e confiança de 1 a 5. `urgente: true` só para risco legal, de segurança ou de bloqueio de conta.

# Critério de pronto

Arquivo JSON válido gravado no caminho acima, registro com `python "{SCRIPTS / 'memoria.py'}" registrar --agente <você> --projeto {PROJETO} --resumo "Pesquisa {tema['id']}: N insights"`,
e esta ordem com `status: feita` e RESULTADO · VALIDAÇÃO · STATUS · PRÓXIMA AÇÃO escritos abaixo.
"""


def pedir(est: dict, agente: str) -> None:
    temas = ler(TEMAS, {"temas": []})["temas"]
    if not temas:
        log("sem_temas")
        return
    tema = temas[est["proximo"] % len(temas)]
    est["proximo"] = (est["proximo"] + 1) % len(temas)
    ENTRADA.mkdir(parents=True, exist_ok=True)
    arquivo = ENTRADA / f"{agora():%Y%m%d-%H%M}-{tema['id']}.json"
    corpo = ESTADO_DIR / "ordem-atual.md"
    corpo.write_text(texto_ordem(tema, arquivo, est["titulos"].get(tema["id"], [])), encoding="utf-8")
    r = subprocess.run([sys.executable, str(ORDENS), "nova", agente, f"Pesquisa do portal: {tema['titulo']}", "--projeto", PROJETO,
                        "--de", "Claude (pesquisador do Portal de Afiliação)", "--arquivo", str(corpo)],
                       capture_output=True, text=True, encoding="utf-8", errors="replace", creationflags=SEM_JANELA, timeout=120)
    m = re.search(r"ORDEM CRIADA: (.+\.md)", r.stdout)
    if r.returncode or not m:
        log("ordem.falhou", agente=agente, tema=tema["id"], saida=(r.stdout + r.stderr)[-300:])
        return
    hoje = agora().strftime("%Y-%m-%d")
    est["por_dia"] = {hoje: est["por_dia"].get(hoje, 0) + 1}
    est["totais"]["pedidas"] += 1
    est["ordem"] = {"arquivo": m.group(1).strip(), "agente": agente, "tema": tema["id"], "saida": str(arquivo), "em": iso()}
    log("ordem.criada", agente=agente, tema=tema["id"], ordem=est["ordem"]["arquivo"])


def conferir_ordem(est: dict) -> str | None:
    """Devolve None se pode pedir outra; senão o motivo de esperar. Também escolhe a reserva quando o Kimi não pega."""
    o = est.get("ordem")
    if not o:
        return None
    p = Path(o["arquivo"])
    st = cabecalho(p.read_text(encoding="utf-8")).get("status", "?") if p.exists() else "sumiu"
    idade = (agora() - datetime.fromisoformat(o["em"])).total_seconds() / 60
    if st in ("feita", "bloqueada", "sumiu"):
        log("ordem.fim", tema=o["tema"], agente=o["agente"], status=st, minutos=round(idade))
        est["ordem"] = None
        return None
    if st == "aberta" and idade > CONFIG["pegar_em_min"]:
        log("ordem.nao_pega", tema=o["tema"], agente=o["agente"], minutos=round(idade))
        est["ordem"] = None
        est["usar_reserva"] = True
        return None
    if idade > CONFIG["travada_min"]:
        log("ordem.travada", tema=o["tema"], agente=o["agente"], minutos=round(idade))
        est["ordem"] = None
        return None
    return f"pesquisa {o['tema']} com {o['agente']} ({st}, {round(idade)} min)"


# ---------------------------------------------------------------- recolher e distribuir

def recolher(est: dict) -> list[dict]:
    novos = []
    vistos = set(est["vistos"])
    PROCESSADO.mkdir(parents=True, exist_ok=True)
    for f in sorted(ENTRADA.glob("*.json")) if ENTRADA.exists() else []:
        try:
            dados = json.loads(f.read_text(encoding="utf-8-sig"))
            lista = dados.get("insights", []) if isinstance(dados, dict) else []
        except json.JSONDecodeError as e:
            log("entrada.invalida", arquivo=f.name, erro=str(e)[:200])
            f.replace(PROCESSADO / f"INVALIDO-{f.name}")
            continue
        tema = dados.get("tema") or f.stem.split("-", 2)[-1]
        for i in lista:
            if not isinstance(i, dict) or not re.match(r"^https?://\S+\.\S+", str(i.get("fonte_url", ""))) or len(str(i.get("titulo", ""))) < 8:
                est["totais"]["recusados"] += 1
                continue
            h = hash_insight(i)
            if h in vistos:
                est["totais"]["repetidos"] += 1
                continue
            vistos.add(h)
            i["tema"] = tema
            novos.append(i)
            est["titulos"].setdefault(tema, []).append(str(i["titulo"])[:120])
            est["titulos"][tema] = est["titulos"][tema][-30:]
        f.replace(PROCESSADO / f.name)
        log("entrada.processada", arquivo=f.name, insights=len(lista))
    est["vistos"] = list(vistos)[-5000:]
    est["totais"]["insights"] += len(novos)
    return novos


def enviar_portais(insights: list[dict]) -> dict:
    sec = segredos()
    res = {}
    for p in CONFIG["portais"]:
        tok = None
        if p.get("token_arquivo") and Path(p["token_arquivo"]).exists():
            tok = Path(p["token_arquivo"]).read_text(encoding="utf-8").strip()
        if p.get("token_env"):
            tok = sec.get(p["token_env"]) or tok
        if not tok:
            res[p["nome"]] = "sem token"
            continue
        req = urllib.request.Request(p["url"] + "/api/service/insights", data=json.dumps({"insights": insights}).encode("utf-8"), method="POST",
                                     headers={"Content-Type": "application/json", "Authorization": f"Bearer {tok}", "User-Agent": "KBSA-Homelab/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                b = json.loads(r.read().decode("utf-8"))
                res[p["nome"]] = f"{b.get('novos', 0)} novos, {b.get('repetidos', 0)} repetidos"
        except urllib.error.HTTPError as e:
            res[p["nome"]] = f"HTTP {e.code}"
        except Exception as e:  # portal desligado ou fora do ar: tenta de novo no próximo ciclo com os pendentes
            res[p["nome"]] = f"fora do ar ({type(e).__name__})"
    return res


def nota_vault(insights: list[dict]) -> Path:
    NOTAS.mkdir(parents=True, exist_ok=True)
    arq = NOTAS / f"{agora():%Y-%m-%d}.md"
    if not arq.exists():
        arq.write_text(f"---\ntipo: insights\nprojeto: {PROJETO}\nfonte: pesquisador do Portal de Afiliação (Claude coordena; pesquisa por Kimi/Big)\n---\n# Insights do portal · {agora():%d/%m/%Y}\n\n", encoding="utf-8")
    with arq.open("a", encoding="utf-8") as f:
        for i in insights:
            f.write(f"## {'🔴 ' if i.get('urgente') else ''}{i['titulo']}\n- Tema: {i['tema']} · tipo: {i.get('tipo', '?')} · para: {', '.join(i.get('aplicavel_em') or ['todos'])}\n"
                    f"- Impacto {i.get('impacto', '?')} · esforço {i.get('esforco', '?')} · confiança {i.get('confianca', '?')}\n- {i.get('resumo', '')}\n"
                    f"- **Ação:** {i.get('acao', '')}\n- Fonte: {i['fonte_url']} ({i.get('fonte_data', 's/ data')})\n- Recolhido em {iso()}\n\n")
    return arq


def plane(insights: list[dict], est: dict) -> int:
    fortes = [i for i in insights if i.get("urgente") or (int(i.get("impacto", 0)) >= CONFIG["plane_impacto"] and int(i.get("confianca", 0)) >= CONFIG["plane_confianca"])]
    if not fortes or SECO:
        return 0
    try:
        sys.path.insert(0, str(SCRIPTS))
        import html
        import plane_sync as ps  # noqa: E402
        p = ps.Plane(ps.ler_config())
        pid = (ler(REPO / "portal" / "orquestrador" / "estado" / "estado.json", {}).get("plane") or {}).get("projeto")
        if not pid:
            return 0
        estados = {s["name"]: s["id"] for s in p.todos(f"projects/{pid}/states/")}
        etiquetas = {e["name"]: e["id"] for e in p.todos(f"projects/{pid}/labels/")}
        if "insight" not in etiquetas:
            etiquetas["insight"] = p.req("POST", f"projects/{pid}/labels/", {"name": "insight", "color": "#0ca678"})["id"]
        n = 0
        for i in fortes:
            corpo = (f"<p><strong>Ação sugerida:</strong> {html.escape(str(i.get('acao', '')))}</p><p>{html.escape(str(i.get('resumo', '')))}</p>"
                     f"<p>Tema {html.escape(i['tema'])} · tipo {html.escape(str(i.get('tipo', '')))} · para {html.escape(', '.join(i.get('aplicavel_em') or ['todos']))} · impacto {i.get('impacto')} · esforço {i.get('esforco')} · confiança {i.get('confianca')}</p>"
                     f"<p>Fonte: <a href=\"{html.escape(i['fonte_url'])}\">{html.escape(i['fonte_url'])}</a> ({html.escape(str(i.get('fonte_data', '')))})</p>"
                     "<p><em>Sugestão do pesquisador de IA. Só vira tarefa do orquestrador depois da decisão do coordenador.</em></p>")
            p.req("POST", f"projects/{pid}/work-items/", {"name": f"💡 {str(i['titulo'])[:180]}", "description_html": corpo, "state": estados.get("Backlog"),
                                                          "labels": [etiquetas["insight"]], "priority": "urgent" if i.get("urgente") else "medium",
                                                          "external_source": "portal-pesquisador", "external_id": hash_insight(i)[:32]})
            n += 1
        return n
    except Exception as e:
        log("plane.erro", erro=repr(e)[:300])
        return 0


# ---------------------------------------------------------------- ciclo e comandos

def ciclo() -> int:
    trava = ESTADO_DIR / "ciclo.lock"
    ESTADO_DIR.mkdir(parents=True, exist_ok=True)
    if trava.exists() and time.time() - trava.stat().st_mtime < 15 * 60:
        log("ciclo.pulado", motivo="outro ciclo em andamento")
        return 0
    trava.write_text(str(os.getpid()))
    try:
        est = estado()
        novos = recolher(est)
        pendentes = est.get("pendentes_portal", []) + novos
        if pendentes:
            destinos = enviar_portais(pendentes)
            ok = any("novos" in v for v in destinos.values())
            est["pendentes_portal"] = [] if ok else pendentes[-200:]
            log("portais", **destinos, enviados=len(pendentes))
        if novos:
            nota = nota_vault(novos)
            cartoes = plane(novos, est)
            log("distribuido", insights=len(novos), nota=str(nota), plane=cartoes)
        if est.get("pausado") or SECO:
            log("ciclo.pausado" if not SECO else "ciclo.seco")
        else:
            espera = conferir_ordem(est)
            hoje = agora().strftime("%Y-%m-%d")
            if espera:
                log("ciclo.espera", motivo=espera)
            elif est["por_dia"].get(hoje, 0) >= CONFIG["max_por_dia"]:
                log("ciclo.limite_diario", limite=CONFIG["max_por_dia"])
            else:
                agente = CONFIG["reserva"] if est.pop("usar_reserva", False) else CONFIG["agente"]
                pedir(est, agente)
        est["ultimo_ciclo"] = iso()
        gravar(ESTADO, est)
        print(json.dumps({"novos": len(novos), "ordem": est.get("ordem")}, ensure_ascii=False))
        return 0
    except Exception as e:
        log("ciclo.erro", erro=repr(e)[:400])
        print(f"erro: {e!r}")
        return 1
    finally:
        trava.unlink(missing_ok=True)


def schtasks(*a: str) -> subprocess.CompletedProcess:
    return subprocess.run(["schtasks", *a], capture_output=True, text=True, encoding="mbcs", errors="replace", creationflags=SEM_JANELA)


def main(argv: list[str]) -> int:
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    cmd = argv[0] if argv else "status"
    if cmd == "ciclo":
        return ciclo()
    if cmd == "start":
        w = Path(sys.executable).with_name("pythonw.exe")
        r = schtasks("/Create", "/F", "/SC", "MINUTE", "/MO", "60", "/TN", TAREFA, "/TR", f'"{w if w.exists() else sys.executable}" -I "{Path(__file__).resolve()}" ciclo')
        print(f"{TAREFA}: {'registrada' if r.returncode == 0 else 'FALHOU'} {r.stdout.strip() or r.stderr.strip()}")
        est = estado()
        est["pausado"] = False
        gravar(ESTADO, est)
        return ciclo()
    if cmd == "stop":
        r = schtasks("/Delete", "/F", "/TN", TAREFA)
        print(f"{TAREFA}: {'removida' if r.returncode == 0 else 'não existia'}")
        return 0
    if cmd in ("pause", "resume"):
        est = estado()
        est["pausado"] = cmd == "pause"
        gravar(ESTADO, est)
        print("Pausado." if est["pausado"] else "Retomado.")
        return 0
    if cmd == "status":
        est = estado()
        temas = ler(TEMAS, {"temas": []})["temas"]
        r = schtasks("/Query", "/TN", TAREFA, "/FO", "LIST")
        prox = re.search(r"(Próxima execução|Next Run Time|Hora da pr.xima execu..o):\s*(.+)", r.stdout)
        print(f"Pesquisador: {'PAUSADO' if est.get('pausado') else 'ativo'} · agendador: {'registrado' if r.returncode == 0 else 'não registrado'}{' · próxima ' + prox.group(2).strip() if prox else ''}")
        print(f"Próximo tema: {temas[est['proximo'] % len(temas)]['titulo'] if temas else '-'} · ordem em aberto: {est.get('ordem') or 'nenhuma'}")
        print(f"Hoje: {est['por_dia'].get(agora().strftime('%Y-%m-%d'), 0)}/{CONFIG['max_por_dia']} pesquisas · totais: {est['totais']} · pendentes para os painéis: {len(est.get('pendentes_portal', []))}")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
