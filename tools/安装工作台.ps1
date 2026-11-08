[CmdletBinding()]
param([string]$InstallPath = (Join-Path $env:LOCALAPPDATA 'FengruWorkbench'))

$ErrorActionPreference = 'Stop'
$source = (Resolve-Path $PSScriptRoot).ProviderPath
$target = [IO.Path]::GetFullPath($InstallPath)
if ([IO.Path]::GetFullPath($source).TrimEnd('\') -eq $target.TrimEnd('\')) { throw '安装目录不能与当前发布目录相同。' }
if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
New-Item -ItemType Directory -Force -Path $target | Out-Null
Get-ChildItem -LiteralPath $source -Force | Where-Object { $_.Name -notin @('.local') } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $target $_.Name) -Recurse -Force
}
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop '冯如学媒协作工作台.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $target '启动工作台.cmd'
$shortcut.WorkingDirectory = $target
$shortcut.IconLocation = Join-Path $target 'runtime/node.exe'
$shortcut.Save()
Write-Host ('已安装到：' + $target)
Write-Host ('桌面快捷方式：' + $shortcutPath)
