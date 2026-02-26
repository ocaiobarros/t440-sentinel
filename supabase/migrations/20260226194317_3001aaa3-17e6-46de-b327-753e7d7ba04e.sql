CREATE OR REPLACE FUNCTION public.prevent_tenant_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.tenant_id <> OLD.tenant_id THEN
    -- Allow super admins to move users between tenants
    IF public.is_super_admin(auth.uid()) THEN
      RETURN NEW;
    END IF;
    -- Allow service_role (edge functions with admin client) to move users
    IF COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'tenant_id is immutable';
  END IF;
  RETURN NEW;
END;
$function$;