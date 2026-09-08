param(
  [int]$Port = 8088,
  [string]$SpringProfile = 'mysql',
  [string]$NgrokAuthtoken = $env:NGROK_AUTHTOKEN
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$serverDir = Join-Path $repoRoot 'server'

function Stop-ProcessPair {
  param(
    [int]$BackendId,
    [int]$NgrokId
  )

  if ($NgrokId) {
    $proc = Get-Process -Id $NgrokId -ErrorAction SilentlyContinue
    if ($proc) { Stop-Process -Id $NgrokId -Force -ErrorAction SilentlyContinue }
  }

  if ($BackendId) {
    $proc = Get-Process -Id $BackendId -ErrorAction SilentlyContinue
    if ($proc) { Stop-Process -Id $BackendId -Force -ErrorAction SilentlyContinue }
  }
}

if (-not (Get-Command 'mvn' -ErrorAction SilentlyContinue)) {
  throw 'Maven not found: please install Maven and add mvn to PATH.'
}

if ([string]::IsNullOrWhiteSpace($NgrokAuthtoken)) {
  $NgrokAuthtoken = Read-Host 'Please input ngrok authtoken (env NGROK_AUTHTOKEN not found)'
}
if ([string]::IsNullOrWhiteSpace($NgrokAuthtoken)) {
  throw 'No ngrok token provided. Set NGROK_AUTHTOKEN or pass -NgrokAuthtoken.'
}

$ngrokExe = Get-Command 'ngrok' -ErrorAction SilentlyContinue
if (-not $ngrokExe) {
  throw 'ngrok not found: install ngrok and put it in PATH first.'
}

$activeProfile = $SpringProfile.Trim().ToLower()
if ($activeProfile -eq 'mysql') {
  $missing = @()
  if (-not $env:COMPOSITION_DB_URL) { $missing += 'COMPOSITION_DB_URL' }
  if (-not $env:COMPOSITION_DB_USERNAME) { $missing += 'COMPOSITION_DB_USERNAME' }
  if (-not $env:COMPOSITION_DB_PASSWORD) { $missing += 'COMPOSITION_DB_PASSWORD' }
  if ($missing.Count -gt 0) {
    throw ('mysql profile requires env vars: ' + ($missing -join ', ') + '. Set them before running.')
  }
}

$backend = Start-Process -FilePath 'mvn' `
  -ArgumentList @('-f', 'pom.xml', '-Dserver.port=' + $Port, '-Dspring-boot.run.profiles=' + $activeProfile, 'spring-boot:run') `
  -WorkingDirectory $serverDir `
  -PassThru

$ngrok = $null

try {
  Write-Host "[1/3] Backend started, PID=$($backend.Id). Waiting for / to become available on port $Port..."

  $serviceReady = $false
  for ($i = 0; $i -lt 45; $i++) {
    try {
      $res = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 2
      if ($res.StatusCode -ge 200 -and $res.StatusCode -lt 500) {
        $serviceReady = $true
        break
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  if (-not $serviceReady) {
    throw 'Backend startup timeout: no response within 45 seconds.'
  }

  $lanIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike '*Loopback*' -and $_.AddressState -eq 'Preferred' } | Select-Object -First 1 -ExpandProperty IPAddress)
  if ($lanIp) {
    Write-Host "[2/3] LAN URL: http://${lanIp}:$Port"
  }

  Write-Host '[2/3] Configure ngrok token...'
  & $ngrokExe.Source 'config' 'add-authtoken' $NgrokAuthtoken | Out-Null

  Write-Host '[3/3] Starting public tunnel. Keep this window open to keep both services alive.'
  $ngrok = Start-Process -FilePath $ngrokExe.Source `
    -ArgumentList @('http', $Port, '--log', 'stdout') `
    -WorkingDirectory $repoRoot `
    -PassThru

  $publicUrl = $null
  for ($i = 0; $i -lt 45; $i++) {
    try {
      $tunnels = Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 2
      foreach ($t in $tunnels.tunnels) {
        if ($t.public_url) {
          $publicUrl = $t.public_url
          break
        }
      }
    } catch {
      Start-Sleep -Seconds 1
    }

    if ($publicUrl) { break }
    Start-Sleep -Seconds 1
  }

  if ($publicUrl) {
    Write-Host ''
    Write-Host "Public URL: $publicUrl"
  } else {
    Write-Host ''
    Write-Host 'Public URL not found from ngrok API in 45 seconds. Please check token/permissions/4040 conflicts.'
  }

  Write-Host ''
  Write-Host 'Press Ctrl + C to stop. Both backend and tunnel will exit together.'
  Wait-Process -Id $ngrok.Id
} finally {
  Stop-ProcessPair -BackendId $backend.Id -NgrokId ($ngrok.Id)
}
