[CmdletBinding()]
param([int]$ExpectedProcessId = 0)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'start-services.ps1')
$webRoot = Split-Path -Parent $PSScriptRoot
$result = Start-WorkbenchServices -WebRoot $webRoot -Restart -ExpectedProcessId $ExpectedProcessId
Write-Output ('Updated workbench server healthy: PID ' + $result.serverId + ', ' + $result.local)
