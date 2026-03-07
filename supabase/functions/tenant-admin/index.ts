import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const slugify = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9-]+/g, "-")
  .replace(/^-|-$/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let stage = "init";

  try {
    stage = "validate_auth_header";
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization", stage }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    stage = "create_clients";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    stage = "authenticate_caller";
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Not authenticated", stage }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    stage = "parse_request";
    const body = await req.json();
    const action = String(body?.action || "create").trim().toLowerCase();

    stage = "authorize_caller";
    const { data: isSuperAdmin } = await adminClient.rpc("is_super_admin", { p_user_id: caller.id });
    const { data: callerTenant } = await adminClient.rpc("get_user_tenant_id", { p_user_id: caller.id });

    let membersTenantScope: string | null = String(body?.tenant_id || "").trim() || null;

    if (action === "members" && !isSuperAdmin) {
      const tenantToCheck = membersTenantScope || String(callerTenant || "");

      if (!tenantToCheck) {
        return new Response(JSON.stringify({ error: "No tenant found for caller", stage }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: isTenantAdmin } = await adminClient.rpc("has_role", {
        p_user_id: caller.id,
        p_tenant_id: tenantToCheck,
        p_role: "admin",
      });

      if (!isTenantAdmin) {
        return new Response(JSON.stringify({ error: "Admin role required", stage }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Tenant admin só pode listar membros do tenant autorizado.
      membersTenantScope = tenantToCheck;
    }

    if (!isSuperAdmin && action !== "members") {
      return new Response(JSON.stringify({ error: "Super admin role required", stage }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── LIST ── */
    if (action === "list") {
      stage = "list_tenants";
      const { data: allTenants, error: listErr } = await adminClient
        .from("tenants")
        .select("id, name, slug, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (listErr) {
        return new Response(JSON.stringify({ error: listErr.message, stage }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ tenants: allTenants ?? [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── MEMBERS ── */
    if (action === "members") {
      const tenantId = membersTenantScope ?? "";

      stage = "list_member_roles";
      const rolesBaseQuery = adminClient
        .from("user_roles")
        .select("id, user_id, tenant_id, role, created_at")
        .order("created_at", { ascending: true });

      const rolesQuery = tenantId
        ? rolesBaseQuery.eq("tenant_id", tenantId)
        : rolesBaseQuery;

      const { data: memberRoles, error: rolesErr } = await rolesQuery;

      if (rolesErr) {
        return new Response(JSON.stringify({ error: rolesErr.message, stage }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const memberUserIds = [...new Set((memberRoles ?? []).map((row) => row.user_id).filter(Boolean))];

      const fetchProfilesByIds = async (userIds: string[]) => {
        const profileRows: Array<{
          id: string;
          display_name: string | null;
          email: string | null;
          avatar_url: string | null;
          tenant_id: string;
          created_at: string;
        }> = [];

        const chunkSize = 500;
        for (let i = 0; i < userIds.length; i += chunkSize) {
          const chunk = userIds.slice(i, i + chunkSize);
          if (chunk.length === 0) continue;

          stage = "list_member_profiles";
          const { data: profilesData, error: profilesErr } = await adminClient
            .from("profiles")
            .select("id, display_name, email, avatar_url, tenant_id, created_at")
            .in("id", chunk)
            .order("created_at", { ascending: true });

          if (profilesErr) {
            return { data: null, error: profilesErr };
          }

          profileRows.push(...((profilesData ?? []) as typeof profileRows));
        }

        return { data: profileRows, error: null as any };
      };

      // Scoped mode (tenant_id informado): mantém retorno apenas dos membros do tenant.
      if (tenantId) {
        let memberProfiles: Array<{
          id: string;
          display_name: string | null;
          email: string | null;
          avatar_url: string | null;
          tenant_id: string;
          created_at: string;
        }> = [];

        if (memberUserIds.length > 0) {
          const { data: profilesData, error: profilesErr } = await fetchProfilesByIds(memberUserIds);
          if (profilesErr) {
            return new Response(JSON.stringify({ error: profilesErr.message, stage }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          memberProfiles = (profilesData ?? []) as typeof memberProfiles;
        }

        return new Response(JSON.stringify({
          roles: memberRoles ?? [],
          profiles: memberProfiles,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Global mode (sem tenant_id): inclui todos os usuários de autenticação,
      // mesmo que ainda não tenham vínculo em user_roles.
      stage = "list_auth_users";
      const authUsers: Array<Record<string, any>> = [];
      const perPage = 200;
      let page = 1;

      while (page <= 20) {
        const { data: authData, error: authErr } = await adminClient.auth.admin.listUsers({ page, perPage });
        if (authErr) {
          return new Response(JSON.stringify({ error: authErr.message, stage }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const usersPage = (authData?.users ?? []) as Array<Record<string, any>>;
        authUsers.push(...usersPage);

        if (usersPage.length < perPage) break;
        page += 1;
      }

      const authUserIds = authUsers.map((u) => String(u.id)).filter(Boolean);
      const allUserIds = [...new Set([...authUserIds, ...memberUserIds])];

      const { data: profileRows, error: profileRowsErr } = await fetchProfilesByIds(allUserIds);
      if (profileRowsErr) {
        return new Response(JSON.stringify({ error: profileRowsErr.message, stage }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const profileById = new Map((profileRows ?? []).map((p) => [p.id, p]));
      const authById = new Map(authUsers.map((u) => [String(u.id), u]));
      const firstTenantByUser = new Map<string, string>();
      for (const r of memberRoles ?? []) {
        if (!firstTenantByUser.has(r.user_id)) {
          firstTenantByUser.set(r.user_id, r.tenant_id);
        }
      }

      const memberProfiles = allUserIds
        .map((uid) => {
          const p = profileById.get(uid);
          const au = authById.get(uid);
          const userMeta = (au?.user_metadata ?? {}) as Record<string, any>;

          const fallbackDisplayName =
            typeof userMeta.display_name === "string" && userMeta.display_name.trim().length > 0
              ? userMeta.display_name.trim()
              : typeof userMeta.full_name === "string" && userMeta.full_name.trim().length > 0
                ? userMeta.full_name.trim()
                : null;

          const fallbackEmail = typeof au?.email === "string" ? au.email : null;
          const fallbackAvatar = typeof userMeta.avatar_url === "string" ? userMeta.avatar_url : null;
          const fallbackCreatedAt = typeof au?.created_at === "string" ? au.created_at : new Date().toISOString();

          return {
            id: uid,
            display_name: p?.display_name ?? fallbackDisplayName,
            email: p?.email ?? fallbackEmail,
            avatar_url: p?.avatar_url ?? fallbackAvatar,
            tenant_id: p?.tenant_id ?? firstTenantByUser.get(uid) ?? "",
            created_at: p?.created_at ?? fallbackCreatedAt,
          };
        })
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      return new Response(JSON.stringify({
        roles: memberRoles ?? [],
        profiles: memberProfiles,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── DELETE ── */
    if (action === "delete") {
      const tenantId = String(body?.tenant_id || "").trim();
      if (!tenantId) {
        return new Response(JSON.stringify({ error: "tenant_id is required", stage }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      stage = "delete_tenant";
      const { error: delErr } = await adminClient
        .from("tenants")
        .delete()
        .eq("id", tenantId);

      if (delErr) {
        return new Response(JSON.stringify({ error: delErr.message, stage }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, deleted: tenantId }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── CREATE ── */
    if (action !== "create") {
      return new Response(JSON.stringify({ error: "Unsupported action", stage }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const name = String(body?.name || "").trim();
    const slugInput = String(body?.slug || name).trim();

    if (!name) {
      return new Response(JSON.stringify({ error: "name is required", stage }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseSlug = slugify(slugInput || name);
    if (!baseSlug) {
      return new Response(JSON.stringify({ error: "slug is invalid", stage }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tryInsert = async (candidateSlug: string) => {
      stage = `insert_tenant:${candidateSlug}`;
      return await adminClient
        .from("tenants")
        .insert({ name, slug: candidateSlug })
        .select("id, name, slug, created_at, updated_at")
        .single();
    };

    let result = await tryInsert(baseSlug);

    if (result.error && (result.error.code === "23505" || result.error.message?.includes("tenants_slug_key"))) {
      result = await tryInsert(`${baseSlug}-${crypto.randomUUID().slice(0, 6)}`);
    }

    if (result.error || !result.data) {
      return new Response(JSON.stringify({
        error: result.error?.message || "Failed to create tenant",
        code: result.error?.code || null,
        details: result.error?.details || null,
        hint: result.error?.hint || null,
        stage,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    stage = "verify_created_tenant";
    const { data: persistedTenant, error: persistedTenantError } = await adminClient
      .from("tenants")
      .select("id, name, slug, created_at, updated_at")
      .eq("id", result.data.id)
      .maybeSingle();

    if (persistedTenantError || !persistedTenant) {
      return new Response(JSON.stringify({
        error: persistedTenantError?.message || "Tenant was not persisted",
        code: persistedTenantError?.code || null,
        details: persistedTenantError?.details || null,
        hint: persistedTenantError?.hint || null,
        stage,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, tenant: persistedTenant }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const msg = err?.message || err?.toString?.() || "Internal error";
    console.error("[tenant-admin] Error:", msg, "stage=", stage, JSON.stringify(err));
    return new Response(JSON.stringify({
      error: msg,
      code: err?.code || null,
      details: err?.details || null,
      hint: err?.hint || null,
      stage,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
