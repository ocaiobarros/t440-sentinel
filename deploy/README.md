# FLOWPULSE INTELLIGENCE — Deployment On-Premise

**© 2026 CBLabs**

## Estrutura do Pacote

```
deploy/
├── server.js                 # Backend Express (substitui Supabase)
├── schema_cblabs_full.sql    # Schema PostgreSQL completo + seed admin
├── install.sh                # Instalador interativo para Debian 13
├── .env.example              # Template de variáveis de ambiente
└── README.md                 # Este arquivo
```

## Requisitos

| Componente   | Versão Mínima       |
|-------------|---------------------|
| **OS**      | Debian 13 / Ubuntu 22.04+ |
| **Node.js** | v20 LTS             |
| **PostgreSQL** | 15+              |
| **Nginx**   | 1.22+               |
| **RAM**     | 4 GB                |
| **Disco**   | 20 GB livres        |

## Instalação Rápida

```bash
# 1. Build do frontend (na máquina de desenvolvimento)
npm run build
cp -r dist/ deploy/dist/

# 2. Copiar pacote para o servidor
scp -r deploy/ root@seu-servidor:/tmp/flowpulse-deploy/

# 3. No servidor
cd /tmp/flowpulse-deploy
sudo bash install.sh
```

O instalador irá:
1. Detectar e instalar dependências (Node.js, PostgreSQL, Nginx)
2. Solicitar credenciais do banco interativamente
3. Provisionar o schema com o admin seed (`admin / admin`)
4. Configurar o serviço systemd e o reverse proxy Nginx
5. Iniciar o FlowPulse na porta **3060**

## Gestão do Serviço

```bash
# Status
sudo systemctl status flowpulse

# Logs em tempo real
sudo journalctl -u flowpulse -f

# Reiniciar
sudo systemctl restart flowpulse

# Parar
sudo systemctl stop flowpulse
```

## Atualização

```bash
# 1. Build novo frontend
npm run build

# 2. Copiar para o servidor
scp -r dist/ root@servidor:/opt/flowpulse/dist/

# 3. Reiniciar
sudo systemctl restart flowpulse
```

## Armazenamento

Arquivos (avatares, logos) são salvos em `/var/lib/flowpulse/data/` organizados por bucket.

## Segurança

- **Troque a senha do admin** no primeiro acesso
- O `JWT_SECRET` é gerado automaticamente pelo instalador
- Recomenda-se configurar HTTPS via certbot/Let's Encrypt
- Credenciais do banco NÃO são expostas ao frontend

## Suporte

- **Telegram**: [@flowpulselabsbot](https://t.me/flowpulselabsbot)
- **WhatsApp**: [+55 67 99290-3040](https://wa.me/5567992903040)
- **E-mail**: flowpulselabs@gmail.com
