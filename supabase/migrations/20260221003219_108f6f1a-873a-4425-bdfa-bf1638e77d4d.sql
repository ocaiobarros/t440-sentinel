
-- Pre-requisite: composite unique on flow_map_links
ALTER TABLE public.flow_map_links
  ADD CONSTRAINT uq_fml_id_tenant UNIQUE (id, tenant_id);

-- =========================================
-- FLOW MAP LINK EVENTS (SLA)
-- =========================================
CREATE TABLE public.flow_map_link_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  link_id UUID NOT NULL,
  tenant_id UUID NOT NULL,

  status TEXT NOT NULL CHECK (status IN ('UP', 'DOWN', 'DEGRADED')),

  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,

  duration_seconds INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN ended_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (ended_at - started_at))::INTEGER
      ELSE NULL
    END
  ) STORED,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_fmle_link
    FOREIGN KEY (link_id, tenant_id)
    REFERENCES public.flow_map_links(id, tenant_id)
    ON DELETE CASCADE
);

-- =========================================
-- INDEXES
-- =========================================
CREATE INDEX idx_fmle_link_id ON public.flow_map_link_events(link_id);
CREATE INDEX idx_fmle_tenant_id ON public.flow_map_link_events(tenant_id);
CREATE INDEX idx_fmle_started ON public.flow_map_link_events(started_at DESC);

-- Impede múltiplos eventos abertos para o mesmo link
CREATE UNIQUE INDEX idx_fmle_open_event
ON public.flow_map_link_events (link_id, tenant_id)
WHERE ended_at IS NULL;

-- =========================================
-- RLS
-- =========================================
ALTER TABLE public.flow_map_link_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fmle_select"
ON public.flow_map_link_events
FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid())
  OR is_super_admin(auth.uid())
);

GRANT SELECT ON public.flow_map_link_events TO authenticated;
