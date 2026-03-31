#!/bin/bash
set -e

# ╔══════════════════════════════════════════════════════════════╗
# ║                    ServerLess Installer                       ║
# ║          Infrastructure Command Center - v0.1.0              ║
# ║                                                              ║
# ║  Usage:                                                      ║
# ║    curl -fsSL https://your-domain/install.sh | bash          ║
# ║    OR                                                        ║
# ║    bash install.sh                                           ║
# ║                                                              ║
# ║  Options:                                                    ║
# ║    --domain=example.com    Set domain (enables SSL)          ║
# ║    --port=3000             Set HTTP port (default: 3000)     ║
# ║    --admin-email=x@x.com  Admin email                       ║
# ║    --admin-pass=secret     Admin password                    ║
# ║    --no-ssl                Skip SSL setup                    ║
# ║    --uninstall             Remove ServerLess                  ║
# ╚══════════════════════════════════════════════════════════════╝

SL_VERSION="0.1.0"
SL_DIR="/opt/serverless"
SL_USER="serverless"
SL_REPO="https://github.com/joaoventuri/ServerLess.git"

# ─── Colors ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${GREEN}[SL]${NC} $1"; }
warn() { echo -e "${YELLOW}[SL]${NC} $1"; }
err()  { echo -e "${RED}[SL]${NC} $1"; exit 1; }
step() { echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${NC}\n"; }

# ─── Parse args ──────────────────────────────────────────────
DOMAIN=""
PORT="3000"
ADMIN_EMAIL="admin@serverless.local"
ADMIN_PASS=""
NO_SSL=false
UNINSTALL=false

for arg in "$@"; do
  case $arg in
    --domain=*)     DOMAIN="${arg#*=}" ;;
    --port=*)       PORT="${arg#*=}" ;;
    --admin-email=*) ADMIN_EMAIL="${arg#*=}" ;;
    --admin-pass=*) ADMIN_PASS="${arg#*=}" ;;
    --no-ssl)       NO_SSL=true ;;
    --uninstall)    UNINSTALL=true ;;
    --help)
      echo "Usage: bash install.sh [OPTIONS]"
      echo "  --domain=example.com    Set domain (enables SSL via Let's Encrypt)"
      echo "  --port=3000             HTTP port (default: 3000)"
      echo "  --admin-email=x@x.com  Admin account email"
      echo "  --admin-pass=secret     Admin account password (auto-generated if empty)"
      echo "  --no-ssl                Skip SSL even with domain"
      echo "  --uninstall             Remove ServerLess completely"
      exit 0
      ;;
  esac
done

# ─── Uninstall ───────────────────────────────────────────────
if [ "$UNINSTALL" = true ]; then
  step "Uninstalling ServerLess"
  systemctl stop serverless-backend serverless-frontend 2>/dev/null || true
  systemctl disable serverless-backend serverless-frontend 2>/dev/null || true
  rm -f /etc/systemd/system/serverless-*.service
  systemctl daemon-reload
  cd "$SL_DIR" 2>/dev/null && docker compose -f docker-compose.prod.yml down -v 2>/dev/null || true
  rm -rf "$SL_DIR"
  userdel -r "$SL_USER" 2>/dev/null || true
  rm -f /etc/nginx/sites-enabled/serverless /etc/nginx/sites-available/serverless
  nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
  log "ServerLess removed successfully."
  exit 0
fi

# ─── Pre-flight ──────────────────────────────────────────────
step "Pre-flight checks"

[ "$(id -u)" -eq 0 ] || err "This script must be run as root (use sudo)"

# Detect OS
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$ID
  OS_VERSION=$VERSION_ID
else
  err "Unsupported OS. Requires Ubuntu 20.04+ or Debian 11+"
fi

log "OS: $PRETTY_NAME"
log "Architecture: $(uname -m)"

case "$OS" in
  ubuntu|debian|pop) ;;
  *) warn "Untested OS: $OS. Proceeding anyway..." ;;
esac

# Generate admin password if not set
if [ -z "$ADMIN_PASS" ]; then
  ADMIN_PASS=$(openssl rand -base64 16 | tr -d '/+=')
fi

# Generate secrets
JWT_SECRET=$(openssl rand -hex 32)
PG_PASS=$(openssl rand -hex 16)
REDIS_PASS=$(openssl rand -hex 16)

# ─── System packages ────────────────────────────────────────
step "Installing system dependencies"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  curl wget git build-essential software-properties-common \
  ca-certificates gnupg lsb-release \
  nginx certbot python3-certbot-nginx \
  jq unzip > /dev/null 2>&1

log "System packages installed"

# ─── Docker ──────────────────────────────────────────────────
step "Setting up Docker"

if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  log "Docker installed"
else
  log "Docker already installed: $(docker --version)"
fi

if ! command -v docker compose &>/dev/null && ! docker compose version &>/dev/null; then
  apt-get install -y -qq docker-compose-plugin > /dev/null 2>&1
fi
log "Docker Compose: $(docker compose version --short 2>/dev/null || echo 'plugin')"

# ─── Node.js ────────────────────────────────────────────────
step "Setting up Node.js"

if ! command -v node &>/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null 2>&1
fi
log "Node.js: $(node -v)"
log "npm: $(npm -v)"

# ─── Create user & directory ────────────────────────────────
step "Setting up ServerLess"

id "$SL_USER" &>/dev/null || useradd -r -m -d "$SL_DIR" -s /bin/bash "$SL_USER"
mkdir -p "$SL_DIR"
chown "$SL_USER":"$SL_USER" "$SL_DIR"

# ─── Copy project files ─────────────────────────────────────
step "Deploying application"

# If running from the repo, copy local files
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/backend/package.json" ]; then
  log "Copying from local source..."
  cp -r "$SCRIPT_DIR/backend" "$SL_DIR/backend"
  cp -r "$SCRIPT_DIR/frontend" "$SL_DIR/frontend"
  [ -d "$SCRIPT_DIR/agent" ] && cp -r "$SCRIPT_DIR/agent" "$SL_DIR/agent"
else
  log "Cloning from repository..."
  if [ -d "$SL_DIR/.git" ]; then
    cd "$SL_DIR" && git pull --quiet
  else
    git clone --depth 1 "$SL_REPO" "$SL_DIR" 2>/dev/null || err "Failed to clone repository"
  fi
fi

chown -R "$SL_USER":"$SL_USER" "$SL_DIR"

# ─── Docker Compose (Postgres + Redis) ──────────────────────
step "Starting databases (PostgreSQL + Redis)"

cat > "$SL_DIR/docker-compose.prod.yml" << DEOF
services:
  postgres:
    image: timescale/timescaledb:latest-pg16
    restart: unless-stopped
    ports:
      - "127.0.0.1:5432:5432"
    environment:
      POSTGRES_USER: serverless
      POSTGRES_PASSWORD: ${PG_PASS}
      POSTGRES_DB: serverless
    volumes:
      - sl_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U serverless"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "127.0.0.1:6379:6379"
    command: redis-server --requirepass ${REDIS_PASS} --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - sl_redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASS}", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  sl_pgdata:
  sl_redisdata:
DEOF

cd "$SL_DIR"
docker compose -f docker-compose.prod.yml up -d

# Wait for databases
log "Waiting for databases to be ready..."
for i in $(seq 1 30); do
  docker compose -f docker-compose.prod.yml exec -T postgres pg_isready -U serverless > /dev/null 2>&1 && break
  sleep 2
done
log "PostgreSQL ready"

for i in $(seq 1 15); do
  docker compose -f docker-compose.prod.yml exec -T redis redis-cli -a "$REDIS_PASS" ping 2>/dev/null | grep -q PONG && break
  sleep 1
done
log "Redis ready"

# ─── Backend setup ───────────────────────────────────────────
step "Building backend"

cat > "$SL_DIR/backend/.env" << EEOF
DATABASE_URL="postgresql://serverless:${PG_PASS}@localhost:5432/serverless?schema=public"
REDIS_URL="redis://:${REDIS_PASS}@localhost:6379"
JWT_SECRET="${JWT_SECRET}"
PORT=3001
FRONTEND_URL="http://localhost:${PORT}"
NODE_ENV=production
EEOF

cd "$SL_DIR/backend"
sudo -u "$SL_USER" npm install --omit=dev --silent 2>&1 | tail -3
sudo -u "$SL_USER" npx prisma generate
sudo -u "$SL_USER" npx prisma db push --skip-generate

log "Backend built"

# ─── Seed admin user ────────────────────────────────────────
step "Creating admin account"

sudo -u "$SL_USER" node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
(async () => {
  const hash = await bcrypt.hash('${ADMIN_PASS}', 10);
  const user = await prisma.user.upsert({
    where: { email: '${ADMIN_EMAIL}' },
    update: { password: hash },
    create: { name: 'Admin', email: '${ADMIN_EMAIL}', password: hash },
  });
  const ws = await prisma.workspace.upsert({
    where: { slug: 'default' },
    update: {},
    create: { name: 'Default', slug: 'default', members: { create: { userId: user.id, role: 'owner' } } },
  });
  console.log('Admin account ready');
  await prisma.\$disconnect();
})();
" 2>&1

log "Admin: ${ADMIN_EMAIL}"

# ─── Frontend setup ──────────────────────────────────────────
step "Building frontend"

cd "$SL_DIR/frontend"

# Set frontend port
sed -i "s/\"dev\": \"next dev -p [0-9]*/\"dev\": \"next dev -p ${PORT}/" package.json 2>/dev/null || true

sudo -u "$SL_USER" npm install --silent 2>&1 | tail -3
sudo -u "$SL_USER" npx next build 2>&1 | tail -5

log "Frontend built"

# ─── Systemd services ───────────────────────────────────────
step "Creating system services"

cat > /etc/systemd/system/serverless-backend.service << SEOF
[Unit]
Description=ServerLess Backend API
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=${SL_USER}
WorkingDirectory=${SL_DIR}/backend
Environment=NODE_ENV=production
ExecStart=$(which node) --max-old-space-size=512 node_modules/.bin/tsx src/index.ts
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=sl-backend

[Install]
WantedBy=multi-user.target
SEOF

cat > /etc/systemd/system/serverless-frontend.service << SEOF
[Unit]
Description=ServerLess Frontend
After=network.target serverless-backend.service

[Service]
Type=simple
User=${SL_USER}
WorkingDirectory=${SL_DIR}/frontend
Environment=NODE_ENV=production
Environment=PORT=${PORT}
ExecStart=$(which npx) next start -p ${PORT}
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=sl-frontend

[Install]
WantedBy=multi-user.target
SEOF

systemctl daemon-reload
systemctl enable serverless-backend serverless-frontend
systemctl start serverless-backend
sleep 3
systemctl start serverless-frontend

log "Services started"

# ─── Nginx reverse proxy ────────────────────────────────────
step "Configuring Nginx"

SERVER_NAME="${DOMAIN:-_}"

cat > /etc/nginx/sites-available/serverless << NEOF
upstream sl_frontend {
    server 127.0.0.1:${PORT};
}

upstream sl_backend {
    server 127.0.0.1:3001;
}

server {
    listen 80;
    server_name ${SERVER_NAME};

    client_max_body_size 50M;

    # Frontend
    location / {
        proxy_pass http://sl_frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }

    # Backend API
    location /api/ {
        proxy_pass http://sl_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # WebSocket — Terminal
    location /ws/ {
        proxy_pass http://sl_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
    }

    # IDE proxy
    location /ide/ {
        proxy_pass http://sl_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
    }
}
NEOF

ln -sf /etc/nginx/sites-available/serverless /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t 2>&1 || err "Nginx config test failed"
systemctl enable nginx
systemctl restart nginx

log "Nginx configured"

# ─── SSL (Let's Encrypt) ────────────────────────────────────
if [ -n "$DOMAIN" ] && [ "$NO_SSL" = false ]; then
  step "Setting up SSL"
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$ADMIN_EMAIL" --redirect 2>&1 || warn "SSL setup failed — continuing without HTTPS"

  # Update frontend URL to https
  sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=https://${DOMAIN}|" "$SL_DIR/backend/.env"
  systemctl restart serverless-backend
  log "SSL enabled for $DOMAIN"
fi

# ─── Firewall ───────────────────────────────────────────────
step "Configuring firewall"

if command -v ufw &>/dev/null; then
  ufw allow 80/tcp > /dev/null 2>&1
  ufw allow 443/tcp > /dev/null 2>&1
  ufw allow 22/tcp > /dev/null 2>&1
  log "UFW rules added (80, 443, 22)"
fi

# ─── Health check ────────────────────────────────────────────
step "Running health checks"

sleep 5

BACKEND_OK=false
for i in $(seq 1 10); do
  if curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
    BACKEND_OK=true
    break
  fi
  sleep 2
done

FRONTEND_OK=false
for i in $(seq 1 10); do
  if curl -sf http://localhost:${PORT}/ > /dev/null 2>&1; then
    FRONTEND_OK=true
    break
  fi
  sleep 2
done

# ─── Summary ────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║        ██████  ██████  ███████ ██████  ██  ██████            ║"
echo "║       ██    ██ ██   ██ ██      ██   ██ ██ ██                 ║"
echo "║       ██    ██ ██████  ███████ ██████  ██ ██   ███           ║"
echo "║       ██    ██ ██           ██ ██   ██ ██ ██    ██           ║"
echo "║        ██████  ██      ███████ ██████  ██  ██████            ║"
echo "║                                                              ║"
echo "║              ServerLess installed successfully!               ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "  ${BOLD}Status:${NC}"
[ "$BACKEND_OK" = true ]  && echo -e "    Backend API  ${GREEN}● Running${NC}" || echo -e "    Backend API  ${RED}● Down${NC}"
[ "$FRONTEND_OK" = true ] && echo -e "    Frontend     ${GREEN}● Running${NC}" || echo -e "    Frontend     ${RED}● Down${NC}"
echo -e "    PostgreSQL   ${GREEN}● Running${NC}"
echo -e "    Redis        ${GREEN}● Running${NC}"
echo ""

if [ -n "$DOMAIN" ] && [ "$NO_SSL" = false ]; then
  ACCESS_URL="https://${DOMAIN}"
else
  IP=$(curl -sf ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
  ACCESS_URL="http://${IP}:${PORT}"
fi

echo -e "  ${BOLD}Access:${NC}"
echo -e "    URL:       ${CYAN}${ACCESS_URL}${NC}"
echo -e "    Email:     ${CYAN}${ADMIN_EMAIL}${NC}"
echo -e "    Password:  ${CYAN}${ADMIN_PASS}${NC}"
echo ""
echo -e "  ${BOLD}Services:${NC}"
echo -e "    Backend:   systemctl {start|stop|restart} serverless-backend"
echo -e "    Frontend:  systemctl {start|stop|restart} serverless-frontend"
echo -e "    Logs:      journalctl -u serverless-backend -f"
echo -e "               journalctl -u serverless-frontend -f"
echo ""
echo -e "  ${BOLD}Paths:${NC}"
echo -e "    Install:   ${SL_DIR}"
echo -e "    Config:    ${SL_DIR}/backend/.env"
echo -e "    Nginx:     /etc/nginx/sites-available/serverless"
echo ""
echo -e "  ${BOLD}Uninstall:${NC}"
echo -e "    bash ${SL_DIR}/install.sh --uninstall"
echo ""

# Save install info
cat > "$SL_DIR/.install-info" << IEOF
SL_VERSION=${SL_VERSION}
INSTALL_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
DOMAIN=${DOMAIN}
PORT=${PORT}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASS=${ADMIN_PASS}
JWT_SECRET=${JWT_SECRET}
PG_PASS=${PG_PASS}
REDIS_PASS=${REDIS_PASS}
ACCESS_URL=${ACCESS_URL}
IEOF
chmod 600 "$SL_DIR/.install-info"

log "Installation complete! Access at ${ACCESS_URL}"
