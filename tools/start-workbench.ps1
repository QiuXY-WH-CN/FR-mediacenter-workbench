[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)][int]$Port = 8766,
    [switch]$Stop,
    [switch]$NonInteractive
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$data = Join-Path $root '.local'
New-Item -ItemType Directory -Force -Path $data | Out-Null
$stateFile = Join-Path $data 'launcher.json'
$tokenFile = Join-Path $data 'setup-token.txt'

function New-RandomHex([int]$Length) {
    $bytes = New-Object byte[] $Length
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($bytes) } finally { $random.Dispose() }
    [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}

function Get-RunningWorkbench {
    if (-not (Test-Path -LiteralPath $stateFile)) { return }
    try {
        $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
        if ($state.port -lt 1024 -or $state.port -gt 65535 -or $state.key -notmatch '^[0-9a-f]{64}$') { return }
        $url = 'http://127.0.0.1:' + $state.port
        $challenge = New-RandomHex 16
        $health = Invoke-RestMethod -Uri ($url + '/__local/health?challenge=' + $challenge) -TimeoutSec 1
        $hmac = New-Object Security.Cryptography.HMACSHA256
        try {
            $hmac.Key = [Text.Encoding]::ASCII.GetBytes([string]$state.key)
            $proof = [BitConverter]::ToString($hmac.ComputeHash([Text.Encoding]::ASCII.GetBytes($challenge))).Replace('-', '')
            if ($health.proof -eq $proof) { return @{ Url = $url; Headers = @{ 'X-Workbench-Run-Key' = [string]$state.key } } }
        } finally { $hmac.Dispose() }
    } catch {}
}

# Windows PowerShell's exclusive file handle coordinates launchers across sessions.
$lock = [IO.File]::Open((Join-Path $data 'launcher.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
try {
    $running = Get-RunningWorkbench
    if ($Stop) {
        if ($running) {
            Invoke-WebRequest -Uri ($running.Url + '/__local/stop') -Method Post -Headers $running.Headers -TimeoutSec 3 -UseBasicParsing | Out-Null
            for ($i = 0; $i -lt 20 -and (Get-RunningWorkbench); $i++) { Start-Sleep -Milliseconds 250 }
            if (Get-RunningWorkbench) { throw '工作台仍在处理请求，请稍后再停止。' }
        }
        Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
        Write-Host '工作台已停止。'
        return
    }

    if (-not $running) {
        $listeners = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
        if ($listeners.Port -contains $Port) { throw ('端口 ' + $Port + ' 已被其他程序占用。') }

        $node = Join-Path $root 'runtime/node.exe'
        if (-not (Test-Path -LiteralPath $node -PathType Leaf)) {
            $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
            if (-not $nodeCommand) { throw '请使用包含 Node.js 的安装包，或安装 Node.js 24 及以上版本。' }
            $node = $nodeCommand.Source
        }
        $version = (& $node --version).Trim()
        if ($version -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 24) { throw '工作台要求 Node.js 24 或更高版本。' }

        $key = New-RandomHex 32
        @{ key = $key; port = $Port } | ConvertTo-Json -Compress | Set-Content -LiteralPath $stateFile -Encoding Ascii

        $oldPort = $env:PORT
        $oldRunKey = $env:WORKBENCH_LOCAL_RUN_KEY
        try {
            $env:PORT = [string]$Port
            $env:WORKBENCH_LOCAL_RUN_KEY = $key
            $entry = '"' + (Join-Path $root 'server.mjs') + '" --windows-local'
            $proc = Start-Process -FilePath $node -ArgumentList $entry -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $data 'server.out.log') -RedirectStandardError (Join-Path $data 'server.err.log') -PassThru
        } finally {
            $env:PORT = $oldPort
            $env:WORKBENCH_LOCAL_RUN_KEY = $oldRunKey
        }
        for ($i = 0; $i -lt 40; $i++) {
            Start-Sleep -Milliseconds 250
            $proc.Refresh()
            if ($proc.HasExited) { break }
            $running = Get-RunningWorkbench
            if ($running) { break }
        }
        if (-not $running) {
            if (-not $proc.HasExited) { $proc.Kill() }
            Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
            throw '服务启动失败，请查看 .local/server.err.log。'
        }
    }

    $local = $running.Url
    $info = Invoke-RestMethod -Uri ($local + '/api/info') -TimeoutSec 3
    Write-Host ('冯如学媒协作工作台 ' + $info.version + '：' + $local) -ForegroundColor Green
    if (-not $NonInteractive) {
        $destination = $local + '/'
        if (-not $info.initialized -and (Test-Path -LiteralPath $tokenFile)) {
            $token = (Get-Content -LiteralPath $tokenFile -Raw).Trim()
            if ($token -match '^[0-9a-f]{64}$') { $destination += '#setup=' + $token }
        }
        Start-Process -FilePath $destination
    }
} finally {
    $lock.Dispose()
}
