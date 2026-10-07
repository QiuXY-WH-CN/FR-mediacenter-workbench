# Safe shared startup helpers. Dot-sourcing has no side effects. Windows PowerShell 5.1 compatible.
function ConvertTo-WorkbenchArgument {
    param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value)
    $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
    $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
    return '"' + $escaped + '"'
}

function Get-WorkbenchNode {
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    $nodePath = if ($command) { $command.Source } else { 'C:\Program Files\nodejs\node.exe' }
    if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf)) { throw '未找到 Node.js，请安装 Node.js 24 或更高版本。' }
    $version = & $nodePath --version
    if ($LASTEXITCODE -ne 0 -or $version -notmatch '^v(\d+)\.') { throw '无法读取 Node.js 版本。' }
    if ([int]$Matches[1] -lt 24) { throw ('Node.js 版本过低：' + $version + '，此项目需要 Node.js 24 或更高版本。') }
    return $nodePath
}

function Get-WorkbenchHealth {
    param([string]$Url, [int]$TimeoutSeconds = 3)
    try {
        $info = Invoke-RestMethod -Uri ($Url.TrimEnd('/') + '/api/info') -TimeoutSec $TimeoutSeconds -ErrorAction Stop
        return ($info.version -match '^v\d+\.\d+\.\d+$' -and $info.departments -is [array] -and $info.PSObject.Properties.Name -contains 'initialized')
    } catch { return $false }
}

function Wait-WorkbenchHealth {
    param([string]$Url, [System.Diagnostics.Process]$StartedProcess, [int]$Attempts = 12)
    for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
        if ($StartedProcess) {
            $StartedProcess.Refresh()
            if ($StartedProcess.HasExited) { throw '网页服务启动后退出，请查看 .local/server.err.log。' }
        }
        if (Get-WorkbenchHealth -Url $Url -TimeoutSeconds 2) { return }
        Start-Sleep -Milliseconds 500
    }
    throw '网页服务未通过健康检查，请查看 .local/server.err.log。'
}

function Get-WorkbenchListeners {
    param([int]$Port)
    return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Test-WorkbenchProcess {
    param([object]$Process, [string]$WebRoot, [string]$NodePath, [int]$ExpectedProcessId = 0)
    if (-not $Process -or $Process.Name -ne 'node.exe' -or -not $Process.CommandLine) { return $false }
    if ($Process.ExecutablePath -and -not [string]::Equals($Process.ExecutablePath, $NodePath, [StringComparison]::OrdinalIgnoreCase)) { return $false }
    $devPath = Join-Path $WebRoot 'scripts/dev.mjs'
    $scriptArgument = [regex]::Escape($devPath)
    if ($Process.CommandLine -match ('(?i)^\s*(?:"[^"]+"|[^\s]+)\s+(?:"' + $scriptArgument + '"|' + $scriptArgument + ')(?:\s|$)')) { return $true }
    # Explicit migration approval for a known PID launched by an older relative-path launcher.
    return ($ExpectedProcessId -gt 0 -and $Process.ProcessId -eq $ExpectedProcessId -and $Process.CommandLine -match '(?i)(?:^|\s)"?scripts[/\\]dev\.mjs"?(?:\s|$)')
}

function Invoke-WorkbenchBuild {
    param([string]$WebRoot, [string]$NodePath)
    Push-Location -LiteralPath $WebRoot
    try {
        & $NodePath (Join-Path $WebRoot 'scripts/build.mjs') | Out-Host
        if ($LASTEXITCODE -ne 0) { throw '构建失败，原有服务未停止。' }
        if (Test-Path -LiteralPath (Join-Path $WebRoot '.local/preview.db') -PathType Leaf) {
            & $NodePath (Join-Path $WebRoot 'scripts/backup.mjs') | Out-Host
            if ($LASTEXITCODE -ne 0) { throw '数据库备份失败，原有服务未停止。' }
        }
    } finally { Pop-Location }
}

function Start-WorkbenchOrigin {
    [CmdletBinding()]
    param([string]$WebRoot, [int]$Port = 8766, [switch]$Restart, [int]$ExpectedProcessId = 0)
    $webPath = (Resolve-Path -LiteralPath $WebRoot -ErrorAction Stop).ProviderPath
    $nodePath = Get-WorkbenchNode
    $logDir = Join-Path $webPath '.local'
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $localUrl = 'http://127.0.0.1:' + $Port
    $listenerIds = @(Get-WorkbenchListeners -Port $Port)
    foreach ($serverId in $listenerIds) {
        $owner = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $serverId) -ErrorAction Stop
        if (-not (Test-WorkbenchProcess -Process $owner -WebRoot $webPath -NodePath $nodePath -ExpectedProcessId $ExpectedProcessId)) {
            throw ('端口 ' + $Port + ' 已由其他或身份无法核验的进程占用（PID ' + $serverId + '）；未结束该进程。')
        }
    }
    if (-not $Restart -and $listenerIds.Count -gt 0 -and (Get-WorkbenchHealth -Url $localUrl)) {
        Write-Host '复用已经正常运行的网页服务。'
        return [pscustomobject]@{ local = $localUrl; serverId = [int]$listenerIds[0]; reused = $true }
    }
    Invoke-WorkbenchBuild -WebRoot $webPath -NodePath $nodePath
    # Recheck ownership after building; never kill all node/port processes.
    foreach ($serverId in @(Get-WorkbenchListeners -Port $Port)) {
        $owner = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $serverId) -ErrorAction Stop
        if (-not (Test-WorkbenchProcess -Process $owner -WebRoot $webPath -NodePath $nodePath -ExpectedProcessId $ExpectedProcessId)) {
            throw ('构建期间端口被其他进程占用（PID ' + $serverId + '）；该进程未停止。')
        }
        Stop-Process -Id $serverId -ErrorAction Stop
        Wait-Process -Id $serverId -Timeout 5 -ErrorAction SilentlyContinue
    }
    $oldPort = $env:PORT
    try {
        $env:PORT = [string]$Port
        $process = Start-Process -FilePath $nodePath -ArgumentList (ConvertTo-WorkbenchArgument (Join-Path $webPath 'scripts/dev.mjs')) -WorkingDirectory $webPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'server.out.log') -RedirectStandardError (Join-Path $logDir 'server.err.log') -PassThru -ErrorAction Stop
    } finally { $env:PORT = $oldPort }
    try { Wait-WorkbenchHealth -Url $localUrl -StartedProcess $process }
    catch {
        $process.Refresh()
        if (-not $process.HasExited) { $process.Kill() }
        throw
    }
    [pscustomobject]@{ processId = $process.Id; script = (Join-Path $webPath 'scripts/dev.mjs') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logDir 'server-process.json') -Encoding UTF8
    return [pscustomobject]@{ local = $localUrl; serverId = $process.Id; reused = $false }
}

function Test-WorkbenchTunnelConfig {
    param([string]$ConfigPath, [string]$WebRoot)
    if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) { return $false }
    # Check field syntax and existence only. Never open credential JSON or print its contents.
    $config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 -ErrorAction Stop
    $tunnel = [regex]::Match($config, '(?m)^\s*tunnel:\s*["'']?([a-zA-Z0-9_-]+)["'']?\s*$')
    $credentials = [regex]::Match($config, '(?m)^\s*credentials-file:\s*(.+?)\s*$')
    if (-not $tunnel.Success -or $tunnel.Groups[1].Value -match '(?i)YOUR|PLACEHOLDER' -or -not $credentials.Success) { return $false }
    $credentialPath = [Environment]::ExpandEnvironmentVariables($credentials.Groups[1].Value.Trim().Trim('"').Trim("'"))
    if ($credentialPath.StartsWith('~/') -or $credentialPath.StartsWith('~\')) { $credentialPath = Join-Path ([Environment]::GetFolderPath('UserProfile')) $credentialPath.Substring(2) }
    if (-not [IO.Path]::IsPathRooted($credentialPath)) { $credentialPath = Join-Path $WebRoot $credentialPath }
    return (Test-Path -LiteralPath $credentialPath -PathType Leaf)
}

function Start-WorkbenchTunnel {
    param([string]$WebRoot, [string]$LocalUrl, [switch]$QuickTunnel)
    $logDir = Join-Path $WebRoot '.local'
    $configPath = Join-Path $WebRoot 'cloudflared-config.yml'
    $named = Test-WorkbenchTunnelConfig -ConfigPath $configPath -WebRoot $WebRoot
    if (-not $named -and -not $QuickTunnel) { Write-Warning '固定公网隧道未配置；本机仍可访问。需要临时隧道时使用 -QuickTunnel。'; return $false }
    $cfCommand = Get-Command cloudflared.exe -ErrorAction SilentlyContinue
    $cfPath = if ($cfCommand) { $cfCommand.Source } else { 'C:\Program Files (x86)\cloudflared\cloudflared.exe' }
    if (-not (Test-Path -LiteralPath $cfPath -PathType Leaf)) { Write-Warning '未找到 cloudflared，本机服务已正常启动。'; return $false }
    foreach ($cfProcess in @(Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction Stop)) {
        if (-not $cfProcess.CommandLine) { continue }
        if ($named -and $cfProcess.CommandLine.IndexOf($configPath, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and $cfProcess.CommandLine -match '(?i)\brun\b') {
            Write-Host '复用当前工作区的固定公网隧道。'
            return $true
        }
        if (-not $named -and $cfProcess.CommandLine.IndexOf($LocalUrl, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and $cfProcess.CommandLine -match '(?i)--url') { return $true }
    }
    if ($named) { $arguments = 'tunnel --config ' + (ConvertTo-WorkbenchArgument $configPath) + ' run'; $name = 'cloudflared-domain' }
    else { $arguments = 'tunnel --url ' + (ConvertTo-WorkbenchArgument $LocalUrl) + ' --no-autoupdate'; $name = 'cloudflared-quick' }
    $cfProcess = Start-Process -FilePath $cfPath -ArgumentList $arguments -WorkingDirectory $WebRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir ($name + '.out.log')) -RedirectStandardError (Join-Path $logDir ($name + '.err.log')) -PassThru -ErrorAction Stop
    Start-Sleep -Milliseconds 500
    $cfProcess.Refresh()
    if ($cfProcess.HasExited) { Write-Warning ('公网隧道退出，请查看 .local/' + $name + '.err.log。'); return $false }
    return $true
}

function Start-WorkbenchServices {
    [CmdletBinding()]
    param([string]$WebRoot, [int]$Port = 8766, [switch]$Restart, [int]$ExpectedProcessId = 0, [switch]$IncludeTunnel, [switch]$QuickTunnel)
    $webPath = (Resolve-Path -LiteralPath $WebRoot -ErrorAction Stop).ProviderPath
    $origin = Start-WorkbenchOrigin -WebRoot $webPath -Port $Port -Restart:$Restart -ExpectedProcessId $ExpectedProcessId
    $tunnelStarted = $false
    $domainReady = $false
    $namedTunnel = $false
    $publicUrl = 'https://fengrumedia.dpdns.org'
    if ($IncludeTunnel) {
        try { $tunnelStarted = Start-WorkbenchTunnel -WebRoot $webPath -LocalUrl $origin.local -QuickTunnel:$QuickTunnel }
        catch { Write-Warning '公网隧道启动失败，本机仍可访问。请检查 .local/cloudflared-domain.err.log。' }
        $namedTunnel = Test-WorkbenchTunnelConfig -ConfigPath (Join-Path $webPath 'cloudflared-config.yml') -WebRoot $webPath
        if ($tunnelStarted -and $namedTunnel) { $domainReady = Get-WorkbenchHealth -Url $publicUrl -TimeoutSeconds 8 }
    }
    $status = [pscustomobject]@{ local = $origin.local; localReady = $true; serverId = $origin.serverId; domain = $publicUrl; domainReady = [bool]$domainReady; tunnelStarted = [bool]$tunnelStarted; namedTunnel = [bool]$namedTunnel; updatedAt = (Get-Date -Format s) }
    $status | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $webPath '.local/cloud-status.json') -Encoding UTF8
    return $status
}
