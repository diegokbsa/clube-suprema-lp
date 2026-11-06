"""Olheiros de ideias do projeto, com o filtro do Claude (pedido do Kbsa em 06/11/2026).

Três olheiros procuram o que pode mudar o jogo, inclusive o que deixamos passar batido:
  - sx-claude   frente SX (poker: sx.kbsa.app, clubes, agentes, jogadores, suprema.blog) — Claude (caixa do Big)
  - aff-codex   frente de afiliados (aff.kbsa.app: LPs, painel, CRM, conteúdo, atribuição) — Codex
  - aff-kimi    frente de afiliados, segundo olhar — Kimi (enquanto o Kbsa está no PC, o ordens.py manda para o Codex, que roda sem tela)
Cada um traz até 3 ideias por rodada (de 30 em 30 min, uma rodada por vez). O Claude julga todas (juiz) e separa:
  levar_ao_kbsa (pode mudar o jogo; vai para a decisão conjunta) · guardar (boa, sem urgência) · descartar (com o motivo).
Nada entra no projeto sozinho: a lista fica acumulada para o Kbsa decidir junto com o Claude quando ele perguntar.

  python -I portal/olheiro/olheiro.py ciclo     uma rodada (uso do agendador)
  python -I portal/olheiro/olheiro.py start     registra a tarefa "Portal - Olheiro (30 min)" e roda um ciclo
  python -I portal/olheiro/olheiro.py stop      remove a tarefa agendada
  python -I portal/olheiro/olheiro.py pause|resume
  python -I portal/olheiro/olheiro.py status
  python -I portal/olheiro/olheiro.py lista     mostra as ideias para levar ao Kbsa (ordem de nota)

Arquivos: estado/estado.json (rodadas), ideias.json (todas as ideias e vereditos), entrada/ (JSON que os agentes gravam),
nota no Obsidian 04-KNOWLEDGE/Ideias/Ideias-para-decidir.md (gerada a cada ciclo).
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

AQUI = Path(__file__).resolve().parent
REPO = AQUI.parent.parent
ESTADO_DIR = AQUI / "estado"
ESTADO = ESTADO_DIR / "estado.json"
LOG = ESTADO_DIR / "log.jsonl"
IDEIAS = AQUI / "ideias.json"
ENTRADA = AQUI / "entrada"
VAULT = Path(r"C:\Users\Administrator\Documents\Suprema-360")
SCRIPTS = VAULT / "00-SYSTEM" / "scripts"
ORDENS = SCRIPTS / "ordens.py"
NOTA = VAULT / "04-KNOWLEDGE" / "Ideias" / "Ideias-para-decidir.md"
TAREFA = "Portal - Olheiro (30 min)"
PROJETO = "lp-clube-suprema"
SEM_JANELA = getattr(subprocess, "CREATE_NO_WINDOW", 0)

OLHEIROS = {
    "sx-claude": {"caixa": "big", "area": "sx", "nome": "Olheiro SX (Claude)",
                  "foco": ("frente SX, só poker: sites de clube e de agente em sx.kbsa.app (25 modelos SX sobre 5 mundos visuais), jornada "
                           "do jogador até o primeiro PIX de fichas, recrutamento de agentes e donos de clube para o grupo, conteúdo e SEO de "
                           "poker, retenção de jogador, torneios, suprema.blog (Clube Suprema 10001)")},
    "aff-codex": {"caixa": "codex", "area": "aff", "nome": "Olheiro de afiliados (Codex)",
                  "foco": ("frente de afiliados em aff.kbsa.app, qualquer nicho: LPs e modelos, painel do dono e do afiliado, CRM, "
                           "atribuição e comissões, criativos, rotinas de IA para blog/Instagram/YouTube, conectar IA do afiliado por MCP, "
                           "integrações, o que concorrentes de plataformas de afiliação já fazem e nós não")},
    "aff-kimi": {"caixa": "kimi", "area": "aff", "nome": "Olheiro de afiliados (Kimi)",
                 "foco": ("frente de afiliados em aff.kbsa.app, com olhar de mercado e conteúdo: formatos que estão convertendo agora "
                          "(UGC, creators, vídeos curtos), programas de afiliados que crescem, o que falta no painel para o afiliado ganhar "
                          "mais, coisas que deixamos passar batido")},
}
CONFIG = {"intervalo_min": 30, "max_por_dia": 30, "pegar_em_min": 60, "travada_min": 150, "ideias_por_rodada": 3}


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


def cabecalho(md: str) -> dict:
    m = re.match(r"^---\n(.*?)\n---", md.replace("\r\n", "\n"), re.S)
    return dict((k.strip(), v.strip()) for k, _, v in (l.partition(":") for l in (m.group(1).splitlines() if m else [])) if k.strip())


def estado() -> dict:
    return ler(ESTADO, {"pausado": False, "olheiros": {}, "juiz": None, "por_dia": {}})


def banco() -> dict:
    return ler(IDEIAS, {"ideias": []})


def chave(i: dict) -> str:
    return hashlib.sha256(re.sub(r"\W+", " ", str(i.get("titulo", "")).lower()).strip().encode("utf-8")).hexdigest()[:16]


def nova_ordem(caixa: str, area: str, assunto: str, corpo: str, nome_corpo: str) -> str | None:
    arq = ESTADO_DIR / nome_corpo
    arq.write_text(corpo, encoding="utf-8")
    r = subprocess.run([sys.executable, str(ORDENS), "nova", caixa, assunto, "--projeto", PROJETO, "--de", "Claude (olheiro do Portal)",
                        "--arquivo", str(arq), "--area", area], capture_output=True, text=True, encoding="utf-8", errors="replace",
                       creationflags=SEM_JANELA, timeout=120)
    m = re.search(r"ORDEM CRIADA: (.+\.md)", r.stdout)
    if r.returncode or not m:
        log("ordem.falhou", caixa=caixa, saida=(r.stdout + r.stderr)[-300:])
        return None
    return m.group(1).strip()


def status_ordem(o: dict | None) -> tuple[str, float]:
    if not o:
        return "nenhuma", 0
    p = Path(o["arquivo"])
    st = cabecalho(p.read_text(encoding="utf-8")).get("status", "?") if p.exists() else "sumiu"
    return st, (agora() - datetime.fromisoformat(o["em"])).total_seconds() / 60


# ---------------------------------------------------------------- olheiros

def texto_olheiro(oid: str, cfg: dict, saida: Path, b: dict) -> str:
    ja = "\n".join(f"- {i['titulo']}" for i in b["ideias"][-60:]) or "- (nenhuma ainda)"
    return f"""# O que fazer

Você é o **{cfg['nome']}**. Procure as ideias que podem **mudar o jogo** do projeto, inclusive o que deixamos passar batido.
Foco: {cfg['foco']}.

O Kbsa pediu: "trazer o melhor possível". Exemplo do nível que ele quer: dentro do painel, um modelo de UGC em que escolhemos
3 influenciadores, criamos o conteúdo e deixamos 1 para cada rede social postar. Essa ideia já está guardada; não repita.

## Antes de propor
- Leia `{REPO / 'portal' / 'docs' / 'ARQUITETURA.md'}` e os títulos de `{REPO / 'portal' / 'orquestrador' / 'backlog.json'}` para saber o que já existe ou já está planejado.
- Pesquise na internet de verdade (o que o mercado e os concorrentes fazem agora, com link que você abriu). Ideia sem evidência perde nota.
- Não repita estas, que já foram trazidas:
{ja}

## Regras
- Português do Brasil. Não mexa em código, não envie mensagem, não publique, não crie conta: só pesquise e grave o arquivo.
- Não use a tela do computador (o Kbsa está usando): só ferramentas de busca e leitura web, sem mouse nem janela.
- Poker: nada de promessa de ganho, bônus ou fichas grátis; somente +18. Tudo dentro das regras da Meta e do Google.

## Entregável
Grave **exatamente** este JSON (UTF-8) em `{saida}` com de 1 a {CONFIG['ideias_por_rodada']} ideias, a melhor primeiro:

```json
{{"olheiro": "{oid}", "em": "AAAA-MM-DDTHH:MM-03:00", "ideias": [
  {{"titulo": "frase curta", "area": "{cfg['area']}", "problema": "que dor ou oportunidade existe hoje",
    "proposta": "o que fazer no sistema, concreto (tela, fluxo, automação)", "por_que_muda_o_jogo": "por que isso move receita, conversão ou retenção",
    "evidencia": ["https://..."], "impacto": 1, "esforco": 1, "risco": "o que pode dar errado (legal, conta, custo)"}}
]}}
```
impacto e esforço de 1 a 5.

# Critério de pronto

JSON válido gravado no caminho acima e esta ordem com `status: feita` e RESULTADO · VALIDAÇÃO · STATUS · PRÓXIMA AÇÃO escritos abaixo.
"""


def recolher(est: dict, b: dict) -> int:
    novos = 0
    for f in sorted(ENTRADA.glob("*.json")) if ENTRADA.exists() else []:
        d = ler(f, None)
        if not isinstance(d, dict) or not isinstance(d.get("ideias"), list):
            continue
        vistos = {i["id"] for i in b["ideias"]}
        for i in d["ideias"][:CONFIG["ideias_por_rodada"]]:
            if not isinstance(i, dict) or not str(i.get("titulo", "")).strip():
                continue
            i = {k: i.get(k) for k in ("titulo", "area", "problema", "proposta", "por_que_muda_o_jogo", "evidencia", "impacto", "esforco", "risco")}
            i["id"] = chave(i)
            if i["id"] in vistos:
                continue
            i.update({"olheiro": d.get("olheiro") or f.stem.split("_")[0], "trazida_em": iso(), "status": "a_julgar"})
            b["ideias"].append(i)
            vistos.add(i["id"])
            novos += 1
        f.rename(f.with_suffix(".lido"))
    return novos


def rodar_olheiros(est: dict, b: dict) -> None:
    hoje = agora().strftime("%Y-%m-%d")
    for oid, cfg in OLHEIROS.items():
        o = est["olheiros"].setdefault(oid, {"ordem": None, "ultima": None})
        st, idade = status_ordem(o["ordem"])
        if st in ("aberta", "em_andamento") and idade < CONFIG["travada_min"]:
            continue  # rodada anterior ainda trabalhando
        if o["ultima"] and agora() - datetime.fromisoformat(o["ultima"]) < timedelta(minutes=CONFIG["intervalo_min"] - 2):
            continue
        n = est["por_dia"].get(hoje, {}).get(oid, 0)
        if n >= CONFIG["max_por_dia"]:
            continue
        saida = ENTRADA / f"{oid}_{agora():%Y%m%d-%H%M}.json"
        ENTRADA.mkdir(parents=True, exist_ok=True)
        arq = nova_ordem(cfg["caixa"], cfg["area"], f"{cfg['nome']}: ideias que mudam o jogo", texto_olheiro(oid, cfg, saida, b), f"ordem-{oid}.md")
        if arq:
            o.update({"ordem": {"arquivo": arq, "em": iso(), "saida": str(saida)}, "ultima": iso()})
            est["por_dia"] = {hoje: {**est["por_dia"].get(hoje, {}), oid: n + 1}}
            log("olheiro.pedido", olheiro=oid, ordem=arq)


# ---------------------------------------------------------------- juiz (Claude)

def texto_juiz(lista: list[dict], saida: Path) -> str:
    itens = json.dumps(lista, ensure_ascii=False, indent=1)
    return f"""# O que fazer

Você é o **juiz** das ideias dos olheiros (Claude, coordenador). Julgue cada ideia abaixo com rigor, como sócio do Kbsa:
vale o tempo e o dinheiro? Muda o jogo (receita, conversão, retenção, vantagem difícil de copiar) ou é enfeite?
Confira o que já existe em `{REPO / 'portal' / 'docs' / 'ARQUITETURA.md'}` e no backlog `{REPO / 'portal' / 'orquestrador' / 'backlog.json'}`
(ideia que já existe ou já está planejada = descartar, dizendo onde está). Abra as evidências quando a nota depender delas.

Ideias:
```json
{itens}
```

Grave **exatamente** este JSON (UTF-8) em `{saida}`:
```json
{{"vereditos": [{{"id": "id da ideia", "veredito": "levar_ao_kbsa|guardar|descartar", "nota": 0, "muda_o_jogo": false,
  "motivo": "1 a 3 frases, direto", "primeiro_passo": "se for levar: o menor passo que prova a ideia"}}]}}
```
nota de 0 a 10. Só "levar_ao_kbsa" o que for de fato forte (nota 7+). Não implemente nada; não envie mensagem.

# Critério de pronto

JSON gravado, esta ordem com `status: feita` e RESULTADO · VALIDAÇÃO · STATUS · PRÓXIMA AÇÃO escritos abaixo.
"""


def rodar_juiz(est: dict, b: dict) -> None:
    j = est.get("juiz")
    if j:
        st, idade = status_ordem(j)
        v = ler(Path(j["saida"]), None)
        if isinstance(v, dict) and isinstance(v.get("vereditos"), list):
            por_id = {i["id"]: i for i in b["ideias"]}
            for x in v["vereditos"]:
                i = por_id.get(str(x.get("id")))
                if i and x.get("veredito") in ("levar_ao_kbsa", "guardar", "descartar"):
                    i.update({"status": x["veredito"], "nota": x.get("nota"), "muda_o_jogo": bool(x.get("muda_o_jogo")),
                              "motivo": x.get("motivo"), "primeiro_passo": x.get("primeiro_passo"), "julgada_em": iso()})
            Path(j["saida"]).rename(Path(j["saida"]).with_suffix(".lido"))
            log("juiz.vereditos", n=len(v["vereditos"]))
            est["juiz"] = None
        elif st in ("aberta", "em_andamento") and idade < CONFIG["travada_min"]:
            return
        else:
            log("juiz.sem_resultado", status=st)
            est["juiz"] = None
    a_julgar = [i for i in b["ideias"] if i["status"] == "a_julgar"]
    if not a_julgar or est.get("juiz"):
        return
    lote = [{k: i.get(k) for k in ("id", "titulo", "area", "olheiro", "problema", "proposta", "por_que_muda_o_jogo", "evidencia", "impacto", "esforco", "risco")}
            for i in a_julgar[:12]]
    saida = ENTRADA.parent / "estado" / f"juiz_{agora():%Y%m%d-%H%M}.json"
    arq = nova_ordem("big", "sx", "Juiz das ideias dos olheiros", texto_juiz(lote, saida), "ordem-juiz.md")
    if arq:
        est["juiz"] = {"arquivo": arq, "em": iso(), "saida": str(saida)}
        log("juiz.pedido", ideias=len(lote))


# ---------------------------------------------------------------- nota para o Kbsa

def nota_vault(b: dict) -> None:
    rot = {"aprovada_kbsa": "Aprovadas pelo Kbsa (em construção)", "levar_ao_kbsa": "Para decidir com o Kbsa", "guardar": "Guardadas (boas, sem urgência)",
           "a_julgar": "Aguardando o juiz", "guardada_kbsa": "Lista do Kbsa: guardadas para depois", "descartar": "Descartadas pelo juiz"}
    md = ["---", "type: ideias", "gerado_por: portal/olheiro/olheiro.py", f"atualizado: {iso()}", "---",
          "# Ideias para decidir (olheiros + filtro do Claude)", "",
          "Nota gerada a cada 30 min. Não edite à mão: as decisões do Kbsa ficam em `portal/olheiro/ideias.json`.", ""]
    for s in ("aprovada_kbsa", "levar_ao_kbsa", "guardada_kbsa", "guardar", "a_julgar", "descartar"):
        grupo = sorted((i for i in b["ideias"] if i["status"] == s), key=lambda i: -(i.get("nota") or 0))
        if not grupo:
            continue
        md += [f"## {rot[s]} ({len(grupo)})", ""]
        for i in grupo:
            md.append(f"### {'🔥 ' if i.get('muda_o_jogo') else ''}{i['titulo']}")
            md.append(f"- Frente: {i.get('area')} · olheiro: {i.get('olheiro')} · nota: {i.get('nota', '—')} · impacto {i.get('impacto')} / esforço {i.get('esforco')}")
            for k, r in (("proposta", "Proposta"), ("por_que_muda_o_jogo", "Por que muda o jogo"), ("motivo", "Juiz"), ("primeiro_passo", "Primeiro passo"), ("risco", "Risco")):
                if i.get(k):
                    md.append(f"- {r}: {i[k]}")
            if i.get("evidencia"):
                md.append(f"- Evidência: {', '.join(i['evidencia'][:3]) if isinstance(i['evidencia'], list) else i['evidencia']}")
            md.append("")
    NOTA.parent.mkdir(parents=True, exist_ok=True)
    NOTA.write_text("\n".join(md), encoding="utf-8")


# ---------------------------------------------------------------- ciclo e comandos

def ciclo() -> int:
    ESTADO_DIR.mkdir(parents=True, exist_ok=True)
    trava = ESTADO_DIR / "ciclo.lock"
    if trava.exists() and time.time() - trava.stat().st_mtime < 15 * 60:
        log("ciclo.pulado")
        return 0
    trava.write_text(str(os.getpid()))
    try:
        est, b = estado(), banco()
        novos = recolher(est, b)
        if not est.get("pausado"):
            rodar_juiz(est, b)
            rodar_olheiros(est, b)
        gravar(IDEIAS, b)
        nota_vault(b)
        est["ultimo_ciclo"] = iso()
        gravar(ESTADO, est)
        print(json.dumps({"novas": novos, "total": len(b["ideias"]), "para_o_kbsa": sum(1 for i in b["ideias"] if i["status"] == "levar_ao_kbsa")}, ensure_ascii=False))
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
        r = schtasks("/Create", "/F", "/SC", "MINUTE", "/MO", str(CONFIG["intervalo_min"]), "/TN", TAREFA, "/TR",
                     f'"{w if w.exists() else sys.executable}" -I "{Path(__file__).resolve()}" ciclo')
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
    if cmd == "lista":
        for i in sorted((i for i in banco()["ideias"] if i["status"] in ("guardada_kbsa", "levar_ao_kbsa")), key=lambda i: -(i.get("nota") or 0)):
            print(f"[{i['status']}] {i.get('nota', '—')} · {i['titulo']} ({i.get('area')}, {i.get('olheiro')})")
        return 0
    if cmd == "status":
        est, b = estado(), banco()
        r = schtasks("/Query", "/TN", TAREFA, "/FO", "LIST")
        cont = {}
        for i in b["ideias"]:
            cont[i["status"]] = cont.get(i["status"], 0) + 1
        print(f"Olheiro: {'PAUSADO' if est.get('pausado') else 'ativo'} · agendador: {'registrado' if r.returncode == 0 else 'não registrado'}")
        print(f"Ideias: {cont} · juiz: {est.get('juiz') or 'livre'}")
        for oid, o in est.get("olheiros", {}).items():
            print(f"  {oid}: {status_ordem(o.get('ordem'))[0]} · última {o.get('ultima')}")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
