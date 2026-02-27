-- Table to store real host status snapshots from the on-prem agent
CREATE TABLE IF NOT EXISTS public.system_status_snapshots (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  collected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id)
);

-- Allow the edge function (service_role) to read
ALTER TABLE public.system_status_snapshots ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their tenant's snapshot
CREATE POLICY "ss_select" ON public.system_status_snapshots
  FOR SELECT USING (tenant_id = jwt_tenant_id() OR is_super_admin(auth.uid()));

-- Service role inserts/updates via the agent script (no RLS bypass needed since agent uses service_role)
