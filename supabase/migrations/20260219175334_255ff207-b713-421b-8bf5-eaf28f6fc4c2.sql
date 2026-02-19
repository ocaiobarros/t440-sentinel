
-- Create rms_connections table (parallel to zabbix_connections)
CREATE TABLE public.rms_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  token_ciphertext TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  token_tag TEXT NOT NULL,
  encryption_version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rms_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rms_connections FORCE ROW LEVEL SECURITY;

-- RLS policies (mirror zabbix_connections)
CREATE POLICY "rms_select" ON public.rms_connections
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "rms_insert" ON public.rms_connections
  FOR INSERT WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid())
    AND has_role(auth.uid(), tenant_id, 'admin')
  );

CREATE POLICY "rms_update" ON public.rms_connections
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), tenant_id, 'admin'))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), tenant_id, 'admin'));

CREATE POLICY "rms_delete" ON public.rms_connections
  FOR DELETE USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND has_role(auth.uid(), tenant_id, 'admin')
  );

-- Immutable tenant_id trigger
CREATE TRIGGER prevent_rms_tenant_change
  BEFORE UPDATE ON public.rms_connections
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_change();

-- Auto-update updated_at
CREATE TRIGGER update_rms_connections_updated_at
  BEFORE UPDATE ON public.rms_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Revoke anon access
REVOKE ALL ON public.rms_connections FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rms_connections TO authenticated;
