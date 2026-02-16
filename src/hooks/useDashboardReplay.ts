import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import type { TelemetryReplayEntry } from "@/types/telemetry";

interface UseReplayOptions {
  dashboardId: string | null;
}

/**
 * Hook: fetch last-values from Reactor replay endpoint for warm start.
 * Call replayKeys() after knowing the dashboard layout keys.
 * Feed result into useDashboardRealtime.seedCache().
 */
export function useDashboardReplay({ dashboardId }: UseReplayOptions) {
  const replayKeys = useCallback(
    async (keys: string[]): Promise<TelemetryCacheEntry[]> => {
      if (!dashboardId || keys.length === 0) return [];

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flowpulse-reactor?replay=1&dashboard_id=${encodeURIComponent(dashboardId)}&keys=${encodeURIComponent(keys.join(","))}`;

      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "Content-Type": "application/json",
        },
      });

      if (!resp.ok) return [];

      const json = await resp.json();
      const data = json.data as Record<string, TelemetryReplayEntry> | undefined;
      if (!data) return [];

      return Object.values(data).map((entry) => ({
        key: entry.key,
        type: entry.type,
        data: entry.data,
        ts: entry.ts,
        v: entry.v ?? 1,
        receivedAt: Date.now(),
      }));
    },
    [dashboardId],
  );

  return { replayKeys };
}
