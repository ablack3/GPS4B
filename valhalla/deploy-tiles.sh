#!/usr/bin/env bash
#
# Ship a tile tarball built by build-tiles.sh to the production Valhalla host
# and swap it in.
#
# The swap is atomic-ish: upload beside the live tar, move into place, restart
# the container, smoke-test, and roll back to the previous tar if the smoke
# test fails. Routing is unavailable only for the length of the restart.
#
# Required environment:
#   VALHALLA_HOST   ssh target, e.g. deploy@routing.gps4b.org
#   VALHALLA_URL    public base URL used for the smoke test, e.g. https://routing.gps4b.org
# Optional:
#   VALHALLA_DIR    remote install directory (default /opt/gps4b-valhalla)

set -euo pipefail

: "${VALHALLA_HOST:?set VALHALLA_HOST, e.g. deploy@routing.gps4b.org}"
: "${VALHALLA_URL:?set VALHALLA_URL, e.g. https://routing.gps4b.org}"
REMOTE_DIR="${VALHALLA_DIR:-/opt/gps4b-valhalla}"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tar_path="${1:-$here/artifacts/valhalla_tiles.tar}"
[ -f "$tar_path" ] || { echo "No tile tarball at $tar_path — run build-tiles.sh first"; exit 1; }

echo "==> Uploading $(du -h "$tar_path" | cut -f1) to $VALHALLA_HOST:$REMOTE_DIR"
scp -o StrictHostKeyChecking=accept-new "$tar_path" \
  "$VALHALLA_HOST:$REMOTE_DIR/custom_files/valhalla_tiles.tar.incoming"

echo "==> Swapping tiles and restarting"
ssh -o StrictHostKeyChecking=accept-new "$VALHALLA_HOST" bash -s <<REMOTE
set -euo pipefail
cd "$REMOTE_DIR/custom_files"
[ -f valhalla_tiles.tar ] && cp valhalla_tiles.tar valhalla_tiles.tar.previous
mv valhalla_tiles.tar.incoming valhalla_tiles.tar
cd "$REMOTE_DIR"
docker compose restart valhalla
REMOTE

echo "==> Smoke-testing $VALHALLA_URL"
if "$here/smoke-test.sh" "$VALHALLA_URL"; then
  ssh "$VALHALLA_HOST" "rm -f $REMOTE_DIR/custom_files/valhalla_tiles.tar.previous"
  echo "==> Deployed."
else
  echo "!! Smoke test failed — rolling back to previous tiles"
  ssh "$VALHALLA_HOST" bash -s <<REMOTE
set -euo pipefail
cd "$REMOTE_DIR/custom_files"
[ -f valhalla_tiles.tar.previous ] || { echo "No previous tiles to roll back to"; exit 1; }
mv valhalla_tiles.tar.previous valhalla_tiles.tar
cd "$REMOTE_DIR"
docker compose restart valhalla
REMOTE
  exit 1
fi
