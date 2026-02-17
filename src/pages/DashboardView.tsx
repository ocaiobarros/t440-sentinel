import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboardData } from "@/hooks/useDashboardData";
import WidgetRenderer from "@/components/dashboard/WidgetRenderer";
import { Button } from "@/components/ui/button";
import { RefreshCw, ArrowLeft, Settings, Wifi, WifiOff, Volume2, VolumeOff, Timer } from "lucide-react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { useAudioAlert } from "@/hooks/useAudioAlert";
import { Responsive, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

/** Grid constants — MUST match DashboardBuilder exactly */
const GRID_COLS = 12;
const ROW_HEIGHT = 80;
const GRID_MARGIN: [number, number] = [4, 4];
const GRID_CONTAINER_PADDING: [number, number] = [0, 0];


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

  const { dashboard, isLoading, error, telemetryCache, pollNow, isPollingActive } = useDashboardData(activeDashId, pollInterval);

  const handlePoll = async () => {
    await pollNow();
  };

  const hasData = telemetryCache.size > 0;

  if (!dashboardId && !defaultDashId && !isLoading) {
    return (
      <div className="min-h-screen bg-background grid-pattern scanlines relative p-4 md:p-6 lg:p-8">
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-neon-green/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="max-w-[1600px] mx-auto relative z-10 flex flex-col items-center justify-center min-h-[60vh] gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card-elevated rounded-xl p-8 text-center max-w-md"
          >
            <h2 className="text-xl font-display text-foreground mb-2">Nenhum Dashboard</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Crie seu primeiro dashboard para visualizar dados do Zabbix em tempo real.
            </p>
            <Button onClick={() => navigate("/settings/connections")} variant="outline" className="gap-2">
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

  return (
    <div
      className={`min-h-screen grid-pattern scanlines relative px-2 py-2 ${isLightTheme ? 'text-foreground' : ''}`}
      data-theme-category={themeCategory}
      style={{
        background: 'var(--category-bg, linear-gradient(180deg, hsl(228 30% 4%) 0%, hsl(230 35% 2%) 100%))',
        width: '100%',
        maxWidth: '100vw',
        boxSizing: 'border-box',
      }}
    >
      {/* Sync progress bar */}
      {isPollingActive && (
        <div className="fixed top-0 left-0 right-0 h-[2px] z-50">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
          />
        </div>
      )}

      {/* Ambient glow — hidden for light themes */}
      {!isLightTheme && (
        <>
          <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] rounded-full blur-[140px] pointer-events-none opacity-60" style={{ background: 'hsl(var(--primary) / 0.15)' }} />
          <div className="fixed bottom-0 right-0 w-[500px] h-[500px] rounded-full blur-[120px] pointer-events-none opacity-40" style={{ background: 'hsl(var(--primary) / 0.08)' }} />
        </>
      )}

      <div className="w-full relative z-10" style={{ maxWidth: '100%' }}>
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-6"
        >
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-lg font-display font-bold text-foreground">
                {isLoading ? <Skeleton className="h-5 w-48" /> : dashboard?.name || "Dashboard"}
              </h1>
              {dashboard?.description && (
                <p className="text-[10px] text-muted-foreground">{dashboard.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Realtime status */}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {hasData ? (
                <Wifi className="w-3 h-3 text-primary" />
              ) : (
                <WifiOff className="w-3 h-3 text-muted-foreground/50" />
              )}
              <span className="font-mono">{telemetryCache.size} keys</span>
            </div>

            {/* Poll interval selector */}
            <div className="flex items-center gap-0.5 border border-border/40 rounded-md px-1 py-0.5">
              <Timer className="w-3 h-3 text-muted-foreground mr-0.5" />
              {POLL_INTERVALS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleIntervalChange(opt.value)}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition-all ${
                    pollInterval === opt.value
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/30 border border-transparent"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Audio control */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              className={`h-7 w-7 ${muted ? "text-muted-foreground" : "text-primary"}`}
              title={muted ? "Ativar alertas sonoros" : "Silenciar alertas"}
            >
              {muted ? <VolumeOff className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handlePoll}
              disabled={isPollingActive || !dashboard?.zabbix_connection_id}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className={`w-3 h-3 ${isPollingActive ? "animate-spin" : ""}`} />
              Poll
            </Button>
          </div>
        </motion.header>

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
                cols={(dashboard.settings as any)?.cols || GRID_COLS}
                rowHeight={(dashboard.settings as any)?.rowHeight || ROW_HEIGHT}
                telemetryCache={telemetryCache}
                onCritical={handleCritical}
              />
            )}
          </>
        )}

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
  cols,
  rowHeight,
  telemetryCache,
  onCritical,
}: {
  widgets: any[];
  cols: number;
  rowHeight: number;
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

  const gridLayout: Layout[] = useMemo(
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

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      {containerWidth > 0 && (
        <Responsive
          width={containerWidth}
          layouts={{ lg: gridLayout }}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: cols, md: 8, sm: 6, xs: 4, xxs: 2 }}
          rowHeight={rowHeight}
          isDraggable={false}
          isResizable={false}
          compactType={null}
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
