# Instala ou atualiza o Portal no servidor Bigue (Windows). Rodar como Administrador:
#   powershell -ExecutionPolicy Bypass -File instalar-bigue.ps1
# Um servidor e um banco para as duas edições (base única de clientes):
#   - um processo ouve 127.0.0.1:3400 (Geral, aff.kbsa.app; portal.kbsa.app segue apontando para cá) e 127.0.0.1:3401 (SX, sx.kbsa.app); o túnel não muda
#   - dados em E:\LioraServidor\dados\portal; se existir a instalação antiga separada da SX (dados\portal-sx),
#     o banco dela é juntado UMA vez (com backup dos dois antes) e as tarefas antigas da SX são removidas
#   - tarefa "Portal - Servidor" (boot, reinicia se cair) e "Portal - Backup" (03:45, 14 dias)
# Pode rodar de novo: só atualiza o código e reinicia.
param(
  [string]$Repo = 'https://github.com/diegokbsa/clube-suprema-lp.git',
  [string]$Branch = 'portal-afiliacao',
  [string]$App = 'E:\LioraServidor\apps\portal-afiliacao',
  [string]$Dados = 'E:\LioraServidor\dados\portal',
  [string]$DadosSxAntigo = 'E:\LioraServidor\dados\portal-sx',
  [string]$OrigemGeral = 'https://aff.kbsa.app',   # 06/11/2026: afiliados em aff.kbsa.app (portal.kbsa.app segue no túnel)
  [string]$OrigemSx = 'https://sx.kbsa.app',
  [string]$AdminEmail = 'h2odiegokbsa@gmail.com'
)
$ErrorActionPreference = 'Stop'
function Passo($t) { Write-Host "`n== $t" -ForegroundColor Cyan }
function PararPortal {
  foreach ($t in 'Portal - Servidor', 'Portal SX - Servidor') { Stop-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue }
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*portal\server.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -like '*iniciar-portal.cmd*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Start-Sleep -Seconds 2
}

Passo 'Conferindo Node e Git'
$node = (Get-Command node -ErrorAction Stop).Source
$ver = (& $node --version)
if ([int]($ver.TrimStart('v').Split('.')[0]) -lt 22) { throw "Node $ver é antigo: o portal precisa do Node 22.5+ (node:sqlite). Instale o Node 24 LTS." }
$git = (Get-Command git -ErrorAction SilentlyContinue).Source
$gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
if (-not $git -and -not $gh) { throw 'Precisa de git ou do gh (GitHub CLI logado) para baixar o código.' }
Write-Host "node $ver · $(if ($git) { 'git' } else { 'sem git: baixa o zip pelo gh' })"

Passo 'Código'
if ($git -and (Test-Path (Join-Path $App '.git'))) {
  & $git -C $App fetch origin $Branch
  & $git -C $App checkout $Branch
  & $git -C $App reset --hard "origin/$Branch"   # pasta só de implantação: ninguém edita aqui
  & $git -C $App log --oneline -1
} elseif ($git -and -not (Test-Path $App)) {
  New-Item -ItemType Directory -Force (Split-Path $App) | Out-Null
  & $git clone --branch $Branch --single-branch $Repo $App
  & $git -C $App log --oneline -1
} else {
  # Bigue sem git: baixa o zip da branch pela API do GitHub com o login do gh (o token fica só na memória deste script)
  $repoPath = ($Repo -replace '^https://github.com/', '' -replace '\.git$', '')
  $tok = (& $gh auth token).Trim()
  $tmp = Join-Path $env:TEMP "portal-$(Get-Date -Format yyyyMMddHHmmss)"
  New-Item -ItemType Directory -Force $tmp | Out-Null
  Invoke-WebRequest -UseBasicParsing -Uri "https://api.github.com/repos/$repoPath/zipball/$Branch" -Headers @{ Authorization = "Bearer $tok"; 'User-Agent' = 'KBSA-Homelab/1.0' } -OutFile "$tmp\codigo.zip"
  Remove-Variable tok
  Expand-Archive -Path "$tmp\codigo.zip" -DestinationPath "$tmp\x" -Force
  $novo = Get-ChildItem "$tmp\x" -Directory | Select-Object -First 1
  if (-not (Test-Path (Join-Path $novo.FullName 'portal\server.mjs'))) { throw 'O zip baixado não tem portal\server.mjs; nada foi trocado.' }
  PararPortal
  if (Test-Path $App) {
    $velho = "$App.anterior"
    if (Test-Path $velho) { Remove-Item -Recurse -Force $velho }
    Rename-Item $App (Split-Path $velho -Leaf)            # a versão anterior fica em <App>.anterior para voltar atrás
  }
  Move-Item $novo.FullName $App
  Remove-Item -Recurse -Force $tmp
  Write-Host "código: $($novo.Name) (zip da branch $Branch)"
}

Passo 'Dados'
New-Item -ItemType Directory -Force $Dados | Out-Null
New-Item -ItemType Directory -Force (Join-Path $Dados 'backups') | Out-Null
icacls $Dados /inheritance:r /grant:r 'Administrators:(OI)(CI)F' 'SYSTEM:(OI)(CI)F' | Out-Null

PararPortal

$bancoSx = Join-Path $DadosSxAntigo 'portal.db'
if ((Test-Path $bancoSx) -and -not (Test-Path (Join-Path $DadosSxAntigo 'UNIFICADO.txt'))) {
  Passo 'Juntando o banco da SX no banco único (backup dos dois antes)'
  if (-not (Test-Path (Join-Path $Dados 'portal.db'))) { throw "Não achei $Dados\portal.db para receber a SX. Rode a instalação da Geral antes." }
  & $node "$App\portal\tools\unificar-bancos.mjs" $Dados $DadosSxAntigo
  if ($LASTEXITCODE -ne 0) { throw 'A junção dos bancos falhou; nada foi gravado. Os servidores ficaram parados: veja a mensagem acima.' }
  $tokSx = Join-Path $DadosSxAntigo 'token-servico.txt'
  if (Test-Path $tokSx) { Get-Content $tokSx | Add-Content -Encoding ASCII (Join-Path $Dados 'token-servico-extra.txt') }  # o pesquisador segue mandando com o token antigo da SX
}
foreach ($t in 'Portal SX - Servidor', 'Portal SX - Backup') {
  if (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $t -Confirm:$false; Write-Host "tarefa antiga removida: $t" }
}

Passo 'Tarefa do servidor (as duas edições)'
$cmd = Join-Path $Dados 'iniciar-portal.cmd'
@"
@echo off
set PORTAL_EDITION=geral
set PORTAL_PORT=3400:geral,3401:sx
set PORTAL_HOST=127.0.0.1
set PORTAL_ORIGIN=$OrigemGeral
set PORTAL_ORIGIN_GERAL=$OrigemGeral
set PORTAL_ORIGIN_SX=$OrigemSx
set PORTAL_DATA_DIR=$Dados
set PORTAL_ADMIN_EMAIL=$AdminEmail
cd /d "$App"
:loop
"$node" portal\server.mjs --unificado >> "$Dados\portal.log" 2>&1
timeout /t 5 /nobreak >nul
goto loop
"@ | Set-Content -Encoding ASCII $cmd
$acao = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$cmd`""
$cfg = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'Portal - Servidor' -Action $acao -Trigger (New-ScheduledTaskTrigger -AtStartup) -Settings $cfg -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Start-ScheduledTask -TaskName 'Portal - Servidor'

Passo 'Tarefa de backup'
$acaoB = New-ScheduledTaskAction -Execute $node -Argument "`"$App\portal\tools\backup.mjs`" `"$Dados`"" -WorkingDirectory $App
Register-ScheduledTask -TaskName 'Portal - Backup' -Action $acaoB -Trigger (New-ScheduledTaskTrigger -Daily -At 03:45) -User 'SYSTEM' -RunLevel Highest -Force | Out-Null

Passo 'Saúde das duas edições'
foreach ($par in @(@(3400, 'geral'), @(3401, 'sx'))) {
  $ok = $false
  for ($i = 0; $i -lt 25 -and -not $ok; $i++) {
    Start-Sleep -Seconds 1
    try { $r = Invoke-RestMethod "http://127.0.0.1:$($par[0])/api/edition" -TimeoutSec 3; $ok = $r.id -eq $par[1] } catch { }
  }
  if (-not $ok) { Get-Content "$Dados\portal.log" -Tail 30; throw "A porta $($par[0]) não respondeu como edição $($par[1])." }
  Write-Host "127.0.0.1:$($par[0]) -> edição $($par[1]) ok" -ForegroundColor Green
}
Write-Host "Portal no ar (um banco, duas edições): $OrigemGeral e $OrigemSx" -ForegroundColor Green
