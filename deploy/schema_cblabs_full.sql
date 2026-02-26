-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  FLOWPULSE INTELLIGENCE — Schema On-Premise (PostgreSQL Puro)  ║
-- ║  © 2026 CBLabs — Versão 1.1                                    ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- Executar como superusuário no banco "postgres"
-- psql -U supabase_admin -d postgres -f schema_cblabs_full.sql

BEGIN;

-- Ensure uuid-ossp functions are visible without schema prefix
SET search_path TO public, extensions, pg_temp;

-- ─── EXTENSÕES ────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

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
-- ─── AUTH.USERS ───────────────────────────────────────────
-- GoTrue gerencia auth.users automaticamente.
-- Não criamos tabela shadow — referenciamos auth.users diretamente.

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
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
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
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
  username TEXT NOT NULL DEFAULT '',
  password_ciphertext TEXT NOT NULL,
  password_iv TEXT NOT NULL,
  password_tag TEXT NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_printer_configs_tenant ON printer_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_logs_tenant ON billing_logs(tenant_id, period);

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
    'maintenance_windows','sla_policies','escalation_policies',
    'printer_configs'
  ]) LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_updated_at ON %I; CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
      t, t
    );
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════
-- ─── FUNÇÕES DE DOMÍNIO ───────────────────────────
-- ═══════════════════════════════════════════════════

-- Resolve tenant_id a partir do perfil do user
CREATE OR REPLACE FUNCTION get_user_tenant_id(p_user_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = p_user_id LIMIT 1;
$$;

-- JWT tenant helper
CREATE OR REPLACE FUNCTION jwt_tenant_id()
RETURNS UUID
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id', '')::uuid,
    public.get_user_tenant_id(auth.uid())
  )
$$;

-- Role check helpers
CREATE OR REPLACE FUNCTION has_role(p_user_id UUID, p_tenant_id UUID, p_role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id AND tenant_id = p_tenant_id AND role = p_role
  );
$$;

CREATE OR REPLACE FUNCTION has_any_role(p_user_id UUID, p_tenant_id UUID, p_roles app_role[])
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id AND tenant_id = p_tenant_id AND role = ANY(p_roles)
  );
$$;

CREATE OR REPLACE FUNCTION is_super_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND email IN ('caio.barros@madeplant.com.br', 'admin@flowpulse.local')
  );
$$;

-- ═══════════════════════════════════════════════════
-- ─── TRIGGER: AUTO-PROVISION ON SIGNUP ────────────
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_tenant_id UUID;
  user_slug TEXT;
  user_name TEXT;
BEGIN
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );
  user_slug := lower(regexp_replace(user_name, '[^a-zA-Z0-9]+', '-', 'g'));

  INSERT INTO public.tenants (name, slug)
  VALUES (user_name || '''s Org', user_slug || '-' || substr(NEW.id::text, 1, 8))
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.profiles (id, tenant_id, display_name, email)
  VALUES (NEW.id, new_tenant_id, user_name, NEW.email);

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (NEW.id, new_tenant_id, 'admin');

  -- Inject tenant_id into JWT app_metadata
  UPDATE auth.users
  SET raw_app_meta_data = jsonb_set(
    COALESCE(raw_app_meta_data, '{}'::jsonb),
    '{tenant_id}',
    to_jsonb(new_tenant_id::text)
  )
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

-- Attach trigger to auth.users (GoTrue creates users there)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ═══════════════════════════════════════════════════
-- ─── SEED: ADMIN PADRÃO ──────────────────────────
-- Seed é criado via GoTrue Admin API no onprem-up.sh
-- O trigger handle_new_user cuida de criar tenant,
-- profile e role automaticamente.
-- ═══════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════
-- ─── FUNÇÕES AVANÇADAS ───────────────────────────
-- ═══════════════════════════════════════════════════

-- Webhook token verification
CREATE OR REPLACE FUNCTION verify_webhook_token(p_token TEXT)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public, extensions, pg_temp
AS $$
  SELECT tenant_id FROM public.webhook_tokens
  WHERE token_hash = encode(extensions.digest(p_token::bytea, 'sha256'), 'hex')
    AND is_active = true
  LIMIT 1;
$$;

-- Prevent tenant_id changes
CREATE OR REPLACE FUNCTION prevent_tenant_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
  IF NEW.tenant_id <> OLD.tenant_id THEN
    IF public.is_super_admin(auth.uid()) THEN RETURN NEW; END IF;
    IF COALESCE(auth.role(), '') = 'service_role' THEN RETURN NEW; END IF;
    IF COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'tenant_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;

-- Flow audit trigger function
CREATE OR REPLACE FUNCTION flow_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
  v_tenant UUID;
  v_record_id UUID;
  v_old JSONB;
  v_new JSONB;
BEGIN
  v_user_id := auth.uid();
  SELECT email INTO v_email FROM public.profiles WHERE id = v_user_id;
  IF TG_OP = 'DELETE' THEN
    v_tenant := OLD.tenant_id; v_record_id := OLD.id; v_old := to_jsonb(OLD); v_new := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_tenant := NEW.tenant_id; v_record_id := NEW.id; v_old := NULL; v_new := to_jsonb(NEW);
  ELSE
    v_tenant := NEW.tenant_id; v_record_id := NEW.id; v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
  END IF;
  INSERT INTO public.flow_audit_logs (tenant_id, user_id, user_email, action, table_name, record_id, old_data, new_data)
  VALUES (v_tenant, v_user_id, v_email, TG_OP, TG_TABLE_NAME, v_record_id, v_old, v_new);
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Bump telemetry heartbeat
CREATE OR REPLACE FUNCTION bump_telemetry_heartbeat(p_tenant_id UUID, p_source TEXT DEFAULT 'zabbix-webhook')
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
  INSERT INTO public.telemetry_heartbeat (tenant_id, last_webhook_at, last_webhook_source, event_count, updated_at)
  VALUES (p_tenant_id, now(), p_source, 1, now())
  ON CONFLICT (tenant_id) DO UPDATE SET
    last_webhook_at = now(),
    last_webhook_source = p_source,
    event_count = telemetry_heartbeat.event_count + 1,
    updated_at = now();
END;
$$;

-- Validate maintenance window
CREATE OR REPLACE FUNCTION validate_maintenance_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO public, pg_temp
AS $$
BEGIN
  IF NEW.ends_at <= NEW.starts_at THEN
    RAISE EXCEPTION 'ends_at must be after starts_at';
  END IF;
  RETURN NEW;
END;
$$;

-- Touch dashboard on widget change
CREATE OR REPLACE FUNCTION touch_dashboard_on_widget_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO public, pg_temp
AS $$
DECLARE v_dashboard_id UUID;
BEGIN
  v_dashboard_id := COALESCE(NEW.dashboard_id, OLD.dashboard_id);
  UPDATE public.dashboards SET updated_at = now() WHERE id = v_dashboard_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Check viability (find nearest CTOs)
CREATE OR REPLACE FUNCTION check_viability(p_lat DOUBLE PRECISION, p_lon DOUBLE PRECISION, p_tenant_id UUID, p_map_id UUID)
RETURNS TABLE(cto_id UUID, cto_name TEXT, distance_m DOUBLE PRECISION, capacity TEXT, occupied_ports INTEGER, free_ports INTEGER, status_calculated TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
  SELECT * FROM (
    SELECT
      c.id AS cto_id, c.name AS cto_name,
      (6371000.0 * acos(LEAST(1.0, GREATEST(-1.0,
        cos(radians(p_lat)) * cos(radians(c.lat)) * cos(radians(c.lon) - radians(p_lon)) +
        sin(radians(p_lat)) * sin(radians(c.lat))
      )))) AS distance_m,
      c.capacity::TEXT AS capacity, c.occupied_ports,
      (c.capacity::TEXT::INT - c.occupied_ports) AS free_ports,
      c.status_calculated::TEXT AS status_calculated
    FROM public.flow_map_ctos c
    WHERE c.tenant_id = p_tenant_id AND c.map_id = p_map_id
      AND abs(c.lat - p_lat) < 0.002 AND abs(c.lon - p_lon) < 0.003
  ) sub WHERE sub.distance_m <= 200 ORDER BY sub.distance_m ASC LIMIT 5;
$$;

-- Alert transition (ack/resolve)
CREATE OR REPLACE FUNCTION alert_transition(p_alert_id UUID, p_to alert_status, p_user_id UUID, p_message TEXT DEFAULT NULL, p_payload JSONB DEFAULT '{}'::jsonb)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_from public.alert_status;
  v_tenant UUID;
  v_auth UUID;
BEGIN
  v_auth := auth.uid();
  IF v_auth IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_user_id IS NULL OR p_user_id <> v_auth THEN RAISE EXCEPTION 'invalid user'; END IF;
  SELECT status, tenant_id INTO v_from, v_tenant FROM public.alert_instances WHERE id = p_alert_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'alert not found'; END IF;
  IF v_tenant <> public.get_user_tenant_id(v_auth) THEN RAISE EXCEPTION 'access denied'; END IF;
  IF NOT (public.has_role(v_auth, v_tenant, 'admin') OR public.has_role(v_auth, v_tenant, 'editor')) THEN RAISE EXCEPTION 'insufficient role'; END IF;
  IF v_from = 'resolved' AND p_to IN ('ack','resolved') THEN RAISE EXCEPTION 'invalid transition: resolved -> %', p_to; END IF;
  IF v_from = 'ack' AND p_to = 'open' THEN RAISE EXCEPTION 'invalid transition: ack -> open'; END IF;
  UPDATE public.alert_instances SET status = p_to,
    acknowledged_at = CASE WHEN p_to = 'ack' THEN COALESCE(acknowledged_at, now()) ELSE acknowledged_at END,
    acknowledged_by = CASE WHEN p_to = 'ack' THEN COALESCE(acknowledged_by, v_auth) ELSE acknowledged_by END,
    resolved_at = CASE WHEN p_to = 'resolved' THEN COALESCE(resolved_at, now()) ELSE resolved_at END,
    resolved_by = CASE WHEN p_to = 'resolved' THEN COALESCE(resolved_by, v_auth) ELSE resolved_by END,
    updated_at = now()
  WHERE id = p_alert_id;
  INSERT INTO public.alert_events(tenant_id, alert_id, event_type, from_status, to_status, user_id, message, payload)
  VALUES (v_tenant, p_alert_id,
    CASE WHEN v_from = 'open' AND p_to = 'ack' THEN 'ACK' WHEN p_to = 'resolved' THEN 'RESOLVE' ELSE 'UPDATE' END,
    v_from, p_to, v_auth, p_message, COALESCE(p_payload,'{}'::jsonb));
END;
$$;

-- SLA apply on alert insert
CREATE OR REPLACE FUNCTION alert_apply_sla()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO public, pg_temp
AS $$
DECLARE v_ack_seconds INT; v_resolve_seconds INT; v_sla_id UUID;
BEGIN
  SELECT sla_policy_id INTO v_sla_id FROM public.alert_rules WHERE id = NEW.rule_id;
  IF v_sla_id IS NULL THEN RETURN NEW; END IF;
  SELECT ack_target_seconds, resolve_target_seconds INTO v_ack_seconds, v_resolve_seconds FROM public.sla_policies WHERE id = v_sla_id;
  IF NEW.ack_due_at IS NULL THEN NEW.ack_due_at := NEW.opened_at + make_interval(secs => v_ack_seconds); END IF;
  IF NEW.resolve_due_at IS NULL THEN NEW.resolve_due_at := NEW.opened_at + make_interval(secs => v_resolve_seconds); END IF;
  RETURN NEW;
END;
$$;

-- SLA breach sweep
CREATE OR REPLACE FUNCTION sla_sweep_breaches(p_tenant_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE v_count INT := 0; v_c2 INT := 0;
BEGIN
  UPDATE public.alert_instances SET ack_breached_at = COALESCE(ack_breached_at, now()), updated_at = now()
  WHERE status = 'open' AND suppressed = false AND ack_due_at IS NOT NULL AND ack_breached_at IS NULL AND now() > ack_due_at
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE public.alert_instances SET resolve_breached_at = COALESCE(resolve_breached_at, now()), updated_at = now()
  WHERE status IN ('open','ack') AND suppressed = false AND resolve_due_at IS NOT NULL AND resolve_breached_at IS NULL AND now() > resolve_due_at
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
  GET DIAGNOSTICS v_c2 = ROW_COUNT;
  RETURN v_count + v_c2;
END;
$$;

-- Maintenance window check
CREATE OR REPLACE FUNCTION is_in_maintenance(p_tenant_id UUID, p_now TIMESTAMPTZ, p_scope JSONB DEFAULT '{}'::jsonb)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
  SELECT mw.id FROM public.maintenance_windows mw
  WHERE mw.tenant_id = p_tenant_id AND mw.is_active = true AND p_now >= mw.starts_at AND p_now < mw.ends_at
    AND EXISTS (
      SELECT 1 FROM public.maintenance_scopes ms
      WHERE ms.maintenance_id = mw.id AND ms.tenant_id = p_tenant_id
        AND (ms.scope_type = 'tenant_all'
          OR (ms.scope_type = 'zabbix_connection' AND ms.scope_value = (p_scope->>'zabbix_connection_id'))
          OR (ms.scope_type = 'dashboard' AND ms.scope_value = (p_scope->>'dashboard_id'))
          OR (ms.scope_type = 'trigger' AND ms.scope_value = (p_scope->>'triggerid'))
          OR (ms.scope_type = 'host' AND ms.scope_value = (p_scope->>'hostid'))
          OR (ms.scope_type = 'hostgroup' AND ms.scope_value = (p_scope->>'hostgroupid'))
          OR (ms.scope_type = 'tag' AND ms.scope_value = (p_scope->>'tag')))
    )
  ORDER BY mw.starts_at DESC LIMIT 1;
$$;

-- ═══════════════════════════════════════════════════
-- ─── TOPOLOGICAL PROPAGATION ENGINE ──────────────
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_map_effective_status(p_map_id UUID)
RETURNS TABLE(host_id UUID, effective_status TEXT, is_root_cause BOOLEAN, depth INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public, pg_temp
SET row_security TO on
AS $$
WITH
guard AS (
  SELECT m.id FROM public.flow_maps m
  WHERE m.id = p_map_id AND m.tenant_id = public.jwt_tenant_id()
),
map_nodes AS (
  SELECT h.id, h.current_status
  FROM public.flow_map_hosts h
  JOIN guard g ON g.id = h.map_id
),
roots AS (
  SELECT DISTINCT n.id FROM map_nodes n
  WHERE n.current_status <> 'DOWN'
    AND EXISTS (
      SELECT 1 FROM public.flow_map_links l
      JOIN guard g ON g.id = l.map_id
      WHERE l.map_id = p_map_id
        AND ((l.origin_host_id = n.id AND l.origin_role = 'CORE')
          OR (l.dest_host_id = n.id AND l.dest_role = 'CORE'))
    )
),
fallback_roots AS (
  SELECT DISTINCT n.id FROM map_nodes n
  WHERE n.current_status <> 'DOWN'
    AND NOT EXISTS (SELECT 1 FROM roots)
    AND EXISTS (
      SELECT 1 FROM public.flow_map_links l
      JOIN guard g ON g.id = l.map_id
      WHERE l.map_id = p_map_id
        AND (l.origin_host_id = n.id OR l.dest_host_id = n.id)
    )
),
seed AS (
  SELECT id FROM roots UNION SELECT id FROM fallback_roots
),
reachable AS (
  WITH RECURSIVE r(id, depth, visited) AS (
    SELECT s.id, 0, ARRAY[s.id] FROM seed s
    UNION ALL
    SELECT
      CASE WHEN l.origin_host_id = r.id THEN l.dest_host_id ELSE l.origin_host_id END,
      r.depth + 1,
      r.visited || CASE WHEN l.origin_host_id = r.id THEN l.dest_host_id ELSE l.origin_host_id END
    FROM r
    JOIN public.flow_map_links l ON l.map_id = p_map_id AND (l.origin_host_id = r.id OR l.dest_host_id = r.id)
    JOIN map_nodes nb ON nb.id = CASE WHEN l.origin_host_id = r.id THEN l.dest_host_id ELSE l.origin_host_id END
    WHERE nb.current_status <> 'DOWN'
      AND NOT (CASE WHEN l.origin_host_id = r.id THEN l.dest_host_id ELSE l.origin_host_id END = ANY(r.visited))
  )
  SELECT id, MIN(depth) AS depth FROM r GROUP BY id
)
SELECT
  n.id AS host_id,
  CASE
    WHEN n.current_status = 'DOWN' THEN 'DOWN'
    WHEN r.id IS NOT NULL THEN n.current_status::text
    ELSE 'ISOLATED'
  END AS effective_status,
  (n.current_status = 'DOWN') AS is_root_cause,
  COALESCE(r.depth, -1)::int AS depth
FROM map_nodes n
LEFT JOIN reachable r ON r.id = n.id;
$$;

COMMIT;

-- ═══════════════════════════════════════════════════
-- FIM DO SCHEMA — FLOWPULSE INTELLIGENCE v1.2
-- © 2026 CBLabs
-- ═══════════════════════════════════════════════════
