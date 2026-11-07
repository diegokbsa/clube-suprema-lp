# Roda a cada 10 min (tarefa "Suprema Blog - Atualizar", criada por instalar-suprema-blog.ps1).
# Se o branch main tem commit novo (post automático, correção), baixa e reinicia o servidor: o mesmo que o Render fazia
# a cada push. Sem commit novo, não faz nada. Registro em <dados>\atualizar.log.
param(
  [string]$App = 'E:\LioraServidor\apps\suprema-blog',
  [string]$Dados = 'E:\LioraServidor\dados\suprema-blog',
  [string]$Branch = 'main',
  [string]$Repo = 'https://github.com/diegokbsa/clube-suprema-lp.git'
)
$ErrorActionPreference = 'Stop'
$log = Join-Path $Dados 'atualizar.log'
function Log($t) { "$(Get-Date -Format s) $t" | Add-Content -Encoding UTF8 $log }

function Reiniciar {
  Stop-ScheduledTask -TaskName 'Suprema Blog - Servidor' -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*$App\server.js*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -like '*iniciar-suprema-blog.cmd*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Start-Sleep -Seconds 2
  Start-ScheduledTask -TaskName 'Suprema Blog - Servidor'
}

try {
  $git = (Get-Command git -ErrorAction SilentlyContinue).Source
  if ($git -and (Test-Path (Join-Path $App '.git'))) {
    & $git -C $App fetch -q origin $Branch 2>$null
    $atual = (& $git -C $App rev-parse HEAD).Trim()
    $novo = (& $git -C $App rev-parse "origin/$Branch").Trim()
    if ($atual -eq $novo) { exit 0 }
    & $git -C $App reset -q --hard "origin/$Branch"
    Log "git $($atual.Substring(0,7)) -> $($novo.Substring(0,7)); reiniciando"
    Reiniciar
    exit 0
  }
  $gh = (Get-Command gh -ErrorAction Stop).Source
  $repoPath = ($Repo -replace '^https://github.com/', '' -replace '\.git$', '')
  $tok = (& $gh auth token).Trim()
  $h = @{ Authorization = "Bearer $tok"; 'User-Agent' = 'KBSA-Homelab/1.0' }
  $sha = (Invoke-RestMethod -Uri "https://api.github.com/repos/$repoPath/commits/$Branch" -Headers $h).sha
  $vf = Join-Path $App '.versao'
  $atual = if (Test-Path $vf) { (Get-Content $vf -Raw).Trim() } else { '' }
  if ($atual -eq $sha) { exit 0 }
  $tmp = Join-Path $env:TEMP "suprema-blog-upd-$(Get-Date -Format yyyyMMddHHmmss)"
  New-Item -ItemType Directory -Force $tmp | Out-Null
  Invoke-WebRequest -UseBasicParsing -Uri "https://api.github.com/repos/$repoPath/zipball/$sha" -Headers $h -OutFile "$tmp\codigo.zip"
  Remove-Variable tok, h
  Expand-Archive -Path "$tmp\codigo.zip" -DestinationPath "$tmp\x" -Force
  $pasta = Get-ChildItem "$tmp\x" -Directory | Select-Object -First 1
  if (-not (Test-Path (Join-Path $pasta.FullName 'server.js'))) { throw 'zip sem server.js; nada trocado' }
  Set-Content -Encoding ASCII (Join-Path $pasta.FullName '.versao') $sha
  Stop-ScheduledTask -TaskName 'Suprema Blog - Servidor' -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*$App\server.js*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Start-Sleep -Seconds 2
  $velho = "$App.anterior"
  if (Test-Path $velho) { Remove-Item -Recurse -Force $velho }
  Rename-Item $App (Split-Path $velho -Leaf)
  Move-Item $pasta.FullName $App
  Remove-Item -Recurse -Force $tmp
  Log "zip $($atual.Substring(0, [Math]::Min(7, $atual.Length))) -> $($sha.Substring(0,7)); reiniciando"
  Reiniciar
} catch {
  Log "ERRO: $($_.Exception.Message)"
  exit 1
}
