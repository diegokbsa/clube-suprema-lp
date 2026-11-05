# Portal de Afiliação no Bigue: portal.kbsa.app

Padrão do servidor: `<projeto>.kbsa.app` + `kbsa.app/<projeto>`, túnel Cloudflare `kbsa-bigue`, Caddy em `E:\LioraServidor`.

| Item | Valor |
|---|---|
| Código | `E:\LioraServidor\apps\portal-afiliacao` (branch `portal-afiliacao` do GitHub `diegokbsa/clube-suprema-lp`) |
| Dados | `E:\LioraServidor\dados\portal` (banco `portal.db`, chave do cofre, log, backups) |
| Porta | `127.0.0.1:3400` (livre: o Bigue usa 4301, 4311, 4312, 5432, 8082, 8083, 8084) |
| Tarefas | `Portal - Servidor` (boot, reinicia se cair) e `Portal - Backup` (03:45, 14 dias) |
| Público | `https://portal.kbsa.app` (painel em `/admin/`, conector MCP em `/mcp`) e `https://kbsa.app/portal` → 302 |

## 1. Instalar (no Bigue, PowerShell como Administrador)

```powershell
powershell -ExecutionPolicy Bypass -File E:\LioraServidor\apps\portal-afiliacao\portal\deploy\instalar-bigue.ps1
```

Primeira vez (a pasta ainda não existe): baixe só o script e rode.

```powershell
git clone --branch portal-afiliacao --single-branch https://github.com/diegokbsa/clube-suprema-lp.git E:\LioraServidor\apps\portal-afiliacao
powershell -ExecutionPolicy Bypass -File E:\LioraServidor\apps\portal-afiliacao\portal\deploy\instalar-bigue.ps1
```

Termina com `Portal no ar em http://127.0.0.1:3400`. A senha do primeiro acesso fica em `E:\LioraServidor\dados\portal\credenciais-iniciais.txt`.

## 2. Atualizar depois

Rodar o mesmo script: ele puxa a branch, reinicia e confere a saúde. Dados e chave do cofre ficam.

## 3. Túnel e DNS (Cloudflare Zero Trust)

O DNS de `portal.kbsa.app` não existia em 05/11 às 21h (Google e Cloudflare respondiam "domínio não existe").

- Túnel gerenciado pelo painel: **Zero Trust → Networks → Tunnels → kbsa-bigue → Public Hostname → Add**:
  subdomínio `portal`, domínio `kbsa.app`, serviço `HTTP` → `127.0.0.1:3400`. O próprio painel cria o CNAME.
- Túnel por arquivo (`config.yml` do cloudflared): acrescente antes da regra final `- service: http_status:404`

  ```yaml
  - hostname: portal.kbsa.app
    service: http://127.0.0.1:3400
  ```

  e crie o DNS: `cloudflared tunnel route dns kbsa-bigue portal.kbsa.app`. Reinicie o serviço Cloudflared.

## 4. Atalho kbsa.app/portal (Caddy)

Copie `portal/deploy/portal.caddy` para `E:\LioraServidor\kbsa-deploy\caddy\rotas\portal.caddy` e recarregue o Caddy
(o mesmo jeito das rotas `dindin.caddy`, `biglinks`, `codiguin`).

## 5. Conferir

```powershell
curl.exe -s https://portal.kbsa.app/healthz
curl.exe -s https://portal.kbsa.app/.well-known/oauth-protected-resource
curl.exe -sI https://kbsa.app/portal
```

Esperado: `{"ok":true,...}`, o JSON com `"resource":"https://portal.kbsa.app/mcp"` e `302` para `https://portal.kbsa.app/`.

## Voltar atrás

`Stop-ScheduledTask 'Portal - Servidor'`, `Unregister-ScheduledTask 'Portal - Servidor','Portal - Backup' -Confirm:$false`,
tirar o hostname do túnel e a rota do Caddy. A pasta de dados fica; o último backup está em `dados\portal\backups`.
