#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  FLOWPULSE — Gerador de JWT Keys para On-Premise                ║
# ║  Gera JWT_SECRET, ANON_KEY e SERVICE_ROLE_KEY seguros.           ║
# ║                                                                  ║
# ║  Uso: bash scripts/generate-keys.sh [--apply deploy/.env]       ║
# ║                                                                  ║
# ║  Requer: openssl, python3 ou node (para gerar JWTs)              ║
# ╚══════════════════════════════════════════════════════════════════╝

set -euo pipefail

ENV_FILE=""
QUIET=false

for arg in "$@"; do
  case "$arg" in
    --apply)  shift; ENV_FILE="${1:-}" ;;
    --quiet)  QUIET=true ;;
  esac
  shift 2>/dev/null || true
done

# ─── Generate JWT_SECRET ──────────────────────────────────
JWT_SECRET=$(openssl rand -hex 32)

# ─── Generate JWTs using Node.js (available via npm) ──────
generate_jwt() {
  local role="$1"
  local secret="$2"
  
  # Try node first
  if command -v node &>/dev/null; then
    node -e "
      const crypto = require('crypto');
      const header = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        iss: 'supabase',
        ref: 'flowpulse-onprem',
        role: '${role}',
        iat: Math.floor(Date.now()/1000),
        exp: Math.floor(Date.now()/1000) + (10 * 365 * 24 * 60 * 60)
      })).toString('base64url');
      const sig = crypto.createHmac('sha256', '${secret}')
        .update(header + '.' + payload)
        .digest('base64url');
      console.log(header + '.' + payload + '.' + sig);
    "
    return 0
  fi
  
  # Try python3 as fallback
  if command -v python3 &>/dev/null; then
    python3 -c "
import hmac, hashlib, base64, json, time, sys

def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

header = b64url(json.dumps({'alg':'HS256','typ':'JWT'}).encode())
payload = b64url(json.dumps({
    'iss': 'supabase',
    'ref': 'flowpulse-onprem',
    'role': '${role}',
    'iat': int(time.time()),
    'exp': int(time.time()) + 10*365*24*60*60
}).encode())
sig = b64url(hmac.new('${secret}'.encode(), (header+'.'+payload).encode(), hashlib.sha256).digest())
print(header+'.'+payload+'.'+sig)
"
    return 0
  fi
  
  echo "ERROR: Precisa de node ou python3 para gerar JWTs" >&2
  return 1
}

ANON_KEY=$(generate_jwt "anon" "$JWT_SECRET")
SERVICE_ROLE_KEY=$(generate_jwt "service_role" "$JWT_SECRET")

# ─── Generate other secrets ───────────────────────────────
ZABBIX_ENCRYPTION_KEY=$(openssl rand -hex 32)
FLOWPULSE_WEBHOOK_TOKEN=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
SECRET_KEY_BASE=$(openssl rand -base64 48 | tr -d '/+=' | head -c 64)

if [ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ]; then
  # Replace placeholder/demo values in existing .env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" "$ENV_FILE"
  sed -i "s|^ANON_KEY=.*|ANON_KEY=${ANON_KEY}|" "$ENV_FILE"
  sed -i "s|^SERVICE_ROLE_KEY=.*|SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}|" "$ENV_FILE"
  sed -i "s|^ZABBIX_ENCRYPTION_KEY=.*|ZABBIX_ENCRYPTION_KEY=${ZABBIX_ENCRYPTION_KEY}|" "$ENV_FILE"
  sed -i "s|^FLOWPULSE_WEBHOOK_TOKEN=.*|FLOWPULSE_WEBHOOK_TOKEN=${FLOWPULSE_WEBHOOK_TOKEN}|" "$ENV_FILE"
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" "$ENV_FILE"
  sed -i "s|^SECRET_KEY_BASE=.*|SECRET_KEY_BASE=${SECRET_KEY_BASE}|" "$ENV_FILE"
  
  # Also update VITE_SUPABASE_PUBLISHABLE_KEY to use the new ANON_KEY
  sed -i "s|^VITE_SUPABASE_PUBLISHABLE_KEY=.*|VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}|" "$ENV_FILE"

  if ! $QUIET; then
    echo "✅ Keys geradas e aplicadas em $ENV_FILE"
    echo ""
    echo "   JWT_SECRET=${JWT_SECRET:0:16}..."
    echo "   ANON_KEY=${ANON_KEY:0:32}..."
    echo "   SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY:0:32}..."
    echo "   POSTGRES_PASSWORD=${POSTGRES_PASSWORD:0:8}..."
  fi
else
  # Print to stdout for manual copy
  echo "# ─── Generated FlowPulse Keys ─────────────────"
  echo "JWT_SECRET=${JWT_SECRET}"
  echo "ANON_KEY=${ANON_KEY}"
  echo "SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}"
  echo "VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}"
  echo "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}"
  echo "SECRET_KEY_BASE=${SECRET_KEY_BASE}"
  echo "ZABBIX_ENCRYPTION_KEY=${ZABBIX_ENCRYPTION_KEY}"
  echo "FLOWPULSE_WEBHOOK_TOKEN=${FLOWPULSE_WEBHOOK_TOKEN}"
fi
