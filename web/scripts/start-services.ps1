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
    param([string]$WebRoot, [string]$NodePath, [switch]$SkipBuild)
    Push-Location -LiteralPath $WebRoot
    try {
        if (-not $SkipBuild) {
            & $NodePath (Join-Path $WebRoot 'scripts/build.mjs') | Out-Host
            if ($LASTEXITCODE -ne 0) { throw '构建失败，原有服务未停止。' }
        }
        if (Test-Path -LiteralPath (Join-Path $WebRoot '.local/preview.db') -PathType Leaf) {
            & $NodePath (Join-Path $WebRoot 'scripts/backup.mjs') | Out-Host
            if ($LASTEXITCODE -ne 0) { throw '数据库备份失败，原有服务未停止。' }
        }
    } finally { Pop-Location }
}

function Save-WorkbenchBundleSnapshot {
    param([string]$WebRoot)
    $bundle = Join-Path $WebRoot 'dist/server/index.js'
    $lastGood = Join-Path $WebRoot '.local/last-good/index.js'
    # Prefer a bundle verified by a previous successful launch, even if a separate build already overwrote dist.
    if (Test-Path -LiteralPath $lastGood -PathType Leaf) { $bundle = $lastGood }
    if (-not (Test-Path -LiteralPath $bundle -PathType Leaf)) { return $null }
    $folder = Join-Path $WebRoot ('.local/deployments/' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $folder | Out-Null
    $snapshot = Join-Path $folder 'index.js'
    Copy-Item -LiteralPath $bundle -Destination $snapshot -ErrorAction Stop
    return $snapshot
}

function Get-WorkbenchRollbackBundle {
    param([string]$WebRoot)
    $receipt = Join-Path $WebRoot '.local/previous-deployment.json'
    if (-not (Test-Path -LiteralPath $receipt)) { throw '没有可回滚的上一版服务构建。' }
    $saved = Get-Content -LiteralPath $receipt -Raw -Encoding UTF8 | ConvertFrom-Json
    $candidate = [IO.Path]::GetFullPath((Join-Path $WebRoot $saved.bundle))
    $allowed = [IO.Path]::GetFullPath((Join-Path $WebRoot '.local/deployments')) + [IO.Path]::DirectorySeparatorChar
    if (-not $candidate.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw '回滚记录无效，未修改服务或数据库。' }
    return $candidate
}

function Start-WorkbenchNodeProcess {
    param([string]$WebRoot, [string]$NodePath, [int]$Port, [switch]$ReadOnly)
    $logDir = Join-Path $WebRoot '.local'
    $oldPort = $env:PORT
    $oldReadOnly = $env:WORKBENCH_ROLLBACK_READONLY
    try {
        $env:PORT = [string]$Port
        $env:WORKBENCH_ROLLBACK_READONLY = $(if ($ReadOnly) { '1' } else { '' })
        return Start-Process -FilePath $NodePath -ArgumentList (ConvertTo-WorkbenchArgument (Join-Path $WebRoot 'scripts/dev.mjs')) -WorkingDirectory $WebRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'server.out.log') -RedirectStandardError (Join-Path $logDir 'server.err.log') -PassThru -ErrorAction Stop
    } finally { $env:PORT = $oldPort; $env:WORKBENCH_ROLLBACK_READONLY = $oldReadOnly }
}

function Confirm-WorkbenchDeployment {
    param([string]$WebRoot, [string]$PreviousBundle)
    $bundle = Join-Path $WebRoot 'dist/server/index.js'
    if (Test-Path -LiteralPath $bundle -PathType Leaf) {
        $goodDir = Join-Path $WebRoot '.local/last-good'
        New-Item -ItemType Directory -Force -Path $goodDir | Out-Null
        Copy-Item -LiteralPath $bundle -Destination (Join-Path $goodDir 'index.js') -ErrorAction Stop
    }
    if ($PreviousBundle) {
        $relative = $PreviousBundle.Substring($WebRoot.TrimEnd('\','/').Length + 1)
        [pscustomobject]@{bundle = $relative; updatedAt = (Get-Date -Format s)} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $WebRoot '.local/previous-deployment.json') -Encoding UTF8
    }
}

function Start-WorkbenchOrigin {
    [CmdletBinding()]
    param([string]$WebRoot, [int]$Port = 8766, [switch]$Restart, [int]$ExpectedProcessId = 0, [string]$RestoreBundlePath = '')
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
    if ($RestoreBundlePath) {
        $RestoreBundlePath = [IO.Path]::GetFullPath($RestoreBundlePath)
        $allowed = [IO.Path]::GetFullPath((Join-Path $webPath '.local/deployments')) + [IO.Path]::DirectorySeparatorChar
        if (-not $RestoreBundlePath.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $RestoreBundlePath -PathType Leaf)) { throw '只允许回滚本工作区的服务构建备份。' }
    }
    $previousBundle = Save-WorkbenchBundleSnapshot -WebRoot $webPath
    try {
        Invoke-WorkbenchBuild -WebRoot $webPath -NodePath $nodePath -SkipBuild:([bool]$RestoreBundlePath)
        if ($RestoreBundlePath) { Copy-Item -LiteralPath $RestoreBundlePath -Destination (Join-Path $webPath 'dist/server/index.js') -ErrorAction Stop }
    } catch {
        if ($previousBundle) { Copy-Item -LiteralPath $previousBundle -Destination (Join-Path $webPath 'dist/server/index.js') -ErrorAction Stop }
        throw
    }
    # Recheck ownership after building; never kill all node/port processes.
    foreach ($serverId in @(Get-WorkbenchListeners -Port $Port)) {
        $owner = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $serverId) -ErrorAction Stop
        if (-not (Test-WorkbenchProcess -Process $owner -WebRoot $webPath -NodePath $nodePath -ExpectedProcessId $ExpectedProcessId)) {
            throw ('构建期间端口被其他进程占用（PID ' + $serverId + '）；该进程未停止。')
        }
        Stop-Process -Id $serverId -ErrorAction Stop
        Wait-Process -Id $serverId -Timeout 5 -ErrorAction SilentlyContinue
    }
    $process = $null
    try {
        $process = Start-WorkbenchNodeProcess -WebRoot $webPath -NodePath $nodePath -Port $Port -ReadOnly:([bool]$RestoreBundlePath)
        Wait-WorkbenchHealth -Url $localUrl -StartedProcess $process
    }
    catch {
        if ($process) { $process.Refresh(); if (-not $process.HasExited) { $process.Kill(); [void]$process.WaitForExit(5000) } }
        if ($previousBundle) {
            Copy-Item -LiteralPath $previousBundle -Destination (Join-Path $webPath 'dist/server/index.js') -ErrorAction Stop
            try {
                $restored = Start-WorkbenchNodeProcess -WebRoot $webPath -NodePath $nodePath -Port $Port -ReadOnly
                Wait-WorkbenchHealth -Url $localUrl -StartedProcess $restored
                [pscustomobject]@{processId = $restored.Id; script = (Join-Path $webPath 'scripts/dev.mjs')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logDir 'server-process.json') -Encoding UTF8
            } catch {
                if ($restored) { $restored.Refresh(); if (-not $restored.HasExited) { $restored.Kill() } }
                throw '新构建启动失败；旧构建已恢复，但服务仍未通过健康检查。数据库未回滚，请查看本机日志。'
            }
            throw '新构建启动失败，已恢复旧构建并重新启动；数据库保持最新数据，没有回滚。'
        }
        throw
    }
    [pscustomobject]@{ processId = $process.Id; script = (Join-Path $webPath 'scripts/dev.mjs') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logDir 'server-process.json') -Encoding UTF8
    Confirm-WorkbenchDeployment -WebRoot $webPath -PreviousBundle $previousBundle
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
