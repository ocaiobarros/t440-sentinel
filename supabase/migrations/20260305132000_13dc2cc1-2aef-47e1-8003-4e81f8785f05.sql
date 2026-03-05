
-- 1. Update has_resource_access: remove overly strict profiles join in team path
CREATE OR REPLACE FUNCTION public.has_resource_access(p_user_id uuid, p_tenant_id uuid, p_resource_type text, p_resource_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $$
  SELECT
    -- Admin override
    public.has_role(p_user_id, p_tenant_id, 'admin'::app_role)
    OR public.is_super_admin(p_user_id)

    -- Direct user grant
    OR EXISTS (
      SELECT 1
      FROM public.resource_access ra
      WHERE ra.tenant_id = p_tenant_id
        AND ra.resource_type = p_resource_type
        AND ra.resource_id = p_resource_id
        AND ra.grantee_type = 'user'
        AND ra.grantee_id = p_user_id
    )

    -- Team grant: user is member of the granted team (no profile tenant check)
    OR EXISTS (
      SELECT 1
      FROM public.resource_access ra
      JOIN public.teams t
        ON t.id = ra.grantee_id
       AND t.tenant_id = ra.tenant_id
      JOIN public.team_members tm
        ON tm.team_id = t.id
       AND tm.user_id = p_user_id
      WHERE ra.tenant_id = p_tenant_id
        AND ra.resource_type = p_resource_type
        AND ra.resource_id = p_resource_id
        AND ra.grantee_type = 'team'
    );
$$;

-- 2. Update fm_select: allow access via resource_access even if jwt_tenant doesn't match
DROP POLICY IF EXISTS fm_select ON public.flow_maps;
CREATE POLICY fm_select ON public.flow_maps
  FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (
      (tenant_id = jwt_tenant_id())
      AND (
        has_role(auth.uid(), tenant_id, 'admin'::app_role)
        OR (created_by = auth.uid())
        OR has_resource_access(auth.uid(), tenant_id, 'flow_map'::text, id)
      )
    )
    -- Cross-tenant: user has explicit resource_access grant (via user or team)
    OR has_resource_access(auth.uid(), tenant_id, 'flow_map'::text, id)
  );

-- 3. Same fix for dashboards_select
DROP POLICY IF EXISTS dashboards_select ON public.dashboards;
CREATE POLICY dashboards_select ON public.dashboards
  FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (
      (tenant_id = jwt_tenant_id())
      AND (
        has_role(auth.uid(), tenant_id, 'admin'::app_role)
        OR (created_by = auth.uid())
        OR has_resource_access(auth.uid(), tenant_id, 'dashboard'::text, id)
      )
    )
    OR has_resource_access(auth.uid(), tenant_id, 'dashboard'::text, id)
  );
