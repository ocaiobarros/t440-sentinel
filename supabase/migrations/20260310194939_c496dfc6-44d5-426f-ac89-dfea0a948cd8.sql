
-- 1. Create platform_admins table
CREATE TABLE public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'super_admin',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- 3. Platform admins can see their own record
CREATE POLICY "platform_admins_select_own"
  ON public.platform_admins
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 4. Update is_super_admin to use platform_admins table instead of hardcoded emails
CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET row_security TO 'off'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = p_user_id
  );
$$;

-- 5. Seed existing super admins from hardcoded emails
INSERT INTO public.platform_admins (user_id, role)
SELECT p.id, 'super_admin'
FROM public.profiles p
WHERE p.email IN ('caio.barros@madeplant.com.br', 'admin@flowpulse.local')
ON CONFLICT (user_id) DO NOTHING;

-- 6. Create function to check platform admin role
CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET row_security TO 'off'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = p_user_id
  );
$$;

-- 7. Trigger to sync app_metadata when platform_admin is added/removed
CREATE OR REPLACE FUNCTION public.sync_platform_admin_metadata()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"is_platform_admin": true}'::jsonb
    WHERE id = NEW.user_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) - 'is_platform_admin'
    WHERE id = OLD.user_id;
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_sync_platform_admin_metadata
  AFTER INSERT OR DELETE ON public.platform_admins
  FOR EACH ROW EXECUTE FUNCTION public.sync_platform_admin_metadata();

-- 8. Set is_platform_admin flag for existing seeded admins
UPDATE auth.users u
SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb) || '{"is_platform_admin": true}'::jsonb
FROM public.platform_admins pa
WHERE u.id = pa.user_id;

-- 9. Performance index
CREATE INDEX idx_platform_admins_user_id ON public.platform_admins (user_id);
