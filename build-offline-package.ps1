param(
    [string]$ImageName = "mineflayer-bot:1.0.0",
    [string]$BundleName = "mineflayer-bot-offline",
    [ValidateSet("linux/amd64", "linux/arm64")]
    [string]$Platform = "linux/amd64"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$DistDir = Join-Path $ProjectRoot "dist"
$BundleDir = Join-Path $DistDir $BundleName
$ArchivePath = Join-Path $DistDir "$BundleName.tar.gz"

Set-Location $ProjectRoot
$env:IMAGE_NAME = $ImageName
$env:DOCKER_DEFAULT_PLATFORM = $Platform

Write-Host "[1/4] Building $ImageName for $Platform ..."
docker compose build
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
