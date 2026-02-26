#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  FLOWPULSE — Build de Pacote .deb (Produto Comercial)          ║
# ║  Uso: bash packaging/build-deb.sh [versão]                     ║
# ║  Ex:  bash packaging/build-deb.sh 3.0.0                        ║
# ║  Debug: bash -x packaging/build-deb.sh 3.0.0 |& tee build.log ║
# ╚══════════════════════════════════════════════════════════════════╝

set -euo pipefail

VERSION="${1:-3.0.0}"
NODE_VERSION="22.16.0"
ARCH="x64"
PKG_NAME="flowpulse"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${PROJECT_ROOT}/build/${PKG_NAME}_${VERSION}"
DEB_FILE="${PROJECT_ROOT}/build/${PKG_NAME}_${VERSION}_amd64.deb"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

die() { echo -e "${RED}❌ ERRO: $1${NC}" >&2; exit 1; }

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════╗"
echo "║   FlowPulse .deb Builder — v${VERSION}              ║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

cd "$PROJECT_ROOT"

# ═══════════════════════════════════════════════════
# 0. VALIDAR DEPENDÊNCIAS DE BUILD
# ═══════════════════════════════════════════════════
echo -e "${CYAN}[0/6] Validando ambiente de build...${NC}"

for cmd in node npm curl tar dpkg-deb; do
  command -v "$cmd" >/dev/null 2>&1 || die "'$cmd' não encontrado. Instale antes de continuar."
done

NODE_BUILD_VERSION=$(node -v)
echo -e "  node: ${GREEN}${NODE_BUILD_VERSION}${NC}"
echo -e "  npm:  ${GREEN}$(npm -v)${NC}"

# Verificar se xz está disponível (para descompactar Node runtime)
command -v xz >/dev/null 2>&1 || command -v unxz >/dev/null 2>&1 || \
  die "'xz-utils' não encontrado. Instale com: apt install xz-utils"

echo -e "${GREEN}✔ Ambiente validado${NC}"

# ─── Limpar build anterior ────────────────────────
rm -rf "$BUILD_DIR" "$DEB_FILE"
mkdir -p "${PROJECT_ROOT}/build"
echo -e "${YELLOW}→ Build dir: ${BUILD_DIR}${NC}"

# ═══════════════════════════════════════════════════
# 1. BUILD DO FRONTEND
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}[1/6] Compilando frontend...${NC}"

export VITE_SUPABASE_URL="http://localhost:3060"
export VITE_SUPABASE_PUBLISHABLE_KEY="flowpulse-onpremise-anon-key"

# Usar npm ci se package-lock.json existe, senão npm install
if [ -f "package-lock.json" ]; then
  echo -e "  ${YELLOW}→ npm ci (determinístico via lockfile)${NC}"
  npm ci || die "npm ci falhou. Verifique package-lock.json e dependências."
else
  echo -e "  ${YELLOW}→ npm install (sem lockfile — gerando)${NC}"
  npm install || die "npm install falhou. Verifique dependências."
fi

npm run build || die "npm run build falhou. Verifique erros do Vite acima."

# Validar que dist/ foi gerado
[ -d "dist" ] && [ -f "dist/index.html" ] || die "Build não gerou dist/index.html"

echo -e "${GREEN}✔ Frontend compilado ($(find dist -type f | wc -l) arquivos)${NC}"

# ═══════════════════════════════════════════════════
# 2. PREPARAR BACKEND (server + deps)
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}[2/6] Preparando backend...${NC}"

SRVTMP=$(mktemp -d)
trap 'rm -rf "$SRVTMP" "$NODETMP" 2>/dev/null' EXIT

cp deploy/server.js "$SRVTMP/" || die "deploy/server.js não encontrado"
cp deploy/schema_cblabs_full.sql "$SRVTMP/schema.sql" || die "deploy/schema_cblabs_full.sql não encontrado"

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
npm install --omit=dev --ignore-scripts || die "Falha ao instalar deps do backend"
cd "$PROJECT_ROOT"

# Validar que express está presente
[ -d "$SRVTMP/node_modules/express" ] || die "express não instalado no backend"

echo -e "${GREEN}✔ Backend preparado ($(du -sh "$SRVTMP/node_modules" | awk '{print $1}') de deps)${NC}"

# ═══════════════════════════════════════════════════
# 3. BAIXAR NODE.JS RUNTIME EMBUTIDO
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}[3/6] Obtendo Node.js ${NODE_VERSION} runtime...${NC}"

NODE_TAR="node-v${NODE_VERSION}-linux-${ARCH}.tar.xz"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TAR}"
NODE_CACHE="/tmp/${NODE_TAR}"

if [ -f "$NODE_CACHE" ]; then
  echo -e "  ${GREEN}✔${NC} Usando cache: ${NODE_CACHE}"
else
  echo -e "  ${YELLOW}→ Baixando ${NODE_URL}...${NC}"
  curl -fSL -o "$NODE_CACHE" "$NODE_URL" || die "Falha ao baixar Node.js ${NODE_VERSION}"
fi

NODETMP=$(mktemp -d)
tar -xJf "$NODE_CACHE" -C "$NODETMP" --strip-components=1 || die "Falha ao extrair Node.js"

# Validar binário
"$NODETMP/bin/node" -v >/dev/null 2>&1 || die "Binário Node.js inválido"
EMBEDDED_V=$("$NODETMP/bin/node" -v)

# Gerar PROVENANCE para compliance
NODE_SHA256=$(sha256sum "$NODE_CACHE" | awk '{print $1}')
cat > "$NODETMP/PROVENANCE" <<EOF
node_version=${NODE_VERSION}
node_binary_version=${EMBEDDED_V}
source=${NODE_URL}
sha256=${NODE_SHA256}
downloaded_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
built_by=$(whoami)@$(hostname)
EOF

echo -e "${GREEN}✔ Node.js ${EMBEDDED_V} obtido (sha256: ${NODE_SHA256:0:16}...)${NC}"

# ═══════════════════════════════════════════════════
# 4. MONTAR ÁRVORE DO PACOTE
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}[4/6] Montando árvore do pacote...${NC}"

# DEBIAN
mkdir -p "$BUILD_DIR/DEBIAN"
for f in control conffiles postinst prerm postrm; do
  src="packaging/DEBIAN/$f"
  [ -f "$src" ] || die "Faltando: $src"
  cp "$src" "$BUILD_DIR/DEBIAN/"
done

sed -i "s/^Version:.*/Version: ${VERSION}/" "$BUILD_DIR/DEBIAN/control"
chmod 755 "$BUILD_DIR/DEBIAN/postinst" "$BUILD_DIR/DEBIAN/prerm" "$BUILD_DIR/DEBIAN/postrm"

# Frontend → /usr/share/flowpulse/web (read-only)
mkdir -p "$BUILD_DIR/usr/share/flowpulse/web"
cp -a dist/* "$BUILD_DIR/usr/share/flowpulse/web/"

# Backend → /usr/lib/flowpulse/server (read-only)
mkdir -p "$BUILD_DIR/usr/lib/flowpulse/server"
cp -a "$SRVTMP/"* "$BUILD_DIR/usr/lib/flowpulse/server/"

# Node runtime → /opt/flowpulse/node (read-only)
mkdir -p "$BUILD_DIR/opt/flowpulse/node"
cp -a "$NODETMP/bin" "$BUILD_DIR/opt/flowpulse/node/"
cp -a "$NODETMP/lib" "$BUILD_DIR/opt/flowpulse/node/"
cp "$NODETMP/PROVENANCE" "$BUILD_DIR/opt/flowpulse/node/"
# Manter só o binário principal
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
echo -e "\n${CYAN}[5/6] Gerando pacote .deb...${NC}"

INSTALLED_SIZE=$(du -sk "$BUILD_DIR" | awk '{print $1}')
sed -i "/^Description:/i Installed-Size: ${INSTALLED_SIZE}" "$BUILD_DIR/DEBIAN/control"

dpkg-deb --root-owner-group --build "$BUILD_DIR" "$DEB_FILE" || die "dpkg-deb falhou"

# ═══════════════════════════════════════════════════
# 6. VALIDAR ARTEFATO
# ═══════════════════════════════════════════════════
echo -e "\n${CYAN}[6/6] Validando artefato...${NC}"

[ -f "$DEB_FILE" ] || die "Arquivo .deb não gerado em $DEB_FILE"

DEB_SIZE=$(du -sh "$DEB_FILE" | awk '{print $1}')
DEB_TYPE=$(file -b "$DEB_FILE" | head -c 40)

echo -e "  Arquivo:  ${GREEN}${DEB_FILE}${NC}"
echo -e "  Tamanho:  ${GREEN}${DEB_SIZE}${NC}"
echo -e "  Tipo:     ${GREEN}${DEB_TYPE}${NC}"

# Gerar SHA256
cd "${PROJECT_ROOT}/build"
sha256sum "$(basename "$DEB_FILE")" > SHA256SUMS
echo -e "  SHA256:   ${GREEN}$(cat SHA256SUMS)${NC}"
cd "$PROJECT_ROOT"

# Verificar conteúdo crítico
echo -e "\n  Conteúdo do pacote:"
dpkg-deb -c "$DEB_FILE" | grep -E '(node$|server\.js|index\.html|flowpulse\.env|flowpulse\.service)' | \
  while read -r line; do echo -e "    ${GREEN}✔${NC} $line"; done

echo -e "\n${GREEN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   ✅ PACOTE GERADO E VALIDADO!                               ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║   ${DEB_FILE}"
echo "║   ${DEB_SIZE} — Node.js ${EMBEDDED_V} embutido"
echo "║                                                              ║"
echo "║   Instalar no Debian 13:                                     ║"
echo "║     scp ${DEB_FILE} root@servidor:/tmp/"
echo "║     ssh root@servidor 'apt install /tmp/$(basename "$DEB_FILE")'"
echo "║                                                              ║"
echo "║   Verificar integridade:                                     ║"
echo "║     sha256sum -c build/SHA256SUMS                            ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
