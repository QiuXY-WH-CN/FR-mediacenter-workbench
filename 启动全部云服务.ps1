$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$web = Join-Path $root 'web'
$logDir = Join-Path $web '.local'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$conn = Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue
if($conn){
  $conn.OwningProcess | Select-Object -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

Start-Process -FilePath 'node' -ArgumentList 'scripts/dev.mjs' -WorkingDirectory $web -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'server.out.log') -RedirectStandardError (Join-Path $logDir 'server.err.log')
Start-Process -FilePath 'C:\Program Files (x86)\cloudflared\cloudflared.exe' -ArgumentList 'tunnel','--url','http://127.0.0.1:8766','--no-autoupdate' -WorkingDirectory $web -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'cloudflared.out.log') -RedirectStandardError (Join-Path $logDir 'cloudflared.err.log')

Start-Sleep -Seconds 6
Write-Host '=============================================='
Write-Host ' Fengru Workbench Cloud Services Started'
Write-Host '=============================================='
Write-Host ' Local: http://127.0.0.1:8766/'
$line = Select-String -Path (Join-Path $logDir 'cloudflared.err.log') -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -Last 1
if($line){ Write-Host (' Public: ' + $line.Matches[0].Value) } else { Write-Host ' Public: generating, see logs' }
Write-Host ' Logs: ' + $logDir
Write-Host '=============================================='
