[CmdletBinding()]
param([int]$Port = 8766, [switch]$NonInteractive)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path $PSScriptRoot).ProviderPath
$runtimeNode = Join-Path $root 'runtime/node.exe'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$node = if (Test-Path -LiteralPath $runtimeNode -PathType Leaf) { $runtimeNode } elseif ($nodeCommand) { $nodeCommand.Source } else { $null }
if (-not $node) { throw '未找到 Node.js 24。请使用包含 runtime/node.exe 的发布包，或安装 Node.js 24 及以上版本。' }
$version = (& $node --version).Trim()
if ($version -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 24) { throw ('Node.js 版本过低：' + $version + '；需要 24 或更高版本。') }
$local = 'http://127.0.0.1:' + $Port
$data = Join-Path $root '.local'
New-Item -ItemType Directory -Force -Path $data | Out-Null
$oldPort = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($oldPort) {
    try {
        $info = Invoke-RestMethod -Uri ($local + '/api/info') -TimeoutSec 2 -ErrorAction Stop
        if ($info.version -match '^v\d+\.\d+\.\d+$') {
            Write-Host ('工作台已在运行：' + $local) -ForegroundColor Green
            if (-not $NonInteractive) { [void](Read-Host '按回车关闭窗口，服务会继续运行') }
            exit 0
        }
    } catch { throw ('端口 ' + $Port + ' 已由其他程序占用，未结束该程序。') }
}
$env:PORT = [string]$Port
$process = Start-Process -FilePath $node -ArgumentList ('"' + (Join-Path $root 'server.mjs') + '"') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $data 'server.out.log') -RedirectStandardError (Join-Path $data 'server.err.log') -PassThru
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    $process.Refresh()
    if ($process.HasExited) { throw '服务启动后退出，请查看 .local/server.err.log。' }
    try { $info = Invoke-RestMethod -Uri ($local + '/api/info') -TimeoutSec 2 -ErrorAction Stop; if ($info.version) { $ready = $true; break } } catch {}
}
if (-not $ready) { try { $process.Kill() } catch {}; throw '服务未通过健康检查，请查看 .local/server.err.log。' }
Write-Host ('冯如学媒协作工作台已启动：' + $local) -ForegroundColor Green
Write-Host ('数据与日志：' + $data)
if (-not $NonInteractive) { [void](Read-Host '按回车关闭窗口，服务会继续运行') }
