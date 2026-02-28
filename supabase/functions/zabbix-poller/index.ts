import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, cache-control, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

  const raw = await res.text();
  if (!raw) {
    throw new Error(`Zabbix ${method}: empty response (HTTP ${res.status})`);
  }

  let data: { error?: unknown; result?: unknown };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Zabbix ${method}: invalid JSON response`);
  }

  if (!res.ok) {
    throw new Error(`Zabbix ${method}: HTTP ${res.status}`);
  }
  if (data.error) throw new Error(`Zabbix ${method}: ${JSON.stringify(data.error)}`);
  return data.result;
}

/* ─── Time-range to seconds ──────────────────────── */
function parseTimeRange(range: string): number {
  const match = range.match(/^(\d+)(h|d)$/);
  if (!match) return 3600; // default 1h
  const num = parseInt(match[1]);
  return match[2] === "d" ? num * 86400 : num * 3600;
}

function extractTenantIdFromClaims(claims: Record<string, unknown>): string | null {
  const appMetadata = claims.app_metadata as Record<string, unknown> | undefined;
  const tenantFromAppMetadata = appMetadata?.tenant_id;
  if (typeof tenantFromAppMetadata === "string" && tenantFromAppMetadata.length > 0) {
    return tenantFromAppMetadata;
  }

  const tenantFromRootClaim = claims.tenant_id;
  if (typeof tenantFromRootClaim === "string" && tenantFromRootClaim.length > 0) {
    return tenantFromRootClaim;
  }

  return null;
}

function normalizeWidgetQuery(cfg: WidgetPollConfig): Record<string, unknown> {
  const params = cfg.query?.params ?? {};

  // Empty item.get on text widgets can return gigantic payloads or unstable responses.
  // Clamp to a safe single-row request.
  if (cfg.widget_type === "text" && cfg.query?.method === "item.get" && Object.keys(params).length === 0) {
    return {
      output: ["itemid", "name", "lastvalue", "units", "key_", "value_type"],
      sortfield: "itemid",
      sortorder: "DESC",
      limit: 1,
    };
  }

  return params;
}

/* ─── Types ──────────────────────────────────────── */
interface PollRequest {
  connection_id: string;
  dashboard_id: string;
  widgets: WidgetPollConfig[];
}

interface WidgetPollConfig {
  widget_id: string;
  widget_type: string;
  query: {
    source: string;
    method: string;
    params: Record<string, unknown>;
  };
  adapter: {
    type: string;
    value_field?: string;
    history_type?: number;
    telemetry_key?: string;
  };
  /** Time range for historical queries (e.g. "1h", "24h", "7d") */
  time_range?: string;
  /** Multiple telemetry keys for multi-series */
  telemetry_keys?: string[];
  /** Series config for multi-series charts */
  series?: Array<{ itemid: string; name: string; color: string }>;
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
    
    if (isStatusType) {
      return {
        tenant_id: "", dashboard_id: "", key,
        type: "stat",
        data: { value: rawStr, unit: item.units || "" },
        ts: Date.now(), v: 1,
      };
    }
    
    return {
      tenant_id: "", dashboard_id: "", key,
      type: cfg.widget_type === "gauge" ? "gauge" : "stat",
      data: {
        value: rawValue,
        unit: item.units || "",
        ...(cfg.widget_type === "gauge" ? { min: 0, max: 100 } : {}),
      },
      ts: Date.now(), v: 1,
    };
  });
}

function adaptHistoryToTimeseries(history: Array<Record<string, string>>, cfg: WidgetPollConfig, itemId?: string): TelemetryPayload[] {
  const key = itemId 
    ? `zbx:item:${itemId}` 
    : (cfg.adapter.telemetry_key || `zbx:widget:${cfg.widget_id}:ts`);
  const points = history.map((h) => ({
    ts: parseInt(h.clock) * 1000,
    value: parseFloat(h.value || "0"),
  }));
  points.sort((a, b) => a.ts - b.ts);
  return [{
    tenant_id: "", dashboard_id: "", key,
    type: "timeseries",
    data: { points, unit: "", label: "" },
    ts: Date.now(), v: 1,
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
    tenant_id: "", dashboard_id: "", key,
    type: "table", data: { columns, rows },
    ts: Date.now(), v: 1,
  }];
}

/** Resolve history type from item's value_type (Zabbix uses same int for both) */
function resolveHistoryType(items: Array<Record<string, string>>, itemId: string, fallback: number): number {
  const item = items.find((i) => i.itemid === itemId);
  if (item?.value_type !== undefined) return parseInt(item.value_type);
  return fallback;
}

async function adaptResultWithHistory(
  url: string, auth: string, result: unknown, cfg: WidgetPollConfig
): Promise<TelemetryPayload[]> {
  const items = Array.isArray(result) ? result : [];
  
  // For timeseries with time_range: fetch history.get for each item
  if (cfg.widget_type === "timeseries" && cfg.time_range) {
    const rangeSec = parseTimeRange(cfg.time_range);
    const timeFrom = Math.floor(Date.now() / 1000) - rangeSec;
    const itemIds = (cfg.series?.map(s => s.itemid) || (cfg.query.params as any)?.itemids || []) as string[];
    
    if (itemIds.length === 0) return adaptItemToStat(items, cfg);
    
    const allPayloads: TelemetryPayload[] = [];
    await Promise.all(itemIds.map(async (itemId) => {
      try {
        const histType = resolveHistoryType(items, itemId, cfg.adapter.history_type ?? 0);
        const histResult = await zabbixCall(url, auth, "history.get", {
          itemids: [itemId],
          history: histType,
          time_from: timeFrom,
          sortfield: "clock",
          sortorder: "ASC",
          limit: 1000,
          output: "extend",
        });
        const payloads = adaptHistoryToTimeseries(
          histResult as Array<Record<string, string>>,
          cfg,
          itemId
        );
        allPayloads.push(...payloads);
      } catch (err) {
        console.error(`history.get failed for item ${itemId} (histType auto):`, err);
      }
    }));
    return allPayloads;
  }

  // For timeseries without time_range but with multi-series
  if (cfg.widget_type === "timeseries" && cfg.series && cfg.series.length > 0) {
    const timeFrom = Math.floor(Date.now() / 1000) - 3600;
    const allPayloads: TelemetryPayload[] = [];
    await Promise.all(cfg.series.map(async (s) => {
      try {
        const histType = resolveHistoryType(items, s.itemid, cfg.adapter.history_type ?? 0);
        const histResult = await zabbixCall(url, auth, "history.get", {
          itemids: [s.itemid],
          history: histType,
          time_from: timeFrom,
          sortfield: "clock",
          sortorder: "ASC",
          limit: 1000,
          output: "extend",
        });
        allPayloads.push(...adaptHistoryToTimeseries(
          histResult as Array<Record<string, string>>,
          cfg,
          s.itemid
        ));
      } catch (err) {
        console.error(`history.get failed for series ${s.itemid}:`, err);
      }
    }));
    return allPayloads;
  }
  
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
  const tenantIdFromJwt = extractTenantIdFromClaims(claims.claims as Record<string, unknown>);

  try {
    const body: PollRequest = await req.json();
    const { connection_id, dashboard_id, widgets } = body;

    if (!connection_id || !dashboard_id || !widgets?.length) {
      return json({ error: "connection_id, dashboard_id, and widgets[] are required" }, 400);
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: tenantData } = await serviceClient.rpc("get_user_tenant_id", { p_user_id: userId });

    // Fallback chain for on-prem bootstrap edge-cases:
    // profile tenant -> JWT app_metadata tenant -> user_roles tenant
    let tenantId = (tenantData as string | null) ?? tenantIdFromJwt;
    if (!tenantId) {
      const { data: fallbackRole } = await serviceClient
        .from("user_roles")
        .select("tenant_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      tenantId = fallbackRole?.tenant_id ?? null;
    }

    const { data: isSuperAdmin } = await serviceClient.rpc("is_super_admin", { p_user_id: userId });

    if (!tenantId && !isSuperAdmin) {
      return json({ error: "Tenant not found" }, 403);
    }

    if (!isSuperAdmin && tenantId) {
      const { data: hasTenantRole } = await serviceClient.rpc("has_any_role", {
        p_user_id: userId,
        p_tenant_id: tenantId,
        p_roles: ["admin", "editor", "viewer", "tech", "sales"],
      });
      if (!hasTenantRole) {
        return json({ error: "User has no role in tenant" }, 403);
      }
    }

    let dashboardQuery = serviceClient
      .from("dashboards")
      .select("id, tenant_id")
      .eq("id", dashboard_id);

    if (!isSuperAdmin && tenantId) {
      dashboardQuery = dashboardQuery.eq("tenant_id", tenantId);
    }

    const { data: dashboard, error: dashboardErr } = await dashboardQuery.maybeSingle();

    if (dashboardErr || !dashboard) {
      return json({ error: "Dashboard not found or access denied" }, 403);
    }

    if (!tenantId) {
      tenantId = dashboard.tenant_id;
    }

    let connQuery = serviceClient
      .from("zabbix_connections")
      .select("id, tenant_id, url, username, password_ciphertext, password_iv, password_tag, is_active")
      .eq("id", connection_id);

    if (!isSuperAdmin && tenantId) {
      connQuery = connQuery.eq("tenant_id", tenantId);
    }

    const { data: conn, error: connErr } = await connQuery.maybeSingle();

    if (connErr || !conn) return json({ error: "Connection not found or access denied" }, 403);
    if (!isSuperAdmin && conn.tenant_id !== tenantId) return json({ error: "Connection tenant mismatch" }, 403);
    if (!conn.is_active) return json({ error: "Connection disabled" }, 400);

    if (!tenantId) {
      return json({ error: "Tenant resolution failed" }, 403);
    }

    const password = await decryptPassword(
      conn.password_ciphertext, conn.password_iv, conn.password_tag, encryptionKey,
    );
    const zabbixAuth = await zabbixLogin(conn.url, conn.username, password);

    const allTelemetry: TelemetryPayload[] = [];
    const errors: string[] = [];

    await Promise.all(
      widgets.map(async (w) => {
        try {
          const result = await zabbixCall(conn.url, zabbixAuth, w.query.method, normalizeWidgetQuery(w));
          const payloads = await adaptResultWithHistory(conn.url, zabbixAuth, result, w);
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
