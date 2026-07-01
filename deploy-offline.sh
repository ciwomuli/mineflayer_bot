#!/bin/sh
set -eu

cd "$(dirname "$0")"

echo "[1/3] Verifying image package ..."
sha256sum -c SHA256SUMS

echo "[2/3] Importing Docker image ..."
docker load -i mineflayer-bot-image.tar

echo "[3/3] Starting service without building or pulling ..."
docker compose up -d --no-build --pull never
docker compose ps
