import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 50;
const SEND_TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    // 1. Fetch pending notifications ready to fire
    const { data: notifications, error } = await supabase
      .from("alert_notifications")
      .select(`
        id,
        tenant_id,
        alert_id,
        policy_id,
        step_id,
        channel_id,
        attempts,
        status,
        next_attempt_at,
        request,
        response
      `)
      .eq("status", "pending")
      .lte("next_attempt_at", new Date().toISOString())
      .lt("attempts", MAX_ATTEMPTS)
      .limit(BATCH_SIZE);

    if (error) throw new Error(`fetch notifications: ${error.message}`);
    if (!notifications || notifications.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, message: "no pending notifications" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const n of notifications) {
      try {
        // 2. Validate current alert state
        const { data: alert } = await supabase
          .from("alert_instances")
          .select("id, status, severity, title, suppressed, dedupe_key")
          .eq("id", n.alert_id)
          .single();

        if (!alert || alert.status === "resolved" || alert.suppressed) {
          await supabase
            .from("alert_notifications")
            .update({
              status: "skipped",
              response: { reason: !alert ? "alert_not_found" : alert.status === "resolved" ? "alert_resolved" : "alert_suppressed" },
            })
            .eq("id", n.id);
          skipped++;
          continue;
        }

        // If ACK and step config says skip on ack, skip
        const reqMeta = n.request as Record<string, unknown> ?? {};
        if (alert.status === "ack" && reqMeta.skip_on_ack === true) {
          await supabase
            .from("alert_notifications")
            .update({ status: "skipped", response: { reason: "alert_acked" } })
            .eq("id", n.id);
          skipped++;
          continue;
        }

        // 3. Throttle check: don't re-send same alert+step within throttle window
        const throttleSeconds = (reqMeta.throttle_seconds as number) ?? 60;
        const { data: lastSent } = await supabase
          .from("alert_notifications")
          .select("sent_at")
          .eq("alert_id", n.alert_id)
          .eq("step_id", n.step_id)
          .eq("status", "sent")
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastSent?.sent_at) {
          const elapsed = (Date.now() - new Date(lastSent.sent_at).getTime()) / 1000;
          if (elapsed < throttleSeconds) {
            await supabase
              .from("alert_notifications")
              .update({ status: "skipped", response: { reason: "throttled", elapsed_s: Math.round(elapsed) } })
              .eq("id", n.id);
            skipped++;
            continue;
          }
        }

        // 4. Fetch channel config
        const { data: channel } = await supabase
          .from("notification_channels")
          .select("channel, config, is_active")
          .eq("id", n.channel_id)
          .single();

        if (!channel || !channel.is_active) {
          await supabase
            .from("alert_notifications")
            .update({ status: "skipped", response: { reason: "channel_inactive" } })
            .eq("id", n.id);
          skipped++;
          continue;
        }

        // 5. Send notification
        const config = channel.config as Record<string, unknown>;
        const sendResult = await sendNotification(channel.channel, config, alert);

        if (sendResult.ok) {
          await supabase
            .from("alert_notifications")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              attempts: n.attempts + 1,
              response: { status: sendResult.status, body: sendResult.body?.substring(0, 500) },
            })
            .eq("id", n.id);
          sent++;
        } else {
          throw new Error(`send failed [${sendResult.status}]: ${sendResult.body?.substring(0, 300)}`);
        }
      } catch (err) {
        // 6. Retry with exponential backoff
        const backoffSeconds = Math.pow(2, n.attempts) * 60; // 60s, 120s, 240s, 480s, 960s
        const nextAttempt = new Date(Date.now() + backoffSeconds * 1000);
        const errorMsg = err instanceof Error ? err.message : String(err);

        const newStatus = n.attempts + 1 >= MAX_ATTEMPTS ? "failed" : "pending";

        await supabase
          .from("alert_notifications")
          .update({
            status: newStatus,
            attempts: n.attempts + 1,
            next_attempt_at: nextAttempt.toISOString(),
            last_error: errorMsg.substring(0, 500),
          })
          .eq("id", n.id);
        failed++;
      }
    }

    const summary = { processed: notifications.length, sent, skipped, failed };
    console.log("escalation-worker summary:", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("escalation-worker fatal:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

/* ─── channel dispatchers ────────────────────────── */

interface SendResult {
  ok: boolean;
  status: number;
  body?: string;
}

async function sendNotification(
  channelType: string,
  config: Record<string, unknown>,
  alert: { id: string; severity: string; title: string; dedupe_key: string },
): Promise<SendResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    switch (channelType) {
      case "slack":
        return await sendSlack(config, alert, controller.signal);
      case "webhook":
        return await sendWebhook(config, alert, controller.signal);
      case "telegram":
        return await sendTelegram(config, alert, controller.signal);
      default:
        return { ok: false, status: 0, body: `unsupported channel: ${channelType}` };
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function sendSlack(
  config: Record<string, unknown>,
  alert: { id: string; severity: string; title: string; dedupe_key: string },
  signal: AbortSignal,
): Promise<SendResult> {
  const webhookUrl = config.webhook_url as string;
  if (!webhookUrl) return { ok: false, status: 0, body: "missing webhook_url in channel config" };

  const severityEmoji: Record<string, string> = {
    info: "ℹ️",
    warning: "⚠️",
    average: "🔶",
    high: "🔴",
    disaster: "🚨",
  };

  const emoji = severityEmoji[alert.severity] ?? "🔔";
  const resp = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      text: `${emoji} *[${alert.severity.toUpperCase()}]* ${alert.title}\n\`alert_id: ${alert.id}\`\n\`dedupe: ${alert.dedupe_key}\``,
    }),
  });

  const body = await resp.text();
  return { ok: resp.ok, status: resp.status, body };
}

async function sendWebhook(
  config: Record<string, unknown>,
  alert: { id: string; severity: string; title: string; dedupe_key: string },
  signal: AbortSignal,
): Promise<SendResult> {
  const url = config.url as string;
  if (!url) return { ok: false, status: 0, body: "missing url in channel config" };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // Support optional auth header
  if (config.auth_header) headers["Authorization"] = config.auth_header as string;

  const resp = await fetch(url, {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      event: "alert",
      alert_id: alert.id,
      severity: alert.severity,
      title: alert.title,
      dedupe_key: alert.dedupe_key,
      ts: new Date().toISOString(),
    }),
  });

  const body = await resp.text();
  return { ok: resp.ok, status: resp.status, body };
}

async function sendTelegram(
  config: Record<string, unknown>,
  alert: { id: string; severity: string; title: string; dedupe_key: string },
  signal: AbortSignal,
): Promise<SendResult> {
  const botToken = config.bot_token as string;
  const chatId = config.chat_id as string;
  if (!botToken || !chatId) return { ok: false, status: 0, body: "missing bot_token or chat_id" };

  const text = `🚨 *${alert.severity.toUpperCase()}*\n${alert.title}\n\`${alert.dedupe_key}\``;
  const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });

  const body = await resp.text();
  return { ok: resp.ok, status: resp.status, body };
}
