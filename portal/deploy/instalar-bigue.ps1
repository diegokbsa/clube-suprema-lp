# Instala ou atualiza o Portal de Afiliação no servidor Bigue (Windows). Rodar como Administrador:
#   powershell -ExecutionPolicy Bypass -File instalar-bigue.ps1
# O que faz (e pode rodar de novo sem estragar nada):
#   1. baixa/atualiza o código (branch portal-afiliacao) em E:\LioraServidor\apps\portal-afiliacao
#   2. cria a pasta de dados E:\LioraServidor\dados\portal (banco, chave do cofre, credenciais iniciais) com acesso só do Administrador
#   3. registra a tarefa "Portal - Servidor" (sobe no boot, reinicia se cair) ouvindo só em 127.0.0.1:3400
#   4. registra a tarefa "Portal - Backup" (todo dia 03:45, 14 dias guardados)
#   5. confere http://127.0.0.1:3400/healthz
# Não mexe em Caddy, túnel nem DNS: isso está no LEIA-ME.md (passos 3 e 4).
param(
  [string]$Repo = 'https://github.com/diegokbsa/clube-suprema-lp.git',
  [string]$Branch = 'portal-afiliacao',
  [string]$App = 'E:\LioraServidor\apps\portal-afiliacao',
  [string]$Dados = 'E:\LioraServidor\dados\portal',
  [string]$Origem = 'https://portal.kbsa.app',
  [int]$Porta = 3400,
  [string]$AdminEmail = 'h2odiegokbsa@gmail.com'
)
$ErrorActionPreference = 'Stop'
function Passo($t) { Write-Host "`n== $t" -ForegroundColor Cyan }

Passo 'Conferindo Node e Git'
$node = (Get-Command node -ErrorAction Stop).Source
$ver = (& $node --version)
if ([int]($ver.TrimStart('v').Split('.')[0]) -lt 22) { throw "Node $ver é antigo: o portal precisa do Node 22.5+ (node:sqlite). Instale o Node 24 LTS." }
$git = (Get-Command git -ErrorAction Stop).Source
Write-Host "node $ver · git ok"

Passo 'Porta livre'
$ocupada = Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue
if ($ocupada -and -not (Get-ScheduledTask -TaskName 'Portal - Servidor' -ErrorAction SilentlyContinue)) { throw "A porta $Porta já está em uso por outro programa (PID $($ocupada.OwningProcess))." }

Passo 'Código'
if (Test-Path (Join-Path $App '.git')) {
  & $git -C $App fetch origin $Branch
  & $git -C $App checkout $Branch
  & $git -C $App reset --hard "origin/$Branch"   # pasta só de implantação: ninguém edita aqui
} else {
  New-Item -ItemType Directory -Force (Split-Path $App) | Out-Null
  & $git clone --branch $Branch --single-branch $Repo $App
}
& $git -C $App log --oneline -1

Passo 'Dados'
New-Item -ItemType Directory -Force $Dados | Out-Null
New-Item -ItemType Directory -Force (Join-Path $Dados 'backups') | Out-Null
icacls $Dados /inheritance:r /grant:r 'Administrators:(OI)(CI)F' 'SYSTEM:(OI)(CI)F' | Out-Null

Passo 'Tarefa do servidor'
$cmd = Join-Path $Dados 'iniciar-portal.cmd'
@"
@echo off
set PORTAL_PORT=$Porta
set PORTAL_HOST=127.0.0.1
set PORTAL_ORIGIN=$Origem
set PORTAL_DATA_DIR=$Dados
set PORTAL_ADMIN_EMAIL=$AdminEmail
cd /d "$App"
:loop
"$node" portal\server.mjs >> "$Dados\portal.log" 2>&1
timeout /t 5 /nobreak >nul
goto loop
"@ | Set-Content -Encoding ASCII $cmd
$acao = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$cmd`""
$gatilho = New-ScheduledTaskTrigger -AtStartup
$cfg = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'Portal - Servidor' -Action $acao -Trigger $gatilho -Settings $cfg -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Stop-ScheduledTask -TaskName 'Portal - Servidor' -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*portal\server.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-ScheduledTask -TaskName 'Portal - Servidor'

Passo 'Tarefa de backup'
$acaoB = New-ScheduledTaskAction -Execute $node -Argument "`"$App\portal\tools\backup.mjs`" `"$Dados`"" -WorkingDirectory $App
Register-ScheduledTask -TaskName 'Portal - Backup' -Action $acaoB -Trigger (New-ScheduledTaskTrigger -Daily -At 03:45) -User 'SYSTEM' -RunLevel Highest -Force | Out-Null

Passo 'Saúde'
$ok = $false
for ($i = 0; $i -lt 20 -and -not $ok; $i++) {
  Start-Sleep -Seconds 1
  try { $r = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Porta/healthz" -TimeoutSec 3; $ok = $r.StatusCode -eq 200 } catch { }
}
if (-not $ok) { Get-Content "$Dados\portal.log" -Tail 30; throw 'O portal não respondeu em 127.0.0.1:' + $Porta }
Write-Host "Portal no ar em http://127.0.0.1:$Porta (público: $Origem depois do túnel)." -ForegroundColor Green
if (Test-Path "$Dados\credenciais-iniciais.txt") { Write-Host "Primeiro acesso: $Dados\credenciais-iniciais.txt (troque a senha ao entrar)." -ForegroundColor Yellow }
