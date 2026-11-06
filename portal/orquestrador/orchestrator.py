"""Orquestrador do Portal de Afiliação: fila persistente, ordens reais aos agentes, Plane e relatório de hora em hora.

  orchestrator.py start            registra as tarefas agendadas do Windows (ciclo a cada 30 min, relatório a cada hora) e roda um ciclo
  orchestrator.py stop             remove as tarefas agendadas (a fila e o histórico ficam)
  orchestrator.py pause | resume   pausa/retoma os ciclos sem mexer no agendador (pausado, o ciclo só registra e sai)
  orchestrator.py status           estado da fila, ordens em andamento, bloqueios e agendador
  orchestrator.py dispatch         roda um ciclo agora (o mesmo que o agendador chama)
  orchestrator.py report           gera o relatório (portal/relatorios/) e comenta no Plane
  orchestrator.py retry PA-XXX     devolve uma tarefa bloqueada para "pronta" (zera o atraso de nova tentativa)
  orchestrator.py ciclo            (uso do agendador) igual a dispatch
  orchestrator.py review PA-XXX ok|volta "nota"   resultado da revisão do coordenador: concluída ou de volta para pronta

Agentes (Kbsa, 06/11/2026): "area": "sx" (poker) vai para o Claude, até 4 ao mesmo tempo; "area": "aff" (afiliados, padrão)
vai para o Codex ou o Kimi conforme "agente". Até LIMITES["paralelo"] tarefas em execução. Limite diário em LIMITES.
O que o agente entrega vai para "em_revisao": só o coordenador marca "concluida" (comando review), nunca o agente.
"""
from __future__ import annotations

import json
import os
import re
import shutil
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
TRAVA = ESTADO_DIR / "ciclo.lock"
RELATORIOS = REPO / "portal" / "relatorios"
BACKLOG = AQUI / "backlog.json"
VAULT = Path(r"C:\Users\Administrator\Documents\Suprema-360")
ORDENS = VAULT / "00-SYSTEM" / "scripts" / "ordens.py"
SCRIPTS = VAULT / "00-SYSTEM" / "scripts"
WT_BASE = Path(r"C:\Users\Administrator\Desktop\portal-wt")
PROJETO = "lp-clube-suprema"
TAREFA_CICLO = "Portal - Orquestrador (30 min)"
TAREFA_RELATORIO = "Portal - Relatorio (1 h)"
SEM_JANELA = getattr(subprocess, "CREATE_NO_WINDOW", 0)

LIMITES = {
    "ordens_por_dia": 30,          # teto de ordens novas por dia (custo/uso dos agentes); Kbsa subiu de 10 para 30 em 05/11/2026
    "ordens_por_ciclo": 4,         # 4 Claudes em paralelo (Kbsa, 06/11/2026)
    "paralelo": 4,                 # tarefas em execução ao mesmo tempo (igual a FAIXAS_CLAUDE do ordens.py)
    "tentativas": 3,               # tentativas por tarefa antes de ficar bloqueada de vez
    "atraso_min": [30, 90, 240],   # espera antes da 2ª, 3ª e 4ª tentativa (backoff)
    "travada_horas": 5,            # ordem em andamento há mais que isso = travada
    "trava_ciclo_min": 25,         # trava de ciclo mais velha que isso é considerada abandonada
}
# Kbsa, 06/11/2026: duas frentes. "area": "sx" = poker (sx.kbsa.app, modelos SX, suprema.blog) -> 100% Claude (caixa do Big,
# até 4 em paralelo). "area": "aff" = afiliados (aff.kbsa.app: LPs, sistema, CRM etc.) -> Codex e Kimi (o ordens.py manda o Kimi
# para o Codex enquanto o Kbsa está no PC). Tarefa sem "area" é "aff".
DESPACHA = {"claude": "big", "claude-design": "big", "codex": "codex", "kimi": "kimi"}  # agente da tarefa → caixa do ordens.py
PRIORIDADE = {"alta": 0, "media": 1, "baixa": 2}
ESTADOS = ["backlog", "pronta", "em_execucao", "em_revisao", "bloqueada", "concluida"]
SEGREDO = re.compile(r"(?i)(token|senha|password|secret|api[_-]?key|authorization)[\"'\s:=]+[^\s\"',}]{6,}")


# ---------------------------------------------------------------- utilidades

def agora() -> datetime:
    return datetime.now().astimezone()


def iso(d: datetime | None = None) -> str:
    return (d or agora()).isoformat(timespec="seconds")


def limpa(texto: str) -> str:
    """Nunca deixa token/senha ir para log ou relatório."""
    return SEGREDO.sub(lambda m: m.group(1) + "=***", str(texto))


def log(evento: str, **dados) -> None:
    ESTADO_DIR.mkdir(parents=True, exist_ok=True)
    linha = {"em": iso(), "evento": evento, **{k: limpa(v) if isinstance(v, str) else v for k, v in dados.items()}}
    with LOG.open("a", encoding="utf-8") as f:
        f.write(json.dumps(linha, ensure_ascii=False) + "\n")


def ler_json(p: Path, padrao):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return padrao


def gravar_json(p: Path, dados) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, p)  # troca atômica: um reinício no meio não corrompe o estado


def carregar() -> tuple[dict, dict]:
    backlog = ler_json(BACKLOG, {"tarefas": []})
    estado = ler_json(ESTADO, {"pausado": False, "tarefas": {}, "ordens_hoje": {}, "ciclos": 0, "ultimo_relatorio": None})
    for t in backlog["tarefas"]:
        s = estado["tarefas"].setdefault(t["id"], {"status": t["status"], "tentativas": 0, "historico": []})
        s.setdefault("historico", [])
        if t.get("bloqueio") and s["status"] == "bloqueada" and not s.get("bloqueio"):
            s["bloqueio"] = t["bloqueio"]
        if t["status"] == "concluida" and s["status"] != "concluida":
            s["status"] = "concluida"
    return backlog, estado


def mudar(estado: dict, tid: str, novo: str, motivo: str, **extra) -> None:
    s = estado["tarefas"][tid]
    if s["status"] == novo and not extra:
        return
    s["historico"].append({"em": iso(), "de": s["status"], "para": novo, "motivo": motivo})
    s["historico"] = s["historico"][-30:]
    s["status"] = novo
    s["atualizada"] = iso()
    s.update(extra)
    log("tarefa.estado", tarefa=tid, para=novo, motivo=motivo)


def cabecalho(md: str) -> dict:
    m = re.match(r"^---\n(.*?)\n---", md.replace("\r\n", "\n"), re.S)
    out = {}
    for linha in (m.group(1).splitlines() if m else []):
        if ":" in linha:
            k, _, v = linha.partition(":")
            out[k.strip()] = v.strip()
    return out


# ---------------------------------------------------------------- trava de ciclo

def travar() -> bool:
    ESTADO_DIR.mkdir(parents=True, exist_ok=True)
    if TRAVA.exists():
        idade = (time.time() - TRAVA.stat().st_mtime) / 60
        if idade < LIMITES["trava_ciclo_min"]:
            return False
        log("trava.abandonada", idade_min=round(idade, 1))
        TRAVA.unlink(missing_ok=True)
    try:
        fd = os.open(TRAVA, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, f"{os.getpid()} {iso()}".encode())
        os.close(fd)
        return True
    except FileExistsError:
        return False


def soltar() -> None:
    TRAVA.unlink(missing_ok=True)


# ---------------------------------------------------------------- ordens

def texto_ordem(t: dict, estado: dict) -> str:
    s = estado["tarefas"][t["id"]]
    wt = WT_BASE / t["id"]
    branch = f"portal/{t['id']}"
    nota_volta = s.get("nota_revisao")
    return f"""# O que fazer

**Tarefa {t['id']} · {t['titulo']}** ({t['epico']}) · prioridade {t['prioridade']} · estimativa {t['estimativa']} · tentativa {s['tentativas'] + 1} de {LIMITES['tentativas']}

**Objetivo:** {t['objetivo']}

{f'**Volta da revisão do coordenador:** {nota_volta}' if nota_volta else ''}

## Contexto
- Projeto: Portal de Afiliação (multi-tenant), repo `{REPO}`, branch base `portal-afiliacao`.
- Leia antes: `{REPO / 'portal' / 'docs' / 'ARQUITETURA.md'}` (contrato: módulos, blocos, modelos, regras que não se quebram).
- Dependências já concluídas: {', '.join(t['deps']) or 'nenhuma'}.

## Onde trabalhar (obrigatório)
```
git -C "{REPO}" worktree add -b {branch} "{wt}" portal-afiliacao
```
(se já existir, só entre em `{wt}` e continue). Trabalhe SÓ nesta pasta. Commits pequenos em português na branch `{branch}`.

## Escopo (só estes arquivos)
{chr(10).join(f'- `{e}`' for e in t['escopo'])}

Fora do escopo: não edite `portal/server.mjs`, `portal/lib/core.mjs`, `portal/lib/repo.mjs`, `portal/lib/auth.mjs` nem arquivos de outras tarefas.
Precisa de mudança neles? Descreva no RESULTADO e o coordenador faz.

## Entregáveis
{chr(10).join(f'- {e}' for e in t['entregaveis'])}

## Critérios de aceite
{chr(10).join(f'- [ ] {a}' for a in t['aceite'])}

## Validação exigida
Rode na pasta `{wt}`: `{t['validacao']}` (e `npm run portal:test`). Cole o resumo da saída no RESULTADO.

## Regras desta ordem
- Não faça commit nem push no `main`; não faça push de nada; não publique, não envie mensagem, não gaste dinheiro, não crie conta.
- Nada de segredo em arquivo, log ou commit. Integração sem credencial fica "pendente de configuração".
- Português do Brasil em tudo (textos, erros, commits).
- Sem dependências npm novas.
- Não use a tela do computador (o Kbsa está usando): nada de controle de mouse/teclado nem janela na frente. Para ver ou fotografar páginas, use navegador sem tela (Edge/Chrome `--headless=new`, como `portal/tools/fotos.mjs`).

## Evidências
Escreva abaixo: RESULTADO (o que fez, arquivos), VALIDAÇÃO (comando + resumo da saída), BRANCH/COMMIT, STATUS e PRÓXIMA AÇÃO.
Registre também: `python "{SCRIPTS / 'memoria.py'}" registrar --agente <você> --projeto {PROJETO} --resumo "{t['id']}: ..."`.
Depois troque o cabeçalho para `status: feita` (ou `status: bloqueada` com o motivo).

# Critério de pronto

Todos os critérios de aceite marcados, validação passando no worktree `{wt}`, commit na branch `{branch}`, evidências escritas acima e `status: feita`.
O coordenador revisa antes de dar como concluída.
"""


def criar_ordem(t: dict, estado: dict) -> Path | None:
    area = t.get("area", "aff")
    caixa = "big" if area == "sx" else DESPACHA[t["agente"]]
    arq = ESTADO_DIR / f"ordem-{t['id']}.md"
    arq.write_text(texto_ordem(t, estado), encoding="utf-8")
    cmd = [sys.executable, str(ORDENS), "nova", caixa, f"{t['id']} {t['titulo']}", "--projeto", PROJETO,
           "--de", "Claude (orquestrador do Portal de Afiliação)", "--arquivo", str(arq), "--area", area]
    if t["prioridade"] == "alta":
        cmd += ["--prioridade", "alta"]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", creationflags=SEM_JANELA, timeout=120)
    m = re.search(r"ORDEM CRIADA: (.+\.md)", r.stdout)
    if r.returncode != 0 or not m:
        log("ordem.falhou", tarefa=t["id"], agente=t["agente"], codigo=r.returncode, saida=(r.stdout + r.stderr)[-400:])
        return None
    log("ordem.criada", tarefa=t["id"], agente=t["agente"], caixa=caixa, ordem=m.group(1).strip(), saida=r.stdout.strip()[-200:])
    return Path(m.group(1).strip())


def criar_ordem_revisao(t: dict, estado: dict) -> Path | None:
    s = estado["tarefas"][t["id"]]
    wt = WT_BASE / t["id"]
    branch = f"portal/{t['id']}"
    me = Path(__file__).resolve()
    aceite = "\n".join(f"   - {a}" for a in t["aceite"])
    validou = "passou" if (s.get("ultima_validacao") or {}).get("ok") else "não rodou ou falhou"
    texto = f"""# O que fazer

Revisar a entrega **{t['id']} · {t['titulo']}** feita por **{t['agente']}** e decidir: aceitar (merge) ou devolver com nota.
Você é o coordenador técnico do Portal de Afiliação. Não aceite só porque o agente marcou como feita.

- Ordem original e evidências do agente: `{s.get('ordem')}`
- Branch: `{branch}` · worktree: `{wt}` · base: `portal-afiliacao` em `{REPO}`
- Contrato: `{REPO / 'portal' / 'docs' / 'ARQUITETURA.md'}`
- Validação automática do orquestrador: {validou}

## Passos
1. `git -C "{REPO}" diff portal-afiliacao...{branch} --stat` e leia o diff inteiro.
2. Confira cada critério de aceite:
{aceite}
3. Confira as regras do contrato: tenant_id + repo com escopo, perm em toda rota, nenhum segredo exposto, estado real (pendente quando não configurado),
   nada fora do escopo ({', '.join(t['escopo'])}), português, sem dependência nova.
4. No worktree: `node --test "portal/test/*.test.mjs"` e `node portal/tools/validar-modelos.mjs`.
5. Se tudo certo: `git -C "{REPO}" merge --no-ff {branch} -m "Merge {t['id']}: {t['titulo']}"`, rode os testes de novo em `{REPO}` e então
   `python -I "{me}" review {t['id']} ok "resumo da revisão"`.
   Se não: `python -I "{me}" review {t['id']} volta "o que falta, objetivo"` (a tarefa volta para o agente com a sua nota).

## Regras
Nunca mexa no `main`, nunca faça push, não publique nada, não gaste dinheiro. Conflito de merge que você não consiga resolver com segurança: aborte o merge e devolva com nota.

# Critério de pronto

Decisão tomada pelo comando review (ok ou volta), evidências escritas abaixo (RESULTADO · VALIDAÇÃO · STATUS · PRÓXIMA AÇÃO) e `status: feita`.
"""
    arq = ESTADO_DIR / f"revisao-{t['id']}.md"
    arq.write_text(texto, encoding="utf-8")
    cmd = [sys.executable, str(ORDENS), "nova", "big", f"Revisar {t['id']} {t['titulo']}", "--projeto", PROJETO,
           "--de", "Claude (orquestrador do Portal de Afiliação)", "--arquivo", str(arq)]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", creationflags=SEM_JANELA, timeout=120)
    m = re.search(r"ORDEM CRIADA: (.+\.md)", r.stdout)
    if r.returncode != 0 or not m:
        log("revisao.falhou", tarefa=t["id"], codigo=r.returncode, saida=(r.stdout + r.stderr)[-300:])
        return None
    log("revisao.criada", tarefa=t["id"], ordem=m.group(1).strip())
    return Path(m.group(1).strip())


def validar_entrega(t: dict) -> tuple[bool, str]:
    """Roda a validação da tarefa no worktree dela (ou no repo, se a tarefa não usou worktree)."""
    pasta = WT_BASE / t["id"]
    if not pasta.exists():
        pasta = REPO
    cmd = t["validacao"].replace("npm run portal:test", 'node --test "portal/test/*.test.mjs"')
    if cmd.startswith("test -f "):
        alvo = pasta / cmd[len("test -f "):].strip()
        return alvo.exists(), f"{alvo} {'existe' if alvo.exists() else 'não existe'}"
    if cmd.startswith("curl "):
        return False, "validação externa: o coordenador confere à mão"
    try:
        r = subprocess.run(cmd, shell=True, cwd=pasta, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=600, creationflags=SEM_JANELA)
    except subprocess.TimeoutExpired:
        return False, "validação passou de 10 minutos"
    saida = (r.stdout + r.stderr)
    resumo = "\n".join(l for l in saida.splitlines() if re.search(r"^ℹ (tests|pass|fail)|✗|✓ Todos|modelo\(s\) com problema|não ok|not ok", l))[-800:]
    return r.returncode == 0, resumo or saida[-600:]


# ---------------------------------------------------------------- ciclo

def ciclo(origem: str = "agendador") -> int:
    if not travar():
        log("ciclo.pulado", motivo="outro ciclo em andamento", origem=origem)
        print("Outro ciclo está rodando; este foi pulado.")
        return 0
    try:
        backlog, estado = carregar()
        estado["ciclos"] = estado.get("ciclos", 0) + 1
        if estado.get("pausado"):
            log("ciclo.pausado", origem=origem)
            gravar_json(ESTADO, estado)
            print("Orquestrador pausado: nada despachado.")
            return 0
        tarefas = {t["id"]: t for t in backlog["tarefas"]}
        resumo = {"conferidas": 0, "em_revisao": [], "bloqueadas": [], "promovidas": [], "despachadas": [], "falhas": []}

        # 1. ordens em andamento: feita → validar → em_revisao ; bloqueada → nova tentativa com atraso ; travada → bloqueada
        for tid, s in estado["tarefas"].items():
            if s["status"] != "em_execucao" or not s.get("ordem"):
                continue
            resumo["conferidas"] += 1
            p = Path(s["ordem"])
            cab = cabecalho(p.read_text(encoding="utf-8")) if p.exists() else {"status": "sumiu"}
            st = cab.get("status", "?")
            t = tarefas.get(tid)
            if st == "feita" and t:
                ok, saida = validar_entrega(t)
                s["ultima_validacao"] = {"em": iso(), "ok": ok, "saida": limpa(saida)}
                if ok:
                    mudar(estado, tid, "em_revisao", "agente entregou e a validação passou; aguarda revisão do coordenador")
                    resumo["em_revisao"].append(tid)
                else:
                    reabrir(estado, t, f"entregue, mas a validação falhou: {saida[-200:]}", resumo)
            elif st in ("bloqueada", "sumiu") and t:
                reabrir(estado, t, f"ordem {st}: {cab.get('motivo', 'ver log da ordem')}", resumo)
            elif st in ("aberta", "em_andamento"):
                inicio = datetime.fromisoformat(s.get("despachada") or iso())
                if agora() - inicio > timedelta(hours=LIMITES["travada_horas"]):
                    mudar(estado, tid, "bloqueada", f"ordem {st} há mais de {LIMITES['travada_horas']} h (travada)", bloqueio="travada; conferir log do agente")
                    resumo["bloqueadas"].append(tid)

        # 2. bloqueadas com nova tentativa vencida → pronta
        for tid, s in estado["tarefas"].items():
            if s["status"] == "bloqueada" and s.get("tentar_em") and datetime.fromisoformat(s["tentar_em"]) <= agora():
                mudar(estado, tid, "pronta", "nova tentativa (backoff vencido)", tentar_em=None)

        # 3. backlog com dependências concluídas → pronta
        for t in backlog["tarefas"]:
            s = estado["tarefas"][t["id"]]
            if s["status"] == "backlog" and all(estado["tarefas"].get(d, {}).get("status") == "concluida" for d in t["deps"]):
                mudar(estado, t["id"], "pronta", "dependências concluídas")
                resumo["promovidas"].append(t["id"])

        # 4. despacho: até LIMITES["paralelo"] tarefas em execução ao mesmo tempo (todas com o Claude), dentro do limite diário
        hoje = agora().strftime("%Y-%m-%d")
        estado["ordens_hoje"] = {hoje: estado.get("ordens_hoje", {}).get(hoje, 0)}
        rodando = sum(1 for tid, s in estado["tarefas"].items() if s["status"] == "em_execucao" and tid in tarefas)
        prontas = sorted((t for t in backlog["tarefas"] if estado["tarefas"][t["id"]]["status"] == "pronta" and t["agente"] in DESPACHA),
                         key=lambda t: (PRIORIDADE.get(t["prioridade"], 9), t["id"]))
        for t in prontas:
            if len(resumo["despachadas"]) >= LIMITES["ordens_por_ciclo"] or estado["ordens_hoje"][hoje] >= LIMITES["ordens_por_dia"]:
                break
            if rodando >= LIMITES["paralelo"]:
                break
            ordem = criar_ordem(t, estado)
            if not ordem:
                resumo["falhas"].append(t["id"])
                continue
            estado["ordens_hoje"][hoje] += 1
            rodando += 1
            mudar(estado, t["id"], "em_execucao", f"ordem enviada para {t['agente']}", ordem=str(ordem), despachada=iso())
            resumo["despachadas"].append(t["id"])

        # 5. revisão: entrega validada vai para o Big (Claude) revisar e fazer o merge; ele responde com o comando review
        resumo["revisoes"] = []
        for tid, s in estado["tarefas"].items():
            if s["status"] != "em_revisao" or s.get("ordem_revisao") or tid not in tarefas:
                continue
            if estado["ordens_hoje"][hoje] >= LIMITES["ordens_por_dia"]:
                break
            ordem = criar_ordem_revisao(tarefas[tid], estado)
            if ordem:
                estado["ordens_hoje"][hoje] += 1
                s["ordem_revisao"] = str(ordem)
                resumo["revisoes"].append(tid)

        estado["ultimo_ciclo"] = {"em": iso(), "origem": origem, **resumo}
        gravar_json(ESTADO, estado)
        log("ciclo.fim", origem=origem, **{k: v for k, v in resumo.items()})
        sincronizar_plane(backlog, estado)
        print(json.dumps(resumo, ensure_ascii=False))
        return 0
    except Exception as e:  # o ciclo nunca pode deixar a trava presa
        log("ciclo.erro", erro=repr(e))
        print(f"erro no ciclo: {e!r}")
        return 1
    finally:
        soltar()


def reabrir(estado: dict, t: dict, motivo: str, resumo: dict) -> None:
    s = estado["tarefas"][t["id"]]
    s["tentativas"] = s.get("tentativas", 0) + 1
    if s["tentativas"] >= LIMITES["tentativas"]:
        mudar(estado, t["id"], "bloqueada", f"{motivo} · sem tentativas restantes", bloqueio=motivo, tentar_em=None)
    else:
        espera = LIMITES["atraso_min"][min(s["tentativas"] - 1, len(LIMITES["atraso_min"]) - 1)]
        mudar(estado, t["id"], "bloqueada", f"{motivo} · nova tentativa em {espera} min", bloqueio=motivo, tentar_em=iso(agora() + timedelta(minutes=espera)))
    resumo["bloqueadas"].append(t["id"])


# ---------------------------------------------------------------- Plane

COLUNAS = [("Backlog", "#85847e", "backlog"), ("Pronta", "#2a78d6", "unstarted"), ("Em execução", "#6250d6", "started"),
           ("Em revisão", "#0ca678", "started"), ("Bloqueada", "#e8590c", "started"), ("Concluída", "#1baf7a", "completed")]
COLUNA_DE = dict(zip(ESTADOS, [c[0] for c in COLUNAS]))
CORES_AGENTE = {"claude": "#d9480f", "claude-design": "#e64980", "codex": "#1c7ed6", "kimi": "#7048e8"}


def plane():
    sys.path.insert(0, str(SCRIPTS))
    import plane_sync as ps  # noqa: E402  (cliente oficial do vault; chave fica em C:\AgentSetup\secrets\plane.env)
    cfg = ps.ler_config()
    if not cfg.get("PLANE_API_KEY") or not cfg.get("PLANE_WORKSPACE"):
        return None, None
    return ps.Plane(cfg), cfg


def descricao_html(t: dict, s: dict) -> str:
    import html
    li = lambda xs: "".join(f"<li>{html.escape(x)}</li>" for x in xs)  # noqa: E731
    val = s.get("ultima_validacao") or {}
    return (f"<p><strong>{html.escape(t['epico'])}</strong> · responsável: {html.escape(t['agente'])} · prioridade {html.escape(t['prioridade'])} · estimativa {html.escape(t['estimativa'])}</p>"
            f"<p>{html.escape(t['objetivo'])}</p><p><strong>Dependências:</strong> {html.escape(', '.join(t['deps']) or 'nenhuma')}</p>"
            f"<p><strong>Critérios de aceite</strong></p><ul>{li(t['aceite'])}</ul><p><strong>Entregáveis</strong></p><ul>{li(t['entregaveis'])}</ul>"
            f"<p><strong>Validação:</strong> <code>{html.escape(t['validacao'])}</code></p>"
            f"<p><strong>Branch:</strong> portal/{html.escape(t['id'])} · <strong>Ordem:</strong> {html.escape(s.get('ordem') or '—')}</p>"
            + (f"<p><strong>Bloqueio:</strong> {html.escape(s.get('bloqueio') or '')}</p>" if s['status'] == 'bloqueada' else "")
            + (f"<p><strong>Última validação</strong> ({html.escape(val.get('em', ''))}): {'passou' if val.get('ok') else 'falhou'}</p><pre>{html.escape(val.get('saida', ''))[:1500]}</pre>" if val else "")
            + f"<p><em>Atualizado pelo orquestrador em {iso()}.</em></p>")


def sincronizar_plane(backlog: dict, estado: dict) -> None:
    try:
        p, _ = plane()
        if not p:
            log("plane.sem_config")
            return
        meta = estado.setdefault("plane", {})
        if not meta.get("projeto"):
            existente = next((x for x in p.todos("projects/") if (x.get("identifier") or "").upper() == "PORTAL"), None)
            proj = existente or p.req("POST", "projects/", {"name": "Portal de Afiliação", "identifier": "PORTAL", "module_view": True,
                                                            "description": "Hub multi-tenant de afiliação: painel, construtor, CRM, afiliados, criativos e integrações. Coordenado pelo Claude."})
            meta["projeto"] = proj["id"]
        pid = meta["projeto"]
        estados = {s["name"]: s for s in p.todos(f"projects/{pid}/states/")}
        for i, (nome, cor, grupo) in enumerate(COLUNAS):
            if nome not in estados:
                estados[nome] = p.req("POST", f"projects/{pid}/states/", {"name": nome, "color": cor, "group": grupo, "sequence": 15000 + i * 10000})
        etiquetas = {e["name"]: e for e in p.todos(f"projects/{pid}/labels/")}
        for nome in {t["agente"] for t in backlog["tarefas"]} | {t["epico"] for t in backlog["tarefas"]}:
            if nome not in etiquetas:
                etiquetas[nome] = p.req("POST", f"projects/{pid}/labels/", {"name": nome, "color": CORES_AGENTE.get(nome, "#868e96")})
        itens = meta.setdefault("itens", {})
        hashes = meta.setdefault("hashes", {})
        prio = {"alta": "high", "media": "medium", "baixa": "low"}
        for t in backlog["tarefas"]:
            s = estado["tarefas"][t["id"]]
            corpo = {"name": f"{t['id']} · {t['titulo']}", "description_html": descricao_html(t, s), "state": estados[COLUNA_DE[s['status']]]["id"],
                     "priority": prio.get(t["prioridade"], "none"), "labels": [etiquetas[t["agente"]]["id"], etiquetas[t["epico"]]["id"]]}
            h = json.dumps({k: v for k, v in corpo.items() if k != "description_html"} | {"st": s["status"], "v": s.get("ultima_validacao"), "b": s.get("bloqueio"), "o": s.get("ordem")}, sort_keys=True, ensure_ascii=False)
            if t["id"] in itens and hashes.get(t["id"]) == h:
                continue
            if t["id"] in itens:
                p.req("PATCH", f"projects/{pid}/work-items/{itens[t['id']]}/", corpo)
            else:
                w = p.req("POST", f"projects/{pid}/work-items/", corpo | {"external_source": "portal-orquestrador", "external_id": t["id"]})
                itens[t["id"]] = w["id"]
            hashes[t["id"]] = h
        gravar_json(ESTADO, estado)
        log("plane.sincronizado", itens=len(itens))
    except Exception as e:
        log("plane.erro", erro=repr(e)[:400])


# ---------------------------------------------------------------- relatório

def ou_nada(linhas: list[str], vazio: str = "- nenhuma") -> list[str]:
    return linhas or [vazio]


def relatorio() -> Path:
    backlog, estado = carregar()
    tarefas = {t["id"]: t for t in backlog["tarefas"]}
    por = {k: [tid for tid, s in estado["tarefas"].items() if s["status"] == k and tid in tarefas] for k in ESTADOS}
    ok, saida = True, ""
    try:
        r = subprocess.run('node --test "portal/test/*.test.mjs"', shell=True, cwd=REPO, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300, creationflags=SEM_JANELA)
        ok = r.returncode == 0
        saida = "\n".join(l for l in (r.stdout + r.stderr).splitlines() if l.startswith("ℹ ") and any(w in l for w in ("tests", "pass", "fail")))
    except subprocess.TimeoutExpired:
        ok, saida = False, "testes passaram de 5 minutos"
    hoje = agora().strftime("%Y-%m-%d")
    linha = lambda tid: f"- **{tid}** {tarefas[tid]['titulo']} · {tarefas[tid]['agente']}"  # noqa: E731
    criterios = sum(len(tarefas[t]["aceite"]) for t in por["concluida"])
    total = sum(len(t["aceite"]) for t in backlog["tarefas"])
    md = [f"# Relatório do Portal de Afiliação · {agora():%d/%m/%Y %H:%M}", "",
          f"Critérios de aceite em tarefas concluídas e revisadas: **{criterios} de {total}** ({len(por['concluida'])} de {len(tarefas)} tarefas).",
          f"Orquestrador: {'PAUSADO' if estado.get('pausado') else 'ativo'} · ciclos rodados: {estado.get('ciclos', 0)} · último ciclo: {(estado.get('ultimo_ciclo') or {}).get('em', '—')}",
          f"Consumo: {estado.get('ordens_hoje', {}).get(hoje, 0)} de {LIMITES['ordens_por_dia']} ordens hoje (limite diário).", "",
          "## Concluídas e verificadas", *ou_nada([linha(t) for t in por["concluida"]]), "",
          "## Em revisão (entregues, validação passou, aguardam o coordenador)", *ou_nada([linha(t) for t in por["em_revisao"]]), "",
          "## Em execução por agente"]
    for ag in ("claude", "claude-design", "codex", "kimi"):
        ids = [t for t in por["em_execucao"] if tarefas[t]["agente"] == ag]
        md.append(f"- **{ag}**: " + (", ".join(f"{t} ({tarefas[t]['titulo']})" for t in ids) if ids else "livre"))
    md += ["", "## Bloqueios e ação"]
    md += ou_nada([f"- **{t}** {tarefas[t]['titulo']}: {estado['tarefas'][t].get('bloqueio', '—')} · " + (f"nova tentativa em {estado['tarefas'][t]['tentar_em']}" if estado['tarefas'][t].get('tentar_em') else "precisa de ação do coordenador ou do Kbsa") for t in por["bloqueada"]], "- nenhum")
    md += ["", "## Próximas entregas (prontas para despacho)", *ou_nada([linha(t) for t in por["pronta"]]), "",
           "## Testes", f"`node --test \"portal/test/*.test.mjs\"` → {'passou' if ok else 'FALHOU'}", "```", saida or "(sem saída)", "```", "",
           "## Para testar agora", "- Painel: `npm run portal` → http://localhost:3400/admin/ (ou F5 no VS Code)",
           "- Criar operação (Clube 10002), escolher modelo, editar blocos, publicar, enviar formulário e ver o lead no CRM.", "",
           "## Evidências", f"- Log estruturado: `{LOG}`", f"- Estado da fila: `{ESTADO}`", f"- Plane: https://planner.kbsa.app (projeto PORTAL)"]
    RELATORIOS.mkdir(parents=True, exist_ok=True)
    arq = RELATORIOS / f"{agora():%Y-%m-%d-%Hh}.md"
    arq.write_text(limpa("\n".join(md)) + "\n", encoding="utf-8")
    estado["ultimo_relatorio"] = {"em": iso(), "arquivo": str(arq), "testes_ok": ok}
    gravar_json(ESTADO, estado)
    log("relatorio.gerado", arquivo=str(arq), testes_ok=ok)
    comentar_relatorio_plane(estado, "\n".join(md[:6]) + f"\n\nRelatório completo: {arq}")
    # WhatsApp do Kbsa pelo Hermes: resumo + foto do sistema + foto do backoffice (pedido de 05/11/2026)
    try:
        sys.path.insert(0, str(AQUI))
        import resumo_whatsapp  # noqa: E402
        teste_txt = " · ".join(l.replace("ℹ ", "") for l in saida.splitlines() if any(w in l for w in ("pass", "fail"))) or ("passou" if ok else "FALHOU")
        out = resumo_whatsapp.enviar(testes=("ok · " if ok else "FALHOU · ") + teste_txt)
        log("whatsapp.resumo", enviado=out.get("enviado"), fotos=out.get("fotos"), erro=str(out.get("motivo") or out.get("erro_fotos") or ""))
    except Exception as e:
        log("whatsapp.erro", erro=repr(e)[:300])
    return arq


def comentar_relatorio_plane(estado: dict, texto: str) -> None:
    try:
        import html
        p, _ = plane()
        meta = estado.get("plane") or {}
        if not p or not meta.get("projeto"):
            return
        pid = meta["projeto"]
        if not meta.get("cartao_relatorio"):
            w = p.req("POST", f"projects/{pid}/work-items/", {"name": "📊 Relatórios horários do orquestrador", "external_source": "portal-orquestrador", "external_id": "relatorios",
                                                             "description_html": "<p>Cada comentário é um relatório horário gerado pelo orquestrador.</p>"})
            meta["cartao_relatorio"] = w["id"]
            estado["plane"] = meta
            gravar_json(ESTADO, estado)
        corpo = "".join(f"<p>{html.escape(l)}</p>" for l in texto.splitlines() if l.strip())
        p.req("POST", f"projects/{pid}/work-items/{meta['cartao_relatorio']}/comments/", {"comment_html": f"<p>🤖 Orquestrador:</p>{corpo}"})
    except Exception as e:
        log("plane.erro_relatorio", erro=repr(e)[:300])


# ---------------------------------------------------------------- agendador do Windows

def pythonw() -> str:
    exe = Path(sys.executable)
    w = exe.with_name("pythonw.exe")
    return str(w if w.exists() else exe)


def schtasks(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["schtasks", *args], capture_output=True, text=True, encoding="mbcs", errors="replace", creationflags=SEM_JANELA)


def start() -> int:
    script = str(Path(__file__).resolve())
    for nome, minutos, sub in ((TAREFA_CICLO, 30, "ciclo"), (TAREFA_RELATORIO, 60, "report")):
        r = schtasks("/Create", "/F", "/SC", "MINUTE", "/MO", str(minutos), "/TN", nome, "/TR", f'"{pythonw()}" -I "{script}" {sub}')
        print(f"{nome}: {'registrada' if r.returncode == 0 else 'FALHOU'} {r.stdout.strip() or r.stderr.strip()}")
        log("agendador.criar", tarefa=nome, codigo=r.returncode)
    _, estado = carregar()
    estado["pausado"] = False
    gravar_json(ESTADO, estado)
    return ciclo("start")


def stop() -> int:
    for nome in (TAREFA_CICLO, TAREFA_RELATORIO):
        r = schtasks("/Delete", "/F", "/TN", nome)
        print(f"{nome}: {'removida' if r.returncode == 0 else 'não existia'}")
        log("agendador.remover", tarefa=nome, codigo=r.returncode)
    return 0


def status() -> int:
    backlog, estado = carregar()
    tarefas = {t["id"]: t for t in backlog["tarefas"]}
    print(f"Orquestrador: {'PAUSADO' if estado.get('pausado') else 'ativo'} · ciclos: {estado.get('ciclos', 0)} · último: {(estado.get('ultimo_ciclo') or {}).get('em', '—')}")
    for nome in (TAREFA_CICLO, TAREFA_RELATORIO):
        r = schtasks("/Query", "/TN", nome, "/FO", "LIST")
        prox = re.search(r"(Próxima execução|Next Run Time):\s*(.+)", r.stdout)
        print(f"  agendador · {nome}: {'registrada, próxima ' + prox.group(2).strip() if r.returncode == 0 and prox else 'registrada' if r.returncode == 0 else 'não registrada'}")
    hoje = agora().strftime("%Y-%m-%d")
    print(f"  ordens hoje: {estado.get('ordens_hoje', {}).get(hoje, 0)}/{LIMITES['ordens_por_dia']}")
    for k in ESTADOS:
        ids = [tid for tid, s in estado["tarefas"].items() if s["status"] == k and tid in tarefas]
        print(f"\n{k} ({len(ids)})")
        for tid in ids:
            s = estado["tarefas"][tid]
            extra = f" · ordem {Path(s['ordem']).name}" if k == "em_execucao" and s.get("ordem") else f" · {s.get('bloqueio', '')}" if k == "bloqueada" else ""
            print(f"  {tid} [{tarefas[tid]['agente']}] {tarefas[tid]['titulo']}{extra}")
    return 0


def pausar(valor: bool) -> int:
    _, estado = carregar()
    estado["pausado"] = valor
    gravar_json(ESTADO, estado)
    log("orquestrador.pausado" if valor else "orquestrador.retomado")
    print("Pausado." if valor else "Retomado.")
    return 0


def retry(tid: str) -> int:
    backlog, estado = carregar()
    if tid not in estado["tarefas"]:
        print(f"tarefa desconhecida: {tid}")
        return 2
    s = estado["tarefas"][tid]
    mudar(estado, tid, "pronta", "retry manual do coordenador", tentar_em=None, tentativas=max(0, s.get("tentativas", 0) - 1))
    gravar_json(ESTADO, estado)
    print(f"{tid} voltou para pronta.")
    return 0


def review(tid: str, decisao: str, nota: str) -> int:
    backlog, estado = carregar()
    if tid not in estado["tarefas"]:
        print(f"tarefa desconhecida: {tid}")
        return 2
    if decisao == "ok":
        mudar(estado, tid, "concluida", f"revisado e aceito pelo coordenador: {nota}", nota_revisao=None, ordem_revisao=None)
    else:
        mudar(estado, tid, "pronta", f"revisão pediu ajuste: {nota}", nota_revisao=nota, ordem_revisao=None)
    gravar_json(ESTADO, estado)
    sincronizar_plane(backlog, estado)
    print(f"{tid}: {estado['tarefas'][tid]['status']}")
    return 0


def marcar(tid: str, novo: str, motivo: str) -> int:
    """Uso do coordenador para tarefas que ele mesmo executa (agente 'claude')."""
    backlog, estado = carregar()
    if novo not in ESTADOS or tid not in estado["tarefas"]:
        print("uso: marcar PA-XXX <estado> \"motivo\"")
        return 2
    mudar(estado, tid, novo, motivo)
    gravar_json(ESTADO, estado)
    sincronizar_plane(backlog, estado)
    print(f"{tid}: {novo}")
    return 0


def main(argv: list[str]) -> int:
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    cmd = argv[0] if argv else "status"
    if cmd == "start":
        return start()
    if cmd == "stop":
        return stop()
    if cmd == "status":
        return status()
    if cmd in ("dispatch", "ciclo"):
        return ciclo("manual" if cmd == "dispatch" else "agendador")
    if cmd == "report":
        print(relatorio())
        return 0
    if cmd == "pause":
        return pausar(True)
    if cmd == "resume":
        return pausar(False)
    if cmd == "retry" and len(argv) > 1:
        return retry(argv[1])
    if cmd == "review" and len(argv) > 2:
        return review(argv[1], argv[2], " ".join(argv[3:]))
    if cmd == "marcar" and len(argv) > 2:
        return marcar(argv[1], argv[2], " ".join(argv[3:]) or "coordenador")
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
