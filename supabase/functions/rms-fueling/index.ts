import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PAGE_SIZE = 200;

/* ─── Crypto helpers ─── */

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  return bytes;
}

async function deriveAesKey(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  if (/^[0-9a-fA-F]{64}$/.test(secret)) {
    return crypto.subtle.importKey("raw", hexToBytes(secret), { name: "AES-GCM" }, false, usage);
  }
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, usage);
}

async function decryptToken(ct: string, iv: string, tag: string, key: string): Promise<string> {
  const cryptoKey = await deriveAesKey(key, ["decrypt"]);
  const combined = new Uint8Array(hexToBytes(ct).length + hexToBytes(tag).length);
  combined.set(hexToBytes(ct));
  combined.set(hexToBytes(tag), hexToBytes(ct).length);
  const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv: hexToBytes(iv), tagLength: 128 }, cryptoKey, combined);
  return new TextDecoder().decode(dec);
}

/* ─── Data types ─── */

interface RMSEntry {
  id: string;
  date: string;
  liters: number;
  odometer_reading?: number | null;
  hourmeter_reading?: number | null;
  driver?: { name?: string } | null;
  equipment?: { fleet_number?: string; name?: string } | null;
  [key: string]: unknown;
}

interface NormalizedEntry {
  id: string;
  date: string;
  liters: number;
  reading: number | null;
  reading_type: "odometer" | "hourmeter" | null;
  driver_name: string | null;
  fleet_number: string | null;
  equipment_name: string | null;
  price_per_liter: number | null;
  hourmeter: number | null;
}

function normalize(raw: RMSEntry): NormalizedEntry {
  const hasOdometer = raw.odometer_reading != null && raw.odometer_reading > 0;
  const hasHourmeter = raw.hourmeter_reading != null && raw.hourmeter_reading > 0;
  const price = (raw as Record<string, unknown>).price_per_liter ?? (raw as Record<string, unknown>).unit_price ?? (raw as Record<string, unknown>).preco_litro ?? null;
  return {
    id: raw.id,
    date: raw.date,
    liters: raw.liters ?? 0,
    reading: hasOdometer ? raw.odometer_reading! : hasHourmeter ? raw.hourmeter_reading! : null,
    reading_type: hasOdometer ? "odometer" : hasHourmeter ? "hourmeter" : null,
    driver_name: raw.driver?.name ?? null,
    fleet_number: raw.equipment?.fleet_number ?? null,
    equipment_name: raw.equipment?.name ?? null,
    price_per_liter: typeof price === "number" && price > 0 ? price : null,
    hourmeter: hasHourmeter ? raw.hourmeter_reading! : null,
  };
}

async function fetchAllPages(baseUrl: string, startDate: string, endDate: string, token: string): Promise<NormalizedEntry[]> {
  const all: NormalizedEntry[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = new URL(baseUrl);
    url.searchParams.set("startDate", startDate);
    url.searchParams.set("endDate", endDate);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(PAGE_SIZE));

    const res = await fetch(url.toString(), {
      headers: { "x-api-token": token, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`RMS API ${res.status}: ${text}`);
    }

    const json = await res.json();
    const items: RMSEntry[] = json.data ?? json.items ?? json ?? [];
    const total: number = json.total ?? json.totalCount ?? items.length;

    for (const item of items) all.push(normalize(item));

    hasMore = all.length < total && items.length === PAGE_SIZE;
    page++;
    if (page > 50) break;
  }

  return all;
}

/* ─── Main ─── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const url = new URL(req.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const connectionId = url.searchParams.get("connection_id");

    if (!startDate || !endDate) {
      return new Response(JSON.stringify({ error: "startDate and endDate are required (YYYY-MM-DD)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Resolve credentials: from DB connection or fallback to env
    let apiUrl: string;
    let apiToken: string;

    if (connectionId) {
      // Verify tenant access via user's client
      const { data: connCheck } = await supabase.from("rms_connections").select("id").eq("id", connectionId).eq("is_active", true).single();
      if (!connCheck) {
        return new Response(JSON.stringify({ error: "RMS connection not found or inactive" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Fetch encrypted token via service role
      const serviceRole = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
      const { data: conn } = await serviceRole.from("rms_connections").select("url, token_ciphertext, token_iv, token_tag").eq("id", connectionId).single();
      if (!conn) {
        return new Response(JSON.stringify({ error: "Connection not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const encryptionKey = Deno.env.get("ZABBIX_ENCRYPTION_KEY");
      if (!encryptionKey) {
        return new Response(JSON.stringify({ error: "Encryption key not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      apiUrl = conn.url;
      apiToken = await decryptToken(conn.token_ciphertext, conn.token_iv, conn.token_tag, encryptionKey);
    } else {
      // Fallback: use first active RMS connection for the user's tenant
      const { data: conns } = await supabase.from("rms_connections").select("id").eq("is_active", true).limit(1);
      if (conns && conns.length > 0) {
        const serviceRole = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
        const { data: conn } = await serviceRole.from("rms_connections").select("url, token_ciphertext, token_iv, token_tag").eq("id", conns[0].id).single();
        const encryptionKey = Deno.env.get("ZABBIX_ENCRYPTION_KEY");
        if (conn && encryptionKey) {
          apiUrl = conn.url;
          apiToken = await decryptToken(conn.token_ciphertext, conn.token_iv, conn.token_tag, encryptionKey);
        } else {
          // Final fallback: env var
          apiToken = Deno.env.get("RMS_FUELING_API_TOKEN") ?? "";
          apiUrl = "https://supabase.rmsgroup.app/functions/v1/fueling-entries-api";
        }
      } else {
        apiToken = Deno.env.get("RMS_FUELING_API_TOKEN") ?? "";
        apiUrl = "https://supabase.rmsgroup.app/functions/v1/fueling-entries-api";
      }
    }

    if (!apiToken) {
      return new Response(JSON.stringify({ error: "No RMS API token configured. Add a connection or set RMS_FUELING_API_TOKEN." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const entries = await fetchAllPages(apiUrl, startDate, endDate, apiToken);

    return new Response(JSON.stringify({ entries, count: entries.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("401") ? 401 : message.includes("404") ? 404 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
