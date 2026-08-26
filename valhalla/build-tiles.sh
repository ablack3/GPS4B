#!/usr/bin/env bash
#
# Build Valhalla routing tiles from a fresh Geofabrik extract.
#
# Runs OFF the production host: tile building is memory-hungry and the serving
# VM is a 2GB box (ADR 0001). CI runs this on a GitHub-hosted runner; a laptop
# with Docker works too.
#
# Output: ./artifacts/valhalla_tiles.tar — the single file deploy-tiles.sh
# ships to the server. Valhalla has no incremental update, so this is always a
# full rebuild.
#
# Usage: ./build-tiles.sh [extract-url]

set -euo pipefail

EXTRACT_URL="${1:-https://download.geofabrik.de/north-america/us/massachusetts-latest.osm.pbf}"
IMAGE="${VALHALLA_IMAGE:-ghcr.io/gis-ops/docker-valhalla/valhalla:latest}"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
work="$here/build"
out="$here/artifacts"

rm -rf "$work"
mkdir -p "$work/custom_files" "$out"

pbf="$work/custom_files/$(basename "$EXTRACT_URL")"
echo "==> Downloading $EXTRACT_URL"
curl -fSL --retry 3 -o "$pbf" "$EXTRACT_URL"
echo "==> Extract: $(du -h "$pbf" | cut -f1)"

# The gis-ops image builds admins, timezones, and tiles on startup, then exits
# once build_tar has been written. serve_tiles=False keeps it from staying up.
echo "==> Building tiles (this takes ~10-30 min for Massachusetts)"
docker run --rm \
  -v "$work/custom_files:/custom_files" \
  -e serve_tiles=False \
  -e build_tar=True \
  -e build_admins=True \
  -e build_time_zones=True \
  -e force_rebuild=True \
  "$IMAGE"

tar_path="$work/custom_files/valhalla_tiles.tar"
[ -f "$tar_path" ] || { echo "Build produced no valhalla_tiles.tar"; exit 1; }

mv "$tar_path" "$out/valhalla_tiles.tar"
date -u +%Y-%m-%dT%H:%M:%SZ > "$out/BUILT_AT"
basename "$EXTRACT_URL" > "$out/EXTRACT"

echo "==> Done: $out/valhalla_tiles.tar ($(du -h "$out/valhalla_tiles.tar" | cut -f1))"
