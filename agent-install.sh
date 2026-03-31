#!/bin/bash
set -e

# OpsBigBro Agent Installer
# Usage: curl -fsSL https://your-obb-server/agent/install.sh | bash -s -- --token=XXX --api=https://your-obb-server

GREEN='\033[0;32m'
NC='\033[0m'
log() { echo -e "${GREEN}[OBB Agent]${NC} $1"; }

TOKEN=""
API_URL=""

for arg in "$@"; do
  case $arg in
    --token=*) TOKEN="${arg#*=}" ;;
    --api=*)   API_URL="${arg#*=}" ;;
  esac
done

[ -z "$TOKEN" ] && { echo "Error: --token is required"; exit 1; }
[ -z "$API_URL" ] && { echo "Error: --api is required"; exit 1; }

ARCH=$(uname -m)
case $ARCH in
  x86_64)  GOARCH="amd64" ;;
  aarch64) GOARCH="arm64" ;;
  armv7l)  GOARCH="arm" ;;
  *) echo "Unsupported arch: $ARCH"; exit 1 ;;
esac

log "Installing OpsBigBro Agent (${ARCH})"

# Check if Go is available to build, otherwise download pre-built
AGENT_DIR="/opt/opsbigbro-agent"
mkdir -p "$AGENT_DIR"

if command -v go &>/dev/null; then
  log "Building agent from source..."
  cat > "$AGENT_DIR/main.go" << 'GOEOF'
GOEOF
  # For now, use a simple shell-based agent as fallback
fi

# Shell-based agent (works everywhere, no Go needed)
cat > "$AGENT_DIR/agent.sh" << 'AGENTEOF'
#!/bin/bash
TOKEN="__TOKEN__"
API_URL="__API_URL__"
INTERVAL=60

collect_and_send() {
  # CPU
  CPU=$(top -bn1 2>/dev/null | grep "Cpu(s)" | awk '{print $2}' || echo "0")

  # RAM
  RAM_INFO=$(free -m 2>/dev/null | awk 'NR==2{printf "%s %s", $3, $2}')
  RAM_USED=$(echo $RAM_INFO | awk '{print $1}')
  RAM_TOTAL=$(echo $RAM_INFO | awk '{print $2}')

  # Disk
  DISK_INFO=$(df -BG / 2>/dev/null | awk 'NR==2{gsub(/G/,""); printf "%s %s", $3, $2}')
  DISK_USED=$(echo $DISK_INFO | awk '{print $1}')
  DISK_TOTAL=$(echo $DISK_INFO | awk '{print $2}')

  # Network
  NET=$(cat /proc/net/dev 2>/dev/null | awk 'NR>2{rx+=$2; tx+=$10} END{printf "%.0f %.0f", rx/1024, tx/1024}')
  NET_RX=$(echo $NET | awk '{print $1}')
  NET_TX=$(echo $NET | awk '{print $2}')

  # Docker containers
  CONTAINERS="[]"
  if [ -S /var/run/docker.sock ] && command -v docker &>/dev/null; then
    CONTAINERS=$(docker ps -a --format '{"containerId":"{{.ID}}","name":"{{.Names}}","image":"{{.Image}}","status":"{{.Status}}"}' 2>/dev/null | \
      sed 's/Up [^"]*/running/; s/Exited [^"]*/exited/; s/Paused/paused/' | \
      jq -s '.' 2>/dev/null || echo "[]")
  fi

  # Send
  PAYLOAD=$(cat << PEOF
{
  "token": "${TOKEN}",
  "cpuPercent": ${CPU:-0},
  "ramUsedMb": ${RAM_USED:-0},
  "ramTotalMb": ${RAM_TOTAL:-0},
  "diskUsedGb": ${DISK_USED:-0},
  "diskTotalGb": ${DISK_TOTAL:-0},
  "netRxKb": ${NET_RX:-0},
  "netTxKb": ${NET_TX:-0},
  "containers": ${CONTAINERS}
}
PEOF
)

  curl -sf -X POST "${API_URL}/api/telemetry/ingest" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" > /dev/null 2>&1 && printf "." || printf "x"
}

echo "[OBB Agent] Running (interval: ${INTERVAL}s)"
while true; do
  collect_and_send
  sleep $INTERVAL
done
AGENTEOF

# Replace placeholders
sed -i "s|__TOKEN__|${TOKEN}|g" "$AGENT_DIR/agent.sh"
sed -i "s|__API_URL__|${API_URL}|g" "$AGENT_DIR/agent.sh"
chmod +x "$AGENT_DIR/agent.sh"

# Create systemd service
cat > /etc/systemd/system/opsbigbro-agent.service << SVCEOF
[Unit]
Description=OpsBigBro Monitoring Agent
After=network.target

[Service]
Type=simple
ExecStart=/bin/bash ${AGENT_DIR}/agent.sh
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=obb-agent

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable opsbigbro-agent
systemctl start opsbigbro-agent

log "Agent installed and running!"
log "Status: systemctl status opsbigbro-agent"
log "Logs:   journalctl -u opsbigbro-agent -f"
