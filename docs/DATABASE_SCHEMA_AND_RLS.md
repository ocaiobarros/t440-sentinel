# FlowPulse — Schema do Banco de Dados, RLS e Funções

> Inventário completo para migração on-premise.
> Data: 2026-02-26

---

## 1. Tabelas (25)

| # | Tabela | Colunas-chave | RLS Policies |
|---|--------|---------------|--------------|
| 1 | `alert_events` | id, alert_id, tenant_id, event_type, from_status, to_status, user_id, message, payload, occurred_at | `ae_select`: SELECT WHERE tenant_id = jwt_tenant_id() |
| 2 | `alert_instances` | id, tenant_id, title, summary, severity, status, dedupe_key, payload, opened_at, last_seen_at, ack_due_at, resolve_due_at, ack_breached_at, resolve_breached_at, rule_id, suppressed, suppressed_by_maintenance_id | `ai_select`: SELECT WHERE tenant_id = jwt_tenant_id(); `ai_update_ack_resolve`: UPDATE WHERE tenant_id + (admin OR editor) |
| 3 | `alert_notifications` | id, tenant_id, alert_id, channel_id, step_id, policy_id, status, request, response, attempts | `an_select`: SELECT WHERE tenant_id |
| 4 | `alert_rules` | id, tenant_id, name, source, matchers, severity, dedupe_key_template, auto_resolve, sla_policy_id, escalation_policy_id, dashboard_id, zabbix_connection_id | `ar_manage`: ALL WHERE tenant_id + (admin/editor); `ar_select`: SELECT WHERE tenant_id |
| 5 | `audit_logs` | id, tenant_id, user_id, action, entity_type, entity_id, details | `audit_logs_select`: SELECT WHERE tenant_id |
| 6 | `billing_logs` | id, tenant_id, period, total_pages, entries, snapshot_at | `bl_select`: SELECT WHERE tenant_id |
| 7 | `dashboards` | id, tenant_id, name, description, category, layout, settings, zabbix_connection_id, is_default, created_by | `dashboards_select/insert/update/delete`: admin/editor + super_admin |
| 8 | `escalation_policies` | id, tenant_id, name, description, is_active | `ep_select`: SELECT WHERE tenant_id |
| 9 | `escalation_steps` | id, tenant_id, policy_id, step_order, channel_id, delay_seconds, throttle_seconds, target, enabled | `es_select`: SELECT WHERE tenant_id |
| 10 | `flow_audit_logs` | id, tenant_id, user_id, user_email, action, table_name, record_id, old_data, new_data | `audit_select_admin`: SELECT WHERE tenant_id + admin/super_admin |
| 11 | `flow_map_cables` | id, tenant_id, map_id, label, source_node_id/type, target_node_id/type, cable_type, fiber_count, geometry, distance_km | `cable_manage/select`: admin/editor + super_admin |
| 12 | `flow_map_ctos` | id, tenant_id, map_id, name, lat, lon, capacity, occupied_ports, status_calculated, olt_host_id, pon_port_index, zabbix_host_ids, metadata | `cto_manage/select`: admin/editor + super_admin |
| 13 | `flow_map_effective_cache` | map_id (PK), tenant_id, payload, computed_at, rpc_duration_ms, host_count, max_depth | `cache_select`: SELECT WHERE tenant_id |
| 14 | `flow_map_hosts` | id, tenant_id, map_id, host_name, zabbix_host_id, lat, lon, icon_type, host_group, is_critical, current_status | `fmh_manage/select`: admin/editor + super_admin. **REPLICA IDENTITY FULL** |
| 15 | `flow_map_link_events` | id, tenant_id, link_id, status, started_at, ended_at, duration_seconds | `fmle_select`: SELECT WHERE tenant_id |
| 16 | `flow_map_link_items` | id, tenant_id, link_id, zabbix_host_id, zabbix_item_id, key_, name, metric, side, direction | `fmli_manage/select`: admin/editor + super_admin |
| 17 | `flow_map_links` | id, tenant_id, map_id, origin_host_id, dest_host_id, origin_role, dest_role, link_type, capacity_mbps, current_status, status_strategy, is_ring, geometry, priority | `fml_manage/select`: admin/editor + super_admin |
| 18 | `flow_map_reservas` | id, tenant_id, map_id, label, lat, lon, tipo_cabo, comprimento_m, status, created_by | `reservas_select/insert/update/delete`: admin/editor |
| 19 | `flow_maps` | id, tenant_id, name, theme, center_lat, center_lon, zoom, refresh_interval, created_by | `fm_select/insert/update/delete`: admin/editor + super_admin |
| 20 | `maintenance_scopes` | id, tenant_id, maintenance_id, scope_type, scope_value, scope_meta | `ms_manage/select`: admin/editor |
| 21 | `maintenance_windows` | id, tenant_id, name, description, starts_at, ends_at, is_active, created_by | `mw_manage/select`: admin/editor |
| 22 | `notification_channels` | id, tenant_id, name, channel (enum), config, is_active | `nc_select`: SELECT WHERE tenant_id |
| 23 | `printer_configs` | id, tenant_id, zabbix_host_id, host_name, base_counter, dashboard_id | `pc_manage/select`: admin/editor |
| 24 | `profiles` | id (= auth.users.id), tenant_id, display_name, email, avatar_url, phone, job_title, language | `profiles_self_select/insert/update`: id = auth.uid(); `profiles_select_tenant`: tenant_id; `profiles_update_super`: super_admin |
| 25 | `rms_connections` | id, tenant_id, name, url, token_ciphertext/iv/tag, encryption_version, is_active | `rms_select/insert/update/delete`: admin + super_admin |
| 26 | `sla_policies` | id, tenant_id, name, ack_target_seconds, resolve_target_seconds, business_hours | `sla_select`: SELECT WHERE tenant_id |
| 27 | `telemetry_config` | id, tenant_id, config_key, config_value, iv, tag | `tc_manage/select`: admin + super_admin |
| 28 | `telemetry_heartbeat` | tenant_id (PK), last_webhook_at, last_webhook_source, event_count | `th_select`: SELECT WHERE tenant_id |
| 29 | `tenants` | id, name, slug | `tenants_select/update/insert/delete`: tenant_id or super_admin |
| 30 | `user_roles` | id, user_id, tenant_id, role (enum app_role) | `user_roles_select/insert/update/delete`: admin + super_admin |
| 31 | `webhook_tokens` | id, tenant_id, label, token_hash, is_active, revoked_at | `wt_manage/select`: admin + super_admin |
| 32 | `widgets` | id, dashboard_id, widget_type, title, query, config, adapter, position_x/y, width, height | `widgets_select/insert/update/delete`: via JOIN dashboards WHERE tenant_id + admin/editor |
| 33 | `zabbix_connections` | id, tenant_id, name, url, username, password_ciphertext/iv/tag, encryption_version, is_active | (gerenciado via edge function) |

---

## 2. ENUMs

| Nome | Valores |
|------|---------|
| `app_role` | admin, editor, viewer, tech, sales |
| `alert_status` | open, ack, resolved |
| `severity_level` | info, warning, average, high, disaster |
| `link_status` | UP, DOWN, UNKNOWN, DEGRADED, ISOLATED |
| `cable_type` | ASU, CFOA, AS, DROP |
| `cto_capacity` | 8, 16, 32 |
| `cto_status` | OK, WARNING, CRITICAL, UNKNOWN |
| `notify_channel` | telegram, webhook, email |
| `maintenance_scope_type` | tenant_all, zabbix_connection, dashboard, trigger, host, hostgroup, tag |

---

## 3. Funções PL/pgSQL (17)

### 3.1. Chamadas pelo Frontend (via RPC)

| Função | Assinatura | Segurança | Dependências | Chamada em |
|--------|-----------|-----------|--------------|------------|
| `get_user_tenant_id(p_user_id uuid)` | → uuid | SECURITY DEFINER, row_security=off | profiles | useDashboardPersist, DashboardBuilder, ModuleDashboardList |
| `get_map_effective_status(p_map_id uuid)` | → TABLE(host_id, effective_status, is_root_cause, depth) | SECURITY DEFINER, row_security=on | flow_maps, flow_map_hosts, flow_map_links, jwt_tenant_id() | useFlowMapStatus |
| `alert_transition(p_alert_id, p_to, p_user_id, p_message, p_payload)` | → void | SECURITY DEFINER | alert_instances, alert_events, auth.uid(), get_user_tenant_id, has_role | useIncidents |
| `check_viability(p_lat, p_lon, p_tenant_id, p_map_id)` | → TABLE(cto_id, cto_name, distance_m, capacity, occupied_ports, free_ports, status_calculated) | SECURITY DEFINER | flow_map_ctos | ViabilityPage, ViabilityPanel |
| `sla_sweep_breaches(p_tenant_id?)` | → integer | SECURITY DEFINER | alert_instances | SLAGovernance |
| `is_super_admin(p_user_id uuid)` | → boolean | SECURITY DEFINER, row_security=off | profiles | useUserRole |

### 3.2. Usadas Internamente (RLS/Triggers/Edge Functions)

| Função | Uso |
|--------|-----|
| `jwt_tenant_id()` | Todas as 63 políticas RLS |
| `has_role(p_user_id, p_tenant_id, p_role)` | RLS de tabelas com controle de escrita |
| `has_any_role(p_user_id, p_tenant_id, p_roles[])` | RLS alternativa |
| `handle_new_user()` | Trigger em auth.users → cria tenant, profile, user_role, injeta tenant_id no JWT |
| `prevent_tenant_change()` | Trigger em tabelas → impede alteração de tenant_id |
| `update_updated_at_column()` | Trigger genérico → atualiza updated_at |
| `touch_dashboard_on_widget_change()` | Trigger em widgets → atualiza dashboards.updated_at |
| `flow_audit_trigger()` | Trigger em ativos do flowmap → registra em flow_audit_logs |
| `alert_apply_sla()` | Trigger BEFORE INSERT em alert_instances → calcula ack_due_at e resolve_due_at |
| `validate_maintenance_window()` | Trigger → valida ends_at > starts_at |
| `bump_telemetry_heartbeat(p_tenant_id, p_source)` | Chamada por edge functions → upsert telemetry_heartbeat |
| `verify_webhook_token(p_token)` | Chamada por zabbix-webhook edge fn → retorna tenant_id |
| `is_in_maintenance(p_tenant_id, p_now, p_scope)` | Chamada por alert-ingest → verifica janela de manutenção |

---

## 4. Triggers

| Tabela | Trigger | Função |
|--------|---------|--------|
| `auth.users` (AFTER INSERT) | `on_auth_user_created` | `handle_new_user()` |
| Várias tabelas | `prevent_tenant_change` | `prevent_tenant_change()` |
| Várias tabelas | `update_updated_at` | `update_updated_at_column()` |
| `widgets` (AFTER INSERT/UPDATE/DELETE) | `touch_dashboard_ts` | `touch_dashboard_on_widget_change()` |
| `flow_map_hosts`, `flow_map_links`, `flow_map_ctos`, `flow_map_cables` | `flow_audit_*` | `flow_audit_trigger()` |
| `alert_instances` (BEFORE INSERT) | `apply_sla` | `alert_apply_sla()` |
| `maintenance_windows` (BEFORE INSERT/UPDATE) | `validate_mw` | `validate_maintenance_window()` |

---

## 5. Extensions Necessárias

| Extension | Uso |
|-----------|-----|
| `pgcrypto` | `gen_random_uuid()` (default em todas PKs), `extensions.digest()` (webhook token hash) |
| `pg_cron` | SLA sweep periódico (se configurado) |
| `uuid-ossp` | Fallback UUID generation |

---

## 6. Publicações Realtime

| Tabela | Publicação |
|--------|-----------|
| `alert_instances` | `supabase_realtime` |
| `flow_map_hosts` | `supabase_realtime` (REPLICA IDENTITY FULL) |
