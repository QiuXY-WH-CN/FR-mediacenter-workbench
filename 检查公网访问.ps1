[CmdletBinding()]
param([switch]$NonInteractive)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$webRoot = Join-Path $PSScriptRoot 'web'
. (Join-Path $webRoot 'scripts/start-services.ps1')

Write-Host '冯如学媒 · 公网访问诊断' -ForegroundColor Cyan
if (Get-WorkbenchHealth -Url 'http://127.0.0.1:8766' -TimeoutSeconds 5) {
    Write-Host '本机工作台健康检查通过。' -ForegroundColor Green
} else {
    Write-Host '本机工作台暂不可访问。' -ForegroundColor Yellow
}

$publicUrl = Get-WorkbenchTunnelRoute -ConfigPath (Join-Path $webRoot 'cloudflared-config.yml')
if ($publicUrl) {
    $domain = ([uri]$publicUrl).DnsSafeHost
    $dns = Resolve-DnsName $domain -ErrorAction SilentlyContinue
    if ($dns) { Write-Host ('域名可解析：' + $domain) }
    else { Write-Host ('域名暂未解析：' + $domain) -ForegroundColor Yellow }
    if (Get-WorkbenchHealth -Url $publicUrl -TimeoutSeconds 8) {
        Write-Host ('公网工作台健康检查通过：' + $publicUrl) -ForegroundColor Green
    } else {
        Write-Host '公网工作台暂不可访问，请核对隧道服务和 DNS 配置。' -ForegroundColor Yellow
    }
} else {
    Write-Host '未配置固定公网地址。'
}

$log = Join-Path $webRoot '.local/cloudflared-quick.err.log'
if (Test-Path -LiteralPath $log -PathType Leaf) {
    $match = Select-String -LiteralPath $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' |
        Select-Object -Last 1
    if ($match) {
        $quickUrl = $match.Matches[0].Value
        if (Get-WorkbenchHealth -Url $quickUrl -TimeoutSeconds 8) {
            Write-Host ('临时公网工作台健康检查通过：' + $quickUrl) -ForegroundColor Green
        } else {
            Write-Host '日志中的临时公网地址暂不可访问。' -ForegroundColor Yellow
        }
    }
}
if (-not $NonInteractive) { [void](Read-Host '按回车键退出') }
