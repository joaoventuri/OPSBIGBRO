#!/bin/bash
set -e

# ServerLess Updater
SL_DIR="/opt/serverless"
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${GREEN}[SL]${NC} $1"; }

[ "$(id -u)" -eq 0 ] || { echo "Run as root"; exit 1; }
[ -d "$SL_DIR" ] || { echo "ServerLess not found at $SL_DIR"; exit 1; }

# Load install info
source "$SL_DIR/.install-info"

log "Updating ServerLess..."

# Stop services
systemctl stop serverless-frontend serverless-backend

# Pull latest code
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/backend/package.json" ] && [ "$SCRIPT_DIR" != "$SL_DIR" ]; then
  log "Copying from local source..."
  rsync -a --delete --exclude=node_modules --exclude=.next --exclude=.env "$SCRIPT_DIR/backend/" "$SL_DIR/backend/"
  rsync -a --delete --exclude=node_modules --exclude=.next "$SCRIPT_DIR/frontend/" "$SL_DIR/frontend/"
elif [ -d "$SL_DIR/.git" ]; then
  cd "$SL_DIR" && git pull --quiet
fi

chown -R serverless:serverless "$SL_DIR"

# Rebuild
cd "$SL_DIR/backend"
sudo -u serverless npm install --omit=dev --silent 2>&1 | tail -3
sudo -u serverless npx prisma generate
sudo -u serverless npx prisma db push --skip-generate

cd "$SL_DIR/frontend"
sudo -u serverless npm install --silent 2>&1 | tail -3
sudo -u serverless npx next build 2>&1 | tail -5

# Restart
systemctl start serverless-backend
sleep 3
systemctl start serverless-frontend

log "Update complete! Access at ${ACCESS_URL}"
