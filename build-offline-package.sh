#!/bin/sh
set -eu

IMAGE_NAME="mineflayer-bot:1.0.1"
BUNDLE_NAME="mineflayer-bot-offline"
PLATFORM="linux/amd64"

usage() {
    cat <<'EOF'
Usage: sh build-offline-package.sh [options]

Options:
  --image NAME       Image name and tag (default: mineflayer-bot:1.0.0)
  --bundle NAME      Output bundle name (default: mineflayer-bot-offline)
  --platform VALUE   linux/amd64 or linux/arm64 (default: linux/amd64)
  -h, --help         Show this help
EOF
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --image)
            [ "$#" -ge 2 ] || { echo "Missing value for --image" >&2; exit 2; }
            IMAGE_NAME=$2
            shift 2
            ;;
        --bundle)
            [ "$#" -ge 2 ] || { echo "Missing value for --bundle" >&2; exit 2; }
            BUNDLE_NAME=$2
            shift 2
            ;;
        --platform)
            [ "$#" -ge 2 ] || { echo "Missing value for --platform" >&2; exit 2; }
            PLATFORM=$2
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

case "$PLATFORM" in
    linux/amd64|linux/arm64) ;;
    *)
        echo "Unsupported platform: $PLATFORM" >&2
        exit 2
        ;;
esac

case "$BUNDLE_NAME" in
    ""|"."|".."|*/*)
        echo "Bundle name must be a simple directory name: $BUNDLE_NAME" >&2
        exit 2
        ;;
esac

command -v docker >/dev/null 2>&1 || { echo "docker is not installed" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is not available" >&2; exit 1; }
command -v tar >/dev/null 2>&1 || { echo "tar is not installed" >&2; exit 1; }
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum is not installed" >&2; exit 1; }

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DIST_DIR="$SCRIPT_DIR/dist"
BUNDLE_DIR="$DIST_DIR/$BUNDLE_NAME"
ARCHIVE_PATH="$DIST_DIR/$BUNDLE_NAME.tar.gz"

cd "$SCRIPT_DIR"
export IMAGE_NAME
export DOCKER_DEFAULT_PLATFORM="$PLATFORM"

echo "[1/4] Building $IMAGE_NAME for $PLATFORM ..."
docker compose build

echo "[2/4] Preparing offline bundle ..."
mkdir -p "$DIST_DIR"
rm -rf -- "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR/data" "$BUNDLE_DIR/syncmatica"

cp docker-compose.offline.yml "$BUNDLE_DIR/docker-compose.yml"
cp deploy-offline.sh config.js placements.json "$BUNDLE_DIR/"
cp -R data/. "$BUNDLE_DIR/data/"
cp -R syncmatica/. "$BUNDLE_DIR/syncmatica/"
printf 'IMAGE_NAME=%s\n' "$IMAGE_NAME" > "$BUNDLE_DIR/.env"

echo "[3/4] Exporting Docker image ..."
docker image save --output "$BUNDLE_DIR/mineflayer-bot-image.tar" "$IMAGE_NAME"
(
    cd "$BUNDLE_DIR"
    sha256sum mineflayer-bot-image.tar > SHA256SUMS
)

echo "[4/4] Creating $ARCHIVE_PATH ..."
rm -f -- "$ARCHIVE_PATH"
tar -czf "$ARCHIVE_PATH" -C "$DIST_DIR" "$BUNDLE_NAME"

echo "Done: $ARCHIVE_PATH"
