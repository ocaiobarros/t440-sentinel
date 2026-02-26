#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  FlowPulse On-Premise — Diagnóstico Completo                    ║
# ║  Coleta logs, testa endpoints e gera relatório para debug        ║
# ║  Uso: bash scripts/diagnose-onprem.sh                           ║
# ╚══════════════════════════════════════════════════════════════════╝

set -euo pipefail

COMPOSE_FILE="deploy/docker-compose.onprem.yml"
ENV_FILE="deploy/.env"
REPORT="diagnose-report-$(date +%Y%m%d_%H%M%S).txt"

# ── Colors ──
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

log()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[PASS]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }

# ── Load env ──
if [[ ! -f "$ENV_FILE" ]]; then
  fail "Arquivo $ENV_FILE não encontrado"
  exit 1
fi
set -a; source "$ENV_FILE"; set +a

KONG_URL="${API_EXTERNAL_URL:-http://localhost:8000}"
SITE_URL="${SITE_URL:-http://localhost}"
SRK="${SERVICE_ROLE_KEY:-}"
ANON="${ANON_KEY:-}"

exec > >(tee -a "$REPORT") 2>&1

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  FlowPulse On-Premise — Relatório de Diagnóstico            ║"
echo "║  Data: $(date '+%Y-%m-%d %H:%M:%S')                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ═══════════════════════════════════════════
# 1. STATUS DOS CONTAINERS
# ═══════════════════════════════════════════
log "1. Status dos containers"
echo "─────────────────────────────────────────"
docker compose -f "$COMPOSE_FILE" ps --format "table {{.Name}}\t{{.State}}\t{{.Health}}\t{{.Ports}}" 2>/dev/null || \
  docker compose -f "$COMPOSE_FILE" ps
echo ""

# ═══════════════════════════════════════════
# 2. HEALTH CHECKS
# ═══════════════════════════════════════════
log "2. Health checks dos serviços"
echo "─────────────────────────────────────────"

# Auth
AUTH_HEALTH=$(curl -sf "${KONG_URL}/auth/v1/health" 2>/dev/null || echo "FAIL")
if echo "$AUTH_HEALTH" | grep -qi "alive\|ok\|healthy"; then
  ok "Auth (GoTrue): UP"
else
  fail "Auth (GoTrue): $AUTH_HEALTH"
fi

# REST
REST_HEALTH=$(curl -sf "${KONG_URL}/rest/v1/" -H "apikey: $ANON" 2>/dev/null | head -c 200 || echo "FAIL")
if [[ "$REST_HEALTH" != "FAIL" ]]; then
  ok "REST (PostgREST): UP"
else
  fail "REST (PostgREST): sem resposta"
fi

# Functions runtime
FUNC_HEALTH=$(curl -sf "${KONG_URL}/functions/v1/" -H "Authorization: Bearer $ANON" 2>/dev/null || echo "FAIL")
if echo "$FUNC_HEALTH" | grep -qi "ok\|FlowPulse\|router"; then
  ok "Edge Functions (Runtime): UP"
else
  fail "Edge Functions (Runtime): $FUNC_HEALTH"
fi
echo ""

# ═══════════════════════════════════════════
# 3. TESTE: LOGIN DO ADMIN
# ═══════════════════════════════════════════
log "3. Teste de login (admin@flowpulse.local)"
echo "─────────────────────────────────────────"
LOGIN_RESP=$(curl -sf -X POST "${KONG_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@flowpulse.local","password":"admin@123"}' 2>/dev/null || echo '{"error":"request_failed"}')

ACCESS_TOKEN=$(echo "$LOGIN_RESP" | grep -o '"access_token":"[^"]*"' | head -1 | cut -d'"' -f4)

if [[ -n "$ACCESS_TOKEN" ]]; then
  ok "Login OK — JWT obtido (${#ACCESS_TOKEN} chars)"
else
  fail "Login falhou"
  echo "  Resposta: $(echo "$LOGIN_RESP" | head -c 500)"
fi
echo ""

# ═══════════════════════════════════════════
# 4. TESTE: INVITE-USER (CRIAÇÃO DE USUÁRIO)
# ═══════════════════════════════════════════
log "4. Teste da Edge Function invite-user"
echo "─────────────────────────────────────────"

if [[ -n "$ACCESS_TOKEN" ]]; then
  TEST_EMAIL="diag-test-$(date +%s)@flowpulse.local"
  
  INVITE_RESP=$(curl -sf -X POST "${KONG_URL}/functions/v1/invite-user" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "apikey: $ANON" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"display_name\":\"Diag Test\",\"role\":\"viewer\",\"password\":\"Test@123456\"}" \
    2>/dev/null || echo '{"error":"request_failed"}')
  
  echo "  Resposta completa: $INVITE_RESP"
  
  if echo "$INVITE_RESP" | grep -qi '"success":true\|"user_id"'; then
    ok "invite-user: Usuário criado com sucesso"
    
    # Verificar se profile foi criado no tenant correto
    PROFILE_CHECK=$(curl -sf "${KONG_URL}/rest/v1/profiles?email=eq.${TEST_EMAIL}&select=id,tenant_id,email" \
      -H "apikey: $ANON" \
      -H "Authorization: Bearer $SRK" \
      2>/dev/null || echo "[]")
    echo "  Profile check: $PROFILE_CHECK"
    
    # Verificar role
    USER_ID=$(echo "$INVITE_RESP" | grep -o '"user_id":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [[ -n "$USER_ID" ]]; then
      ROLE_CHECK=$(curl -sf "${KONG_URL}/rest/v1/user_roles?user_id=eq.${USER_ID}&select=role,tenant_id" \
        -H "apikey: $ANON" \
        -H "Authorization: Bearer $SRK" \
        2>/dev/null || echo "[]")
      echo "  Role check: $ROLE_CHECK"
    fi
  else
    fail "invite-user: Falha"
    echo "  HTTP Response: $INVITE_RESP"
  fi
else
  warn "Pulando teste invite-user (sem JWT)"
fi
echo ""

# ═══════════════════════════════════════════
# 5. TESTE: LISTAGEM DE TENANTS
# ═══════════════════════════════════════════
log "5. Teste de listagem de tenants via REST"
echo "─────────────────────────────────────────"

if [[ -n "$ACCESS_TOKEN" ]]; then
  TENANTS_RESP=$(curl -sf "${KONG_URL}/rest/v1/tenants?select=id,name,slug&limit=5" \
    -H "apikey: $ANON" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    2>/dev/null || echo "FAIL")
  
  if [[ "$TENANTS_RESP" != "FAIL" ]] && echo "$TENANTS_RESP" | grep -qi '"id"'; then
    TENANT_COUNT=$(echo "$TENANTS_RESP" | grep -o '"id"' | wc -l)
    ok "Tenants listados: $TENANT_COUNT encontrado(s)"
    echo "  Dados: $(echo "$TENANTS_RESP" | head -c 500)"
  else
    fail "Listagem de tenants falhou"
    echo "  Resposta: $TENANTS_RESP"
  fi
else
  warn "Pulando teste de tenants (sem JWT)"
fi
echo ""

# ═══════════════════════════════════════════
# 6. LOGS RECENTES DOS CONTAINERS CRÍTICOS
# ═══════════════════════════════════════════
log "6. Últimas 30 linhas de log de cada container crítico"
echo "─────────────────────────────────────────"

for SVC in auth rest functions kong db; do
  echo ""
  echo "  ┌── $SVC ──────────────────────────"
  docker compose -f "$COMPOSE_FILE" logs --tail=30 "$SVC" 2>/dev/null | sed 's/^/  │ /' || echo "  │ (sem logs)"
  echo "  └──────────────────────────────────"
done
echo ""

# ═══════════════════════════════════════════
# 7. VERIFICAÇÃO DO VOLUME DE FUNCTIONS
# ═══════════════════════════════════════════
log "7. Verificação do volume de Edge Functions"
echo "─────────────────────────────────────────"

FUNC_CONTAINER=$(docker compose -f "$COMPOSE_FILE" ps -q functions 2>/dev/null)
if [[ -n "$FUNC_CONTAINER" ]]; then
  echo "  Funções montadas:"
  docker exec "$FUNC_CONTAINER" ls /home/deno/functions/ 2>/dev/null | sed 's/^/    /' || echo "    (erro ao listar)"
  
  echo "  Conteúdo invite-user/:"
  docker exec "$FUNC_CONTAINER" ls -la /home/deno/functions/invite-user/ 2>/dev/null | sed 's/^/    /' || echo "    (não encontrado)"
  
  echo "  Conteúdo main/:"
  docker exec "$FUNC_CONTAINER" ls -la /home/deno/functions/main/ 2>/dev/null | sed 's/^/    /' || echo "    (não encontrado)"
else
  fail "Container functions não encontrado"
fi
echo ""

# ═══════════════════════════════════════════
# 8. VERIFICAÇÃO DO SCHEMA (TABELAS CRÍTICAS)
# ═══════════════════════════════════════════
log "8. Verificação de tabelas críticas no banco"
echo "─────────────────────────────────────────"

DB_CONTAINER=$(docker compose -f "$COMPOSE_FILE" ps -q db 2>/dev/null)
if [[ -n "$DB_CONTAINER" ]]; then
  for TBL in profiles user_roles tenants; do
    COUNT=$(docker exec "$DB_CONTAINER" psql -U supabase_admin -d postgres -t -c "SELECT count(*) FROM public.$TBL;" 2>/dev/null | tr -d ' ')
    if [[ -n "$COUNT" && "$COUNT" != "0" ]]; then
      ok "$TBL: $COUNT registros"
    else
      warn "$TBL: ${COUNT:-erro} registros"
    fi
  done
  
  # Verificar trigger handle_new_user
  HAS_TRIGGER=$(docker exec "$DB_CONTAINER" psql -U supabase_admin -d postgres -t -c \
    "SELECT count(*) FROM pg_trigger WHERE tgname = 'on_auth_user_created';" 2>/dev/null | tr -d ' ')
  if [[ "$HAS_TRIGGER" == "1" ]]; then
    ok "Trigger on_auth_user_created: EXISTS"
  else
    warn "Trigger on_auth_user_created: ${HAS_TRIGGER:-not found}"
  fi
  
  # Verificar funções RPC
  for FN in is_super_admin has_role get_user_tenant_id jwt_tenant_id; do
    HAS_FN=$(docker exec "$DB_CONTAINER" psql -U supabase_admin -d postgres -t -c \
      "SELECT count(*) FROM pg_proc WHERE proname = '$FN';" 2>/dev/null | tr -d ' ')
    if [[ "$HAS_FN" -ge "1" ]]; then
      ok "RPC $FN: EXISTS"
    else
      fail "RPC $FN: MISSING"
    fi
  done
else
  fail "Container db não encontrado"
fi
echo ""

# ═══════════════════════════════════════════
# RESUMO FINAL
# ═══════════════════════════════════════════
echo "═══════════════════════════════════════════"
echo "  Relatório salvo em: $REPORT"
echo "  Envie este arquivo para análise."
echo "═══════════════════════════════════════════"
