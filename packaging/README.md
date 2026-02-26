# FlowPulse — Produto On-Premise (Pacote Debian)

## Visão Geral

O FlowPulse é distribuído como um pacote `.deb` **autossuficiente** para servidores Debian 13+ (Trixie).

O servidor do cliente **não precisa de**:
- Git
- Node.js / npm / bun
- Acesso à internet
- Compilação de qualquer tipo

O pacote inclui tudo que é necessário pré-compilado:

| Componente | Caminho no servidor | Descrição |
|---|---|---|
| Frontend React | `/usr/share/flowpulse/web/` | SPA compilada (servida pelo Nginx) |
| Backend Express | `/usr/lib/flowpulse/server/` | API + `node_modules` pré-instalados |
| Node.js 22 LTS | `/opt/flowpulse/node/` | Runtime embutido (não usa node do sistema) |
| Config | `/etc/flowpulse/flowpulse.env` | Conffile preservado em upgrades |
| systemd | `/lib/systemd/system/flowpulse.service` | Serviço com hardening completo |
| Nginx | `/etc/nginx/sites-available/flowpulse` | Split estático + proxy API |

## Pré-requisitos no servidor

Apenas pacotes do Debian (instalados automaticamente via `Depends:`):

```bash
apt install nginx postgresql systemd
```

## Instalação

```bash
# 1. Copie o .deb para o servidor
scp flowpulse_3.0.0_amd64.deb root@servidor:/tmp/

# 2. Verifique a integridade
sha256sum -c SHA256SUMS

# 3. Instale
dpkg -i /tmp/flowpulse_3.0.0_amd64.deb || apt -f install -y

# 4. Verifique o serviço
systemctl status flowpulse
```

Pronto. O `postinst` faz automaticamente:
1. Cria usuário de serviço `flowpulse`
2. Gera secrets (JWT, DB password, Zabbix key) — **apenas na primeira instalação**
3. Cria banco PostgreSQL + extensões (se DB local)
4. Habilita e inicia o serviço via systemd
5. Configura Nginx (split estático + API proxy)

## Upgrade

```bash
dpkg -i flowpulse_3.1.0_amd64.deb
```

O `/etc/flowpulse/flowpulse.env` é marcado como **conffile** — o `dpkg` pergunta antes de sobrescrever. Secrets nunca são regenerados em upgrade.

## Migrations de banco

Por padrão, `AUTO_MIGRATE=0` (seguro para enterprise). O schema **não** é aplicado automaticamente em upgrades.

Para aplicar manualmente:
```bash
source /etc/flowpulse/flowpulse.env
PGPASSWORD=$DB_PASS psql -h 127.0.0.1 -U $DB_USER -d $DB_NAME \
  -f /usr/lib/flowpulse/server/schema.sql
```

Para habilitar migrations automáticas:
```bash
sed -i 's/AUTO_MIGRATE=0/AUTO_MIGRATE=1/' /etc/flowpulse/flowpulse.env
```

## Remoção

```bash
# Remove binários, mantém dados e config
apt remove flowpulse

# Remove tudo (dados, config, usuário)
apt purge flowpulse
```

## Build do pacote (apenas para desenvolvedores)

### Via CI (GitHub Actions) — recomendado

O workflow `.github/workflows/build-deb.yml` gera o `.deb` automaticamente:
- **Em tags `v*`**: cria Release no GitHub com `.deb` + `SHA256SUMS`
- **Manual**: via `workflow_dispatch` informando a versão

### Build local

**Pré-requisitos de build** (não são necessários no servidor do cliente):
```bash
apt install -y nodejs npm xz-utils build-essential dpkg-dev
```

```bash
# package-lock.json DEVE estar commitado e sincronizado
npm install   # gera/atualiza lockfile se necessário
bash packaging/build-deb.sh 3.0.0
ls -lh build/*.deb
```

O build usa **`npm ci`** (determinístico). Se `package-lock.json` estiver fora de sincronia com `package.json`, o build **falha** com erro claro.

## Arquitetura

```
┌─────────────────────────────────────────────────────┐
│                     Nginx :80                       │
│  ┌──────────────┐    ┌────────────────────────────┐ │
│  │ /assets/*    │    │ /auth/ /rest/ /functions/  │ │
│  │ Static files │    │ /storage/ /realtime/       │ │
│  │ (cache 1y)   │    │ → proxy 127.0.0.1:3060    │ │
│  └──────┬───────┘    └────────────┬───────────────┘ │
│         │                         │                  │
│  /usr/share/flowpulse/web    /opt/flowpulse/node     │
│                               + /usr/lib/flowpulse   │
│                                       │              │
│                              PostgreSQL :5432        │
│                              /var/lib/flowpulse      │
└─────────────────────────────────────────────────────┘
```

## Segurança

- Serviço roda como usuário `flowpulse` (não-root)
- systemd: `ProtectSystem=strict`, `NoNewPrivileges=true`, `PrivateTmp=true`
- Apenas `/var/lib/flowpulse` é gravável pelo serviço
- Config com permissão `600` (root:flowpulse)
- Node.js embutido com `PROVENANCE` (hash, origem, data)
- Nginx com security headers (CSP, X-Frame-Options, etc.)
