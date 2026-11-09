# OCR do próprio Windows (Windows.Media.Ocr), sem instalar nada. Lê as imagens passadas e imprime uma linha JSON por imagem:
#   {"arquivo": "...", "palavras": ["...", ...]}
# Usado pelo afiliacao-capas.mjs para reprovar foto gerada por IA com texto falso (placa, prancheta, embalagem, tela).
#   powershell -NoProfile -ExecutionPolicy Bypass -File ocr-windows.ps1 <imagem1> [<imagem2> ...]
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Imagens)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Esperar($op, [Type]$tipo) { $t = $asTask.MakeGenericMethod($tipo).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
$motor = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $motor) { $motor = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('en-US')) }
foreach ($img in $Imagens) {
  try {
    $arq = Esperar ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path $img).ProviderPath)) ([Windows.Storage.StorageFile])
    $fluxo = Esperar ($arq.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $dec = Esperar ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($fluxo)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bmp = Esperar ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $res = Esperar ($motor.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
    $palavras = @($res.Lines | ForEach-Object { $_.Words } | ForEach-Object { $_.Text })
    $fluxo.Dispose()
    [pscustomobject]@{ arquivo = $img; palavras = $palavras } | ConvertTo-Json -Compress
  } catch { [pscustomobject]@{ arquivo = $img; erro = $_.Exception.Message } | ConvertTo-Json -Compress }
}
