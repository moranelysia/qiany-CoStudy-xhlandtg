[CmdletBinding()]
param(
    [string]$ElectronDir,
    [string]$Makensis = 'makensis.exe',
    [string]$OutputDir
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
if (!$ElectronDir) { $ElectronDir = Join-Path $repoRoot 'node_modules/electron/dist' }
$ElectronDir = (Resolve-Path -LiteralPath $ElectronDir).Path

$manifest = Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
$version = $manifest.version
$expectedRuntime = (Get-Content (Join-Path $repoRoot 'node_modules/electron/package.json') -Raw | ConvertFrom-Json).version
$runtimeVersion = (Get-Item -LiteralPath (Join-Path $ElectronDir 'electron.exe')).VersionInfo.ProductVersion
if ($runtimeVersion -ne $expectedRuntime) {
    throw "Electron 版本不符，项目需要 $expectedRuntime，提供的是 $runtimeVersion"
}

if (!$OutputDir) { $OutputDir = Join-Path $repoRoot 'dist/windows' }
$versionDir = (New-Item -ItemType Directory -Path (Join-Path $OutputDir "v$version") -Force).FullName
$installer = Join-Path $versionDir 'CoStudy-Desktop-Setup.exe'
$tempRoot = (Resolve-Path ([IO.Path]::GetTempPath())).Path
$stageName = 'costudy-install-' + [guid]::NewGuid().ToString('N')
$payload = Join-Path $tempRoot $stageName

Push-Location -LiteralPath $repoRoot
try {
    & pnpm run build
    if ($LASTEXITCODE -ne 0) { throw 'CoStudy 构建失败' }

    $appDir = Join-Path $payload 'app'
    $dependencyDir = Join-Path $appDir 'node_modules'
    New-Item -ItemType Directory -Path $dependencyDir -Force | Out-Null
    Copy-Item -LiteralPath $ElectronDir -Destination (Join-Path $payload 'electron') -Recurse
    Copy-Item -LiteralPath 'out', 'templates', 'package.json' -Destination $appDir -Recurse
    New-Item -ItemType Directory -Path (Join-Path $appDir 'resources') | Out-Null
    Copy-Item -LiteralPath 'resources/costudy.ico' -Destination (Join-Path $appDir 'resources')

    $mcpDir = Join-Path $appDir 'scripts'
    New-Item -ItemType Directory -Path $mcpDir | Out-Null
    Get-ChildItem -LiteralPath 'scripts' -Filter 'mcp-*-server.mjs' -File |
        Copy-Item -Destination $mcpDir
    Copy-Item -LiteralPath 'scripts/lib' -Destination $mcpDir -Recurse
    foreach ($dependency in @('adm-zip', 'ws')) {
        $manifestPath = & node -p "require.resolve('$dependency/package.json')"
        if ($LASTEXITCODE -ne 0) { throw "找不到运行依赖 $dependency" }
        Copy-Item -LiteralPath (Split-Path -Parent $manifestPath) -Destination (Join-Path $dependencyDir $dependency) -Recurse
    }

    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'launch.cmd') -Destination (Join-Path $payload '启动.cmd')
    @"
伴学 CoStudy $version · Windows 桌面版

启动：双击桌面快捷方式，或双击本目录里的「启动.cmd」。
升级：先退出正在运行的 CoStudy，然后把新版安装到原路径。
程序和 MCP 工具：app\out 和 app\scripts
会话、角色卡及设置：app\记忆（或已有配置指向的数据目录）
学习资料：学习
代码工作区：工作区（已选过的工作区或旧版已有工作区会继续使用）
"@ | Set-Content -LiteralPath (Join-Path $payload '使用说明.txt') -Encoding utf8

    & $Makensis /V2 /INPUTCHARSET UTF8 "/DAPP_VERSION=$version" "/DPAYLOAD=$payload" "/DSETUP_EXE=$installer" (Join-Path $PSScriptRoot 'CoStudy.nsi')
    if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $installer -PathType Leaf)) { throw 'Windows 安装包编译失败' }
    Get-Item -LiteralPath $installer
} finally {
    Pop-Location
    if (Test-Path -LiteralPath $payload -PathType Container) {
        $resolvedStage = (Resolve-Path -LiteralPath $payload).Path
        if ($resolvedStage -eq [IO.Path]::GetFullPath($payload) -and (Split-Path -Leaf $resolvedStage) -eq $stageName) {
            Remove-Item -LiteralPath $resolvedStage -Recurse -Force
        }
    }
}
