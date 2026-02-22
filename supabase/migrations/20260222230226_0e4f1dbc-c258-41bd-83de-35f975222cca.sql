
-- Telemetry config table for persisting secrets per tenant (encrypted at rest by Supabase)
CREATE TABLE public.telemetry_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_key TEXT NOT NULL,
  config_value TEXT NOT NULL, -- encrypted by AES-GCM in edge function
  iv TEXT, -- initialization vector for AES
  tag TEXT, -- auth tag for AES
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  UNIQUE(tenant_id, config_key)
);

ALTER TABLE public.telemetry_config ENABLE ROW LEVEL SECURITY;

-- Only admins can manage telemetry config
CREATE POLICY "tc_select" ON public.telemetry_config
  FOR SELECT USING (
    (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), tenant_id, 'admin'))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "tc_manage" ON public.telemetry_config
  FOR ALL USING (
    (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), tenant_id, 'admin'))
    OR is_super_admin(auth.uid())
  ) WITH CHECK (
    (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), tenant_id, 'admin'))
    OR is_super_admin(auth.uid())
  );

REVOKE ALL ON public.telemetry_config FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telemetry_config TO authenticated;

-- Track last webhook event timestamp per tenant
CREATE TABLE public.telemetry_heartbeat (
  tenant_id UUID NOT NULL PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  last_webhook_at TIMESTAMPTZ,
  last_webhook_source TEXT,
  event_count BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.telemetry_heartbeat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "th_select" ON public.telemetry_heartbeat
  FOR SELECT USING (
    (tenant_id = get_user_tenant_id(auth.uid()))
    OR is_super_admin(auth.uid())
  );

REVOKE INSERT, UPDATE, DELETE ON public.telemetry_heartbeat FROM authenticated;
REVOKE ALL ON public.telemetry_heartbeat FROM anon;
GRANT SELECT ON public.telemetry_heartbeat TO authenticated;

-- Function to bump heartbeat (called from edge functions via service_role)
CREATE OR REPLACE FUNCTION public.bump_telemetry_heartbeat(p_tenant_id UUID, p_source TEXT DEFAULT 'zabbix-webhook')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
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
