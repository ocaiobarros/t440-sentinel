
-- 🅲 Performance: Effective status cache table
CREATE TABLE IF NOT EXISTS public.flow_map_effective_cache (
  map_id UUID NOT NULL REFERENCES public.flow_maps(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  payload JSONB NOT NULL DEFAULT '[]'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rpc_duration_ms INTEGER,
  host_count INTEGER,
  max_depth INTEGER,
  PRIMARY KEY (map_id)
);

ALTER TABLE public.flow_map_effective_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cache_select" ON public.flow_map_effective_cache
  FOR SELECT USING (tenant_id = jwt_tenant_id() OR is_super_admin(auth.uid()));

-- No INSERT/UPDATE/DELETE for users — only service role writes

-- 🅲 Performance: Covering index for BFS traversal
CREATE INDEX IF NOT EXISTS idx_fml_map_bfs
  ON public.flow_map_links(map_id, origin_host_id, dest_host_id)
  INCLUDE (origin_role, dest_role);

-- 🅲 Performance: Index for host status lookups during propagation
CREATE INDEX IF NOT EXISTS idx_fmh_map_status
  ON public.flow_map_hosts(map_id, current_status)
  INCLUDE (id);
