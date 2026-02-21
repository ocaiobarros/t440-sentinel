import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { HostStatus, FlowMapHost } from "@/hooks/useFlowMaps";

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
 * Implements:
 *  - BroadcastChannel leader election (only one tab polls)
 *  - document.hidden pause (no polling when tab is hidden)
 *  - Abort on unmount
 */
export function useFlowMapStatus({
  mapId,
  hosts,
  connectionId,
  refreshInterval,
  enabled = true,
}: UseFlowMapStatusOptions) {
  const [statusMap, setStatusMap] = useState<Record<string, HostStatus>>({});
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

  const canPoll = enabled && !!mapId && !!connectionId && hosts.length > 0;

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
        const hash = JSON.stringify(hostsData);
        if (hash !== prevStatusRef.current) {
          prevStatusRef.current = hash;
          setStatusMap(hostsData);
        }
      }

      // Broadcast data to passive tabs
      try {
        channelRef.current?.postMessage({ type: "status-data", hosts: hostsData });
      } catch { /* channel may be closed */ }

      setError(null);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      console.error("[FlowMapStatus] poll error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [mapId, connectionId]);

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

  // ─── BroadcastChannel leader election ───
  useEffect(() => {
    if (!canPoll) return;

    let bc: BroadcastChannel;
    try {
      bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    } catch {
      // BroadcastChannel not supported → this tab is always leader
      isLeaderRef.current = true;
      return;
    }
    channelRef.current = bc;

    const tabId = tabIdRef.current;

    bc.onmessage = (event) => {
      const msg = event.data;

      if (msg.type === "leader-heartbeat" && msg.tabId !== tabId) {
        // Another tab is leader
        lastLeaderHeartbeatRef.current = Date.now();
        if (isLeaderRef.current) {
          // Conflict: lower tabId wins
          if (msg.tabId < tabId) {
            isLeaderRef.current = false;
            stopPolling();
            console.log("[FlowMapStatus] yielded leadership to", msg.tabId);
          }
        }
      }

      if (msg.type === "leader-claim" && msg.tabId !== tabId) {
        if (isLeaderRef.current) {
          // Defend leadership
          bc.postMessage({ type: "leader-heartbeat", tabId });
        }
      }

      if (msg.type === "status-data" && !isLeaderRef.current && msg.hosts) {
        // Passive tab receives data from leader
        const hash = JSON.stringify(msg.hosts);
        if (hash !== prevStatusRef.current) {
          prevStatusRef.current = hash;
          setStatusMap(msg.hosts);
        }
      }
    };

    // Attempt to claim leadership
    bc.postMessage({ type: "leader-claim", tabId });

    // Wait briefly for an existing leader to respond
    const claimTimeout = setTimeout(() => {
      const timeSinceHeartbeat = Date.now() - lastLeaderHeartbeatRef.current;
      if (timeSinceHeartbeat > LEADER_TIMEOUT_MS || lastLeaderHeartbeatRef.current === 0) {
        isLeaderRef.current = true;
        console.log("[FlowMapStatus] became leader:", tabId);
        startPolling();
      }
    }, 500);

    // Heartbeat interval (leader broadcasts, passive checks for leader death)
    const heartbeatInterval = setInterval(() => {
      if (isLeaderRef.current) {
        bc.postMessage({ type: "leader-heartbeat", tabId });
      } else {
        const elapsed = Date.now() - lastLeaderHeartbeatRef.current;
        if (elapsed > LEADER_TIMEOUT_MS && lastLeaderHeartbeatRef.current > 0) {
          // Leader died → claim leadership
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
  }, [canPoll, startPolling, stopPolling]);

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

  return { statusMap, loading, error, refetch: fetchStatus };
}
