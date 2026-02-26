import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Validate caller is admin
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

    // Check caller is admin
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

    // Also check super admin
    const { data: isSuperAdmin } = await adminClient.rpc("is_super_admin", { p_user_id: caller.id });
    
    if (!isAdmin && !isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { email, display_name, role, password, target_tenant_id } = body;

    if (!email || !role) {
      return new Response(JSON.stringify({ error: "email and role are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validRoles = ["admin", "editor", "viewer", "tech", "sales"];
    if (!validRoles.includes(role)) {
      return new Response(JSON.stringify({ error: "Invalid role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use target_tenant_id if super admin specified it, otherwise use caller's tenant
    const targetTenant = (isSuperAdmin && target_tenant_id) ? target_tenant_id : callerTenant;

    // Check if user already exists - use admin API getUserByEmail (not listUsers which is paginated)
    let existingUser = null;
    try {
      // Try to find by listing with a filter - more reliable than listUsers
      const { data: listData } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1,
      });
      // Fallback: search through all users is unreliable. Instead, try to create and handle conflict.
    } catch (_) {
      // ignore
    }

    // Strategy: Try to create the user first. If it fails with "already registered", handle existing user.
    let userId: string;
    const userPassword = password || (crypto.randomUUID().slice(0, 12) + "Aa1!");

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: userPassword,
      email_confirm: true,
      user_metadata: { display_name: display_name || email.split("@")[0] },
      app_metadata: { tenant_id: targetTenant },
    });

    if (createError) {
      // User already exists
      if (createError.message?.includes("already been registered") || createError.status === 422) {
        // Find the existing user by querying profiles
        const { data: existingProfile } = await adminClient
          .from("profiles")
          .select("id")
          .eq("email", email)
          .maybeSingle();

        if (!existingProfile) {
          return new Response(JSON.stringify({ error: "Usuário existe mas perfil não encontrado. Verifique o e-mail." }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        userId = existingProfile.id;

        // Check if already in target tenant
        const { data: existingRole } = await adminClient
          .from("user_roles")
          .select("id")
          .eq("user_id", userId)
          .eq("tenant_id", targetTenant)
          .maybeSingle();

        if (existingRole) {
          return new Response(JSON.stringify({ error: "Usuário já pertence a esta organização" }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Add role to target tenant
        const { error: roleError } = await adminClient.from("user_roles").insert({
          user_id: userId,
          tenant_id: targetTenant,
          role,
        });

        if (roleError) {
          return new Response(JSON.stringify({ error: roleError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true, user_id: userId, existing: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Other creation error
      return new Response(JSON.stringify({ error: createError.message || "Failed to create user" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!newUser.user) {
      return new Response(JSON.stringify({ error: "User creation returned no user" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    userId = newUser.user.id;

    // The handle_new_user trigger creates a profile + auto-tenant.
    // We need to move the user to the target tenant.
    // Wait a bit for the trigger to complete
    await new Promise((r) => setTimeout(r, 500));

    const { data: autoTenantId } = await adminClient.rpc("get_user_tenant_id", { p_user_id: userId });

    if (autoTenantId && autoTenantId !== targetTenant) {
      // Update profile to target tenant
      await adminClient.from("profiles").update({
        tenant_id: targetTenant,
        display_name: display_name || email.split("@")[0],
      }).eq("id", userId);

      // Update app_metadata so JWT carries the correct tenant_id
      await adminClient.auth.admin.updateUser(userId, {
        app_metadata: { tenant_id: targetTenant },
      });

      // Delete auto-created role
      await adminClient.from("user_roles").delete().eq("user_id", userId).eq("tenant_id", autoTenantId);

      // Clean up auto-created tenant if empty
      const { data: remainingMembers } = await adminClient
        .from("profiles")
        .select("id")
        .eq("tenant_id", autoTenantId);
      if (!remainingMembers || remainingMembers.length === 0) {
        await adminClient.from("tenants").delete().eq("id", autoTenantId);
      }
    } else if (autoTenantId === targetTenant) {
      // Already in the right tenant, just update display name
      await adminClient.from("profiles").update({
        display_name: display_name || email.split("@")[0],
      }).eq("id", userId);
      
      // Delete auto-created admin role (we'll insert with the correct role below)
      await adminClient.from("user_roles").delete().eq("user_id", userId).eq("tenant_id", targetTenant);
    }

    // Add role to target tenant
    const { error: roleError } = await adminClient.from("user_roles").insert({
      user_id: userId,
      tenant_id: targetTenant,
      role,
    });

    if (roleError) {
      return new Response(JSON.stringify({ error: roleError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
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
