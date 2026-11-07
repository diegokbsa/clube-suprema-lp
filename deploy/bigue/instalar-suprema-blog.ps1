# Instala ou atualiza o suprema.blog no servidor Bigue (Windows), no lugar do Render. Rodar como Administrador:
#   powershell -ExecutionPolicy Bypass -File instalar-suprema-blog.ps1                  (instala ou atualiza, tarefas de fundo como estavam)
#   powershell -ExecutionPolicy Bypass -File instalar-suprema-blog.ps1 -LigarTarefas    (na virada do domínio: liga Telegram, Bluesky, IndexNow, grade e robô)
#   powershell -ExecutionPolicy Bypass -File instalar-suprema-blog.ps1 -DesligarTarefas
# O que faz:
#   - código em E:\LioraServidor\apps\suprema-blog (branch main), servidor só em 127.0.0.1:3410 (o túnel kbsa-bigue manda suprema.blog para cá)
#   - dados em E:\LioraServidor\dados\suprema-blog (db.json não some mais a cada deploy, como acontecia no Render free)
#   - segredos em <dados>\segredos.env (o Kbsa cola o token do robô e a senha de app do Bluesky; ninguém copia do Render)
#   - tarefas "Suprema Blog - Servidor" (boot, reinicia se cair) e "Suprema Blog - Atualizar" (a cada 10 min: se o main mudou,
#     baixa e reinicia; é o que o Render fazia a cada push dos posts automáticos)
# Pode rodar de novo: só atualiza o código e reinicia. Não mexe em nenhum outro serviço nem porta.
param(
  [string]$Repo = 'https://github.com/diegokbsa/clube-suprema-lp.git',
  [string]$Branch = 'main',
  [string]$App = 'E:\LioraServidor\apps\suprema-blog',
  [string]$Dados = 'E:\LioraServidor\dados\suprema-blog',
  [int]$Porta = 3410,
  [switch]$LigarTarefas,
  [switch]$DesligarTarefas
)
$ErrorActionPreference = 'Stop'
function Passo($t) { Write-Host "`n== $t" -ForegroundColor Cyan }
$Proibidas = @(3400, 3401, 3490, 3491, 4301, 4311, 4312, 5432, 8081, 8082, 8083, 8084)
if ($Proibidas -contains $Porta) { throw "A porta $Porta é de outro serviço. Use outra." }
if ($LigarTarefas -and $DesligarTarefas) { throw 'Use -LigarTarefas ou -DesligarTarefas, não os dois.' }

function PararBlog {
  Stop-ScheduledTask -TaskName 'Suprema Blog - Servidor' -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*$App\server.js*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -like '*iniciar-suprema-blog.cmd*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Start-Sleep -Seconds 2
}

Passo 'Conferindo Node, Git e a porta'
$node = (Get-Command node -ErrorAction Stop).Source
$ver = (& $node --version)
if ([int]($ver.TrimStart('v').Split('.')[0]) -lt 22) { throw "Node $ver é antigo: o suprema.blog precisa do Node 22+." }
$git = (Get-Command git -ErrorAction SilentlyContinue).Source
$gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
if (-not $git -and -not $gh) { throw 'Precisa de git ou do gh (GitHub CLI logado) para baixar o código.' }
$ouvindo = Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue
foreach ($c in $ouvindo) {
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)"
  if ($p.CommandLine -notlike "*$App\server.js*") { throw "A porta $Porta já é usada por outro programa ($($p.Name), PID $($p.ProcessId)). Nada foi mudado." }
}
Write-Host "node $ver · $(if ($git) { 'git' } else { 'sem git: baixa o zip pelo gh' }) · porta $Porta livre"

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
  $repoPath = ($Repo -replace '^https://github.com/', '' -replace '\.git$', '')
  $tok = (& $gh auth token).Trim()
  $h = @{ Authorization = "Bearer $tok"; 'User-Agent' = 'KBSA-Homelab/1.0' }
  $sha = (Invoke-RestMethod -Uri "https://api.github.com/repos/$repoPath/commits/$Branch" -Headers $h).sha
  $tmp = Join-Path $env:TEMP "suprema-blog-$(Get-Date -Format yyyyMMddHHmmss)"
  New-Item -ItemType Directory -Force $tmp | Out-Null
  Invoke-WebRequest -UseBasicParsing -Uri "https://api.github.com/repos/$repoPath/zipball/$sha" -Headers $h -OutFile "$tmp\codigo.zip"
  Remove-Variable tok, h
  Expand-Archive -Path "$tmp\codigo.zip" -DestinationPath "$tmp\x" -Force
  $novo = Get-ChildItem "$tmp\x" -Directory | Select-Object -First 1
  if (-not (Test-Path (Join-Path $novo.FullName 'server.js'))) { throw 'O zip baixado não tem server.js; nada foi trocado.' }
  Set-Content -Encoding ASCII (Join-Path $novo.FullName '.versao') $sha
  PararBlog
  if (Test-Path $App) {
    $velho = "$App.anterior"
    if (Test-Path $velho) { Remove-Item -Recurse -Force $velho }
    Rename-Item $App (Split-Path $velho -Leaf)            # a versão anterior fica em <App>.anterior para voltar atrás
  }
  Move-Item $novo.FullName $App
  Remove-Item -Recurse -Force $tmp
  Write-Host "código: $sha (zip do $Branch)"
}

Passo 'Dados e segredos'
New-Item -ItemType Directory -Force $Dados | Out-Null
icacls $Dados /inheritance:r /grant:r 'Administrators:(OI)(CI)F' 'SYSTEM:(OI)(CI)F' | Out-Null
$segredos = Join-Path $Dados 'segredos.env'
if (-not (Test-Path $segredos)) {
  $adm = -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
  @"
# Segredos do suprema.blog no Bigue. Uma linha por chave, sem aspas e sem espaço em volta do =.
# Cole os valores aqui (só o Kbsa). Depois rode o instalador de novo para reiniciar.
# Token do robô do Telegram (@BotFather). Só preencha na virada: dois servidores com o mesmo token brigam (erro 409).
TELEGRAM_BOT_TOKEN=
# Senha de app do Bluesky (Configurações > Privacidade e segurança > Senhas de app), não a senha da conta.
BLUESKY_APP_PASSWORD=
# Senha do /admin deste servidor (gerada pelo instalador; o /admin do Render tem outra).
ADMIN_TOKEN=$adm
"@ | Set-Content -Encoding ASCII $segredos
  Write-Host "criado $segredos (ADMIN_TOKEN novo; Telegram e Bluesky em branco)"
}
$flag = Join-Path $Dados 'tarefas-ligadas.txt'
if ($LigarTarefas) { "ligadas em $(Get-Date -Format s)" | Set-Content -Encoding ASCII $flag }
if ($DesligarTarefas -and (Test-Path $flag)) { Remove-Item $flag }
$tarefas = if (Test-Path $flag) { '1' } else { '0' }
Write-Host "tarefas de fundo: $(if ($tarefas -eq '1') { 'LIGADAS' } else { 'desligadas (o Render continua postando)' })"

Passo 'Tarefa do servidor'
PararBlog
$cmd = Join-Path $Dados 'iniciar-suprema-blog.cmd'
@"
@echo off
rem Gerado por instalar-suprema-blog.ps1. Mesmas variáveis do render.yaml.
set PORT=$Porta
set HOST=127.0.0.1
set DATA_DIR=$Dados
set FLOW=completo
set SUPREMA_MODE=app
set F24H_MODE=guiado
set GA4_ID=G-ZXS59RV8GR
set TAREFAS_FUNDO=$tarefas
for /f "usebackq eol=# tokens=1,* delims==" %%a in ("$segredos") do if not "%%b"=="" set "%%a=%%b"
cd /d "$App"
:loop
"$node" "$App\server.js" >> "$Dados\servidor.log" 2>&1
timeout /t 5 /nobreak >nul
goto loop
"@ | Set-Content -Encoding ASCII $cmd
$cfg = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'Suprema Blog - Servidor' -Action (New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$cmd`"") `
  -Trigger (New-ScheduledTaskTrigger -AtStartup) -Settings $cfg -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Start-ScheduledTask -TaskName 'Suprema Blog - Servidor'

Passo 'Tarefa de atualização (no lugar do auto-deploy do Render)'
$upd = Join-Path $Dados 'atualizar-suprema-blog.ps1'
Copy-Item (Join-Path $App 'deploy\bigue\atualizar-suprema-blog.ps1') $upd -Force
$gatilho = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 10)
$cfgU = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 8) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'Suprema Blog - Atualizar' -Action (New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$upd`" -App `"$App`" -Dados `"$Dados`" -Branch $Branch -Repo $Repo") `
  -Trigger $gatilho -Settings $cfgU -User 'SYSTEM' -RunLevel Highest -Force | Out-Null

Passo 'Saúde'
$ok = $false
for ($i = 0; $i -lt 25 -and -not $ok; $i++) {
  Start-Sleep -Seconds 1
  try { $r = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Porta/healthz" -TimeoutSec 3; $ok = $r.StatusCode -eq 200 } catch { }
}
if (-not $ok) { Get-Content "$Dados\servidor.log" -Tail 30; throw "127.0.0.1:$Porta não respondeu /healthz." }
foreach ($p in '/', '/blog', '/torneios', '/sitemap.xml') {
  $r = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Porta$p" -TimeoutSec 20
  Write-Host "$p -> HTTP $($r.StatusCode) ($($r.RawContentLength) bytes)"
}
Write-Host "suprema.blog no Bigue: http://127.0.0.1:$Porta (túnel: suprema.blog -> http://127.0.0.1:$Porta)" -ForegroundColor Green
