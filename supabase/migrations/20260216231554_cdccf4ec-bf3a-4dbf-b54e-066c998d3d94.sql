
-- =========================================================
-- FLOWPULSE ALERT ENGINE — FULL SCHEMA + HARDENING FIXES
-- =========================================================

-- 1) ENUMS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_status' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.alert_status AS ENUM ('open', 'ack', 'resolved');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'severity_level' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.severity_level AS ENUM ('info', 'warning', 'average', 'high', 'disaster');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notify_channel' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.notify_channel AS ENUM ('webhook', 'slack', 'email', 'sms', 'telegram');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'maintenance_scope_type' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.maintenance_scope_type AS ENUM ('tenant_all', 'zabbix_connection', 'dashboard', 'host', 'hostgroup', 'trigger', 'tag');
  END IF;
END $$;

-- 2) TABLES

CREATE TABLE IF NOT EXISTS public.notification_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel public.notify_channel NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS public.escalation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS public.escalation_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES public.escalation_policies(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  delay_seconds INTEGER NOT NULL DEFAULT 0,
  channel_id UUID NOT NULL REFERENCES public.notification_channels(id) ON DELETE RESTRICT,
  target JSONB NOT NULL DEFAULT '{}'::jsonb,
  throttle_seconds INTEGER NOT NULL DEFAULT 60,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(policy_id, step_order)
);

CREATE TABLE IF NOT EXISTS public.sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  ack_target_seconds INTEGER NOT NULL DEFAULT 900,
  resolve_target_seconds INTEGER NOT NULL DEFAULT 3600,
  business_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS public.maintenance_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.maintenance_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  maintenance_id UUID NOT NULL REFERENCES public.maintenance_windows(id) ON DELETE CASCADE,
  scope_type public.maintenance_scope_type NOT NULL,
  scope_value TEXT,
  scope_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  zabbix_connection_id UUID REFERENCES public.zabbix_connections(id) ON DELETE SET NULL,
  dashboard_id UUID REFERENCES public.dashboards(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  source TEXT NOT NULL DEFAULT 'zabbix',
  matchers JSONB NOT NULL DEFAULT '{}'::jsonb,
  severity public.severity_level NOT NULL DEFAULT 'high',
  dedupe_key_template TEXT NOT NULL DEFAULT '{{source}}:{{triggerid}}',
  auto_resolve BOOLEAN NOT NULL DEFAULT true,
  resolve_on_missing BOOLEAN NOT NULL DEFAULT false,
  sla_policy_id UUID REFERENCES public.sla_policies(id) ON DELETE SET NULL,
  escalation_policy_id UUID REFERENCES public.escalation_policies(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS public.alert_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.alert_rules(id) ON DELETE SET NULL,
  dedupe_key TEXT NOT NULL,
  status public.alert_status NOT NULL DEFAULT 'open',
  severity public.severity_level NOT NULL DEFAULT 'high',
  title TEXT NOT NULL,
  summary TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  suppressed BOOLEAN NOT NULL DEFAULT false,
  suppressed_by_maintenance_id UUID REFERENCES public.maintenance_windows(id) ON DELETE SET NULL,
  ack_due_at TIMESTAMPTZ,
  resolve_due_at TIMESTAMPTZ,
  ack_breached_at TIMESTAMPTZ,
  resolve_breached_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, dedupe_key)
);

CREATE TABLE IF NOT EXISTS public.alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  alert_id UUID NOT NULL REFERENCES public.alert_instances(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status public.alert_status,
  to_status public.alert_status,
  user_id UUID REFERENCES auth.users(id),
  message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.alert_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  alert_id UUID NOT NULL REFERENCES public.alert_instances(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES public.escalation_policies(id) ON DELETE SET NULL,
  step_id UUID REFERENCES public.escalation_steps(id) ON DELETE SET NULL,
  channel_id UUID REFERENCES public.notification_channels(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  request JSONB NOT NULL DEFAULT '{}'::jsonb,
  response JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) INDEXES
CREATE INDEX IF NOT EXISTS idx_alert_rules_tenant_enabled ON public.alert_rules(tenant_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_alert_instances_tenant_status ON public.alert_instances(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_alert_instances_tenant_dedupe ON public.alert_instances(tenant_id, dedupe_key);
CREATE INDEX IF NOT EXISTS idx_alert_instances_opened ON public.alert_instances(opened_at);
CREATE INDEX IF NOT EXISTS idx_alert_events_alert_time ON public.alert_events(alert_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_maint_windows_tenant_time ON public.maintenance_windows(tenant_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_maint_scopes_maint ON public.maintenance_scopes(maintenance_id, scope_type);
CREATE INDEX IF NOT EXISTS idx_escalation_steps_policy_order ON public.escalation_steps(policy_id, step_order);
CREATE INDEX IF NOT EXISTS idx_notifications_pending ON public.alert_notifications(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_dashboards_default ON public.dashboards(tenant_id) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_zbx_active_lookup ON public.zabbix_connections(tenant_id, id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_widgets_query_source ON public.widgets((query->>'source'));

-- 4) FORCE RLS + REVOKE on all tables
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.zabbix_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dashboards FORCE ROW LEVEL SECURITY;
ALTER TABLE public.widgets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.notification_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_channels FORCE ROW LEVEL SECURITY;
ALTER TABLE public.escalation_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalation_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.escalation_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalation_steps FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_windows FORCE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_scopes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.alert_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_instances FORCE ROW LEVEL SECURITY;
ALTER TABLE public.alert_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.alert_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_notifications FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.notification_channels FROM anon;
REVOKE ALL ON public.escalation_policies FROM anon;
REVOKE ALL ON public.escalation_steps FROM anon;
REVOKE ALL ON public.sla_policies FROM anon;
REVOKE ALL ON public.maintenance_windows FROM anon;
REVOKE ALL ON public.maintenance_scopes FROM anon;
REVOKE ALL ON public.alert_rules FROM anon;
REVOKE ALL ON public.alert_instances FROM anon;
REVOKE ALL ON public.alert_events FROM anon;
REVOKE ALL ON public.alert_notifications FROM anon;

-- 5) FIX A: MAINTENANCE WINDOW VALIDATION TRIGGER
CREATE OR REPLACE FUNCTION public.validate_maintenance_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.ends_at <= NEW.starts_at THEN
    RAISE EXCEPTION 'ends_at must be after starts_at';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_validate_maintenance_window ON public.maintenance_windows;
CREATE TRIGGER tr_validate_maintenance_window
BEFORE INSERT OR UPDATE ON public.maintenance_windows
FOR EACH ROW EXECUTE FUNCTION public.validate_maintenance_window();

-- 6) FIX B: RLS POLICIES (clean drop + recreate)
CREATE POLICY nc_select ON public.notification_channels FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY ep_select ON public.escalation_policies FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY es_select ON public.escalation_steps FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY sla_select ON public.sla_policies FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY mw_select ON public.maintenance_windows FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY ms_select ON public.maintenance_scopes FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY ar_select ON public.alert_rules FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY ai_select ON public.alert_instances FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY ae_select ON public.alert_events FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY an_select ON public.alert_notifications FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY ar_manage ON public.alert_rules FOR ALL TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (public.has_role(auth.uid(), tenant_id, 'admin') OR public.has_role(auth.uid(), tenant_id, 'editor'))
)
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (public.has_role(auth.uid(), tenant_id, 'admin') OR public.has_role(auth.uid(), tenant_id, 'editor'))
);

CREATE POLICY mw_manage ON public.maintenance_windows FOR ALL TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (public.has_role(auth.uid(), tenant_id, 'admin') OR public.has_role(auth.uid(), tenant_id, 'editor'))
)
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (public.has_role(auth.uid(), tenant_id, 'admin') OR public.has_role(auth.uid(), tenant_id, 'editor'))
);

CREATE POLICY ms_manage ON public.maintenance_scopes FOR ALL TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (public.has_role(auth.uid(), tenant_id, 'admin') OR public.has_role(auth.uid(), tenant_id, 'editor'))
)
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (public.has_role(auth.uid(), tenant_id, 'admin') OR public.has_role(auth.uid(), tenant_id, 'editor'))
);

CREATE POLICY ai_update_ack_resolve ON public.alert_instances FOR UPDATE TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (public.has_role(auth.uid(), tenant_id, 'admin') OR public.has_role(auth.uid(), tenant_id, 'editor'))
)
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 7) FIX C: ALERT TRANSITION (hardened)
CREATE OR REPLACE FUNCTION public.alert_transition(
  p_alert_id UUID,
  p_to public.alert_status,
  p_user_id UUID,
  p_message TEXT DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from public.alert_status;
  v_tenant UUID;
  v_auth UUID;
BEGIN
  v_auth := auth.uid();
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_user_id IS NULL OR p_user_id <> v_auth THEN
    RAISE EXCEPTION 'invalid user';
  END IF;

  SELECT status, tenant_id INTO v_from, v_tenant
  FROM public.alert_instances WHERE id = p_alert_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'alert not found'; END IF;
  IF v_tenant <> public.get_user_tenant_id(v_auth) THEN RAISE EXCEPTION 'access denied'; END IF;
  IF NOT (public.has_role(v_auth, v_tenant, 'admin') OR public.has_role(v_auth, v_tenant, 'editor')) THEN
    RAISE EXCEPTION 'insufficient role';
  END IF;

  IF v_from = 'resolved' AND p_to IN ('ack','resolved') THEN
    RAISE EXCEPTION 'invalid transition: resolved -> %', p_to;
  END IF;
  IF v_from = 'ack' AND p_to = 'open' THEN
    RAISE EXCEPTION 'invalid transition: ack -> open';
  END IF;

  UPDATE public.alert_instances
  SET status = p_to,
      acknowledged_at = CASE WHEN p_to = 'ack' THEN COALESCE(acknowledged_at, now()) ELSE acknowledged_at END,
      acknowledged_by = CASE WHEN p_to = 'ack' THEN COALESCE(acknowledged_by, v_auth) ELSE acknowledged_by END,
      resolved_at = CASE WHEN p_to = 'resolved' THEN COALESCE(resolved_at, now()) ELSE resolved_at END,
      resolved_by = CASE WHEN p_to = 'resolved' THEN COALESCE(resolved_by, v_auth) ELSE resolved_by END,
      updated_at = now()
  WHERE id = p_alert_id;

  INSERT INTO public.alert_events(tenant_id, alert_id, event_type, from_status, to_status, user_id, message, payload)
  VALUES (
    v_tenant, p_alert_id,
    CASE WHEN v_from = 'open' AND p_to = 'ack' THEN 'ACK' WHEN p_to = 'resolved' THEN 'RESOLVE' ELSE 'UPDATE' END,
    v_from, p_to, v_auth, p_message, COALESCE(p_payload,'{}'::jsonb)
  );
END;
$$;

-- 8) SLA APPLY TRIGGER
CREATE OR REPLACE FUNCTION public.alert_apply_sla()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ack_seconds INT;
  v_resolve_seconds INT;
  v_sla_id UUID;
BEGIN
  SELECT sla_policy_id INTO v_sla_id FROM public.alert_rules WHERE id = NEW.rule_id;
  IF v_sla_id IS NULL THEN RETURN NEW; END IF;
  SELECT ack_target_seconds, resolve_target_seconds INTO v_ack_seconds, v_resolve_seconds FROM public.sla_policies WHERE id = v_sla_id;
  IF NEW.ack_due_at IS NULL THEN NEW.ack_due_at := NEW.opened_at + make_interval(secs => v_ack_seconds); END IF;
  IF NEW.resolve_due_at IS NULL THEN NEW.resolve_due_at := NEW.opened_at + make_interval(secs => v_resolve_seconds); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_alert_apply_sla ON public.alert_instances;
CREATE TRIGGER tr_alert_apply_sla
BEFORE INSERT ON public.alert_instances
FOR EACH ROW EXECUTE FUNCTION public.alert_apply_sla();

-- 9) SLA BREACH SWEEP
CREATE OR REPLACE FUNCTION public.sla_sweep_breaches(p_tenant_id UUID DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

-- 10) MAINTENANCE MATCH HELPER
CREATE OR REPLACE FUNCTION public.is_in_maintenance(
  p_tenant_id UUID,
  p_now TIMESTAMPTZ,
  p_scope JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
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
          OR (ms.scope_type = 'tag' AND ms.scope_value = (p_scope->>'tag'))
        )
    )
  ORDER BY mw.starts_at DESC LIMIT 1;
$$;
