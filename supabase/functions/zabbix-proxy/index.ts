import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ─── Types ──────────────────────────────────────── */

interface ZabbixProxyRequest {
  connection_id: string;
  method: string;
  params?: Record<string, unknown>;
}

interface ZabbixConnection {
  id: string;
  tenant_id: string;
  url: string;
  username: string;
  password_ciphertext: string;
  password_iv: string;
  password_tag: string;
  encryption_version: number;
  is_active: boolean;
}

/* ─── AES-GCM Decryption ────────────────────────── */

async function decryptPassword(
  ciphertext: string,
  iv: string,
  tag: string,
  encryptionKey: string,
): Promise<string> {
  // Derive valid 256-bit key from any input
  let cryptoKey: CryptoKey;
  if (/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
    cryptoKey = await crypto.subtle.importKey("raw", hexToBytes(encryptionKey), { name: "AES-GCM" }, false, ["decrypt"]);
  } else {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(encryptionKey));
    cryptoKey = await crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["decrypt"]);
  }

  const ivBytes = hexToBytes(iv);
  const ciphertextBytes = hexToBytes(ciphertext);
  const tagBytes = hexToBytes(tag);

  // AES-GCM: ciphertext + tag concatenated
  const combined = new Uint8Array(ciphertextBytes.length + tagBytes.length);
  combined.set(ciphertextBytes);
  combined.set(tagBytes, ciphertextBytes.length);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes, tagLength: 128 },
    cryptoKey,
    combined,
  );

  return new TextDecoder().decode(decrypted);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/* ─── Zabbix JSON-RPC ────────────────────────────── */

/** Build the JSON-RPC endpoint, avoiding double /api_jsonrpc.php */
function buildApiUrl(base: string): string {
  const trimmed = base.replace(/\/+$/, "");
  if (trimmed.endsWith("/api_jsonrpc.php")) return trimmed;
  return `${trimmed}/api_jsonrpc.php`;
}

async function zabbixLogin(
  url: string,
  username: string,
  password: string,
): Promise<string> {
  const endpoint = buildApiUrl(url);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Connection": "keep-alive" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "user.login",
      params: { username, password },
      id: 1,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`Zabbix login failed: ${JSON.stringify(data.error)}`);
  }
  return data.result;
}

async function zabbixCall(
  url: string,
  authToken: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  // Whitelist allowed methods
  const allowed = [
    "host.get",
    "hostgroup.get",
    "item.get",
    "history.get",
    "trigger.get",
    "problem.get",
    "event.get",
    "template.get",
    "application.get",
    "graph.get",
    "trend.get",
    "dashboard.get",
  ];

  if (!allowed.includes(method)) {
    throw new Error(`Method "${method}" is not allowed. Allowed: ${allowed.join(", ")}`);
  }

  const endpoint = buildApiUrl(url);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Connection": "keep-alive" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
      auth: authToken,
      id: 2,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Zabbix HTTP ${res.status}: ${txt.slice(0, 500)}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(`Zabbix API error (${method}): ${JSON.stringify(data.error)}`);
  }
  return data.result;
}

/* ─── Auth token cache (per-isolate, short-lived) ── */

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getZabbixToken(
  url: string,
  username: string,
  password: string,
  connectionId: string,
): Promise<string> {
  const cached = tokenCache.get(connectionId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const token = await zabbixLogin(url, username, password);
  // Cache for 10 minutes (Zabbix sessions typically last 30min)
  tokenCache.set(connectionId, {
    token,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  return token;
}

/* ─── Main Handler ───────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const encryptionKey = Deno.env.get("ZABBIX_ENCRYPTION_KEY");

  if (!encryptionKey) {
    return new Response(
      JSON.stringify({ error: "ZABBIX_ENCRYPTION_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Authenticate the caller
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claims?.claims) {
    return new Response(
      JSON.stringify({ error: "Invalid token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const body: ZabbixProxyRequest = await req.json();
    const { connection_id, method, params } = body;

    if (!connection_id || !method) {
      return new Response(
        JSON.stringify({ error: "connection_id and method are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch connection (RLS ensures tenant isolation)
    const { data: conn, error: connErr } = await supabase
      .from("zabbix_connections")
      .select("id, tenant_id, url, username, password_ciphertext, password_iv, password_tag, encryption_version, is_active")
      .eq("id", connection_id)
      .single();

    if (connErr || !conn) {
      return new Response(
        JSON.stringify({ error: "Connection not found or access denied" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!conn.is_active) {
      return new Response(
        JSON.stringify({ error: "Connection is disabled" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const connection = conn as ZabbixConnection;

    // Decrypt password
    const password = await decryptPassword(
      connection.password_ciphertext,
      connection.password_iv,
      connection.password_tag,
      encryptionKey,
    );

    // Get or cache Zabbix auth token
    const zabbixAuthToken = await getZabbixToken(
      connection.url,
      connection.username,
      password,
      connection.id,
    );

    // Execute the Zabbix API call
    const result = await zabbixCall(
      connection.url,
      zabbixAuthToken,
      method,
      params ?? {},
    );

    return new Response(
      JSON.stringify({ result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("zabbix-proxy error:", err);
    const message = err instanceof Error ? err.message : String(err);

    // If auth failed, clear cache to retry next time
    if (message.includes("login failed")) {
      tokenCache.clear();
    }

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
