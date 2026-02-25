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

/* ─── AES-GCM helpers for encrypting config values ─── */
async function deriveKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("ZABBIX_ENCRYPTION_KEY");
  if (!secret) throw new Error("ZABBIX_ENCRYPTION_KEY not configured");
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new TextEncoder().encode("telemetry-config-salt"), iterations: 100000, hash: "SHA-256" },
    keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

async function encrypt(plaintext: string): Promise<{ ciphertext: string; iv: string; tag: string }> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, encoded);
  const buf = new Uint8Array(encrypted);
  const ciphertext = buf.slice(0, buf.length - 16);
  const tag = buf.slice(buf.length - 16);
  return {
    ciphertext: btoa(String.fromCharCode(...ciphertext)),
    iv: btoa(String.fromCharCode(...iv)),
    tag: btoa(String.fromCharCode(...tag)),
  };
}

async function decrypt(ciphertext: string, ivB64: string, tagB64: string): Promise<string> {
  const key = await deriveKey();
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const tag = Uint8Array.from(atob(tagB64), (c) => c.charCodeAt(0));
  const combined = new Uint8Array(ct.length + tag.length);
  combined.set(ct);
  combined.set(tag, ct.length);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, combined);
  return new TextDecoder().decode(decrypted);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // Check admin role
  const { data: tenantId } = await supabase.rpc("get_user_tenant_id", { p_user_id: user.id });
  if (!tenantId) return json({ error: "No tenant" }, 403);

  const { data: isAdmin } = await supabase.rpc("has_role", {
    p_user_id: user.id, p_tenant_id: tenantId, p_role: "admin",
  });
  const { data: isSA } = await supabase.rpc("is_super_admin", { p_user_id: user.id });
  if (!isAdmin && !isSA) return json({ error: "Forbidden" }, 403);

  try {
    const body = await req.json();
    const action = body.action as string;

    // ─── Action: health-check ───
    if (action === "health-check") {
      // Check which secrets are configured (env vars)
      const secrets: Record<string, { configured: boolean }> = {
        FLOWPULSE_WEBHOOK_TOKEN: { configured: !!Deno.env.get("FLOWPULSE_WEBHOOK_TOKEN") },
        TELEGRAM_BOT_TOKEN: { configured: !!Deno.env.get("TELEGRAM_BOT_TOKEN") },
        TELEGRAM_CHAT_ID: { configured: !!Deno.env.get("TELEGRAM_CHAT_ID") },
      };

      // Also check telemetry_config for tenant-specific overrides
      const { data: configs } = await supabase
        .from("telemetry_config")
        .select("config_key")
        .eq("tenant_id", tenantId);
      
      for (const c of (configs ?? [])) {
        if (secrets[c.config_key]) {
          secrets[c.config_key].configured = true;
        }
      }

      // Get heartbeat
      const { data: heartbeat } = await supabase
        .from("telemetry_heartbeat")
        .select("*")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      // Get last alert count
      const { count: alertCount } = await supabase
        .from("alert_instances")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId);

      return json({
        ok: true,
        secrets,
        heartbeat: heartbeat ?? null,
        alert_count: alertCount ?? 0,
      });
    }

    // ─── Action: fetch-telegram-updates ───
    if (action === "fetch-telegram-updates") {
      const botToken = body.bot_token as string;
      if (!botToken) return json({ error: "bot_token is required" }, 400);

      const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?limit=10&offset=-10`, {
        signal: AbortSignal.timeout(10_000),
      });
      const data = await res.json();
      if (!data.ok) return json({ error: data.description ?? "Telegram API error" }, 400);

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
    if (action === "save-secrets") {
      const secrets = body.secrets as Record<string, string>;
      if (!secrets || Object.keys(secrets).length === 0) return json({ error: "No secrets provided" }, 400);

      const results: Record<string, { valid: boolean; saved: boolean; error?: string }> = {};

      // Validate Telegram Bot Token
      if (secrets.TELEGRAM_BOT_TOKEN) {
        try {
          const res = await fetch(`https://api.telegram.org/bot${secrets.TELEGRAM_BOT_TOKEN}/getMe`, {
            signal: AbortSignal.timeout(10_000),
          });
          const data = await res.json();
          if (data.ok) {
            const enc = await encrypt(secrets.TELEGRAM_BOT_TOKEN);
            await supabase.from("telemetry_config").upsert({
              tenant_id: tenantId, config_key: "TELEGRAM_BOT_TOKEN",
              config_value: enc.ciphertext, iv: enc.iv, tag: enc.tag,
              updated_at: new Date().toISOString(), updated_by: user.id,
            }, { onConflict: "tenant_id,config_key" });
            results.TELEGRAM_BOT_TOKEN = { valid: true, saved: true };
          } else {
            results.TELEGRAM_BOT_TOKEN = { valid: false, saved: false, error: data.description ?? "Invalid bot token" };
          }
        } catch (e) {
          results.TELEGRAM_BOT_TOKEN = { valid: false, saved: false, error: String(e) };
        }
      }

      // Validate & save Telegram Chat ID
      if (secrets.TELEGRAM_CHAT_ID) {
        const botTk = secrets.TELEGRAM_BOT_TOKEN || await getTenantSecret(supabase, tenantId, "TELEGRAM_BOT_TOKEN");
        if (botTk) {
          try {
            const res = await fetch(`https://api.telegram.org/bot${botTk}/sendMessage`, {
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
            if (data.ok) {
              const enc = await encrypt(secrets.TELEGRAM_CHAT_ID);
              await supabase.from("telemetry_config").upsert({
                tenant_id: tenantId, config_key: "TELEGRAM_CHAT_ID",
                config_value: enc.ciphertext, iv: enc.iv, tag: enc.tag,
                updated_at: new Date().toISOString(), updated_by: user.id,
              }, { onConflict: "tenant_id,config_key" });
              results.TELEGRAM_CHAT_ID = { valid: true, saved: true };
            } else {
              results.TELEGRAM_CHAT_ID = { valid: false, saved: false, error: data.description ?? "Failed to send" };
            }
          } catch (e) {
            results.TELEGRAM_CHAT_ID = { valid: false, saved: false, error: String(e) };
          }
        } else {
          results.TELEGRAM_CHAT_ID = { valid: false, saved: false, error: "Bot token not available for validation" };
        }
      }

      // Validate & save Webhook Token
      if (secrets.FLOWPULSE_WEBHOOK_TOKEN) {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/zabbix-webhook`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Webhook-Token": secrets.FLOWPULSE_WEBHOOK_TOKEN,
            },
            body: JSON.stringify({
              event_id: "WIZARD-PING-TEST",
              event_name: "Wizard Connectivity Test",
              host_name: "flowpulse-wizard",
              severity: "1", trigger_id: "wizard-test-0", status: "0",
            }),
            signal: AbortSignal.timeout(15_000),
          });
          const status = res.status;
          const data = await res.json().catch(() => ({}));
          if (status === 200) {
            const enc = await encrypt(secrets.FLOWPULSE_WEBHOOK_TOKEN);
            await supabase.from("telemetry_config").upsert({
              tenant_id: tenantId, config_key: "FLOWPULSE_WEBHOOK_TOKEN",
              config_value: enc.ciphertext, iv: enc.iv, tag: enc.tag,
              updated_at: new Date().toISOString(), updated_by: user.id,
            }, { onConflict: "tenant_id,config_key" });
            results.FLOWPULSE_WEBHOOK_TOKEN = { valid: true, saved: true };
          } else {
            results.FLOWPULSE_WEBHOOK_TOKEN = { valid: false, saved: false, error: `Status ${status}: ${(data as any)?.error ?? ""}` };
          }
        } catch (e) {
          results.FLOWPULSE_WEBHOOK_TOKEN = { valid: false, saved: false, error: String(e) };
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
            "X-Webhook-Token": token,
          },
          body: JSON.stringify({
            event_id: "WIZARD-PING",
            event_name: "Wizard Ping Test",
            host_name: "flowpulse-wizard",
            severity: "1", trigger_id: "wizard-ping-0", status: "0",
          }),
          signal: AbortSignal.timeout(15_000),
        });
        const status = res.status;
        const data = await res.json().catch(() => ({}));
        return json({ ok: status === 200, status, response: data });
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

/* Helper: get decrypted tenant secret from telemetry_config */
async function getTenantSecret(supabase: any, tenantId: string, key: string): Promise<string | null> {
  const { data } = await supabase
    .from("telemetry_config")
    .select("config_value, iv, tag")
    .eq("tenant_id", tenantId)
    .eq("config_key", key)
    .maybeSingle();
  if (!data) return Deno.env.get(key) || null;
  try {
    return await decrypt(data.config_value, data.iv, data.tag);
  } catch {
    return null;
  }
}
