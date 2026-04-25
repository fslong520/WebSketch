param(
  [string]$OutputDir = "dist"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifestPath = Join-Path $root "manifest.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version

$distDir = Join-Path $root $OutputDir
$extensionDir = Join-Path $distDir "chrome-extension"
$zipPath = Join-Path $distDir ("websketch-v{0}.zip" -f $version)

if (Test-Path $extensionDir) {
  Remove-Item -Recurse -Force $extensionDir
}

if (!(Test-Path $distDir)) {
  New-Item -ItemType Directory -Path $distDir | Out-Null
}

New-Item -ItemType Directory -Path $extensionDir | Out-Null

$includePaths = @(
  "manifest.json",
  "_locales",
  "assets",
  "background",
  "content",
  "popup"
)

foreach ($path in $includePaths) {
  Copy-Item -Path (Join-Path $root $path) -Destination $extensionDir -Recurse -Force
}

if (Test-Path $zipPath) {
  Remove-Item -Force $zipPath
}

Compress-Archive -Path (Join-Path $extensionDir "*") -DestinationPath $zipPath -Force

Write-Host ""
Write-Host "Build complete"
Write-Host ("Extension dir: {0}" -f $extensionDir)
Write-Host ("Zip file: {0}" -f $zipPath)
Write-Host ""
Write-Host "Chrome install:"
Write-Host "1. Open chrome://extensions/"
Write-Host "2. Enable Developer mode"
Write-Host "3. Click Load unpacked"
Write-Host ("4. Pick: {0}" -f $extensionDir)
