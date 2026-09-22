$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

# Prefer a normal Node.js installation, then this workspace's portable copy.
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $toolsDir = Join-Path $projectRoot '.tools'
    $portable = Get-ChildItem -LiteralPath $toolsDir -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like 'node-v*-win-x64' -and (Test-Path -LiteralPath (Join-Path $_.FullName 'node.exe')) } |
        Sort-Object Name -Descending |
        Select-Object -First 1
    if (-not $portable) { throw 'Node.js 24 LTSをインストールしてから再実行してください。' }
    $env:PATH = $portable.FullName + [IO.Path]::PathSeparator + $env:PATH
}
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
& npm.cmd run dev
exit $LASTEXITCODE
