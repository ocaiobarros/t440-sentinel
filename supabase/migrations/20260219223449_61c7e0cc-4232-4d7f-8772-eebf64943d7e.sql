
-- Super admin function: checks if user email is the master account
CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
SET row_security = 'off'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND email = 'caio.barros@madeplant.com.br'
  );
$$;

-- Update tenants policies to allow super_admin full access
DROP POLICY IF EXISTS "tenants_select" ON public.tenants;
CREATE POLICY "tenants_select" ON public.tenants FOR SELECT
  USING (id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "tenants_update" ON public.tenants;
CREATE POLICY "tenants_update" ON public.tenants FOR UPDATE
  USING (
    (id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), id, 'admin'))
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    (id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), id, 'admin'))
    OR is_super_admin(auth.uid())
  );

-- Allow super_admin to INSERT tenants
CREATE POLICY "tenants_insert_super" ON public.tenants FOR INSERT
  WITH CHECK (is_super_admin(auth.uid()));

-- Allow super_admin to DELETE tenants
CREATE POLICY "tenants_delete_super" ON public.tenants FOR DELETE
  USING (is_super_admin(auth.uid()));

-- Update profiles policies for super_admin cross-tenant visibility
DROP POLICY IF EXISTS "profiles_select_tenant" ON public.profiles;
CREATE POLICY "profiles_select_tenant" ON public.profiles FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));

-- Update user_roles for super_admin cross-tenant access
DROP POLICY IF EXISTS "user_roles_select" ON public.user_roles;
CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "user_roles_insert" ON public.user_roles;
CREATE POLICY "user_roles_insert" ON public.user_roles FOR INSERT
  WITH CHECK (
    (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), tenant_id, 'admin'))
    OR is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "user_roles_update" ON public.user_roles;
CREATE POLICY "user_roles_update" ON public.user_roles FOR UPDATE
  USING (
    (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), tenant_id, 'admin'))
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), tenant_id, 'admin'))
    OR is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "user_roles_delete" ON public.user_roles;
CREATE POLICY "user_roles_delete" ON public.user_roles FOR DELETE
  USING (
    (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), tenant_id, 'admin'))
    OR is_super_admin(auth.uid())
  );

-- Zabbix connections super_admin access
DROP POLICY IF EXISTS "zabbix_select" ON public.zabbix_connections;
CREATE POLICY "zabbix_select" ON public.zabbix_connections FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "zabbix_insert" ON public.zabbix_connections;
CREATE POLICY "zabbix_insert" ON public.zabbix_connections FOR INSERT
  WITH CHECK (
    (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), tenant_id, 'admin'))
    OR is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "zabbix_update" ON public.zabbix_connections;
CREATE POLICY "zabbix_update" ON public.zabbix_connections FOR UPDATE
  USING (
    (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), tenant_id, 'admin'))
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), tenant_id, 'admin'))
    OR is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "zabbix_delete" ON public.zabbix_connections;
CREATE POLICY "zabbix_delete" ON public.zabbix_connections FOR DELETE
  USING (
    (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), tenant_id, 'admin'))
    OR is_super_admin(auth.uid())
  );

-- RMS connections super_admin access
DROP POLICY IF EXISTS "rms_select" ON public.rms_connections;
CREATE POLICY "rms_select" ON public.rms_connections FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "rms_insert" ON public.rms_connections;
CREATE POLICY "rms_insert" ON public.rms_connections FOR INSERT
  WITH CHECK (
    (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), tenant_id, 'admin'))
    OR is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "rms_update" ON public.rms_connections;
CREATE POLICY "rms_update" ON public.rms_connections FOR UPDATE
  USING (
    (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), tenant_id, 'admin'))
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), tenant_id, 'admin'))
    OR is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "rms_delete" ON public.rms_connections;
CREATE POLICY "rms_delete" ON public.rms_connections FOR DELETE
  USING (
    (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), tenant_id, 'admin'))
    OR is_super_admin(auth.uid())
  );

-- Dashboards super_admin access
DROP POLICY IF EXISTS "dashboards_select" ON public.dashboards;
CREATE POLICY "dashboards_select" ON public.dashboards FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "dashboards_insert" ON public.dashboards;
CREATE POLICY "dashboards_insert" ON public.dashboards FOR INSERT
  WITH CHECK (
    (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), tenant_id, 'admin') OR has_role(auth.uid(), tenant_id, 'editor')))
    OR is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "dashboards_update" ON public.dashboards;
CREATE POLICY "dashboards_update" ON public.dashboards FOR UPDATE
  USING (
    (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), tenant_id, 'admin') OR has_role(auth.uid(), tenant_id, 'editor')))
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    (tenant_id = get_user_tenant_id(auth.uid()))
    OR is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "dashboards_delete" ON public.dashboards;
CREATE POLICY "dashboards_delete" ON public.dashboards FOR DELETE
  USING (
    (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), tenant_id, 'admin'))
    OR is_super_admin(auth.uid())
  );
