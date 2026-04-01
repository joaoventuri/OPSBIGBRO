#!/bin/bash

LOG_FILE="/var/log/serverless-update.log"
REPO_DIR="/opt/serverless"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Checking for updates..."

cd "$REPO_DIR"

# Fetch latest
git fetch origin master

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/master)

if [ "$LOCAL" = "$REMOTE" ]; then
    log "Already up to date"
    exit 0
fi

log "New version available, updating..."

# Pull latest
git pull origin master

# Backend deps + migrations
log "Installing backend dependencies..."
cd "$REPO_DIR/backend"
npm install --omit=dev 2>&1 | tail -3
npx prisma generate 2>&1 | tail -3
npx prisma db push --skip-generate 2>&1 | tail -3

# Frontend deps + build
log "Installing frontend dependencies..."
cd "$REPO_DIR/frontend"
npm install 2>&1 | tail -3

log "Building frontend..."
if ! npx next build 2>&1 | tee -a "$LOG_FILE" | tail -5; then
    log "ERROR: Frontend build failed, aborting update"
    exit 1
fi

# Only restart after successful build
log "Restarting services..."
systemctl restart serverless-backend
sleep 2
systemctl restart serverless-frontend

log "Update complete!"
