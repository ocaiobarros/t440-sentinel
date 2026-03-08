import { useEffect, useRef, useState, useCallback } from "react";
import { Activity, Database, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface LatencySnapshot {
  key: string;
  timeToGlassMs: number;
  originToReactorMs: number | null;
  reactorToBrowserMs: number | null;
  receivedAt: number;
}

interface ReactorHealth {
  storeBackend: "upstash" | "memory" | "unknown";
  retryCount: number;
  lastChecked: number;
}

export default function LatencyMonitorWidget() {
  const [snapshots, setSnapshots] = useState<LatencySnapshot[]>([]);
  const [health, setHealth] = useState<ReactorHealth>({
    storeBackend: "unknown",
    retryCount: 0,
    lastChecked: 0,
  });
  const [channelStatus, setChannelStatus] = useState<string>("disconnected");
  const maxSnapshots = 50;
  const snapshotsRef = useRef<LatencySnapshot[]>([]);

  // Subscribe to a global telemetry metrics channel
  useEffect(() => {
    const channel = supabase
      .channel("telemetry:metrics")
      .on("broadcast", { event: "LATENCY_SAMPLE" }, (msg) => {
        if (!msg.payload) return;
        const p = msg.payload as {
          key: string;
          origin_ts?: number;
          reactor_ts?: number;
          ts: number;
        };

        const now = Date.now();
        const originTs = p.origin_ts;
        const reactorTs = p.reactor_ts;
        const timeToGlassMs = originTs ? now - originTs : now - p.ts;
        const originToReactorMs = originTs && reactorTs ? reactorTs - originTs : null;
        const reactorToBrowserMs = reactorTs ? now - reactorTs : null;

        const snap: LatencySnapshot = {
          key: p.key,
          timeToGlassMs,
          originToReactorMs,
          reactorToBrowserMs,
          receivedAt: now,
        };

        snapshotsRef.current = [snap, ...snapshotsRef.current].slice(0, maxSnapshots);
        setSnapshots([...snapshotsRef.current]);
      })
      .on("broadcast", { event: "REACTOR_HEALTH" }, (msg) => {
        if (!msg.payload) return;
        const p = msg.payload as {
          store_backend?: string;
          retry_count?: number;
        };
        setHealth({
          storeBackend: (p.store_backend as "upstash" | "memory") ?? "unknown",
          retryCount: p.retry_count ?? 0,
          lastChecked: Date.now(),
        });
      })
      .subscribe((status) => {
        setChannelStatus(status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Also listen to all dashboard channels for live data
  useEffect(() => {
    const handler = (event: CustomEvent<LatencySnapshot>) => {
      snapshotsRef.current = [event.detail, ...snapshotsRef.current].slice(0, maxSnapshots);
      setSnapshots([...snapshotsRef.current]);
    };
    window.addEventListener("flowpulse:latency" as any, handler as any);
    return () => window.removeEventListener("flowpulse:latency" as any, handler as any);
  }, []);

  // Compute averages
  const recentSnapshots = snapshots.filter((s) => Date.now() - s.receivedAt < 60_000);
  const avgTimeToGlass =
    recentSnapshots.length > 0
      ? Math.round(recentSnapshots.reduce((a, b) => a + b.timeToGlassMs, 0) / recentSnapshots.length)
      : 0;
  const avgOriginToReactor =
    recentSnapshots.filter((s) => s.originToReactorMs !== null).length > 0
      ? Math.round(
          recentSnapshots
            .filter((s) => s.originToReactorMs !== null)
            .reduce((a, b) => a + (b.originToReactorMs ?? 0), 0) /
            recentSnapshots.filter((s) => s.originToReactorMs !== null).length,
        )
      : null;

  const isRedisConnected = health.storeBackend === "upstash";
  const latencyColor =
    avgTimeToGlass === 0 ? "text-muted-foreground" : avgTimeToGlass < 500 ? "text-green-400" : avgTimeToGlass < 1500 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Activity className="w-5 h-5 text-primary" />
        <h3 className="text-base font-bold font-[Orbitron] tracking-wide text-foreground">
          TELEMETRIA EM TEMPO REAL
        </h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {recentSnapshots.length} amostras (60s)
        </span>
      </div>

      {/* Main metrics row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Time-to-Glass */}
        <div className="rounded-lg border border-border bg-background/50 p-4 text-center">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
            Zabbix Sync (Time-to-Glass)
          </div>
          <div className={`text-3xl font-bold font-mono ${latencyColor}`}>
            {avgTimeToGlass > 0 ? `${avgTimeToGlass}ms` : "—"}
          </div>
          {avgOriginToReactor !== null && (
            <div className="text-xs text-muted-foreground mt-1">
              origin→reactor: {avgOriginToReactor}ms
            </div>
          )}
        </div>

        {/* Upstash Status */}
        <div className="rounded-lg border border-border bg-background/50 p-4 text-center">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
            Upstash Status
          </div>
          <div className="flex items-center justify-center gap-2">
            {isRedisConnected ? (
              <>
                <Database className="w-5 h-5 text-green-400" />
                <span className="text-lg font-bold text-green-400">Connected</span>
              </>
            ) : health.storeBackend === "memory" ? (
              <>
                <WifiOff className="w-5 h-5 text-yellow-400" />
                <span className="text-lg font-bold text-yellow-400">Fallback (Memory)</span>
              </>
            ) : (
              <>
                <Wifi className="w-5 h-5 text-muted-foreground" />
                <span className="text-lg font-bold text-muted-foreground">Awaiting Data</span>
              </>
            )}
          </div>
        </div>

        {/* Retry Rate */}
        <div className="rounded-lg border border-border bg-background/50 p-4 text-center">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
            Retry Rate
          </div>
          <div className="flex items-center justify-center gap-2">
            <RefreshCw className={`w-5 h-5 ${health.retryCount > 0 ? "text-yellow-400" : "text-green-400"}`} />
            <span className={`text-3xl font-bold font-mono ${health.retryCount > 0 ? "text-yellow-400" : "text-green-400"}`}>
              {health.retryCount}
            </span>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-3">
        <span>
          Canal Realtime:{" "}
          <span className={channelStatus === "SUBSCRIBED" ? "text-green-400" : "text-yellow-400"}>
            {channelStatus}
          </span>
        </span>
        <span className="font-mono">
          {avgTimeToGlass > 0
            ? `Zabbix Sync: ${avgTimeToGlass}ms | Upstash: ${isRedisConnected ? "Connected" : "Fallback"} | Retry: ${health.retryCount}`
            : "Aguardando dados de telemetria…"}
        </span>
      </div>

      {/* Recent samples table */}
      {recentSnapshots.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Últimas amostras ({recentSnapshots.length})
          </summary>
          <div className="mt-2 max-h-48 overflow-auto rounded border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 sticky top-0">
                <tr>
                  <th className="px-2 py-1 text-left text-muted-foreground">Key</th>
                  <th className="px-2 py-1 text-right text-muted-foreground">TTG</th>
                  <th className="px-2 py-1 text-right text-muted-foreground">O→R</th>
                  <th className="px-2 py-1 text-right text-muted-foreground">R→B</th>
                </tr>
              </thead>
              <tbody>
                {recentSnapshots.slice(0, 20).map((s, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="px-2 py-1 font-mono truncate max-w-[200px]">{s.key}</td>
                    <td className={`px-2 py-1 text-right font-mono ${s.timeToGlassMs < 500 ? "text-green-400" : s.timeToGlassMs < 1500 ? "text-yellow-400" : "text-red-400"}`}>
                      {s.timeToGlassMs}ms
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                      {s.originToReactorMs !== null ? `${s.originToReactorMs}ms` : "—"}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                      {s.reactorToBrowserMs !== null ? `${s.reactorToBrowserMs}ms` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
