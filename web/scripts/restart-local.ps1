$ErrorActionPreference = 'Stop'
$webRoot = Split-Path -Parent $PSScriptRoot
$nodeCommand = (Get-Command node.exe).Source
Push-Location $webRoot
try {
    & $nodeCommand scripts/build.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Build failed; current server retained.' }
    & $nodeCommand scripts/backup.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Database backup failed; server was not restarted.' }
    $listeners = Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue
    foreach ($serverId in ($listeners.OwningProcess | Select-Object -Unique)) {
        $serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$serverId"
        if ($serverProcess.Name -ne 'node.exe' -or $serverProcess.CommandLine -notmatch 'scripts[/\\]dev\.mjs') {
            throw "Port 8766 is occupied by an unrelated process: $serverId"
        }
        Stop-Process -Id $serverId
    }
    Start-Sleep -Milliseconds 500
    $started = Start-Process -FilePath $nodeCommand -ArgumentList 'scripts/dev.mjs' -WorkingDirectory $webRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $webRoot '.local/server.out.log') -RedirectStandardError (Join-Path $webRoot '.local/server.err.log') -PassThru
    Write-Output "Updated workbench server started: $($started.Id)"
} finally { Pop-Location }
