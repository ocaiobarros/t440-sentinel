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
  /** End-to-end latency in ms from source to browser (Time-to-Glass) */
  latencyMs?: number;
  /** Epoch ms when the original source received the event */
  originTs?: number;
  /** Epoch ms when the Reactor broadcast the event */
  reactorTs?: number;
}

interface UseDashboardRealtimeOptions {
  dashboardId: string | null;
  /** Called when telemetry cache updates. Receives the full cache map. */
  onUpdate: (cache: Map<string, TelemetryCacheEntry>) => void;
  /** Flush interval ms — how often batched updates are pushed to consumers. Default 250ms */
  flushIntervalMs?: number;
  /** Enable/disable the subscription */
  enabled?: boolean;
  /** Callback for channel connection status changes */
  onStatusChange?: (status: string) => void;
  /** Keys that bypass the flush buffer and trigger immediate onUpdate */
  priorityKeys?: string[];
  /** Called when a FORCE_POLL broadcast is received (e.g. from zabbix-webhook) */
  onForcePoll?: () => void;
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
  onStatusChange,
  priorityKeys = [],
  onForcePoll,
}: UseDashboardRealtimeOptions) {
  const cacheRef = useRef<Map<string, TelemetryCacheEntry>>(new Map());
  const dirtyRef = useRef(false);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const priorityKeysRef = useRef(priorityKeys);
  priorityKeysRef.current = priorityKeys;
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const onForcePollRef = useRef(onForcePoll);
  onForcePollRef.current = onForcePoll;

  // Handle incoming broadcast
  const handleBroadcast = useCallback((payload: TelemetryBroadcast) => {
    const cache = cacheRef.current;
    const existing = cache.get(payload.key);

    // Drop older timestamps (backend guarantees monotonic per key)
    if (existing && existing.ts >= payload.ts) return;

    const now = Date.now();
    const originTs = payload.origin_ts;
    const reactorTs = payload.reactor_ts;
    const latencyMs = originTs ? now - originTs : undefined;

    // Production perf alert: log if Time-to-Glass exceeds 1500ms
    if (latencyMs !== undefined && latencyMs > 1500) {
      console.warn(`[FlowPulse] HIGH LATENCY: ${payload.key} Time-to-Glass=${latencyMs}ms (origin→reactor=${reactorTs && originTs ? reactorTs - originTs : '?'}ms, reactor→browser=${reactorTs ? now - reactorTs : '?'}ms)`);
    }

    cache.set(payload.key, {
      key: payload.key,
      type: payload.type,
      data: payload.data,
      ts: payload.ts,
      v: payload.v ?? 1,
      receivedAt: now,
      latencyMs,
      originTs,
      reactorTs,
    });

    // Emit latency event for admin monitor widget
    if (latencyMs !== undefined) {
      try {
        window.dispatchEvent(new CustomEvent("flowpulse:latency", {
          detail: {
            key: payload.key,
            timeToGlassMs: latencyMs,
            originToReactorMs: originTs && reactorTs ? reactorTs - originTs : null,
            reactorToBrowserMs: reactorTs ? now - reactorTs : null,
            receivedAt: now,
          },
        }));
      } catch { /* ignore */ }
    }

    // Instant flush for priority keys (bypass buffer)
    if (priorityKeysRef.current.some((pk) => payload.key === pk || payload.key.includes(pk))) {
      onUpdateRef.current(new Map(cache));
    } else {
      dirtyRef.current = true;
    }
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
      .on("broadcast", { event: "FORCE_POLL" }, () => {
        console.log("[FlowPulse] FORCE_POLL received — triggering immediate re-poll");
        onForcePollRef.current?.();
      })
      .subscribe((status) => {
        onStatusChangeRef.current?.(status);
      });

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
