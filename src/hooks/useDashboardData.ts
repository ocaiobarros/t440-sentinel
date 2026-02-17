import { useState, useEffect, useCallback, useRef } from "react";
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

export function useDashboardData(dashboardId: string | null) {
  const [telemetryCache, setTelemetryCache] = useState<Map<string, TelemetryCacheEntry>>(new Map());
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inflightRef = useRef(false); // congestion control

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

  // Realtime subscription
  const { seedCache, clearCache } = useDashboardRealtime({
    dashboardId,
    onUpdate: setTelemetryCache,
    enabled: !!dashboardId,
  });

  // Replay warm start
  const { replayKeys } = useDashboardReplay({ dashboardId });

  // Seed cache from replay once widgets are loaded + persist metadata to IndexedDB
  useEffect(() => {
    if (!dashboard?.widgets?.length || !dashboardId) return;
    const keys = dashboard.widgets
      .map((w) => w.adapter?.telemetry_key || `zbx:widget:${w.id}`)
      .filter(Boolean);
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

  // Poll Zabbix periodically with congestion control
  const pollNow = useCallback(async () => {
    if (!dashboard?.zabbix_connection_id || !dashboard.widgets.length) return;

    // Congestion control: skip if previous request is still in-flight
    if (inflightRef.current) {
      console.debug("[FlowPulse] Skipping poll — previous request still in-flight");
      return;
    }

    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.access_token) return;

    const widgetConfigs = dashboard.widgets.map((w) => ({
      widget_id: w.id,
      widget_type: w.widget_type,
      query: w.query,
      adapter: w.adapter,
    }));

    inflightRef.current = true;
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
            connection_id: dashboard.zabbix_connection_id,
            dashboard_id: dashboard.id,
            widgets: widgetConfigs,
          }),
        },
      );
    } catch (err) {
      console.error("Poll failed:", err);
    } finally {
      inflightRef.current = false;
    }
  }, [dashboard]);

  // Start/stop polling
  useEffect(() => {
    if (!dashboard?.zabbix_connection_id || !dashboard.widgets.length) return;

    // Initial poll
    pollNow();

    const intervalMs = ((dashboard.settings as Record<string, unknown>)?.poll_interval_seconds as number || 60) * 1000;
    pollIntervalRef.current = setInterval(pollNow, intervalMs);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [dashboard?.id, dashboard?.zabbix_connection_id, pollNow]);

  // Clear cache on dashboard switch
  useEffect(() => {
    return () => clearCache();
  }, [dashboardId]);

  return { dashboard, isLoading, error, telemetryCache, pollNow };
}
