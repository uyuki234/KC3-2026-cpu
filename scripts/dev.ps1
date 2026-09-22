$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $portable = Join-Path $projectRoot 'old/.tools/node-v24.21.0-win-x64'
    if (-not (Test-Path -LiteralPath (Join-Path $portable 'node.exe'))) { throw 'Node.js 24 LTSをインストールしてください。' }
    $env:PATH = $portable + [IO.Path]::PathSeparator + $env:PATH
}
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
& npm.cmd run dev
exit $LASTEXITCODE
