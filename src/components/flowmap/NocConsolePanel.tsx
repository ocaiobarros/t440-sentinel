import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ArrowDown, ArrowUp, Clock, Radio, ShieldAlert, Activity, ChevronDown, ChevronUp, Locate, Link2, Eye, EyeOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { FlowMapHost, FlowMapLink, HostStatus } from "@/hooks/useFlowMaps";
import type { LinkEvent } from "@/hooks/useFlowMapStatus";

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
  linkStatuses: Record<string, { status: string; originHost: string; destHost: string }>;
  linkEvents: LinkEvent[];
  onFocusHost?: (host: FlowMapHost) => void;
  onCriticalDown?: (host: FlowMapHost) => void;
  warRoom?: boolean;
  hideAccessNetwork?: boolean;
  onHideAccessNetworkChange?: (v: boolean) => void;
}

/* ─── Helpers ─── */
function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "agora";
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

function durationStr(startedAt: string, endedAt?: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const diff = Math.max(0, Math.floor((end - start) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
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
  linkStatuses,
  linkEvents,
  onFocusHost,
  onCriticalDown,
  warRoom = false,
  hideAccessNetwork = false,
  onHideAccessNetworkChange,
}: NocConsolePanelProps) {
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"timeline" | "sla">("timeline");
  const prevStatusRef = useRef<Record<string, string>>({});
  const maxEvents = 50;

  // ─── Detect status transitions ───
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
      // Fire audio alert for critical hosts going DOWN
      for (const ev of newEvents) {
        if (ev.isCritical && ev.newStatus === "DOWN") {
          const host = hosts.find((h) => h.id === ev.hostId);
          if (host) onCriticalDown?.(host);
        }
      }
    }
  }, [statusMap, hosts, onCriticalDown]);

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
    return hosts.filter((h) => h.is_critical && statusMap[h.zabbix_host_id]?.status === "DOWN");
  }, [hosts, statusMap]);

  // ─── SLA data ───
  const activeEvents = useMemo(() => linkEvents.filter((e) => !e.ended_at), [linkEvents]);
  const closedEvents = useMemo(() => linkEvents.filter((e) => !!e.ended_at).slice(0, 20), [linkEvents]);

  const textScale = warRoom ? "text-base" : "text-[11px]";
  const counterScale = warRoom ? "text-2xl" : "text-sm";
  const badgeScale = warRoom ? "text-[10px]" : "text-[8px]";
  const eventScale = warRoom ? "text-sm" : "text-[10px]";

  return (
    <div className={`w-full h-full flex flex-col ${warRoom ? "bg-background/80 backdrop-blur-2xl" : "bg-card/95 backdrop-blur-xl border-l border-border/30"} overflow-hidden`}>
      {/* ── Status Bar ── */}
      <div className="p-3 border-b border-border/30 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className={`font-display ${warRoom ? "text-sm" : "text-[11px]"} font-bold tracking-widest text-foreground flex items-center gap-1.5`}>
            <Radio className={`${warRoom ? "w-5 h-5" : "w-3.5 h-3.5"} text-neon-green`} />
            CONSOLE NOC
          </h2>
          <span className="text-[8px] font-mono text-muted-foreground">
            {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        {/* Counters */}
        <div className="grid grid-cols-3 gap-1.5">
          <div className={`rounded-md ${warRoom ? "p-3" : "p-1.5"} text-center bg-neon-green/5 border border-neon-green/20`}>
            <div className={`${counterScale} font-display font-bold text-neon-green`}>{summary.up}</div>
            <div className={`${badgeScale} font-mono text-neon-green/70 uppercase`}>UP</div>
          </div>
          <div className={`rounded-md ${warRoom ? "p-3" : "p-1.5"} text-center border ${summary.down > 0 ? "bg-neon-red/10 border-neon-red/30" : "bg-muted/10 border-border/30"}`}>
            <div className={`${counterScale} font-display font-bold ${summary.down > 0 ? "text-neon-red" : "text-muted-foreground"}`}>{summary.down}</div>
            <div className={`${badgeScale} font-mono uppercase ${summary.down > 0 ? "text-neon-red/70" : "text-muted-foreground/50"}`}>DOWN</div>
          </div>
          <div className={`rounded-md ${warRoom ? "p-3" : "p-1.5"} text-center bg-muted/10 border border-border/30`}>
            <div className={`${counterScale} font-display font-bold text-muted-foreground`}>{summary.unknown}</div>
            <div className={`${badgeScale} font-mono text-muted-foreground/50 uppercase`}>N/A</div>
          </div>
        </div>

        {/* Badges */}
        {(impactedLinks.length > 0 || isolatedNodes.length > 0 || activeEvents.length > 0) ? (
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
            {activeEvents.length > 0 && (
              <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-neon-red/10 text-neon-red border border-neon-red/20 font-display animate-pulse">
                {activeEvents.length} EVENTO{activeEvents.length > 1 ? "S" : ""} SLA
              </span>
            )}
          </div>
        ) : summary.down === 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-neon-green/5 border border-neon-green/20">
            <span className="w-2 h-2 rounded-full bg-neon-green" />
            <span className={`${badgeScale} font-display uppercase tracking-wider text-neon-green`}>Network Stable</span>
          </div>
        )}

        {/* Backbone filter toggle */}
        {onHideAccessNetworkChange && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/10 border border-border/20">
            <Switch checked={hideAccessNetwork} onCheckedChange={onHideAccessNetworkChange} className="scale-75" />
            <span className={`${badgeScale} font-mono text-muted-foreground`}>
              {hideAccessNetwork ? <EyeOff className="w-3 h-3 inline mr-1" /> : <Eye className="w-3 h-3 inline mr-1" />}
              Ocultar rede de acesso
            </span>
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

      {/* ── Tabs ── */}
      <div className="flex border-b border-border/20">
        <button
          onClick={() => setActiveTab("timeline")}
          className={`flex-1 flex items-center justify-center gap-1 p-2 text-[9px] font-display uppercase tracking-wider transition-colors ${
            activeTab === "timeline" ? "text-neon-green border-b-2 border-neon-green" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Activity className="w-3 h-3" />
          Timeline ({events.length})
        </button>
        <button
          onClick={() => setActiveTab("sla")}
          className={`flex-1 flex items-center justify-center gap-1 p-2 text-[9px] font-display uppercase tracking-wider transition-colors ${
            activeTab === "sla" ? "text-neon-green border-b-2 border-neon-green" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Link2 className="w-3 h-3" />
          SLA ({activeEvents.length})
        </button>
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === "timeline" ? (
          /* ── Event Timeline ── */
          events.length === 0 ? (
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
                  <div className={`mt-0.5 shrink-0 ${statusColor(ev.newStatus)}`}>
                    {statusIcon(ev.newStatus)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-mono font-bold text-foreground truncate">{ev.hostName}</span>
                      {ev.isCritical && <AlertTriangle className="w-2.5 h-2.5 text-neon-red shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1 text-[9px] text-muted-foreground font-mono">
                      <span className={statusColor(ev.previousStatus)}>{ev.previousStatus}</span>
                      <span>→</span>
                      <span className={statusColor(ev.newStatus)}>{ev.newStatus}</span>
                      {ev.latency != null && <span className="text-neon-cyan ml-1">{ev.latency}ms</span>}
                    </div>
                  </div>
                  <span className="text-[8px] font-mono text-muted-foreground/60 shrink-0 mt-0.5">
                    {timeAgo(ev.timestamp)}
                  </span>
                </motion.div>
              ))}
            </div>
          )
        ) : (
          /* ── SLA Events Panel ── */
          <div className="p-1.5 space-y-2">
            {/* Active events */}
            {activeEvents.length > 0 && (
              <div className="space-y-1">
                <div className="text-[9px] font-display uppercase tracking-wider text-neon-red px-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-neon-red animate-pulse" />
                  EVENTOS ATIVOS
                </div>
                {activeEvents.map((ev) => {
                  const ls = linkStatuses[ev.link_id];
                  const linkObj = links.find((l) => l.id === ev.link_id);
                  return (
                    <div
                      key={ev.id}
                      className={`p-2 rounded border text-[10px] ${statusBg(ev.status)}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono font-bold text-foreground text-[10px] truncate">
                          {ls ? `${ls.originHost} ⟷ ${ls.destHost}` : ev.link_id.slice(0, 8)}
                        </span>
                        <span className={`font-display font-bold text-[9px] ${statusColor(ev.status)}`}>
                          {ev.status}
                        </span>
                      </div>
                      {linkObj && (
                        <div className="flex items-center gap-1.5 text-[8px] text-muted-foreground font-mono mb-1">
                          <span className="px-1 py-0.5 rounded bg-muted/20 border border-border/20">{linkObj.link_type}</span>
                          {linkObj.is_ring && <span className="px-1 py-0.5 rounded bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20">Ring</span>}
                          {linkObj.priority > 0 && <span className="text-neon-amber">P{linkObj.priority}</span>}
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[9px] text-muted-foreground font-mono">
                        <span>Início: {new Date(ev.started_at).toLocaleTimeString("pt-BR")}</span>
                        <span className="text-neon-amber font-bold">{durationStr(ev.started_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Closed events (history) */}
            {closedEvents.length > 0 && (
              <div className="space-y-1">
                <div className="text-[9px] font-display uppercase tracking-wider text-muted-foreground px-1 mt-2">
                  HISTÓRICO
                </div>
                {closedEvents.map((ev) => {
                  const ls = linkStatuses[ev.link_id];
                  const linkObj = links.find((l) => l.id === ev.link_id);
                  return (
                    <div
                      key={ev.id}
                      className="p-2 rounded border border-border/20 bg-muted/5 text-[10px]"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-muted-foreground truncate text-[10px]">
                          {ls ? `${ls.originHost} ⟷ ${ls.destHost}` : ev.link_id.slice(0, 8)}
                        </span>
                        <span className={`font-display text-[9px] ${statusColor(ev.status)}`}>
                          {ev.status}
                        </span>
                      </div>
                      {linkObj && (
                        <div className="flex items-center gap-1.5 text-[8px] text-muted-foreground/60 font-mono mb-1">
                          <span>{linkObj.link_type}</span>
                          {linkObj.is_ring && <span className="text-neon-cyan/50">Ring</span>}
                          {linkObj.priority > 0 && <span>P{linkObj.priority}</span>}
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[9px] text-muted-foreground font-mono">
                        <span>{new Date(ev.started_at).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</span>
                        <span>{durationStr(ev.started_at, ev.ended_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeEvents.length === 0 && closedEvents.length === 0 && (
              <div className="p-4 text-center">
                <Link2 className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-[10px] text-muted-foreground/50 font-mono">Sem eventos SLA registrados</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
