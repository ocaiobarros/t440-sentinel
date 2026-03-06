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

    stage = "authorize_caller";
    const { data: isSuperAdmin } = await adminClient.rpc("is_super_admin", { p_user_id: caller.id });

    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Super admin role required", stage }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    stage = "parse_request";
    const body = await req.json();
    const action = String(body?.action || "create").trim().toLowerCase();

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
