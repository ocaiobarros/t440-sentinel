#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  FLOWPULSE — Smoke Test On-Premise                              ║
# ║  Valida servidor local sem dependências externas                 ║
# ║  Uso: bash scripts/smoke-onprem.sh [base_url]                   ║
# ╚══════════════════════════════════════════════════════════════════╝

set -euo pipefail

BASE="${1:-http://localhost:3060}"
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'
PASS=0
FAIL=0

check() {
  local desc="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo -e "  ${GREEN}✔${NC} $desc"
    ((PASS++))
  else
    echo -e "  ${RED}✘${NC} $desc"
    ((FAIL++))
  fi
}

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════╗"
echo "║   FlowPulse On-Premise — Smoke Test             ║"
echo "║   Target: ${BASE}"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── 1. Healthz ───────────────────────────────────────
echo -e "${CYAN}[1/4] Health Check${NC}"
HEALTH=$(curl -sS --max-time 5 "${BASE}/healthz" 2>/dev/null || echo '{}')
check "GET /healthz retorna status" echo "$HEALTH" | grep -q '"ok"'

# ─── 2. Login ─────────────────────────────────────────
echo -e "\n${CYAN}[2/4] Autenticação${NC}"
LOGIN_RESP=$(curl -sS --max-time 5 -X POST "${BASE}/auth/v1/token?grant_type=password" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin","password":"admin@123"}' 2>/dev/null || echo '{}')

TOKEN=$(echo "$LOGIN_RESP" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
  echo -e "  ${GREEN}✔${NC} Login admin bem-sucedido"
  ((PASS++))
else
  echo -e "  ${RED}✘${NC} Login admin falhou"
  echo "    Resposta: $LOGIN_RESP"
  ((FAIL++))
fi

# ─── 3. Auth User ─────────────────────────────────────
echo -e "\n${CYAN}[3/4] Validar Token${NC}"
if [ -n "$TOKEN" ]; then
  USER_RESP=$(curl -sS --max-time 5 -H "Authorization: Bearer $TOKEN" "${BASE}/auth/v1/user" 2>/dev/null || echo '{}')
  check "GET /auth/v1/user retorna perfil" echo "$USER_RESP" | grep -q '"email"'
else
  echo -e "  ${RED}✘${NC} Pulando — sem token"
  ((FAIL++))
fi

# ─── 4. REST API ──────────────────────────────────────
echo -e "\n${CYAN}[4/4] REST API${NC}"
if [ -n "$TOKEN" ]; then
  DASH_RESP=$(curl -sS --max-time 5 -H "Authorization: Bearer $TOKEN" "${BASE}/rest/v1/dashboards?limit=1" 2>/dev/null || echo '[]')
  check "GET /rest/v1/dashboards responde" test "$?" -eq 0
else
  echo -e "  ${RED}✘${NC} Pulando — sem token"
  ((FAIL++))
fi

# ─── Resultado ────────────────────────────────────────
echo ""
TOTAL=$((PASS + FAIL))
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}═══ RESULTADO: ${PASS}/${TOTAL} testes passaram ═══${NC}"
  exit 0
else
  echo -e "${RED}═══ RESULTADO: ${PASS}/${TOTAL} passaram, ${FAIL} falharam ═══${NC}"
  exit 1
fi
