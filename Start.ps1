param(
    [string]$Address = '127.0.0.1',
    [ValidateRange(1024,65535)][int]$Port = 8787,
    [switch]$Phone
)

$ErrorActionPreference = 'Stop'
$node = Get-Command node -ErrorAction SilentlyContinue
$nodeVersion = if ($node) { & $node.Source --version }
if ($nodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 22) {
    throw 'Node.js 22 or newer is required. Download it from https://nodejs.org/.'
}
$protocol = 'http'
$rootPem = $null
if ($Phone) {
    if ($Address -eq '127.0.0.1') { throw 'Add -Address with the computer''s Wi-Fi IPv4 address.' }
    if (!$PSBoundParameters.ContainsKey('Port')) { $Port = 8788 }
    $protocol = 'https'
    $tlsPath = & $node.Source (Join-Path $PSScriptRoot 'phone-https.mjs') $Address
    if ($LASTEXITCODE -ne 0 -or !$tlsPath) { throw 'Cannot prepare the phone HTTPS certificate.' }
    $rootPem = Join-Path $tlsPath 'root.pem'
    $env:HTTPS_KEY = Join-Path $tlsPath 'server.key'
    $env:HTTPS_CERT = Join-Path $tlsPath 'server.pem'
    Write-Host "Phone trust certificate: $(Join-Path $tlsPath 'root.cer')"
}
$localUrl = "${protocol}://${Address}:$Port"
$healthUrl = 'http://127.0.0.1:18182/health'
$engineVersion = 'b12413'
$engineSha = '4d2e557f15ecdde59ff1be87f7cd208e43075abde93de29d61e7bbd7cb78004c'
$modelRevision = 'ae44f08e1392f39c0e474af10c3ff8355c8b6688'
$modelSha = '2fde00ce69dd4899c70d020845e2638353015bba0fdf161b3eb965f2bca4464e'

function Get-ServiceState([string]$Url) {
    if ($rootPem -and $Url.StartsWith('https:')) {
        $response = curl.exe -fsS --noproxy '*' --max-time 3 --ssl-revoke-best-effort --cacert $rootPem $Url 2>$null
        if ($LASTEXITCODE -eq 0) { return ($response | ConvertFrom-Json) }
        return $null
    }
    try { Invoke-RestMethod -Uri $Url -TimeoutSec 2 } catch { $null }
}

function Save-VerifiedFile([string]$Url, [string]$Destination, [string]$Sha256) {
    if ((Test-Path -LiteralPath $Destination) -and (Get-FileHash -LiteralPath $Destination).Hash -eq $Sha256) {
        return
    }
    $partial = "$Destination.part"
    curl.exe -fL -C - --retry 2 --progress-bar $Url -o $partial
    if (!(Test-Path -LiteralPath $partial) -or (Get-FileHash -LiteralPath $partial).Hash -ne $Sha256) {
        throw "Download or verification failed. Run Start.cmd again. File: $Destination"
    }
    Move-Item -LiteralPath $partial -Destination $Destination -Force
}

$runningApp = Get-ServiceState "$localUrl/api/config"
if (!$Phone -and !$PSBoundParameters.ContainsKey('Port')) {
    foreach ($alternate in 8793,8794) {
        if (!$runningApp.modelMode -or $runningApp.analysisVersion -eq 'contextual-2') { break }
        $Port = $alternate
        $localUrl = "${protocol}://${Address}:$Port"
        $runningApp = Get-ServiceState "$localUrl/api/config"
    }
}
if ($runningApp.modelMode) {
    if ($runningApp.analysisVersion -ne 'contextual-2') {
        throw 'This port is running an older version of Xianwai. Start with -Port to use another port.'
    }
    if (!$Phone) { Start-Process $localUrl }
    else { Write-Host "Phone URL: $localUrl" }
    exit
}

$modelProcess = $null
$appProcess = $null
try {
    if ((Get-ServiceState $healthUrl).status -ne 'ok') {
        $runtime = Join-Path $PSScriptRoot '.runtime'
        New-Item -ItemType Directory -Force -Path $runtime | Out-Null
        $engine = Join-Path $runtime 'llama\llama-server.exe'
        if (!(Test-Path -LiteralPath $engine)) {
            $archiveName = "llama-$engineVersion-bin-win-cpu-x64.zip"
            $archive = Join-Path $runtime $archiveName
            Save-VerifiedFile "https://github.com/ggml-org/llama.cpp/releases/download/$engineVersion/$archiveName" $archive $engineSha
            Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $runtime 'llama') -Force
        }
        $model = Join-Path $runtime 'qwen4.gguf'
        if (!(Test-Path -LiteralPath $model)) {
            Write-Host 'First launch: downloading the local model (about 2.5 GB).'
            $modelUrl = "https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF/resolve/$modelRevision/Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf?download=true"
            Save-VerifiedFile $modelUrl $model $modelSha
        }
        $options = '-m "{0}" --host 127.0.0.1 --port 18182 -c 8192 -np 1 -t 8 --reasoning off' -f $model
        $modelProcess = Start-Process -FilePath $engine -ArgumentList $options -WorkingDirectory $runtime -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $runtime 'model-error.log') -RedirectStandardOutput (Join-Path $runtime 'model.log')
        for ($attempt = 0; $attempt -lt 45; $attempt++) {
            if ((Get-ServiceState $healthUrl).status -eq 'ok') { break }
            if ($modelProcess.HasExited) { throw 'The local model could not start. See model-error.log in the runtime folder.' }
            Start-Sleep -Seconds 1
        }
        if ((Get-ServiceState $healthUrl).status -ne 'ok') { throw 'The local model did not become ready.' }
    }

    $env:HOST = $Address
    $env:PORT = [string]$Port
    $env:MODEL_BASE_URL = 'http://127.0.0.1:18182/v1'
    $env:MODEL_NAME = 'qwen3-4b-instruct'
    $appProcess = Start-Process -FilePath $node.Source -ArgumentList 'server.mjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
    for ($attempt = 0; $attempt -lt 12; $attempt++) {
        if ((Get-ServiceState "$localUrl/api/config").modelMode) { break }
        if ($appProcess.HasExited) { throw "The app could not start at $localUrl." }
        Start-Sleep -Milliseconds 500
    }
    if (!(Get-ServiceState "$localUrl/api/config").modelMode) { throw "The app did not become ready at $localUrl." }
    if (!$Phone) { Start-Process $localUrl }
    Write-Host "Running at $localUrl. Keep this window open while using the app."
    $appProcess.WaitForExit()
} finally {
    if ($appProcess -and !$appProcess.HasExited) { $appProcess.Kill() }
    if ($modelProcess -and !$modelProcess.HasExited) { $modelProcess.Kill() }
}
