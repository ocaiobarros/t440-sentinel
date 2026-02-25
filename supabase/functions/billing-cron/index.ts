import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// This function is called by pg_cron on the last day of each month.
// It iterates all tenants that have printer_configs and:
// 1. Creates a billing snapshot
// 2. Sends a Telegram push notification with the summary

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    // Get all tenants that have printer configs
    const { data: tenants } = await supabase
      .from("printer_configs")
      .select("tenant_id")
      .limit(500);

    const uniqueTenants = [...new Set((tenants ?? []).map((t: any) => t.tenant_id))];
    const results: { tenantId: string; ok: boolean; error?: string }[] = [];

    for (const tenantId of uniqueTenants) {
      try {
        // 1. Create snapshot via printer-status function
        const snapshotResp = await fetch(`${supabaseUrl}/functions/v1/printer-status`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ tenant_id: tenantId, action: "monthly_snapshot" }),
        });
        const snapshotData = await snapshotResp.json();

        // 2. Send Telegram notification
        if (snapshotData.ok) {
          const countersResp = await fetch(`${supabaseUrl}/functions/v1/printer-status`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ tenant_id: tenantId, action: "counters" }),
          });
          const countersData = await countersResp.json();

          if (countersData.printers?.length > 0) {
            const lines = countersData.printers.map(
              (p: any) => `• [${p.name}] ${p.billingCounter.toLocaleString("pt-BR")} pág.`,
            );

            const text =
              `📊 *FECHAMENTO MENSAL — ${snapshotData.period}*\n\n` +
              `🖨️ Contadores de Faturamento:\n${lines.join("\n")}\n\n` +
              `📄 *Total: ${countersData.total.toLocaleString("pt-BR")} páginas*\n\n` +
              `_Snapshot salvo automaticamente._`;

            await fetch(`${supabaseUrl}/functions/v1/telegram-bot`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceRoleKey}`,
              },
              body: JSON.stringify({
                action: "send_alert",
                tenant_id: tenantId,
                title: `Fechamento Mensal — ${snapshotData.period}`,
                severity: "info",
                details: text,
                alert_type: "billing_monthly",
              }),
            });
          }
        }

        results.push({ tenantId, ok: true });
      } catch (err) {
        results.push({ tenantId, ok: false, error: String(err) });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("billing-cron error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
