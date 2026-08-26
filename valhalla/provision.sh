#!/usr/bin/env bash
#
# First-time setup, run ON a fresh VM as a user with sudo.
#
# Everything before this is a human step that cannot be scripted from here —
# creating the VM and pointing DNS at it. See README.md.
#
#   scp -r valhalla/ user@vm:~/ && ssh user@vm 'cd valhalla && ./provision.sh'

set -euo pipefail

INSTALL_DIR="${VALHALLA_DIR:-/opt/gps4b-valhalla}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v docker >/dev/null; then
  echo "==> Installing Docker"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo "!! Log out and back in for group membership, then re-run this script."
  exit 0
fi

echo "==> Installing to $INSTALL_DIR"
sudo mkdir -p "$INSTALL_DIR/custom_files"
sudo chown -R "$USER" "$INSTALL_DIR"
cp "$here/docker-compose.yml" "$here/Caddyfile" "$here/.env.example" "$INSTALL_DIR/"

if [ ! -f "$INSTALL_DIR/.env" ]; then
  cp "$here/.env.example" "$INSTALL_DIR/.env"
  echo "!! Edit $INSTALL_DIR/.env (DOMAIN, ACME_EMAIL), then run:"
  echo "     cd $INSTALL_DIR && docker compose up -d"
  echo "   Valhalla will not answer until tiles are deployed — from a machine"
  echo "   with the repo: VALHALLA_HOST=$USER@\$(hostname -f) ./deploy-tiles.sh"
  exit 0
fi

# 2GB of RAM with no swap is tight enough that a traffic spike can OOM-kill the
# container mid-request; 2GB of swap costs disk and removes that failure mode.
if [ ! -f /swapfile ]; then
  echo "==> Adding 2GB swap"
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

cd "$INSTALL_DIR"
docker compose up -d
echo "==> Up. Deploy tiles next, then: ./smoke-test.sh https://<your-domain>"
