$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$domain = 'fengrumedia.dpdns.org'
$tunnelId = '503797d9-a624-44ab-a07f-1d07831da93d'
$cnameTarget = "$tunnelId.cfargotunnel.com"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$statusFile = Join-Path $root 'web\.local\cloud-status.json'

Write-Host '==============================================================' -ForegroundColor Cyan
Write-Host ' 冯如学媒 · 公网访问诊断' -ForegroundColor Cyan
Write-Host '==============================================================' -ForegroundColor Cyan

$local = Test-NetConnection -ComputerName 127.0.0.1 -Port 8766 -WarningAction SilentlyContinue
if ($local.TcpTestSucceeded) { Write-Host '[OK] 本地服务 127.0.0.1:8766 可访问' -ForegroundColor Green } else { Write-Host '[X ] 本地服务未启动' -ForegroundColor Red }

$cf = Get-Process cloudflared -ErrorAction SilentlyContinue
if ($cf) { Write-Host ('[OK] cloudflared 运行中 (PID ' + ($cf.Id -join ',') + ')') -ForegroundColor Green } else { Write-Host '[X ] cloudflared 未运行' -ForegroundColor Red }

Write-Host ''
Write-Host '--- 随机公网地址（无需域名解析；首次可能需 1-2 分钟生效） ---' -ForegroundColor Cyan
$quickUrl = $null
if (Test-Path $statusFile) {
  try {
    $st = Get-Content $statusFile -Raw | ConvertFrom-Json
    if ($st.quick) { $quickUrl = $st.quick }
  } catch {}
}
if (-not $quickUrl) {
  $quickErr = Join-Path $root 'web\.local\cloudflared-quick.err.log'
  if (Test-Path $quickErr) {
    $m = Select-String -Path $quickErr -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches | Select-Object -Last 1
    if ($m -and $m.Matches.Count -gt 0) { $quickUrl = $m.Matches[$m.Matches.Count-1].Value }
  }
}
if ($quickUrl) {
  Write-Host ('  ' + $quickUrl) -ForegroundColor Green
  try {
    $r = Invoke-WebRequest -Uri ($quickUrl + '/api/info') -UseBasicParsing -TimeoutSec 20
    Write-Host ('  [OK] 该地址可访问，HTTP ' + [int]$r.StatusCode) -ForegroundColor Green
  } catch {
    Write-Host '  [X ] 该地址暂时访问不通（可能刚启动，稍等重试）' -ForegroundColor Yellow
  }
} else {
  Write-Host '  未检测到随机隧道，请先运行“启动全部云服务.exe”' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '--- 域名 DNS 检查 ---' -ForegroundColor Cyan
$ns = Resolve-DnsName $domain -Type NS -ErrorAction SilentlyContinue | Where-Object { $_.Type -eq 'NS' }
if ($ns) {
  $ns | ForEach-Object { Write-Host ('  NS: ' + $_.NameHost) }
  if ($ns.NameHost -match '\.cloudflare\.com$') {
    Write-Host '[OK] 域名已委托给 Cloudflare' -ForegroundColor Green
  } else {
    Write-Host '[X ] 域名仍由 DigitalPlat 解析，Cloudflare 里的记录不生效' -ForegroundColor Red
  }
} else {
  Write-Host '[X ] 未查到 NS 记录' -ForegroundColor Red
}

$cname = Resolve-DnsName $domain -Type CNAME -ErrorAction SilentlyContinue | Where-Object { $_.Type -eq 'CNAME' }
$ip = Resolve-DnsName $domain -Type A -ErrorAction SilentlyContinue | Where-Object { $_.Type -eq 'A' }
if ($cname) {
  $cname | ForEach-Object { Write-Host ('  CNAME: ' + $_.NameHost) }
  if ($cname.NameHost -like '*cfargotunnel.com') { Write-Host '[OK] 已指向 Cloudflare Tunnel' -ForegroundColor Green }
  else { Write-Host ('[X ] CNAME 目标不正确，应为 ' + $cnameTarget) -ForegroundColor Red }
} elseif ($ip) {
  $ip | ForEach-Object { Write-Host ('  A: ' + $_.IPAddress) }
  Write-Host '[X ] 是 A 记录而非 Cloudflare Tunnel' -ForegroundColor Red
} else {
  Write-Host '[X ] 域名没有任何 A/CNAME 记录' -ForegroundColor Red
}

Write-Host ''
Write-Host '--- 根本原因与修复 ---' -ForegroundColor Yellow
Write-Host 'DigitalPlat 免费域名“不提供 DNS 记录编辑器”，只支持改 NS（名称服务器）。'
Write-Host '你之前在 Cloudflare 加的 CNAME 之所以没用，是因为域名的解析权还在 DigitalPlat 手里。'
Write-Host ''
Write-Host '修复步骤（只需做一次）：'
Write-Host ' 1) 打开 DigitalPlat 后台：https://dash.domain.digitalplat.org/'
Write-Host ' 2) My Domains -> fengrumedia.dpdns.org -> DNS / Nameserver 设置'
Write-Host ' 3) 把现有两条 NS 替换成 Cloudflare 分配给你的两条 NS'
Write-Host '    （Cloudflare 站点概览页显示，形如 xxx.ns.cloudflare.com / yyy.ns.cloudflare.com）'
Write-Host ' 4) 保存后回 Cloudflare，点“立即检查名称服务器”，等 1-5 分钟'
Write-Host (' 5) 确认 Cloudflare DNS 里有 CNAME：' + $domain + ' -> ' + $cnameTarget + '（橙云代理）')
Write-Host ''
Write-Host '在你改好 NS 之前，请先用上面的随机公网地址访问。' -ForegroundColor Cyan
Write-Host '==============================================================' -ForegroundColor Cyan
Read-Host '按回车键退出...'
