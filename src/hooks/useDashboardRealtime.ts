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
  /** True if this entry is still in the debounce stabilization window */
  _debouncing?: boolean;
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

/* ─── Visual Debounce Engine ────────────────────────────────────────
 * Status widgets (stat type with status-like values) get a 1.5s
 * stabilization window: the visual update only fires once the value
 * hasn't changed for DEBOUNCE_MS. This prevents "flicker" from
 * flapping signals (e.g. link toggling UP/DOWN rapidly).
 *
 * Critical-safety keys (fire_alarm, security_breach, etc.) and
 * priority keys ALWAYS bypass the debounce for instant rendering.
 *
 * Non-status widget types (timeseries, gauge, table, text) are
 * never debounced — they show the latest value immediately.
 * ─────────────────────────────────────────────────────────────────── */
const DEBOUNCE_MS = 1500;

/** Widget types that should be debounced for visual stability */
const DEBOUNCE_TYPES = new Set<string>(["stat"]);

/** Keys that ALWAYS bypass debounce (life-safety / security) */
const INSTANT_KEYS = [
  "fire_alarm", "security_breach", "intrusion",
  "smoke_detector", "gas_leak", "emergency",
];

function isStatusLikeValue(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  const val = d.value;
  if (typeof val === "string") {
    const v = val.toUpperCase();
    return ["UP", "DOWN", "OK", "PROBLEM", "ON", "OFF", "0", "1", "DEGRADED", "CRITICAL", "UNKNOWN"].includes(v);
  }
  if (typeof val === "number") return val === 0 || val === 1;
  return false;
}

function isInstantKey(key: string): boolean {
  return INSTANT_KEYS.some((ik) => key.includes(ik));
}

/* ─── Kiosk Watchdog ─────────────────────────────────────────────────
 * If no signal (broadcast, FORCE_POLL, or status change) is received
 * for WATCHDOG_TIMEOUT_MS, force a full page reload. This prevents
 * NOC kiosk screens from staying frozen due to memory leaks or
 * expired sessions.
 * ─────────────────────────────────────────────────────────────────── */
const WATCHDOG_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Hook: 1 Realtime channel per dashboard.
 * - Receives DATA_UPDATE broadcasts from the Reactor
 * - Validates HMAC signature presence (integrity gate)
 * - Maintains a per-key cache with ts-based dedup (drop older — monotonic guaranteed by backend)
 * - Visual debounce for status widgets (1.5s stabilization)
 * - Throttled flush to avoid render storms
 * - Auto-reconciliation on WebSocket reconnect
 * - Kiosk Watchdog: auto-reload after 5min of silence
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

  /* ─── Debounce timers per key ───────────────────── */
  const debounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  /** Pending debounce entries — stored here until stabilization completes */
  const debouncePendingRef = useRef<Map<string, TelemetryCacheEntry>>(new Map());

  /* ─── Kiosk Watchdog timer ─────────────────────── */
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetWatchdog = useCallback(() => {
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = setTimeout(() => {
      console.error("[FlowPulse] WATCHDOG: No signal for 5 minutes — forcing page reload");
      try {
        window.dispatchEvent(new CustomEvent("flowpulse:watchdog-reload", {
          detail: { reason: "no_signal_5min", at: Date.now() },
        }));
      } catch { /* ignore */ }
      // Small delay to let the event propagate
      setTimeout(() => window.location.reload(), 500);
    }, WATCHDOG_TIMEOUT_MS);
  }, []);

  // Start watchdog when enabled
  useEffect(() => {
    if (!enabled || !dashboardId) return;
    resetWatchdog();
    return () => {
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
    };
  }, [enabled, dashboardId, resetWatchdog]);

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of debounceTimersRef.current.values()) {
        clearTimeout(timer);
      }
      debounceTimersRef.current.clear();
      debouncePendingRef.current.clear();
    };
  }, []);

  /** Commit a debounced entry to the real cache and trigger flush */
  const commitDebounced = useCallback((key: string) => {
    const entry = debouncePendingRef.current.get(key);
    if (!entry) return;
    debouncePendingRef.current.delete(key);
    debounceTimersRef.current.delete(key);

    const cache = cacheRef.current;
    const existing = cache.get(key);
    // Final monotonicity check — another newer value may have arrived
    if (existing && existing.ts >= entry.ts) return;

    cache.set(key, { ...entry, _debouncing: undefined });
    dirtyRef.current = true;
  }, []);

  // Handle incoming broadcast
  const handleBroadcast = useCallback((payload: TelemetryBroadcast & { _sig?: string; clock_drift_ms?: number }) => {
    // ── Reset Kiosk Watchdog on any signal ──
    resetWatchdog();

    // ── HMAC Integrity Gate: reject unsigned or malformed broadcasts ──
    if (payload._sig === undefined || payload._sig === null) {
      rejectedUnsignedRef.current++;
      if (rejectedUnsignedRef.current <= 5) {
        console.warn(`[FlowPulse] REJECTED broadcast for key=${payload.key}: _sig MISSING from payload (Reactor may be running old version without HMAC signing)`);
      }
      return;
    }
    if (!isValidSignature(payload._sig)) {
      rejectedUnsignedRef.current++;
      if (rejectedUnsignedRef.current <= 5) {
        console.warn(`[FlowPulse] REJECTED broadcast for key=${payload.key}: _sig MALFORMED (got "${String(payload._sig).substring(0, 16)}…", expected 64-char hex)`);
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
    let latencyMs = originTs ? now - originTs : undefined;
    if (latencyMs !== undefined && clockDriftMs !== null) {
      latencyMs = latencyMs - clockDriftMs;
      if (latencyMs < 0) latencyMs = 0;
    }

    // Production perf alert: log if Time-to-Glass exceeds 1500ms
    if (latencyMs !== undefined && latencyMs > 1500) {
      console.warn(`[FlowPulse] HIGH LATENCY: ${payload.key} Time-to-Glass=${latencyMs}ms (drift-corrected=${clockDriftMs}ms, origin→reactor=${reactorTs && originTs ? reactorTs - originTs : '?'}ms, reactor→browser=${reactorTs ? now - reactorTs : '?'}ms)`);
    }

    // ── Clock Drift Health Alert ──
    if (clockDriftMs !== null && Math.abs(clockDriftMs) > 5000) {
      try {
        window.dispatchEvent(new CustomEvent("flowpulse:clock-drift", {
          detail: { driftMs: clockDriftMs, detectedAt: now, key: payload.key },
        }));
      } catch { /* ignore */ }
    }

    const newEntry: TelemetryCacheEntry = {
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
    };

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

    // ── Determine bypass vs debounce ──
    const isPriorityKey = priorityKeysRef.current.some((pk) => payload.key === pk || payload.key.includes(pk));
    const isSafetyInstant = isInstantKey(payload.key);

    const isCriticalSeverity = (() => {
      const d = payload.data as unknown as Record<string, unknown> | undefined;
      if (!d) return false;
      const sev = d?.severity ?? d?.trigger_severity;
      if (typeof sev === "number") return sev >= 4;
      if (typeof sev === "string") {
        const sevLower = sev.toLowerCase();
        return sevLower === "high" || sevLower === "disaster" || parseInt(sev) >= 4;
      }
      const status = d?.status ?? d?.value;
      if (payload.type === "stat" && (status === "PROBLEM" || status === "1")) return true;
      return false;
    })();

    const bypassDebounce = isPriorityKey || isSafetyInstant || isCriticalSeverity;

    // ── Visual Debounce for status-like stat widgets ──
    const shouldDebounce = !bypassDebounce
      && DEBOUNCE_TYPES.has(payload.type)
      && isStatusLikeValue(payload.data);

    if (shouldDebounce) {
      // Cancel any existing debounce timer for this key
      const existingTimer = debounceTimersRef.current.get(payload.key);
      if (existingTimer) clearTimeout(existingTimer);

      // Store pending entry
      debouncePendingRef.current.set(payload.key, newEntry);

      // Start stabilization timer
      const timer = setTimeout(() => {
        commitDebounced(payload.key);
      }, DEBOUNCE_MS);
      debounceTimersRef.current.set(payload.key, timer);

      return; // Don't write to cache yet
    }

    // ── Immediate path (no debounce) ──
    // If there's a pending debounce for this key, cancel it — new value supersedes
    const pendingTimer = debounceTimersRef.current.get(payload.key);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      debounceTimersRef.current.delete(payload.key);
      debouncePendingRef.current.delete(payload.key);
    }

    cache.set(payload.key, newEntry);

    if (bypassDebounce) {
      if (isCriticalSeverity) {
        console.log(`[FlowPulse] CRITICAL ALERT bypass: ${payload.key} (instant render)`);
      }
      if (isSafetyInstant) {
        console.log(`[FlowPulse] SAFETY KEY bypass: ${payload.key} (instant render)`);
      }
      onUpdateRef.current(new Map(cache));
    } else {
      dirtyRef.current = true;
    }
  }, [resetWatchdog, commitDebounced]);

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
        resetWatchdog(); // Signal received — reset watchdog
        console.log("[FlowPulse] FORCE_POLL received — triggering immediate re-poll");
        onForcePollRef.current?.();
      })
      .subscribe((status) => {
        resetWatchdog(); // Any status change = signal alive
        onStatusChangeRef.current?.(status);

        if (status === "SUBSCRIBED") {
          if (hasSubscribedOnceRef.current) {
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
  }, [enabled, dashboardId, handleBroadcast, resetWatchdog]);

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
    // Also clear all debounce timers
    for (const timer of debounceTimersRef.current.values()) {
      clearTimeout(timer);
    }
    debounceTimersRef.current.clear();
    debouncePendingRef.current.clear();
    dirtyRef.current = true;
  }, []);

  return { seedCache, getKey, clearCache };
}
