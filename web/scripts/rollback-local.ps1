[CmdletBinding()]
param([int]$ExpectedProcessId = 0)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'start-services.ps1')
$webRoot = Split-Path -Parent $PSScriptRoot
$bundle = Get-WorkbenchRollbackBundle -WebRoot $webRoot
$result = Start-WorkbenchOrigin -WebRoot $webRoot -Restart -ExpectedProcessId $ExpectedProcessId -RestoreBundlePath $bundle
Write-Output ('Previous service build restored and healthy: PID ' + $result.serverId + '. Database remains current.')
