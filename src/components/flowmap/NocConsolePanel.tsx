import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ArrowDown, ArrowUp, Clock, Radio, ShieldAlert, Activity, ChevronDown, ChevronUp, Locate } from "lucide-react";
import type { FlowMapHost, FlowMapLink, HostStatus } from "@/hooks/useFlowMaps";

/* ─── Types ─── */
interface EventEntry {
  id: string;
  hostName: string;
  hostId: string;
  zabbixHostId: string;
  previousStatus: string;
  newStatus: string;
  timestamp: number;
  isCritical: boolean;
  latency?: number;
}

interface NocConsolePanelProps {
  hosts: FlowMapHost[];
  links: FlowMapLink[];
  statusMap: Record<string, HostStatus>;
  impactedLinks: string[];
  isolatedNodes: string[];
  onFocusHost?: (host: FlowMapHost) => void;
}

/* ─── Helpers ─── */
function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "agora";
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

function statusColor(s: string): string {
  if (s === "DOWN") return "text-neon-red";
  if (s === "DEGRADED") return "text-neon-amber";
  if (s === "UP") return "text-neon-green";
  return "text-muted-foreground";
}

function statusBg(s: string): string {
  if (s === "DOWN") return "bg-neon-red/10 border-neon-red/30";
  if (s === "DEGRADED") return "bg-neon-amber/10 border-neon-amber/30";
  if (s === "UP") return "bg-neon-green/10 border-neon-green/30";
  return "bg-muted/20 border-border/30";
}

function statusIcon(s: string) {
  if (s === "DOWN") return <ArrowDown className="w-3 h-3" />;
  if (s === "UP") return <ArrowUp className="w-3 h-3" />;
  return <AlertTriangle className="w-3 h-3" />;
}

/* ─── Component ─── */
export default function NocConsolePanel({
  hosts,
  links,
  statusMap,
  impactedLinks,
  isolatedNodes,
  onFocusHost,
}: NocConsolePanelProps) {
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [expanded, setExpanded] = useState(true);
  const prevStatusRef = useRef<Record<string, string>>({});
  const maxEvents = 50;

  // ─── Detect status transitions and generate events ───
  useEffect(() => {
    if (!hosts.length || !Object.keys(statusMap).length) return;

    const prev = prevStatusRef.current;
    const newEvents: EventEntry[] = [];

    for (const host of hosts) {
      const st = statusMap[host.zabbix_host_id];
      if (!st) continue;

      const currentStatus = st.status;
      const prevStatus = prev[host.zabbix_host_id];

      if (prevStatus && prevStatus !== currentStatus) {
        newEvents.push({
          id: `${host.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          hostName: host.host_name || host.zabbix_host_id,
          hostId: host.id,
          zabbixHostId: host.zabbix_host_id,
          previousStatus: prevStatus,
          newStatus: currentStatus,
          timestamp: Date.now(),
          isCritical: host.is_critical,
          latency: st.latency,
        });
      }

      prev[host.zabbix_host_id] = currentStatus;
    }

    if (newEvents.length > 0) {
      setEvents((old) => [...newEvents, ...old].slice(0, maxEvents));
    }
  }, [statusMap, hosts]);

  // ─── Summary counters ───
  const summary = useMemo(() => {
    let up = 0, down = 0, unknown = 0;
    for (const host of hosts) {
      const st = statusMap[host.zabbix_host_id]?.status;
      if (st === "UP") up++;
      else if (st === "DOWN") down++;
      else unknown++;
    }
    return { up, down, unknown, total: hosts.length };
  }, [hosts, statusMap]);

  const criticalDown = useMemo(() => {
    return hosts.filter(
      (h) => h.is_critical && statusMap[h.zabbix_host_id]?.status === "DOWN"
    );
  }, [hosts, statusMap]);

  // ─── Render ───
  return (
    <div className="w-full h-full flex flex-col bg-card/95 backdrop-blur-xl border-l border-border/30 overflow-hidden">
      {/* ── Status Bar ── */}
      <div className="p-3 border-b border-border/30 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[11px] font-bold tracking-widest text-foreground flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-neon-green" />
            CONSOLE NOC
          </h2>
          <div className="flex items-center gap-1">
            <span className="text-[8px] font-mono text-muted-foreground">
              {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>

        {/* Counters */}
        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded-md p-1.5 text-center bg-neon-green/5 border border-neon-green/20">
            <div className="text-sm font-display font-bold text-neon-green">{summary.up}</div>
            <div className="text-[8px] font-mono text-neon-green/70 uppercase">UP</div>
          </div>
          <div className={`rounded-md p-1.5 text-center border ${summary.down > 0 ? "bg-neon-red/10 border-neon-red/30" : "bg-muted/10 border-border/30"}`}>
            <div className={`text-sm font-display font-bold ${summary.down > 0 ? "text-neon-red" : "text-muted-foreground"}`}>{summary.down}</div>
            <div className={`text-[8px] font-mono uppercase ${summary.down > 0 ? "text-neon-red/70" : "text-muted-foreground/50"}`}>DOWN</div>
          </div>
          <div className="rounded-md p-1.5 text-center bg-muted/10 border border-border/30">
            <div className="text-sm font-display font-bold text-muted-foreground">{summary.unknown}</div>
            <div className="text-[8px] font-mono text-muted-foreground/50 uppercase">N/A</div>
          </div>
        </div>

        {/* Impacted links / Isolated nodes badges */}
        {(impactedLinks.length > 0 || isolatedNodes.length > 0) && (
          <div className="flex flex-wrap gap-1">
            {impactedLinks.length > 0 && (
              <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-neon-red/10 text-neon-red border border-neon-red/20 font-display">
                {impactedLinks.length} LINK{impactedLinks.length > 1 ? "S" : ""} IMPACTADO{impactedLinks.length > 1 ? "S" : ""}
              </span>
            )}
            {isolatedNodes.length > 0 && (
              <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-neon-amber/10 text-neon-amber border border-neon-amber/20 font-display">
                {isolatedNodes.length} NÓ{isolatedNodes.length > 1 ? "S" : ""} ISOLADO{isolatedNodes.length > 1 ? "S" : ""}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Critical Alerts ── */}
      <AnimatePresence>
        {criticalDown.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-neon-red/20 bg-neon-red/5 overflow-hidden"
          >
            <div className="p-2 space-y-1">
              <div className="flex items-center gap-1 text-[9px] font-display uppercase tracking-wider text-neon-red">
                <ShieldAlert className="w-3 h-3" />
                HOSTS CRÍTICOS DOWN
              </div>
              {criticalDown.map((h) => (
                <button
                  key={h.id}
                  onClick={() => onFocusHost?.(h)}
                  className="w-full flex items-center gap-1.5 p-1 rounded text-left hover:bg-neon-red/10 transition-colors group"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-neon-red pulse-red shrink-0" />
                  <span className="text-[10px] font-mono text-neon-red truncate flex-1">
                    {h.host_name || h.zabbix_host_id}
                  </span>
                  <Locate className="w-3 h-3 text-neon-red/50 group-hover:text-neon-red transition-colors shrink-0" />
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Event Timeline ── */}
      <div className="flex-1 flex flex-col min-h-0">
        <button
          onClick={() => setExpanded((p) => !p)}
          className="flex items-center justify-between p-2 border-b border-border/20 hover:bg-muted/10 transition-colors"
        >
          <span className="text-[9px] font-display uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Activity className="w-3 h-3" />
            TIMELINE ({events.length})
          </span>
          {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: "auto" }}
              exit={{ height: 0 }}
              className="flex-1 overflow-y-auto min-h-0"
              style={{ maxHeight: "100%" }}
            >
              {events.length === 0 ? (
                <div className="p-4 text-center">
                  <Clock className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-[10px] text-muted-foreground/50 font-mono">Aguardando transições...</p>
                </div>
              ) : (
                <div className="p-1.5 space-y-1">
                  {events.map((ev, i) => (
                    <motion.div
                      key={ev.id}
                      initial={i === 0 ? { opacity: 0, x: 10 } : false}
                      animate={{ opacity: 1, x: 0 }}
                      className={`flex items-start gap-1.5 p-1.5 rounded border text-[10px] ${statusBg(ev.newStatus)} cursor-pointer hover:brightness-110 transition-all`}
                      onClick={() => {
                        const host = hosts.find((h) => h.id === ev.hostId);
                        if (host) onFocusHost?.(host);
                      }}
                    >
                      {/* Status icon */}
                      <div className={`mt-0.5 shrink-0 ${statusColor(ev.newStatus)}`}>
                        {statusIcon(ev.newStatus)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-mono font-bold text-foreground truncate">
                            {ev.hostName}
                          </span>
                          {ev.isCritical && (
                            <AlertTriangle className="w-2.5 h-2.5 text-neon-red shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[9px] text-muted-foreground font-mono">
                          <span className={statusColor(ev.previousStatus)}>{ev.previousStatus}</span>
                          <span>→</span>
                          <span className={statusColor(ev.newStatus)}>{ev.newStatus}</span>
                          {ev.latency != null && (
                            <span className="text-neon-cyan ml-1">{ev.latency}ms</span>
                          )}
                        </div>
                      </div>

                      {/* Timestamp */}
                      <span className="text-[8px] font-mono text-muted-foreground/60 shrink-0 mt-0.5">
                        {timeAgo(ev.timestamp)}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
