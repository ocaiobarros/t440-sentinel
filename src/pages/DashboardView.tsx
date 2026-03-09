import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboardData } from "@/hooks/useDashboardData";
import WidgetRenderer from "@/components/dashboard/WidgetRenderer";
import { Button } from "@/components/ui/button";
import { RefreshCw, ArrowLeft, Settings, Wifi, WifiOff, Volume2, VolumeOff, Timer, BellOff, AlertTriangle, Maximize2, Minimize2 } from "lucide-react";
import MonitoringHeader, { useKioskMode } from "@/components/layout/MonitoringHeader";
import { motion, AnimatePresence } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { useAudioAlert } from "@/hooks/useAudioAlert";
import { useBatteryCrisis } from "@/hooks/useBatteryCrisis";
import { Responsive, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import {
  GRID_BREAKPOINTS,
  GRID_COLS as GRID_COLS_MAP,
  GRID_ROW_HEIGHTS,
  GRID_MARGIN,
  GRID_CONTAINER_PADDING,
  DEFAULT_COLS,
  DEFAULT_ROW_HEIGHT,
  activeBreakpoint,
  scaleLayout,
} from "@/lib/grid-config";


const POLL_INTERVALS = [
  { label: "5s", value: 5 },
  { label: "10s", value: 10 },
  { label: "20s", value: 20 },
  { label: "30s", value: 30 },
  { label: "60s", value: 60 },
];

function getPollIntervalKey(dashboardId: string) {
  return `flowpulse:poll_interval:${dashboardId}`;
}

export default function DashboardView() {
  const { dashboardId } = useParams<{ dashboardId: string }>();
  const navigate = useNavigate();
  const { muted, toggleMute, playBeep } = useAudioAlert();

  const handleCritical = useCallback((widgetId: string) => {
    playBeep(widgetId);
  }, [playBeep]);

  // If no dashboardId in URL, fetch the user's default dashboard
  const { data: defaultDashId } = useQuery({
    queryKey: ["default-dashboard"],
    queryFn: async () => {
      const { data } = await supabase
        .from("dashboards")
        .select("id")
        .eq("is_default", true)
        .limit(1)
        .maybeSingle();
      return data?.id ?? null;
    },
    enabled: !dashboardId,
  });

  const activeDashId = dashboardId ?? defaultDashId ?? null;

  // Poll interval state with localStorage persistence
  const [pollInterval, setPollInterval] = useState<number>(() => {
    if (!activeDashId) return 60;
    const saved = localStorage.getItem(getPollIntervalKey(activeDashId));
    return saved ? parseInt(saved, 10) : 60;
  });

  // Sync when dashboard changes
  useEffect(() => {
    if (!activeDashId) return;
    const saved = localStorage.getItem(getPollIntervalKey(activeDashId));
    if (saved) setPollInterval(parseInt(saved, 10));
  }, [activeDashId]);

  const handleIntervalChange = useCallback((seconds: number) => {
    setPollInterval(seconds);
    if (activeDashId) {
      localStorage.setItem(getPollIntervalKey(activeDashId), String(seconds));
    }
  }, [activeDashId]);

  const { dashboard, isLoading, error, telemetryCache, pollNow, isPollingActive, isEmergencyMode, lastPollLatencyMs, oldestZabbixTs, consecutiveErrors } = useDashboardData(activeDashId, pollInterval);

  // ── Zabbix Data Age: ticking display showing seconds since last Zabbix server timestamp ──
  const [dataAgeSec, setDataAgeSec] = useState<number | null>(null);
  useEffect(() => {
    if (oldestZabbixTs === null) {
      setDataAgeSec(null);
      return;
    }
    const tick = () => {
      // oldestZabbixTs is in epoch SECONDS (Zabbix lastclock)
      const tsMs = oldestZabbixTs > 1e12 ? oldestZabbixTs : oldestZabbixTs * 1000;
      setDataAgeSec(Math.max(0, Math.round((Date.now() - tsMs) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [oldestZabbixTs]);

  // ── Window focus refetch: re-poll immediately when tab regains focus ──
  useEffect(() => {
    const handleFocus = () => {
      if (dashboard?.zabbix_connection_id) {
        pollNow();
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [dashboard?.zabbix_connection_id, pollNow]);

  // ── Battery Crisis Monitor ──
  // Collect all battery-bar widget telemetry keys from the dashboard
  const batteryKeys = useMemo(() => {
    if (!dashboard?.widgets) return [];
    return (dashboard.widgets as any[])
      .filter((w: any) => w.widget_type === "battery-bar")
      .map((w: any) => w.adapter?.telemetry_key || `zbx:widget:${w.id}`);
  }, [dashboard?.widgets]);

  const { isCrisis, crisisVoltage, isSilenced, silenceAlarm } = useBatteryCrisis({
    cache: telemetryCache,
    batteryKeys,
    crisisThreshold: 44.0,
    recoveryThreshold: 44.5,
    globalMuted: muted,
  });

  const handlePoll = async () => {
    await pollNow();
  };

  const hasData = telemetryCache.size > 0;

  if (!dashboardId && !defaultDashId && !isLoading) {
    return (
      <div className="min-h-screen bg-background grid-pattern scanlines relative p-4 md:p-6 lg:p-8">
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-neon-green/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="max-w-[1600px] 3xl:max-w-none mx-auto relative z-10 flex flex-col items-center justify-center min-h-[60vh] gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card-elevated rounded-xl p-8 text-center max-w-md"
          >
            <h2 className="text-xl font-display text-foreground mb-2">Nenhum Dashboard</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Crie seu primeiro dashboard para visualizar dados do Zabbix em tempo real.
            </p>
            <Button onClick={() => navigate("/app/settings/connections")} variant="outline" className="gap-2">
              <Settings className="w-4 h-4" />
              Configurar Conexões
            </Button>
          </motion.div>
        </div>
      </div>
    );
  }

  const themeCategory = (dashboard?.settings as any)?.category || "";
  const isLightTheme = themeCategory === "cameras";

  const isKiosk = useKioskMode();

  return (
    <div
      className={`min-h-screen grid-pattern scanlines relative ${isKiosk ? "" : "px-2 py-2"} ${isLightTheme ? 'text-foreground' : ''}`}
      data-theme-category={themeCategory}
      style={{
        background: 'var(--category-bg, linear-gradient(180deg, hsl(228 30% 4%) 0%, hsl(230 35% 2%) 100%))',
        width: '100vw',
        maxWidth: '100vw',
        margin: 0,
        boxSizing: 'border-box',
      }}
    >
      {isCrisis && (
        <>
          <div className="emergency-pulse-overlay" />
          <div className="emergency-vignette" />
        </>
      )}
      {isPollingActive && (
        <div className="fixed top-0 left-0 right-0 h-[2px] z-50">
          <motion.div className="h-full bg-primary" initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 1.5, ease: "easeInOut" }} />
        </div>
      )}
      {!isLightTheme && (
        <>
          <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] rounded-full blur-[140px] pointer-events-none opacity-60" style={{ background: 'hsl(var(--primary) / 0.15)' }} />
          <div className="fixed bottom-0 right-0 w-[500px] h-[500px] rounded-full blur-[120px] pointer-events-none opacity-40" style={{ background: 'hsl(var(--primary) / 0.08)' }} />
        </>
      )}

      <MonitoringHeader
        title={isLoading ? "Carregando..." : dashboard?.name || "Dashboard"}
        subtitle={dashboard?.description || undefined}
        backPath="/app/monitoring/dashboards"
        onRefresh={handlePoll}
        isRefreshing={isPollingActive}
        extraRight={
          <>
            {isEmergencyMode && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-destructive/20 border border-destructive/40 text-[9px] font-mono text-destructive animate-pulse">⚡ 1s POLL</span>
            )}
            {dataAgeSec !== null && (
              <span className={`text-[9px] font-mono flex items-center gap-0.5 ${dataAgeSec > 5 ? "text-yellow-400 animate-pulse" : "text-muted-foreground/60"}`}>Zabbix: {dataAgeSec}s ago</span>
            )}
            {lastPollLatencyMs !== null && (
              <span className={`text-[9px] font-mono ${lastPollLatencyMs > 3000 ? "text-yellow-400" : "text-muted-foreground/60"}`}>Poll RTT {lastPollLatencyMs}ms</span>
            )}
            <RealtimeLatencyBadge telemetryCache={telemetryCache} />
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {hasData ? <Wifi className="w-3 h-3 text-primary" /> : <WifiOff className="w-3 h-3 text-muted-foreground/50" />}
              <span className="font-mono">{telemetryCache.size} keys</span>
            </div>
            <div className="flex items-center gap-0.5 border border-border/40 rounded-md px-1 py-0.5">
              <Timer className="w-3 h-3 text-muted-foreground mr-0.5" />
              {POLL_INTERVALS.map((opt) => (
                <button key={opt.value} onClick={() => handleIntervalChange(opt.value)}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition-all ${pollInterval === opt.value ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground hover:bg-accent/30 border border-transparent"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="icon" onClick={toggleMute} className={`h-7 w-7 ${muted ? "text-muted-foreground" : "text-primary"}`}>
              {muted ? <VolumeOff className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </Button>
          </>
        }
      />

      <div className="w-full relative z-10" style={{ maxWidth: '100%', margin: 0 }}>

        {/* Loading state */}
        {isLoading && (
          <div className="grid grid-cols-12 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="col-span-4">
                <Skeleton className="h-[160px] rounded-lg" />
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="glass-card rounded-lg p-6 border border-neon-red/30 text-center">
            <p className="text-sm text-neon-red">Erro ao carregar dashboard</p>
            <p className="text-xs text-muted-foreground mt-1">{(error as Error).message}</p>
          </div>
        )}

        {/* Persistent error banner when polling fails continuously */}
        <AnimatePresence>
          {consecutiveErrors >= 3 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-4 flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm backdrop-blur-sm"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
              <span className="text-destructive font-medium">
                Polling com falha contínua ({consecutiveErrors}x) — verifique a conexão Zabbix ou os secrets de produção.
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePoll}
                disabled={isPollingActive}
                className="ml-auto gap-1.5 text-xs text-destructive hover:text-destructive"
              >
                <RefreshCw className={`w-3 h-3 ${isPollingActive ? "animate-spin" : ""}`} />
                Tentar agora
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Widget Grid — uses same react-grid-layout as Builder for pixel-perfect match */}
        {dashboard && !isLoading && (
          <>
            {dashboard.widgets.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="glass-card rounded-xl p-8 text-center"
              >
                <p className="text-sm text-muted-foreground">
                  Nenhum widget configurado. Adicione widgets ao dashboard para visualizar dados.
                </p>
              </motion.div>
            ) : (
              <ViewGrid
                widgets={dashboard.widgets as any[]}
                baseCols={(dashboard.settings as any)?.cols || DEFAULT_COLS}
                baseRowHeight={(dashboard.settings as any)?.rowHeight || DEFAULT_ROW_HEIGHT}
                telemetryCache={telemetryCache}
                onCritical={handleCritical}
              />
            )}
          </>
        )}

        {/* Floating Silence Alarm Button */}
        <AnimatePresence>
          {isCrisis && !isSilenced && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              className="fixed bottom-6 right-6 z-50"
            >
              <Button
                onClick={silenceAlarm}
                variant="destructive"
                size="icon"
                className="h-12 w-12 rounded-full shadow-lg glow-red"
                title="Silenciar alarme"
              >
                <BellOff className="w-5 h-5" />
              </Button>
              {crisisVoltage !== null && (
                <span className="absolute -top-2 -left-2 text-[9px] font-mono bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded-full">
                  {crisisVoltage.toFixed(1)}V
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="text-center py-4 mt-8">
          <p className="text-[10px] font-mono text-muted-foreground/50">
            FLOWPULSE | Dashboard Viewer • Realtime via Reactor • Auto-refresh: {pollInterval}s
          </p>
        </div>
      </div>
    </div>
  );
}

/** Extracted grid component so WidthProvider can measure correctly */
function ViewGrid({
  widgets,
  baseCols,
  baseRowHeight,
  telemetryCache,
  onCritical,
}: {
  widgets: any[];
  baseCols: number;
  baseRowHeight: number;
  telemetryCache: Map<string, any>;
  onCritical: (id: string) => void;
}) {
  const isCompact = widgets.length > 20;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Measure container width with ResizeObserver — no WidthProvider needed
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.offsetWidth);
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const baseLayout: Layout[] = useMemo(
    () =>
      widgets.map((w: any) => ({
        i: w.id,
        x: w.position_x,
        y: w.position_y,
        w: w.width,
        h: w.height,
        static: true,
      })),
    [widgets],
  );

  // Build responsive layouts by scaling base layout to each breakpoint
  const responsiveLayouts = useMemo(() => {
    const result: Record<string, Layout[]> = {};
    for (const [bp, cols] of Object.entries(GRID_COLS_MAP)) {
      result[bp] = scaleLayout(baseLayout, baseCols, cols).map((item) => ({ ...item, static: true }));
    }
    return result;
  }, [baseLayout, baseCols]);

  const bp = activeBreakpoint(containerWidth);

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      {containerWidth > 0 && (
        <Responsive
          width={containerWidth}
          layouts={responsiveLayouts}
          breakpoints={GRID_BREAKPOINTS}
          cols={GRID_COLS_MAP}
          rowHeight={GRID_ROW_HEIGHTS[bp]}
          isDraggable={false}
          isResizable={false}
          compactType={null}
          preventCollision
          margin={GRID_MARGIN}
          containerPadding={GRID_CONTAINER_PADDING}
          useCSSTransforms
        >
          {widgets.map((widget: any) => {
            const telemetryKey = widget.adapter?.telemetry_key || `zbx:widget:${widget.id}`;
            const mergedConfig = {
              ...(widget.config as Record<string, unknown>),
              ...((widget.config as any)?.extra || {}),
              style: (widget.config as any)?.style,
            };
            return (
              <div key={widget.id}>
                <WidgetRenderer
                  widgetType={widget.widget_type}
                  widgetId={widget.id}
                  telemetryKey={telemetryKey}
                  title={widget.title}
                  cache={telemetryCache}
                  config={mergedConfig}
                  onCritical={onCritical}
                  compact={isCompact}
                />
              </div>
            );
          })}
        </Responsive>
      )}
    </div>
  );
}

/** Shows the median Realtime Time-to-Glass latency from the telemetry cache */
function RealtimeLatencyBadge({ telemetryCache }: { telemetryCache: Map<string, any> }) {
  const [lagMs, setLagMs] = useState<number | null>(null);

  useEffect(() => {
    const compute = () => {
      const latencies: number[] = [];
      for (const entry of telemetryCache.values()) {
        if (typeof entry.latencyMs === "number" && entry.latencyMs >= 0) {
          latencies.push(entry.latencyMs);
        }
      }
      if (latencies.length === 0) { setLagMs(null); return; }
      latencies.sort((a, b) => a - b);
      setLagMs(Math.round(latencies[Math.floor(latencies.length / 2)]));
    };
    compute();
    const id = setInterval(compute, 2000);
    return () => clearInterval(id);
  }, [telemetryCache]);

  if (lagMs === null) return null;

  const color = lagMs > 1500 ? "text-destructive" : lagMs > 500 ? "text-yellow-400" : "text-emerald-400";

  return (
    <span className={`text-[9px] font-mono ${color}`} title="Latência mediana Realtime (Time-to-Glass)">
      Lag: {lagMs}ms
    </span>
  );
}
