
-- =========================================================
-- FLOWPULSE — SQL FINAL CONSOLIDADO (rev_prod)
-- Multi-tenant + RLS + RBAC + Auto-provision + Data Contract
-- =========================================================

-- 0) Extensões
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Enum app_role idempotente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'app_role' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'editor', 'viewer');
  END IF;
END$$;

-- =========================================================
-- 2) TABELAS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, role)
);

CREATE TABLE IF NOT EXISTS public.zabbix_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  username TEXT NOT NULL,
  password_ciphertext TEXT NOT NULL,
  password_iv TEXT NOT NULL,
  password_tag TEXT NOT NULL,
  encryption_version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dashboards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  zabbix_connection_id UUID REFERENCES public.zabbix_connections(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'New Dashboard',
  description TEXT,
  layout JSONB NOT NULL DEFAULT '[]'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.widgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dashboard_id UUID NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
  widget_type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'New Widget',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  position_x INTEGER NOT NULL DEFAULT 0,
  position_y INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 4,
  height INTEGER NOT NULL DEFAULT 3,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  query JSONB NOT NULL DEFAULT '{}'::jsonb,
  adapter JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- 3) CHECKS
-- =========================================================

ALTER TABLE public.widgets DROP CONSTRAINT IF EXISTS widgets_query_check;
ALTER TABLE public.widgets ADD CONSTRAINT widgets_query_check
CHECK (
  query = '{}'::jsonb
  OR (query ? 'source' AND query ? 'method' AND query ? 'params')
);

ALTER TABLE public.widgets DROP CONSTRAINT IF EXISTS widgets_adapter_check;
ALTER TABLE public.widgets ADD CONSTRAINT widgets_adapter_check
CHECK (
  adapter = '{}'::jsonb
  OR (adapter ? 'type')
);

-- =========================================================
-- 4) ÍNDICES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON public.profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_lookup ON public.user_roles(user_id, tenant_id, role);
CREATE INDEX IF NOT EXISTS idx_zbx_conn_tenant_id ON public.zabbix_connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_zbx_conn_tenant_active ON public.zabbix_connections(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_dashboards_tenant_id ON public.dashboards(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dashboards_conn_id ON public.dashboards(zabbix_connection_id);
CREATE INDEX IF NOT EXISTS idx_widgets_dashboard_id ON public.widgets(dashboard_id);
CREATE INDEX IF NOT EXISTS idx_widgets_adapter_type ON public.widgets((adapter->>'type'));
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- =========================================================
-- 5) FUNÇÕES
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_user_tenant_id(p_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = p_user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_role(p_user_id UUID, p_tenant_id UUID, p_role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = p_user_id
      AND tenant_id = p_tenant_id
      AND role = p_role
  );
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_tenant_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.tenant_id <> OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_dashboard_on_widget_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dashboard_id UUID;
BEGIN
  v_dashboard_id := COALESCE(NEW.dashboard_id, OLD.dashboard_id);
  UPDATE public.dashboards SET updated_at = now() WHERE id = v_dashboard_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_tenant_id UUID;
  user_slug TEXT;
  user_name TEXT;
BEGIN
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  user_slug := lower(regexp_replace(user_name, '[^a-zA-Z0-9]+', '-', 'g'));

  INSERT INTO public.tenants (name, slug)
  VALUES (user_name || '''s Org', user_slug || '-' || substr(NEW.id::text, 1, 8))
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.profiles (id, tenant_id, display_name, email)
  VALUES (NEW.id, new_tenant_id, user_name, NEW.email);

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (NEW.id, new_tenant_id, 'admin');

  RETURN NEW;
END;
$$;

-- =========================================================
-- 6) TRIGGERS
-- =========================================================

DROP TRIGGER IF EXISTS update_tenants_updated_at ON public.tenants;
CREATE TRIGGER update_tenants_updated_at
BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_zabbix_connections_updated_at ON public.zabbix_connections;
CREATE TRIGGER update_zabbix_connections_updated_at
BEFORE UPDATE ON public.zabbix_connections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_dashboards_updated_at ON public.dashboards;
CREATE TRIGGER update_dashboards_updated_at
BEFORE UPDATE ON public.dashboards
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_widgets_updated_at ON public.widgets;
CREATE TRIGGER update_widgets_updated_at
BEFORE UPDATE ON public.widgets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_prevent_profile_tenant_change ON public.profiles;
CREATE TRIGGER trg_prevent_profile_tenant_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_change();

DROP TRIGGER IF EXISTS tr_touch_dashboard ON public.widgets;
CREATE TRIGGER tr_touch_dashboard
AFTER INSERT OR UPDATE OR DELETE ON public.widgets
FOR EACH ROW EXECUTE FUNCTION public.touch_dashboard_on_widget_change();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- 7) RLS ENABLE
-- =========================================================

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zabbix_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 8) POLICIES
-- =========================================================

-- TENANTS
DROP POLICY IF EXISTS tenants_select ON public.tenants;
CREATE POLICY tenants_select ON public.tenants
FOR SELECT TO authenticated
USING (id = public.get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS tenants_update ON public.tenants;
CREATE POLICY tenants_update ON public.tenants
FOR UPDATE TO authenticated
USING (
  id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), id, 'admin')
)
WITH CHECK (
  id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), id, 'admin')
);

-- PROFILES
DROP POLICY IF EXISTS profiles_self_select ON public.profiles;
CREATE POLICY profiles_self_select ON public.profiles
FOR SELECT TO authenticated
USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_select_tenant ON public.profiles;
CREATE POLICY profiles_select_tenant ON public.profiles
FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- USER_ROLES
DROP POLICY IF EXISTS user_roles_select ON public.user_roles;
CREATE POLICY user_roles_select ON public.user_roles
FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS user_roles_insert ON public.user_roles;
CREATE POLICY user_roles_insert ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), tenant_id, 'admin')
);

DROP POLICY IF EXISTS user_roles_update ON public.user_roles;
CREATE POLICY user_roles_update ON public.user_roles
FOR UPDATE TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), tenant_id, 'admin')
)
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), tenant_id, 'admin')
);

DROP POLICY IF EXISTS user_roles_delete ON public.user_roles;
CREATE POLICY user_roles_delete ON public.user_roles
FOR DELETE TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), tenant_id, 'admin')
);

-- ZABBIX_CONNECTIONS
DROP POLICY IF EXISTS zabbix_select ON public.zabbix_connections;
CREATE POLICY zabbix_select ON public.zabbix_connections
FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS zabbix_insert ON public.zabbix_connections;
CREATE POLICY zabbix_insert ON public.zabbix_connections
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), tenant_id, 'admin')
);

DROP POLICY IF EXISTS zabbix_update ON public.zabbix_connections;
CREATE POLICY zabbix_update ON public.zabbix_connections
FOR UPDATE TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), tenant_id, 'admin')
)
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), tenant_id, 'admin')
);

DROP POLICY IF EXISTS zabbix_delete ON public.zabbix_connections;
CREATE POLICY zabbix_delete ON public.zabbix_connections
FOR DELETE TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), tenant_id, 'admin')
);

-- DASHBOARDS
DROP POLICY IF EXISTS dashboards_select ON public.dashboards;
CREATE POLICY dashboards_select ON public.dashboards
FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS dashboards_insert ON public.dashboards;
CREATE POLICY dashboards_insert ON public.dashboards
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    public.has_role(auth.uid(), tenant_id, 'admin')
    OR public.has_role(auth.uid(), tenant_id, 'editor')
  )
);

DROP POLICY IF EXISTS dashboards_update ON public.dashboards;
CREATE POLICY dashboards_update ON public.dashboards
FOR UPDATE TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    public.has_role(auth.uid(), tenant_id, 'admin')
    OR public.has_role(auth.uid(), tenant_id, 'editor')
  )
)
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
);

DROP POLICY IF EXISTS dashboards_delete ON public.dashboards;
CREATE POLICY dashboards_delete ON public.dashboards
FOR DELETE TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), tenant_id, 'admin')
);

-- WIDGETS
DROP POLICY IF EXISTS widgets_select ON public.widgets;
CREATE POLICY widgets_select ON public.widgets
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.dashboards d
    WHERE d.id = dashboard_id
      AND d.tenant_id = public.get_user_tenant_id(auth.uid())
  )
);

DROP POLICY IF EXISTS widgets_insert ON public.widgets;
CREATE POLICY widgets_insert ON public.widgets
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.dashboards d
    WHERE d.id = dashboard_id
      AND d.tenant_id = public.get_user_tenant_id(auth.uid())
  )
  AND (
    public.has_role(auth.uid(), public.get_user_tenant_id(auth.uid()), 'admin')
    OR public.has_role(auth.uid(), public.get_user_tenant_id(auth.uid()), 'editor')
  )
);

DROP POLICY IF EXISTS widgets_update ON public.widgets;
CREATE POLICY widgets_update ON public.widgets
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.dashboards d
    WHERE d.id = dashboard_id
      AND d.tenant_id = public.get_user_tenant_id(auth.uid())
  )
  AND (
    public.has_role(auth.uid(), public.get_user_tenant_id(auth.uid()), 'admin')
    OR public.has_role(auth.uid(), public.get_user_tenant_id(auth.uid()), 'editor')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.dashboards d
    WHERE d.id = dashboard_id
      AND d.tenant_id = public.get_user_tenant_id(auth.uid())
  )
);

DROP POLICY IF EXISTS widgets_delete ON public.widgets;
CREATE POLICY widgets_delete ON public.widgets
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.dashboards d
    WHERE d.id = dashboard_id
      AND d.tenant_id = public.get_user_tenant_id(auth.uid())
  )
  AND (
    public.has_role(auth.uid(), public.get_user_tenant_id(auth.uid()), 'admin')
    OR public.has_role(auth.uid(), public.get_user_tenant_id(auth.uid()), 'editor')
  )
);

-- AUDIT_LOGS
DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs
FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- =========================================================
-- 9) GRANTS
-- =========================================================

GRANT USAGE ON TYPE public.app_role TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zabbix_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.widgets TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_user_tenant_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, UUID, public.app_role) TO authenticated;
