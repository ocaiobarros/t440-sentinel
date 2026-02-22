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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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
      return new Response(JSON.stringify({ error: "No tenant found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await adminClient.rpc("has_role", {
      p_user_id: caller.id,
      p_tenant_id: callerTenant,
      p_role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, display_name, role, password } = await req.json();

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

    // Check if user already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u) => u.email === email);

    let userId: string;

    if (existingUser) {
      // Check if already in this tenant
      const { data: existingRole } = await adminClient
        .from("user_roles")
        .select("id")
        .eq("user_id", existingUser.id)
        .eq("tenant_id", callerTenant)
        .maybeSingle();

      if (existingRole) {
        return new Response(JSON.stringify({ error: "Usuário já pertence a esta organização" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = existingUser.id;
    } else {
      // Create new user with provided password or a random one
      const userPassword = password || (crypto.randomUUID() + "Aa1!");
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password: userPassword,
        email_confirm: true,
        user_metadata: { display_name: display_name || email.split("@")[0] },
        app_metadata: { tenant_id: callerTenant },
      });
      if (createError || !newUser.user) {
        return new Response(JSON.stringify({ error: createError?.message || "Failed to create user" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = newUser.user.id;

      // The handle_new_user trigger will create a profile + tenant for them.
      // We need to update their profile to point to the caller's tenant instead.
      // First, delete auto-created tenant artifacts
      const { data: autoTenantId } = await adminClient.rpc("get_user_tenant_id", { p_user_id: userId });
      
      // Update profile to caller's tenant
      await adminClient.from("profiles").update({
        tenant_id: callerTenant,
        display_name: display_name || email.split("@")[0],
      }).eq("id", userId);

      // Update app_metadata so JWT carries the correct tenant_id
      await adminClient.auth.admin.updateUser(userId, {
        app_metadata: { tenant_id: callerTenant },
      });

      // Delete auto-created role
      await adminClient.from("user_roles").delete().eq("user_id", userId).eq("tenant_id", autoTenantId);

      // Clean up auto-created tenant (if different and empty)
      if (autoTenantId && autoTenantId !== callerTenant) {
        const { data: remainingMembers } = await adminClient
          .from("profiles")
          .select("id")
          .eq("tenant_id", autoTenantId);
        if (!remainingMembers || remainingMembers.length === 0) {
          await adminClient.from("tenants").delete().eq("id", autoTenantId);
        }
      }
    }

    // Add role to caller's tenant
    const { error: roleError } = await adminClient.from("user_roles").insert({
      user_id: userId,
      tenant_id: callerTenant,
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
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
