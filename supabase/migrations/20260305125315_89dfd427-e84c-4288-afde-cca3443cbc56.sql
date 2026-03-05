CREATE OR REPLACE FUNCTION public.has_resource_access(
  p_user_id uuid,
  p_tenant_id uuid,
  p_resource_type text,
  p_resource_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
SET row_security = 'off'
AS $function$
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

    -- Team grant (resilient to legacy tenant_id mismatch in team_members)
    OR EXISTS (
      SELECT 1
      FROM public.resource_access ra
      JOIN public.teams t
        ON t.id = ra.grantee_id
       AND t.tenant_id = ra.tenant_id
      JOIN public.team_members tm
        ON tm.team_id = t.id
       AND tm.user_id = p_user_id
      JOIN public.profiles p
        ON p.id = tm.user_id
       AND p.tenant_id = ra.tenant_id
      WHERE ra.tenant_id = p_tenant_id
        AND ra.resource_type = p_resource_type
        AND ra.resource_id = p_resource_id
        AND ra.grantee_type = 'team'
    );
$function$;