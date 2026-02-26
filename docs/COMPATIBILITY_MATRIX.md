# FlowPulse — Matriz de Compatibilidade de Endpoints

> Inventário completo de chamadas do frontend ao backend Supabase.
> Data: 2026-02-26

---

## 1. Auth (`/auth/v1/*`)

| Método | Path | Uso | Arquivo | Linha |
|--------|------|-----|---------|-------|
| POST | `/auth/v1/token?grant_type=password` | Login com email+senha | `src/pages/Login.tsx` | 30 |
| POST | `/auth/v1/signup` | Cadastro (via invite-user edge fn) | `supabase/functions/invite-user/index.ts` | — |
| GET | `/auth/v1/user` | Obter usuário autenticado | `src/hooks/useIncidents.ts` | 93 |
| POST | `/auth/v1/recover` | Reset de senha (enviar email) | `src/pages/ForgotPassword.tsx` | 21 |
| PUT | `/auth/v1/user` | Atualizar senha | `src/pages/ResetPassword.tsx` | 46, `src/pages/UserSettings.tsx` | 258 |
| POST | `/auth/v1/logout` | Logout | `src/hooks/useAuth.tsx` | 43 |
| GET | `/auth/v1/session` | Obter sessão atual | `src/hooks/useAuth.tsx` | 33 |
| — | `onAuthStateChange` | Listener de mudanças de auth | `src/hooks/useAuth.tsx` | 25, `src/pages/ResetPassword.tsx` | 26 |

**Headers relevantes**: `Authorization: Bearer <access_token>`, `apikey: <anon_key>`

**Response shape (session)**:
```json
{
  "access_token": "eyJ...",
  "refresh_token": "...",
  "user": {
    "id": "uuid",
    "email": "...",
    "app_metadata": { "tenant_id": "uuid" }
  }
}
```

---

## 2. PostgREST (`/rest/v1/*`)

### 2.1. Tabelas acessadas via `supabase.from()`

| Tabela | Operações | Arquivo(s) |
|--------|-----------|------------|
| `alert_instances` | SELECT | `src/hooks/useIncidents.ts:50-66` |
| `alert_events` | SELECT | `src/hooks/useIncidents.ts:76-84` |
| `alert_rules` | SELECT, INSERT, UPDATE, DELETE | `src/pages/IncidentsPage.tsx` |
| `audit_logs` | SELECT | `src/components/admin/AuditLogPanel.tsx` |
| `billing_logs` | SELECT | `src/pages/BillingHistory.tsx` |
| `dashboards` | SELECT, INSERT, UPDATE, DELETE | `src/hooks/useDashboardData.ts:45-49`, `src/hooks/useDashboardPersist.ts`, `src/pages/DashboardBuilder.tsx`, `src/pages/ModuleDashboardList.tsx` |
| `escalation_policies` | SELECT | `src/pages/IncidentsPage.tsx` |
| `escalation_steps` | SELECT | `src/pages/IncidentsPage.tsx` |
| `flow_audit_logs` | SELECT | `src/components/admin/AuditLogPanel.tsx` |
| `flow_map_cables` | SELECT, INSERT, UPDATE, DELETE | `src/hooks/useFlowMaps.ts` |
| `flow_map_ctos` | SELECT, INSERT, UPDATE, DELETE | `src/hooks/useFlowMaps.ts` |
| `flow_map_effective_cache` | SELECT | `src/hooks/useFlowMapStatus.ts` |
| `flow_map_hosts` | SELECT, INSERT, UPDATE, DELETE | `src/hooks/useFlowMaps.ts` |
| `flow_map_link_events` | SELECT | `src/hooks/useFlowMaps.ts` |
| `flow_map_link_items` | SELECT, INSERT, DELETE | `src/hooks/useFlowMaps.ts` |
| `flow_map_links` | SELECT, INSERT, UPDATE, DELETE | `src/hooks/useFlowMaps.ts` |
| `flow_map_reservas` | SELECT, INSERT, UPDATE, DELETE | `src/hooks/useFlowMaps.ts` |
| `flow_maps` | SELECT, INSERT, UPDATE, DELETE | `src/hooks/useFlowMaps.ts`, `src/pages/CapacityPage.tsx` |
| `maintenance_scopes` | SELECT, INSERT, DELETE | `src/pages/IncidentsPage.tsx` |
| `maintenance_windows` | SELECT, INSERT, UPDATE, DELETE | `src/pages/IncidentsPage.tsx` |
| `notification_channels` | SELECT | `src/pages/IncidentsPage.tsx` |
| `printer_configs` | SELECT, UPSERT | `src/pages/PrinterIntelligence.tsx` |
| `profiles` | SELECT, UPDATE | `src/hooks/useProfile.ts`, `src/hooks/useUserRole.ts`, `src/pages/UserSettings.tsx`, `src/pages/FlowMapPage.tsx` |
| `rms_connections` | SELECT | `src/hooks/useRMSConnections.ts` |
| `sla_policies` | SELECT | `src/pages/SLAGovernance.tsx` |
| `telemetry_config` | SELECT | `src/components/admin/TelemetryHealthPanel.tsx` |
| `telemetry_heartbeat` | SELECT | `src/components/admin/TelemetryHealthPanel.tsx` |
| `tenants` | SELECT, UPDATE | `src/pages/TenantsPage.tsx`, `src/pages/AdminHub.tsx` |
| `user_roles` | SELECT, INSERT, UPDATE, DELETE | `src/hooks/useUserRole.ts`, `src/pages/AdminHub.tsx` |
| `webhook_tokens` | SELECT | `src/components/admin/TelemetryHealthPanel.tsx` |
| `widgets` | SELECT, INSERT, UPDATE, DELETE | `src/hooks/useDashboardData.ts:53-57`, `src/hooks/useDashboardPersist.ts`, `src/pages/ModuleDashboardList.tsx` |
| `zabbix_connections` | SELECT | `src/hooks/useZabbixConnections.ts` |

**Headers padrão**: `Authorization: Bearer <access_token>`, `apikey: <anon_key>`, `Content-Type: application/json`, `Prefer: return=representation` (para INSERT/UPDATE com `.select()`)

---

### 2.2. RPCs (`/rest/v1/rpc/*`)

| RPC | Params | Retorno | Arquivo | Linha |
|-----|--------|---------|---------|-------|
| `get_user_tenant_id` | `{ p_user_id: uuid }` | `uuid` (text) | `src/hooks/useDashboardPersist.ts:58`, `src/pages/DashboardBuilder.tsx:255`, `src/pages/ModuleDashboardList.tsx:111` |
| `get_map_effective_status` | `{ p_map_id: uuid }` | `{ host_id, effective_status, is_root_cause, depth }[]` | `src/hooks/useFlowMapStatus.ts:109` |
| `alert_transition` | `{ p_alert_id, p_to, p_user_id, p_message }` | `void` | `src/hooks/useIncidents.ts:96` |
| `check_viability` | `{ p_lat, p_lon, p_tenant_id, p_map_id }` | `{ cto_id, cto_name, distance_m, capacity, occupied_ports, free_ports, status_calculated }[]` | `src/pages/ViabilityPage.tsx:246`, `src/components/flowmap/ViabilityPanel.tsx:40` |
| `sla_sweep_breaches` | `{}` (sem params) | `integer` (count) | `src/pages/SLAGovernance.tsx:96` |
| `is_super_admin` | `{ p_user_id: uuid }` | `boolean` | `src/hooks/useUserRole.ts:57` |

---

## 3. Storage (`/storage/v1/*`)

| Bucket | Operação | Path Pattern | Arquivo | Linha |
|--------|----------|--------------|---------|-------|
| `dashboard-assets` | upload | `{userId}/{uuid}.{ext}` | `src/components/builder/ImageUploader.tsx:37` |
| `dashboard-assets` | getPublicUrl | `{path}` | `src/components/builder/ImageUploader.tsx:43` |
| `dashboard-assets` | upload | `avatars/{userId}_{ts}.{ext}` | `src/pages/UserSettings.tsx:135` |
| `dashboard-assets` | list | `avatars/` (search: userId) | `src/pages/UserSettings.tsx:106,181` |
| `dashboard-assets` | remove | `[...paths]` | `src/pages/UserSettings.tsx:125,200` |
| `dashboard-assets` | getPublicUrl | `{path}` | `src/pages/UserSettings.tsx:148` |
| `flowmap-attachments` | list | `/` (top folders) | `src/components/flowmap/FieldOverlay.tsx:158` |
| `flowmap-attachments` | list | `{userId}/{mapId}/{hostId}/` | `src/components/flowmap/FieldOverlay.tsx:173` |
| `flowmap-attachments` | getPublicUrl | `{path}/{filename}` | `src/components/flowmap/FieldOverlay.tsx:180` |
| `flowmap-attachments` | upload | `{userId}/{mapId}/{hostId}/{ts}.{ext}` | `src/components/flowmap/FieldOverlay.tsx:223` |

---

## 4. Edge Functions (`/functions/v1/*`)

| Função | Método de Chamada | Arquivo Frontend | Linha |
|--------|-------------------|------------------|-------|
| `zabbix-proxy` | `supabase.functions.invoke()` | `src/components/dashboard/IdracSetupWizard.tsx:63`, `src/components/flowmap/MapBuilderPanel.tsx:23`, `src/components/flowmap/LinkItemsEditor.tsx:25`, `src/pages/PrinterIntelligence.tsx:85` |
| `zabbix-proxy` | `fetch()` direto | `src/components/builder/ZabbixItemBrowser.tsx:33` |
| `zabbix-poller` | `fetch()` direto | `src/hooks/useDashboardData.ts:196` |
| `zabbix-connections` | `supabase.functions.invoke()` | `src/hooks/useZabbixConnections.ts:17` |
| `rms-connections` | `supabase.functions.invoke()` | `src/hooks/useRMSConnections.ts:16` |
| `rms-fueling` | `fetch()` direto | `src/hooks/useRMSFueling.ts:26` |
| `flowmap-status` | `fetch()` direto | `src/hooks/useFlowMapStatus.ts:167` |
| `flowmap-route` | `supabase.functions.invoke()` | `src/pages/FlowMapPage.tsx:280,352`, `src/components/flowmap/MapBuilderPanel.tsx:876` |
| `flowpulse-reactor` | `fetch()` direto | `src/hooks/useDashboardReplay.ts:20` |
| `cto-status-aggregator` | `supabase.functions.invoke()` | `src/pages/FlowMapPage.tsx:219` |
| `invite-user` | `supabase.functions.invoke()` | `src/pages/AdminHub.tsx:328` |
| `telegram-bot` | `supabase.functions.invoke()` | `src/pages/TelegramSettings.tsx:113,131` |
| `telemetry-wizard` | `supabase.functions.invoke()` | `src/components/admin/TelemetryWizard.tsx:63,106,157` |
| `printer-status` | `supabase.functions.invoke()` | `src/pages/PrinterIntelligence.tsx:958`, `src/components/printer/UsageHeatmap.tsx:47` |
| `webhook-token-manage` | `supabase.functions.invoke()` | `src/components/admin/TelemetryHealthPanel.tsx` |
| `bgp-collector` | `fetch()` direto | `src/pages/BgpFlowMonitor.tsx:753` |
| `system-status` | `supabase.functions.invoke()` | `src/pages/SystemStatus.tsx` |

---

## 5. Realtime (`/realtime/v1/*`)

| Canal | Tipo | Evento | Tabela/Topic | Arquivo | Linha |
|-------|------|--------|--------------|---------|-------|
| `incidents-realtime` | postgres_changes | `*` | `alert_instances` | `src/hooks/useIncidents.ts:120` |
| `flowmap-hosts-rt-{mapId}` | postgres_changes | `UPDATE` | `flow_map_hosts` | `src/hooks/useFlowMapStatus.ts:244` |
| `dashboard:{dashboardId}` | broadcast | `DATA_UPDATE` | — | `src/hooks/useDashboardRealtime.ts:92` |
| `bgp:{configId}` | broadcast | `BGP_UPDATE` | — | `src/pages/BgpFlowMonitor.tsx:783` |
| `flowmap:alerts` | broadcast | `ZABBIX_WEBHOOK` | — | `src/components/flowmap/FlowMapCanvas.tsx:785`, `src/components/flowmap/NocConsolePanel.tsx:129` |

**Nota**: `postgres_changes` requer REPLICA IDENTITY FULL nas tabelas observadas.

---

## 6. Chamadas `fetch()` Diretas (não via SDK)

Estas chamadas constroem a URL manualmente usando `import.meta.env.VITE_SUPABASE_URL` ou `VITE_SUPABASE_PROJECT_ID`:

| URL Pattern | Arquivo | Linha |
|-------------|---------|-------|
| `${VITE_SUPABASE_URL}/functions/v1/zabbix-poller` | `src/hooks/useDashboardData.ts` | 196 |
| `${VITE_SUPABASE_URL}/functions/v1/zabbix-proxy` | `src/components/builder/ZabbixItemBrowser.tsx` | 33 |
| `${VITE_SUPABASE_URL}/functions/v1/flowmap-status` | `src/hooks/useFlowMapStatus.ts` | 167 |
| `${VITE_SUPABASE_URL}/functions/v1/flowpulse-reactor` | `src/hooks/useDashboardReplay.ts` | 20 |
| `${VITE_SUPABASE_URL}/functions/v1/rms-fueling` | `src/hooks/useRMSFueling.ts` | 26 |
| `https://${VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/bgp-collector` | `src/pages/BgpFlowMonitor.tsx` | 753 |
| `https://${VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/telegram-bot` | `src/pages/TelegramSettings.tsx` | 129 |

⚠️ **Atenção on-premise**: As duas últimas URLs usam `PROJECT_ID` para construir domínio `.supabase.co`. Precisam ser refatoradas para usar `VITE_SUPABASE_URL` no ambiente local.
