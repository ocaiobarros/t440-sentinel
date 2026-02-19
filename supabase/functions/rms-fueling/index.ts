import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RMS_BASE = "https://supabase.rmsgroup.app/functions/v1/fueling-entries-api";
const PAGE_SIZE = 200;

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
}

function normalize(raw: RMSEntry): NormalizedEntry {
  const hasOdometer = raw.odometer_reading != null && raw.odometer_reading > 0;
  const hasHourmeter = raw.hourmeter_reading != null && raw.hourmeter_reading > 0;
  return {
    id: raw.id,
    date: raw.date,
    liters: raw.liters ?? 0,
    reading: hasOdometer ? raw.odometer_reading! : hasHourmeter ? raw.hourmeter_reading! : null,
    reading_type: hasOdometer ? "odometer" : hasHourmeter ? "hourmeter" : null,
    driver_name: raw.driver?.name ?? null,
    fleet_number: raw.equipment?.fleet_number ?? null,
    equipment_name: raw.equipment?.name ?? null,
  };
}

async function fetchAllPages(startDate: string, endDate: string, token: string): Promise<NormalizedEntry[]> {
  const all: NormalizedEntry[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = new URL(RMS_BASE);
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

    for (const item of items) {
      all.push(normalize(item));
    }

    hasMore = all.length < total && items.length === PAGE_SIZE;
    page++;
    if (page > 50) break; // safety cap
  }

  return all;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Parse params
    const url = new URL(req.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    if (!startDate || !endDate) {
      return new Response(JSON.stringify({ error: "startDate and endDate are required (YYYY-MM-DD)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const token = Deno.env.get("RMS_FUELING_API_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "RMS API token not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const entries = await fetchAllPages(startDate, endDate, token);

    return new Response(JSON.stringify({ entries, count: entries.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("401") ? 401 : message.includes("404") ? 404 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
