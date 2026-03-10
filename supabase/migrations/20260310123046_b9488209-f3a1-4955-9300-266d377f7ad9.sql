
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  new_tenant_id UUID;
  user_slug TEXT;
  user_name TEXT;
  existing_tenant_id UUID;
BEGIN
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  -- Check if a valid tenant_id was already provided via app_metadata (e.g. by invite-user edge function)
  existing_tenant_id := NULLIF(TRIM(COALESCE(NEW.raw_app_meta_data->>'tenant_id', '')), '')::UUID;

  IF existing_tenant_id IS NOT NULL THEN
    -- Verify the tenant actually exists
    PERFORM 1 FROM public.tenants WHERE id = existing_tenant_id;
    IF FOUND THEN
      -- Use the pre-assigned tenant — do NOT create a new one
      new_tenant_id := existing_tenant_id;

      -- Create profile pointing to the pre-assigned tenant
      INSERT INTO public.profiles (id, tenant_id, display_name, email)
      VALUES (NEW.id, new_tenant_id, user_name, NEW.email)
      ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        display_name = EXCLUDED.display_name,
        email = EXCLUDED.email;

      -- Create default role (will be updated by edge function after)
      INSERT INTO public.user_roles (user_id, tenant_id, role)
      VALUES (NEW.id, new_tenant_id, 'viewer')
      ON CONFLICT DO NOTHING;

      RETURN NEW;
    END IF;
  END IF;

  -- Default behavior: create a new tenant for self-signup users
  user_slug := lower(regexp_replace(user_name, '[^a-zA-Z0-9]+', '-', 'g'));

  INSERT INTO public.tenants (name, slug)
  VALUES (user_name || '''s Org', user_slug || '-' || substr(NEW.id::text, 1, 8))
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.profiles (id, tenant_id, display_name, email)
  VALUES (NEW.id, new_tenant_id, user_name, NEW.email);

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (NEW.id, new_tenant_id, 'admin');

  -- Inject tenant_id into JWT app_metadata
  UPDATE auth.users
  SET raw_app_meta_data = jsonb_set(
    COALESCE(raw_app_meta_data, '{}'::jsonb),
    '{tenant_id}',
    to_jsonb(new_tenant_id::text)
  )
  WHERE id = NEW.id;

  RETURN NEW;
END;
$function$;
