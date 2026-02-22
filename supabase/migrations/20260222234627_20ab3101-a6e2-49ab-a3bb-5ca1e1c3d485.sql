
-- Drop CHECK constraints que comparam TEXT (conflitam com ENUM)
ALTER TABLE public.flow_map_links DROP CONSTRAINT IF EXISTS chk_current_status;
ALTER TABLE public.flow_map_link_events DROP CONSTRAINT IF EXISTS flow_map_link_events_status_check;

-- Criar ENUM
DO $$ BEGIN CREATE TYPE public.link_status AS ENUM ('UP', 'DOWN', 'DEGRADED', 'UNKNOWN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Converter flow_map_links
ALTER TABLE public.flow_map_links ALTER COLUMN current_status DROP DEFAULT;
ALTER TABLE public.flow_map_links ALTER COLUMN current_status TYPE public.link_status USING current_status::text::public.link_status;
ALTER TABLE public.flow_map_links ALTER COLUMN current_status SET DEFAULT 'UNKNOWN'::public.link_status;

-- Converter flow_map_link_events (adicionar UNKNOWN ao ENUM que antes não estava no CHECK)
ALTER TABLE public.flow_map_link_events ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.flow_map_link_events ALTER COLUMN status TYPE public.link_status USING status::text::public.link_status;
ALTER TABLE public.flow_map_link_events ALTER COLUMN status SET DEFAULT 'UNKNOWN'::public.link_status;

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_alert_instances_tenant_status ON public.alert_instances (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_alert_instances_dedupe ON public.alert_instances (dedupe_key);
CREATE INDEX IF NOT EXISTS idx_alert_notifications_alert_id ON public.alert_notifications (alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_instances_rule_id ON public.alert_instances (rule_id);
CREATE INDEX IF NOT EXISTS idx_alert_instances_open_only ON public.alert_instances (tenant_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_flow_map_link_events_open ON public.flow_map_link_events (tenant_id, link_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_roles_user_tenant ON public.user_roles (user_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_active_lookup ON public.maintenance_windows (tenant_id, starts_at, ends_at) WHERE is_active = true;

-- Unique bidirecional para links
CREATE UNIQUE INDEX IF NOT EXISTS unique_link_per_map ON public.flow_map_links (
  tenant_id, map_id,
  LEAST(origin_host_id, dest_host_id),
  GREATEST(origin_host_id, dest_host_id)
);
