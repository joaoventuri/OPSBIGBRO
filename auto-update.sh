#!/bin/bash
set -e

LOG_FILE="/var/log/serverless-update.log"
REPO_DIR="/opt/serverless"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "🔄 Checking for updates..."

cd "$REPO_DIR"

# Fetch latest
git fetch origin master

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/master)

if [ "$LOCAL" = "$REMOTE" ]; then
    log "✅ Already up to date"
    exit 0
fi

log "🆕 New version available, updating..."

# Pull latest
git pull origin master

# Install dependencies
log "📦 Installing backend dependencies..."
cd backend && npm install --omit=dev

log "📦 Running migrations..."
npx prisma generate
npx prisma db push --skip-generate

log "📦 Installing frontend dependencies..."
cd ../frontend && npm install

log "🏗️  Building frontend..."
npx next build

# Restart services
log "🔄 Restarting services..."
systemctl restart serverless-backend serverless-frontend

log "✅ Update complete!"
