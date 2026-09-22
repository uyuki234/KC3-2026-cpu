param(
  [string]$Browser = 'C:\Program Files\Google\Chrome\Application\chrome.exe',
  [int]$Port = 8097
)
$ErrorActionPreference = 'Stop'
$artifactPath = Join-Path $PSScriptRoot 'artifacts'
New-Item -ItemType Directory -Force -Path $artifactPath | Out-Null
$resultPath = Join-Path $artifactPath 'results.json'
$started = [DateTime]::UtcNow
$profilePath = Join-Path $artifactPath ('browser-profile-' + [guid]::NewGuid().ToString('N'))
$serverProcess = $null
$browserProcess = $null
try {
  $serverProcess = Start-Process -FilePath (Get-Command pwsh).Source -ArgumentList @(
    '-NoProfile', '-File', ('"' + (Join-Path $PSScriptRoot 'serve.ps1') + '"'), '-Port', $Port
  ) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $artifactPath 'server.log') -RedirectStandardError (Join-Path $artifactPath 'server-error.log')
  $readyDeadline = [DateTime]::UtcNow.AddSeconds(5)
  do {
    if ($serverProcess.HasExited) { throw 'Probe server failed to start; see artifacts/server-error.log' }
    if ((Get-Content (Join-Path $artifactPath 'server.log') -Raw -ErrorAction SilentlyContinue) -match 'Probe server:') { break }
    Start-Sleep -Milliseconds 100
  } while ([DateTime]::UtcNow -lt $readyDeadline)
  $browserProcess = Start-Process -FilePath $Browser -ArgumentList @(
    '--headless', '--disable-gpu', '--no-first-run', '--disable-background-networking',
    ('--user-data-dir="' + $profilePath + '"'), '--remote-debugging-port=0', "http://127.0.0.1:$Port/"
  ) -WindowStyle Hidden -PassThru
  $deadline = [DateTime]::UtcNow.AddSeconds(60)
  $freshResult = $false
  while ([DateTime]::UtcNow -lt $deadline) {
    if ((Test-Path -LiteralPath $resultPath) -and (Get-Item -LiteralPath $resultPath).LastWriteTimeUtc -gt $started) {
      $freshResult = $true
      break
    }
    Start-Sleep -Milliseconds 200
  }
  if (!$freshResult) { throw 'Browser probe did not produce a result within 60 seconds' }
  $report = Get-Content -LiteralPath $resultPath -Raw
  Write-Output $report
  if (($report | ConvertFrom-Json).status -ne 'PASS') { throw 'One or more probe checks failed' }
} finally {
  foreach ($probeProcess in @($browserProcess, $serverProcess)) {
    if ($null -ne $probeProcess -and !$probeProcess.HasExited) { Stop-Process -Id $probeProcess.Id -ErrorAction SilentlyContinue }
  }
}
