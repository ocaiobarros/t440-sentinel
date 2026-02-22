
-- 1. Segurança: extensão pgcrypto + search_path
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER FUNCTION public.verify_webhook_token(p_token TEXT) 
SET search_path = public, extensions, pg_temp;

-- 2. Blindagem CTO vs OLT (FK composta)
ALTER TABLE public.flow_map_hosts 
ADD CONSTRAINT uniq_host_identity UNIQUE (id, map_id, tenant_id);

ALTER TABLE public.flow_map_ctos
DROP CONSTRAINT IF EXISTS fk_cto_olt_secure;

ALTER TABLE public.flow_map_ctos
ADD CONSTRAINT fk_cto_olt_secure 
FOREIGN KEY (olt_host_id, map_id, tenant_id) 
REFERENCES public.flow_map_hosts(id, map_id, tenant_id);

-- 3. Índices de performance para viabilidade
CREATE INDEX IF NOT EXISTS idx_cto_geo_lookup 
ON public.flow_map_ctos (tenant_id, map_id, lat, lon);

CREATE INDEX IF NOT EXISTS idx_reserva_geo_lookup 
ON public.flow_map_reservas (tenant_id, map_id, lat, lon);

-- 4. Remove auditoria dupla de tabelas de log
DROP TRIGGER IF EXISTS trg_audit_alert_events ON public.alert_events;
DROP TRIGGER IF EXISTS trg_audit_alert_notifications ON public.alert_notifications;
DROP TRIGGER IF EXISTS trg_audit_telemetry_heartbeat ON public.telemetry_heartbeat;

-- 5. Precisão do comprimento_m
ALTER TABLE public.flow_map_reservas 
ALTER COLUMN comprimento_m TYPE NUMERIC(10,2);
