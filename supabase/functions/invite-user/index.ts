import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_ROLES = ["admin", "editor", "viewer", "tech", "sales"] as const;

type ValidRole = (typeof VALID_ROLES)[number];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerTenant } = await adminClient.rpc("get_user_tenant_id", { p_user_id: caller.id });
    if (!callerTenant) {
      return new Response(JSON.stringify({ error: "No tenant found for caller" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await adminClient.rpc("has_role", {
      p_user_id: caller.id,
      p_tenant_id: callerTenant,
      p_role: "admin",
    });

    const { data: isSuperAdmin } = await adminClient.rpc("is_super_admin", { p_user_id: caller.id });

    if (!isAdmin && !isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const emailRaw = body?.email;
    const displayNameRaw = body?.display_name;
    const roleRaw = body?.role;
    const passwordRaw = body?.password;
    const targetTenantIdRaw = body?.target_tenant_id;

    if (!emailRaw || !roleRaw) {
      return new Response(JSON.stringify({ error: "email and role are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!VALID_ROLES.includes(roleRaw)) {
      return new Response(JSON.stringify({ error: "Invalid role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const role = roleRaw as ValidRole;
    const email = String(emailRaw).trim().toLowerCase();
    const displayName = String(displayNameRaw || email.split("@")[0]).trim();

    const targetTenant = (isSuperAdmin && targetTenantIdRaw) ? String(targetTenantIdRaw) : String(callerTenant);

    const { data: targetTenantRow, error: targetTenantErr } = await adminClient
      .from("tenants")
      .select("id")
      .eq("id", targetTenant)
      .maybeSingle();

    if (targetTenantErr || !targetTenantRow) {
      return new Response(JSON.stringify({ error: "Target tenant not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanupTenantIfEmpty = async (tenantId: string | null | undefined) => {
      if (!tenantId || tenantId === targetTenant) return;
      const { count } = await adminClient
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      if ((count ?? 0) === 0) {
        await adminClient.from("tenants").delete().eq("id", tenantId);
      }
    };

    const ensureRoleForTenant = async (userId: string) => {
      const { error: clearRolesError } = await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", userId);

      if (clearRolesError) throw clearRolesError;

      const { error: roleInsertError } = await adminClient
        .from("user_roles")
        .insert({ user_id: userId, tenant_id: targetTenant, role });

      if (roleInsertError) throw roleInsertError;
    };

    const upsertProfile = async (userId: string) => {
      const { error: profileUpsertError } = await adminClient
        .from("profiles")
        .upsert({
          id: userId,
          tenant_id: targetTenant,
          display_name: displayName,
          email,
        });

      if (profileUpsertError) throw profileUpsertError;
    };

    const setAuthTenantMetadata = async (userId: string) => {
      await adminClient.auth.admin.updateUserById(userId, {
        app_metadata: { tenant_id: targetTenant },
      });
    };

    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id, tenant_id")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile) {
      const previousTenantId = existingProfile.tenant_id;

      await upsertProfile(existingProfile.id);
      await ensureRoleForTenant(existingProfile.id);
      await setAuthTenantMetadata(existingProfile.id);
      await cleanupTenantIfEmpty(previousTenantId);

      return new Response(JSON.stringify({
        success: true,
        user_id: existingProfile.id,
        existing: true,
        moved: previousTenantId !== targetTenant,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userPassword = (typeof passwordRaw === "string" && passwordRaw.trim().length >= 6)
      ? passwordRaw.trim()
      : `${crypto.randomUUID().slice(0, 12)}Aa1!`;

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: userPassword,
      email_confirm: true,
      user_metadata: { display_name: displayName },
      app_metadata: { tenant_id: targetTenant },
    });

    if (createError || !newUser.user) {
      const message = createError?.message || "Failed to create user";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = newUser.user.id;

    const { data: autoTenantId } = await adminClient.rpc("get_user_tenant_id", { p_user_id: userId });

    await upsertProfile(userId);
    await ensureRoleForTenant(userId);
    await setAuthTenantMetadata(userId);

    if (autoTenantId && autoTenantId !== targetTenant) {
      await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("tenant_id", autoTenantId);

      await cleanupTenantIfEmpty(autoTenantId);
    }

    return new Response(JSON.stringify({ success: true, user_id: userId, existing: false }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[invite-user] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
