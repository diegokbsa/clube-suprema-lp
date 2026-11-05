# Portal no Bigue: duas edições, um código

| | Edição SX | Edição Geral |
|---|---|---|
| Para quem | grupo SX: clubes de poker, agentes e afiliados | todos os produtos e programas de afiliação |
| Endereço | `https://sx.kbsa.app` | `https://portal.kbsa.app` (atalho `kbsa.app/portal`) |
| Porta local | `127.0.0.1:3401` | `127.0.0.1:3400` |
| Dados | `E:\LioraServidor\dados\portal-sx` | `E:\LioraServidor\dados\portal` |
| Tarefas | `Portal SX - Servidor`, `Portal SX - Backup` (03:50) | `Portal - Servidor`, `Portal - Backup` (03:45) |

Código das duas: `E:\LioraServidor\apps\portal-afiliacao` (branch `portal-afiliacao` do GitHub privado `diegokbsa/clube-suprema-lp`).
Portas livres no Bigue: ele usa 4301, 4311, 4312, 5432, 8082, 8083, 8084.

## 1. Instalar ou atualizar (PowerShell como Administrador)

Primeira vez:

```powershell
git clone --branch portal-afiliacao --single-branch https://github.com/diegokbsa/clube-suprema-lp.git E:\LioraServidor\apps\portal-afiliacao
```

Depois, uma linha por edição (as mesmas linhas atualizam depois):

```powershell
powershell -ExecutionPolicy Bypass -File E:\LioraServidor\apps\portal-afiliacao\portal\deploy\instalar-bigue.ps1
powershell -ExecutionPolicy Bypass -File E:\LioraServidor\apps\portal-afiliacao\portal\deploy\instalar-bigue.ps1 -Edicao sx
```

Cada uma termina com `Portal (...) no ar em http://127.0.0.1:<porta>`. Primeiro acesso: `credenciais-iniciais.txt` na pasta de dados de cada edição.

## 2. Túnel e DNS (Cloudflare Zero Trust → Networks → Tunnels → kbsa-bigue → Public Hostname → Add)

| Subdomínio | Domínio | Serviço |
|---|---|---|
| `portal` | `kbsa.app` | `HTTP` → `127.0.0.1:3400` |
| `sx` | `kbsa.app` | `HTTP` → `127.0.0.1:3401` |

O painel cria os registros de DNS. Túnel por arquivo: acrescente as duas regras `hostname`/`service` no `config.yml` antes da regra final e rode
`cloudflared tunnel route dns kbsa-bigue portal.kbsa.app` e `... sx.kbsa.app`.

## 3. Atalho kbsa.app/portal (Caddy)

Copie `portal/deploy/portal.caddy` para `E:\LioraServidor\kbsa-deploy\caddy\rotas\portal.caddy` e recarregue o Caddy.

## 4. Pesquisador de IA (roda no PC GPT)

Para os insights chegarem às instalações do Bigue, copie o conteúdo de `token-servico.txt` de cada pasta de dados para
`C:\AgentSetup\secrets\portal-servico.env` no PC GPT:

```
PORTAL_GERAL_TOKEN=<conteúdo de E:\LioraServidor\dados\portal\token-servico.txt>
PORTAL_SX_TOKEN=<conteúdo de E:\LioraServidor\dados\portal-sx\token-servico.txt>
```

## 5. Conferir

```powershell
curl.exe -s https://portal.kbsa.app/api/edition
curl.exe -s https://sx.kbsa.app/api/edition
curl.exe -s https://sx.kbsa.app/.well-known/oauth-protected-resource
```

Esperado: `{"id":"geral",...}`, `{"id":"sx",...}` e o JSON com `"resource":"https://sx.kbsa.app/mcp"`.

## Voltar atrás

`Stop-ScheduledTask` e `Unregister-ScheduledTask` das tarefas da edição, tirar o hostname do túnel e a rota do Caddy.
A pasta de dados fica; o último backup está em `backups\` dentro dela.
