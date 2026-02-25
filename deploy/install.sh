#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  FLOWPULSE INTELLIGENCE — Instalador On-Premise (Debian 13)    ║
# ║  © 2026 CBLabs                                                  ║
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
echo "║   FLOWPULSE INTELLIGENCE — Instalador v1.0      ║"
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

install_dep() {
  echo -e "${YELLOW}→ Instalando $1...${NC}"
  apt-get install -y "$1" > /dev/null 2>&1
}

# ═══════════════════════════════════════════════════
# ETAPA 1: VERIFICAR DEPENDÊNCIAS
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}[1/6] Verificando dependências...${NC}\n"

apt-get update -qq > /dev/null 2>&1

MISSING=0

# Node.js
if ! check_dep node; then
  echo -e "${YELLOW}→ Instalando Node.js 20 LTS...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y nodejs > /dev/null 2>&1
  MISSING=1
fi

NODE_VERSION=$(node -v 2>/dev/null || echo "none")
echo -e "  Node.js: ${GREEN}${NODE_VERSION}${NC}"

# PostgreSQL
if ! check_dep psql; then
  install_dep postgresql
  systemctl enable postgresql
  systemctl start postgresql
  MISSING=1
fi

# Nginx
if ! check_dep nginx; then
  install_dep nginx
  systemctl enable nginx
  MISSING=1
fi

# Build tools
for pkg in git build-essential; do
  dpkg -s "$pkg" &>/dev/null || install_dep "$pkg"
done

echo -e "\n${GREEN}✔ Dependências verificadas.${NC}"

# ═══════════════════════════════════════════════════
# ETAPA 2: CONFIGURAÇÃO DO BANCO DE DADOS
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}[2/6] Configurando banco de dados...${NC}\n"

read -p "Host do PostgreSQL [127.0.0.1]: " DB_HOST
DB_HOST=${DB_HOST:-127.0.0.1}

read -p "Porta do PostgreSQL [5432]: " DB_PORT
DB_PORT=${DB_PORT:-5432}

read -p "Nome do banco [flowpulse]: " DB_NAME
DB_NAME=${DB_NAME:-flowpulse}

read -p "Usuário do banco [flowpulse]: " DB_USER
DB_USER=${DB_USER:-flowpulse}

read -sp "Senha do banco [flowpulse]: " DB_PASS
DB_PASS=${DB_PASS:-flowpulse}
echo ""

# Criar usuário e banco se local
if [ "$DB_HOST" = "127.0.0.1" ] || [ "$DB_HOST" = "localhost" ]; then
  echo -e "${YELLOW}→ Criando usuário e banco local...${NC}"
  su - postgres -c "psql -c \"DO \\\$\\\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}'; END IF; END \\\$\\\$;\"" 2>/dev/null || true
  su - postgres -c "psql -c \"SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'\" | grep -q 1 || createdb -O ${DB_USER} ${DB_NAME}" 2>/dev/null || true
fi

echo -e "${GREEN}✔ Banco configurado.${NC}"

# ═══════════════════════════════════════════════════
# ETAPA 3: CRIAR ESTRUTURA DE DIRETÓRIOS
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}[3/6] Criando estrutura de diretórios...${NC}\n"

mkdir -p "$INSTALL_DIR" "$DATA_DIR"

# Criar usuário de serviço
id "$SERVICE_USER" &>/dev/null || useradd -r -s /usr/sbin/nologin -d "$INSTALL_DIR" "$SERVICE_USER"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR" "$DATA_DIR"

echo -e "${GREEN}✔ Diretórios criados.${NC}"

# ═══════════════════════════════════════════════════
# ETAPA 4: COPIAR ARQUIVOS E INSTALAR DEPS
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}[4/6] Instalando aplicação...${NC}\n"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Copiar server e schema
cp "$SCRIPT_DIR/server.js" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/schema_cblabs_full.sql" "$INSTALL_DIR/"

# Copiar dist (frontend build) se existir
if [ -d "$SCRIPT_DIR/dist" ]; then
  cp -r "$SCRIPT_DIR/dist" "$INSTALL_DIR/"
  echo -e "  ${GREEN}✔${NC} Frontend copiado"
else
  echo -e "  ${YELLOW}⚠${NC} Pasta 'dist' não encontrada. Execute 'npm run build' antes."
fi

# Gerar .env
cat > "$INSTALL_DIR/.env" <<EOF
PORT=${PORT}
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASS=${DB_PASS}
JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRY=24h
STORAGE_DIR=${DATA_DIR}
STATIC_DIR=${INSTALL_DIR}/dist
EOF

echo -e "  ${GREEN}✔${NC} Arquivo .env gerado"

# Package.json para dependências do servidor
cat > "$INSTALL_DIR/package.json" <<EOF
{
  "name": "flowpulse-onpremise",
  "version": "1.0.0",
  "private": true,
  "scripts": { "start": "node server.js" },
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
npm install --production 2>/dev/null
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

echo -e "${GREEN}✔ Dependências do servidor instaladas.${NC}"

# ═══════════════════════════════════════════════════
# ETAPA 5: PROVISIONAR SCHEMA + SEED
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}[5/6] Provisionando banco de dados...${NC}\n"

PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -f "$INSTALL_DIR/schema_cblabs_full.sql" 2>/dev/null

echo -e "${GREEN}✔ Schema aplicado e admin seed criado.${NC}"
echo -e "  Credenciais: ${YELLOW}admin${NC} / ${YELLOW}admin${NC}"

# ═══════════════════════════════════════════════════
# ETAPA 6: CONFIGURAR SYSTEMD + NGINX
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}[6/6] Configurando serviços...${NC}\n"

# systemd
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
ExecStart=/usr/bin/node ${INSTALL_DIR}/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=${INSTALL_DIR}/.env
StandardOutput=journal
StandardError=journal
SyslogIdentifier=flowpulse

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
systemctl start ${SERVICE_NAME}

echo -e "  ${GREEN}✔${NC} Serviço systemd configurado e iniciado"

# Nginx reverse proxy
cat > /etc/nginx/sites-available/flowpulse <<EOF
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
        client_max_body_size 20M;
    }

    location /storage/ {
        alias ${DATA_DIR}/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

ln -sf /etc/nginx/sites-available/flowpulse /etc/nginx/sites-enabled/flowpulse
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo -e "  ${GREEN}✔${NC} Nginx configurado como reverse proxy"

# ═══════════════════════════════════════════════════
# RESULTADO FINAL
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}"
echo "╔══════════════════════════════════════════════════╗"
echo "║   ✅ INSTALAÇÃO CONCLUÍDA COM SUCESSO!           ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║   Acesse: http://$(hostname -I | awk '{print $1}'):${PORT}  ║"
echo "║                                                  ║"
echo "║   Login:  admin / admin                          ║"
echo "║   (Altere a senha no primeiro acesso!)           ║"
echo "║                                                  ║"
echo "║   Serviço: systemctl status flowpulse            ║"
echo "║   Logs:    journalctl -u flowpulse -f            ║"
echo "║                                                  ║"
echo "║   © 2026 FLOWPULSE INTELLIGENCE | CBLabs         ║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${NC}"
