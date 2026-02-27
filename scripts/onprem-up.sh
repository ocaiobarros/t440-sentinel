#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  FLOWPULSE — On-Premise Docker Bootstrap (Idempotente)          ║
# ║  Uso: bash scripts/onprem-up.sh [--fix] [--verbose]              ║
# ║                                                                  ║
# ║  --fix       Limpa volumes, reseta Git e refaz tudo do zero      ║
# ║  --verbose   Coleta logs detalhados de todos os serviços          ║
# ╚══════════════════════════════════════════════════════════════════╝

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$PROJECT_ROOT/deploy"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.onprem.yml"
ENV_FILE="$DEPLOY_DIR/.env"
ENV_EXAMPLE="$DEPLOY_DIR/.env.onprem.docker.example"
FIX_MODE=false
VERBOSE=false

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# ─── Parse args ───────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --fix) FIX_MODE=true ;;
    --verbose|-v) VERBOSE=true ;;
    -h|--help)
      echo "Uso: $0 [--fix] [--verbose]"
      echo "  --fix       Hard-reset Git, destrói volumes Docker e reconstrói tudo"
      echo "  --verbose   Coleta logs detalhados de auth, kong, db em caso de falha"
      exit 0
      ;;
  esac
done

# Helper: dump service logs when verbose mode is on or on critical failure
dump_logs() {
  local context="${1:-falha}"
  echo -e "\n${YELLOW}═══ Logs detalhados ($context) ═══${NC}"
  cd "$DEPLOY_DIR"
  for svc in db auth kong rest realtime storage functions; do
    echo -e "\n${CYAN}── $svc ──${NC}"
    docker compose -f docker-compose.onprem.yml logs "$svc" --tail 80 2>/dev/null || echo "(sem logs)"
  done
  cd "$PROJECT_ROOT"
}

# ─────────────────────────────────────────────────────────
# Smart retry with exponential backoff + root-cause diagnosis
# Usage: smart_retry "ServiceName" "container_id" "health_url" max_attempts
# ─────────────────────────────────────────────────────────
smart_retry() {
  local svc_name="$1"
  local container_id="$2"
  local health_url="$3"
  local max_attempts="${4:-4}"
  local attempt=0
  local backoff=5  # initial wait seconds

  while [ $attempt -lt $max_attempts ]; do
    attempt=$((attempt + 1))
    local wait_secs=$((backoff * attempt))  # linear backoff: 5,10,15,20...
    local poll_tries=$((30 + attempt * 10)) # more patience each round

    echo -e "  ${CYAN}[retry $attempt/$max_attempts]${NC} Aguardando ${svc_name} (${wait_secs}s backoff, ${poll_tries} polls)..."

    # Restart the container
    docker restart "$container_id" >/dev/null 2>&1 || true
    sleep "$wait_secs"

    # Poll health
    local i=0
    while [ $i -lt $poll_tries ]; do
      if curl -sSf "$health_url" >/dev/null 2>&1; then
        echo -e "  ${GREEN}✔${NC} ${svc_name} pronto na tentativa $attempt"
        return 0
      fi
      sleep 2
      i=$((i + 1))
    done

    # Diagnose root cause from logs
    echo -e "  ${YELLOW}⚠${NC}  ${svc_name} falhou (tentativa $attempt) — analisando causa..."
    local recent_logs
    recent_logs=$(docker logs "$container_id" --tail 30 2>&1 || echo "")

    if echo "$recent_logs" | grep -qi 'role "postgres" does not exist'; then
      echo -e "  ${RED}→ Causa: role 'postgres' inexistente${NC}"
      echo -e "  ${CYAN}→ Corrigindo: criando role postgres no DB...${NC}"
      local db_container
      db_container=$(docker compose -f "$COMPOSE_FILE" ps -q db 2>/dev/null || true)
      if [ -n "$db_container" ]; then
        docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "$db_container" \
          psql -w -h 127.0.0.1 -U supabase_admin -d postgres -c \
          "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='postgres') THEN CREATE ROLE postgres LOGIN SUPERUSER CREATEDB CREATEROLE REPLICATION BYPASSRLS; END IF; END \$\$; GRANT SELECT ON ALL TABLES IN SCHEMA auth TO postgres; ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT SELECT ON TABLES TO postgres;" \
          2>/dev/null && echo -e "  ${GREEN}✔${NC} Role postgres criada" \
                      || echo -e "  ${RED}✘${NC} Falha ao criar role postgres"
      fi

    elif echo "$recent_logs" | grep -qi 'no schema has been selected\|invalid_schema_name\|_realtime'; then
      echo -e "  ${RED}→ Causa: schema _realtime não existe${NC}"
      echo -e "  ${CYAN}→ Corrigindo: criando schema _realtime...${NC}"
      local db_container
      db_container=$(docker compose -f "$COMPOSE_FILE" ps -q db 2>/dev/null || true)
      if [ -n "$db_container" ]; then
        docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "$db_container" \
          psql -w -h 127.0.0.1 -U supabase_admin -d postgres -c \
          "CREATE SCHEMA IF NOT EXISTS _realtime AUTHORIZATION supabase_admin;" \
          2>/dev/null && echo -e "  ${GREEN}✔${NC} Schema _realtime criado" \
                      || echo -e "  ${RED}✘${NC} Falha ao criar schema _realtime"
      fi

    elif echo "$recent_logs" | grep -qi 'factor_type\|duplicate_object.*enum'; then
      echo -e "  ${RED}→ Causa: enum auth.factor_type duplicado ou ausente${NC}"
      echo -e "  ${CYAN}→ Corrigindo: pré-criando enums do auth...${NC}"
      local db_container
      db_container=$(docker compose -f "$COMPOSE_FILE" ps -q db 2>/dev/null || true)
      if [ -n "$db_container" ]; then
        docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "$db_container" \
          psql -w -h 127.0.0.1 -U supabase_admin -d postgres -c \
          "DO \$\$ BEGIN CREATE TYPE auth.factor_type AS ENUM ('totp','webauthn','phone'); EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;" \
          2>/dev/null || true
      fi

    elif echo "$recent_logs" | grep -qi 'password authentication failed\|FATAL.*auth'; then
      echo -e "  ${RED}→ Causa: credenciais do banco incorretas${NC}"
      echo -e "  ${YELLOW}→ Verifique POSTGRES_PASSWORD em deploy/.env${NC}"

    elif echo "$recent_logs" | grep -qi 'connection refused\|could not connect'; then
      echo -e "  ${RED}→ Causa: DB não acessível — aguardando mais...${NC}"

    else
      echo -e "  ${YELLOW}→ Causa não identificada automaticamente${NC}"
      echo "$recent_logs" | tail -5
    fi
  done

  echo -e "  ${RED}✘${NC} ${svc_name} não ficou pronto após $max_attempts tentativas"
  if $VERBOSE; then
    echo -e "\n${RED}═══ Logs completos de ${svc_name} ═══${NC}"
    docker logs "$container_id" --tail 120 2>&1 || true
  fi
  return 1
}

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

# ─── Auto-detect server IP/hostname for SITE_URL ──────────
detect_server_url() {
  local current="${SITE_URL:-}"
  if [ -n "$current" ] && [ "$current" != "http://flowpulse.local" ] && [ "$current" != "http://localhost:3000" ] && [ "$current" != "http://localhost" ]; then
    echo "$current"
    return
  fi
  local ip=""
  ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  if [ -z "$ip" ]; then
    ip=$(ip -4 addr show scope global 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1)
  fi
  if [ -n "$ip" ]; then
    echo "http://${ip}"
  else
    echo "http://localhost"
  fi
}

DETECTED_URL=$(detect_server_url)
SITE_URL="$DETECTED_URL"
API_EXTERNAL_URL="$DETECTED_URL"

CURRENT_SITE=$(grep '^SITE_URL=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-)
if [ "$CURRENT_SITE" = "http://flowpulse.local" ] || [ "$CURRENT_SITE" = "http://localhost:3000" ] || [ -z "$CURRENT_SITE" ]; then
  sed -i "s|^SITE_URL=.*|SITE_URL=${DETECTED_URL}|" "$ENV_FILE"
  sed -i "s|^API_EXTERNAL_URL=.*|API_EXTERNAL_URL=${DETECTED_URL}|" "$ENV_FILE"
  sed -i "s|^VITE_SUPABASE_URL=.*|VITE_SUPABASE_URL=${DETECTED_URL}|" "$ENV_FILE"
  echo -e "  ${GREEN}✔${NC} URLs auto-detectadas: ${DETECTED_URL}"
  set -a; source "$ENV_FILE"; set +a
else
  echo -e "  ${GREEN}✔${NC} SITE_URL já configurada: ${SITE_URL}"
fi

# ─── 3. Build do Frontend ─────────────────────────────────
echo -e "\n${CYAN}[3/8] Construindo frontend...${NC}"
cd "$PROJECT_ROOT"

if [ ! -d "node_modules" ]; then
  echo "  Instalando dependências..."
  npm ci --silent
fi

echo -e "  VITE_SUPABASE_URL=${SITE_URL}"
VITE_SUPABASE_URL="${SITE_URL}" \
VITE_SUPABASE_PUBLISHABLE_KEY="${ANON_KEY}" \
npm run build

rm -rf "$DEPLOY_DIR/dist"
cp -r dist "$DEPLOY_DIR/dist"
echo -e "  ${GREEN}✔${NC} Frontend compilado em deploy/dist/"

# ─── 4. Criar diretório do edge functions main ────────────
echo -e "\n${CYAN}[4/8] Preparando edge functions...${NC}"
FUNCTIONS_MAIN="$PROJECT_ROOT/supabase/functions/main"
if [ ! -d "$FUNCTIONS_MAIN" ]; then
  mkdir -p "$FUNCTIONS_MAIN"
fi

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

chmod +x "$DEPLOY_DIR/volumes/db/00-roles.sh" 2>/dev/null || true

docker compose -f docker-compose.onprem.yml --env-file .env up -d --remove-orphans

# ─── 6. Aguardar healthchecks com retry inteligente ───────
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

KONG_URL="http://localhost:${KONG_HTTP_PORT:-8000}"

# Wait for DB first (critical dependency)
DB_CONTAINER=$(docker compose -f docker-compose.onprem.yml ps -q db)
echo -e "  Aguardando Database..."
local_i=0
while [ $local_i -lt 60 ]; do
  db_status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$DB_CONTAINER" 2>/dev/null || echo "unknown")
  if [ "$db_status" = "healthy" ]; then
    echo -e "  ${GREEN}✔${NC} Database pronto (healthy)"
    break
  fi
  sleep 2
  local_i=$((local_i + 1))
done

# ─── 6b. Repair Auth prerequisites ───────────────────────
echo -e "  Preparando pré-requisitos do Auth..."
docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "$DB_CONTAINER" psql -w -v ON_ERROR_STOP=1 -h 127.0.0.1 -U supabase_admin -d postgres -c "
  DO \$\$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
      CREATE ROLE postgres LOGIN SUPERUSER CREATEDB CREATEROLE REPLICATION BYPASSRLS;
    END IF;
  END \$\$;

  CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
  GRANT USAGE, CREATE ON SCHEMA auth TO supabase_auth_admin;
  GRANT USAGE ON SCHEMA auth TO postgres, supabase_admin;
  GRANT SELECT ON ALL TABLES IN SCHEMA auth TO postgres;
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT SELECT ON TABLES TO postgres;
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT REFERENCES ON TABLES TO postgres, supabase_admin;

  CREATE SCHEMA IF NOT EXISTS _realtime AUTHORIZATION supabase_admin;
  GRANT USAGE, CREATE ON SCHEMA _realtime TO supabase_admin;
  ALTER ROLE supabase_auth_admin SET search_path = auth, public;

  -- Pre-create auth enums for GoTrue migrations
  DO \$\$ BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = 'factor_type'
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'auth' AND t.typname = 'factor_type'
    ) THEN
      ALTER TYPE public.factor_type SET SCHEMA auth;
    END IF;
  END \$\$;

  DO \$\$ BEGIN CREATE TYPE auth.factor_type AS ENUM ('totp','webauthn'); EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
  DO \$\$ BEGIN ALTER TYPE auth.factor_type OWNER TO supabase_auth_admin; EXCEPTION WHEN undefined_object THEN NULL; END \$\$;
  DO \$\$ BEGIN ALTER TYPE auth.factor_type ADD VALUE 'phone'; EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END \$\$;
  DO \$\$ BEGIN CREATE TYPE auth.factor_status AS ENUM ('unverified','verified'); EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
  DO \$\$ BEGIN CREATE TYPE auth.aal_level AS ENUM ('aal1','aal2','aal3'); EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
  DO \$\$ BEGIN CREATE TYPE auth.code_challenge_method AS ENUM ('s256','plain'); EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
  DO \$\$ BEGIN CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token','reauthentication_token','recovery_token',
    'email_change_token_new','email_change_token_current','phone_change_token'
  ); EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
" && echo -e "  ${GREEN}✔${NC} Auth types pré-criados" \
             || echo -e "  ${YELLOW}⚠${NC}  Auth types já existiam ou erro não-fatal"

# Restart Auth so it picks up pre-created types/roles
AUTH_CONTAINER=$(docker compose -f docker-compose.onprem.yml ps -q auth)
if [ -z "$AUTH_CONTAINER" ]; then
  echo -e "  ${RED}✘${NC} Container do Auth não encontrado"
  exit 1
fi

echo -e "  Reiniciando Auth container..."
docker restart "$AUTH_CONTAINER" >/dev/null 2>&1 || true
sleep 5

# Try initial health check (40 polls × 2s = 80s)
if ! wait_for_service "Auth (GoTrue)" "$KONG_URL/auth/v1/health" 40; then
  # Smart retry with backoff and root-cause diagnosis
  if ! smart_retry "Auth (GoTrue)" "$AUTH_CONTAINER" "$KONG_URL/auth/v1/health" 3; then
    dump_logs "Auth não ficou pronto"
    exit 1
  fi
fi

# Smart retry for Realtime if needed
REALTIME_CONTAINER=$(docker compose -f docker-compose.onprem.yml ps -q realtime 2>/dev/null || true)
if [ -n "$REALTIME_CONTAINER" ]; then
  rt_status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$REALTIME_CONTAINER" 2>/dev/null || echo "unknown")
  if [ "$rt_status" != "healthy" ] && [ "$rt_status" != "running" ]; then
    echo -e "  ${YELLOW}⚠${NC}  Realtime status: $rt_status — tentando recuperar..."
    smart_retry "Realtime" "$REALTIME_CONTAINER" "$KONG_URL/realtime/v1/" 2 || \
      echo -e "  ${YELLOW}⚠${NC}  Realtime não ficou pronto (não-crítico, continuando)"
  else
    echo -e "  ${GREEN}✔${NC} Realtime está pronto ($rt_status)"
  fi
fi

# Wait for Kong to route properly
wait_for_service "Kong Gateway" "$KONG_URL/rest/v1/" 30 || true

# ─── 7. Aplicar Schema + Seed ─────────────────────────────
echo -e "\n${CYAN}[7/8] Aplicando schema e seed admin...${NC}"

# Ensure postgres can reference auth.users for FK constraints
docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "$DB_CONTAINER" psql -w -v ON_ERROR_STOP=1 -h 127.0.0.1 -U supabase_admin -d postgres -c \
  "GRANT USAGE ON SCHEMA auth TO supabase_admin; GRANT REFERENCES ON ALL TABLES IN SCHEMA auth TO supabase_admin;" 2>/dev/null || true

# Check if schema already applied
SCHEMA_EXISTS=$(docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "$DB_CONTAINER" psql -w -v ON_ERROR_STOP=1 -h 127.0.0.1 -U supabase_admin -d postgres -tAc \
  "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tenants');" 2>/dev/null || echo "f")

if [ "$SCHEMA_EXISTS" = "t" ] && ! $FIX_MODE; then
  echo -e "  ${GREEN}✔${NC} Schema já aplicado (tabela 'tenants' encontrada)"
  echo "  Re-aplicando funções e triggers..."
  docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" -i "$DB_CONTAINER" psql -w -v ON_ERROR_STOP=1 -h 127.0.0.1 -U supabase_admin -d postgres < "$DEPLOY_DIR/schema_cblabs_full.sql"
  echo -e "  ${GREEN}✔${NC} Funções e triggers atualizados"
else
  echo "  Aplicando schema_cblabs_full.sql..."
  docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" -i "$DB_CONTAINER" psql -w -v ON_ERROR_STOP=1 -h 127.0.0.1 -U supabase_admin -d postgres < "$DEPLOY_DIR/schema_cblabs_full.sql"
  echo -e "  ${GREEN}✔${NC} Schema aplicado"
fi

# Reload PostgREST schema cache so RPCs become visible
echo -e "  Recarregando schema cache do PostgREST..."
docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "$DB_CONTAINER" psql -w -h 127.0.0.1 -U supabase_admin -d postgres -c "NOTIFY pgrst, 'reload schema';" 2>/dev/null || true
sleep 2
echo -e "  ${GREEN}✔${NC} PostgREST schema cache atualizado"

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

ADMIN_ID=""
if echo "$SIGNUP_RESP" | grep -q '"id"'; then
  ADMIN_ID=$(echo "$SIGNUP_RESP" | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
  echo -e "  ${GREEN}✔${NC} Admin criado: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}"
elif echo "$SIGNUP_RESP" | grep -qi 'already registered\|duplicate\|exists'; then
  echo -e "  ${GREEN}✔${NC} Admin já existe"
  # Fetch existing admin ID
  ADMIN_ID=$(docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "$DB_CONTAINER" psql -w -h 127.0.0.1 -U supabase_admin -d postgres -tAc \
    "SELECT id FROM auth.users WHERE email = '${ADMIN_EMAIL}' LIMIT 1;" 2>/dev/null | tr -d '[:space:]' || echo "")
else
  echo -e "  ⚠️  Resposta do seed: $(echo "$SIGNUP_RESP" | head -c 200)"
fi

# Safety net: if JSON parsing failed, fetch by email directly
if [ -z "$ADMIN_ID" ]; then
  ADMIN_ID=$(docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "$DB_CONTAINER" psql -w -h 127.0.0.1 -U supabase_admin -d postgres -tAc \
    "SELECT id FROM auth.users WHERE email = '${ADMIN_EMAIL}' LIMIT 1;" 2>/dev/null | tr -d '[:space:]' || echo "")
fi

# ─── Fallback: ensure profile, tenant & role exist even if trigger didn't fire ───
if [ -n "$ADMIN_ID" ]; then
  PROFILE_EXISTS=$(docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "$DB_CONTAINER" psql -w -h 127.0.0.1 -U supabase_admin -d postgres -tAc \
    "SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = '${ADMIN_ID}');" 2>/dev/null | tr -d '[:space:]' || echo "f")

  if [ "$PROFILE_EXISTS" != "t" ]; then
    echo -e "  ${YELLOW}⚠${NC}  Trigger handle_new_user não disparou — aplicando seed manual..."
    docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "$DB_CONTAINER" psql -w -h 127.0.0.1 -U supabase_admin -d postgres -c "
      DO \$\$
      DECLARE
        v_tenant_id UUID;
        v_slug TEXT;
        v_user_id UUID := '${ADMIN_ID}'::UUID;
        v_email TEXT := '${ADMIN_EMAIL}';
      BEGIN
        v_slug := 'admin-' || substr(v_user_id::text, 1, 8);

        -- Reuse tenant if role already exists for this user
        SELECT tenant_id INTO v_tenant_id
        FROM public.user_roles
        WHERE user_id = v_user_id
        ORDER BY created_at ASC
        LIMIT 1;

        -- Reuse deterministic tenant slug, otherwise create it
        IF v_tenant_id IS NULL THEN
          SELECT id INTO v_tenant_id
          FROM public.tenants
          WHERE slug = v_slug
          LIMIT 1;
        END IF;

        IF v_tenant_id IS NULL THEN
          INSERT INTO public.tenants (name, slug)
          VALUES ('Administrador''s Org', v_slug)
          RETURNING id INTO v_tenant_id;
        END IF;

        -- Upsert profile
        INSERT INTO public.profiles (id, tenant_id, display_name, email)
        VALUES (v_user_id, v_tenant_id, 'Administrador', v_email)
        ON CONFLICT (id) DO UPDATE
        SET tenant_id = EXCLUDED.tenant_id,
            display_name = EXCLUDED.display_name,
            email = EXCLUDED.email;

        -- Normalize roles for seeded admin
        DELETE FROM public.user_roles WHERE user_id = v_user_id;
        INSERT INTO public.user_roles (user_id, tenant_id, role)
        VALUES (v_user_id, v_tenant_id, 'admin');

        -- Inject tenant_id into JWT app_metadata
        UPDATE auth.users
        SET raw_app_meta_data = jsonb_set(
          COALESCE(raw_app_meta_data, '{}'::jsonb),
          '{tenant_id}',
          to_jsonb(v_tenant_id::text)
        )
        WHERE id = v_user_id;

        RAISE NOTICE 'Admin seed manual aplicado: tenant=%, user=%', v_tenant_id, v_user_id;
      END \$\$;
    " 2>/dev/null && echo -e "  ${GREEN}✔${NC} Profile, tenant e role criados manualmente" \
                  || echo -e "  ${RED}✘${NC} Falha no seed manual"
  else
    echo -e "  ${GREEN}✔${NC} Profile do admin já existe (trigger OK)"
    # Even if profile exists, ensure tenant_id is in JWT app_metadata (critical for RLS)
    echo -e "  Verificando tenant_id no JWT app_metadata..."
    docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "$DB_CONTAINER" psql -w -h 127.0.0.1 -U supabase_admin -d postgres -c "
      DO \$\$
      DECLARE
        v_tenant_id UUID;
        v_user_id UUID := '${ADMIN_ID}'::UUID;
        v_current_tenant TEXT;
      BEGIN
        -- Get tenant_id from profile
        SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = v_user_id;
        IF v_tenant_id IS NULL THEN
          RAISE NOTICE 'No tenant_id found in profile for %', v_user_id;
          RETURN;
        END IF;

        -- Check if already set in app_metadata
        SELECT raw_app_meta_data->>'tenant_id' INTO v_current_tenant
        FROM auth.users WHERE id = v_user_id;

        IF v_current_tenant IS DISTINCT FROM v_tenant_id::text THEN
          UPDATE auth.users
          SET raw_app_meta_data = jsonb_set(
            COALESCE(raw_app_meta_data, '{}'::jsonb),
            '{tenant_id}',
            to_jsonb(v_tenant_id::text)
          )
          WHERE id = v_user_id;
          RAISE NOTICE 'Injected tenant_id=% into JWT for user=%', v_tenant_id, v_user_id;
        END IF;

        -- Ensure admin role exists
        IF NOT EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = v_user_id AND tenant_id = v_tenant_id AND role = 'admin'
        ) THEN
          DELETE FROM public.user_roles WHERE user_id = v_user_id;
          INSERT INTO public.user_roles (user_id, tenant_id, role)
          VALUES (v_user_id, v_tenant_id, 'admin');
          RAISE NOTICE 'Admin role restored for user=%', v_user_id;
        END IF;
      END \$\$;
    " 2>/dev/null && echo -e "  ${GREEN}✔${NC} JWT app_metadata e role verificados" \
                  || echo -e "  ${YELLOW}⚠${NC}  Falha ao verificar app_metadata (não-crítico)"
  fi
else
  echo -e "  ${YELLOW}⚠${NC}  Não foi possível resolver ADMIN_ID para validar seed"
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
  ADMIN_TOKEN=$(echo "$LOGIN_RESP" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
else
  echo -e "  ${YELLOW}⚠${NC}  Login admin falhou: $(echo "$LOGIN_RESP" | head -c 120)"
  SMOKE_OK=false
  ADMIN_TOKEN=""
fi

# ─── Test: handle_new_user trigger ───
ADMIN_TENANT=""
if [ -n "$ADMIN_TOKEN" ] && [ -n "$ADMIN_ID" ]; then
  PROFILE_RESP=$(curl -sS "$KONG_URL/rest/v1/profiles?select=id,tenant_id,email,display_name&id=eq.${ADMIN_ID}&limit=1" \
    -H "apikey: ${ANON_KEY}" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" 2>/dev/null || echo '[]')

  if echo "$PROFILE_RESP" | grep -q '"tenant_id"'; then
    echo -e "  ${GREEN}✔${NC} Trigger handle_new_user: profile auto-provisionado"
    ADMIN_TENANT=$(echo "$PROFILE_RESP" | sed -n 's/.*"tenant_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1 || true)
  else
    PROFILE_DB_OK=$(docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "$DB_CONTAINER" psql -w -h 127.0.0.1 -U supabase_admin -d postgres -tAc \
      "SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = '${ADMIN_ID}');" 2>/dev/null | tr -d '[:space:]' || echo "f")
    ADMIN_TENANT=$(docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "$DB_CONTAINER" psql -w -h 127.0.0.1 -U supabase_admin -d postgres -tAc \
      "SELECT tenant_id FROM public.profiles WHERE id = '${ADMIN_ID}' LIMIT 1;" 2>/dev/null | tr -d '[:space:]' || echo "")

    if [ "$PROFILE_DB_OK" = "t" ] && [ -n "$ADMIN_TENANT" ]; then
      echo -e "  ${YELLOW}⚠${NC}  Trigger handle_new_user: profile via REST indisponível, mas profile existe no banco"
    else
      echo -e "  ${RED}✘${NC} Trigger handle_new_user: profile NÃO encontrado"
      SMOKE_OK=false
    fi
  fi

  ROLE_RESP=$(curl -sS "$KONG_URL/rest/v1/user_roles?select=role,user_id,tenant_id&user_id=eq.${ADMIN_ID}&role=eq.admin&limit=1" \
    -H "apikey: ${ANON_KEY}" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" 2>/dev/null || echo '[]')

  if echo "$ROLE_RESP" | grep -q '"admin"'; then
    echo -e "  ${GREEN}✔${NC} Trigger handle_new_user: role 'admin' atribuída"
  else
    ROLE_DB_OK=$(docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "$DB_CONTAINER" psql -w -h 127.0.0.1 -U supabase_admin -d postgres -tAc \
      "SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = '${ADMIN_ID}' AND role = 'admin');" 2>/dev/null | tr -d '[:space:]' || echo "f")

    if [ "$ROLE_DB_OK" = "t" ]; then
      echo -e "  ${YELLOW}⚠${NC}  Trigger handle_new_user: role admin existe no banco (REST indisponível)"
    else
      echo -e "  ${RED}✘${NC} Trigger handle_new_user: role admin NÃO encontrada"
      SMOKE_OK=false
    fi
  fi
else
  echo -e "  ${YELLOW}⚠${NC}  Trigger handle_new_user: sem token/id para validação"
  SMOKE_OK=false
fi

# ─── Test: RLS tenant isolation ───
if [ -n "$ADMIN_TOKEN" ]; then
  if [ -n "$ADMIN_TENANT" ]; then
    GHOST_EMAIL="rls-test-$(date +%s)@flowpulse.local"
    GHOST_RESP=$(curl -sS -X POST "$KONG_URL/auth/v1/admin/users" \
      -H "apikey: ${SERVICE_ROLE_KEY}" \
      -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"${GHOST_EMAIL}\",\"password\":\"RlsTest@9999\",\"email_confirm\":true}" 2>/dev/null || echo '{}')

    GHOST_ID=$(echo "$GHOST_RESP" | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)

    if [ -n "$GHOST_ID" ]; then
      GHOST_LOGIN=$(curl -sS -X POST "$KONG_URL/auth/v1/token?grant_type=password" \
        -H "apikey: ${ANON_KEY}" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"${GHOST_EMAIL}\",\"password\":\"RlsTest@9999\"}" 2>/dev/null || echo '{}')

      GHOST_TOKEN=$(echo "$GHOST_LOGIN" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

      if [ -n "$GHOST_TOKEN" ]; then
        CROSS_RESP=$(curl -sS "$KONG_URL/rest/v1/dashboards?tenant_id=eq.${ADMIN_TENANT}&select=id&limit=1" \
          -H "apikey: ${ANON_KEY}" \
          -H "Authorization: Bearer ${GHOST_TOKEN}" 2>/dev/null || echo '[]')

        if [ "$CROSS_RESP" = "[]" ] || echo "$CROSS_RESP" | grep -q '^\[\]$'; then
          echo -e "  ${GREEN}✔${NC} RLS: isolamento cross-tenant confirmado"
        else
          echo -e "  ${RED}✘${NC} RLS VIOLADA: ghost viu dados do admin tenant!"
          SMOKE_OK=false
        fi
      else
        echo -e "  ${YELLOW}⚠${NC}  RLS test: não conseguiu logar ghost user"
      fi

      curl -sS -X DELETE "$KONG_URL/auth/v1/admin/users/${GHOST_ID}" \
        -H "apikey: ${SERVICE_ROLE_KEY}" \
        -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" >/dev/null 2>&1 || true
    else
      echo -e "  ${YELLOW}⚠${NC}  RLS test: não conseguiu criar ghost user"
    fi
  fi
fi

# ─── Done ─────────────────────────────────────────────────
echo ""
if $SMOKE_OK; then
  echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║   ✅ FlowPulse On-Premise — PRONTO!                        ║${NC}"
  echo -e "${GREEN}╠══════════════════════════════════════════════════════════════╣${NC}"
  echo -e "${GREEN}║                                                              ║${NC}"
  echo -e "${GREEN}║   🌐 UI:        ${SITE_URL}$(printf '%*s' $((38 - ${#SITE_URL})) '')║${NC}"
  echo -e "${GREEN}║   🔑 Login:     ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}           ║${NC}"
  echo -e "${GREEN}║   📡 API:       ${SITE_URL}:${KONG_HTTP_PORT:-8000}$(printf '%*s' $((32 - ${#SITE_URL})) '')║${NC}"
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
  echo -e "${YELLOW}║     bash scripts/onprem-up.sh --fix --verbose               ║${NC}"
  echo -e "${YELLOW}╚══════════════════════════════════════════════════════════════╝${NC}"
  if $VERBOSE; then
    dump_logs "smoke parcial"
  fi
fi
