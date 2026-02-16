import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ─── config ──────────────────────────────────────── */
const DEDUPE_TTL_S = 5;
const LAST_VALUE_TTL_S = 60;       // replay window
const MAX_BATCH = 200;
const CONTRACT_VERSION = 1;

/* ─── Upstash Redis REST helper ───────────────────── */
class UpstashRedis {
  private url: string;
  private token: string;

  constructor(url: string, token: string) {
    this.url = url.endsWith("/") ? url.slice(0, -1) : url;
    this.token = token;
  }

  async pipeline(commands: string[][]): Promise<Array<{ result: unknown }>> {
    const resp = await fetch(`${this.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    });
    return resp.json();
  }

  async setNX(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const results = await this.pipeline([
      ["SET", key, value, "NX", "EX", String(ttlSeconds)],
    ]);
    return results?.[0]?.result === "OK";
  }

  async setEx(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.pipeline([["SET", key, value, "EX", String(ttlSeconds)]]);
  }

  /** Store last value + monotonic ts per key. Returns normalized ts. */
  async setLastValueAndGetTs(
    lastValueKey: string,
    lastTsKey: string,
    value: string,
    incomingTs: number,
    ttl: number,
  ): Promise<number> {
    // GET last ts, then SET both atomically via pipeline
    const results = await this.pipeline([
      ["GET", lastTsKey],
      ["SET", lastValueKey, value, "EX", String(ttl)],
      ["SET", lastTsKey, String(incomingTs), "EX", String(ttl)],
    ]);
    const lastTs = Number(results?.[0]?.result) || 0;
    // Monotonic: ensure ts is always increasing per key
    const normalizedTs = Math.max(incomingTs, lastTs + 1);
    // If we had to bump, update the stored ts
    if (normalizedTs !== incomingTs) {
      await this.pipeline([["SET", lastTsKey, String(normalizedTs), "EX", String(ttl)]]);
    }
    return normalizedTs;
  }

  async mget(keys: string[]): Promise<Array<string | null>> {
    if (keys.length === 0) return [];
    const results = await this.pipeline([["MGET", ...keys]]);
    return (results?.[0]?.result as Array<string | null>) ?? [];
  }
}

/* ─── types ───────────────────────────────────────── */
interface TelemetryPayload {
  tenant_id: string;
  dashboard_id: string;
  key: string;
  type: string;
  data: Record<string, unknown>;
  ts?: number;
  v?: number;
  meta?: Record<string, unknown>;
}

interface Metrics {
  received_total: number;
  deduped_total: number;
  coalesced_total: number;
  broadcast_total: number;
  broadcast_latency_ms: number[];
  validation_errors: number;
}

/* ─── validation ──────────────────────────────────── */
function validatePayload(evt: TelemetryPayload, index: number): string | null {
  if (!evt.key) return `event[${index}]: missing required field 'key'`;
  if (!evt.dashboard_id) return `event[${index}]: missing required field 'dashboard_id'`;
  if (!evt.tenant_id) return `event[${index}]: missing required field 'tenant_id'`;
  if (!evt.data || typeof evt.data !== "object") return `event[${index}]: missing or invalid 'data'`;
  if (!evt.type) return `event[${index}]: missing required field 'type'`;
  return null;
}

/* ─── main ────────────────────────────────────────── */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
  const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }
  if (!redisUrl || !redisToken) {
    return jsonResponse({ error: "Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN" }, 500);
  }

  const redis = new UpstashRedis(redisUrl, redisToken);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const url = new URL(req.url);

  // ── REPLAY endpoint: GET /flowpulse-reactor?replay=1&dashboard_id=xxx&keys=k1,k2
  if (req.method === "GET" && url.searchParams.get("replay") === "1") {
    return handleReplay(redis, url);
  }

  // ── INGEST endpoint: POST
  try {
    const body = await req.json();
    const events: TelemetryPayload[] = Array.isArray(body) ? body : [body];

    if (events.length > MAX_BATCH) {
      return jsonResponse({ error: `batch too large: ${events.length} > ${MAX_BATCH}` }, 400);
    }

    const metrics: Metrics = {
      received_total: events.length,
      deduped_total: 0,
      coalesced_total: 0,
      broadcast_total: 0,
      broadcast_latency_ms: [],
      validation_errors: 0,
    };

    // 1. VALIDATE: strict contract enforcement
    const validEvents: TelemetryPayload[] = [];
    const errors: string[] = [];

    for (let i = 0; i < events.length; i++) {
      const err = validatePayload(events[i], i);
      if (err) {
        errors.push(err);
        metrics.validation_errors++;
        continue;
      }
      // Server sets ts if missing; enforce version
      const evt = { ...events[i] };
      if (!evt.ts) evt.ts = Date.now();
      if (!evt.v) evt.v = CONTRACT_VERSION;
      validEvents.push(evt);
    }

    if (validEvents.length === 0) {
      return jsonResponse({ error: "all events failed validation", details: errors }, 400);
    }

    // 2. DEDUPE + MONOTONIC TS + LAST-VALUE store (pipelined)
    const fresh: TelemetryPayload[] = [];

    await Promise.all(
      validEvents.map(async (evt) => {
        const dedupeKey = `reactor:dd:${evt.dashboard_id}:${evt.key}`;
        const isNew = await redis.setNX(dedupeKey, String(evt.ts), DEDUPE_TTL_S);
        if (!isNew) {
          metrics.deduped_total++;
          return;
        }

        // Monotonic ts + store last value for replay
        const lastValueKey = `reactor:lv:${evt.dashboard_id}:${evt.key}`;
        const lastTsKey = `reactor:ts:${evt.dashboard_id}:${evt.key}`;
        const normalizedTs = await redis.setLastValueAndGetTs(
          lastValueKey,
          lastTsKey,
          JSON.stringify({ key: evt.key, type: evt.type, data: evt.data, ts: evt.ts, v: evt.v }),
          evt.ts!,
          LAST_VALUE_TTL_S,
        );

        evt.ts = normalizedTs;
        fresh.push(evt);
      }),
    );

    if (fresh.length === 0) {
      return jsonResponse({
        ...metricsToResponse(metrics),
        ...(errors.length > 0 ? { validation_errors: errors } : {}),
      });
    }

    // 3. COALESCE: group by dashboard, keep latest per key
    const byDashboard = new Map<string, Map<string, TelemetryPayload>>();

    for (const evt of fresh) {
      let dashMap = byDashboard.get(evt.dashboard_id);
      if (!dashMap) {
        dashMap = new Map();
        byDashboard.set(evt.dashboard_id, dashMap);
      }
      const existing = dashMap.get(evt.key);
      if (!existing || evt.ts! > existing.ts!) {
        dashMap.set(evt.key, evt);
      } else {
        metrics.coalesced_total++;
      }
    }

    // 4. BROADCAST per dashboard channel
    const broadcastStart = Date.now();

    for (const [dashboardId, keyMap] of byDashboard) {
      const channelName = `dashboard:${dashboardId}`;
      const channel = supabase.channel(channelName);

      for (const [, evt] of keyMap) {
        await channel.send({
          type: "broadcast",
          event: "DATA_UPDATE",
          payload: {
            key: evt.key,
            type: evt.type,
            data: evt.data,
            ts: evt.ts,
            v: evt.v,
          },
        });
        metrics.broadcast_total++;
        metrics.broadcast_latency_ms.push(Date.now() - evt.ts!);
      }

      await supabase.removeChannel(channel);
    }

    const avgLatency =
      metrics.broadcast_latency_ms.length > 0
        ? Math.round(
            metrics.broadcast_latency_ms.reduce((a, b) => a + b, 0) /
              metrics.broadcast_latency_ms.length,
          )
        : 0;

    return jsonResponse({
      ...metricsToResponse(metrics),
      avg_broadcast_latency_ms: avgLatency,
      processing_time_ms: Date.now() - broadcastStart,
      ...(errors.length > 0 ? { validation_errors: errors } : {}),
    });
  } catch (err) {
    console.error("reactor error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

/* ─── replay handler ──────────────────────────────── */
async function handleReplay(redis: UpstashRedis, url: URL) {
  const dashboardId = url.searchParams.get("dashboard_id");
  const keysParam = url.searchParams.get("keys");

  if (!dashboardId) {
    return jsonResponse({ error: "missing dashboard_id" }, 400);
  }
  if (!keysParam) {
    return jsonResponse({ error: "missing keys param (comma-separated)" }, 400);
  }

  const keys = keysParam.split(",").map((k) => k.trim()).filter(Boolean);
  if (keys.length === 0) {
    return jsonResponse({ error: "empty keys list" }, 400);
  }
  if (keys.length > 100) {
    return jsonResponse({ error: "too many keys (max 100)" }, 400);
  }

  const redisKeys = keys.map((k) => `reactor:lv:${dashboardId}:${k}`);
  const values = await redis.mget(redisKeys);

  const result: Record<string, unknown> = {};
  for (let i = 0; i < keys.length; i++) {
    if (values[i]) {
      try {
        result[keys[i]] = JSON.parse(values[i]!);
      } catch {
        // skip malformed
      }
    }
  }

  return jsonResponse({
    dashboard_id: dashboardId,
    keys_requested: keys.length,
    keys_found: Object.keys(result).length,
    data: result,
  });
}

/* ─── helpers ─────────────────────────────────────── */
function metricsToResponse(m: Metrics) {
  return {
    received: m.received_total,
    deduped: m.deduped_total,
    coalesced: m.coalesced_total,
    broadcast: m.broadcast_total,
    validation_rejected: m.validation_errors,
  };
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
