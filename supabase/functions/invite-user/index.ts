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

  let stage = "init";

  try {
    stage = "authenticate_caller";
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
    const requestedMode = body?.mode === "move" ? "move" : "link"; // safer default: preserve memberships

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
      // Delete all existing roles for this user+tenant, then insert the new one.
      // This avoids .maybeSingle() crash when user has multiple roles per tenant
      // (unique constraint is on user_id,tenant_id,role — not user_id,tenant_id).
      const { error: delErr } = await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("tenant_id", targetTenant);

      if (delErr) throw delErr;

      const { error: insErr } = await adminClient
        .from("user_roles")
        .insert({ user_id: userId, tenant_id: targetTenant, role });

      if (insErr) throw insErr;

      if (mode === "link") return;

      const { error: pruneRolesError } = await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .neq("tenant_id", targetTenant);

      if (pruneRolesError) throw pruneRolesError;
    };

    const upsertProfile = async (userId: string) => {
      const profilePayload = {
        id: userId,
        tenant_id: targetTenant,
        display_name: displayName,
        email,
      };

      const { data: existingById, error: existingByIdError } = await adminClient
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (existingByIdError) throw existingByIdError;

      if (!existingById) {
        const { error: insertProfileError } = await adminClient
          .from("profiles")
          .insert(profilePayload);

        if (insertProfileError) throw insertProfileError;
        return;
      }

      // Never update tenant_id — it is immutable via DB trigger.
      // Only update mutable fields (display_name, email).
      const { error: updateProfileError } = await adminClient
        .from("profiles")
        .update({
          display_name: displayName,
          email,
        })
        .eq("id", userId);

      if (updateProfileError) throw updateProfileError;
    };

    const setAuthTenantMetadata = async (userId: string) => {
      const { error } = await adminClient.auth.admin.updateUserById(userId, {
        app_metadata: { tenant_id: targetTenant },
      });
      if (error) throw new Error(`updateUserById failed: ${error.message}`);
    };

    const findExistingAuthUserIdByEmail = async (targetEmail: string) => {
      const normalized = targetEmail.toLowerCase();
      let page = 1;

      while (page <= 100) {
        const { data: usersData, error: usersError } = await adminClient.auth.admin.listUsers({
          page,
          perPage: 100,
        });

        if (usersError) throw new Error(`listUsers(page=${page}) failed: ${usersError.message}`);

        const users = usersData?.users ?? [];
        const found = users.find((u) => (u.email || "").toLowerCase() === normalized);
        if (found?.id) return found.id;

        if (users.length < 100) break;
        page += 1;
      }

      return null;
    };

    const authUserExistsById = async (userId: string) => {
      const { data, error } = await adminClient.auth.admin.getUserById(userId);
      if (error) {
        const status = (error as any)?.status;
        if (status === 404) return false;
        if ((error.message || "").toLowerCase().includes("user not found")) return false;
        throw error;
      }
      return Boolean(data?.user);
    };

    const cleanupOrphanProfile = async (userId: string) => {
      const { error: roleDeleteError } = await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", userId);

      if (roleDeleteError) throw roleDeleteError;

      const { error: profileDeleteError } = await adminClient
        .from("profiles")
        .delete()
        .eq("id", userId);

      if (profileDeleteError) throw profileDeleteError;
    };

    /* ── Audit helper ── */
    const writeAudit = async (tenantId: string, auditAction: string, entityType: string | null, entityId: string | null, details: Record<string, unknown> = {}) => {
      try {
        await adminClient.from("audit_logs").insert({
          tenant_id: tenantId,
          user_id: caller.id,
          action: auditAction,
          entity_type: entityType,
          entity_id: entityId,
          details,
        });
      } catch (e) {
        console.warn("[invite-user] audit write failed:", e);
      }
    };

    /* ── Plan limit check ── */
    stage = "plan_limit_check";
    const { data: tenantLimits } = await adminClient
      .from("tenants")
      .select("plan, max_users")
      .eq("id", targetTenant)
      .single();

    if (tenantLimits) {
      const { count: currentUserCount } = await adminClient
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", targetTenant);

      if ((currentUserCount ?? 0) >= tenantLimits.max_users) {
        return new Response(JSON.stringify({
          error: `Limite de usuários atingido (${tenantLimits.max_users}) para o plano "${tenantLimits.plan}". Faça upgrade para adicionar mais usuários.`,
        }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    stage = "profile_lookup";
    const { data: profilesByEmail, error: profilesByEmailError } = await adminClient
      .from("profiles")
      .select("id, tenant_id")
      .ilike("email", email)
      .limit(1);

    if (profilesByEmailError) {
      throw new Error(`profiles lookup failed: ${profilesByEmailError.message}`);
    }

    const existingProfile = profilesByEmail?.[0] ?? null;
    const previousTenantId = existingProfile?.tenant_id ?? null;

    let userId: string | null = null;

    if (existingProfile) {
      const profileHasAuthUser = await authUserExistsById(existingProfile.id);

      if (profileHasAuthUser) {
        userId = existingProfile.id;
      } else {
        await cleanupOrphanProfile(existingProfile.id);
      }
    }

    const existingAuthUser = Boolean(userId);
    const mode = existingAuthUser ? requestedMode : "move";

    if (!userId) {
      stage = "create_or_resolve_auth_user";
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

      if (newUser?.user?.id) {
        userId = newUser.user.id;
      } else if (createError) {
        const msg = (createError.message || "").toLowerCase();
        const duplicateEmail =
          msg.includes("already") ||
          msg.includes("registered") ||
          msg.includes("exists") ||
          (createError as any)?.status === 422;

        if (duplicateEmail) {
          userId = await findExistingAuthUserIdByEmail(email);
        } else {
          throw new Error(`createUser failed: ${createError.message}`);
        }
      }
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: `Unable to resolve user id for ${email}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    stage = "sync_profile_role_metadata";

    if (mode === "link") {
      // Link mode: only add role, don't touch profile or JWT metadata
      await ensureRoleForTenant(userId);
    } else {
      const { data: autoTenantId } = await adminClient.rpc("get_user_tenant_id", { p_user_id: userId });

      await upsertProfile(userId);
      await setAuthTenantMetadata(userId);
      await ensureRoleForTenant(userId);

      await cleanupTenantIfEmpty(autoTenantId);
      await cleanupTenantIfEmpty(previousTenantId);
    }

    // Write audit log
    await writeAudit(targetTenant, existingAuthUser ? "link_user" : "invite_user", "user", userId, {
      email,
      role,
      mode,
      display_name: displayName,
    });

    return new Response(JSON.stringify({
      success: true,
      user_id: userId,
      existing: existingAuthUser,
      mode,
      linked: mode === "link",
      moved: mode !== "link" && ((previousTenantId !== null && previousTenantId !== targetTenant)),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const msg = err?.message || err?.toString?.() || "Internal error";
    console.error("[invite-user] Error:", msg, "stage=", stage, JSON.stringify(err));
    return new Response(JSON.stringify({ error: msg, stage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
