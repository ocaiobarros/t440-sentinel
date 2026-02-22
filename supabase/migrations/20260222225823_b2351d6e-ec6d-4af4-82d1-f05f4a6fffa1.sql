
-- 1. Extend app_role enum with tech and sales
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'tech';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales';

-- 2. Create flow_audit_logs table
CREATE TABLE public.flow_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  user_id UUID,
  user_email TEXT,
  action TEXT NOT NULL, -- INSERT, UPDATE, DELETE
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast queries
CREATE INDEX idx_flow_audit_tenant_created ON public.flow_audit_logs (tenant_id, created_at DESC);
CREATE INDEX idx_flow_audit_table ON public.flow_audit_logs (table_name, created_at DESC);

-- Enable RLS
ALTER TABLE public.flow_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "audit_select_admin" ON public.flow_audit_logs
  FOR SELECT USING (
    (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), tenant_id, 'admin'))
    OR is_super_admin(auth.uid())
  );

-- No direct insert/update/delete from clients — only triggers
REVOKE INSERT, UPDATE, DELETE ON public.flow_audit_logs FROM authenticated;
REVOKE ALL ON public.flow_audit_logs FROM anon;

-- 3. Create audit trigger function
CREATE OR REPLACE FUNCTION public.flow_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
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
  
  -- Get email from profiles
  SELECT email INTO v_email FROM public.profiles WHERE id = v_user_id;

  IF TG_OP = 'DELETE' THEN
    v_tenant := OLD.tenant_id;
    v_record_id := OLD.id;
    v_old := to_jsonb(OLD);
    v_new := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_tenant := NEW.tenant_id;
    v_record_id := NEW.id;
    v_old := NULL;
    v_new := to_jsonb(NEW);
  ELSE -- UPDATE
    v_tenant := NEW.tenant_id;
    v_record_id := NEW.id;
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  END IF;

  INSERT INTO public.flow_audit_logs (tenant_id, user_id, user_email, action, table_name, record_id, old_data, new_data)
  VALUES (v_tenant, v_user_id, v_email, TG_OP, TG_TABLE_NAME, v_record_id, v_old, v_new);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 4. Attach triggers to flow_map_ctos, flow_map_cables, flow_map_reservas
CREATE TRIGGER audit_flow_map_ctos
  AFTER INSERT OR UPDATE OR DELETE ON public.flow_map_ctos
  FOR EACH ROW EXECUTE FUNCTION public.flow_audit_trigger();

CREATE TRIGGER audit_flow_map_cables
  AFTER INSERT OR UPDATE OR DELETE ON public.flow_map_cables
  FOR EACH ROW EXECUTE FUNCTION public.flow_audit_trigger();

CREATE TRIGGER audit_flow_map_reservas
  AFTER INSERT OR UPDATE OR DELETE ON public.flow_map_reservas
  FOR EACH ROW EXECUTE FUNCTION public.flow_audit_trigger();

-- 5. Grant select to authenticated (RLS handles filtering)
GRANT SELECT ON public.flow_audit_logs TO authenticated;

-- 6. Create helper function to check flowmap-specific roles
CREATE OR REPLACE FUNCTION public.has_any_role(p_user_id UUID, p_tenant_id UUID, p_roles app_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
SET row_security = 'off'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id
      AND tenant_id = p_tenant_id
      AND role = ANY(p_roles)
  );
$$;
