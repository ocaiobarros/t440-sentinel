import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TelemetryBroadcast, TelemetryData, TelemetryType } from "@/types/telemetry";

export interface TelemetryCacheEntry {
  key: string;
  type: TelemetryType;
  data: TelemetryData;
  ts: number;
  v: number;
  receivedAt: number;
}

interface UseDashboardRealtimeOptions {
  dashboardId: string | null;
  /** Called when telemetry cache updates. Receives the full cache map. */
  onUpdate: (cache: Map<string, TelemetryCacheEntry>) => void;
  /** Flush interval ms — how often batched updates are pushed to consumers. Default 250ms */
  flushIntervalMs?: number;
  /** Enable/disable the subscription */
  enabled?: boolean;
}

/**
 * Hook: 1 Realtime channel per dashboard.
 * - Receives DATA_UPDATE broadcasts from the Reactor
 * - Maintains a per-key cache with ts-based dedup (drop older — monotonic guaranteed by backend)
 * - Throttled flush to avoid render storms
 * - Supports warm start via seedCache() from replay endpoint
 */
export function useDashboardRealtime({
  dashboardId,
  onUpdate,
  flushIntervalMs = 250,
  enabled = true,
}: UseDashboardRealtimeOptions) {
  const cacheRef = useRef<Map<string, TelemetryCacheEntry>>(new Map());
  const dirtyRef = useRef(false);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  // Handle incoming broadcast
  const handleBroadcast = useCallback((payload: TelemetryBroadcast) => {
    const cache = cacheRef.current;
    const existing = cache.get(payload.key);

    // Drop older timestamps (backend guarantees monotonic per key)
    if (existing && existing.ts >= payload.ts) return;

    cache.set(payload.key, {
      key: payload.key,
      type: payload.type,
      data: payload.data,
      ts: payload.ts,
      v: payload.v ?? 1,
      receivedAt: Date.now(),
    });

    dirtyRef.current = true;
  }, []);

  // Throttled flush loop
  useEffect(() => {
    if (!enabled || !dashboardId) return;

    const interval = setInterval(() => {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        onUpdateRef.current(new Map(cacheRef.current));
      }
    }, flushIntervalMs);

    return () => clearInterval(interval);
  }, [enabled, dashboardId, flushIntervalMs]);

  // Subscribe to Realtime channel
  useEffect(() => {
    if (!enabled || !dashboardId) return;

    const channelName = `dashboard:${dashboardId}`;
    const channel = supabase
      .channel(channelName)
      .on("broadcast", { event: "DATA_UPDATE" }, (msg) => {
        if (msg.payload) {
          handleBroadcast(msg.payload as TelemetryBroadcast);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, dashboardId, handleBroadcast]);

  /** Seed cache from replay or initial snapshot. Only updates if ts is newer. */
  const seedCache = useCallback(
    (entries: TelemetryCacheEntry[]) => {
      const cache = cacheRef.current;
      for (const entry of entries) {
        const existing = cache.get(entry.key);
        if (!existing || entry.ts > existing.ts) {
          cache.set(entry.key, entry);
        }
      }
      dirtyRef.current = true;
    },
    [],
  );

  /** Get current value for a specific key */
  const getKey = useCallback(
    (key: string): TelemetryCacheEntry | undefined => cacheRef.current.get(key),
    [],
  );

  /** Clear the cache (e.g. on dashboard switch) */
  const clearCache = useCallback(() => {
    cacheRef.current.clear();
    dirtyRef.current = true;
  }, []);

  return { seedCache, getKey, clearCache };
}
