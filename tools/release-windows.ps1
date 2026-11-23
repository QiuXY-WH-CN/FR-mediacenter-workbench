[CmdletBinding()]
param(
    [string]$OutputDirectory,
    [string]$InstallerCompiler = $env:ISCC_PATH,
    [switch]$SkipBuild,
    [switch]$SkipZip,
    [switch]$SkipInstaller,
    [switch]$WithoutNodeRuntime
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).ProviderPath
$web = Join-Path $root 'web'
$packageVersion = (Get-Content -LiteralPath (Join-Path $web 'package.json') -Raw | ConvertFrom-Json).version
if ($packageVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'web/package.json must contain a numeric release version.' }
$assetName = 'FengruWorkbench-v' + $packageVersion + '-win-x64'
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $root '发布版' }
$output = [IO.Path]::GetFullPath($OutputDirectory)
if ($WithoutNodeRuntime) { $SkipInstaller = $true }
if ($SkipZip -and $SkipInstaller) { throw 'Select at least one release artifact.' }

$node = (Get-Command node.exe -ErrorAction Stop).Source
$nodeVersion = (& $node --version).Trim()
if ($nodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 24) { throw 'Node.js 24 or newer is required.' }
if ((& $node -p 'process.arch') -ne 'x64') { throw 'Build the Windows x64 release with an x64 Node.js runtime.' }

if (-not $SkipInstaller) {
    if (-not $InstallerCompiler) {
        $compilerCommand = Get-Command ISCC.exe -ErrorAction SilentlyContinue
        if ($compilerCommand) { $InstallerCompiler = $compilerCommand.Source }
        if (-not $InstallerCompiler) {
            foreach ($folder in @(${env:ProgramFiles(x86)}, $env:ProgramFiles, (Join-Path $env:LOCALAPPDATA 'Programs'))) {
                if (-not $folder) { continue }
                foreach ($version in @('Inno Setup 6', 'Inno Setup 7')) {
                    $candidate = Join-Path $folder ($version + '/ISCC.exe')
                    if (Test-Path -LiteralPath $candidate -PathType Leaf) { $InstallerCompiler = $candidate; break }
                }
                if ($InstallerCompiler) { break }
            }
        }
    }
    if (-not $InstallerCompiler -or -not (Test-Path -LiteralPath $InstallerCompiler -PathType Leaf)) {
        throw 'Install Inno Setup 6.3 or newer and specify -InstallerCompiler with the ISCC.exe path.'
    }
    $InstallerCompiler = (Resolve-Path -LiteralPath $InstallerCompiler).ProviderPath
}

if (-not $SkipBuild) {
    & $node (Join-Path $web 'scripts/release-build.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Release build failed.' }
}

New-Item -ItemType Directory -Force -Path $output | Out-Null
$output = (Resolve-Path -LiteralPath $output).ProviderPath
$stageId = '.workbench-stage-' + [Guid]::NewGuid().ToString('N')
$scratch = [IO.Path]::GetFullPath((Join-Path $output $stageId))
if ([IO.Path]::GetDirectoryName($scratch) -ne $output.TrimEnd('\', '/')) { throw 'Invalid staging path.' }
New-Item -ItemType Directory -Path $scratch | Out-Null
$stage = Join-Path $scratch $assetName
try {
    New-Item -ItemType Directory -Path $stage | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $stage 'drizzle') | Out-Null
    Copy-Item -LiteralPath (Join-Path $web 'dist/release/server.mjs') -Destination $stage
    $migrations = Get-ChildItem -LiteralPath (Join-Path $web 'drizzle') -Filter '*.sql' -File
    if (-not $migrations) { throw 'The release needs at least one database migration.' }
    $migrations | Copy-Item -Destination (Join-Path $stage 'drizzle')
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot '启动工作台.cmd'), (Join-Path $PSScriptRoot 'start-workbench.ps1') -Destination $stage
    Copy-Item -LiteralPath (Join-Path $web 'node_modules/bcryptjs/LICENSE') -Destination (Join-Path $stage 'LICENSE-bcryptjs.txt')

    if (-not $WithoutNodeRuntime) {
        if ((Get-AuthenticodeSignature -LiteralPath $node).Status -ne 'Valid') { throw 'Build with an Authenticode-signed Node.js runtime.' }
        $runtime = Join-Path $stage 'runtime'
        New-Item -ItemType Directory -Path $runtime | Out-Null
        Copy-Item -LiteralPath $node -Destination (Join-Path $runtime 'node.exe')
        $runtimeLicense = @('LICENSE', 'LICENSE.txt', 'LICENSE.md') | ForEach-Object {
            Join-Path (Split-Path -Parent $node) $_
        } | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
        if (-not $runtimeLicense) { throw 'The bundled Node.js distribution must include its LICENSE file.' }
        Copy-Item -LiteralPath $runtimeLicense -Destination (Join-Path $runtime 'LICENSE.txt')
    }

    @{
        name = '冯如学媒协作工作台'
        version = 'v' + $packageVersion
        platform = 'windows-x64'
        node = if ($WithoutNodeRuntime) { 'Node.js 24 or newer on PATH' } else { $nodeVersion }
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stage 'release.json') -Encoding UTF8

    @'
冯如学媒协作工作台 Windows 发布版

双击“启动工作台.cmd”，或从开始菜单启动工作台。首次启动会在浏览器打开本机初始化页面，
请在页面中创建负责人账号。服务只监听本机 127.0.0.1，默认端口为 8766。

要停止后台服务，请从开始菜单选择“停止冯如学媒协作工作台”，或在发布目录运行：
  .\启动工作台.cmd -Stop
升级和卸载前请先停止服务。卸载保留 .local 目录，业务数据和运行日志保存在其中。
迁移业务数据前先停止两台设备的服务，再备份并迁移 .local/preview.db。
'@ | Set-Content -LiteralPath (Join-Path $stage '使用说明.txt') -Encoding UTF8

    & $node (Join-Path $PSScriptRoot 'privacy-audit.mjs') --strict $stage
    if ($LASTEXITCODE -ne 0) { throw 'Release payload privacy check failed.' }

    $artifacts = @()
    if (-not $SkipZip) {
        $zip = Join-Path $scratch ($assetName + '.zip')
        Compress-Archive -LiteralPath $stage -DestinationPath $zip -CompressionLevel Optimal
        $artifacts += $zip
    }
    if (-not $SkipInstaller) {
        & $InstallerCompiler /Qp ("/DAppVersion=$packageVersion") ("/DPayloadDir=$stage") ("/DArtifactName=$assetName-setup") ("/O$scratch") (Join-Path $PSScriptRoot 'workbench-installer.iss')
        $installer = Join-Path $scratch ($assetName + '-setup.exe')
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $installer -PathType Leaf)) { throw 'Windows installer compilation failed.' }
        $artifacts += $installer
    }

    $checksums = Join-Path $scratch ($assetName + '-SHA256SUMS.txt')
    $artifacts | ForEach-Object {
        (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + (Split-Path -Leaf $_)
    } | Set-Content -LiteralPath $checksums -Encoding Ascii
    foreach ($artifact in ($artifacts + $checksums)) {
        Move-Item -LiteralPath $artifact -Destination (Join-Path $output (Split-Path -Leaf $artifact)) -Force
        Write-Host ('Built ' + (Split-Path -Leaf $artifact))
    }
} finally {
    if ([IO.Path]::GetDirectoryName($scratch) -eq $output.TrimEnd('\', '/') -and (Split-Path -Leaf $scratch) -eq $stageId) {
        Remove-Item -LiteralPath $scratch -Recurse -Force
    }
}
