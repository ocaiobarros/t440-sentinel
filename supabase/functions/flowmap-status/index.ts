import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, cache-control, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-cache, no-store" },
  });
}

/* ─── AES-GCM helpers ─── */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  return bytes;
}

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  if (/^[0-9a-fA-F]{64}$/.test(secret))
    return crypto.subtle.importKey("raw", hexToBytes(secret), { name: "AES-GCM" }, false, ["decrypt"]);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["decrypt"]);
}

async function decryptPassword(ct: string, iv: string, tag: string, key: string): Promise<string> {
  const cryptoKey = await deriveAesKey(key);
  const combined = new Uint8Array(hexToBytes(ct).length + hexToBytes(tag).length);
  combined.set(hexToBytes(ct));
  combined.set(hexToBytes(tag), hexToBytes(ct).length);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: hexToBytes(iv), tagLength: 128 }, cryptoKey, combined);
  return new TextDecoder().decode(decrypted);
}

/* ─── Zabbix JSON-RPC ─── */
function buildApiUrl(base: string): string {
  const trimmed = base.replace(/\/+$/, "");
  return trimmed.endsWith("/api_jsonrpc.php") ? trimmed : `${trimmed}/api_jsonrpc.php`;
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function zabbixLogin(url: string, username: string, password: string): Promise<string> {
  const res = await fetch(buildApiUrl(url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "user.login", params: { username, password }, id: 1 }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Zabbix login failed: ${JSON.stringify(data.error)}`);
  return data.result;
}

async function getToken(url: string, username: string, password: string, connId: string): Promise<string> {
  const cached = tokenCache.get(connId);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const token = await zabbixLogin(url, username, password);
  tokenCache.set(connId, { token, expiresAt: Date.now() + 10 * 60_000 });
  return token;
}

async function zabbixCall(url: string, auth: string, method: string, params: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(buildApiUrl(url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, auth, id: 2 }),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Zabbix ${method}: ${JSON.stringify(data.error)}`);
  return data.result;
}

/* ─── In-memory status cache (per map+tenant, 10s TTL) ─── */
interface CachedResult { data: unknown; expiresAt: number }
const statusCache = new Map<string, CachedResult>();
const CACHE_TTL_MS = 10_000;

/* ─── Host status type ─── */
interface HostStatusResult {
  status: "UP" | "DOWN" | "UNKNOWN";
  latency?: number;
  lastCheck?: string;
  availability24h?: number;
  triggerProblem?: boolean;
}

/* ─── Ring break detection (BFS) ─── */
interface LinkRow {
  id: string;
  origin_host_id: string;
  dest_host_id: string;
  is_ring: boolean;
  capacity_mbps: number;
  status_strategy: string;
  current_status: string;
}

function detectRingBreaks(
  links: LinkRow[],
  hostStatusById: Record<string, HostStatusResult>,
): { impactedLinkIds: string[]; isolatedNodeIds: string[] } {
  const ringLinks = links.filter((l) => l.is_ring);
  if (ringLinks.length === 0) return { impactedLinkIds: [], isolatedNodeIds: [] };

  const allHosts = new Set<string>();
  ringLinks.forEach((l) => { allHosts.add(l.origin_host_id); allHosts.add(l.dest_host_id); });

  const adj = new Map<string, Set<string>>();
  for (const hid of allHosts) adj.set(hid, new Set());

  const activeLinks = ringLinks.filter((l) => {
    const a = hostStatusById[l.origin_host_id]?.status ?? "UNKNOWN";
    const b = hostStatusById[l.dest_host_id]?.status ?? "UNKNOWN";
    return a === "UP" && b === "UP";
  });

  for (const l of activeLinks) {
    adj.get(l.origin_host_id)!.add(l.dest_host_id);
    adj.get(l.dest_host_id)!.add(l.origin_host_id);
  }

  const upHosts = [...allHosts].filter((h) => (hostStatusById[h]?.status ?? "UNKNOWN") === "UP");
  if (upHosts.length === 0) {
    return { impactedLinkIds: ringLinks.map((l) => l.id), isolatedNodeIds: [...allHosts] };
  }

  const visited = new Set<string>();
  const queue = [upHosts[0]];
  visited.add(upHosts[0]);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nb of adj.get(cur) ?? []) {
      if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
    }
  }

  const isolated = upHosts.filter((h) => !visited.has(h));
  if (isolated.length === 0) return { impactedLinkIds: [], isolatedNodeIds: [] };

  const impacted: string[] = [];
  for (const l of ringLinks) {
    if (isolated.includes(l.origin_host_id) || isolated.includes(l.dest_host_id)) impacted.push(l.id);
  }

  return { impactedLinkIds: impacted, isolatedNodeIds: isolated };
}

/* ─── Status resolution: Trigger > ICMP > Interface ─── */
function resolveStatus(
  zbxHost: Record<string, unknown>,
  hasTriggerProblem: boolean,
  icmpItem: { lastvalue: string; lastclock: string } | undefined,
): HostStatusResult {
  if (hasTriggerProblem) {
    const lat = icmpItem ? parseFloat(icmpItem.lastvalue || "0") * 1000 : undefined;
    return {
      status: "DOWN",
      triggerProblem: true,
      latency: lat != null ? Math.round(lat * 100) / 100 : undefined,
      lastCheck: icmpItem?.lastclock ? new Date(parseInt(icmpItem.lastclock) * 1000).toISOString() : new Date().toISOString(),
    };
  }

  let interfaceAvailable = 0;
  const interfaces = zbxHost.interfaces as Array<Record<string, string>> | undefined;
  if (interfaces && interfaces.length > 0) {
    interfaceAvailable = interfaces.some((iface) => String(iface.available) === "1") ? 1 : 2;
  } else {
    interfaceAvailable = zbxHost.available ? Number(zbxHost.available) : 0;
  }

  const status: "UP" | "DOWN" | "UNKNOWN" = interfaceAvailable === 1 ? "UP" : interfaceAvailable === 2 ? "DOWN" : "UNKNOWN";

  const lat = icmpItem ? parseFloat(icmpItem.lastvalue || "0") * 1000 : undefined;
  return {
    status,
    latency: lat != null ? Math.round(lat * 100) / 100 : undefined,
    lastCheck: icmpItem?.lastclock ? new Date(parseInt(icmpItem.lastclock) * 1000).toISOString() : new Date().toISOString(),
  };
}

/* ─── Link status derivation ─── */
function deriveLinkStatus(
  originStatus: "UP" | "DOWN" | "UNKNOWN",
  destStatus: "UP" | "DOWN" | "UNKNOWN",
): "UP" | "DOWN" | "DEGRADED" {
  if (originStatus === "UP" && destStatus === "UP") return "UP";
  if (originStatus === "DOWN" && destStatus === "DOWN") return "DOWN";
  if (originStatus === "DOWN" || destStatus === "DOWN") return "DEGRADED";
  return "UP";
}

/* ─── SLA Transition Engine ─── */
interface OpenEvent { id: string; status: string }

async function processLinkTransitions(
  serviceClient: ReturnType<typeof createClient>,
  links: LinkRow[],
  hostStatusById: Record<string, HostStatusResult>,
  tenantId: string,
  linkStatusMap: Record<string, string>,
): Promise<void> {
  if (links.length === 0) return;

  const linkIds = links.map((l) => l.id);
  const { data: openEvents } = await serviceClient
    .from("flow_map_link_events")
    .select("id, link_id, status")
    .eq("tenant_id", tenantId)
    .in("link_id", linkIds)
    .is("ended_at", null);

  const openEventByLink = new Map<string, OpenEvent>();
  if (openEvents) {
    for (const ev of openEvents) {
      openEventByLink.set(ev.link_id, { id: ev.id, status: ev.status });
    }
  }

  const now = new Date().toISOString();
  const toInsert: Array<{ link_id: string; tenant_id: string; status: string; started_at: string }> = [];
  const toClose: string[] = [];
  const statusUpdates: Array<{ id: string; current_status: string; last_status_change: string }> = [];

  for (const link of links) {
    const newStatus = linkStatusMap[link.id] ?? "UP";
    const openEvent = openEventByLink.get(link.id);

    if (!openEvent && newStatus !== "UP") {
      toInsert.push({ link_id: link.id, tenant_id: tenantId, status: newStatus, started_at: now });
    } else if (openEvent && openEvent.status !== newStatus) {
      toClose.push(openEvent.id);
      if (newStatus !== "UP") {
        toInsert.push({ link_id: link.id, tenant_id: tenantId, status: newStatus, started_at: now });
      }
    }

    // Update current_status on the link itself
    if (link.current_status !== newStatus) {
      statusUpdates.push({ id: link.id, current_status: newStatus, last_status_change: now });
    }
  }

  const ops: Promise<unknown>[] = [];

  if (toClose.length > 0) {
    ops.push(serviceClient.from("flow_map_link_events").update({ ended_at: now }).in("id", toClose));
  }
  if (toInsert.length > 0) {
    ops.push(serviceClient.from("flow_map_link_events").insert(toInsert));
  }
  // Batch update current_status on links
  for (const upd of statusUpdates) {
    ops.push(
      serviceClient.from("flow_map_links")
        .update({ current_status: upd.current_status, last_status_change: upd.last_status_change })
        .eq("id", upd.id)
    );
  }

  if (ops.length > 0) {
    await Promise.all(ops);
    console.log(`[flowmap-status] SLA transitions: closed=${toClose.length}, opened=${toInsert.length}, statusUpdates=${statusUpdates.length}`);
  }
}

/* ─── Link traffic telemetry ─── */
interface LinkItemRow {
  link_id: string;
  side: string;
  direction: string;
  metric: string;
  zabbix_item_id: string;
}

interface LinkTrafficSide {
  in_bps: number | null;
  out_bps: number | null;
  utilization: number | null;
}

interface LinkTrafficResult {
  sideA: LinkTrafficSide;
  sideB: LinkTrafficSide;
}

async function fetchLinkTraffic(
  serviceClient: ReturnType<typeof createClient>,
  links: LinkRow[],
  tenantId: string,
  zabbixUrl: string,
  zabbixAuth: string,
): Promise<Record<string, LinkTrafficResult>> {
  if (links.length === 0) return {};

  const linkIds = links.map((l) => l.id);

  // Fetch all link items for these links
  const { data: linkItems } = await serviceClient
    .from("flow_map_link_items")
    .select("link_id, side, direction, metric, zabbix_item_id")
    .eq("tenant_id", tenantId)
    .in("link_id", linkIds);

  if (!linkItems || linkItems.length === 0) return {};

  // Collect all unique Zabbix item IDs to fetch in one call
  const bpsItems = (linkItems as LinkItemRow[]).filter((i) => i.metric === "BPS");
  const allItemIds = [...new Set(bpsItems.map((i) => i.zabbix_item_id))];

  if (allItemIds.length === 0) return {};

  // Fetch latest values from Zabbix in one call
  const zbxItems = await zabbixCall(zabbixUrl, zabbixAuth, "item.get", {
    itemids: allItemIds,
    output: ["itemid", "lastvalue", "lastclock"],
  }) as Array<{ itemid: string; lastvalue: string; lastclock: string }>;

  const valueMap = new Map<string, number>();
  for (const item of zbxItems) {
    valueMap.set(item.itemid, parseFloat(item.lastvalue || "0"));
  }

  // Build capacity lookup
  const capacityMap = new Map<string, number>();
  for (const link of links) {
    capacityMap.set(link.id, link.capacity_mbps);
  }

  // Aggregate per link
  const result: Record<string, LinkTrafficResult> = {};

  for (const linkId of linkIds) {
    const items = bpsItems.filter((i) => i.link_id === linkId);
    const capacity = capacityMap.get(linkId) ?? 1000;
    const capacityBps = capacity * 1_000_000;

    const sideA: LinkTrafficSide = { in_bps: null, out_bps: null, utilization: null };
    const sideB: LinkTrafficSide = { in_bps: null, out_bps: null, utilization: null };

    for (const item of items) {
      const val = valueMap.get(item.zabbix_item_id);
      if (val === undefined) continue;

      const side = item.side === "A" ? sideA : sideB;
      if (item.direction === "IN") side.in_bps = val;
      if (item.direction === "OUT") side.out_bps = val;
    }

    // Calculate utilization = max(in, out) / capacity * 100
    if (sideA.in_bps !== null || sideA.out_bps !== null) {
      const maxBps = Math.max(sideA.in_bps ?? 0, sideA.out_bps ?? 0);
      sideA.utilization = Math.round((maxBps / capacityBps) * 10000) / 100;
    }
    if (sideB.in_bps !== null || sideB.out_bps !== null) {
      const maxBps = Math.max(sideB.in_bps ?? 0, sideB.out_bps ?? 0);
      sideB.utilization = Math.round((maxBps / capacityBps) * 10000) / 100;
    }

    result[linkId] = { sideA, sideB };
  }

  return result;
}

/* ─── Main Handler ─── */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const encryptionKey = Deno.env.get("ZABBIX_ENCRYPTION_KEY");

  if (!encryptionKey) return json({ error: "ZABBIX_ENCRYPTION_KEY not configured" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claims?.claims) return json({ error: "Invalid token" }, 401);

  const userId = claims.claims.sub as string;

  try {
    const body = await req.json() as { map_id: string; connection_id: string };
    const { map_id, connection_id } = body;
    if (!map_id || !connection_id) return json({ error: "map_id and connection_id are required" }, 400);

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: tenantId } = await serviceClient.rpc("get_user_tenant_id", { p_user_id: userId });
    if (!tenantId) return json({ error: "Tenant not found" }, 403);

    // ─── Check in-memory cache ───
    const cacheKey = `${tenantId}:${map_id}`;
    const now = Date.now();
    const cached = statusCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      console.log(`[flowmap-status] cache HIT for ${cacheKey}`);
      return json(cached.data);
    }
    console.log(`[flowmap-status] cache MISS for ${cacheKey}, querying Zabbix...`);

    // Fetch map hosts
    const { data: hosts, error: hostsErr } = await serviceClient
      .from("flow_map_hosts")
      .select("id, zabbix_host_id, host_name")
      .eq("map_id", map_id)
      .eq("tenant_id", tenantId as string);

    if (hostsErr) return json({ error: `Hosts query failed: ${hostsErr.message}` }, 500);
    if (!hosts || hosts.length === 0) return json({ hosts: {}, impactedLinks: [], isolatedNodes: [], linkTraffic: {} });

    // Fetch links (with new columns)
    const { data: links } = await serviceClient
      .from("flow_map_links")
      .select("id, origin_host_id, dest_host_id, is_ring, capacity_mbps, status_strategy, current_status")
      .eq("map_id", map_id)
      .eq("tenant_id", tenantId as string);

    // Fetch Zabbix connection
    const { data: conn, error: connErr } = await supabase
      .from("zabbix_connections")
      .select("id, url, username, password_ciphertext, password_iv, password_tag, is_active")
      .eq("id", connection_id)
      .single();

    if (connErr || !conn) return json({ error: "Connection not found" }, 404);
    if (!conn.is_active) return json({ error: "Connection disabled" }, 400);

    // Decrypt & login
    const password = await decryptPassword(conn.password_ciphertext, conn.password_iv, conn.password_tag, encryptionKey);
    const zabbixAuth = await getToken(conn.url, conn.username, password, conn.id);

    // Batch Zabbix calls in parallel
    const zabbixHostIds = hosts.map((h) => h.zabbix_host_id);

    const [zbxHosts, zbxItems, zbxTriggers] = await Promise.all([
      zabbixCall(conn.url, zabbixAuth, "host.get", {
        hostids: zabbixHostIds,
        output: ["hostid", "host", "name", "status", "available"],
        selectInterfaces: ["ip", "dns", "port", "type", "available"],
      }) as Promise<Array<Record<string, unknown>>>,

      zabbixCall(conn.url, zabbixAuth, "item.get", {
        hostids: zabbixHostIds,
        search: { key_: "icmppingsec" },
        output: ["itemid", "hostid", "lastvalue", "lastclock"],
        limit: 500,
      }) as Promise<Array<Record<string, string>>>,

      zabbixCall(conn.url, zabbixAuth, "trigger.get", {
        hostids: zabbixHostIds,
        only_true: true,
        monitored: true,
        filter: { value: "1" },
        output: ["triggerid", "description", "priority"],
        selectHosts: ["hostid"],
        limit: 500,
      }) as Promise<Array<Record<string, unknown>>>,
    ]);

    // Build lookup maps
    const zbxHostMap = new Map(zbxHosts.map((h) => [String(h.hostid), h]));
    const icmpMap = new Map<string, { lastvalue: string; lastclock: string }>();
    for (const item of zbxItems) {
      icmpMap.set(item.hostid, { lastvalue: item.lastvalue, lastclock: item.lastclock });
    }

    const triggerProblemHosts = new Set<string>();
    for (const trigger of zbxTriggers) {
      const trigHosts = trigger.hosts as Array<{ hostid: string }> | undefined;
      if (trigHosts) {
        for (const th of trigHosts) triggerProblemHosts.add(th.hostid);
      }
    }

    // Build result keyed by zabbix_host_id AND by flow_map_hosts.id
    const resultByZabbixId: Record<string, HostStatusResult> = {};
    const resultByHostId: Record<string, HostStatusResult> = {};

    for (const host of hosts) {
      const zbx = zbxHostMap.get(host.zabbix_host_id);
      if (!zbx) {
        const unknown: HostStatusResult = { status: "UNKNOWN" };
        resultByZabbixId[host.zabbix_host_id] = unknown;
        resultByHostId[host.id] = unknown;
        continue;
      }

      const st = resolveStatus(
        zbx,
        triggerProblemHosts.has(host.zabbix_host_id),
        icmpMap.get(host.zabbix_host_id),
      );
      resultByZabbixId[host.zabbix_host_id] = st;
      resultByHostId[host.id] = st;
    }

    // Ring break detection
    const typedLinks = (links ?? []) as LinkRow[];
    const ringResult = detectRingBreaks(typedLinks, resultByHostId);

    // ─── Derive per-link status ───
    const linkStatusMap: Record<string, string> = {};
    const linkStatuses: Record<string, { status: string; originHost: string; destHost: string }> = {};
    for (const link of typedLinks) {
      const oSt = resultByHostId[link.origin_host_id]?.status ?? "UNKNOWN";
      const dSt = resultByHostId[link.dest_host_id]?.status ?? "UNKNOWN";
      const linkSt = deriveLinkStatus(oSt, dSt);
      linkStatusMap[link.id] = linkSt;
      const oHost = hosts.find((h) => h.id === link.origin_host_id);
      const dHost = hosts.find((h) => h.id === link.dest_host_id);
      linkStatuses[link.id] = {
        status: linkSt,
        originHost: oHost?.host_name || oHost?.zabbix_host_id || "?",
        destHost: dHost?.host_name || dHost?.zabbix_host_id || "?",
      };
    }

    // ─── Fetch link traffic (BPS telemetry from link_items) ───
    const linkTraffic = await fetchLinkTraffic(
      serviceClient,
      typedLinks,
      tenantId as string,
      conn.url,
      zabbixAuth,
    );

    // ─── Fetch active link events for SLA panel ───
    const { data: activeEvents } = await serviceClient
      .from("flow_map_link_events")
      .select("id, link_id, status, started_at, ended_at, duration_seconds")
      .eq("tenant_id", tenantId as string)
      .in("link_id", typedLinks.map((l) => l.id))
      .order("started_at", { ascending: false })
      .limit(100);

    // ─── SLA Transition Engine (fire-and-forget) ───
    processLinkTransitions(serviceClient, typedLinks, resultByHostId, tenantId as string, linkStatusMap)
      .catch((err) => console.error("[flowmap-status] SLA transition error:", err));

    const responseData = {
      hosts: resultByZabbixId,
      impactedLinks: ringResult.impactedLinkIds,
      isolatedNodes: ringResult.isolatedNodeIds,
      linkStatuses,
      linkEvents: activeEvents ?? [],
      linkTraffic,
    };

    // Store in cache
    statusCache.set(cacheKey, { data: responseData, expiresAt: now + CACHE_TTL_MS });

    // Evict old entries
    if (statusCache.size > 200) {
      for (const [k, v] of statusCache) {
        if (v.expiresAt < now) statusCache.delete(k);
      }
    }

    return json(responseData);
  } catch (err) {
    console.error("flowmap-status error:", err);
    if (err instanceof Error && err.message.includes("login failed")) tokenCache.clear();
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
