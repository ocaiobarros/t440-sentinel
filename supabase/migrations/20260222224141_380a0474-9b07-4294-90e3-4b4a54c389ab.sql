
-- Create reservas table for FlowMap
CREATE TABLE public.flow_map_reservas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  map_id UUID NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  comprimento_m NUMERIC(10,2) DEFAULT 0,
  tipo_cabo TEXT NOT NULL DEFAULT 'ASU',
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  CONSTRAINT fk_reserva_map FOREIGN KEY (map_id, tenant_id) REFERENCES public.flow_maps(id, tenant_id)
);

-- Enable RLS
ALTER TABLE public.flow_map_reservas ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Tenant members can view reservas"
  ON public.flow_map_reservas FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins and editors can insert reservas"
  ON public.flow_map_reservas FOR INSERT
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(), tenant_id, 'admin') OR public.has_role(auth.uid(), tenant_id, 'editor'))
  );

CREATE POLICY "Admins and editors can update reservas"
  ON public.flow_map_reservas FOR UPDATE
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(), tenant_id, 'admin') OR public.has_role(auth.uid(), tenant_id, 'editor'))
  );

CREATE POLICY "Admins and editors can delete reservas"
  ON public.flow_map_reservas FOR DELETE
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(), tenant_id, 'admin') OR public.has_role(auth.uid(), tenant_id, 'editor'))
  );

-- Trigger for updated_at
CREATE TRIGGER update_flow_map_reservas_updated_at
  BEFORE UPDATE ON public.flow_map_reservas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Revoke anon access
REVOKE ALL ON public.flow_map_reservas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flow_map_reservas TO authenticated;
