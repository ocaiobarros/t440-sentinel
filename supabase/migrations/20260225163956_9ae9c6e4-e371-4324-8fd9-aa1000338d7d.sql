
-- Table for per-host billing base counter configs
CREATE TABLE public.printer_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  dashboard_id UUID REFERENCES public.dashboards(id) ON DELETE CASCADE,
  zabbix_host_id TEXT NOT NULL,
  host_name TEXT NOT NULL DEFAULT '',
  base_counter INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, zabbix_host_id)
);

-- Table for monthly billing snapshots
CREATE TABLE public.billing_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  period TEXT NOT NULL, -- e.g. '2026-02'
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  entries JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_pages BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_billing_logs_tenant_period ON public.billing_logs(tenant_id, period);
CREATE INDEX idx_printer_configs_tenant ON public.printer_configs(tenant_id);

-- RLS
ALTER TABLE public.printer_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_logs ENABLE ROW LEVEL SECURITY;

-- printer_configs: admin/editor can manage, all can select
CREATE POLICY pc_select ON public.printer_configs FOR SELECT
  USING (tenant_id = jwt_tenant_id());

CREATE POLICY pc_manage ON public.printer_configs FOR ALL
  USING ((tenant_id = jwt_tenant_id()) AND (has_role(auth.uid(), tenant_id, 'admin') OR has_role(auth.uid(), tenant_id, 'editor')))
  WITH CHECK ((tenant_id = jwt_tenant_id()) AND (has_role(auth.uid(), tenant_id, 'admin') OR has_role(auth.uid(), tenant_id, 'editor')));

-- billing_logs: select for all tenant users, insert only by service role (edge function)
CREATE POLICY bl_select ON public.billing_logs FOR SELECT
  USING (tenant_id = jwt_tenant_id());

-- Updated_at trigger for printer_configs
CREATE TRIGGER set_printer_configs_updated_at
  BEFORE UPDATE ON public.printer_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
