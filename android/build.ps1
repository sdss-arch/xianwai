param(
    [Parameter(Mandatory)][string]$JavaHome,
    [Parameter(Mandatory)][string]$BuildTools,
    [Parameter(Mandatory)][string]$PlatformJar,
    [Parameter(Mandatory)][string]$Keystore,
    [Parameter(Mandatory)][string]$Destination,
    [Parameter(Mandatory)][string]$BuildDirectory,
    [string]$KeyAlias = 'xianwai'
)

$ErrorActionPreference = 'Stop'
$env:JAVA_HOME = (Resolve-Path -LiteralPath $JavaHome).Path
$buildTools = (Resolve-Path -LiteralPath $BuildTools).Path
$platform = (Resolve-Path -LiteralPath $PlatformJar).Path
$key = (Resolve-Path -LiteralPath $Keystore).Path
$buildRoot = New-Item -ItemType Directory -Force -Path $BuildDirectory
$stage = Join-Path $buildRoot.FullName ([Guid]::NewGuid().ToString('N'))
$assets = Join-Path $stage 'assets'
$classes = Join-Path $stage 'classes'
$dex = Join-Path $stage 'dex'
$resources = Join-Path $stage 'res'
$iconFolder = Join-Path $resources 'drawable'
New-Item -ItemType Directory -Force -Path $assets,$classes,$dex,$iconFolder | Out-Null

function Run-Tool([string]$Tool, [string[]]$Arguments) {
    & $Tool @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Tool failed with exit code $LASTEXITCODE" }
}

if (!$env:XIANWAI_SIGNING_PASSWORD) { throw 'Set XIANWAI_SIGNING_PASSWORD for the release keystore.' }
Run-Tool 'node' @((Join-Path $PSScriptRoot 'build-assets.mjs'), $assets)
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../public/icon-192.png') -Destination (Join-Path $iconFolder 'xianwai.png')

$aapt = Join-Path $buildTools 'aapt2.exe'
$jar = Join-Path $env:JAVA_HOME 'bin/jar.exe'
$javac = Join-Path $env:JAVA_HOME 'bin/javac.exe'
$zip = Join-Path $stage 'compiled.zip'
$apk = Join-Path $stage 'unsigned.apk'
$aligned = Join-Path $stage 'aligned.apk'
$compiledJava = Join-Path $stage 'classes.jar'
Run-Tool $aapt @('compile', '--dir', $resources, '-o', $zip)
Run-Tool $aapt @('link', '--manifest', (Join-Path $PSScriptRoot 'AndroidManifest.xml'), '-I', $platform,
    '-R', $zip, '-o', $apk)
$sources = Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'src') -Recurse -File -Filter '*.java' | ForEach-Object FullName
Run-Tool $javac (@('--release', '17', '-encoding', 'UTF-8', '-classpath', $platform, '-d', $classes) + $sources)
Run-Tool $jar @('cf', $compiledJava, '-C', $classes, '.')
Run-Tool (Join-Path $buildTools 'd8.bat') @('--release', '--min-api', '26', '--lib', $platform, '--output', $dex, $compiledJava)
Run-Tool 'python' @((Join-Path $PSScriptRoot 'pack-apk.py'), $apk, $assets, (Join-Path $dex 'classes.dex'))
Run-Tool (Join-Path $buildTools 'zipalign.exe') @('-f', '4', $apk, $aligned)
$signer = Join-Path $buildTools 'apksigner.bat'
Run-Tool $signer @('sign', '--ks', $key, '--ks-key-alias', $KeyAlias, '--ks-pass', 'env:XIANWAI_SIGNING_PASSWORD',
    '--key-pass', 'env:XIANWAI_SIGNING_PASSWORD', '--v4-signing-enabled', 'false', '--out', $Destination, $aligned)
Run-Tool $signer @('verify', '--verbose', $Destination)
