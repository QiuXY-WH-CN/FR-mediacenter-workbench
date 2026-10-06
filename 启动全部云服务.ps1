$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$web = Join-Path $root 'web'
$logDir = Join-Path $web '.local'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$domain   = 'fengrumedia.dpdns.org'
$tunnelId = '503797d9-a624-44ab-a07f-1d07831da93d'
$cnameTarget = "$tunnelId.cfargotunnel.com"
$localUrl = 'http://127.0.0.1:8766'

$node = $null
$cmdNode = Get-Command node.exe -ErrorAction SilentlyContinue
if ($cmdNode) { $node = $cmdNode.Source }
if (-not $node -and (Test-Path 'C:\Program Files\nodejs\node.exe')) { $node = 'C:\Program Files\nodejs\node.exe' }
if (-not $node) {
  Write-Host '未找到 node.exe，请先安装 Node.js 24。' -ForegroundColor Red
  Read-Host '按回车键退出...'
  exit 1
}

$cloudflared = $null
if (Test-Path 'C:\Program Files (x86)\cloudflared\cloudflared.exe') { $cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe' }
if (-not $cloudflared) {
  $cmdCf = Get-Command cloudflared.exe -ErrorAction SilentlyContinue
  if ($cmdCf) { $cloudflared = $cmdCf.Source }
}
if (-not $cloudflared) {
  Write-Host '未找到 cloudflared.exe，请先安装 Cloudflare Tunnel。' -ForegroundColor Red
  Read-Host '按回车键退出...'
  exit 1
}

Push-Location $web
& $node scripts/build.mjs
$buildExit = $LASTEXITCODE
Pop-Location
if ($buildExit -ne 0) { Write-Host '构建失败，保留当前服务。' -ForegroundColor Red; exit 1 }

$conn = Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
  $conn.OwningProcess | Select-Object -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 600

Start-Process -FilePath $node -ArgumentList 'scripts/dev.mjs' -WorkingDirectory $web -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'server.out.log') -RedirectStandardError (Join-Path $logDir 'server.err.log')

$cfg = Join-Path $web 'cloudflared-config.yml'
$domainReady = (Test-Path $cfg) -and -not (Select-String -Path $cfg -Pattern 'YOUR_TUNNEL_ID' -Quiet)
if ($domainReady) {
  Start-Process -FilePath $cloudflared -ArgumentList 'tunnel','--config',$cfg,'run' -WorkingDirectory $web -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'cloudflared-domain.out.log') -RedirectStandardError (Join-Path $logDir 'cloudflared-domain.err.log')
}

$quickLog = Join-Path $logDir 'cloudflared-quick.out.log'
$quickErr = Join-Path $logDir 'cloudflared-quick.err.log'
Remove-Item $quickLog,$quickErr -ErrorAction SilentlyContinue
$quickProc = Start-Process -FilePath $cloudflared -ArgumentList 'tunnel','--url',$localUrl,'--no-autoupdate' -WorkingDirectory $web -WindowStyle Hidden -RedirectStandardOutput $quickLog -RedirectStandardError $quickErr -PassThru

$quickUrl = $null
for ($i=0; $i -lt 45; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path $quickErr) {
    $m = Select-String -Path $quickErr -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches | Select-Object -First 1
    if ($m -and $m.Matches.Count -gt 0) { $quickUrl = $m.Matches[0].Value; break }
  }
}

# 等待随机域名可解析（首次约 10-30 秒，最多等 90 秒）
if ($quickUrl) {
  $quickHost = $quickUrl -replace 'https://',''
  for ($i=0; $i -lt 90; $i++) {
    $ip = Resolve-DnsName $quickHost -Type A -ErrorAction SilentlyContinue | Where-Object { $_.Type -eq 'A' } | Select-Object -First 1
    if ($ip) { break }
    Start-Sleep -Seconds 1
  }
}

$dnsOk = $false
$dnsDetail = '未解析'
$ns = Resolve-DnsName $domain -Type NS -ErrorAction SilentlyContinue | Where-Object { $_.Type -eq 'NS' }
if ($ns -and ($ns.NameHost -match '\.cloudflare\.com$')) {
  $dnsOk = $true
  $dnsDetail = '已委托给 Cloudflare'
} elseif ($ns) {
  $dnsDetail = '仍由 ' + (($ns.NameHost | Select-Object -First 1) -replace '\.$','') + ' 解析'
}

$status = [ordered]@{
  local = $localUrl
  domain = "https://$domain"
  domainDnsOk = $dnsOk
  domainDnsDetail = $dnsDetail
  cnameTarget = $cnameTarget
  quick = $quickUrl
  updatedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
}
$status | ConvertTo-Json | Out-File -FilePath (Join-Path $logDir 'cloud-status.json') -Encoding UTF8

Write-Host ''
Write-Host '==============================================================' -ForegroundColor Cyan
Write-Host ' 冯如学媒协作工作台 · 云服务已启动' -ForegroundColor Cyan
Write-Host '==============================================================' -ForegroundColor Cyan
Write-Host (' 本机访问:   ' + $localUrl)
Write-Host ' 随机公网(1-2 分钟内可用): ' -NoNewline
if ($quickUrl) { Write-Host $quickUrl -ForegroundColor Green } else { Write-Host ('生成中，稍后查看日志 ' + $quickLog) -ForegroundColor Yellow }

if ($domainReady) {
  Write-Host (' 域名公网:   ' + 'https://' + $domain) -NoNewline
  if ($dnsOk) { Write-Host '   [DNS 正常]' -ForegroundColor Green }
  else {
    Write-Host '   [DNS 未指向 Cloudflare，暂不可用]' -ForegroundColor Yellow
    Write-Host ''
    Write-Host '  域名修复步骤（只需做一次）：' -ForegroundColor Yellow
    Write-Host '   1) 打开 DigitalPlat 后台: https://dash.domain.digitalplat.org/'
    Write-Host '   2) My Domains -> fengrumedia.dpdns.org -> DNS/Nameserver 设置'
    Write-Host '   3) 把现有 NS (dns1/dns2.digitalplat.org) 改成 Cloudflare 给你的两个 NS'
    Write-Host '      (形如 xxx.ns.cloudflare.com / yyy.ns.cloudflare.com，'
    Write-Host '       在 Cloudflare 站点概览页可看到)'
    Write-Host '   4) 保存后回 Cloudflare，点“立即检查名称服务器”，等 1-5 分钟'
    Write-Host ('   5) 确认已有 CNAME: ' + $domain + ' -> ' + $cnameTarget + ' (橙云代理)')
    Write-Host '  之后运行“检查公网访问.ps1”验证。' -ForegroundColor Yellow
  }
}

Write-Host '--------------------------------------------------------------' -ForegroundColor Cyan
Write-Host (' 状态文件:   ' + (Join-Path $logDir 'cloud-status.json'))
Write-Host (' 日志目录:   ' + $logDir)
Write-Host '==============================================================' -ForegroundColor Cyan
Write-Host ''
Read-Host '按回车键退出此窗口（服务会继续在后台运行）'
