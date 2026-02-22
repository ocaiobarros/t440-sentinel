
-- ╔══════════════════════════════════════════════════════════════╗
-- ║  FTTH Passive Network: CTOs & Cables                        ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Enum for CTO capacity
CREATE TYPE public.cto_capacity AS ENUM ('8', '16', '32');

-- Enum for cable type
CREATE TYPE public.cable_type AS ENUM ('AS', 'ASU', 'Geleado', 'ADSS', 'Outro');

-- Enum for CTO calculated status
CREATE TYPE public.cto_status AS ENUM ('OK', 'DEGRADED', 'CRITICAL', 'UNKNOWN');

-- ── Table: flow_map_ctos ──
CREATE TABLE public.flow_map_ctos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  map_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  -- Parent OLT host reference
  olt_host_id UUID REFERENCES public.flow_map_hosts(id) ON DELETE SET NULL,
  pon_port_index INTEGER DEFAULT 0,
  -- Location
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  -- Specs
  capacity public.cto_capacity NOT NULL DEFAULT '16',
  status_calculated public.cto_status NOT NULL DEFAULT 'UNKNOWN',
  -- Metadata (brand, model, install date, etc)
  metadata JSONB NOT NULL DEFAULT '{}',
  -- Zabbix mapping for ONU aggregation
  zabbix_host_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_cto_map FOREIGN KEY (map_id, tenant_id) 
    REFERENCES public.flow_maps(id, tenant_id) ON DELETE CASCADE
);

-- ── Table: flow_map_cables ──
CREATE TABLE public.flow_map_cables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  map_id UUID NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  -- Geometry: GeoJSON LineString stored as JSONB
  geometry JSONB NOT NULL DEFAULT '{"type": "LineString", "coordinates": []}',
  -- Endpoints (polymorphic: can be host or CTO)
  source_node_type TEXT NOT NULL DEFAULT 'host' CHECK (source_node_type IN ('host', 'cto')),
  source_node_id UUID NOT NULL,
  target_node_type TEXT NOT NULL DEFAULT 'cto' CHECK (target_node_type IN ('host', 'cto')),
  target_node_id UUID NOT NULL,
  -- Specs
  fiber_count INTEGER NOT NULL DEFAULT 12,
  cable_type public.cable_type NOT NULL DEFAULT 'ASU',
  distance_km DOUBLE PRECISION DEFAULT 0,
  -- Visual
  color_override TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_cable_map FOREIGN KEY (map_id, tenant_id) 
    REFERENCES public.flow_maps(id, tenant_id) ON DELETE CASCADE
);

-- ── Indexes ──
CREATE INDEX idx_ctos_map ON public.flow_map_ctos(map_id, tenant_id);
CREATE INDEX idx_ctos_olt ON public.flow_map_ctos(olt_host_id);
CREATE INDEX idx_cables_map ON public.flow_map_cables(map_id, tenant_id);
CREATE INDEX idx_cables_source ON public.flow_map_cables(source_node_id);
CREATE INDEX idx_cables_target ON public.flow_map_cables(target_node_id);

-- ── RLS ──
ALTER TABLE public.flow_map_ctos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_map_cables ENABLE ROW LEVEL SECURITY;

-- CTOs: read for tenant, manage for admin/editor
CREATE POLICY "cto_select" ON public.flow_map_ctos
  FOR SELECT USING (
    tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid())
  );

CREATE POLICY "cto_manage" ON public.flow_map_ctos
  FOR ALL USING (
    (tenant_id = get_user_tenant_id(auth.uid()) AND 
     (has_role(auth.uid(), tenant_id, 'admin') OR has_role(auth.uid(), tenant_id, 'editor')))
    OR is_super_admin(auth.uid())
  ) WITH CHECK (
    (tenant_id = get_user_tenant_id(auth.uid()) AND 
     (has_role(auth.uid(), tenant_id, 'admin') OR has_role(auth.uid(), tenant_id, 'editor')))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "cable_select" ON public.flow_map_cables
  FOR SELECT USING (
    tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid())
  );

CREATE POLICY "cable_manage" ON public.flow_map_cables
  FOR ALL USING (
    (tenant_id = get_user_tenant_id(auth.uid()) AND 
     (has_role(auth.uid(), tenant_id, 'admin') OR has_role(auth.uid(), tenant_id, 'editor')))
    OR is_super_admin(auth.uid())
  ) WITH CHECK (
    (tenant_id = get_user_tenant_id(auth.uid()) AND 
     (has_role(auth.uid(), tenant_id, 'admin') OR has_role(auth.uid(), tenant_id, 'editor')))
    OR is_super_admin(auth.uid())
  );

-- ── Triggers ──
CREATE TRIGGER update_ctos_updated_at
  BEFORE UPDATE ON public.flow_map_ctos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cables_updated_at
  BEFORE UPDATE ON public.flow_map_cables
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Permissions ──
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flow_map_ctos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flow_map_cables TO authenticated;
REVOKE ALL ON public.flow_map_ctos FROM anon;
REVOKE ALL ON public.flow_map_cables FROM anon;
