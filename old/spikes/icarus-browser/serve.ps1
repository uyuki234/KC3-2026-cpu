param([int]$Port = 8097)
$ErrorActionPreference = 'Stop'
$probeRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$artifactPath = Join-Path $probeRoot 'artifacts'
New-Item -ItemType Directory -Force -Path $artifactPath | Out-Null
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Output "Probe server: http://127.0.0.1:$Port/ (stops after receiving results or 180 seconds)"
$deadline = [DateTime]::UtcNow.AddSeconds(180)
try {
  while ([DateTime]::UtcNow -lt $deadline) {
    if (!$listener.Pending()) { Start-Sleep -Milliseconds 50; continue }
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $stream.ReadTimeout = 3000
      $header = [Collections.Generic.List[byte]]::new()
      while ($header.Count -lt 16384) {
        $nextByte = $stream.ReadByte()
        if ($nextByte -lt 0) { throw 'Disconnected request' }
        $header.Add([byte]$nextByte)
        $count = $header.Count
        if ($count -ge 4 -and $header[$count-4] -eq 13 -and $header[$count-3] -eq 10 -and $header[$count-2] -eq 13 -and $header[$count-1] -eq 10) { break }
      }
      $headerText = [Text.Encoding]::ASCII.GetString($header.ToArray())
      $request = ($headerText -split "`r`n")[0] -split ' '
      $route = ($request[1] -split '\?')[0]
      $status = '200 OK'
      $mime = 'text/plain; charset=utf-8'
      $complete = $false
      if ($request[0] -eq 'POST' -and $route -eq '/__result') {
        $lengthMatch = [regex]::Match($headerText, '(?im)^Content-Length:\s*(\d+)')
        if (!$lengthMatch.Success) { throw 'Content-Length required' }
        $length = [int]$lengthMatch.Groups[1].Value
        if ($length -gt 1048576) { throw 'Report too large' }
        $body = [byte[]]::new($length)
        $offset = 0
        while ($offset -lt $length) {
          $received = $stream.Read($body, $offset, $length - $offset)
          if ($received -le 0) { throw 'Incomplete report' }
          $offset += $received
        }
        [IO.File]::WriteAllBytes((Join-Path $artifactPath 'results.json'), $body)
        $bytes = [Text.Encoding]::UTF8.GetBytes('saved')
        $complete = $true
      } else {
        if ($route -eq '/') { $route = '/index.html' }
        $file = [IO.Path]::GetFullPath((Join-Path $probeRoot ([Uri]::UnescapeDataString($route.TrimStart('/')))))
        if (!$file.StartsWith($probeRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or !(Test-Path -LiteralPath $file -PathType Leaf)) {
          $status = '404 Not Found'
          $bytes = [Text.Encoding]::UTF8.GetBytes('not found')
        } else {
          $bytes = [IO.File]::ReadAllBytes($file)
          $mime = switch ([IO.Path]::GetExtension($file)) {
            '.html' { 'text/html; charset=utf-8' }
            '.js' { 'text/javascript; charset=utf-8' }
            '.wasm' { 'application/wasm' }
            default { 'text/plain; charset=utf-8' }
          }
        }
      }
      $responseHeader = [Text.Encoding]::ASCII.GetBytes("HTTP/1.1 $status`r`nContent-Type: $mime`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`nCache-Control: no-store`r`n`r`n")
      $stream.Write($responseHeader)
      $stream.Write($bytes)
      if ($complete) { Write-Output 'Results saved to artifacts/results.json'; break }
    } catch {
      Write-Warning $_.Exception.Message
    } finally { $client.Dispose() }
  }
} finally { $listener.Stop() }
