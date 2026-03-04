
-- Teams table
CREATE TABLE public.teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  color TEXT DEFAULT '#10b981',
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

-- Team members (many-to-many)
CREATE TABLE public.team_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- Enable RLS
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Teams RLS
CREATE POLICY "teams_select" ON public.teams FOR SELECT
  USING (tenant_id = jwt_tenant_id() OR is_super_admin(auth.uid()));

CREATE POLICY "teams_manage" ON public.teams FOR ALL
  USING (
    (tenant_id = jwt_tenant_id() AND (has_role(auth.uid(), tenant_id, 'admin') OR has_role(auth.uid(), tenant_id, 'editor')))
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    (tenant_id = jwt_tenant_id() AND (has_role(auth.uid(), tenant_id, 'admin') OR has_role(auth.uid(), tenant_id, 'editor')))
    OR is_super_admin(auth.uid())
  );

-- Team members RLS
CREATE POLICY "team_members_select" ON public.team_members FOR SELECT
  USING (tenant_id = jwt_tenant_id() OR is_super_admin(auth.uid()));

CREATE POLICY "team_members_manage" ON public.team_members FOR ALL
  USING (
    (tenant_id = jwt_tenant_id() AND (has_role(auth.uid(), tenant_id, 'admin') OR has_role(auth.uid(), tenant_id, 'editor')))
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    (tenant_id = jwt_tenant_id() AND (has_role(auth.uid(), tenant_id, 'admin') OR has_role(auth.uid(), tenant_id, 'editor')))
    OR is_super_admin(auth.uid())
  );

-- Triggers
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER prevent_teams_tenant_change BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION prevent_tenant_change();

CREATE TRIGGER prevent_team_members_tenant_change BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION prevent_tenant_change();
