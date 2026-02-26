#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  FLOWPULSE INTELLIGENCE — Instalador On-Premise (Debian 13)    ║
# ║  © 2026 CBLabs — v3.0 (Hardened)                               ║
# ║  Uso: sudo bash install.sh                                      ║
# ╚══════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ─── CORES ──────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

INSTALL_DIR="/opt/flowpulse"
DATA_DIR="/var/lib/flowpulse/data"
SERVICE_USER="flowpulse"
SERVICE_NAME="flowpulse"
PORT=3060

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════╗"
echo "║   FLOWPULSE INTELLIGENCE — Instalador v3.0      ║"
echo "║   On-Premise Server (Hardened)                    ║"
echo "║   © 2026 CBLabs                                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── VERIFICAR ROOT ────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}❌ Este script deve ser executado como root (sudo).${NC}"
  exit 1
fi

# ─── FUNÇÕES AUXILIARES ────────────────────────────
check_dep() {
  if command -v "$1" &>/dev/null; then
    echo -e "  ${GREEN}✔${NC} $1 encontrado: $(command -v $1)"
    return 0
  else
    echo -e "  ${RED}✘${NC} $1 NÃO encontrado"
    return 1
  fi
}

install_pkg() {
  echo -e "${YELLOW}→ Instalando $1...${NC}"
  apt-get install -y "$1" > /dev/null 2>&1
}

# ═══════════════════════════════════════════════════
# ETAPA 1: VERIFICAR DEPENDÊNCIAS
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}[1/8] Verificando dependências...${NC}\n"

apt-get update -qq > /dev/null 2>&1

# Node.js — usar repositório do Debian 13 (já entrega 20.x)
if ! check_dep node; then
  echo -e "${YELLOW}→ Instalando Node.js do repositório Debian...${NC}"
  apt-get install -y nodejs npm > /dev/null 2>&1
fi

NODE_VERSION=$(node -v 2>/dev/null || echo "none")
echo -e "  Node.js: ${GREEN}${NODE_VERSION}${NC}"

# Aviso sobre EOL do Node 20
if [[ "$NODE_VERSION" == v20.* ]]; then
  echo -e "  ${YELLOW}⚠ Node.js 20 LTS entra em EOL em 30/04/2026.${NC}"
  echo -e "  ${YELLOW}  Planeje migração para Node 22 LTS antes dessa data.${NC}"
fi

# PostgreSQL
if ! check_dep psql; then
  install_pkg postgresql
  install_pkg postgresql-contrib
  systemctl enable postgresql
  systemctl start postgresql
fi

# Nginx
if ! check_dep nginx; then
  install_pkg nginx
  systemctl enable nginx
fi

# Build tools
for pkg in git build-essential ca-certificates curl; do
  dpkg -s "$pkg" &>/dev/null || install_pkg "$pkg"
done

echo -e "\n${GREEN}✔ Dependências verificadas.${NC}"

# ═══════════════════════════════════════════════════
# ETAPA 2: CONFIGURAÇÃO DO BANCO DE DADOS
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}[2/8] Configurando banco de dados...${NC}\n"

read -p "Host do PostgreSQL [127.0.0.1]: " DB_HOST
DB_HOST=${DB_HOST:-127.0.0.1}

read -p "Porta do PostgreSQL [5432]: " DB_PORT
DB_PORT=${DB_PORT:-5432}

read -p "Nome do banco [flowpulsedb]: " DB_NAME
DB_NAME=${DB_NAME:-flowpulsedb}

read -p "Usuário do banco [flowpulse]: " DB_USER
DB_USER=${DB_USER:-flowpulse}

# Senha forte obrigatória
while true; do
  read -sp "Senha do banco (mín. 12 caracteres): " DB_PASS
  echo ""
  if [ ${#DB_PASS} -lt 12 ]; then
    echo -e "${RED}  ✘ Senha muito curta. Use ao menos 12 caracteres.${NC}"
  else
    break
  fi
done

# Criar usuário e banco se local
if [ "$DB_HOST" = "127.0.0.1" ] || [ "$DB_HOST" = "localhost" ]; then
  echo -e "${YELLOW}→ Criando usuário e banco local...${NC}"
  su - postgres -c "psql -c \"DO \\\$\\\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}'; END IF; END \\\$\\\$;\"" 2>/dev/null || true
  su - postgres -c "psql -c \"SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'\" | grep -q 1 || createdb -O ${DB_USER} ${DB_NAME}" 2>/dev/null || true
  # Extensões
  su - postgres -c "psql -d ${DB_NAME} -c 'CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"; CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";'" 2>/dev/null || true
fi

echo -e "${GREEN}✔ Banco configurado.${NC}"

# ═══════════════════════════════════════════════════
# ETAPA 3: DETECTAR IP DO SERVIDOR
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}[3/8] Configuração de rede...${NC}\n"

SERVER_IP=$(hostname -I | awk '{print $1}')
read -p "IP do servidor para o frontend acessar [${SERVER_IP}]: " CUSTOM_IP
SERVER_IP=${CUSTOM_IP:-$SERVER_IP}

echo -e "  Frontend apontará para: ${GREEN}http://${SERVER_IP}:${PORT}${NC}"

# ═══════════════════════════════════════════════════
# ETAPA 4: CRIAR USUÁRIO DE SERVIÇO + DIRETÓRIOS
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}[4/8] Criando usuário de serviço e diretórios...${NC}\n"

# Criar usuário de serviço (sem shell, sem home login)
if ! id "$SERVICE_USER" &>/dev/null; then
  adduser --system --group --home "$INSTALL_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
  echo -e "  ${GREEN}✔${NC} Usuário de serviço '${SERVICE_USER}' criado"
else
  echo -e "  ${GREEN}✔${NC} Usuário '${SERVICE_USER}' já existe"
fi

mkdir -p "$INSTALL_DIR" "$DATA_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR" "$DATA_DIR"
chmod 750 "$INSTALL_DIR" "$DATA_DIR"

echo -e "  ${GREEN}✔${NC} /opt/flowpulse     → servidor + frontend (750)"
echo -e "  ${GREEN}✔${NC} /var/lib/flowpulse  → storage local (750)"

# ═══════════════════════════════════════════════════
# ETAPA 5: COPIAR ARQUIVOS E INSTALAR DEPS
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}[5/8] Instalando aplicação...${NC}\n"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Copiar server e schema
cp "$SCRIPT_DIR/server.js" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/schema_cblabs_full.sql" "$INSTALL_DIR/"

# ─── BUILD DO FRONTEND ─────────────────────────────
if [ -d "$SCRIPT_DIR/dist" ]; then
  echo -e "  ${GREEN}✔${NC} Usando dist/ pré-compilado"
  cp -r "$SCRIPT_DIR/dist" "$INSTALL_DIR/"
elif [ -f "$PROJECT_ROOT/package.json" ] && grep -q "vite" "$PROJECT_ROOT/package.json" 2>/dev/null; then
  echo -e "${YELLOW}→ Compilando frontend para http://${SERVER_IP}:${PORT}...${NC}"
  cd "$PROJECT_ROOT"

  export VITE_SUPABASE_URL="http://${SERVER_IP}:${PORT}"
  export VITE_SUPABASE_PUBLISHABLE_KEY="flowpulse-onpremise-anon-key"

  npm ci 2>/dev/null || npm install 2>/dev/null
  npm run build 2>/dev/null

  cp -r "$PROJECT_ROOT/dist" "$INSTALL_DIR/"
  echo -e "  ${GREEN}✔${NC} Frontend compilado e copiado"
else
  echo -e "  ${YELLOW}⚠${NC} Nenhum frontend encontrado."
  echo -e "  ${YELLOW}  Compile manualmente com:${NC}"
  echo -e "  ${CYAN}  export VITE_SUPABASE_URL=http://${SERVER_IP}:${PORT}${NC}"
  echo -e "  ${CYAN}  export VITE_SUPABASE_PUBLISHABLE_KEY=flowpulse-onpremise-anon-key${NC}"
  echo -e "  ${CYAN}  npm ci && npm run build${NC}"
  echo -e "  ${CYAN}  cp -r dist/ ${INSTALL_DIR}/dist/${NC}"
fi

# ─── GERAR SECRETS FORTES ──────────────────────────
JWT_SECRET=$(openssl rand -hex 32)
ZABBIX_KEY=$(openssl rand -hex 32)

# ─── GERAR .env COM PERMISSÕES RESTRITAS ───────────
cat > "$INSTALL_DIR/.env" <<EOF
PORT=${PORT}
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASS=${DB_PASS}
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRY=24h
ANON_KEY=flowpulse-onpremise-anon-key
STORAGE_DIR=${DATA_DIR}
STATIC_DIR=${INSTALL_DIR}/dist
ZABBIX_ENCRYPTION_KEY=${ZABBIX_KEY}
EOF

chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/.env"
chmod 600 "$INSTALL_DIR/.env"
echo -e "  ${GREEN}✔${NC} Arquivo .env gerado (chmod 600)"

# Package.json para dependências do servidor
cat > "$INSTALL_DIR/package.json" <<EOF
{
  "name": "flowpulse-server",
  "version": "3.0.0",
  "private": true,
  "main": "server.js",
  "dependencies": {
    "express": "^4.21.0",
    "pg": "^8.13.0",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "cors": "^2.8.5",
    "multer": "^1.4.5-lts.1",
    "dotenv": "^16.4.7"
  }
}
EOF

cd "$INSTALL_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
sudo -u "$SERVICE_USER" npm install --omit=dev 2>/dev/null

echo -e "${GREEN}✔ Dependências do servidor instaladas.${NC}"

# ═══════════════════════════════════════════════════
# ETAPA 6: PROVISIONAR SCHEMA + SEED
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}[6/8] Provisionando banco de dados...${NC}\n"

PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -f "$INSTALL_DIR/schema_cblabs_full.sql" 2>/dev/null

echo -e "${GREEN}✔ Schema aplicado e admin seed criado.${NC}"
echo -e "  Credenciais padrão: ${YELLOW}admin@flowpulse.local${NC} / ${YELLOW}admin@123${NC}"
echo -e "  ${RED}⚠ TROQUE A SENHA NO PRIMEIRO ACESSO!${NC}"

# ═══════════════════════════════════════════════════
# ETAPA 7: CONFIGURAR SYSTEMD (HARDENED)
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}[7/8] Configurando serviço systemd (hardened)...${NC}\n"

cat > /etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=FlowPulse Intelligence — On-Premise Server
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
Environment=NODE_ENV=production
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=/usr/bin/node ${INSTALL_DIR}/server.js
Restart=always
RestartSec=3

# ─── Hardening ─────────────────────────────────
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${DATA_DIR} ${INSTALL_DIR}
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
LockPersonality=true
MemoryDenyWriteExecute=true
RestrictSUIDSGID=true
RestrictNamespaces=true
RestrictRealtime=true

StandardOutput=journal
StandardError=journal
SyslogIdentifier=flowpulse

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
systemctl start ${SERVICE_NAME}

echo -e "  ${GREEN}✔${NC} Serviço systemd configurado e iniciado (hardened)"

# ═══════════════════════════════════════════════════
# ETAPA 8: CONFIGURAR NGINX
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}[8/8] Configurando Nginx...${NC}\n"

cat > /etc/nginx/sites-available/flowpulse <<'NGINX'
server {
    listen 80;
    server_name _;

    client_max_body_size 20M;

    # Cabeçalhos de segurança
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Proxy tudo para o Express (que serve SPA + API)
    location / {
        proxy_pass http://127.0.0.1:3060;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/flowpulse /etc/nginx/sites-enabled/flowpulse
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo -e "  ${GREEN}✔${NC} Nginx configurado (proxy reverso + security headers)"

# ═══════════════════════════════════════════════════
# RESULTADO FINAL
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   ✅ INSTALAÇÃO CONCLUÍDA COM SUCESSO!                      ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║   Acesse: http://${SERVER_IP}                                ║"
echo "║   API:    http://${SERVER_IP}:${PORT}                        ║"
echo "║                                                              ║"
echo "║   Login:  admin@flowpulse.local / admin@123                  ║"
echo "║   ⚠ TROQUE A SENHA NO PRIMEIRO ACESSO!                      ║"
echo "║                                                              ║"
echo "║   Segurança:                                                 ║"
echo "║     ✔ Serviço roda como usuário '${SERVICE_USER}'           ║"
echo "║     ✔ .env com chmod 600                                     ║"
echo "║     ✔ JWT_SECRET gerado com openssl                          ║"
echo "║     ✔ systemd com hardening ativo                            ║"
echo "║     ✔ Nginx com security headers                             ║"
echo "║                                                              ║"
echo "║   Estrutura:                                                 ║"
echo "║     /opt/flowpulse/                                          ║"
echo "║       ├── server.js          ← API Express                  ║"
echo "║       ├── dist/              ← Frontend (via Express)       ║"
echo "║       ├── .env               ← Config (600)                 ║"
echo "║       └── node_modules/      ← Deps do servidor             ║"
echo "║     /var/lib/flowpulse/data/ ← Storage local                ║"
echo "║                                                              ║"
echo "║   Comandos úteis:                                            ║"
echo "║     systemctl status flowpulse                                ║"
echo "║     journalctl -u flowpulse -f                                ║"
echo "║                                                              ║"
echo "║   © 2026 FLOWPULSE INTELLIGENCE | CBLabs                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
