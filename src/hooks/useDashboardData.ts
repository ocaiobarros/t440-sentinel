import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useDashboardRealtime, type TelemetryCacheEntry } from "./useDashboardRealtime";
import { useDashboardReplay } from "./useDashboardReplay";
import { setMetaForDashboard, getMetaForDashboard } from "@/lib/metadata-cache";

interface DashboardWidget {
  id: string;
  widget_type: string;
  title: string;
  query: { source: string; method: string; params: Record<string, unknown> };
  adapter: { type: string; value_field?: string; history_type?: number; telemetry_key?: string };
  config: Record<string, unknown>;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
}

interface Dashboard {
  id: string;
  name: string;
  description: string | null;
  zabbix_connection_id: string | null;
  settings: Record<string, unknown>;
  widgets: DashboardWidget[];
}

export function useDashboardData(dashboardId: string | null, pollIntervalOverride?: number) {
  const [telemetryCache, setTelemetryCache] = useState<Map<string, TelemetryCacheEntry>>(new Map());
  const [isPollingActive, setIsPollingActive] = useState(false);
  const [isEmergencyMode, setIsEmergencyMode] = useState(false);
  const [lastPollLatencyMs, setLastPollLatencyMs] = useState<number | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inflightRef = useRef(false); // congestion control
  const dashboardRef = useRef<Dashboard | null>(null);

  // Fetch dashboard + widgets from DB
  const { data: dashboard, isLoading, error } = useQuery({
    queryKey: ["dashboard", dashboardId],
    queryFn: async (): Promise<Dashboard | null> => {
      if (!dashboardId) return null;

      const { data: dash, error: dashErr } = await supabase
        .from("dashboards")
        .select("id, name, description, zabbix_connection_id, settings")
        .eq("id", dashboardId)
        .single();

      if (dashErr || !dash) throw dashErr || new Error("Dashboard not found");

      const { data: widgets, error: wErr } = await supabase
        .from("widgets")
        .select("id, widget_type, title, query, config, adapter, position_x, position_y, width, height")
        .eq("dashboard_id", dashboardId)
        .order("position_y", { ascending: true });

      if (wErr) throw wErr;

      return {
        ...dash,
        settings: (dash.settings || {}) as Record<string, unknown>,
        widgets: (widgets || []).map((w) => ({
          ...w,
          query: (w.query || {}) as DashboardWidget["query"],
          adapter: (w.adapter || {}) as DashboardWidget["adapter"],
          config: (w.config || {}) as Record<string, unknown>,
        })),
      };
    },
    enabled: !!dashboardId,
  });

  // Collect priority keys for instant flush (ac_status, battery voltage keys)
  const priorityKeys = useMemo(() => {
    if (!dashboard?.widgets) return [];
    const keys: string[] = [];
    for (const w of (dashboard.widgets as any[])) {
      const tk = w.adapter?.telemetry_key || "";
      if (tk && (tk.includes("ac_status") || tk.includes("battery") || tk.includes("voltage") || tk.includes("ups"))) {
        keys.push(tk);
      }
    }
    return keys;
  }, [dashboard?.widgets]);

  // ── Emergency mode detection: scan cache for ac_status = 0 ──
  useEffect(() => {
    let acOff = false;
    for (const [key, entry] of telemetryCache) {
      if (key.includes("ac_status")) {
        const raw = entry.data;
        const val = typeof raw === "object" && raw !== null && "value" in (raw as any) ? (raw as any).value : raw;
        if (val === 0 || val === "0" || val === "OFF" || val === "off") {
          acOff = true;
          break;
        }
      }
    }
    setIsEmergencyMode(acOff);
  }, [telemetryCache]);

  // Realtime subscription
  const { seedCache, clearCache } = useDashboardRealtime({
    dashboardId,
    onUpdate: setTelemetryCache,
    enabled: !!dashboardId,
    priorityKeys,
  });

  // Replay warm start
  const { replayKeys } = useDashboardReplay({ dashboardId });

  // Seed cache from replay once widgets are loaded + persist metadata to IndexedDB
  useEffect(() => {
    if (!dashboard?.widgets?.length || !dashboardId) return;
    const keys: string[] = [];
    for (const w of dashboard.widgets) {
      const mainKey = w.adapter?.telemetry_key || `zbx:widget:${w.id}`;
      if (mainKey) keys.push(mainKey);
      // Include all series keys for multi-series widgets
      const extraKeys = ((w.config as any)?.extra?.telemetry_keys || (w.config as any)?.telemetry_keys || []) as string[];
      for (const k of extraKeys) {
        if (k && !keys.includes(k)) keys.push(k);
      }
    }
    if (keys.length === 0) return;

    // Persist metadata to IndexedDB for instant future loads
    setMetaForDashboard(
      dashboardId,
      dashboard.widgets.map((w) => ({
        key: w.adapter?.telemetry_key || `zbx:widget:${w.id}`,
        hostId: (w.query?.params as any)?.hostids?.[0],
        itemId: (w.query?.params as any)?.itemids?.[0],
        widgetType: w.widget_type,
      }))
    ).catch(() => {}); // fire and forget

    replayKeys(keys).then((entries) => {
      if (entries.length > 0) seedCache(entries);
    });
  }, [dashboard?.id, dashboard?.widgets?.length]);

  // On mount, try to pre-seed from IndexedDB cached replay before DB query completes
  useEffect(() => {
    if (!dashboardId) return;
    getMetaForDashboard(dashboardId).then((meta) => {
      if (meta.length > 0) {
        const keys = meta.map((m) => m.key);
        replayKeys(keys).then((entries) => {
          if (entries.length > 0) seedCache(entries);
        });
      }
    }).catch(() => {});
  }, [dashboardId]);

  // Keep ref in sync so pollNow doesn't need dashboard as dependency
  useEffect(() => {
    dashboardRef.current = dashboard ?? null;
  }, [dashboard]);

  // Poll Zabbix with congestion control — stable reference
  const pollNow = useCallback(async () => {
    const dash = dashboardRef.current;
    if (!dash?.zabbix_connection_id || !dash.widgets.length) return;

    // Congestion control: skip if previous request is still in-flight
    if (inflightRef.current) {
      console.debug("[FlowPulse] Skipping poll — previous request still in-flight");
      return;
    }

    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.access_token) return;

    const widgetConfigs = dash.widgets.map((w) => ({
      widget_id: w.id,
      widget_type: w.widget_type,
      query: w.query,
      adapter: w.adapter,
      time_range: (w.config as any)?.time_range || (w.config as any)?.extra?.time_range || "",
      series: (w.config as any)?.series || (w.config as any)?.extra?.series || [],
      telemetry_keys: (w.config as any)?.telemetry_keys || (w.config as any)?.extra?.telemetry_keys || [],
    }));

    inflightRef.current = true;
    setIsPollingActive(true);
    const pollStart = performance.now();
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/zabbix-poller`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify({
            connection_id: dash.zabbix_connection_id,
            dashboard_id: dash.id,
            widgets: widgetConfigs,
          }),
        },
      );
      setLastPollLatencyMs(Math.round(performance.now() - pollStart));
    } catch (err) {
      console.error("[FlowPulse] Poll failed:", err);
      setLastPollLatencyMs(Math.round(performance.now() - pollStart));
    } finally {
      inflightRef.current = false;
      setIsPollingActive(false);
    }
  }, []); // stable — reads from ref

  // Start/stop polling — reacts to interval changes AND emergency mode
  const effectiveInterval = isEmergencyMode ? 1 : (pollIntervalOverride ?? 60);

  useEffect(() => {
    if (!dashboard?.zabbix_connection_id || !dashboard.widgets.length) return;

    const intervalMs = effectiveInterval * 1000;
    console.log(`🔄 Polling: ${effectiveInterval}s (${intervalMs}ms)${isEmergencyMode ? " ⚡ EMERGENCY MODE" : ""}`);

    // Immediate first poll
    pollNow();

    pollIntervalRef.current = setInterval(pollNow, intervalMs);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [dashboard?.id, dashboard?.zabbix_connection_id, dashboard?.widgets?.length, effectiveInterval, pollNow]);

  // Clear cache on dashboard switch
  useEffect(() => {
    return () => clearCache();
  }, [dashboardId]);

  return { dashboard, isLoading, error, telemetryCache, pollNow, isPollingActive, isEmergencyMode, lastPollLatencyMs };
}
