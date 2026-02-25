-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  FLOWPULSE INTELLIGENCE — Schema On-Premise (PostgreSQL Puro)  ║
-- ║  © 2026 CBLabs — Versão 1.0                                    ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- Executar como superusuário no banco "flowpulse"
-- psql -U postgres -d flowpulse -f schema_cblabs_full.sql

BEGIN;

-- ─── EXTENSÕES ────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── ENUMS ────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'editor', 'tech', 'sales', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE alert_status AS ENUM ('open', 'ack', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE severity_level AS ENUM ('info', 'low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE link_status AS ENUM ('UP', 'DOWN', 'DEGRADED', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cable_type AS ENUM ('ASU', 'ADSS', 'OPGW', 'AS', 'SUBAQUATICO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cto_capacity AS ENUM ('4', '8', '16', '32');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cto_status AS ENUM ('ONLINE', 'DEGRADED', 'OFFLINE', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notify_channel AS ENUM ('telegram', 'webhook', 'email');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE maintenance_scope_type AS ENUM (
    'tenant_all', 'zabbix_connection', 'dashboard', 'trigger', 'host', 'hostgroup', 'tag'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── TABELA DE AUTH (SUBSTITUI auth.users) ────────────────
CREATE TABLE IF NOT EXISTS auth_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  encrypted_password TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── TENANTS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── PROFILES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  display_name TEXT,
  email TEXT,
  avatar_url TEXT,
  phone TEXT,
  job_title TEXT,
  language TEXT DEFAULT 'pt-BR',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── USER ROLES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  role app_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, tenant_id, role)
);

-- ─── DASHBOARDS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dashboards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL DEFAULT 'New Dashboard',
  description TEXT,
  category TEXT DEFAULT 'dashboard',
  layout JSONB NOT NULL DEFAULT '[]',
  settings JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  zabbix_connection_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── WIDGETS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS widgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  widget_type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'New Widget',
  config JSONB NOT NULL DEFAULT '{}',
  query JSONB NOT NULL DEFAULT '{}',
  adapter JSONB NOT NULL DEFAULT '{}',
  position_x INT DEFAULT 0,
  position_y INT DEFAULT 0,
  width INT DEFAULT 4,
  height INT DEFAULT 3,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── ZABBIX CONNECTIONS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS zabbix_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  token_ciphertext TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  token_tag TEXT NOT NULL,
  encryption_version INT DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── FLOW MAPS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flow_maps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  center_lat DOUBLE PRECISION DEFAULT -20.4630,
  center_lon DOUBLE PRECISION DEFAULT -54.6190,
  zoom INT DEFAULT 6,
  theme TEXT DEFAULT 'dark',
  refresh_interval INT DEFAULT 30,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── FLOW MAP HOSTS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS flow_map_hosts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  map_id UUID NOT NULL REFERENCES flow_maps(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  zabbix_host_id TEXT NOT NULL,
  host_name TEXT DEFAULT '',
  host_group TEXT DEFAULT '',
  icon_type TEXT DEFAULT 'router',
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  is_critical BOOLEAN DEFAULT false,
  current_status link_status DEFAULT 'UNKNOWN',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── FLOW MAP LINKS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS flow_map_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  map_id UUID NOT NULL REFERENCES flow_maps(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  origin_host_id UUID NOT NULL REFERENCES flow_map_hosts(id),
  dest_host_id UUID NOT NULL REFERENCES flow_map_hosts(id),
  origin_role TEXT DEFAULT 'CORE',
  dest_role TEXT DEFAULT 'EDGE',
  link_type TEXT DEFAULT 'fiber',
  capacity_mbps INT DEFAULT 1000,
  current_status link_status DEFAULT 'UNKNOWN',
  last_status_change TIMESTAMPTZ,
  is_ring BOOLEAN DEFAULT false,
  priority INT DEFAULT 0,
  status_strategy TEXT DEFAULT 'AUTO',
  geometry JSONB DEFAULT '{"type":"LineString","coordinates":[]}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── FLOW MAP LINK ITEMS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS flow_map_link_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  link_id UUID NOT NULL REFERENCES flow_map_links(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  zabbix_host_id TEXT NOT NULL,
  zabbix_item_id TEXT NOT NULL,
  name TEXT DEFAULT '',
  key_ TEXT DEFAULT '',
  metric TEXT NOT NULL,
  side TEXT NOT NULL,
  direction TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── FLOW MAP LINK EVENTS ────────────────────────────────
CREATE TABLE IF NOT EXISTS flow_map_link_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  link_id UUID NOT NULL REFERENCES flow_map_links(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  status link_status DEFAULT 'UNKNOWN',
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── FLOW MAP CTOS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS flow_map_ctos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  map_id UUID NOT NULL REFERENCES flow_maps(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT DEFAULT '',
  description TEXT DEFAULT '',
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  capacity cto_capacity DEFAULT '16',
  occupied_ports INT DEFAULT 0,
  status_calculated cto_status DEFAULT 'UNKNOWN',
  olt_host_id UUID REFERENCES flow_map_hosts(id),
  pon_port_index INT DEFAULT 0,
  zabbix_host_ids TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── FLOW MAP CABLES ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS flow_map_cables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  map_id UUID NOT NULL REFERENCES flow_maps(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  source_node_id UUID NOT NULL,
  source_node_type TEXT DEFAULT 'host',
  target_node_id UUID NOT NULL,
  target_node_type TEXT DEFAULT 'cto',
  label TEXT DEFAULT '',
  cable_type cable_type DEFAULT 'ASU',
  fiber_count INT DEFAULT 12,
  distance_km DOUBLE PRECISION DEFAULT 0,
  color_override TEXT,
  geometry JSONB DEFAULT '{"type":"LineString","coordinates":[]}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── FLOW MAP RESERVAS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS flow_map_reservas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  map_id UUID NOT NULL REFERENCES flow_maps(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  label TEXT DEFAULT '',
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  tipo_cabo TEXT DEFAULT 'ASU',
  comprimento_m NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pendente',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── FLOW MAP EFFECTIVE CACHE ────────────────────────────
CREATE TABLE IF NOT EXISTS flow_map_effective_cache (
  map_id UUID PRIMARY KEY REFERENCES flow_maps(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  payload JSONB DEFAULT '[]',
  computed_at TIMESTAMPTZ DEFAULT now(),
  rpc_duration_ms INT,
  host_count INT,
  max_depth INT
);

-- ─── ALERT RULES ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  source TEXT DEFAULT 'zabbix',
  severity severity_level DEFAULT 'high',
  matchers JSONB DEFAULT '{}',
  is_enabled BOOLEAN DEFAULT true,
  auto_resolve BOOLEAN DEFAULT true,
  resolve_on_missing BOOLEAN DEFAULT false,
  dedupe_key_template TEXT DEFAULT '{{source}}:{{triggerid}}',
  dashboard_id UUID REFERENCES dashboards(id),
  zabbix_connection_id UUID REFERENCES zabbix_connections(id),
  escalation_policy_id UUID,
  sla_policy_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── ALERT INSTANCES ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_instances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  rule_id UUID REFERENCES alert_rules(id),
  title TEXT NOT NULL,
  summary TEXT,
  status alert_status DEFAULT 'open',
  severity severity_level DEFAULT 'high',
  dedupe_key TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  suppressed BOOLEAN DEFAULT false,
  suppressed_by_maintenance_id UUID,
  opened_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  ack_due_at TIMESTAMPTZ,
  resolve_due_at TIMESTAMPTZ,
  ack_breached_at TIMESTAMPTZ,
  resolve_breached_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── ALERT EVENTS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  alert_id UUID NOT NULL REFERENCES alert_instances(id),
  event_type TEXT NOT NULL,
  from_status alert_status,
  to_status alert_status,
  user_id UUID,
  message TEXT,
  payload JSONB DEFAULT '{}',
  occurred_at TIMESTAMPTZ DEFAULT now()
);

-- ─── NOTIFICATION CHANNELS ───────────────────────────────
CREATE TABLE IF NOT EXISTS notification_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  channel notify_channel NOT NULL,
  config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── ALERT NOTIFICATIONS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  alert_id UUID NOT NULL REFERENCES alert_instances(id),
  channel_id UUID REFERENCES notification_channels(id),
  policy_id UUID,
  step_id UUID,
  status TEXT DEFAULT 'pending',
  request JSONB DEFAULT '{}',
  response JSONB DEFAULT '{}',
  attempts INT DEFAULT 0,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── ESCALATION POLICIES ─────────────────────────────────
CREATE TABLE IF NOT EXISTS escalation_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── ESCALATION STEPS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS escalation_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES escalation_policies(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  channel_id UUID NOT NULL REFERENCES notification_channels(id),
  step_order INT NOT NULL,
  delay_seconds INT DEFAULT 0,
  throttle_seconds INT DEFAULT 60,
  target JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── SLA POLICIES ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sla_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  ack_target_seconds INT DEFAULT 900,
  resolve_target_seconds INT DEFAULT 3600,
  business_hours JSONB DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── MAINTENANCE WINDOWS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_windows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── MAINTENANCE SCOPES ──────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_scopes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  maintenance_id UUID NOT NULL REFERENCES maintenance_windows(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  scope_type maintenance_scope_type NOT NULL,
  scope_value TEXT,
  scope_meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── AUDIT LOGS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── FLOW AUDIT LOGS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS flow_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID,
  user_email TEXT,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── WEBHOOK TOKENS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  token_hash TEXT NOT NULL,
  label TEXT DEFAULT 'default',
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── TELEMETRY CONFIG ────────────────────────────────────
CREATE TABLE IF NOT EXISTS telemetry_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  config_key TEXT NOT NULL,
  config_value TEXT NOT NULL,
  iv TEXT,
  tag TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── TELEMETRY HEARTBEAT ─────────────────────────────────
CREATE TABLE IF NOT EXISTS telemetry_heartbeat (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id),
  last_webhook_at TIMESTAMPTZ,
  last_webhook_source TEXT,
  event_count BIGINT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── PRINTER CONFIGS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS printer_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  dashboard_id UUID REFERENCES dashboards(id),
  zabbix_host_id TEXT NOT NULL,
  host_name TEXT DEFAULT '',
  base_counter INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── BILLING LOGS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  period TEXT NOT NULL,
  total_pages BIGINT DEFAULT 0,
  entries JSONB DEFAULT '[]',
  snapshot_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── RMS CONNECTIONS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS rms_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  token_ciphertext TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  token_tag TEXT NOT NULL,
  encryption_version INT DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════
-- ─── ÍNDICES ──────────────────────────────────────
-- ═══════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_dashboards_tenant ON dashboards(tenant_id);
CREATE INDEX IF NOT EXISTS idx_widgets_dashboard ON widgets(dashboard_id);
CREATE INDEX IF NOT EXISTS idx_flow_maps_tenant ON flow_maps(tenant_id);
CREATE INDEX IF NOT EXISTS idx_flow_map_hosts_map ON flow_map_hosts(map_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_flow_map_links_map ON flow_map_links(map_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_flow_map_ctos_map ON flow_map_ctos(map_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_alert_instances_tenant ON alert_instances(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_alert_events_alert ON alert_events(alert_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);

-- ═══════════════════════════════════════════════════
-- ─── FUNÇÕES UTILITÁRIAS ──────────────────────────
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'profiles','dashboards','widgets','flow_maps','flow_map_hosts',
    'flow_map_links','flow_map_ctos','flow_map_cables','alert_rules',
    'alert_instances','zabbix_connections','rms_connections',
    'maintenance_windows','sla_policies','escalation_policies'
  ]) LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_updated_at ON %I; CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
      t, t
    );
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════
-- ─── SEED: ADMIN PADRÃO ──────────────────────────
-- ═══════════════════════════════════════════════════

DO $$
DECLARE
  v_tenant_id UUID;
  v_user_id UUID;
  v_hash TEXT;
BEGIN
  -- Só cria se não existir nenhum perfil
  IF NOT EXISTS (SELECT 1 FROM profiles LIMIT 1) THEN
    v_tenant_id := uuid_generate_v4();
    v_user_id := uuid_generate_v4();
    v_hash := crypt('admin', gen_salt('bf', 12));

    INSERT INTO tenants (id, name, slug) VALUES (v_tenant_id, 'CBLabs', 'cblabs');

    INSERT INTO auth_users (id, email, encrypted_password)
    VALUES (v_user_id, 'admin@flowpulse.local', v_hash);

    INSERT INTO profiles (id, tenant_id, display_name, email)
    VALUES (v_user_id, v_tenant_id, 'Administrador', 'admin@flowpulse.local');

    INSERT INTO user_roles (user_id, tenant_id, role)
    VALUES (v_user_id, v_tenant_id, 'admin');

    RAISE NOTICE '✅ Admin seed criado: admin / admin';
  ELSE
    RAISE NOTICE '⏭️ Seed ignorado — já existem perfis.';
  END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════
-- FIM DO SCHEMA — FLOWPULSE INTELLIGENCE v1.0
-- © 2026 CBLabs
-- ═══════════════════════════════════════════════════
