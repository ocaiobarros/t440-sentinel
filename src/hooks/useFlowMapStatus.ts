import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { HostStatus, FlowMapHost } from "@/hooks/useFlowMaps";

export interface LinkEvent {
  id: string;
  link_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
}

export interface LinkTrafficSide {
  in_bps: number | null;
  out_bps: number | null;
  utilization: number | null;
  errors_in: number | null;
  errors_out: number | null;
}

export interface LinkTraffic {
  sideA: LinkTrafficSide;
  sideB: LinkTrafficSide;
}

/** Effective status from the propagation engine RPC */
export interface EffectiveHostStatus {
  host_id: string;
  effective_status: string; // "UP" | "DOWN" | "ISOLATED" | "DEGRADED" | "UNKNOWN"
  is_root_cause: boolean;
  depth: number;
}

const BROADCAST_CHANNEL_NAME = "flowmap-status-poll";
const LEADER_HEARTBEAT_MS = 5_000;
const LEADER_TIMEOUT_MS = 8_000;

interface UseFlowMapStatusOptions {
  mapId: string | undefined;
  hosts: FlowMapHost[];
  connectionId: string | undefined;
  refreshInterval: number; // seconds
  enabled?: boolean;
}

/**
 * Polls the flowmap-status edge function for real Zabbix host status.
 * After each poll, calls the get_map_effective_status RPC to compute
 * propagation (ISOLATED nodes). Also subscribes to Realtime changes
 * on flow_map_hosts to trigger recomputation with debounce.
 */
export function useFlowMapStatus({
  mapId,
  hosts,
  connectionId,
  refreshInterval,
  enabled = true,
}: UseFlowMapStatusOptions) {
  const [statusMap, setStatusMap] = useState<Record<string, HostStatus>>({});
  const [impactedLinks, setImpactedLinks] = useState<string[]>([]);
  const [isolatedNodes, setIsolatedNodes] = useState<string[]>([]);
  const [linkStatuses, setLinkStatuses] = useState<Record<string, { status: string; originHost: string; destHost: string }>>({});
  const [linkEvents, setLinkEvents] = useState<LinkEvent[]>([]);
  const [linkTraffic, setLinkTraffic] = useState<Record<string, LinkTraffic>>({});
  const [effectiveStatuses, setEffectiveStatuses] = useState<EffectiveHostStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStatusRef = useRef<string>("");

  // Leader election state
  const isLeaderRef = useRef(false);
  const lastLeaderHeartbeatRef = useRef(0);
  const tabIdRef = useRef(`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Debounce timer for realtime-triggered RPC calls
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canPoll = enabled && !!mapId && !!connectionId && hosts.length > 0;

  // ─── Propagation Engine RPC ───
  const fetchEffectiveStatus = useCallback(async () => {
    if (!mapId) return;
    try {
      const { data, error: rpcErr } = await supabase.rpc("get_map_effective_status", {
        p_map_id: mapId,
      });
      if (rpcErr) {
        console.warn("[FlowMapStatus] RPC error:", rpcErr.message);
        return;
      }
      if (data) {
        setEffectiveStatuses(data as EffectiveHostStatus[]);
        // Derive isolated nodes from effective status
        const isolated = (data as EffectiveHostStatus[])
          .filter((h) => h.effective_status === "ISOLATED")
          .map((h) => h.host_id);
        setIsolatedNodes(isolated);
      }
    } catch (err: any) {
      console.warn("[FlowMapStatus] RPC fetch error:", err.message);
    }
  }, [mapId]);

  const fetchStatus = useCallback(async () => {
    if (!mapId || !connectionId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flowmap-status?t=${Date.now()}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            "Cache-Control": "no-cache, no-store",
          },
          body: JSON.stringify({ map_id: mapId, connection_id: connectionId }),
          signal: controller.signal,
        },
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const payload = await res.json();
      const hostsData = payload.hosts as Record<string, HostStatus> | undefined;

      if (hostsData) {
        const hash = JSON.stringify(payload);
        if (hash !== prevStatusRef.current) {
          prevStatusRef.current = hash;
          setStatusMap(hostsData);
          setImpactedLinks(payload.impactedLinks ?? []);
          setLinkStatuses(payload.linkStatuses ?? {});
          setLinkEvents(payload.linkEvents ?? []);
          setLinkTraffic(payload.linkTraffic ?? {});
        }
      }

      // After poll, fetch effective status from propagation engine
      await fetchEffectiveStatus();

      // Broadcast data to passive tabs
      try {
        channelRef.current?.postMessage({ type: "status-data", payload });
      } catch { /* channel may be closed */ }

      setError(null);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      console.error("[FlowMapStatus] poll error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [mapId, connectionId, fetchEffectiveStatus]);

  // ─── Polling control: start/stop based on leadership + visibility ───
  const startPolling = useCallback(() => {
    if (intervalRef.current) return;
    if (document.hidden) return;
    if (!isLeaderRef.current) return;

    fetchStatus();
    const intervalMs = Math.max(10, Math.min(300, refreshInterval)) * 1000;
    intervalRef.current = setInterval(fetchStatus, intervalMs);
    console.log(`[FlowMapStatus] polling started (${intervalMs}ms)`);
  }, [fetchStatus, refreshInterval]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      console.log("[FlowMapStatus] polling stopped");
    }
    abortRef.current?.abort();
  }, []);

  // ─── Supabase Realtime: postgres_changes on flow_map_hosts ───
  useEffect(() => {
    if (!mapId || !enabled) return;

    const channel = supabase
      .channel(`flowmap-hosts-rt-${mapId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "flow_map_hosts",
          filter: `map_id=eq.${mapId}`,
        },
        () => {
          // Debounce: avoid rapid recompute on burst updates
          if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
          realtimeDebounceRef.current = setTimeout(() => {
            console.log("[FlowMapStatus] Realtime trigger → recompute effective status");
            fetchEffectiveStatus();
          }, 500);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    };
  }, [mapId, enabled, fetchEffectiveStatus]);

  // ─── BroadcastChannel leader election ───
  useEffect(() => {
    if (!canPoll) return;

    let bc: BroadcastChannel;
    try {
      bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    } catch {
      isLeaderRef.current = true;
      return;
    }
    channelRef.current = bc;

    const tabId = tabIdRef.current;

    bc.onmessage = (event) => {
      const msg = event.data;

      if (msg.type === "leader-heartbeat" && msg.tabId !== tabId) {
        lastLeaderHeartbeatRef.current = Date.now();
        if (isLeaderRef.current) {
          if (msg.tabId < tabId) {
            isLeaderRef.current = false;
            stopPolling();
            console.log("[FlowMapStatus] yielded leadership to", msg.tabId);
          }
        }
      }

      if (msg.type === "leader-claim" && msg.tabId !== tabId) {
        if (isLeaderRef.current) {
          bc.postMessage({ type: "leader-heartbeat", tabId });
        }
      }

      if (msg.type === "status-data" && !isLeaderRef.current && msg.payload) {
        const hash = JSON.stringify(msg.payload);
        if (hash !== prevStatusRef.current) {
          prevStatusRef.current = hash;
          setStatusMap(msg.payload.hosts ?? {});
          setImpactedLinks(msg.payload.impactedLinks ?? []);
          setLinkStatuses(msg.payload.linkStatuses ?? {});
          setLinkEvents(msg.payload.linkEvents ?? []);
          setLinkTraffic(msg.payload.linkTraffic ?? {});
        }
        // Passive tabs also fetch effective status
        fetchEffectiveStatus();
      }
    };

    bc.postMessage({ type: "leader-claim", tabId });

    const claimTimeout = setTimeout(() => {
      const timeSinceHeartbeat = Date.now() - lastLeaderHeartbeatRef.current;
      if (timeSinceHeartbeat > LEADER_TIMEOUT_MS || lastLeaderHeartbeatRef.current === 0) {
        isLeaderRef.current = true;
        console.log("[FlowMapStatus] became leader:", tabId);
        startPolling();
      }
    }, 500);

    const heartbeatInterval = setInterval(() => {
      if (isLeaderRef.current) {
        bc.postMessage({ type: "leader-heartbeat", tabId });
      } else {
        const elapsed = Date.now() - lastLeaderHeartbeatRef.current;
        if (elapsed > LEADER_TIMEOUT_MS && lastLeaderHeartbeatRef.current > 0) {
          isLeaderRef.current = true;
          console.log("[FlowMapStatus] leader died, taking over:", tabId);
          startPolling();
        }
      }
    }, LEADER_HEARTBEAT_MS);

    return () => {
      clearTimeout(claimTimeout);
      clearInterval(heartbeatInterval);
      stopPolling();
      try { bc.close(); } catch { /* ignore */ }
      channelRef.current = null;
    };
  }, [canPoll, startPolling, stopPolling, fetchEffectiveStatus]);

  // ─── Visibility change: pause/resume polling ───
  useEffect(() => {
    if (!canPoll) return;

    const handler = () => {
      if (document.hidden) {
        stopPolling();
      } else if (isLeaderRef.current) {
        startPolling();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [canPoll, startPolling, stopPolling]);

  return {
    statusMap,
    impactedLinks,
    isolatedNodes,
    linkStatuses,
    linkEvents,
    linkTraffic,
    effectiveStatuses,
    loading,
    error,
    refetch: fetchStatus,
    refetchEffective: fetchEffectiveStatus,
  };
}
