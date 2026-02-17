import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ─── AES-GCM helpers ─────────────────────────────── */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  if (/^[0-9a-fA-F]{64}$/.test(secret)) {
    return crypto.subtle.importKey("raw", hexToBytes(secret), { name: "AES-GCM" }, false, ["decrypt"]);
  }
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["decrypt"]);
}

async function decryptPassword(ct: string, iv: string, tag: string, key: string): Promise<string> {
  const cryptoKey = await deriveAesKey(key);
  const ivBytes = hexToBytes(iv);
  const ctBytes = hexToBytes(ct);
  const tagBytes = hexToBytes(tag);
  const combined = new Uint8Array(ctBytes.length + tagBytes.length);
  combined.set(ctBytes);
  combined.set(tagBytes, ctBytes.length);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes, tagLength: 128 }, cryptoKey, combined);
  return new TextDecoder().decode(decrypted);
}

/* ─── Zabbix JSON-RPC ────────────────────────────── */
async function zabbixLogin(url: string, username: string, password: string): Promise<string> {
  const res = await fetch(`${url}/api_jsonrpc.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "user.login", params: { username, password }, id: 1 }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Zabbix login failed: ${JSON.stringify(data.error)}`);
  return data.result;
}

async function zabbixCall(url: string, auth: string, method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const res = await fetch(`${url}/api_jsonrpc.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, auth, id: 2 }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Zabbix ${method}: ${JSON.stringify(data.error)}`);
  return data.result;
}

/* ─── Types ──────────────────────────────────────── */
interface PollRequest {
  connection_id: string;
  dashboard_id: string;
  /** Widget definitions: each has a telemetry key pattern and query config */
  widgets: WidgetPollConfig[];
}

interface WidgetPollConfig {
  widget_id: string;
  widget_type: string; // "stat" | "gauge" | "timeseries" | "table" | "text"
  query: {
    source: string;
    method: string;
    params: Record<string, unknown>;
  };
  adapter: {
    type: string;
    /** Field to extract as value (e.g. "lastvalue") */
    value_field?: string;
    /** For timeseries: history type (0=float, 1=char, 3=uint, 4=text) */
    history_type?: number;
    /** Custom telemetry key override */
    telemetry_key?: string;
  };
}

interface TelemetryPayload {
  tenant_id: string;
  dashboard_id: string;
  key: string;
  type: string;
  data: Record<string, unknown>;
  ts: number;
  v: number;
}

/* ─── Adapters: transform Zabbix data → telemetry ── */
function adaptItemToStat(items: Array<Record<string, string>>, cfg: WidgetPollConfig): TelemetryPayload[] {
  const valueField = cfg.adapter.value_field || "lastvalue";
  const isStatusType = ["status", "icon-value", "progress"].includes(cfg.widget_type);
  
  return items.map((item) => {
    const rawStr = item[valueField] || "0";
    const rawValue = parseFloat(rawStr);
    const key = cfg.adapter.telemetry_key || `zbx:item:${item.itemid}`;
    
    // For status-like widgets, send the raw string value so color_map can match it
    if (isStatusType) {
      return {
        tenant_id: "",
        dashboard_id: "",
        key,
        type: "stat",
        data: {
          value: rawStr,
          unit: item.units || "",
        },
        ts: Date.now(),
        v: 1,
      };
    }
    
    return {
      tenant_id: "",
      dashboard_id: "",
      key,
      type: cfg.widget_type === "gauge" ? "gauge" : "stat",
      data: {
        value: rawValue,
        unit: item.units || "",
        ...(cfg.widget_type === "gauge" ? { min: 0, max: 100 } : {}),
      },
      ts: Date.now(),
      v: 1,
    };
  });
}

function adaptHistoryToTimeseries(history: Array<Record<string, string>>, cfg: WidgetPollConfig): TelemetryPayload[] {
  const key = cfg.adapter.telemetry_key || `zbx:widget:${cfg.widget_id}:ts`;
  const points = history.map((h) => ({
    ts: parseInt(h.clock) * 1000,
    value: parseFloat(h.value || "0"),
  }));
  // Sort ascending
  points.sort((a, b) => a.ts - b.ts);
  return [{
    tenant_id: "",
    dashboard_id: "",
    key,
    type: "timeseries",
    data: { points, unit: "", label: "" },
    ts: Date.now(),
    v: 1,
  }];
}

function adaptToTable(items: Array<Record<string, string>>, cfg: WidgetPollConfig): TelemetryPayload[] {
  const key = cfg.adapter.telemetry_key || `zbx:widget:${cfg.widget_id}:table`;
  const columns = ["Name", "Last Value", "Status"];
  const rows = items.map((item) => [
    item.name || item.itemid,
    item.lastvalue || "",
    item.status === "0" ? "Enabled" : "Disabled",
  ]);
  return [{
    tenant_id: "",
    dashboard_id: "",
    key,
    type: "table",
    data: { columns, rows },
    ts: Date.now(),
    v: 1,
  }];
}

function adaptResult(result: unknown, cfg: WidgetPollConfig): TelemetryPayload[] {
  const items = Array.isArray(result) ? result : [];
  switch (cfg.widget_type) {
    case "stat":
    case "gauge":
      return adaptItemToStat(items, cfg);
    case "timeseries":
      return adaptHistoryToTimeseries(items, cfg);
    case "table":
      return adaptToTable(items, cfg);
    case "text": {
      const key = cfg.adapter.telemetry_key || `zbx:widget:${cfg.widget_id}:text`;
      const text = items.length > 0 ? JSON.stringify(items[0], null, 2) : "No data";
      return [{
        tenant_id: "", dashboard_id: "", key,
        type: "text", data: { text, format: "plain" }, ts: Date.now(), v: 1,
      }];
    }
    default:
      return adaptItemToStat(items, cfg);
  }
}

/* ─── Main ───────────────────────────────────────── */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const encryptionKey = Deno.env.get("ZABBIX_ENCRYPTION_KEY");

  if (!encryptionKey) {
    return json({ error: "ZABBIX_ENCRYPTION_KEY not configured" }, 500);
  }

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claims?.claims) {
    return json({ error: "Invalid token" }, 401);
  }

  const userId = claims.claims.sub as string;

  try {
    const body: PollRequest = await req.json();
    const { connection_id, dashboard_id, widgets } = body;

    if (!connection_id || !dashboard_id || !widgets?.length) {
      return json({ error: "connection_id, dashboard_id, and widgets[] are required" }, 400);
    }

    // Get tenant
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: tenantData } = await serviceClient.rpc("get_user_tenant_id", { p_user_id: userId });
    const tenantId = tenantData as string;
    if (!tenantId) {
      return json({ error: "Tenant not found" }, 403);
    }

    // Fetch connection (RLS)
    const { data: conn, error: connErr } = await supabase
      .from("zabbix_connections")
      .select("id, url, username, password_ciphertext, password_iv, password_tag, is_active")
      .eq("id", connection_id)
      .single();

    if (connErr || !conn) return json({ error: "Connection not found" }, 404);
    if (!conn.is_active) return json({ error: "Connection disabled" }, 400);

    // Decrypt & login
    const password = await decryptPassword(
      conn.password_ciphertext, conn.password_iv, conn.password_tag, encryptionKey,
    );
    const zabbixAuth = await zabbixLogin(conn.url, conn.username, password);

    // Poll each widget in parallel
    const allTelemetry: TelemetryPayload[] = [];
    const errors: string[] = [];

    await Promise.all(
      widgets.map(async (w) => {
        try {
          const result = await zabbixCall(conn.url, zabbixAuth, w.query.method, w.query.params);
          const payloads = adaptResult(result, w);
          for (const p of payloads) {
            p.tenant_id = tenantId;
            p.dashboard_id = dashboard_id;
          }
          allTelemetry.push(...payloads);
        } catch (err) {
          errors.push(`widget ${w.widget_id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
    );

    // Send to Reactor
    let reactorResult = null;
    if (allTelemetry.length > 0) {
      const reactorUrl = `${supabaseUrl}/functions/v1/flowpulse-reactor`;
      const resp = await fetch(reactorUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify(allTelemetry),
      });
      reactorResult = await resp.json();
    }

    return json({
      polled_widgets: widgets.length,
      telemetry_sent: allTelemetry.length,
      reactor: reactorResult,
      ...(errors.length > 0 ? { errors } : {}),
    });
  } catch (err) {
    console.error("poller error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
