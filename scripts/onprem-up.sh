#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  FLOWPULSE — On-Premise Docker Bootstrap (Idempotente)          ║
# ║  Uso: bash scripts/onprem-up.sh [--fix]                         ║
# ║                                                                  ║
# ║  --fix   Limpa volumes, reseta Git e refaz tudo do zero          ║
# ╚══════════════════════════════════════════════════════════════════╝

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$PROJECT_ROOT/deploy"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.onprem.yml"
ENV_FILE="$DEPLOY_DIR/.env"
ENV_EXAMPLE="$DEPLOY_DIR/.env.onprem.docker.example"
FIX_MODE=false

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# ─── Parse args ───────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --fix) FIX_MODE=true ;;
    -h|--help)
      echo "Uso: $0 [--fix]"
      echo "  --fix   Hard-reset Git, destrói volumes Docker e reconstrói tudo"
      exit 0
      ;;
  esac
done

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   FlowPulse On-Premise — Docker Bootstrap                   ║"
if $FIX_MODE; then
echo "║   ⚠️  MODO --fix ATIVADO (reset completo)                   ║"
fi
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── 0. Git Preflight ─────────────────────────────────────
echo -e "${CYAN}[0/8] Verificando estado do repositório...${NC}"
cd "$PROJECT_ROOT"

if command -v git &>/dev/null && [ -d ".git" ]; then
  DIRTY_FILES=$(git status --porcelain 2>/dev/null | grep -v '^\?\?' || true)
  if [ -n "$DIRTY_FILES" ]; then
    if $FIX_MODE; then
      echo -e "  ${YELLOW}⚠${NC}  Arquivos modificados detectados — aplicando reset (--fix)"
      # Preserve .env
      [ -f "$ENV_FILE" ] && cp "$ENV_FILE" /tmp/flowpulse-env-backup
      git fetch origin 2>/dev/null || true
      git checkout -- . 2>/dev/null || true
      git clean -fd 2>/dev/null || true
      git pull --ff-only origin main 2>/dev/null || git reset --hard origin/main 2>/dev/null || true
      [ -f /tmp/flowpulse-env-backup ] && cp /tmp/flowpulse-env-backup "$ENV_FILE"
      echo -e "  ${GREEN}✔${NC} Repositório resetado para origin/main"
    else
      echo -e "  ${RED}❌ Arquivos modificados localmente detectados:${NC}"
      echo "$DIRTY_FILES" | head -10 | sed 's/^/     /'
      echo ""
      echo -e "  ${YELLOW}Opções:${NC}"
      echo -e "    1) git stash              — salvar alterações e continuar"
      echo -e "    2) git checkout -- .      — descartar alterações"
      echo -e "    3) $0 --fix  — reset completo automático"
      echo ""
      echo -e "  ${RED}Abortando para evitar conflitos.${NC}"
      exit 1
    fi
  else
    echo -e "  ${GREEN}✔${NC} Repositório limpo"
  fi

  # Pull latest if possible
  if git remote get-url origin &>/dev/null; then
    echo -n "  Atualizando repositório... "
    if git pull --ff-only 2>/dev/null; then
      echo -e "${GREEN}✔${NC}"
    else
      echo -e "${YELLOW}skip${NC} (sem acesso remoto ou conflito)"
    fi
  fi
else
  echo -e "  ${YELLOW}⚠${NC}  Git não disponível — prosseguindo sem verificação"
fi

# ─── 1. Validar Docker / Compose ──────────────────────────
echo -e "\n${CYAN}[1/8] Validando pré-requisitos...${NC}"
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

# ─── --fix: Destruir volumes antigos ──────────────────────
if $FIX_MODE; then
  echo -e "\n${YELLOW}[--fix] Destruindo containers e volumes antigos...${NC}"
  cd "$DEPLOY_DIR"
  docker compose -f docker-compose.onprem.yml down -v 2>/dev/null || true
  echo -e "  ${GREEN}✔${NC} Volumes e containers removidos"
  cd "$PROJECT_ROOT"
fi

# ─── 2. Preparar .env ─────────────────────────────────────
echo -e "\n${CYAN}[2/8] Preparando variáveis de ambiente...${NC}"
KEYS_GENERATED=false

if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$ENV_EXAMPLE" ]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    echo -e "  ${GREEN}✔${NC} .env criado a partir do template"
    
    # Auto-generate secure keys on first deploy
    echo "  Gerando chaves JWT seguras..."
    if bash "$SCRIPT_DIR/generate-keys.sh" --apply "$ENV_FILE" --quiet; then
      echo -e "  ${GREEN}✔${NC} Chaves JWT geradas automaticamente (produção)"
      KEYS_GENERATED=true
    else
      echo -e "  ${YELLOW}⚠${NC}  Falha ao gerar chaves — usando demo keys (NÃO USE EM PRODUÇÃO!)"
    fi
  else
    echo -e "  ${RED}❌ Template .env.onprem.docker.example não encontrado${NC}"
    exit 1
  fi
else
  echo -e "  ${GREEN}✔${NC} .env já existe"
  
  # Check if still using demo keys
  CURRENT_JWT=$(grep '^JWT_SECRET=' "$ENV_FILE" | cut -d= -f2)
  if [ "$CURRENT_JWT" = "super-secret-jwt-token-with-at-least-32-characters-long" ] || \
     [ "$CURRENT_JWT" = "your-super-secret-jwt-token-with-at-least-32-characters-long" ]; then
    echo -e "  ${YELLOW}⚠${NC}  Demo JWT keys detectadas!"
    if $FIX_MODE; then
      echo "  Regenerando chaves JWT seguras..."
      if bash "$SCRIPT_DIR/generate-keys.sh" --apply "$ENV_FILE" --quiet; then
        echo -e "  ${GREEN}✔${NC} Chaves JWT regeneradas (produção)"
        KEYS_GENERATED=true
      fi
    else
      echo -e "  ${YELLOW}  Rode com --fix para gerar automaticamente, ou:${NC}"
      echo -e "  ${YELLOW}  bash scripts/generate-keys.sh --apply deploy/.env${NC}"
    fi
  fi
fi

# Source .env for variable interpolation
set -a
source "$ENV_FILE"
set +a

# ─── 3. Build do Frontend ─────────────────────────────────
echo -e "\n${CYAN}[3/8] Construindo frontend...${NC}"
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
echo -e "\n${CYAN}[4/8] Preparando edge functions...${NC}"
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
echo -e "\n${CYAN}[5/8] Iniciando containers...${NC}"
cd "$DEPLOY_DIR"

# Ensure init scripts are executable (required by docker-entrypoint-initdb.d)
chmod +x "$DEPLOY_DIR/volumes/db/00-roles.sh" 2>/dev/null || true

docker compose -f docker-compose.onprem.yml --env-file .env up -d --remove-orphans

# ─── 6. Aguardar healthchecks ─────────────────────────────
echo -e "\n${CYAN}[6/8] Aguardando serviços...${NC}"

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
  docker logs "$container_id" --tail 30 2>/dev/null || true
  return 1
}

KONG_URL="http://localhost:${KONG_HTTP_PORT:-8000}"
wait_for_service "Kong Gateway" "$KONG_URL/rest/v1/" 45

# Wait for DB to be healthy first
DB_CONTAINER=$(docker compose -f docker-compose.onprem.yml ps -q db)
wait_for_container "Database" "$DB_CONTAINER" 30

# ─── 6b. Repair Auth prerequisites ───────────────────────
# GoTrue v2.164 expects auth.factor_type enum to exist before its MFA migration.
# If the init script created the auth schema but GoTrue hasn't run yet, we pre-create it.
echo -e "  Preparando pré-requisitos do Auth..."
docker exec "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c "
  CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
  GRANT USAGE, CREATE ON SCHEMA auth TO supabase_auth_admin;
  ALTER ROLE supabase_auth_admin SET search_path = auth, public;

  -- If factor_type was accidentally created in public, move it to auth
  DO \$\$ BEGIN
    IF EXISTS (
      SELECT 1
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = 'factor_type'
    ) AND NOT EXISTS (
      SELECT 1
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'auth' AND t.typname = 'factor_type'
    ) THEN
      ALTER TYPE public.factor_type SET SCHEMA auth;
    END IF;
  END \$\$;

  DO \$\$ BEGIN
    CREATE TYPE auth.factor_type AS ENUM ('totp','webauthn');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END \$\$;

  DO \$\$ BEGIN
    ALTER TYPE auth.factor_type OWNER TO supabase_auth_admin;
  EXCEPTION WHEN undefined_object THEN NULL;
  END \$\$;

  -- Pre-apply phone value idempotently so gotrue migration cannot fail here
  DO \$\$ BEGIN
    ALTER TYPE auth.factor_type ADD VALUE 'phone';
  EXCEPTION WHEN duplicate_object THEN NULL;
           WHEN undefined_object THEN NULL;
  END \$\$;

  DO \$\$ BEGIN
    CREATE TYPE auth.factor_status AS ENUM ('unverified','verified');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END \$\$;
  DO \$\$ BEGIN
    CREATE TYPE auth.aal_level AS ENUM ('aal1','aal2','aal3');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END \$\$;
  DO \$\$ BEGIN
    CREATE TYPE auth.code_challenge_method AS ENUM ('s256','plain');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END \$\$;
  DO \$\$ BEGIN
    CREATE TYPE auth.one_time_token_type AS ENUM (
      'confirmation_token','reauthentication_token','recovery_token',
      'email_change_token_new','email_change_token_current','phone_change_token'
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END \$\$;
" && echo -e "  ${GREEN}✔${NC} Auth types pré-criados" \
             || echo -e "  ${YELLOW}⚠${NC}  Auth types já existiam ou erro não-fatal"

# Now wait for Auth container
AUTH_CONTAINER=$(docker compose -f docker-compose.onprem.yml ps -q auth)
if [ -z "$AUTH_CONTAINER" ]; then
  echo -e "  ${RED}✘${NC} Container do Auth não encontrado"
  exit 1
fi

# Restart auth so it picks up the pre-created types
docker restart "$AUTH_CONTAINER" >/dev/null 2>&1 || true
sleep 3
wait_for_container "Auth (GoTrue)" "$AUTH_CONTAINER" 60

# ─── 7. Aplicar Schema + Seed ─────────────────────────────
echo -e "\n${CYAN}[7/8] Aplicando schema e seed admin...${NC}"

# Ensure postgres can reference auth.users for FK constraints
docker exec "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c \
  "GRANT USAGE ON SCHEMA auth TO supabase_admin; GRANT REFERENCES ON ALL TABLES IN SCHEMA auth TO supabase_admin;" 2>/dev/null || true

# Check if schema already applied (check for tenants table)
SCHEMA_EXISTS=$(docker exec "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -tAc \
  "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tenants');" 2>/dev/null || echo "f")

if [ "$SCHEMA_EXISTS" = "t" ] && ! $FIX_MODE; then
  echo -e "  ${GREEN}✔${NC} Schema já aplicado (tabela 'tenants' encontrada)"
  echo "  Re-aplicando funções e triggers..."
  docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres < "$DEPLOY_DIR/schema_cblabs_full.sql"
  echo -e "  ${GREEN}✔${NC} Funções e triggers atualizados"
else
  echo "  Aplicando schema_cblabs_full.sql..."
  docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres < "$DEPLOY_DIR/schema_cblabs_full.sql"
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

# ─── 8. Smoke Test ────────────────────────────────────────
echo -e "\n${CYAN}[8/8] Smoke test rápido...${NC}"
SMOKE_OK=true

# Test REST
if curl -sSf "$KONG_URL/rest/v1/" -H "apikey: ${ANON_KEY}" >/dev/null 2>&1; then
  echo -e "  ${GREEN}✔${NC} REST (PostgREST) respondendo"
else
  echo -e "  ${RED}✘${NC} REST não respondeu"
  SMOKE_OK=false
fi

# Test Auth
AUTH_HEALTH=$(curl -sS "$KONG_URL/auth/v1/health" 2>/dev/null || echo '{}')
if echo "$AUTH_HEALTH" | grep -qi 'alive\|ok\|healthy\|GoTrue'; then
  echo -e "  ${GREEN}✔${NC} Auth (GoTrue) saudável"
else
  echo -e "  ${RED}✘${NC} Auth health: $(echo "$AUTH_HEALTH" | head -c 100)"
  SMOKE_OK=false
fi

# Test Storage
STORAGE_CONTAINER=$(docker compose -f docker-compose.onprem.yml ps -q storage 2>/dev/null || true)
if [ -n "$STORAGE_CONTAINER" ]; then
  STORAGE_STATUS=$(docker inspect --format '{{.State.Status}}' "$STORAGE_CONTAINER" 2>/dev/null || echo "unknown")
  if [ "$STORAGE_STATUS" = "running" ]; then
    echo -e "  ${GREEN}✔${NC} Storage rodando"
  else
    echo -e "  ${RED}✘${NC} Storage status: $STORAGE_STATUS"
    SMOKE_OK=false
  fi
fi

# Test login
LOGIN_RESP=$(curl -sS -X POST "$KONG_URL/auth/v1/token?grant_type=password" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"${ADMIN_EMAIL}\", \"password\": \"${ADMIN_PASSWORD}\"}" 2>/dev/null || echo '{}')

if echo "$LOGIN_RESP" | grep -q '"access_token"'; then
  echo -e "  ${GREEN}✔${NC} Login admin funcional"
else
  echo -e "  ${YELLOW}⚠${NC}  Login admin falhou: $(echo "$LOGIN_RESP" | head -c 120)"
  SMOKE_OK=false
fi

# ─── Done ─────────────────────────────────────────────────
echo ""
if $SMOKE_OK; then
  echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║   ✅ FlowPulse On-Premise — PRONTO!                        ║${NC}"
  echo -e "${GREEN}╠══════════════════════════════════════════════════════════════╣${NC}"
  echo -e "${GREEN}║                                                              ║${NC}"
  echo -e "${GREEN}║   🌐 UI:        http://localhost                             ║${NC}"
  echo -e "${GREEN}║   🔑 Login:     ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}           ║${NC}"
  echo -e "${GREEN}║   📡 API:       http://localhost:${KONG_HTTP_PORT:-8000}      ║${NC}"
  echo -e "${GREEN}║                                                              ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
  if $KEYS_GENERATED; then
    echo ""
    echo -e "${YELLOW}🔐 IMPORTANTE: Chaves JWT foram geradas automaticamente.${NC}"
    echo -e "${YELLOW}   Salve o arquivo deploy/.env em local seguro!${NC}"
  fi
else
  echo -e "${YELLOW}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}║   ⚠️  FlowPulse On-Premise — PARCIALMENTE PRONTO           ║${NC}"
  echo -e "${YELLOW}║   Verifique os erros acima e tente:                         ║${NC}"
  echo -e "${YELLOW}║     bash scripts/onprem-up.sh --fix                         ║${NC}"
  echo -e "${YELLOW}╚══════════════════════════════════════════════════════════════╝${NC}"
fi
