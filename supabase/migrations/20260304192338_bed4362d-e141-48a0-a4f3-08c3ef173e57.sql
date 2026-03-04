
CREATE OR REPLACE FUNCTION public.diagnose_resource_access(
  p_user_id uuid,
  p_resource_type text,
  p_resource_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_tenant_id uuid;
  v_jwt_tenant uuid;
  v_result jsonb;
  v_direct_grants jsonb;
  v_team_grants jsonb;
  v_user_teams jsonb;
  v_is_admin boolean;
  v_is_super boolean;
  v_is_creator boolean;
  v_has_access boolean;
BEGIN
  -- Get user's tenant from profile
  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = p_user_id;
  
  -- Get JWT tenant (will be null when called via service role)
  v_jwt_tenant := public.get_user_tenant_id(p_user_id);
  
  -- Check roles
  v_is_admin := public.has_role(p_user_id, v_tenant_id, 'admin'::app_role);
  v_is_super := public.is_super_admin(p_user_id);
  v_is_creator := public.is_resource_creator(p_user_id, p_resource_type, p_resource_id);
  
  -- Check has_resource_access
  v_has_access := public.has_resource_access(p_user_id, v_tenant_id, p_resource_type, p_resource_id);
  
  -- Get direct user grants
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ra.id, 'grantee_type', ra.grantee_type, 'grantee_id', ra.grantee_id, 
    'access_level', ra.access_level, 'tenant_id', ra.tenant_id
  )), '[]'::jsonb)
  INTO v_direct_grants
  FROM public.resource_access ra
  WHERE ra.resource_type = p_resource_type
    AND ra.resource_id = p_resource_id
    AND ra.grantee_type = 'user'
    AND ra.grantee_id = p_user_id;
  
  -- Get user's teams
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'team_id', tm.team_id, 'team_name', t.name, 'tenant_id', tm.tenant_id
  )), '[]'::jsonb)
  INTO v_user_teams
  FROM public.team_members tm
  JOIN public.teams t ON t.id = tm.team_id
  WHERE tm.user_id = p_user_id;
  
  -- Get team grants for this resource
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ra.id, 'grantee_type', ra.grantee_type, 'grantee_id', ra.grantee_id,
    'access_level', ra.access_level, 'tenant_id', ra.tenant_id,
    'team_name', t.name
  )), '[]'::jsonb)
  INTO v_team_grants
  FROM public.resource_access ra
  JOIN public.teams t ON t.id = ra.grantee_id
  WHERE ra.resource_type = p_resource_type
    AND ra.resource_id = p_resource_id
    AND ra.grantee_type = 'team';
  
  -- Get resource tenant
  v_result := jsonb_build_object(
    'user_id', p_user_id,
    'user_tenant_id', v_tenant_id,
    'jwt_tenant_id', v_jwt_tenant,
    'tenant_match', v_tenant_id = v_jwt_tenant,
    'is_admin', v_is_admin,
    'is_super_admin', v_is_super,
    'is_creator', v_is_creator,
    'has_resource_access_result', v_has_access,
    'direct_user_grants', v_direct_grants,
    'user_teams', v_user_teams,
    'team_grants_for_resource', v_team_grants,
    'resource_type', p_resource_type,
    'resource_id', p_resource_id
  );
  
  -- Add resource tenant_id
  IF p_resource_type = 'dashboard' THEN
    SELECT v_result || jsonb_build_object('resource_tenant_id', d.tenant_id, 'resource_name', d.name)
    INTO v_result
    FROM public.dashboards d WHERE d.id = p_resource_id;
  ELSIF p_resource_type = 'flow_map' THEN
    SELECT v_result || jsonb_build_object('resource_tenant_id', fm.tenant_id, 'resource_name', fm.name)
    INTO v_result
    FROM public.flow_maps fm WHERE fm.id = p_resource_id;
  END IF;
  
  RETURN v_result;
END;
$$;
