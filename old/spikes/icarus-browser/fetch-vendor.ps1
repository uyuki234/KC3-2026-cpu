$ErrorActionPreference = 'Stop'
$revision = 'a275a9ac28c59db1130505973644c9a3754ec1d7'
$vendorPath = Join-Path $PSScriptRoot 'vendor'
New-Item -ItemType Directory -Force -Path $vendorPath | Out-Null
foreach ($name in @('ivlpp.js','ivlpp.wasm','ivl.js','ivl.wasm','vvp.js','vvp.wasm','LICENSE','README.md')) {
  Invoke-WebRequest -Uri "https://raw.githubusercontent.com/senolgulgonul/verisim/$revision/$name" -OutFile (Join-Path $vendorPath $name)
}
Get-ChildItem -LiteralPath $vendorPath | Select-Object Name,Length
