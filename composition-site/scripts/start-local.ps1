param([switch]$Build)
$ErrorActionPreference = 'Stop'
$sitePath = Split-Path $PSScriptRoot -Parent
$serverPath = Join-Path $sitePath 'server'
$jarPath = Join-Path $serverPath 'target\fanwenjia-server-0.1.0-SNAPSHOT.jar'
$listener = Get-NetTCPConnection -LocalPort 8088 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    $runningApp = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $listener.OwningProcess)
    if (-not $runningApp.CommandLine -or -not $runningApp.CommandLine.Contains($jarPath)) {
        throw 'Port 8088 is occupied by another process. Stop that service or choose a different port.'
    }
    if (-not $Build) {
        Write-Output 'VocabNote is already running at http://localhost:8088/'
        exit 0
    }
    # Windows locks a running JAR. Only stop the verified local application.
    Stop-Process -Id $listener.OwningProcess
    Wait-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
}
if ($Build -or -not (Test-Path -LiteralPath $jarPath)) {
    & mvn -q -f (Join-Path $serverPath 'pom.xml') -DskipTests package
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
}
$mysqlConfig = Join-Path (Split-Path $sitePath -Parent) 'mysql-runtime\my.ini'
if (-not (Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue)) {
    if (Test-Path -LiteralPath $mysqlConfig) {
        Start-Process -FilePath 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe' -ArgumentList ('--defaults-file="' + $mysqlConfig + '"') -WindowStyle Hidden | Out-Null
    }
}
$mailPath = Join-Path $serverPath 'mail-local.txt'
if (-not $env:COMPOSITION_MAIL_PASSWORD -and (Test-Path -LiteralPath $mailPath)) {
    $env:COMPOSITION_MAIL_PASSWORD = (Get-Content -Raw -LiteralPath $mailPath).Trim()
}
$javaArgs = @('-jar', ('"' + $jarPath + '"'), '--spring.config.additional-location=optional:file:./data/vocabnote-local.properties')
$javaPath = (Get-Command java).Source
if ($env:JAVA_HOME -and (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
    $javaPath = Join-Path $env:JAVA_HOME 'bin\java.exe'
}
$appProcess = Start-Process -FilePath $javaPath -ArgumentList $javaArgs -WorkingDirectory $serverPath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $serverPath 'server-run.log') -RedirectStandardError (Join-Path $serverPath 'server-error.log')
Write-Output ('VocabNote process: ' + $appProcess.Id)
$ready = $false
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    $appProcess.Refresh()
    if ($appProcess.HasExited) { throw 'VocabNote could not start. See server/server-run.log and server/server-error.log.' }
    try {
        $check = Invoke-WebRequest -Uri 'http://127.0.0.1:8088/' -TimeoutSec 1
        if ($check.StatusCode -eq 200) { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 500 }
}
if (-not $ready) { throw 'Startup is still pending. See server/server-run.log.' }
Write-Output 'VocabNote is ready: http://localhost:8088/'
Write-Output 'Local settings: server/data/vocabnote-local.properties (excluded from Git).'
