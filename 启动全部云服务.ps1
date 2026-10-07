[CmdletBinding()]
param([switch]$NonInteractive, [switch]$QuickTunnel)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$webRoot = Join-Path $root 'web'
$exitCode = 0
try {
    . (Join-Path $webRoot 'scripts/start-services.ps1')
    $status = Start-WorkbenchServices -WebRoot $webRoot -IncludeTunnel -QuickTunnel:$QuickTunnel
    Write-Host ''
    Write-Host '冯如学媒协作工作台' -ForegroundColor Cyan
    Write-Host ('本机已就绪：' + $status.local) -ForegroundColor Green
    if ($status.domainReady) {
        Write-Host ('公网已验证：' + $status.domain) -ForegroundColor Green
    } elseif ($status.tunnelStarted -and $status.namedTunnel) {
        Write-Host ('公网连接正在建立：' + $status.domain) -ForegroundColor Yellow
        Write-Host '尚未通过公网健康检查，请查看 tunnel 日志或稍后重新运行。' -ForegroundColor Yellow
    } elseif ($status.tunnelStarted) {
        Write-Host '临时公网隧道正在建立，地址请查看 .local/cloudflared-quick.err.log。' -ForegroundColor Yellow
    } else {
        Write-Host '公网隧道未启动；本机仍可访问。请查看下方日志。' -ForegroundColor Yellow
    }
    Write-Host ('日志目录：' + (Join-Path $webRoot '.local'))
} catch {
    $exitCode = 1
    $message = '启动失败：' + $_.Exception.Message
    Write-Host $message -ForegroundColor Red
    try {
        $logDir = Join-Path $webRoot '.local'
        New-Item -ItemType Directory -Force -Path $logDir | Out-Null
        Add-Content -LiteralPath (Join-Path $logDir 'startup.err.log') -Value ((Get-Date -Format s) + ' ' + $message) -Encoding UTF8
        Write-Host ('错误日志：' + (Join-Path $logDir 'startup.err.log'))
    } catch { Write-Host '无法写入错误日志，请保留此窗口的信息。' -ForegroundColor Red }
}
if (-not $NonInteractive) { [void](Read-Host '按回车关闭窗口，已启动的服务会继续运行') }
exit $exitCode
