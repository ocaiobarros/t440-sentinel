#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  FLOWPULSE — On-Premise Docker Bootstrap (Idempotente)          ║
# ║  Uso: bash scripts/onprem-up.sh                                 ║
# ╚══════════════════════════════════════════════════════════════════╝

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$PROJECT_ROOT/deploy"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.onprem.yml"
ENV_FILE="$DEPLOY_DIR/.env"
ENV_EXAMPLE="$DEPLOY_DIR/.env.onprem.docker.example"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   FlowPulse On-Premise — Docker Bootstrap                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── 1. Validar Docker / Compose ──────────────────────────
echo -e "${CYAN}[1/7] Validando pré-requisitos...${NC}"
if ! command -v docker &>/dev/null; then
  echo -e "${RED}❌ Docker não encontrado. Instale: https://docs.docker.com/engine/install/${NC}"
  exit 1
fi

if ! docker compose version &>/dev/null; then
  echo -e "${RED}❌ Docker Compose (plugin) não encontrado.${NC}"
  exit 1
fi
echo -e "  ${GREEN}✔${NC} Docker $(docker --version | awk '{print $3}')"
echo -e "  ${GREEN}✔${NC} $(docker compose version)"

# ─── 2. Preparar .env ─────────────────────────────────────
echo -e "\n${CYAN}[2/7] Preparando variáveis de ambiente...${NC}"
if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$ENV_EXAMPLE" ]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    echo -e "  ${GREEN}✔${NC} .env criado a partir do template"
    echo -e "  ⚠️  Edite $ENV_FILE antes de usar em produção!"
  else
    echo -e "  ${RED}❌ Template .env.onprem.docker.example não encontrado${NC}"
    exit 1
  fi
else
  echo -e "  ${GREEN}✔${NC} .env já existe"
fi

# Source .env for variable interpolation
set -a
source "$ENV_FILE"
set +a

# ─── 3. Build do Frontend ─────────────────────────────────
echo -e "\n${CYAN}[3/7] Construindo frontend...${NC}"
cd "$PROJECT_ROOT"

if [ ! -d "node_modules" ]; then
  echo "  Instalando dependências..."
  npm ci --silent
fi

# Build com as variáveis on-prem
VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-${SITE_URL:-http://localhost}}" \
VITE_SUPABASE_PUBLISHABLE_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-${ANON_KEY}}" \
npm run build

# Copiar dist para deploy/
rm -rf "$DEPLOY_DIR/dist"
cp -r dist "$DEPLOY_DIR/dist"
echo -e "  ${GREEN}✔${NC} Frontend compilado em deploy/dist/"

# ─── 4. Criar diretório do edge functions main ────────────
echo -e "\n${CYAN}[4/7] Preparando edge functions...${NC}"
FUNCTIONS_MAIN="$PROJECT_ROOT/supabase/functions/main"
if [ ! -d "$FUNCTIONS_MAIN" ]; then
  mkdir -p "$FUNCTIONS_MAIN"
fi

# Create the main entry point for edge-runtime if not exists
MAIN_INDEX="$FUNCTIONS_MAIN/index.ts"
if [ ! -f "$MAIN_INDEX" ]; then
  cat > "$MAIN_INDEX" << 'EOFMAIN'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const FUNCTIONS_DIR = "/home/deno/functions";

serve(async (req: Request) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const funcName = pathParts[0];

  if (!funcName) {
    return new Response(JSON.stringify({ error: "Function name required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const mod = await import(`${FUNCTIONS_DIR}/${funcName}/index.ts`);
    return mod.default ? mod.default(req) : new Response("No default export", { status: 500 });
  } catch (e) {
    return new Response(JSON.stringify({ error: `Function '${funcName}' not found: ${e.message}` }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
});
EOFMAIN
  echo -e "  ${GREEN}✔${NC} Edge functions main entry point criado"
else
  echo -e "  ${GREEN}✔${NC} Edge functions main já existe"
fi

# ─── 5. Subir Docker Compose ──────────────────────────────
echo -e "\n${CYAN}[5/7] Iniciando containers...${NC}"
cd "$DEPLOY_DIR"

# Ensure init scripts are executable (required by docker-entrypoint-initdb.d)
chmod +x "$DEPLOY_DIR/volumes/db/00-roles.sh" 2>/dev/null || true

docker compose -f docker-compose.onprem.yml --env-file .env up -d --remove-orphans

# ─── 6. Aguardar healthchecks ─────────────────────────────
echo -e "\n${CYAN}[6/7] Aguardando serviços...${NC}"

wait_for_service() {
  local name="$1"
  local url="$2"
  local max_tries="${3:-30}"
  local i=0
  while [ $i -lt $max_tries ]; do
    if curl -sSf "$url" >/dev/null 2>&1; then
      echo -e "  ${GREEN}✔${NC} $name está pronto"
      return 0
    fi
    sleep 2
    i=$((i + 1))
  done
  echo -e "  ${RED}✘${NC} $name não respondeu após $((max_tries * 2))s"
  return 1
}

wait_for_container() {
  local name="$1"
  local container_id="$2"
  local max_tries="${3:-45}"
  local i=0
  while [ $i -lt $max_tries ]; do
    local status
    status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || echo "unknown")
    if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then
      echo -e "  ${GREEN}✔${NC} $name está pronto (${status})"
      return 0
    fi
    sleep 2
    i=$((i + 1))
  done
  echo -e "  ${RED}✘${NC} $name não ficou pronto após $((max_tries * 2))s"
  docker logs "$container_id" --tail 80 2>/dev/null || true
  return 1
}

KONG_URL="http://localhost:${KONG_HTTP_PORT:-8000}"
wait_for_service "Kong Gateway" "$KONG_URL/rest/v1/" 45

AUTH_CONTAINER=$(docker compose -f docker-compose.onprem.yml ps -q auth)
if [ -z "$AUTH_CONTAINER" ]; then
  echo -e "  ${RED}✘${NC} Container do Auth não encontrado"
  exit 1
fi
wait_for_container "Auth (GoTrue)" "$AUTH_CONTAINER" 60

# ─── 7. Aplicar Schema + Seed ─────────────────────────────
echo -e "\n${CYAN}[7/7] Aplicando schema e seed admin...${NC}"

DB_CONTAINER=$(docker compose -f docker-compose.onprem.yml ps -q db)

# Check if schema already applied (check for tenants table)
SCHEMA_EXISTS=$(docker exec "$DB_CONTAINER" psql -U supabase_admin -d postgres -tAc \
  "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tenants');" 2>/dev/null || echo "f")

if [ "$SCHEMA_EXISTS" = "t" ]; then
  echo -e "  ${GREEN}✔${NC} Schema já aplicado (tabela 'tenants' encontrada)"
else
  echo "  Aplicando schema_cblabs_full.sql..."
  docker exec -i "$DB_CONTAINER" psql -U supabase_admin -d postgres < "$DEPLOY_DIR/schema_cblabs_full.sql"
  echo -e "  ${GREEN}✔${NC} Schema aplicado"
fi

# Seed admin user via GoTrue API
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@flowpulse.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin@123}"

echo "  Criando admin seed..."
SIGNUP_RESP=$(curl -sS -X POST "$KONG_URL/auth/v1/admin/users" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${ADMIN_EMAIL}\",
    \"password\": \"${ADMIN_PASSWORD}\",
    \"email_confirm\": true,
    \"user_metadata\": {\"display_name\": \"Administrador\"}
  }" 2>/dev/null || echo '{}')

if echo "$SIGNUP_RESP" | grep -q '"id"'; then
  echo -e "  ${GREEN}✔${NC} Admin criado: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}"
elif echo "$SIGNUP_RESP" | grep -qi 'already registered\|duplicate\|exists'; then
  echo -e "  ${GREEN}✔${NC} Admin já existe"
else
  echo -e "  ⚠️  Resposta do seed: $(echo "$SIGNUP_RESP" | head -c 200)"
fi

# ─── Done ─────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅ FlowPulse On-Premise — PRONTO!                        ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}║   🌐 UI:        http://localhost                             ║${NC}"
echo -e "${GREEN}║   🔑 Login:     ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}           ║${NC}"
echo -e "${GREEN}║   📡 API:       http://localhost:${KONG_HTTP_PORT:-8000}      ║${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
