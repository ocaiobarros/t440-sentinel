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

    if (action === "supply_forecast") {
      return await getSupplyForecast(supabase, tenantId, corsHeaders);
    }

    if (action === "usage_heatmap") {
      const hostId = body.host_id as string | undefined;
      return await getUsageHeatmap(supabase, tenantId, hostId, corsHeaders);
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

/* ─── Action: supply_forecast ─── */

async function getSupplyForecast(
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

  // Get host names
  const hosts = await zabbixProxy(supabase, connectionId, "host.get", {
    output: ["hostid", "host", "name"],
    hostids: hostIds,
  });
  const hostMap = new Map((hosts ?? []).map((h: any) => [h.hostid, h]));

  // For each host, find toner items and fetch 15-day history
  const now = Math.floor(Date.now() / 1000);
  const fifteenDaysAgo = now - 15 * 86400;
  const oneDayAgo = now - 86400;

  const forecasts: {
    name: string;
    hostId: string;
    supplies: {
      name: string;
      currentLevel: number;
      dailyConsumption: number;
      daysRemaining: number | null;
      estimatedDate: string | null;
      dataInsufficient: boolean;
    }[];
  }[] = [];

  for (const cfg of configs) {
    const hostItems = items.filter((i: any) => i.hostid === cfg.zabbix_host_id);
    const tonerItems = hostItems.filter((i: any) => {
      const k = i.key_.toLowerCase();
      return TONER_KEYS.some((tk) => k === tk || k.includes(tk)) ||
        k.startsWith("cosumablecalculated") ||
        k.startsWith("consumablecalculated");
    });

    if (tonerItems.length === 0) continue;

    const host = hostMap.get(cfg.zabbix_host_id);
    const printerName = cfg.host_name || host?.name || host?.host || cfg.zabbix_host_id;

    const supplies: typeof forecasts[0]["supplies"] = [];

    for (const item of tonerItems) {
      const currentLevel = parseFloat(item.lastvalue);
      if (isNaN(currentLevel)) continue;
      const clampedCurrent = Math.min(100, Math.max(0, currentLevel));

      // Check if data is stale (no update in 24h)
      // We'll check via history — if no history points in the last day, mark as insufficient
      let dataInsufficient = false;

      try {
        // Determine history type: 0=float, 3=unsigned
        const valueType = item.value_type ?? "0";
        const historyType = valueType === "3" ? 3 : 0;

        const history = await zabbixProxy(supabase, connectionId, "history.get", {
          output: ["clock", "value"],
          itemids: [item.itemid],
          history: historyType,
          time_from: fifteenDaysAgo,
          time_till: now,
          sortfield: "clock",
          sortorder: "ASC",
          limit: 500,
        });

        if (!history || history.length < 2) {
          dataInsufficient = true;
          supplies.push({
            name: item.name || item.key_,
            currentLevel: clampedCurrent,
            dailyConsumption: 0,
            daysRemaining: null,
            estimatedDate: null,
            dataInsufficient: true,
          });
          continue;
        }

        // Check staleness: latest history point must be within 24h
        const latestClock = parseInt(history[history.length - 1].clock);
        if (latestClock < oneDayAgo) {
          dataInsufficient = true;
          supplies.push({
            name: item.name || item.key_,
            currentLevel: clampedCurrent,
            dailyConsumption: 0,
            daysRemaining: null,
            estimatedDate: null,
            dataInsufficient: true,
          });
          continue;
        }

        // Calculate consumption: difference between earliest and latest value over the time span
        const earliestVal = parseFloat(history[0].value);
        const latestVal = parseFloat(history[history.length - 1].value);
        const earliestClock = parseInt(history[0].clock);
        const timeSpanDays = (latestClock - earliestClock) / 86400;

        if (timeSpanDays < 1) {
          // Not enough time span for reliable estimate
          supplies.push({
            name: item.name || item.key_,
            currentLevel: clampedCurrent,
            dailyConsumption: 0,
            daysRemaining: null,
            estimatedDate: null,
            dataInsufficient: true,
          });
          continue;
        }

        // Consumption = how much it dropped (positive means it went down)
        const consumption = earliestVal - latestVal;
        const dailyConsumption = consumption > 0 ? consumption / timeSpanDays : 0;

        let daysRemaining: number | null = null;
        let estimatedDate: string | null = null;

        if (dailyConsumption > 0.01) {
          daysRemaining = Math.round(clampedCurrent / dailyConsumption);
          const estDate = new Date(Date.now() + daysRemaining * 86400 * 1000);
          estimatedDate = estDate.toISOString().slice(0, 10);
        }

        supplies.push({
          name: item.name || item.key_,
          currentLevel: clampedCurrent,
          dailyConsumption: Math.round(dailyConsumption * 100) / 100,
          daysRemaining,
          estimatedDate,
          dataInsufficient: false,
        });
      } catch {
        supplies.push({
          name: item.name || item.key_,
          currentLevel: clampedCurrent,
          dailyConsumption: 0,
          daysRemaining: null,
          estimatedDate: null,
          dataInsufficient: true,
        });
      }
    }

    if (supplies.length > 0) {
      forecasts.push({ name: printerName, hostId: cfg.zabbix_host_id, supplies });
    }
  }

  return new Response(
    JSON.stringify({ printers: forecasts }),
    { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
  );
}

/* ─── Action: usage_heatmap ─── */

async function getUsageHeatmap(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  hostId: string | undefined,
  headers: Record<string, string>,
) {
  const connectionId = await getZabbixConnection(supabase, tenantId);
  const configs = await getPrinterConfigs(supabase, tenantId);

  if (!connectionId || configs.length === 0) {
    return new Response(
      JSON.stringify({ grid: [], peak: null, message: "Nenhuma impressora configurada." }),
      { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
    );
  }

  // Filter to specific host or all
  const targetConfigs = hostId
    ? configs.filter((c) => c.zabbix_host_id === hostId)
    : configs;

  if (targetConfigs.length === 0) {
    return new Response(
      JSON.stringify({ grid: [], peak: null }),
      { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
    );
  }

  const hostIds = targetConfigs.map((c) => c.zabbix_host_id);

  // Get counter items
  const items = await fetchPrinterItems(supabase, connectionId, hostIds);
  const counterItems = items.filter((i: any) =>
    COUNTER_KEYS.some((k) => i.key_.toLowerCase().includes(k.toLowerCase()))
  );

  if (counterItems.length === 0) {
    return new Response(
      JSON.stringify({ grid: [], peak: null }),
      { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
    );
  }

  // Fetch 7 days of history for counter items
  const now = Math.floor(Date.now() / 1000);
  const sevenDaysAgo = now - 7 * 86400;

  // Aggregate grid: 7 days x 24 hours
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

  for (const item of counterItems) {
    try {
      const valueType = (item as any).value_type ?? "3";
      const historyType = valueType === "0" ? 0 : 3;

      const history = await zabbixProxy(supabase, connectionId, "history.get", {
        output: ["clock", "value"],
        itemids: [item.itemid],
        history: historyType,
        time_from: sevenDaysAgo,
        time_till: now,
        sortfield: "clock",
        sortorder: "ASC",
        limit: 5000,
      });

      if (!history || history.length < 2) continue;

      // Calculate hourly diffs
      for (let i = 1; i < history.length; i++) {
        const prevVal = parseInt(history[i - 1].value);
        const currVal = parseInt(history[i].value);
        const clock = parseInt(history[i].clock);

        if (isNaN(prevVal) || isNaN(currVal) || isNaN(clock)) continue;

        const diff = currVal - prevVal;
        if (diff <= 0 || diff > 10000) continue; // ignore resets or anomalies

        const date = new Date(clock * 1000);
        // JS getDay: 0=Sun..6=Sat → convert to 0=Mon..6=Sun
        const jsDay = date.getDay();
        const dayIdx = jsDay === 0 ? 6 : jsDay - 1;
        const hour = date.getHours();

        grid[dayIdx][hour] += diff;
      }
    } catch {
      // skip item on error
    }
  }

  // Build response
  const cells: { day: number; hour: number; value: number }[] = [];
  let peak: { day: number; hour: number; value: number } | null = null;

  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const val = grid[d][h];
      cells.push({ day: d, hour: h, value: val });
      if (!peak || val > peak.value) {
        peak = { day: d, hour: h, value: val };
      }
    }
  }

  // If peak is 0, set to null
  if (peak && peak.value === 0) peak = null;

  return new Response(
    JSON.stringify({ grid: cells, peak }),
    { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
  );
}
