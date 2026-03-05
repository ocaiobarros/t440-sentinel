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

    const [{ data: isAdmin }, { data: isSuperAdmin }] = await Promise.all([
      adminClient.rpc("has_role", {
        p_user_id: caller.id,
        p_tenant_id: callerTenant,
        p_role: "admin",
      }),
      adminClient.rpc("is_super_admin", { p_user_id: caller.id }),
    ]);

    if (!isAdmin && !isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action = String(body?.action || "create").trim().toLowerCase();

    if (action !== "create") {
      return new Response(JSON.stringify({ error: "Unsupported action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const name = String(body?.name || "").trim();
    const slugInput = String(body?.slug || name).trim();

    if (!name) {
      return new Response(JSON.stringify({ error: "name is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseSlug = slugify(slugInput || name);
    if (!baseSlug) {
      return new Response(JSON.stringify({ error: "slug is invalid" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tryInsert = async (candidateSlug: string) => {
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
      return new Response(JSON.stringify({ error: result.error?.message || "Failed to create tenant" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, tenant: result.data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const msg = err?.message || err?.toString?.() || "Internal error";
    console.error("[tenant-admin] Error:", msg, JSON.stringify(err));
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
