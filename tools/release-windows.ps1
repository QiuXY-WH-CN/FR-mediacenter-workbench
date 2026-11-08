[CmdletBinding()]
param(
    [string]$OutputDirectory = '',
    [switch]$SkipBuild,
    [switch]$SkipZip,
    [switch]$WithoutNodeRuntime
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).ProviderPath
$packageVersion = 'v1.0.7'
$safeName = '冯如学媒协作工作台-' + $packageVersion + '-win-x64'
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $root ('发布版\' + $safeName) }
$stage = [IO.Path]::GetFullPath($OutputDirectory)
$releaseRoot = [IO.Path]::GetFullPath($root)
$allowedPrefix = $releaseRoot.TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
if (-not $stage.StartsWith($allowedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw '发布目录必须位于项目根目录内。'
}

function Copy-ReleaseFile {
    param([string]$Source, [string]$Destination)
    $parent = Split-Path -Parent $Destination
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

function Assert-NoPrivateMaterial {
    param([string]$Folder)
    $blockedNames = @('.git', '.local', 'node_modules', '.env', 'cloudflared-config.yml', 'project.private.config.json')
    $personalPath = [regex]::Escape((Join-Path 'C:\Users' ([Environment]::UserName)))
    foreach ($item in Get-ChildItem -LiteralPath $Folder -Recurse -Force -File -ErrorAction SilentlyContinue) {
        if ($blockedNames -contains $item.Name -or $item.Name -like '*.log' -or $item.Name -like '*.db' -or $item.FullName -match '(?i)(backup|credential|secret|token)') {
            throw ('发布包包含被禁止的本机文件：' + $item.FullName)
        }
        $text = ''
        try { $text = Get-Content -LiteralPath $item.FullName -Raw -Encoding UTF8 -ErrorAction Stop } catch { continue }
        if ($text -match ('(?i)' + $personalPath + '|BOOTSTRAP_HASH\s*=\s*[^\r\n]+|BRIDGE_SECRET\s*=\s*[^\r\n]+')) {
            throw ('发布包疑似包含个人路径或凭据：' + $item.FullName)
        }
    }
}

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw '未找到 Node.js。构建发布版需要 Node.js 24 或更高版本。' }
$nodePath = $nodeCommand.Source
$nodeVersion = (& $nodePath --version).Trim()
if ($nodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 24) { throw ('Node.js 版本过低：' + $nodeVersion + '；需要 24 或更高版本。') }

if (-not $SkipBuild) {
    Push-Location $root
    try {
        & $nodePath (Join-Path $root 'web/scripts/release-build.mjs')
        if ($LASTEXITCODE -ne 0) { throw '发布构建失败。' }
    } finally { Pop-Location }
}

$bundle = Join-Path $root 'web/dist/release/server.mjs'
$migration = Join-Path $root 'web/drizzle/0000_huge_boomerang.sql'
if (-not (Test-Path -LiteralPath $bundle -PathType Leaf)) { throw '缺少 web/dist/release/server.mjs，请先运行发布构建。' }
if (-not (Test-Path -LiteralPath $migration -PathType Leaf)) { throw '缺少数据库初始化迁移文件。' }

if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'drizzle') | Out-Null
Copy-ReleaseFile $bundle (Join-Path $stage 'server.mjs')
Copy-ReleaseFile $migration (Join-Path $stage 'drizzle/0000_huge_boomerang.sql')
Copy-ReleaseFile (Join-Path $root 'tools/启动工作台.cmd') (Join-Path $stage '启动工作台.cmd')
Copy-ReleaseFile (Join-Path $root 'tools/启动工作台.ps1') (Join-Path $stage '启动工作台.ps1')
Copy-ReleaseFile (Join-Path $root 'tools/安装工作台.ps1') (Join-Path $stage '安装工作台.ps1')
Copy-ReleaseFile (Join-Path $root 'tools/卸载工作台.ps1') (Join-Path $stage '卸载工作台.ps1')
@{
    name = '冯如学媒协作工作台'
    version = $packageVersion
    platform = 'windows-x64'
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    requires = if ($WithoutNodeRuntime) { 'Node.js 24 or newer on PATH' } else { 'bundled Node.js 24 runtime' }
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stage 'release.json') -Encoding UTF8

if (-not $WithoutNodeRuntime) {
    $runtime = Join-Path $stage 'runtime'
    New-Item -ItemType Directory -Force -Path $runtime | Out-Null
    Copy-ReleaseFile $nodePath (Join-Path $runtime 'node.exe')
    $nodeDir = Split-Path -Parent $nodePath
    foreach ($license in @('LICENSE', 'LICENSE.txt', 'LICENSE.md')) {
        $candidate = Join-Path $nodeDir $license
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { Copy-ReleaseFile $candidate (Join-Path $runtime $license) }
    }
}

@'
# 冯如学媒协作工作台 Windows 发布版

双击“启动工作台.cmd”即可启动本机服务，然后打开 http://127.0.0.1:8766/。
首次使用请在网页中使用部署环境提供的初始化流程；发布包不会携带账号、数据库、日志、隧道凭据或个人配置。

“安装工作台.ps1”会把当前发布目录复制到当前用户的 LocalAppData，并在桌面创建快捷方式。
业务数据和日志只会写入发布目录下的 .local 文件夹；移动整个发布目录即可迁移本机数据。
'@ | Set-Content -LiteralPath (Join-Path $stage '使用说明.txt') -Encoding UTF8

Assert-NoPrivateMaterial -Folder $stage
$zip = Join-Path (Split-Path -Parent $stage) ($safeName + '.zip')
if (-not $SkipZip) {
    if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
    Compress-Archive -LiteralPath $stage -DestinationPath $zip -CompressionLevel Optimal
}

Write-Host ('发布目录：' + $stage)
if (-not $SkipZip) { Write-Host ('ZIP：' + $zip) }
