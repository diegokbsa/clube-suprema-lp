# Executor de vídeos curtos (fila do painel)

O painel guarda a **fila de vídeos curtos de cada operação** (tela "Vídeos curtos"): o vídeo, a legenda, os canais
(YouTube Shorts, Instagram Reels, TikTok) e a partir de quando pode sair. **O painel não posta nada e não fala com
celular.** Quem posta é um *executor* externo: hoje, o PC GPT com o POCO F5, usando os dois scripts do suprema.blog:

- `tools/youtube/postar_short.py` (YouTube, app oficial, pelo celular);
- `tools/instagram/postar_reel.py` (Instagram, app oficial, pelo celular).

Este guia mostra como ligar esses scripts à fila **sem editar os scripts no repositório antigo**: um script pequeno
(o "executor") pega o próximo vídeo devido no painel, prepara os arquivos que os scripts já esperam, chama o script e
devolve ao painel "publicado" (com o link do post, quando houver) ou "erro".

## A API do executor

Todas as chamadas levam o **token de serviço** do portal no cabeçalho:

```
Authorization: Bearer <token de serviço>
```

O token fica no servidor do portal (`portal/data/token-servico.txt` ou a variável `PORTAL_SERVICE_TOKEN`). No PC do
executor, guarde-o numa variável de ambiente (`PORTAL_SERVICE_TOKEN`), nunca no código nem em nota.

| Chamada | O que faz |
|---|---|
| `POST /api/service/videos/reservar` `{"canal":"youtube","operacao":"clube-10001","executor":"pc-gpt"}` | Reserva o próximo envio devido daquele canal (o mais antigo com horário já vencido) por **30 minutos**. Resposta: `{"envio": {...}}` ou `{"envio": null, "proximo": "<quando sai o próximo>"}`. `operacao` é opcional (sem ela, pega de qualquer operação). |
| `GET /api/service/videos/<envioId>/arquivo` | Baixa o vídeo, quando ele foi enviado ao painel (`envio.arquivo.tipo = "portal"`). |
| `POST /api/service/videos/<envioId>/publicado` `{"url":"https://youtube.com/shorts/…","executor":"pc-gpt"}` | Marca como publicado. `url` é opcional (os scripts de hoje não leem o link do post). Repetir a chamada não muda nada (`duplicado: true`). |
| `POST /api/service/videos/<envioId>/erro` `{"erro":"o celular está bloqueado com senha","tentarDeNovo":true}` | Marca erro. Com `tentarDeNovo`, volta para a fila (até 3 tentativas); sem, fica com erro até alguém clicar "Repetir" no painel. |
| `POST /api/service/videos` `{"operacao":"clube-10001","ref":"all-in-e-side-pot","titulo":"…","legenda":"…","canais":["youtube","instagram"],"arquivoUrl":"data/shorts/all-in-e-side-pot.mp4","agendadoPara":"2026-11-07T15:00:00-03:00"}` | Opcional: o gerador do dia registra o vídeo na fila sozinho. O `ref` (id do roteiro) impede registrar o mesmo vídeo duas vezes. |

O `envio` reservado traz tudo o que o executor precisa:

```json
{
  "envioId": "…", "canal": "youtube", "tentativa": 1, "reservadoAte": "…",
  "operacao": { "slug": "clube-10001", "nome": "Clube Suprema" },
  "video": { "id": "…", "ref": "all-in-e-side-pot", "titulo": "All-in e side pot… #shorts", "legenda": "…", "agendadoPara": "…" },
  "arquivo": { "tipo": "portal | url | caminho", "url": "…" },
  "marcar": { "publicado": "https://…/publicado", "erro": "https://…/erro" }
}
```

- `arquivo.tipo = "portal"`: o vídeo foi enviado pela tela; baixe de `arquivo.url` com o mesmo token.
- `arquivo.tipo = "url"`: um endereço https; baixe direto.
- `arquivo.tipo = "caminho"`: um caminho no PC do executor (ex.: `data/shorts/all-in-e-side-pot.mp4`, relativo à
  pasta do suprema.blog). O executor só confere se o arquivo existe.
- No Instagram, `video.legenda` já vem com a legenda própria do Reels, quando ela foi preenchida no painel.

Regras que a API garante: o mesmo vídeo não sai duas vezes no mesmo canal; dois executores não pegam o mesmo envio;
uma reserva sem resposta em 30 minutos volta para a fila; vídeo cancelado ou sem arquivo não sai; nada aparece como
publicado no painel sem o executor dizer que publicou.

## Como os dois scripts recebem o vídeo hoje

Os dois scripts recebem **um roteiro JSON** na linha de comando e acham o vídeo pelo `id` do roteiro:

```
<forge>\.venv\Scripts\python.exe tools\youtube\postar_short.py marketing\shorts\<id>.json
<forge>\.venv\Scripts\python.exe tools\instagram\postar_reel.py marketing\shorts\<id>.json
```

- Vídeo: `data/shorts/<id>.mp4`, dentro da pasta do suprema.blog.
- YouTube: usa `titulo` (até 100) e `descricao` (até 4.900) do roteiro.
- Instagram: se o roteiro tiver `instagram`, ele vira a legenda inteira; senão o script monta a legenda com
  `titulo` + `descricao`.
- Saída: código 0 e a linha `publicado: …` (ou `… já foi publicado em …`, quando o id já está no registro); código 1 e
  `FALHOU: <motivo>` quando algo deu errado.
- Os registros `data/shorts/publicados.json` e `data/shorts/instagram.json` continuam valendo: o mesmo id não sai duas
  vezes, mesmo que o painel peça de novo.

## O executor (script novo, fora do repositório antigo)

Salve como, por exemplo, `C:\Users\Administrator\Documents\executor-videos\executor_videos.py` e rode com o Python do
forge (o mesmo dos scripts). Ele não muda nada nos scripts: só cria o roteiro temporário e o vídeo onde eles esperam.

```python
"""Executor da fila de vídeos do painel: pega o próximo devido, chama o script do canal e devolve o resultado."""
import json, os, subprocess, sys, tempfile, urllib.request
from pathlib import Path

PAINEL = os.environ.get("PORTAL_URL", "https://sx.kbsa.app")          # endereço do painel
TOKEN = os.environ["PORTAL_SERVICE_TOKEN"]                              # nunca no código
OPERACAO = os.environ.get("PORTAL_OPERACAO", "clube-10001")
SUPREMA = Path(os.environ.get("SUPREMA_DIR", r"C:\Users\Administrator\Desktop\match3-autoplayer-extensao-v1.1.0\Nova pasta (2)\Poker-crypto"))
FORGE_PY = os.environ.get("FORGE_PY", r"<forge>\.venv\Scripts\python.exe")
SCRIPTS = {"youtube": SUPREMA / "tools" / "youtube" / "postar_short.py", "instagram": SUPREMA / "tools" / "instagram" / "postar_reel.py"}


def chamar(metodo, url, corpo=None):
    req = urllib.request.Request(url if url.startswith("http") else PAINEL + url, method=metodo,
                                 data=None if corpo is None else json.dumps(corpo).encode(),
                                 headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read() or b"{}")


def baixar(url, destino):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOKEN}"} if url.startswith(PAINEL) else {})
    with urllib.request.urlopen(req, timeout=600) as r, open(destino, "wb") as f:
        while bloco := r.read(1 << 20):
            f.write(bloco)


def um(canal):
    e = chamar("POST", "/api/service/videos/reservar", {"canal": canal, "operacao": OPERACAO, "executor": "pc-gpt"})["envio"]
    if not e:
        return False
    v = e["video"]
    rid = v["ref"] or v["id"]
    video = SUPREMA / "data" / "shorts" / f"{rid}.mp4"          # onde os scripts procuram o vídeo
    try:
        a = e["arquivo"]
        if a["tipo"] in ("portal", "url"):
            if not video.exists():
                baixar(a["url"], video)
        elif not (SUPREMA / a["url"]).exists():
            raise RuntimeError(f"vídeo não existe neste PC: {a['url']}")
        elif (SUPREMA / a["url"]).resolve() != video.resolve():
            video.write_bytes((SUPREMA / a["url"]).read_bytes())
        roteiro = {"id": rid, "titulo": v["titulo"], "descricao": v["legenda"]}
        if canal == "instagram":
            roteiro["instagram"] = v["legenda"]                # legenda inteira do Reels, como veio do painel
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
            json.dump(roteiro, f, ensure_ascii=False)
        p = subprocess.run([FORGE_PY, str(SCRIPTS[canal]), f.name], cwd=SUPREMA, capture_output=True, text=True, encoding="utf-8", timeout=1800)
        saida = (p.stdout + p.stderr).strip()
        if p.returncode == 0:
            chamar("POST", e["marcar"]["publicado"], {"executor": "pc-gpt"})   # os scripts não leem o link do post
        else:
            motivo = next((l for l in saida.splitlines() if l.startswith("FALHOU:")), saida[-300:] or "sem saída")
            chamar("POST", e["marcar"]["erro"], {"erro": motivo[:480], "tentarDeNovo": "bloqueado" in motivo or "ADB" in motivo})
    except Exception as erro:  # noqa: BLE001
        chamar("POST", e["marcar"]["erro"], {"erro": str(erro)[:480], "tentarDeNovo": True})
    return True


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    for canal in sys.argv[1:] or ["youtube", "instagram"]:   # um canal por vez: é o mesmo celular
        while um(canal):
            pass
```

Pontos de atenção:

- **Um canal por vez, um vídeo por vez.** É o mesmo POCO F5; os scripts já esperam o forge terminar (até 10 min). Não
  rode dois executores no mesmo celular.
- **adb oficial.** Os scripts já usam o adb oficial (porta 5037). Não troque pelo do LDPlayer.
- **Teste seco.** Para conferir sem publicar, rode o script do canal à mão com `--seco` usando o roteiro temporário; o
  executor nunca passa `--seco` (um teste seco devolveria "publicado" ao painel).
- **Link do post.** Hoje os scripts não leem o link. Se um dia lerem (ex.: imprimindo `link: https://…`), passe o link
  em `{"url": …}` no "publicado"; o painel mostra "ver post".

## Agendar no PC

No Agendador de Tarefas do Windows, uma tarefa a cada 15 minutos:

```
Programa: <forge>\.venv\Scripts\python.exe
Argumentos: C:\Users\Administrator\Documents\executor-videos\executor_videos.py youtube instagram
Variáveis: PORTAL_URL, PORTAL_SERVICE_TOKEN, PORTAL_OPERACAO (e SUPREMA_DIR / FORGE_PY se mudarem)
```

Quem criar a tarefa registra em `Canvas\Estrutura.canvas` e `00-SYSTEM\MAQUINAS.md` (regra da memória central).

## Testar a API sem celular

```bash
# próximo vídeo devido do YouTube (reserva por 30 min)
curl -s -X POST "$PORTAL_URL/api/service/videos/reservar" -H "Authorization: Bearer $PORTAL_SERVICE_TOKEN" \
  -H "Content-Type: application/json" -d '{"canal":"youtube","operacao":"clube-10001","executor":"teste"}'

# devolver como erro, para voltar à fila
curl -s -X POST "$PORTAL_URL/api/service/videos/<envioId>/erro" -H "Authorization: Bearer $PORTAL_SERVICE_TOKEN" \
  -H "Content-Type: application/json" -d '{"erro":"teste da API","tentarDeNovo":true}'
```
