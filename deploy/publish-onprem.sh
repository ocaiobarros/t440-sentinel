#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  FlowPulse — On-Prem Publish Script (Debian 12 + Docker)       ║
# ║  Builds the frontend and deploys to the Docker Nginx container  ║
# ╚══════════════════════════════════════════════════════════════════╝
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NGINX_CONTAINER="deploy-nginx-1"
NGINX_HTML_PATH="/usr/share/nginx/html"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }

# ─── Pre-flight checks ───────────────────────────────────────────
info "Pre-flight checks..."
command -v npm  >/dev/null 2>&1 || fail "npm not found"
command -v docker >/dev/null 2>&1 || fail "docker not found"
docker inspect "$NGINX_CONTAINER" >/dev/null 2>&1 || fail "Container '$NGINX_CONTAINER' not found. Is the stack running?"

cd "$PROJECT_DIR"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
info "Project dir: $PROJECT_DIR"
info "Commit:      $COMMIT"

# ─── 1) Install dependencies ─────────────────────────────────────
info "Installing dependencies..."
npm install --prefer-offline --no-audit 2>&1 | tail -1

# ─── 2) Update browserslist (best-effort) ─────────────────────────
info "Updating browserslist database..."
npx browserslist@latest --update-db 2>/dev/null || warn "browserslist update skipped (non-critical)"

# ─── 3) Audit fix (non-breaking only) ─────────────────────────────
info "Running npm audit fix (safe only)..."
npm audit fix 2>/dev/null || warn "Some vulnerabilities remain (run 'npm audit' for details)"

# ─── 4) Build ─────────────────────────────────────────────────────
info "Building frontend (Vite)..."
npm run build || fail "Build failed!"
info "Build complete: $(du -sh dist | cut -f1) total"

# ─── 5) Deploy to Docker Nginx container ──────────────────────────
info "Deploying to container '$NGINX_CONTAINER'..."
docker cp "$PROJECT_DIR/dist/." "$NGINX_CONTAINER:$NGINX_HTML_PATH/" || fail "docker cp failed"
docker exec "$NGINX_CONTAINER" nginx -s reload || fail "nginx reload failed inside container"

# ─── 6) Validation ────────────────────────────────────────────────
info "Validating deployment..."
sleep 1

# Try local first, then the LAN IP
LOCAL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/ 2>/dev/null || echo "000")
LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
LAN_STATUS="N/A"
if [ -n "$LAN_IP" ]; then
  LAN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://$LAN_IP/" 2>/dev/null || echo "000")
fi

echo ""
echo "═══════════════════════════════════════════"
echo "  FlowPulse On-Prem Deploy Report"
echo "═══════════════════════════════════════════"
echo "  Commit:        $COMMIT"
echo "  Build size:    $(du -sh dist | cut -f1)"
echo "  Container:     $NGINX_CONTAINER"
echo "  localhost:     HTTP $LOCAL_STATUS"
[ -n "$LAN_IP" ] && echo "  LAN ($LAN_IP): HTTP $LAN_STATUS"
echo "═══════════════════════════════════════════"

if [ "$LOCAL_STATUS" = "200" ]; then
  info "✅ Deploy successful!"
else
  fail "Deploy verification failed (HTTP $LOCAL_STATUS)"
fi
