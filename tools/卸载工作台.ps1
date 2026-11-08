[CmdletBinding()]
param([string]$InstallPath = (Join-Path $env:LOCALAPPDATA 'FengruWorkbench'))

$ErrorActionPreference = 'Stop'
$target = [IO.Path]::GetFullPath($InstallPath)
$expected = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'FengruWorkbench'))
if (-not $target.StartsWith($expected, [StringComparison]::OrdinalIgnoreCase)) { throw '卸载目录必须位于当前用户的 LocalAppData 下。' }
if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
$shortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) '冯如学媒协作工作台.lnk'
if (Test-Path -LiteralPath $shortcut) { Remove-Item -LiteralPath $shortcut -Force }
Write-Host '工作台已卸载；如果需要保留业务数据，请先备份安装目录下的 .local。'
