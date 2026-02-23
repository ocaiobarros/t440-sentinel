import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Play, Pause, Square, SkipBack, SkipForward, Clock, Calendar,
  Activity, AlertTriangle, ChevronRight, Zap, History,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import FlowMapCanvas from "@/components/flowmap/FlowMapCanvas";
import type { FlowMap, FlowMapHost, FlowMapLink, FlowMapCTO, FlowMapCable } from "@/hooks/useFlowMaps";
import type { LinkStatusInfo, LinkEventInfo } from "@/components/flowmap/FlowMapCanvas";

/* ── helpers ── */
function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function todayStr() { return fmtDate(new Date()); }
function yesterdayStr() { const d = new Date(); d.setDate(d.getDate() - 1); return fmtDate(d); }

interface TimelineEvent {
  id: string;
  link_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  ts: number; // ms
  originHost: string;
  destHost: string;
}

/* ═══════════════════════════════════════════════ */
export default function TimelinePage() {
  const { toast } = useToast();

  /* ── date / map selectors ── */
  const [selectedMapId, setSelectedMapId] = useState<string>("");
  const [dateStr, setDateStr] = useState(yesterdayStr());
  const [startHour, setStartHour] = useState("00:00");
  const [endHour, setEndHour] = useState("23:59");

  /* ── player state ── */
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10); // 10x realtime
  const [cursorMs, setCursorMs] = useState(0);
  const animRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);

  /* ── queries: maps ── */
  const { data: maps = [] } = useQuery({
    queryKey: ["tm-maps"],
    queryFn: async () => {
      const { data } = await supabase.from("flow_maps").select("id, name, tenant_id, center_lat, center_lon, zoom, theme, refresh_interval, created_at, updated_at");
      return (data ?? []) as FlowMap[];
    },
  });

  useEffect(() => { if (maps.length && !selectedMapId) setSelectedMapId(maps[0].id); }, [maps, selectedMapId]);

  const selectedMap = maps.find(m => m.id === selectedMapId);

  /* ── queries: topology ── */
  const { data: hosts = [] } = useQuery({
    queryKey: ["tm-hosts", selectedMapId],
    enabled: !!selectedMapId,
    queryFn: async () => {
      const { data } = await supabase.from("flow_map_hosts").select("*").eq("map_id", selectedMapId);
      return (data ?? []) as FlowMapHost[];
    },
  });

  const { data: links = [] } = useQuery({
    queryKey: ["tm-links", selectedMapId],
    enabled: !!selectedMapId,
    queryFn: async () => {
      const { data } = await supabase.from("flow_map_links").select("*").eq("map_id", selectedMapId);
      return (data ?? []) as unknown as FlowMapLink[];
    },
  });

  const { data: ctos = [] } = useQuery({
    queryKey: ["tm-ctos", selectedMapId],
    enabled: !!selectedMapId,
    queryFn: async () => {
      const { data } = await supabase.from("flow_map_ctos").select("*").eq("map_id", selectedMapId);
      return (data ?? []) as FlowMapCTO[];
    },
  });

  const { data: cables = [] } = useQuery({
    queryKey: ["tm-cables", selectedMapId],
    enabled: !!selectedMapId,
    queryFn: async () => {
      const { data } = await supabase.from("flow_map_cables").select("*").eq("map_id", selectedMapId);
      return (data ?? []) as FlowMapCable[];
    },
  });

  /* ── query: link events for the date range ── */
  const rangeStart = useMemo(() => `${dateStr}T${startHour}:00`, [dateStr, startHour]);
  const rangeEnd = useMemo(() => `${dateStr}T${endHour}:59`, [dateStr, endHour]);

  const { data: rawEvents = [], isLoading: eventsLoading, refetch: refetchEvents } = useQuery({
    queryKey: ["tm-events", selectedMapId, rangeStart, rangeEnd],
    enabled: !!selectedMapId,
    queryFn: async () => {
      // Get events that overlap with the window
      const { data } = await supabase
        .from("flow_map_link_events")
        .select("*")
        .gte("started_at", rangeStart)
        .lte("started_at", rangeEnd)
        .order("started_at", { ascending: true });
      return data ?? [];
    },
  });

  const hostLookup = useMemo(() => {
    const m: Record<string, string> = {};
    hosts.forEach(h => { m[h.id] = h.host_name; });
    return m;
  }, [hosts]);

  const linkHostLookup = useMemo(() => {
    const m: Record<string, { origin: string; dest: string }> = {};
    links.forEach(l => { m[l.id] = { origin: hostLookup[l.origin_host_id] || "?", dest: hostLookup[l.dest_host_id] || "?" }; });
    return m;
  }, [links, hostLookup]);

  const timelineEvents: TimelineEvent[] = useMemo(() => {
    return rawEvents.map((e: any) => ({
      id: e.id,
      link_id: e.link_id,
      status: e.status,
      started_at: e.started_at,
      ended_at: e.ended_at,
      ts: new Date(e.started_at).getTime(),
      originHost: linkHostLookup[e.link_id]?.origin || "?",
      destHost: linkHostLookup[e.link_id]?.dest || "?",
    }));
  }, [rawEvents, linkHostLookup]);

  /* ── time range ── */
  const rangeStartMs = useMemo(() => new Date(rangeStart).getTime(), [rangeStart]);
  const rangeEndMs = useMemo(() => new Date(rangeEnd).getTime(), [rangeEnd]);
  const totalMs = rangeEndMs - rangeStartMs;

  // Initialize cursor
  useEffect(() => {
    setCursorMs(rangeStartMs);
    setPlaying(false);
  }, [rangeStartMs]);

  /* ── animation loop ── */
  useEffect(() => {
    if (!playing) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }
    lastFrameRef.current = performance.now();

    const tick = (now: number) => {
      const dt = now - lastFrameRef.current;
      lastFrameRef.current = now;
      setCursorMs(prev => {
        const next = prev + dt * speed;
        if (next >= rangeEndMs) { setPlaying(false); return rangeEndMs; }
        return next;
      });
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [playing, speed, rangeEndMs]);

  /* ── compute state at cursorMs ── */
  const stateAtCursor = useMemo(() => {
    const linkStatus: Record<string, string> = {};
    // init all links as UP
    links.forEach(l => { linkStatus[l.id] = "UP"; });

    // Apply events: for each event, if cursorMs is within [started_at, ended_at?], apply status
    for (const ev of timelineEvents) {
      const evStart = ev.ts;
      const evEnd = ev.ended_at ? new Date(ev.ended_at).getTime() : rangeEndMs;
      if (cursorMs >= evStart && cursorMs <= evEnd) {
        linkStatus[ev.link_id] = ev.status;
      }
    }

    // Derive host statuses from links
    const hostDown = new Set<string>();
    links.forEach(l => {
      if (linkStatus[l.id] === "DOWN") {
        // Check if ALL links of a host are down
      }
    });

    // Build linkStatuses map
    const linkStatusMap: Record<string, LinkStatusInfo> = {};
    links.forEach(l => {
      linkStatusMap[l.id] = {
        status: linkStatus[l.id],
        originHost: hostLookup[l.origin_host_id] || "?",
        destHost: hostLookup[l.dest_host_id] || "?",
      };
    });

    // Build linkEvents for active events at cursor
    const activeLinkEvents: LinkEventInfo[] = timelineEvents
      .filter(ev => {
        const evEnd = ev.ended_at ? new Date(ev.ended_at).getTime() : rangeEndMs;
        return cursorMs >= ev.ts && cursorMs <= evEnd;
      })
      .map(ev => ({
        id: ev.id,
        link_id: ev.link_id,
        status: ev.status,
        started_at: ev.started_at,
        ended_at: ev.ended_at,
      }));

    // Host status map — derive from connected links
    const hostStatusMap: Record<string, { status: "UP" | "DOWN" | "UNKNOWN" }> = {};
    hosts.forEach(h => {
      const connectedLinks = links.filter(l => l.origin_host_id === h.id || l.dest_host_id === h.id);
      if (connectedLinks.length === 0) {
        hostStatusMap[h.zabbix_host_id] = { status: "UNKNOWN" };
        return;
      }
      const allDown = connectedLinks.every(l => linkStatus[l.id] === "DOWN");
      const anyDown = connectedLinks.some(l => linkStatus[l.id] === "DOWN");
      hostStatusMap[h.zabbix_host_id] = {
        status: allDown ? "DOWN" : "UP",
      };
    });

    return { linkStatusMap, activeLinkEvents, hostStatusMap };
  }, [cursorMs, timelineEvents, links, hosts, hostLookup, rangeEndMs]);

  /* ── events visible up to cursor ── */
  const visibleEvents = useMemo(() => {
    return timelineEvents.filter(e => e.ts <= cursorMs).reverse().slice(0, 50);
  }, [timelineEvents, cursorMs]);

  /* ── controls ── */
  const handleStop = () => { setPlaying(false); setCursorMs(rangeStartMs); };
  const handleSkipBack = () => setCursorMs(prev => Math.max(rangeStartMs, prev - 60000));
  const handleSkipForward = () => setCursorMs(prev => Math.min(rangeEndMs, prev + 60000));
  const jumpToEvent = (ts: number) => { setPlaying(false); setCursorMs(ts); };

  const progress = totalMs > 0 ? ((cursorMs - rangeStartMs) / totalMs) * 100 : 0;

  /* ── stats ── */
  const totalEvents = timelineEvents.length;
  const downEvents = timelineEvents.filter(e => e.status === "DOWN").length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 pb-2 flex items-center justify-between flex-wrap gap-3 border-b border-border/50">
        <div>
          <h1 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Time-Machine
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Reprodução histórica de eventos da rede</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {maps.length > 1 && (
            <Select value={selectedMapId} onValueChange={setSelectedMapId}>
              <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue placeholder="Mapa" /></SelectTrigger>
              <SelectContent>
                {maps.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Input type="date" value={dateStr} onChange={e => setDateStr(e.target.value)} className="w-[140px] h-8 text-xs" />
          <Input type="time" value={startHour} onChange={e => setStartHour(e.target.value)} className="w-[100px] h-8 text-xs" />
          <span className="text-xs text-muted-foreground">até</span>
          <Input type="time" value={endHour} onChange={e => setEndHour(e.target.value)} className="w-[100px] h-8 text-xs" />
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => refetchEvents()}>
            <Activity className="w-3 h-3" /> Carregar
          </Button>
        </div>
      </div>

      {/* Scorecards */}
      <div className="px-4 py-2 flex items-center gap-3">
        <MiniStat icon={<Zap className="w-3.5 h-3.5" />} label="Eventos" value={totalEvents} color="text-primary" />
        <MiniStat icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Down" value={downEvents} color="text-red-400" />
        <MiniStat icon={<Clock className="w-3.5 h-3.5" />} label="Cursor" value={fmtTime(cursorMs)} color="text-cyan-400" isText />
      </div>

      {/* Main area: Map + Event Feed */}
      <div className="flex-1 flex min-h-0">
        {/* Map */}
        <div className="flex-1 relative min-h-0">
          {selectedMap ? (
            <FlowMapCanvas
              key={selectedMapId}
              flowMap={selectedMap}
              hosts={hosts}
              links={links}
              ctos={ctos}
              cables={cables}
              statusMap={stateAtCursor.hostStatusMap}
              linkStatuses={stateAtCursor.linkStatusMap}
              linkEvents={stateAtCursor.activeLinkEvents}
              className="h-full w-full"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Selecione um mapa para iniciar o replay
            </div>
          )}
          {/* Replay overlay badge */}
          <div className="absolute top-3 left-3 z-[1000]">
            <Badge className="bg-red-500/20 text-red-400 border-red-500/30 gap-1 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
              REPLAY
            </Badge>
          </div>
        </div>

        {/* Event Feed */}
        <div className="w-72 border-l border-border/50 flex flex-col bg-card/50">
          <div className="p-3 border-b border-border/50">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Feed de Eventos</h3>
          </div>
          <ScrollArea className="flex-1">
            {eventsLoading ? (
              <div className="p-3 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : visibleEvents.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground text-center">Nenhum evento até este momento</p>
            ) : (
              <div className="p-2 space-y-1">
                <AnimatePresence initial={false}>
                  {visibleEvents.map(ev => (
                    <motion.div
                      key={ev.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="p-2 rounded-md bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors border border-border/30"
                      onClick={() => jumpToEvent(ev.ts)}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] font-mono text-muted-foreground">{fmtTime(ev.ts)}</span>
                        <StatusDot status={ev.status} />
                        <span className="text-[10px] font-bold text-foreground">{ev.status}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {ev.originHost} ⟷ {ev.destHost}
                      </p>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Player Bar */}
      <div className="border-t border-border/50 bg-card/80 backdrop-blur-sm px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Controls */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleStop} title="Stop">
              <Square className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleSkipBack} title="-1min">
              <SkipBack className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant={playing ? "secondary" : "default"}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setPlaying(!playing)}
            >
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleSkipForward} title="+1min">
              <SkipForward className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Time display */}
          <span className="text-xs font-mono text-muted-foreground min-w-[60px]">{fmtTime(cursorMs)}</span>

          {/* Slider */}
          <div className="flex-1">
            <Slider
              value={[progress]}
              max={100}
              step={0.01}
              onValueChange={([v]) => {
                const ms = rangeStartMs + (v / 100) * totalMs;
                setCursorMs(ms);
              }}
              className="cursor-pointer"
            />
          </div>

          <span className="text-xs font-mono text-muted-foreground min-w-[60px] text-right">{fmtTime(rangeEndMs)}</span>

          {/* Speed */}
          <Select value={String(speed)} onValueChange={v => setSpeed(Number(v))}>
            <SelectTrigger className="w-[80px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1x</SelectItem>
              <SelectItem value="5">5x</SelectItem>
              <SelectItem value="10">10x</SelectItem>
              <SelectItem value="30">30x</SelectItem>
              <SelectItem value="60">60x</SelectItem>
              <SelectItem value="300">300x</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

/* ── sub-components ── */
function MiniStat({ icon, label, value, color, isText }: { icon: React.ReactNode; label: string; value: number | string; color: string; isText?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/30 border border-border/30">
      <span className={color}>{icon}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-sm font-bold font-mono ${color}`}>{isText ? value : value}</span>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === "DOWN" ? "bg-red-500" : status === "DEGRADED" ? "bg-amber-500" : status === "UP" ? "bg-emerald-500" : "bg-muted-foreground";
  return <span className={`w-1.5 h-1.5 rounded-full ${color} inline-block`} />;
}
