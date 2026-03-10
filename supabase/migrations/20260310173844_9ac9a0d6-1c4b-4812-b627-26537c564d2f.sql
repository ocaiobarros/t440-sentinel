
-- Add missing performance index on team_members(tenant_id) for RLS scans
CREATE INDEX IF NOT EXISTS idx_team_members_tenant_id ON public.team_members(tenant_id);
