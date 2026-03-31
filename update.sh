#!/bin/bash
set -e

# OpsBigBro Updater
OBB_DIR="/opt/opsbigbro"
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${GREEN}[OBB]${NC} $1"; }

[ "$(id -u)" -eq 0 ] || { echo "Run as root"; exit 1; }
[ -d "$OBB_DIR" ] || { echo "OpsBigBro not found at $OBB_DIR"; exit 1; }

# Load install info
source "$OBB_DIR/.install-info"

log "Updating OpsBigBro..."

# Stop services
systemctl stop opsbigbro-frontend opsbigbro-backend

# Pull latest code
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/backend/package.json" ] && [ "$SCRIPT_DIR" != "$OBB_DIR" ]; then
  log "Copying from local source..."
  rsync -a --delete --exclude=node_modules --exclude=.next --exclude=.env "$SCRIPT_DIR/backend/" "$OBB_DIR/backend/"
  rsync -a --delete --exclude=node_modules --exclude=.next "$SCRIPT_DIR/frontend/" "$OBB_DIR/frontend/"
elif [ -d "$OBB_DIR/.git" ]; then
  cd "$OBB_DIR" && git pull --quiet
fi

chown -R opsbigbro:opsbigbro "$OBB_DIR"

# Rebuild
cd "$OBB_DIR/backend"
sudo -u opsbigbro npm install --omit=dev --silent 2>&1 | tail -3
sudo -u opsbigbro npx prisma generate
sudo -u opsbigbro npx prisma db push --skip-generate

cd "$OBB_DIR/frontend"
sudo -u opsbigbro npm install --silent 2>&1 | tail -3
sudo -u opsbigbro npx next build 2>&1 | tail -5

# Restart
systemctl start opsbigbro-backend
sleep 3
systemctl start opsbigbro-frontend

log "Update complete! Access at ${ACCESS_URL}"
