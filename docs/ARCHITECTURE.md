# FlowPulse Intelligence — Arquitetura do Sistema

> Documento gerado para planejamento de migração on-premise.
> Data: 2026-02-26

---

## 1. Visão Macro

```
┌─────────────────────────────────────────────────────────────────┐
│                       FRONTEND (React 18 + Vite)                │
│  SPA servida como assets estáticos (dist/)                      │
│  Comunicação exclusiva via @supabase/supabase-js SDK            │
│  Variáveis: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY   │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE CLOUD (Gateway Kong)                │
│                                                                 │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ GoTrue   │ │ PostgREST │ │ Realtime │ │ Storage (S3)     │  │
│  │ Auth     │ │ REST/RPC  │ │ Broadcast│ │ dashboard-assets │  │
│  │ /auth/v1 │ │ /rest/v1  │ │ /realtime│ │ flowmap-attach.  │  │
│  └──────────┘ └───────────┘ └──────────┘ └──────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │             Edge Functions (Deno Runtime)                 │   │
│  │  20 funções em supabase/functions/*/index.ts              │   │
│  │  /functions/v1/<nome>                                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │             PostgreSQL 15 + Extensions                    │   │
│  │  25 tabelas, 63 políticas RLS, 17 funções PL/pgSQL       │   │
│  │  ENUMs: alert_status, severity_level, app_role,           │   │
│  │         link_status, cable_type, cto_capacity, cto_status │   │
│  │         notify_channel, maintenance_scope_type            │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 2. Serviços Supabase Utilizados

| Serviço | Protocolo | Uso no FlowPulse |
|---------|-----------|------------------|
| **GoTrue (Auth)** | `/auth/v1/*` | Login (email+password), reset password, signup (via invite-user), session management, JWT com `app_metadata.tenant_id` |
| **PostgREST** | `/rest/v1/*` | CRUD em 25 tabelas via `supabase.from()`. Filtros, upsert, joins implícitos via FK |
| **PostgREST RPC** | `/rest/v1/rpc/*` | 6 RPCs chamadas pelo frontend: `get_user_tenant_id`, `get_map_effective_status`, `alert_transition`, `check_viability`, `sla_sweep_breaches`, `is_super_admin` |
| **Realtime** | WebSocket | 6 canais: postgres_changes (incidents, flowmap-hosts), broadcast (dashboard telemetry, BGP, flowmap alerts, alert updates) |
| **Storage** | `/storage/v1/*` | 2 buckets públicos: `dashboard-assets` (imagens de widgets, avatares), `flowmap-attachments` (fotos de campo) |
| **Edge Functions** | `/functions/v1/*` | 20 funções Deno: proxy Zabbix, ingestão de alertas, telemetria, BGP, billing, Telegram, etc. |

## 3. Módulos do App → Dependências

| Módulo Frontend | PostgREST | RPC | Edge Functions | Realtime | Storage |
|----------------|-----------|-----|----------------|----------|---------|
| **Dashboard Builder** | dashboards, widgets | get_user_tenant_id | zabbix-proxy, zabbix-poller | broadcast (DATA_UPDATE) | dashboard-assets |
| **Dashboard View** | dashboards, widgets | — | zabbix-poller | broadcast (DATA_UPDATE) | — |
| **FlowMap** | flow_maps, flow_map_hosts, flow_map_links, flow_map_ctos, flow_map_cables, flow_map_reservas | get_map_effective_status, check_viability | zabbix-proxy, flowmap-status, flowmap-route, cto-status-aggregator | postgres_changes (hosts), broadcast (ZABBIX_WEBHOOK) | flowmap-attachments |
| **Incidents** | alert_instances, alert_events | alert_transition | alert-ingest, alert-escalation-worker | postgres_changes (alert_instances) | — |
| **SLA Governance** | sla_policies, alert_instances | sla_sweep_breaches | — | — | — |
| **BGP Monitor** | — | — | bgp-collector | broadcast (BGP_UPDATE) | — |
| **Admin Hub** | profiles, user_roles, tenants, audit_logs, flow_audit_logs, webhook_tokens, telemetry_config, telemetry_heartbeat | is_super_admin | invite-user, webhook-token-manage, telemetry-wizard, system-status | — | — |
| **Printer Intelligence** | printer_configs | — | zabbix-proxy, printer-status | — | — |
| **Fleet/RMS** | rms_connections | — | rms-connections, rms-fueling | — | — |
| **Telegram Settings** | — | — | telegram-bot, telemetry-wizard | — | — |
| **Zabbix Connections** | zabbix_connections | — | zabbix-connections | — | — |
| **User Settings** | profiles | — | — | — | dashboard-assets (avatar) |
| **Auth (Login/Reset)** | — | — | — | — | — |

## 4. Fluxo de Dados Principal

```
Zabbix Server ──webhook──▶ zabbix-webhook (Edge Fn)
                               │
                      ┌────────┴────────┐
                      ▼                 ▼
              alert-ingest        flowpulse-reactor
              (cria/atualiza      (broadcast telemetria
               alert_instances)    para dashboards)
                      │                 │
                      ▼                 ▼
              alert-escalation    Realtime Channel
              -worker             dashboard:{id}
              (envia notificações
               Telegram/webhook)
```

## 5. Segurança

- **Multi-tenant**: `jwt_tenant_id()` extrai tenant do JWT `app_metadata`
- **RLS**: 63 políticas em 25 tabelas, todas usando `jwt_tenant_id()`
- **RBAC**: 5 roles (admin, editor, tech, sales, viewer) via `has_role()` SECURITY DEFINER
- **Criptografia**: Senhas Zabbix/RMS criptografadas com AES-GCM (key em secret)
- **Webhook Auth**: Token SHA-256 hashed em `webhook_tokens`

## 6. Extensions PostgreSQL Necessárias

- `pgcrypto` (gen_random_uuid, digest para webhook tokens)
- `pg_cron` (sweep SLA breaches — se configurado)
