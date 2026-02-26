#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  FLOWPULSE — Build de Pacote .deb (Produto Comercial)          ║
# ║  Uso: bash packaging/build-deb.sh [versão]                     ║
# ║  Ex:  bash packaging/build-deb.sh 3.0.0                        ║
# ╚══════════════════════════════════════════════════════════════════╝

set -euo pipefail

VERSION="${1:-3.0.0}"
NODE_VERSION="22.16.0"
ARCH="x64"
PKG_NAME="flowpulse"
BUILD_DIR="build/${PKG_NAME}_${VERSION}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════╗"
echo "║   FlowPulse .deb Builder — v${VERSION}              ║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

cd "$PROJECT_ROOT"

# ─── Limpar build anterior ────────────────────────
rm -rf "$BUILD_DIR"
echo -e "${YELLOW}→ Build dir: ${BUILD_DIR}${NC}"

# ═══════════════════════════════════════════════════
# 1. BUILD DO FRONTEND
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}[1/5] Compilando frontend...${NC}"

export VITE_SUPABASE_URL="http://localhost:3060"
export VITE_SUPABASE_PUBLISHABLE_KEY="flowpulse-onpremise-anon-key"

npm ci --ignore-scripts 2>/dev/null
npm run build

echo -e "${GREEN}✔ Frontend compilado${NC}"

# ═══════════════════════════════════════════════════
# 2. PREPARAR BACKEND (server + deps)
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}[2/5] Preparando backend...${NC}"

SRVTMP=$(mktemp -d)
cp deploy/server.js "$SRVTMP/"
cp deploy/schema_cblabs_full.sql "$SRVTMP/schema.sql"

cat > "$SRVTMP/package.json" <<EOF
{
  "name": "flowpulse-server",
  "version": "${VERSION}",
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

cd "$SRVTMP"
npm install --omit=dev --ignore-scripts 2>/dev/null
cd "$PROJECT_ROOT"

echo -e "${GREEN}✔ Backend preparado com node_modules embutidos${NC}"

# ═══════════════════════════════════════════════════
# 3. BAIXAR NODE.JS RUNTIME EMBUTIDO
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}[3/5] Obtendo Node.js ${NODE_VERSION} runtime...${NC}"

NODE_TAR="node-v${NODE_VERSION}-linux-${ARCH}.tar.xz"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TAR}"
NODE_CACHE="/tmp/${NODE_TAR}"

if [ ! -f "$NODE_CACHE" ]; then
  echo -e "${YELLOW}→ Baixando ${NODE_URL}...${NC}"
  curl -fSL -o "$NODE_CACHE" "$NODE_URL"
fi

NODETMP=$(mktemp -d)
tar -xJf "$NODE_CACHE" -C "$NODETMP" --strip-components=1

echo -e "${GREEN}✔ Node.js ${NODE_VERSION} obtido${NC}"

# ═══════════════════════════════════════════════════
# 4. MONTAR ÁRVORE DO PACOTE
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}[4/5] Montando árvore do pacote...${NC}"

# DEBIAN
mkdir -p "$BUILD_DIR/DEBIAN"
cp packaging/DEBIAN/control "$BUILD_DIR/DEBIAN/"
cp packaging/DEBIAN/conffiles "$BUILD_DIR/DEBIAN/"
cp packaging/DEBIAN/postinst "$BUILD_DIR/DEBIAN/"
cp packaging/DEBIAN/prerm "$BUILD_DIR/DEBIAN/"
cp packaging/DEBIAN/postrm "$BUILD_DIR/DEBIAN/"

# Atualizar versão no control
sed -i "s/^Version:.*/Version: ${VERSION}/" "$BUILD_DIR/DEBIAN/control"

# Permissões dos scripts
chmod 755 "$BUILD_DIR/DEBIAN/postinst"
chmod 755 "$BUILD_DIR/DEBIAN/prerm"
chmod 755 "$BUILD_DIR/DEBIAN/postrm"

# Frontend → /usr/share/flowpulse/web
mkdir -p "$BUILD_DIR/usr/share/flowpulse/web"
cp -a dist/* "$BUILD_DIR/usr/share/flowpulse/web/"

# Backend → /usr/lib/flowpulse/server
mkdir -p "$BUILD_DIR/usr/lib/flowpulse/server"
cp -a "$SRVTMP/"* "$BUILD_DIR/usr/lib/flowpulse/server/"

# Node runtime → /opt/flowpulse/node
mkdir -p "$BUILD_DIR/opt/flowpulse/node"
cp -a "$NODETMP/bin" "$BUILD_DIR/opt/flowpulse/node/"
cp -a "$NODETMP/lib" "$BUILD_DIR/opt/flowpulse/node/"
# Manter só o binário principal (reduz tamanho)
find "$BUILD_DIR/opt/flowpulse/node/bin" -not -name "node" -not -type d -delete 2>/dev/null || true

# Config → /etc/flowpulse
mkdir -p "$BUILD_DIR/etc/flowpulse"
cp packaging/flowpulse.env "$BUILD_DIR/etc/flowpulse/flowpulse.env"

# systemd → /lib/systemd/system
mkdir -p "$BUILD_DIR/lib/systemd/system"
cp packaging/flowpulse.service "$BUILD_DIR/lib/systemd/system/"

# Nginx → /etc/nginx/sites-available
mkdir -p "$BUILD_DIR/etc/nginx/sites-available"
cp packaging/nginx-flowpulse.conf "$BUILD_DIR/etc/nginx/sites-available/flowpulse"

# Data dir placeholder
mkdir -p "$BUILD_DIR/var/lib/flowpulse/data"

echo -e "${GREEN}✔ Árvore montada${NC}"

# ═══════════════════════════════════════════════════
# 5. GERAR .deb
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}[5/5] Gerando pacote .deb...${NC}"

# Calcular tamanho instalado (em KB)
INSTALLED_SIZE=$(du -sk "$BUILD_DIR" | awk '{print $1}')
sed -i "/^Description:/i Installed-Size: ${INSTALLED_SIZE}" "$BUILD_DIR/DEBIAN/control"

dpkg-deb --root-owner-group --build "$BUILD_DIR" "build/${PKG_NAME}_${VERSION}_amd64.deb"

# Limpar temporários
rm -rf "$SRVTMP" "$NODETMP"

# Resultado
DEB_FILE="build/${PKG_NAME}_${VERSION}_amd64.deb"
DEB_SIZE=$(du -sh "$DEB_FILE" | awk '{print $1}')

echo -e "\n${GREEN}"
echo "╔══════════════════════════════════════════════════╗"
echo "║   ✅ PACOTE GERADO COM SUCESSO!                  ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║   Arquivo: ${DEB_FILE}"
echo "║   Tamanho: ${DEB_SIZE}"
echo "║   Versão:  ${VERSION}"
echo "║   Node:    ${NODE_VERSION} (embutido)"
echo "║                                                  ║"
echo "║   Instalar:                                      ║"
echo "║     apt install ./${DEB_FILE}                    ║"
echo "║                                                  ║"
echo "║   Ou copie para o servidor e:                    ║"
echo "║     dpkg -i ${PKG_NAME}_${VERSION}_amd64.deb    ║"
echo "║     apt -f install                               ║"
echo "║                                                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${NC}"
