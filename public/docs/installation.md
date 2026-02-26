# FlowPulse Intelligence — Guia de Instalação On-Premise

**© 2026 CBLabs — Versão 3.0 (Hardened)**

Instalação completa do FlowPulse em servidores Debian 13 (Trixie) para operação 100% local, sem dependência de nuvem.

---

## Requisitos do Sistema

| Componente    | Mínimo Recomendado              |
|---------------|--------------------------------|
| **OS**        | Debian 13 (Trixie)             |
| **CPU**       | 2 vCPUs                        |
| **RAM**       | 4 GB                           |
| **Disco**     | 20 GB livres                   |
| **Node.js**   | v20 LTS (repo Debian)          |
| **PostgreSQL**| 15+                            |
| **Nginx**     | 1.22+                          |

> ⚠️ **Node.js 20 LTS entra em EOL em 30/04/2026.** Planeje migração para Node 22 LTS antes dessa data.

---

## Passo 0 — Preparar o Servidor

```bash
apt update && apt upgrade -y
apt install -y git nginx postgresql postgresql-contrib ca-certificates curl sudo
```

---

## Passo 1 — Instalar Node.js (repositório Debian)

O Debian 13 já entrega Node.js 20.x nos repositórios oficiais. **Não use NodeSource.**

```bash
apt install -y nodejs npm
node -v   # Deve exibir v20.x.x
npm -v
```

---

## Passo 2 — Configurar PostgreSQL

```bash
sudo -u postgres psql <<'SQL'
CREATE USER flowpulse WITH PASSWORD 'SUA_SENHA_FORTE_AQUI';
CREATE DATABASE flowpulsedb OWNER flowpulse;
\c flowpulsedb
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
SQL
```

> Use uma senha com pelo menos 12 caracteres.

---

## Passo 3 — Criar Usuário de Serviço

O serviço **nunca** roda como root.

```bash
adduser --system --group --home /opt/flowpulse --shell /usr/sbin/nologin flowpulse

mkdir -p /opt/flowpulse /var/lib/flowpulse/data
chown -R flowpulse:flowpulse /opt/flowpulse /var/lib/flowpulse
chmod 750 /opt/flowpulse /var/lib/flowpulse
```

---

## Passo 4 — Clonar e Compilar o Frontend

```bash
cd /root
git clone https://github.com/ocaiobarros/FlowPulse.git
cd FlowPulse

# Substitua pelo IP real do servidor na rede
export VITE_SUPABASE_URL="http://SEU_IP:3060"
export VITE_SUPABASE_PUBLISHABLE_KEY="flowpulse-onpremise-anon-key"

npm ci
npm run build
```

> As variáveis `VITE_SUPABASE_*` são necessárias porque o frontend usa o cliente Supabase JS, que é redirecionado para o servidor Express local.

---

## Passo 5 — Deploy do Backend + Frontend

```bash
cp deploy/server.js /opt/flowpulse/server.js
cp -r dist/ /opt/flowpulse/dist/
chown -R flowpulse:flowpulse /opt/flowpulse
```

---

## Passo 6 — Instalar Dependências do Backend

```bash
cat > /opt/flowpulse/package.json <<'EOF'
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
    "dotenv": "^16.4.5"
  }
}
EOF

cd /opt/flowpulse
sudo -u flowpulse npm install --omit=dev
```

---

## Passo 7 — Configurar Variáveis de Ambiente

```bash
# Gerar secrets fortes automaticamente
JWT_SECRET="$(openssl rand -hex 32)"
ZABBIX_KEY="$(openssl rand -hex 32)"

cat > /opt/flowpulse/.env <<EOF
PORT=3060
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=flowpulsedb
DB_USER=flowpulse
DB_PASS=SUA_SENHA_FORTE_AQUI
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRY=24h
STORAGE_DIR=/var/lib/flowpulse/data
STATIC_DIR=/opt/flowpulse/dist
ZABBIX_ENCRYPTION_KEY=${ZABBIX_KEY}
EOF

chown flowpulse:flowpulse /opt/flowpulse/.env
chmod 600 /opt/flowpulse/.env
```

> O `.env` fica com permissão **600** — só o usuário `flowpulse` pode ler.

---

## Passo 8 — Aplicar Schema do Banco

```bash
cd /root/FlowPulse
PGPASSWORD="SUA_SENHA_FORTE_AQUI" psql -h 127.0.0.1 -U flowpulse -d flowpulsedb \
  -f deploy/schema_cblabs_full.sql
```

---

## Passo 9 — Criar Serviço systemd (com Hardening)

```bash
cat > /etc/systemd/system/flowpulse.service <<'EOF'
[Unit]
Description=FlowPulse Intelligence Server
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=flowpulse
Group=flowpulse
WorkingDirectory=/opt/flowpulse
Environment=NODE_ENV=production
EnvironmentFile=/opt/flowpulse/.env
ExecStart=/usr/bin/node /opt/flowpulse/server.js
Restart=always
RestartSec=3

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/flowpulse /opt/flowpulse
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
LockPersonality=true
MemoryDenyWriteExecute=true
RestrictSUIDSGID=true
RestrictNamespaces=true
RestrictRealtime=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now flowpulse
```

---

## Passo 10 — Configurar Nginx

```bash
cat > /etc/nginx/sites-available/flowpulse <<'NGINX'
server {
    listen 80;
    server_name _;

    client_max_body_size 20M;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

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
nginx -t && systemctl restart nginx
systemctl enable nginx
```

---

## Passo 11 — Verificar Instalação

```bash
# Status dos serviços
systemctl status flowpulse --no-pager -l
systemctl status nginx --no-pager

# Verificar portas
ss -tlnp | grep -E ':80|:3060'

# Testar resposta do servidor
curl -i http://127.0.0.1:3060/ | head

# Testar autenticação
curl -s -X POST 'http://localhost:3060/auth/v1/token?grant_type=password' \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@flowpulse.local","password":"admin@123"}'
```

---

## Credenciais Padrão

| Campo | Valor |
|-------|-------|
| **Usuário** | `admin@flowpulse.local` |
| **Senha** | `admin@123` |

> ⚠️ **TROQUE A SENHA NO PRIMEIRO ACESSO!** Credenciais padrão são um risco de segurança.

---

## Configurar HTTPS (Recomendado para Produção)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d flowpulse.seudominio.com.br
certbot renew --dry-run
```

---

## Firewall (Recomendado)

```bash
apt install -y ufw
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable
```

> Não exponha a porta 3060 externamente — o Nginx faz o proxy.

---

## Gestão do Serviço

```bash
systemctl status flowpulse          # Status
systemctl restart flowpulse         # Reiniciar
systemctl stop flowpulse            # Parar
journalctl -u flowpulse -f          # Logs em tempo real
journalctl -u flowpulse -n 100      # Últimas 100 linhas
```

---

## Atualizar para Nova Versão

```bash
cd /root/FlowPulse
git pull origin main

export VITE_SUPABASE_URL="http://SEU_IP:3060"
export VITE_SUPABASE_PUBLISHABLE_KEY="flowpulse-onpremise-anon-key"
npm ci && npm run build

cp -r dist/ /opt/flowpulse/dist/
cp deploy/server.js /opt/flowpulse/server.js
chown -R flowpulse:flowpulse /opt/flowpulse
systemctl restart flowpulse
```

### Atualizar Schema (se houver novas tabelas):

```bash
PGPASSWORD="SUA_SENHA" psql -h 127.0.0.1 -U flowpulse -d flowpulsedb \
  -f /root/FlowPulse/deploy/schema_cblabs_full.sql
```

---

## Backup do Banco

```bash
# Backup completo
PGPASSWORD="SUA_SENHA" pg_dump -h 127.0.0.1 -U flowpulse -d flowpulsedb \
  -F c -f /backup/flowpulse_$(date +%Y%m%d).dump

# Restaurar
pg_restore -h 127.0.0.1 -U flowpulse -d flowpulsedb -c /backup/flowpulse_YYYYMMDD.dump
```

### Cron para backup diário (3h da manhã):

```bash
crontab -e
# Adicionar:
0 3 * * * PGPASSWORD="SUA_SENHA" pg_dump -h 127.0.0.1 -U flowpulse -d flowpulsedb -F c -f /backup/flowpulse_$(date +\%Y\%m\%d).dump
```

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Módulos não aparecem | `systemctl status flowpulse` + verificar `.env` |
| 502 Bad Gateway | `ss -tlnp \| grep 3060` — se vazio, `systemctl restart flowpulse` |
| Banco não conecta | `systemctl status postgresql` + testar `psql` manual |
| Login não funciona | Verificar se schema foi aplicado e admin existe |
| `MODULE_NOT_FOUND` | `cd /opt/flowpulse && sudo -u flowpulse npm install --omit=dev` |

---

## Decisões Estratégicas

| Decisão | Ação |
|---------|------|
| Node.js 20 EOL (30/04/2026) | Migrar para Node 22 LTS antes da data |
| HTTPS | Configurar Certbot antes de expor à internet |
| Backups | Ativar cron de backup diário no dia 1 |

---

## Suporte

- **Telegram**: [@flowpulselabsbot](https://t.me/flowpulselabsbot)
- **WhatsApp**: [+55 67 99290-3040](https://wa.me/5567992903040)
- **E-mail**: flowpulselabs@gmail.com

---

*FLOWPULSE INTELLIGENCE | Desenvolvido por CBLabs*
