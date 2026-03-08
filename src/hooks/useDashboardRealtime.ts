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
  /** Clock drift between Zabbix server and FlowPulse server in ms */
  clockDriftMs?: number;
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
  /** Called on reconnect so the consumer can re-seed from replay */
  onReconnect?: () => void;
}

/* ─── HMAC Signature Validation ─────────────────────────────────────
 * The Reactor signs every DATA_UPDATE broadcast with HMAC-SHA256.
 * Since the frontend cannot hold secrets, we perform a structural
 * validation: _sig must be present and be a 64-char hex string.
 * This blocks casual console injection attacks (channel.send() without sig).
 * For full cryptographic verification, use the /verify-sig endpoint.
 * ─────────────────────────────────────────────────────────────────── */
const HMAC_SIG_REGEX = /^[0-9a-f]{64}$/;

function isValidSignature(sig: unknown): boolean {
  return typeof sig === "string" && HMAC_SIG_REGEX.test(sig);
}

/**
 * Hook: 1 Realtime channel per dashboard.
 * - Receives DATA_UPDATE broadcasts from the Reactor
 * - Validates HMAC signature presence (integrity gate)
 * - Maintains a per-key cache with ts-based dedup (drop older — monotonic guaranteed by backend)
 * - Throttled flush to avoid render storms
 * - Auto-reconciliation on WebSocket reconnect
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
  onReconnect,
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
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;
  /** Track if we've had an initial SUBSCRIBED — subsequent ones are reconnects */
  const hasSubscribedOnceRef = useRef(false);
  /** Count of rejected unsigned broadcasts (for telemetry) */
  const rejectedUnsignedRef = useRef(0);

  // Handle incoming broadcast
  const handleBroadcast = useCallback((payload: TelemetryBroadcast & { _sig?: string; clock_drift_ms?: number }) => {
    // ── HMAC Integrity Gate: reject unsigned or malformed broadcasts ──
    if (!isValidSignature(payload._sig)) {
      rejectedUnsignedRef.current++;
      if (rejectedUnsignedRef.current <= 5) {
        console.warn(`[FlowPulse] REJECTED unsigned broadcast for key=${payload.key} (total rejected: ${rejectedUnsignedRef.current})`);
      }
      return;
    }

    const cache = cacheRef.current;
    const existing = cache.get(payload.key);

    // Drop older timestamps (backend guarantees monotonic per key)
    if (existing && existing.ts >= payload.ts) return;

    const now = Date.now();
    const originTs = payload.origin_ts;
    const reactorTs = payload.reactor_ts;
    const clockDriftMs = payload.clock_drift_ms ?? null;

    // ── Drift-corrected Time-to-Glass ──
    // If we know the clock drift, subtract it from latency so the measurement
    // reflects real processing time instead of clock difference between servers.
    let latencyMs = originTs ? now - originTs : undefined;
    if (latencyMs !== undefined && clockDriftMs !== null) {
      latencyMs = latencyMs - clockDriftMs;
      if (latencyMs < 0) latencyMs = 0; // clamp negative after correction
    }

    // Production perf alert: log if Time-to-Glass exceeds 1500ms
    if (latencyMs !== undefined && latencyMs > 1500) {
      console.warn(`[FlowPulse] HIGH LATENCY: ${payload.key} Time-to-Glass=${latencyMs}ms (drift-corrected=${clockDriftMs}ms, origin→reactor=${reactorTs && originTs ? reactorTs - originTs : '?'}ms, reactor→browser=${reactorTs ? now - reactorTs : '?'}ms)`);
    }

    // ── Clock Drift Health Alert ──
    if (clockDriftMs !== null && Math.abs(clockDriftMs) > 5000) {
      try {
        window.dispatchEvent(new CustomEvent("flowpulse:clock-drift", {
          detail: {
            driftMs: clockDriftMs,
            detectedAt: now,
            key: payload.key,
          },
        }));
      } catch { /* ignore */ }
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
      clockDriftMs: clockDriftMs ?? undefined,
    });

    // Emit latency event for admin monitor widget
    if (latencyMs !== undefined) {
      try {
        window.dispatchEvent(new CustomEvent("flowpulse:latency", {
          detail: {
            key: payload.key,
            timeToGlassMs: latencyMs,
            clockDriftMs,
            originToReactorMs: originTs && reactorTs ? reactorTs - originTs : null,
            reactorToBrowserMs: reactorTs ? now - reactorTs : null,
            receivedAt: now,
          },
        }));
      } catch { /* ignore */ }
    }

    // Instant flush for priority keys OR critical severity (bypass buffer)
    const isCriticalSeverity = (() => {
      const d = payload.data as unknown as Record<string, unknown> | undefined;
      if (!d) return false;
      const sev = d?.severity ?? d?.trigger_severity;
      if (typeof sev === "number") return sev >= 4;
      if (typeof sev === "string") {
        const sevLower = sev.toLowerCase();
        return sevLower === "high" || sevLower === "disaster" || parseInt(sev) >= 4;
      }
      // Check if type indicates a status/trigger update with critical data
      const status = d?.status ?? d?.value;
      if (payload.type === "stat" && (status === "PROBLEM" || status === "1")) return true;
      return false;
    })();

    const isPriorityKey = priorityKeysRef.current.some((pk) => payload.key === pk || payload.key.includes(pk));

    if (isPriorityKey || isCriticalSeverity) {
      if (isCriticalSeverity) {
        console.log(`[FlowPulse] CRITICAL ALERT bypass: ${payload.key} (instant render)`);
      }
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

    hasSubscribedOnceRef.current = false;

    const channelName = `dashboard:${dashboardId}`;
    const channel = supabase
      .channel(channelName)
      .on("broadcast", { event: "DATA_UPDATE" }, (msg) => {
        if (msg.payload) {
          handleBroadcast(msg.payload as TelemetryBroadcast & { _sig?: string });
        }
      })
      .on("broadcast", { event: "FORCE_POLL" }, () => {
        console.log("[FlowPulse] FORCE_POLL received — triggering immediate re-poll");
        onForcePollRef.current?.();
      })
      .subscribe((status) => {
        onStatusChangeRef.current?.(status);

        if (status === "SUBSCRIBED") {
          if (hasSubscribedOnceRef.current) {
            // ── AUTO-RECONCILIATION on reconnect ──
            // WebSocket reconnected after a drop — data may have been lost.
            // Trigger replay + force poll to reconcile state.
            console.log("[FlowPulse] WebSocket RECONNECTED — triggering auto-reconciliation");
            onReconnectRef.current?.();
            onForcePollRef.current?.();
          }
          hasSubscribedOnceRef.current = true;
        }
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
