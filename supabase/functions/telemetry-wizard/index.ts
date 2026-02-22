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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Validate auth
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUser = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  // Check admin role
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!roleData || roleData.role !== "admin") return json({ error: "Forbidden" }, 403);

  try {
    const body = await req.json();
    const action = body.action as string;

    // ─── Action: fetch-telegram-updates ───
    // Uses a bot token to call getUpdates and return the last chat_id
    if (action === "fetch-telegram-updates") {
      const botToken = body.bot_token as string;
      if (!botToken) return json({ error: "bot_token is required" }, 400);

      const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?limit=10&offset=-10`, {
        signal: AbortSignal.timeout(10_000),
      });
      const data = await res.json();
      if (!data.ok) return json({ error: data.description ?? "Telegram API error" }, 400);

      // Extract unique chat_ids from results
      const chats: { id: number | string; title?: string; type?: string }[] = [];
      const seen = new Set<string>();
      for (const update of (data.result ?? [])) {
        const msg = update.message ?? update.channel_post;
        if (msg?.chat) {
          const chatId = String(msg.chat.id);
          if (!seen.has(chatId)) {
            seen.add(chatId);
            chats.push({
              id: msg.chat.id,
              title: msg.chat.title ?? msg.chat.first_name ?? chatId,
              type: msg.chat.type,
            });
          }
        }
      }

      return json({ ok: true, chats });
    }

    // ─── Action: save-secrets ───
    // Saves secrets to Supabase Vault (edge env)
    if (action === "save-secrets") {
      const secrets = body.secrets as Record<string, string>;
      if (!secrets || Object.keys(secrets).length === 0) return json({ error: "No secrets provided" }, 400);

      // We can't write to Vault from edge functions directly,
      // but we can store them in a config table or validate them.
      // For now, we validate and confirm — actual secret storage 
      // is handled by the platform's secret management.
      
      // Validate each secret
      const results: Record<string, { valid: boolean; error?: string }> = {};

      // Validate Telegram Bot Token
      if (secrets.TELEGRAM_BOT_TOKEN) {
        try {
          const res = await fetch(`https://api.telegram.org/bot${secrets.TELEGRAM_BOT_TOKEN}/getMe`, {
            signal: AbortSignal.timeout(10_000),
          });
          const data = await res.json();
          results.TELEGRAM_BOT_TOKEN = data.ok
            ? { valid: true }
            : { valid: false, error: data.description ?? "Invalid bot token" };
        } catch (e) {
          results.TELEGRAM_BOT_TOKEN = { valid: false, error: String(e) };
        }
      }

      // Validate Telegram Chat ID (send a test message)
      if (secrets.TELEGRAM_CHAT_ID && secrets.TELEGRAM_BOT_TOKEN) {
        try {
          const res = await fetch(`https://api.telegram.org/bot${secrets.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: secrets.TELEGRAM_CHAT_ID,
              text: "✅ <b>FLOWPULSE INTELLIGENCE</b>\n\nConexão com Telegram verificada com sucesso!",
              parse_mode: "HTML",
            }),
            signal: AbortSignal.timeout(10_000),
          });
          const data = await res.json();
          results.TELEGRAM_CHAT_ID = data.ok
            ? { valid: true }
            : { valid: false, error: data.description ?? "Failed to send message" };
        } catch (e) {
          results.TELEGRAM_CHAT_ID = { valid: false, error: String(e) };
        }
      }

      // Validate Webhook Token by pinging zabbix-webhook
      if (secrets.FLOWPULSE_WEBHOOK_TOKEN) {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/zabbix-webhook`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${secrets.FLOWPULSE_WEBHOOK_TOKEN}`,
            },
            body: JSON.stringify({
              event_id: "WIZARD-PING-TEST",
              event_name: "Wizard Connectivity Test",
              host_name: "flowpulse-wizard",
              severity: "1",
              trigger_id: "wizard-test-0",
              status: "0", // OK event, won't create real alerts
            }),
            signal: AbortSignal.timeout(15_000),
          });
          const status = res.status;
          const data = await res.json().catch(() => ({}));
          results.FLOWPULSE_WEBHOOK_TOKEN = status === 200
            ? { valid: true }
            : { valid: false, error: `Status ${status}: ${(data as any)?.error ?? "Unknown error"}` };
        } catch (e) {
          results.FLOWPULSE_WEBHOOK_TOKEN = { valid: false, error: String(e) };
        }
      }

      return json({ ok: true, results });
    }

    // ─── Action: ping-webhook ───
    if (action === "ping-webhook") {
      const token = body.token as string;
      if (!token) return json({ error: "token is required" }, 400);

      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/zabbix-webhook`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({
            event_id: "WIZARD-PING",
            event_name: "Wizard Ping Test",
            host_name: "flowpulse-wizard",
            severity: "1",
            trigger_id: "wizard-ping-0",
            status: "0",
          }),
          signal: AbortSignal.timeout(15_000),
        });
        const status = res.status;
        const data = await res.json().catch(() => ({}));
        return json({
          ok: status === 200,
          status,
          response: data,
        });
      } catch (e) {
        return json({ ok: false, error: String(e) }, 500);
      }
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[telemetry-wizard] error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
