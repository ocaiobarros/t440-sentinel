import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ─── ASN WHOIS enrichment cache (in-memory per invocation, backed by Redis) ── */
interface AsnInfo {
  name: string;
  description: string;
  country: string;
  type: "transit" | "ix" | "cdn" | "enterprise" | "unknown";
}

/* Well-known ASN classification */
const KNOWN_ASNS: Record<number, Partial<AsnInfo>> = {
  // CDNs
  15169: { name: "Google", country: "US", type: "cdn" },
  13335: { name: "Cloudflare", country: "US", type: "cdn" },
  16509: { name: "Amazon/AWS", country: "US", type: "cdn" },
  2906:  { name: "Netflix", country: "US", type: "cdn" },
  32934: { name: "Meta/Facebook", country: "US", type: "cdn" },
  20940: { name: "Akamai", country: "US", type: "cdn" },
  8075:  { name: "Microsoft", country: "US", type: "cdn" },
  36459: { name: "GitHub", country: "US", type: "cdn" },
  54113: { name: "Fastly", country: "US", type: "cdn" },
  46489: { name: "Twitch", country: "US", type: "cdn" },
  36040: { name: "Apple", country: "US", type: "cdn" },
  714:   { name: "Apple", country: "US", type: "cdn" },
  // IX-BR
  26162: { name: "IX.br/PTT-SP", country: "BR", type: "ix" },
  22548: { name: "IX.br/PTT-RJ", country: "BR", type: "ix" },
  20121: { name: "IX.br/PTT-CE", country: "BR", type: "ix" },
  // Major Brazilian Transit
  4230:  { name: "Embratel", country: "BR", type: "transit" },
  16735: { name: "Algar Telecom", country: "BR", type: "transit" },
  7738:  { name: "Oi/Telemar", country: "BR", type: "transit" },
  26599: { name: "Vivo/Telefônica", country: "BR", type: "transit" },
  28573: { name: "Claro/NET", country: "BR", type: "transit" },
  53013: { name: "Brisanet", country: "BR", type: "transit" },
  52873: { name: "Americanet", country: "BR", type: "transit" },
  // Global Transit
  3356:  { name: "Lumen/Level3", country: "US", type: "transit" },
  1299:  { name: "Arelion/Telia", country: "SE", type: "transit" },
  6939:  { name: "Hurricane Electric", country: "US", type: "transit" },
  174:   { name: "Cogent", country: "US", type: "transit" },
  6762:  { name: "Sparkle/TIM Intl", country: "IT", type: "transit" },
  3549:  { name: "GLBX/Lumen", country: "US", type: "transit" },
};

async function enrichAsn(asn: number): Promise<AsnInfo> {
  // Check known ASNs first
  const known = KNOWN_ASNS[asn];
  if (known?.name) {
    return {
      name: known.name,
      description: known.name,
      country: known.country || "??",
      type: known.type || "unknown",
    };
  }

  // Fallback: query bgpview.io (free, no auth)
  try {
    const resp = await fetch(`https://api.bgpview.io/asn/${asn}`, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/json" },
    });
    if (resp.ok) {
      const json = await resp.json();
      const d = json?.data;
      if (d) {
        const country = d.rir_allocation?.country_code || d.country_code || "??";
        const name = d.name || `AS${asn}`;
        const desc = d.description_short || d.description_full || name;

        // Classify by name heuristics
        let type: AsnInfo["type"] = "enterprise";
        const lower = (name + " " + desc).toLowerCase();
        if (lower.includes("ix") || lower.includes("ptt") || lower.includes("exchange")) type = "ix";
        else if (lower.includes("cdn") || lower.includes("cache") || lower.includes("content")) type = "cdn";
        else if (lower.includes("telecom") || lower.includes("transit") || lower.includes("backbone") || lower.includes("carrier")) type = "transit";

        return { name, description: desc, country, type };
      }
    }
  } catch {
    // Ignore timeout/errors
  }

  return { name: `AS${asn}`, description: `Autonomous System ${asn}`, country: "??", type: "unknown" };
}

/* ─── Types ── */
interface BgpPeer {
  asn: number;
  ip: string;
  state: string;
  prefixes_received?: number;
  prefixes_sent?: number;
  uptime?: string;
  bw_in_mbps?: number;
  bw_out_mbps?: number;
}

interface BgpPayload {
  config_id: string;            // unique id for this connection
  host: string;
  vendor: "huawei" | "datacom";
  model?: string;
  peers: BgpPeer[];
  routing_stats?: {
    total_prefixes?: number;
    active_routes?: number;
  };
  flow_data?: Array<{
    source_asn: number;
    target_asn: number;
    bw_mbps: number;
  }>;
  network_summary?: {
    subnets?: Array<{ name: string; in_bytes?: number; out_bytes?: number; total_bytes: number }>;
    applications?: Array<{ name: string; total_bytes: number }>;
    mapped_objects?: Array<{ name: string; in_bytes?: number; out_bytes?: number; total_bytes: number }>;
    protocols?: Array<{ name: string; total_bytes: number }>;
    tos?: Array<{ name: string; total_bytes: number }>;
    autonomous_systems?: Array<{ name: string; in_bytes?: number; out_bytes?: number; total_bytes: number }>;
    subnet_groups?: Array<{ name: string; in_bytes?: number; out_bytes?: number; total_bytes: number }>;
    interface_groups?: Array<{ name: string; in_bytes?: number; out_bytes?: number; total_bytes: number }>;
    as_groups?: Array<{ name: string; in_bytes?: number; out_bytes?: number; total_bytes: number }>;
    tos_groups?: Array<{ name: string; total_bytes: number }>;
    devices?: Array<{ name: string; total_bytes: number }>;
  };
}

/* ─── Main ── */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const url = new URL(req.url);

  // ── GET: Return current state for a config
  if (req.method === "GET") {
    const configId = url.searchParams.get("config_id");
    if (!configId) return json({ error: "missing config_id" }, 400);

    // Try Redis for cached state
    const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
    const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
    if (redisUrl && redisToken) {
      try {
        const resp = await fetch(`${redisUrl.replace(/\/$/, "")}/get/bgp:state:${configId}`, {
          headers: { Authorization: `Bearer ${redisToken}` },
          signal: AbortSignal.timeout(3000),
        });
        const result = await resp.json();
        if (result?.result) {
          return json(JSON.parse(result.result));
        }
      } catch { /* fallthrough */ }
    }

    return json({ config_id: configId, peers: [], stats: null, enriched: {}, flow_data: [] });
  }

  // ── POST: Ingest BGP data
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  try {
    const body: BgpPayload = await req.json();

    if (!body.config_id || !body.host || !body.peers || !Array.isArray(body.peers)) {
      return json({ error: "missing required fields: config_id, host, peers[]" }, 400);
    }

    if (body.peers.length > 500) {
      return json({ error: "too many peers (max 500)" }, 400);
    }

    // 1. ENRICH all unique ASNs
    const uniqueAsns = [...new Set(body.peers.map(p => p.asn).filter(Boolean))];
    const flowAsns = body.flow_data
      ? [...new Set(body.flow_data.flatMap(f => [f.source_asn, f.target_asn]))]
      : [];
    const allAsns = [...new Set([...uniqueAsns, ...flowAsns])];

    const enriched: Record<number, AsnInfo> = {};
    await Promise.all(
      allAsns.map(async (asn) => {
        enriched[asn] = await enrichAsn(asn);
      })
    );

    // 2. Compute summary stats
    const established = body.peers.filter(p =>
      p.state?.toLowerCase() === "established" || p.state?.toLowerCase() === "active"
    );
    const totalPrefixesRx = body.peers.reduce((s, p) => s + (p.prefixes_received || 0), 0);
    const totalPrefixesTx = body.peers.reduce((s, p) => s + (p.prefixes_sent || 0), 0);

    const stats = {
      total_peers: body.peers.length,
      established_peers: established.length,
      prefixes_received: totalPrefixesRx,
      prefixes_sent: totalPrefixesTx,
      active_asns: uniqueAsns.length,
      total_routes: body.routing_stats?.total_prefixes || totalPrefixesRx,
      active_routes: body.routing_stats?.active_routes || totalPrefixesRx,
    };

    // 3. Classify flow data
    const classifiedFlows = (body.flow_data || []).map(f => ({
      ...f,
      source_info: enriched[f.source_asn] || null,
      target_info: enriched[f.target_asn] || null,
      traffic_type: enriched[f.target_asn]?.type || enriched[f.source_asn]?.type || "unknown",
    }));

    // 4. Build state object
    const state = {
      config_id: body.config_id,
      host: body.host,
      vendor: body.vendor,
      model: body.model,
      timestamp: Date.now(),
      stats,
      peers: body.peers.map(p => ({
        ...p,
        info: enriched[p.asn] || null,
      })),
      enriched,
      flow_data: classifiedFlows,
      network_summary: body.network_summary || null,
    };

    // 5. Cache in Redis
    const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
    const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
    if (redisUrl && redisToken) {
      try {
        await fetch(`${redisUrl.replace(/\/$/, "")}/pipeline`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${redisToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([
            ["SET", `bgp:state:${body.config_id}`, JSON.stringify(state), "EX", "120"],
          ]),
        });
      } catch (e) {
        console.error("Redis cache error:", e);
      }
    }

    // 6. Broadcast via Supabase Realtime
    const channelName = `bgp:${body.config_id}`;
    const channel = supabase.channel(channelName);
    await channel.send({
      type: "broadcast",
      event: "BGP_UPDATE",
      payload: state,
    });
    await supabase.removeChannel(channel);

    return json({
      status: "ok",
      stats,
      asns_enriched: Object.keys(enriched).length,
      flows_classified: classifiedFlows.length,
      timestamp: state.timestamp,
    });

  } catch (err) {
    console.error("bgp-collector error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
