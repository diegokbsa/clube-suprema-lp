# Roda a cada 10 min (tarefa "Suprema Blog - Atualizar", criada por instalar-suprema-blog.ps1).
# Se o branch main tem commit novo (post automático, correção), baixa e reinicia o servidor: o mesmo que o Render fazia
# a cada push. Depois confere /healthz; se a versão nova não subir em 60 s, volta sozinho para a anterior.
# Sem commit novo, não faz nada. Registro em <dados>\atualizar.log.
# Acesso ao GitHub (repositório privado): <dados>\github-token.txt (token fine-grained só de leitura do repositório),
# se existir; senão o login do gh do usuário que roda a tarefa (a tarefa roda com o usuário que instalou, não como SYSTEM).
param(
  [string]$App = 'E:\LioraServidor\apps\suprema-blog',
  [string]$Dados = 'E:\LioraServidor\dados\suprema-blog',
  [string]$Branch = 'main',
  [string]$Repo = 'https://github.com/diegokbsa/clube-suprema-lp.git',
  [int]$Porta = 3410
)
$ErrorActionPreference = 'Stop'
$log = Join-Path $Dados 'atualizar.log'
function Log($t) { "$(Get-Date -Format s) $t" | Add-Content -Encoding UTF8 $log }

function Parar {
  Stop-ScheduledTask -TaskName 'Suprema Blog - Servidor' -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*$App\server.js*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -like '*iniciar-suprema-blog.cmd*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Start-Sleep -Seconds 2
}
function Subiu {
  Start-ScheduledTask -TaskName 'Suprema Blog - Servidor'
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    try { if ((Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Porta/healthz" -TimeoutSec 3).StatusCode -eq 200) { return $true } } catch { }
  }
  return $false
}
function Token {
  $tf = Join-Path $Dados 'github-token.txt'
  if (Test-Path $tf) { return (Get-Content $tf -Raw).Trim() }
  $gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
  if (-not $gh) { throw 'sem github-token.txt e sem gh' }
  $t = (& $gh auth token 2>$null)
  if (-not $t) { throw 'o gh deste usuário não devolveu token (login do gh ou github-token.txt)' }
  return $t.Trim()
}

$qf = Join-Path $Dados 'ultimo-quebrado.txt'
$quebrado = if (Test-Path $qf) { (Get-Content $qf -Raw).Trim() } else { '' }

try {
  $git = (Get-Command git -ErrorAction SilentlyContinue).Source
  if ($git -and (Test-Path (Join-Path $App '.git'))) {
    & $git -C $App fetch -q origin $Branch 2>$null
    $atual = (& $git -C $App rev-parse HEAD).Trim()
    $novo = (& $git -C $App rev-parse "origin/$Branch").Trim()
    if ($atual -eq $novo -or $novo -eq $quebrado) { exit 0 }
    Parar
    & $git -C $App reset -q --hard "origin/$Branch"
    if (Subiu) { Log "git $($atual.Substring(0,7)) -> $($novo.Substring(0,7)): no ar"; exit 0 }
    Parar
    & $git -C $App reset -q --hard $atual
    $volta = Subiu
    Set-Content -Encoding ASCII $qf $novo
    Log "ERRO: $($novo.Substring(0,7)) não respondeu /healthz; voltei para $($atual.Substring(0,7)) ($(if ($volta) { 'no ar' } else { 'TAMBÉM NÃO SUBIU' }))"
    exit 1
  }

  $repoPath = ($Repo -replace '^https://github.com/', '' -replace '\.git$', '')
  $h = @{ Authorization = "Bearer $(Token)"; 'User-Agent' = 'KBSA-Homelab/1.0' }
  $sha = (Invoke-RestMethod -Uri "https://api.github.com/repos/$repoPath/commits/$Branch" -Headers $h).sha
  $vf = Join-Path $App '.versao'
  $atual = if (Test-Path $vf) { (Get-Content $vf -Raw).Trim() } else { '' }
  if ($atual -eq $sha -or $sha -eq $quebrado) { exit 0 }
  $tmp = Join-Path $env:TEMP "suprema-blog-upd-$(Get-Date -Format yyyyMMddHHmmss)"
  New-Item -ItemType Directory -Force $tmp | Out-Null
  Invoke-WebRequest -UseBasicParsing -Uri "https://api.github.com/repos/$repoPath/zipball/$sha" -Headers $h -OutFile "$tmp\codigo.zip"
  Remove-Variable h
  Expand-Archive -Path "$tmp\codigo.zip" -DestinationPath "$tmp\x" -Force
  $pasta = Get-ChildItem "$tmp\x" -Directory | Select-Object -First 1
  if (-not (Test-Path (Join-Path $pasta.FullName 'server.js'))) { throw 'zip sem server.js; nada trocado' }
  Set-Content -Encoding ASCII (Join-Path $pasta.FullName '.versao') $sha
  Parar
  $velho = "$App.anterior"
  if (Test-Path $velho) { Remove-Item -Recurse -Force $velho }
  Rename-Item $App (Split-Path $velho -Leaf)
  Move-Item $pasta.FullName $App
  Remove-Item -Recurse -Force $tmp
  $de = $atual.Substring(0, [Math]::Min(7, $atual.Length))
  if (Subiu) { Log "zip $de -> $($sha.Substring(0,7)): no ar"; exit 0 }
  # a versão nova não subiu: volta a anterior e guarda a quebrada em <App>.quebrada para olhar depois
  Parar
  $quebrada = "$App.quebrada"
  if (Test-Path $quebrada) { Remove-Item -Recurse -Force $quebrada }
  Rename-Item $App (Split-Path $quebrada -Leaf)
  Rename-Item $velho (Split-Path $App -Leaf)
  $volta = Subiu
  Log "ERRO: $($sha.Substring(0,7)) não respondeu /healthz; voltei para $de ($(if ($volta) { 'no ar' } else { 'TAMBÉM NÃO SUBIU' })). Próxima rodada tenta de novo só com commit mais novo."
  Set-Content -Encoding ASCII $qf $sha
  exit 1
} catch {
  Log "ERRO: $($_.Exception.Message)"
  exit 1
}
