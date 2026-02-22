import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* ─── Types ─── */
interface ZabbixWebhookPayload {
  event_id?: string;
  event_name?: string;
  host_name?: string;
  host_ip?: string;
  severity?: string;
  trigger_id?: string;
  pon_index?: string;
  status?: string;        // "1" = PROBLEM, "0" = OK
  map_link?: string;
  tenant_id?: string;
  ingest_secret?: string;
  // Allow any extra fields from Zabbix macros
  [key: string]: unknown;
}

/* ─── Severity helpers ─── */
function severityEmoji(sev: string): string {
  const map: Record<string, string> = {
    "0": "ℹ️", "1": "ℹ️", "2": "⚠️", "3": "🟠", "4": "🔴", "5": "🔴",
    not_classified: "ℹ️", information: "ℹ️", warning: "⚠️",
    average: "🟠", high: "🔴", disaster: "🔴",
  };
  return map[(sev ?? "").toLowerCase()] ?? "🔴";
}

function severityLabel(sev: string): string {
  const map: Record<string, string> = {
    "0": "Not Classified", "1": "Information", "2": "Warning",
    "3": "Average", "4": "High", "5": "Disaster",
    not_classified: "Not Classified", information: "Information",
    warning: "Warning", average: "Average", high: "High", disaster: "Disaster",
  };
  return map[(sev ?? "").toLowerCase()] ?? sev ?? "High";
}

function mapSeverityToEnum(sev: string): string {
  const map: Record<string, string> = {
    "0": "info", "1": "info", "2": "warning", "3": "average", "4": "high", "5": "disaster",
    not_classified: "info", information: "info", warning: "warning",
    average: "average", high: "high", disaster: "disaster",
  };
  return map[(sev ?? "").toLowerCase()] ?? "high";
}

/* ─── Telegram sender ─── */
async function sendTelegram(
  botToken: string,
  chatId: string,
  payload: ZabbixWebhookPayload,
  mapUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  const isProblem = payload.status === "1" || payload.status?.toUpperCase() === "PROBLEM";
  const emoji = isProblem ? "🚨" : "✅";
  const headerText = isProblem ? "ALERTA DE QUEDA" : "RECUPERAÇÃO";
  const sevEmoji = severityEmoji(payload.severity ?? "5");
  const sevLabel = severityLabel(payload.severity ?? "5");

  const text = [
    `${emoji} <b>${headerText} — FLOWPULSE INTELLIGENCE</b> ${emoji}`,
    "",
    `<b>OLT:</b> ${payload.host_name ?? "—"}`,
    `<b>Evento:</b> ${payload.event_name ?? "—"}`,
    `<b>Severidade:</b> ${sevEmoji} ${sevLabel}`,
    payload.pon_index ? `<b>PON Index:</b> ${payload.pon_index}` : null,
    payload.host_ip ? `<b>IP:</b> ${payload.host_ip}` : null,
    "",
    isProblem
      ? "📍 <b>Ação Sugerida:</b> Clique no botão abaixo para abrir o mapa no ponto da falha."
      : "✅ O serviço foi <b>restaurado</b>.",
  ].filter(Boolean).join("\n");

  const inlineKeyboard = isProblem && mapUrl
    ? { inline_keyboard: [[{ text: "🗺️ ABRIR LOCALIZAÇÃO NO MAPA", url: mapUrl }]] }
    : undefined;

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (inlineKeyboard) body.reply_markup = inlineKeyboard;

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.description ?? "Telegram API error" };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/* ─── Main handler ─── */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const telegramChatId = Deno.env.get("TELEGRAM_CHAT_ID");

  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Missing Supabase config" }, 500);

  try {
    const payload = await req.json() as ZabbixWebhookPayload;

    if (!payload.event_id && !payload.trigger_id) {
      return json({ error: "Missing event_id or trigger_id" }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Build map URL for Telegram button
    const projectId = Deno.env.get("SUPABASE_URL")?.match(/\/\/([^.]+)/)?.[1] ?? "";
    const baseMapUrl = payload.map_link || "";
    const mapUrl = baseMapUrl || (payload.pon_index
      ? `https://id-preview--7592eaff-0de9-4d5a-ab8d-69f5cc575541.lovable.app/flowmap?pon_index=${encodeURIComponent(payload.pon_index)}`
      : "");

    // Forward to alert-ingest as a standard ingest event
    const isProblem = payload.status === "1" || payload.status?.toUpperCase() === "PROBLEM";
    const ingestEvent = {
      source: "zabbix",
      triggerid: payload.trigger_id ?? payload.event_id ?? "",
      hostid: "",
      host: payload.host_name ?? "",
      trigger_name: payload.event_name ?? "",
      severity: mapSeverityToEnum(payload.severity ?? ""),
      status: isProblem ? "PROBLEM" : "OK",
      value: isProblem ? "1" : "0",
      title: payload.event_name ?? `Zabbix Alert ${payload.event_id}`,
      description: `Host: ${payload.host_name ?? "—"} | PON: ${payload.pon_index ?? "—"} | IP: ${payload.host_ip ?? "—"}`,
      tags: {},
      // Pass through for matching
      zabbix_connection_id: payload.zabbix_connection_id as string | undefined,
      dashboard_id: payload.dashboard_id as string | undefined,
      pon_index: payload.pon_index,
      host_ip: payload.host_ip,
    };

    // Process through alert engine (inline, same as alert-ingest logic)
    let alertResult: { action: string; alert_id?: string; dedupe_key?: string } = {
      action: "forwarded",
    };

    try {
      // Fetch matching rules
      const { data: rules } = await supabase
        .from("alert_rules")
        .select("*")
        .eq("source", "zabbix")
        .eq("is_enabled", true);

      if (rules && rules.length > 0) {
        // Find matching rule
        const matchedRule = rules.find((rule: Record<string, unknown>) => {
          const matchers = rule.matchers as Record<string, unknown> | null;
          if (!matchers || Object.keys(matchers).length === 0) return true;
          for (const [key, expected] of Object.entries(matchers)) {
            const actual = (ingestEvent as Record<string, unknown>)[key];
            if (Array.isArray(expected)) {
              if (!expected.includes(actual)) return false;
            } else if (String(expected) !== String(actual ?? "")) {
              return false;
            }
          }
          return true;
        });

        if (matchedRule) {
          const tenantId = matchedRule.tenant_id as string;
          const dedupeTemplate = (matchedRule.dedupe_key_template as string) || "{{source}}:{{triggerid}}";
          const dedupeKey = dedupeTemplate.replace(/\{\{(\w+)\}\}/g, (_, k) => {
            if (k === "source") return "zabbix";
            if (k === "rule_id") return matchedRule.id as string;
            return String((ingestEvent as Record<string, unknown>)[k] ?? "");
          });

          if (isProblem) {
            // Check for existing open alert
            const { data: existing } = await supabase
              .from("alert_instances")
              .select("id, status")
              .eq("tenant_id", tenantId)
              .eq("dedupe_key", dedupeKey)
              .in("status", ["open", "ack"])
              .limit(1)
              .maybeSingle();

            if (existing) {
              // Refresh existing
              await supabase.from("alert_instances").update({
                last_seen_at: new Date().toISOString(),
                payload: ingestEvent,
                updated_at: new Date().toISOString(),
              }).eq("id", existing.id);
              alertResult = { action: "refreshed", alert_id: existing.id, dedupe_key: dedupeKey };
            } else {
              // Create new alert
              const { data: newAlert } = await supabase
                .from("alert_instances")
                .insert({
                  tenant_id: tenantId,
                  dedupe_key: dedupeKey,
                  title: ingestEvent.title,
                  severity: ingestEvent.severity,
                  status: "open",
                  rule_id: matchedRule.id as string,
                  payload: ingestEvent,
                })
                .select("id")
                .single();

              if (newAlert) {
                alertResult = { action: "opened", alert_id: newAlert.id, dedupe_key: dedupeKey };

                // Write open event
                await supabase.from("alert_events").insert({
                  tenant_id: tenantId,
                  alert_id: newAlert.id,
                  event_type: "OPEN",
                  from_status: null,
                  to_status: "open",
                  message: `Webhook: ${ingestEvent.title}`,
                  payload: ingestEvent,
                });
              }
            }
          } else {
            // OK event — auto-resolve
            const { data: existing } = await supabase
              .from("alert_instances")
              .select("id, status")
              .eq("tenant_id", tenantId)
              .eq("dedupe_key", dedupeKey)
              .in("status", ["open", "ack"])
              .limit(1)
              .maybeSingle();

            if (existing && matchedRule.auto_resolve) {
              await supabase.from("alert_instances").update({
                status: "resolved",
                resolved_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }).eq("id", existing.id);

              await supabase.from("alert_events").insert({
                tenant_id: tenantId,
                alert_id: existing.id,
                event_type: "AUTO_RESOLVE",
                from_status: existing.status,
                to_status: "resolved",
                message: "Webhook: auto-resolved by OK event",
                payload: ingestEvent,
              });

              alertResult = { action: "auto_resolved", alert_id: existing.id, dedupe_key: dedupeKey };
            }
          }
        }
      }
    } catch (alertErr) {
      console.error("[zabbix-webhook] alert processing error:", alertErr);
    }

    // Send Telegram notification
    let telegramResult: { ok: boolean; error?: string } = { ok: false, error: "Telegram not configured" };
    if (telegramBotToken && telegramChatId) {
      telegramResult = await sendTelegram(telegramBotToken, telegramChatId, payload, mapUrl);
      if (!telegramResult.ok) {
        console.error("[zabbix-webhook] Telegram error:", telegramResult.error);
      }
    }

    // Broadcast realtime update to FlowMap
    try {
      if (payload.pon_index) {
        await supabase.channel("flowmap:alerts").send({
          type: "broadcast",
          event: "ZABBIX_WEBHOOK",
          payload: {
            event_id: payload.event_id,
            event_name: payload.event_name,
            host_name: payload.host_name,
            pon_index: payload.pon_index,
            severity: payload.severity,
            status: payload.status,
            ts: new Date().toISOString(),
          },
        });
      }
    } catch (bcastErr) {
      console.error("[zabbix-webhook] broadcast error:", bcastErr);
    }

    console.log(`[zabbix-webhook] Processed event_id=${payload.event_id} host=${payload.host_name} status=${payload.status} alert=${alertResult.action} telegram=${telegramResult.ok}`);

    return json({
      received: true,
      event_id: payload.event_id,
      alert: alertResult,
      telegram: { sent: telegramResult.ok, error: telegramResult.error },
    });
  } catch (err) {
    console.error("[zabbix-webhook] error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
