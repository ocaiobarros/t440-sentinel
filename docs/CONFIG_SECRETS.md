# FlowPulse — Variáveis de Ambiente e Secrets

> Data: 2026-02-26

---

## 1. Frontend (Vite — build time)

| Variável | Obrigatória | Exemplo | Descrição |
|----------|------------|---------|-----------|
| `VITE_SUPABASE_URL` | ✅ | `http://localhost:8000` | URL do gateway Supabase (Kong) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | `eyJ...` | Anon key do projeto Supabase |
| `VITE_SUPABASE_PROJECT_ID` | ⚠️ Parcial | `wbtpefszwywgmnqssrgx` | Usado em 2 locais para construir URLs (BGP, Telegram). **Pode ser eliminada** se refatorar para usar VITE_SUPABASE_URL |

**Como gerar on-prem**: A anon key é gerada pelo `supabase init` ou Docker setup. Copiar do output do `docker compose up`.

---

## 2. Edge Functions (Deno — runtime secrets)

| Secret | Obrigatória | Como Gerar | Usada por |
|--------|------------|-----------|-----------|
| `SUPABASE_URL` | ✅ | Auto-injetada pelo Supabase | Todas as 20 funções |
| `SUPABASE_ANON_KEY` | ✅ | Auto-injetada pelo Supabase | 10+ funções |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Auto-injetada pelo Supabase | 15+ funções (admin ops) |
| `SUPABASE_DB_URL` | ❌ | Auto-injetada | system-status (query direto) |
| `ZABBIX_ENCRYPTION_KEY` | ✅ | `openssl rand -hex 32` | zabbix-proxy, zabbix-poller, zabbix-connections, flowmap-status, cto-status-aggregator, printer-status, rms-connections, telemetry-wizard |
| `FLOWPULSE_WEBHOOK_TOKEN` | ✅ | `openssl rand -hex 32` | alert-ingest (autenticar webhooks Zabbix) |
| `TELEGRAM_BOT_TOKEN` | ❌ Opcional | Criar bot via @BotFather | alert-escalation-worker, telegram-bot, telemetry-wizard |
| `TELEGRAM_CHAT_ID` | ❌ Opcional | Obter via getUpdates do bot | alert-escalation-worker, telegram-bot |
| `RMS_FUELING_API_TOKEN` | ❌ Opcional | Fornecido pelo RMS Group | rms-fueling |
| `UPSTASH_REDIS_REST_URL` | ⚠️ Recomendada | Criar em upstash.com ou Redis local | flowpulse-reactor |
| `UPSTASH_REDIS_REST_TOKEN` | ⚠️ Recomendada | Mesmo acima | flowpulse-reactor |
| `LOVABLE_API_KEY` | ❌ | Específica da plataforma Lovable | (não usada on-prem) |
| `SUPABASE_PUBLISHABLE_KEY` | ❌ | Alias de ANON_KEY | (redundante) |

---

## 3. On-Premise Express Server (deploy/server.js)

| Variável | Obrigatória | Exemplo | Descrição |
|----------|------------|---------|-----------|
| `PORT` | ✅ | `3060` | Porta do servidor Express |
| `DB_HOST` | ✅ | `127.0.0.1` | Host PostgreSQL |
| `DB_PORT` | ✅ | `5432` | Porta PostgreSQL |
| `DB_NAME` | ✅ | `flowpulsedb` | Nome do banco |
| `DB_USER` | ✅ | `flowpulse` | Usuário PostgreSQL |
| `DB_PASS` | ✅ | `openssl rand -hex 16` | Senha PostgreSQL |
| `JWT_SECRET` | ✅ | `openssl rand -hex 32` | Chave HMAC para assinar JWTs |
| `JWT_EXPIRY` | ✅ | `24h` | Expiração do token |
| `STATIC_DIR` | ✅ | `/usr/share/flowpulse/web` | Diretório dos assets compilados |
| `STORAGE_DIR` | ✅ | `/var/lib/flowpulse/data` | Diretório de storage local |
| `ZABBIX_ENCRYPTION_KEY` | ✅ | `openssl rand -hex 32` | Mesma chave usada nas edge functions |
| `AUTO_MIGRATE` | ❌ | `0` | Aplicar schema automaticamente no boot |

---

## 4. Secrets que NÃO são necessários on-prem

| Secret | Motivo |
|--------|--------|
| `LOVABLE_API_KEY` | Específica da plataforma Lovable |
| `SUPABASE_PUBLISHABLE_KEY` | Alias redundante, usar ANON_KEY |

---

## 5. Checklist de Geração de Secrets

```bash
# Gerar todas as chaves necessárias para deploy on-prem
echo "ZABBIX_ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "FLOWPULSE_WEBHOOK_TOKEN=$(openssl rand -hex 32)"
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "DB_PASS=$(openssl rand -hex 16)"

# Para Supabase self-hosted, as chaves JWT são geradas pelo setup:
# Ver: https://supabase.com/docs/guides/self-hosting/docker
# ANON_KEY e SERVICE_ROLE_KEY são derivadas do JWT_SECRET do Supabase
```
