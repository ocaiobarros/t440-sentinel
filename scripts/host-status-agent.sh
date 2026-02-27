#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  FlowPulse Host Status Agent                                     ║
# ║  Collects real system metrics and pushes to DB via PostgREST      ║
# ║  Usage: Add to crontab — runs every 30s via two offset entries    ║
# ║  * * * * * /opt/flowpulse/scripts/host-status-agent.sh            ║
# ║  * * * * * sleep 30 && /opt/flowpulse/scripts/host-status-agent.sh║
# ╚══════════════════════════════════════════════════════════════════╝
set -euo pipefail

# ── Configuration (override via env or /etc/flowpulse/flowpulse.env) ──
FLOWPULSE_ENV="${FLOWPULSE_ENV:-/etc/flowpulse/flowpulse.env}"
[ -f "$FLOWPULSE_ENV" ] && . "$FLOWPULSE_ENV"

# For Docker on-prem, read from deploy/.env
DEPLOY_ENV="${DEPLOY_ENV:-$(dirname "$(readlink -f "$0")")/../deploy/.env}"
[ -f "$DEPLOY_ENV" ] && . "$DEPLOY_ENV"

KONG_URL="${KONG_URL:-http://127.0.0.1:8000}"
SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:-$SUPABASE_SERVICE_ROLE_KEY}"
TENANT_ID="${FLOWPULSE_TENANT_ID:-}"

if [ -z "$SERVICE_ROLE_KEY" ]; then
  echo "ERROR: SERVICE_ROLE_KEY not set" >&2
  exit 1
fi

# ── Auto-detect tenant_id if not set ──
if [ -z "$TENANT_ID" ]; then
  TENANT_ID=$(curl -sf "${KONG_URL}/rest/v1/tenants?select=id&limit=1" \
    -H "apikey: ${SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" | \
    python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])" 2>/dev/null || true)
fi

if [ -z "$TENANT_ID" ]; then
  echo "ERROR: Could not determine TENANT_ID" >&2
  exit 1
fi

# ── Collect OS info ──
OS_NAME=$(grep PRETTY_NAME /etc/os-release 2>/dev/null | cut -d'"' -f2 || echo "Linux")
KERNEL=$(uname -r)
ARCH=$(uname -m)

# ── Uptime ──
UPTIME_SEC=$(awk '{print int($1)}' /proc/uptime)
# App uptime: time since flowpulse service started (if systemd)
APP_PID=$(pgrep -f "flowpulse.*server" 2>/dev/null | head -1 || echo "")
if [ -n "$APP_PID" ] && [ -d "/proc/$APP_PID" ]; then
  APP_START=$(stat -c %Y "/proc/$APP_PID" 2>/dev/null || echo "0")
  NOW=$(date +%s)
  APP_UPTIME=$((NOW - APP_START))
else
  # For Docker: use container uptime approximation
  APP_UPTIME=$UPTIME_SEC
fi

# ── CPU ──
CPU_MODEL=$(grep "model name" /proc/cpuinfo | head -1 | cut -d: -f2 | xargs || echo "Unknown")
CPU_CORES=$(nproc)
CPU_MHZ=$(grep "cpu MHz" /proc/cpuinfo | head -1 | awk '{print int($4)}' || echo "0")

# Per-core usage from /proc/stat (snapshot comparison)
read_cpu_stats() {
  awk '/^cpu[0-9]/ {
    core=substr($1,4); user=$2; nice=$3; sys=$4; idle=$5; iow=$6; irq=$7; sirq=$8;
    total=user+nice+sys+idle+iow+irq+sirq;
    printf "%s %d %d\n", core, idle, total
  }' /proc/stat
}

STAT1=$(read_cpu_stats)
sleep 1
STAT2=$(read_cpu_stats)

PER_CORE_JSON="["
TOTAL_USAGE=0
i=0
while IFS= read -r line2; do
  core=$(echo "$line2" | awk '{print $1}')
  idle2=$(echo "$line2" | awk '{print $2}')
  total2=$(echo "$line2" | awk '{print $3}')
  
  line1=$(echo "$STAT1" | grep "^${core} ")
  idle1=$(echo "$line1" | awk '{print $2}')
  total1=$(echo "$line1" | awk '{print $3}')
  
  d_idle=$((idle2 - idle1))
  d_total=$((total2 - total1))
  
  if [ "$d_total" -gt 0 ]; then
    usage=$(( (d_total - d_idle) * 100 / d_total ))
  else
    usage=0
  fi
  
  [ $i -gt 0 ] && PER_CORE_JSON="${PER_CORE_JSON},"
  PER_CORE_JSON="${PER_CORE_JSON}{\"core\":${core},\"usage\":${usage}}"
  TOTAL_USAGE=$((TOTAL_USAGE + usage))
  i=$((i + 1))
done <<< "$STAT2"
PER_CORE_JSON="${PER_CORE_JSON}]"

if [ $i -gt 0 ]; then
  AVG_CPU=$((TOTAL_USAGE / i))
else
  AVG_CPU=0
fi

# ── Memory ──
MEM_TOTAL=$(awk '/^MemTotal/ {printf "%.1f", $2/1048576}' /proc/meminfo)
MEM_AVAIL=$(awk '/^MemAvailable/ {printf "%.1f", $2/1048576}' /proc/meminfo)
MEM_USED=$(python3 -c "print(round(${MEM_TOTAL} - ${MEM_AVAIL}, 1))")
MEM_PCT=$(python3 -c "print(round(${MEM_USED}/${MEM_TOTAL}*100))" 2>/dev/null || echo "0")

SWAP_TOTAL=$(awk '/^SwapTotal/ {printf "%.1f", $2/1048576}' /proc/meminfo)
SWAP_FREE=$(awk '/^SwapFree/ {printf "%.1f", $2/1048576}' /proc/meminfo)
SWAP_USED=$(python3 -c "print(round(${SWAP_TOTAL} - ${SWAP_FREE}, 2))")
SWAP_PCT=$(python3 -c "t=${SWAP_TOTAL}; print(round(${SWAP_USED}/t*100) if t > 0 else 0)")

# ── Disks ──
DISKS_JSON=$(df -BG --output=target,size,used,pcent -x tmpfs -x devtmpfs -x overlay 2>/dev/null | tail -n+2 | awk '{
  mount=$1; total=int($2); used=int($3); pct=int($4);
  printf "{\"mount\":\"%s\",\"totalGb\":%d,\"usedGb\":%d,\"percent\":%d}", mount, total, used, pct
}' | paste -sd',' | sed 's/^/[/;s/$/]/')

[ -z "$DISKS_JSON" ] && DISKS_JSON="[]"

# ── Database size ──
DB_SIZE_MB=0
if command -v psql &>/dev/null; then
  DB_SIZE_MB=$(PGPASSWORD="${DB_PASS:-${POSTGRES_PASSWORD:-}}" psql -U "${DB_USER:-supabase_admin}" -d "${DB_NAME:-postgres}" -Atc \
    "SELECT round(pg_database_size(current_database())/1048576.0);" 2>/dev/null || echo "0")
elif [ -n "${POSTGRES_PASSWORD:-}" ]; then
  # Try via Docker
  DB_SIZE_MB=$(docker compose -f deploy/docker-compose.onprem.yml exec -T db sh -lc \
    'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres -Atc "SELECT round(pg_database_size(current_database())/1048576.0);"' 2>/dev/null || echo "0")
fi

DB_ENGINE="PostgreSQL 15"

# ── Services ──
SERVICES_JSON="["
SVC_I=0
for svc in flowpulse-api postgresql nginx kong; do
  pid=$(pgrep -f "$svc" 2>/dev/null | head -1 || echo "0")
  if [ "$pid" != "0" ] && [ -n "$pid" ]; then
    status="running"
  else
    status="stopped"
    pid=0
  fi
  [ $SVC_I -gt 0 ] && SERVICES_JSON="${SERVICES_JSON},"
  SERVICES_JSON="${SERVICES_JSON}{\"name\":\"${svc}\",\"status\":\"${status}\",\"pid\":${pid}}"
  SVC_I=$((SVC_I + 1))
done
SERVICES_JSON="${SERVICES_JSON}]"

# ── FlowPulse version ──
APP_VERSION="2.4.1"
[ -f /usr/share/flowpulse/VERSION ] && APP_VERSION=$(cat /usr/share/flowpulse/VERSION)

# ── Build payload ──
COLLECTED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

PAYLOAD=$(cat <<EOJSON
{
  "os": {"name": "${OS_NAME}", "kernel": "${KERNEL}", "arch": "${ARCH}"},
  "app_version": "${APP_VERSION}",
  "uptime": {"system_seconds": ${UPTIME_SEC}, "app_seconds": ${APP_UPTIME}},
  "cpu": {
    "model": "${CPU_MODEL}",
    "cores": ${CPU_CORES},
    "usage_percent": ${AVG_CPU},
    "frequency_mhz": ${CPU_MHZ},
    "per_core": ${PER_CORE_JSON}
  },
  "memory": {"total_gb": ${MEM_TOTAL}, "used_gb": ${MEM_USED}, "percent": ${MEM_PCT}},
  "swap": {"total_gb": ${SWAP_TOTAL}, "used_gb": ${SWAP_USED}, "percent": ${SWAP_PCT}},
  "disks": ${DISKS_JSON},
  "database": {"size_mb": ${DB_SIZE_MB}, "engine": "${DB_ENGINE}"},
  "services": ${SERVICES_JSON},
  "collected_at": "${COLLECTED_AT}"
}
EOJSON
)

# ── Upsert to DB via PostgREST ──
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
  "${KONG_URL}/rest/v1/system_status_snapshots" \
  -X POST \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates" \
  -d "{\"tenant_id\":\"${TENANT_ID}\",\"payload\":${PAYLOAD},\"collected_at\":\"${COLLECTED_AT}\"}")

if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
  echo "[$(date)] OK — status pushed (HTTP ${HTTP_CODE})"
else
  echo "[$(date)] WARN — HTTP ${HTTP_CODE}" >&2
fi
