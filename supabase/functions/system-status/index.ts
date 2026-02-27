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
    // Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try to read real data from system_status_snapshots
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sbAdmin = createClient(supabaseUrl, serviceRole);

    // Get user tenant
    const { data: tenantId } = await sbAdmin.rpc("get_user_tenant_id", { p_user_id: user.id });

    if (tenantId) {
      const { data: snapshot } = await sbAdmin
        .from("system_status_snapshots")
        .select("payload, collected_at")
        .eq("tenant_id", tenantId)
        .single();

      if (snapshot?.payload) {
        // Return real data from agent
        const payload = snapshot.payload as Record<string, unknown>;
        payload.collected_at = snapshot.collected_at;
        payload._source = "agent";
        return new Response(JSON.stringify(payload), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fallback: simulated data for Cloud or when no agent is running
    const now = Date.now();
    const bootEpoch = 1740000000000;
    const appEpoch = 1740200000000;

    const numCores = 4;
    const coreLoads = Array.from({ length: numCores }, (_, i) => ({
      core: i,
      usage: Math.round(8 + Math.random() * 25),
    }));
    const avgCpu = Math.round(coreLoads.reduce((s, c) => s + c.usage, 0) / numCores);

    const totalRamGb = 15.8;
    const usedRamGb = +(2.0 + Math.random() * 0.4).toFixed(1);

    const payload = {
      _source: "demo",
      os: { name: "Debian GNU/Linux 12 (bookworm)", kernel: "6.1.0-28-amd64", arch: "x86_64" },
      app_version: "2.4.1",
      uptime: {
        system_seconds: Math.floor((now - bootEpoch) / 1000),
        app_seconds: Math.floor((now - appEpoch) / 1000),
      },
      cpu: {
        model: "Intel Xeon E-2278G @ 3.40GHz",
        cores: numCores,
        usage_percent: avgCpu,
        frequency_mhz: 3400,
        per_core: coreLoads,
      },
      memory: {
        total_gb: totalRamGb,
        used_gb: usedRamGb,
        percent: Math.round((usedRamGb / totalRamGb) * 100),
      },
      swap: { total_gb: 2.0, used_gb: 0.17, percent: 9 },
      disks: [
        { mount: "/", totalGb: 50, usedGb: 18.1, percent: 36 },
        { mount: "/data", totalGb: 200, usedGb: 46, percent: 23 },
      ],
      database: { size_mb: 142, engine: "PostgreSQL 15" },
      services: [
        { name: "flowpulse-api", status: "running", pid: 1842 },
        { name: "postgresql", status: "running", pid: 923 },
        { name: "bgp-collector", status: "running", pid: 2105 },
      ],
      collected_at: new Date().toISOString(),
    };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
