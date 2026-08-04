param(
    [string]$ImageName = "mineflayer-bot:1.0.0",
    [string]$BundleName = "mineflayer-bot-offline",
    [ValidateSet("linux/amd64", "linux/arm64")]
    [string]$Platform = "linux/amd64",
    [string]$HttpProxy = $env:HTTP_PROXY,
    [string]$HttpsProxy = $env:HTTPS_PROXY,
    [string]$NoProxy = $env:NO_PROXY
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$DistDir = Join-Path $ProjectRoot "dist"
$BundleDir = Join-Path $DistDir $BundleName
$ArchivePath = Join-Path $DistDir "$BundleName.tar.gz"

Set-Location $ProjectRoot
$env:IMAGE_NAME = $ImageName
$env:DOCKER_DEFAULT_PLATFORM = $Platform

function Get-DockerDesktopProxyValue([string]$PropertyName) {
    $settingsPath = Join-Path $env:APPDATA "Docker\settings-store.json"
    if (-not (Test-Path -LiteralPath $settingsPath)) { return "" }

    try {
        $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
        $value = $settings.$PropertyName
        if ($null -eq $value) { return "" }
        return [string]$value
    } catch {
        return ""
    }
}

function Normalize-ProxyUrl([string]$ProxyUrl) {
    if ([string]::IsNullOrWhiteSpace($ProxyUrl)) { return "" }
    $ProxyUrl = $ProxyUrl.Trim()
    if ($ProxyUrl -match '^[A-Za-z][A-Za-z0-9+.-]*://') { return $ProxyUrl }
    return "http://$ProxyUrl"
}

function Convert-ToContainerProxyUrl([string]$ProxyUrl) {
    if ([string]::IsNullOrWhiteSpace($ProxyUrl)) { return "" }

    try {
        $uri = [System.Uri]$ProxyUrl
        if ($uri.Host -in @("127.0.0.1", "localhost", "::1")) {
            $builder = [System.UriBuilder]$uri
            # Docker Desktop maps this name from Linux containers to Windows.
            $builder.Host = "host.docker.internal"
            return $builder.Uri.AbsoluteUri.TrimEnd('/')
        }
    } catch {
        # Leave an unparseable value unchanged so Docker/npm can report it.
    }

    return $ProxyUrl
}

# Docker Desktop's host-side proxy is reachable from Linux build containers as
# host.docker.internal. Reuse the engine proxy when no explicit proxy was supplied.
$BuildHttpProxy = $HttpProxy
$BuildHttpsProxy = $HttpsProxy
$BuildNoProxy = $NoProxy
if ([string]::IsNullOrWhiteSpace($BuildHttpProxy)) {
    $BuildHttpProxy = (docker info --format '{{.HTTPProxy}}').Trim()
}
if ([string]::IsNullOrWhiteSpace($BuildHttpsProxy)) {
    $BuildHttpsProxy = (docker info --format '{{.HTTPSProxy}}').Trim()
}
if ([string]::IsNullOrWhiteSpace($BuildNoProxy)) {
    $BuildNoProxy = (docker info --format '{{.NoProxy}}').Trim()
}
if ([string]::IsNullOrWhiteSpace($BuildHttpsProxy)) {
    $BuildHttpsProxy = $BuildHttpProxy
}
$BuildHttpProxy = Normalize-ProxyUrl $BuildHttpProxy
$BuildHttpsProxy = Normalize-ProxyUrl $BuildHttpsProxy
$BuildHttpProxy = Convert-ToContainerProxyUrl $BuildHttpProxy
$BuildHttpsProxy = Convert-ToContainerProxyUrl $BuildHttpsProxy

# Buildx's registry-auth helper runs on Windows, so it cannot use Docker's
# internal proxy hostname. Prefer an explicit shell proxy, then Docker
# Desktop's host-side override (for example http://127.0.0.1:7890).
$ClientHttpProxy = $env:HTTP_PROXY
$ClientHttpsProxy = $env:HTTPS_PROXY
if ([string]::IsNullOrWhiteSpace($ClientHttpProxy) -and $PSBoundParameters.ContainsKey('HttpProxy')) {
    $ClientHttpProxy = $HttpProxy
}
if ([string]::IsNullOrWhiteSpace($ClientHttpsProxy) -and $PSBoundParameters.ContainsKey('HttpsProxy')) {
    $ClientHttpsProxy = $HttpsProxy
}
if ([string]::IsNullOrWhiteSpace($ClientHttpProxy)) {
    $ClientHttpProxy = Get-DockerDesktopProxyValue 'OverrideProxyHTTP'
}
if ([string]::IsNullOrWhiteSpace($ClientHttpsProxy)) {
    $ClientHttpsProxy = Get-DockerDesktopProxyValue 'OverrideProxyHTTPS'
}
if ([string]::IsNullOrWhiteSpace($ClientHttpsProxy)) {
    $ClientHttpsProxy = $ClientHttpProxy
}
$ClientHttpProxy = Normalize-ProxyUrl $ClientHttpProxy
$ClientHttpsProxy = Normalize-ProxyUrl $ClientHttpsProxy
if (-not [string]::IsNullOrWhiteSpace($ClientHttpProxy)) {
    $env:HTTP_PROXY = $ClientHttpProxy
    $env:http_proxy = $ClientHttpProxy
}
if (-not [string]::IsNullOrWhiteSpace($ClientHttpsProxy)) {
    $env:HTTPS_PROXY = $ClientHttpsProxy
    $env:https_proxy = $ClientHttpsProxy
}

$BuildArgs = @()
if (-not [string]::IsNullOrWhiteSpace($BuildHttpProxy)) {
    $BuildArgs += "--build-arg"
    $BuildArgs += "HTTP_PROXY=$BuildHttpProxy"
}
if (-not [string]::IsNullOrWhiteSpace($BuildHttpsProxy)) {
    $BuildArgs += "--build-arg"
    $BuildArgs += "HTTPS_PROXY=$BuildHttpsProxy"
}
if (-not [string]::IsNullOrWhiteSpace($BuildNoProxy)) {
    $BuildArgs += "--build-arg"
    $BuildArgs += "NO_PROXY=$BuildNoProxy"
}

if ($BuildArgs.Count -gt 0) {
    Write-Host "Using Docker build proxy."
}
if (-not [string]::IsNullOrWhiteSpace($ClientHttpProxy)) {
    Write-Host "Using Docker client proxy."
}

Write-Host "[1/4] Building $ImageName for $Platform ..."
docker compose build @BuildArgs
if ($LASTEXITCODE -ne 0) { throw "Docker image build failed." }

Write-Host "[2/4] Preparing offline bundle ..."
if (Test-Path -LiteralPath $BundleDir) {
    Remove-Item -LiteralPath $BundleDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $BundleDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $BundleDir "data") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $BundleDir "syncmatica") | Out-Null

Copy-Item -LiteralPath "docker-compose.offline.yml" -Destination (Join-Path $BundleDir "docker-compose.yml")
Copy-Item -LiteralPath "deploy-offline.sh" -Destination $BundleDir
Copy-Item -LiteralPath "config.js" -Destination $BundleDir
Copy-Item -LiteralPath "placements.json" -Destination $BundleDir
Copy-Item -Path "data\*" -Destination (Join-Path $BundleDir "data") -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Path "syncmatica\*" -Destination (Join-Path $BundleDir "syncmatica") -Recurse -Force -ErrorAction SilentlyContinue
Set-Content -LiteralPath (Join-Path $BundleDir ".env") -Value "IMAGE_NAME=$ImageName" -Encoding ascii

Write-Host "[3/4] Exporting Docker image ..."
$ImageTar = Join-Path $BundleDir "mineflayer-bot-image.tar"
docker image save --output $ImageTar $ImageName
if ($LASTEXITCODE -ne 0) { throw "Docker image export failed." }
$Hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $ImageTar).Hash.ToLowerInvariant()
Set-Content -LiteralPath (Join-Path $BundleDir "SHA256SUMS") -Value "$Hash  mineflayer-bot-image.tar" -Encoding ascii

Write-Host "[4/4] Creating $ArchivePath ..."
if (Test-Path -LiteralPath $ArchivePath) {
    Remove-Item -LiteralPath $ArchivePath -Force
}
tar -czf $ArchivePath -C $DistDir $BundleName
if ($LASTEXITCODE -ne 0) { throw "Archive creation failed." }

Write-Host "Done: $ArchivePath"
