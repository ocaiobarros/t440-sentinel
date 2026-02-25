import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const body = await req.json();
    const tenantId = body.tenant_id as string;
    const action = body.action as string;

    if (!tenantId) {
      return new Response(JSON.stringify({ error: "missing tenant_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "counters") {
      return await getCounters(supabase, tenantId, corsHeaders);
    }

    if (action === "low_toner") {
      return await getLowToner(supabase, tenantId, corsHeaders);
    }

    if (action === "monthly_snapshot") {
      return await createMonthlySnapshot(supabase, tenantId, corsHeaders);
    }

    return new Response(JSON.stringify({ error: "unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("printer-status error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

/* ─── Zabbix proxy helper ─── */

async function zabbixProxy(
  supabase: ReturnType<typeof createClient>,
  connectionId: string,
  method: string,
  params: Record<string, unknown>,
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const resp = await fetch(`${supabaseUrl}/functions/v1/zabbix-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ connection_id: connectionId, method, params }),
  });
  const data = await resp.json();
  if (data?.error) throw new Error(data.error);
  return data?.result;
}

/* ─── Get active Zabbix connection for tenant ─── */

async function getZabbixConnection(supabase: ReturnType<typeof createClient>, tenantId: string) {
  const { data } = await supabase
    .from("zabbix_connections")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/* ─── Get printer configs (base counters) ─── */

async function getPrinterConfigs(supabase: ReturnType<typeof createClient>, tenantId: string) {
  const { data } = await supabase
    .from("printer_configs")
    .select("zabbix_host_id, host_name, base_counter")
    .eq("tenant_id", tenantId);
  // Sanitize base_counter to prevent NaN propagation
  return (data ?? []).map((c: any) => ({
    ...c,
    base_counter: typeof c.base_counter === "number" && !isNaN(c.base_counter) ? c.base_counter : 0,
  }));
}

/* ─── Fetch printer items from Zabbix ─── */

async function fetchPrinterItems(
  supabase: ReturnType<typeof createClient>,
  connectionId: string,
  hostIds: string[],
) {
  if (hostIds.length === 0) return [];
  const items = await zabbixProxy(supabase, connectionId, "item.get", {
    output: ["itemid", "key_", "name", "lastvalue", "units", "hostid"],
    hostids: hostIds,
    search: {
      key_: "kyocera.counter.total,number.of.printed.pages,.1.3.6.1.2.1.43.10.2.1.4.1.1,kyocera.toner.percent,black,cyan,magenta,yellow,cosumablecalculated,consumablecalculated,kyocera.serial,.1.3.6.1.2.1.43.5.1.1.17.1",
    },
    searchByAny: true,
    searchWildcardsEnabled: true,
    limit: 2000,
  });
  return items ?? [];
}

/* ─── Counter keys ─── */

const COUNTER_KEYS = [
  "kyocera.counter.total",
  "number.of.printed.pages",
  ".1.3.6.1.2.1.43.10.2.1.4.1.1",
];

const TONER_KEYS = [
  "kyocera.toner.percent",
  "black",
  "cyan",
  "magenta",
  "yellow",
];

function getCounterValue(items: any[], hostId: string): number {
  for (const key of COUNTER_KEYS) {
    const item = items.find(
      (i: any) => i.hostid === hostId && i.key_.toLowerCase().includes(key.toLowerCase()),
    );
    if (item) {
      const v = parseInt(item.lastvalue);
      if (!isNaN(v)) return v;
    }
  }
  return 0;
}

function getSerialNumber(items: any[], hostId: string): string {
  const serKeys = ["kyocera.serial", ".1.3.6.1.2.1.43.5.1.1.17.1"];
  for (const key of serKeys) {
    const item = items.find(
      (i: any) => i.hostid === hostId && i.key_.toLowerCase().includes(key.toLowerCase()),
    );
    if (item?.lastvalue) return item.lastvalue;
  }
  return "";
}

function getTonerLevels(items: any[], hostId: string): { key: string; value: number }[] {
  const levels: { key: string; value: number }[] = [];
  const hostItems = items.filter((i: any) => i.hostid === hostId);

  for (const item of hostItems) {
    const k = item.key_.toLowerCase();
    if (
      TONER_KEYS.some((tk) => k === tk || k.includes(tk)) ||
      k.startsWith("cosumablecalculated") ||
      k.startsWith("consumablecalculated")
    ) {
      const v = parseFloat(item.lastvalue);
      if (!isNaN(v)) {
        levels.push({ key: item.name || item.key_, value: v > 100 ? 100 : v });
      }
    }
  }
  return levels;
}

/* ─── Action: counters ─── */

async function getCounters(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  headers: Record<string, string>,
) {
  const connectionId = await getZabbixConnection(supabase, tenantId);
  const configs = await getPrinterConfigs(supabase, tenantId);

  if (!connectionId || configs.length === 0) {
    return new Response(
      JSON.stringify({ printers: [], total: 0, message: "Nenhuma impressora configurada." }),
      { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
    );
  }

  const hostIds = configs.map((c) => c.zabbix_host_id);
  const items = await fetchPrinterItems(supabase, connectionId, hostIds);

  // Get host names from Zabbix
  const hosts = await zabbixProxy(supabase, connectionId, "host.get", {
    output: ["hostid", "host", "name"],
    hostids: hostIds,
  });
  const hostMap = new Map((hosts ?? []).map((h: any) => [h.hostid, h]));

  const printers = configs.map((cfg) => {
    const zabbixCounter = getCounterValue(items, cfg.zabbix_host_id);
    const billingCounter = cfg.base_counter + zabbixCounter;
    const serial = getSerialNumber(items, cfg.zabbix_host_id);
    const host = hostMap.get(cfg.zabbix_host_id);
    return {
      hostId: cfg.zabbix_host_id,
      name: cfg.host_name || host?.name || host?.host || cfg.zabbix_host_id,
      ip: host?.host ?? "",
      zabbixCounter,
      baseCounter: cfg.base_counter,
      billingCounter,
      serial,
    };
  });

  const total = printers.reduce((s, p) => s + p.billingCounter, 0);

  return new Response(
    JSON.stringify({ printers, total }),
    { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
  );
}

/* ─── Action: low_toner ─── */

async function getLowToner(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  headers: Record<string, string>,
) {
  const connectionId = await getZabbixConnection(supabase, tenantId);
  const configs = await getPrinterConfigs(supabase, tenantId);

  if (!connectionId || configs.length === 0) {
    return new Response(
      JSON.stringify({ printers: [], message: "Nenhuma impressora configurada." }),
      { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
    );
  }

  const hostIds = configs.map((c) => c.zabbix_host_id);
  const items = await fetchPrinterItems(supabase, connectionId, hostIds);

  const hosts = await zabbixProxy(supabase, connectionId, "host.get", {
    output: ["hostid", "host", "name"],
    hostids: hostIds,
  });
  const hostMap = new Map((hosts ?? []).map((h: any) => [h.hostid, h]));

  const lowPrinters: { name: string; supplies: { name: string; level: number }[] }[] = [];

  for (const cfg of configs) {
    const levels = getTonerLevels(items, cfg.zabbix_host_id);
    const lowLevels = levels.filter((l) => l.value < 10);
    if (lowLevels.length > 0) {
      const host = hostMap.get(cfg.zabbix_host_id);
      lowPrinters.push({
        name: cfg.host_name || host?.name || host?.host || cfg.zabbix_host_id,
        supplies: lowLevels.map((l) => ({ name: l.key, level: Math.round(l.value) })),
      });
    }
  }

  return new Response(
    JSON.stringify({ printers: lowPrinters }),
    { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
  );
}

/* ─── Action: monthly_snapshot ─── */

async function createMonthlySnapshot(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  headers: Record<string, string>,
) {
  const connectionId = await getZabbixConnection(supabase, tenantId);
  const configs = await getPrinterConfigs(supabase, tenantId);

  if (!connectionId || configs.length === 0) {
    return new Response(
      JSON.stringify({ error: "no printers configured" }),
      { status: 400, headers: { ...headers, "Content-Type": "application/json" } },
    );
  }

  const hostIds = configs.map((c) => c.zabbix_host_id);
  const items = await fetchPrinterItems(supabase, connectionId, hostIds);
  const hosts = await zabbixProxy(supabase, connectionId, "host.get", {
    output: ["hostid", "host", "name"],
    hostids: hostIds,
  });
  const hostMap = new Map((hosts ?? []).map((h: any) => [h.hostid, h]));

  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const entries = configs.map((cfg) => {
    const zabbixCounter = getCounterValue(items, cfg.zabbix_host_id);
    const billingCounter = cfg.base_counter + zabbixCounter;
    const serial = getSerialNumber(items, cfg.zabbix_host_id);
    const host = hostMap.get(cfg.zabbix_host_id);
    return {
      hostId: cfg.zabbix_host_id,
      name: cfg.host_name || host?.name || host?.host || "",
      ip: host?.host ?? "",
      zabbixCounter,
      baseCounter: cfg.base_counter,
      billingCounter,
      serial,
    };
  });

  const totalPages = entries.reduce((s, e) => s + e.billingCounter, 0);

  const { error } = await supabase.from("billing_logs").insert({
    tenant_id: tenantId,
    period,
    entries,
    total_pages: totalPages,
  });

  if (error) throw error;

  return new Response(
    JSON.stringify({ ok: true, period, totalPages, count: entries.length }),
    { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
  );
}
