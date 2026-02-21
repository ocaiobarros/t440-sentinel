
-- =========================================
-- FLOWMAP TABLES
-- =========================================

CREATE TABLE public.flow_maps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  center_lat DOUBLE PRECISION NOT NULL DEFAULT -20.4630,
  center_lon DOUBLE PRECISION NOT NULL DEFAULT -54.6190,
  zoom INTEGER NOT NULL DEFAULT 6,
  theme TEXT NOT NULL DEFAULT 'dark',
  refresh_interval INTEGER NOT NULL DEFAULT 30 CHECK (refresh_interval BETWEEN 10 AND 300),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_flow_maps_id_tenant UNIQUE (id, tenant_id)
);

CREATE TABLE public.flow_map_hosts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  zabbix_host_id TEXT NOT NULL,
  host_name TEXT NOT NULL DEFAULT '',
  host_group TEXT NOT NULL DEFAULT '',
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  icon_type TEXT NOT NULL DEFAULT 'router',
  is_critical BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_host_map
    FOREIGN KEY (map_id, tenant_id)
    REFERENCES public.flow_maps(id, tenant_id)
    ON DELETE CASCADE,

  CONSTRAINT unique_host_per_map UNIQUE (map_id, zabbix_host_id)
);

CREATE TABLE public.flow_map_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  origin_host_id UUID NOT NULL REFERENCES public.flow_map_hosts(id) ON DELETE CASCADE,
  dest_host_id UUID NOT NULL REFERENCES public.flow_map_hosts(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL DEFAULT 'fiber',
  is_ring BOOLEAN NOT NULL DEFAULT false,
  priority INTEGER NOT NULL DEFAULT 0,
  geometry JSONB NOT NULL DEFAULT '{"type":"LineString","coordinates":[]}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_link_map
    FOREIGN KEY (map_id, tenant_id)
    REFERENCES public.flow_maps(id, tenant_id)
    ON DELETE CASCADE,

  CONSTRAINT no_self_link CHECK (origin_host_id <> dest_host_id),

  CONSTRAINT geometry_valid CHECK (
    geometry->>'type' = 'LineString'
  )
);

-- Unique index with LEAST/GREATEST (expressions require index, not constraint)
CREATE UNIQUE INDEX idx_unique_link_pair_normalized
  ON public.flow_map_links (map_id, LEAST(origin_host_id, dest_host_id), GREATEST(origin_host_id, dest_host_id));

-- =========================================
-- INDEXES
-- =========================================

CREATE INDEX idx_flow_maps_tenant_id ON public.flow_maps(tenant_id);
CREATE INDEX idx_flow_map_hosts_map_id ON public.flow_map_hosts(map_id);
CREATE INDEX idx_flow_map_hosts_tenant_id ON public.flow_map_hosts(tenant_id);
CREATE INDEX idx_flow_map_links_map_id ON public.flow_map_links(map_id);
CREATE INDEX idx_flow_map_links_tenant_id ON public.flow_map_links(tenant_id);
CREATE INDEX idx_flow_map_links_origin ON public.flow_map_links(origin_host_id);
CREATE INDEX idx_flow_map_links_dest ON public.flow_map_links(dest_host_id);

-- =========================================
-- ROW LEVEL SECURITY
-- =========================================

ALTER TABLE public.flow_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_map_hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_map_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fm_select" ON public.flow_maps FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "fm_insert" ON public.flow_maps FOR INSERT
  WITH CHECK (
    (tenant_id = get_user_tenant_id(auth.uid()) 
      AND (has_role(auth.uid(), tenant_id, 'admin') 
      OR has_role(auth.uid(), tenant_id, 'editor')))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "fm_update" ON public.flow_maps FOR UPDATE
  USING (
    (tenant_id = get_user_tenant_id(auth.uid()) 
      AND (has_role(auth.uid(), tenant_id, 'admin') 
      OR has_role(auth.uid(), tenant_id, 'editor')))
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "fm_delete" ON public.flow_maps FOR DELETE
  USING (
    (tenant_id = get_user_tenant_id(auth.uid()) 
      AND has_role(auth.uid(), tenant_id, 'admin'))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "fmh_select" ON public.flow_map_hosts FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "fmh_manage" ON public.flow_map_hosts FOR ALL
  USING (
    (tenant_id = get_user_tenant_id(auth.uid()) 
      AND (has_role(auth.uid(), tenant_id, 'admin') 
      OR has_role(auth.uid(), tenant_id, 'editor')))
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    (tenant_id = get_user_tenant_id(auth.uid()) 
      AND (has_role(auth.uid(), tenant_id, 'admin') 
      OR has_role(auth.uid(), tenant_id, 'editor')))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "fml_select" ON public.flow_map_links FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "fml_manage" ON public.flow_map_links FOR ALL
  USING (
    (tenant_id = get_user_tenant_id(auth.uid()) 
      AND (has_role(auth.uid(), tenant_id, 'admin') 
      OR has_role(auth.uid(), tenant_id, 'editor')))
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    (tenant_id = get_user_tenant_id(auth.uid()) 
      AND (has_role(auth.uid(), tenant_id, 'admin') 
      OR has_role(auth.uid(), tenant_id, 'editor')))
    OR is_super_admin(auth.uid())
  );

-- =========================================
-- TRIGGERS
-- =========================================

CREATE TRIGGER update_flow_maps_updated_at
  BEFORE UPDATE ON public.flow_maps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_flow_map_hosts_updated_at
  BEFORE UPDATE ON public.flow_map_hosts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_flow_map_links_updated_at
  BEFORE UPDATE ON public.flow_map_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
