# FlowPulse — Edge Functions (Deno)

> Inventário completo das 20 Edge Functions.
> Data: 2026-02-26

---

## Resumo

| # | Função | verify_jwt | Secrets Necessários | Deps Externas | Tabelas Acessadas |
|---|--------|-----------|---------------------|---------------|-------------------|
| 1 | `alert-ingest` | false | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FLOWPULSE_WEBHOOK_TOKEN | — | alert_rules, alert_instances, alert_events, alert_notifications, maintenance_windows, maintenance_scopes |
| 2 | `alert-escalation-worker` | false | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID | api.telegram.org | alert_notifications, notification_channels, escalation_steps |
| 3 | `bgp-collector` | false | SUPABASE_URL, SUPABASE_ANON_KEY | — (recebe dados via POST) | — (Realtime broadcast only) |
| 4 | `billing-cron` | false | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY | — | billing_logs, printer_configs |
| 5 | `cto-status-aggregator` | false | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ZABBIX_ENCRYPTION_KEY | Zabbix API (externo) | flow_map_ctos, flow_map_hosts, zabbix_connections |
| 6 | `flowmap-route` | false | — | router.project-osrm.org (externo) | — |
| 7 | `flowmap-status` | false | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ZABBIX_ENCRYPTION_KEY | Zabbix API (externo) | flow_map_hosts, flow_map_links, flow_map_link_items, flow_map_effective_cache, zabbix_connections |
| 8 | `flowpulse-reactor` | false | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN | Upstash Redis (externo) | dashboards, widgets |
| 9 | `invite-user` | false | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY | — | profiles, user_roles (via admin API auth.admin.createUser) |
| 10 | `printer-status` | false | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ZABBIX_ENCRYPTION_KEY | Zabbix API (externo) | printer_configs, zabbix_connections |
| 11 | `rms-connections` | false | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ZABBIX_ENCRYPTION_KEY | — | rms_connections |
| 12 | `rms-fueling` | false | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, RMS_FUELING_API_TOKEN | RMS API (externo) | rms_connections |
| 13 | `seed-admin` | false | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY | — | profiles, user_roles (via auth.admin) |
| 14 | `system-status` | false | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY | — | (DB size query) |
| 15 | `telegram-bot` | false | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID | api.telegram.org | alert_instances |
| 16 | `telemetry-wizard` | false | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ZABBIX_ENCRYPTION_KEY | — | telemetry_config |
| 17 | `webhook-token-manage` | false | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY | — | webhook_tokens |
| 18 | `zabbix-connections` | false | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ZABBIX_ENCRYPTION_KEY | Zabbix API (externo, para test) | zabbix_connections |
| 19 | `zabbix-poller` | false | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ZABBIX_ENCRYPTION_KEY | Zabbix API (externo) | dashboards, widgets, zabbix_connections |
| 20 | `zabbix-proxy` | false | SUPABASE_URL, SUPABASE_ANON_KEY, ZABBIX_ENCRYPTION_KEY | Zabbix API (externo) | zabbix_connections |
| — | `zabbix-webhook` | false | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY | — | webhook_tokens, alert_rules (via alert-ingest) |

---

## Detalhes por Função

### 1. `alert-ingest`
- **Endpoint**: POST `/functions/v1/alert-ingest`
- **Auth**: Webhook token (via `X-Webhook-Token` ou `Authorization: Bearer`)
- **Função**: Processa eventos Zabbix, aplica regras de alerta, cria/atualiza alert_instances, respeita janelas de manutenção
- **RPCs usadas**: `verify_webhook_token()`, `is_in_maintenance()`, `bump_telemetry_heartbeat()`
- **Realtime**: Broadcast em canal `tenant:{tenant_id}` com evento `ALERT_UPDATE`

### 2. `alert-escalation-worker`
- **Endpoint**: POST `/functions/v1/alert-escalation-worker`
- **Auth**: Sem auth (chamado por pg_cron ou externamente)
- **Função**: Envia notificações pendentes (Telegram, webhook) baseado em escalation_steps

### 3. `bgp-collector`
- **Endpoint**: GET/POST `/functions/v1/bgp-collector`
- **Auth**: apikey header
- **Função**: Recebe dados BGP do script coletor (ne8000-bgp-collector.sh), faz broadcast via Realtime

### 4. `flowpulse-reactor`
- **Endpoint**: POST `/functions/v1/flowpulse-reactor` (poll), GET `?replay=1` (replay)
- **Auth**: Bearer token (session) para poll; anon key para replay
- **Função**: Recebe dados do zabbix-poller, armazena em Redis (micro-cache 8s), faz broadcast para dashboards
- **Dep externa**: Upstash Redis

### 5. `zabbix-proxy`
- **Endpoint**: POST `/functions/v1/zabbix-proxy`
- **Auth**: Bearer token (session auth validada via claims)
- **Função**: Proxy seguro para Zabbix JSON-RPC. Decripta senhas AES-GCM, whitelist de métodos
- **Métodos permitidos**: host.get, hostgroup.get, item.get, history.get, trigger.get, problem.get, event.get, template.get, application.get, graph.get, trend.get, dashboard.get

### 6. `zabbix-poller`
- **Endpoint**: POST `/functions/v1/zabbix-poller`
- **Auth**: Bearer token (session)
- **Função**: Polling em lote de dados Zabbix para todos os widgets de um dashboard. Envia resultado ao flowpulse-reactor para broadcast

### 7. `flowmap-status`
- **Endpoint**: POST `/functions/v1/flowmap-status`
- **Auth**: Bearer token (session)
- **Função**: Atualiza `current_status` dos hosts no mapa baseado em triggers do Zabbix. Persiste em flow_map_hosts e cache

### 8. `flowmap-route`
- **Endpoint**: POST `/functions/v1/flowmap-route`
- **Auth**: Sem auth específica
- **Função**: Calcula rota geográfica entre dois pontos via OSRM
- **Dep externa**: router.project-osrm.org (pode ser substituído por OSRM local)

### 9. `cto-status-aggregator`
- **Endpoint**: POST `/functions/v1/cto-status-aggregator`
- **Auth**: Bearer token (session)
- **Função**: Agrega status de OLTs e atualiza CTOs baseado em triggers Zabbix

### 10. `invite-user`
- **Endpoint**: POST `/functions/v1/invite-user`
- **Auth**: Bearer token (session, admin only)
- **Função**: Cria usuário via `auth.admin.createUser`, associa a tenant com role

### 11-20. (Demais funções seguem padrão similar — ver tabela resumo acima)

---

## Dependências Externas das Edge Functions

| Serviço Externo | Funções que Usam | Substituível On-Prem? |
|----------------|------------------|----------------------|
| **Zabbix API** | zabbix-proxy, zabbix-poller, zabbix-connections, flowmap-status, cto-status-aggregator, printer-status | N/A (é o próprio Zabbix do cliente) |
| **Upstash Redis** | flowpulse-reactor | Sim → Redis local |
| **OSRM** | flowmap-route | Sim → OSRM container local |
| **Telegram API** | alert-escalation-worker, telegram-bot | Requer internet (exceto bot local) |
| **RMS API** | rms-fueling | Rede interna do cliente |
