import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboardData } from "@/hooks/useDashboardData";
import WidgetRenderer from "@/components/dashboard/WidgetRenderer";
import { Button } from "@/components/ui/button";
import { RefreshCw, ArrowLeft, Settings, Wifi, WifiOff, Volume2, VolumeOff } from "lucide-react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { useCallback, useMemo, useState } from "react";
import { useAudioAlert } from "@/hooks/useAudioAlert";

/** Grid: 12 columns, each row = 80px height */
const COL_WIDTH_PERCENT = 100 / 12;
const ROW_HEIGHT = 80;

export default function DashboardView() {
  const { dashboardId } = useParams<{ dashboardId: string }>();
  const navigate = useNavigate();
  const [isPolling, setIsPolling] = useState(false);
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

  const { dashboard, isLoading, error, telemetryCache, pollNow } = useDashboardData(activeDashId);

  const handlePoll = async () => {
    setIsPolling(true);
    await pollNow();
    setTimeout(() => setIsPolling(false), 1000);
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

  return (
    <div
      className="min-h-screen grid-pattern scanlines relative p-4 md:p-6 lg:p-8"
      data-theme-category={themeCategory}
      style={{ background: 'var(--category-bg, linear-gradient(180deg, hsl(228 30% 4%) 0%, hsl(230 35% 2%) 100%))' }}
    >
      {/* Ambient glow — two blobs with category color */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] rounded-full blur-[140px] pointer-events-none opacity-60" style={{ background: 'hsl(var(--primary) / 0.15)' }} />
      <div className="fixed bottom-0 right-0 w-[500px] h-[500px] rounded-full blur-[120px] pointer-events-none opacity-40" style={{ background: 'hsl(var(--primary) / 0.08)' }} />

      <div className="max-w-[1600px] mx-auto relative z-10">
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
              disabled={isPolling || !dashboard?.zabbix_connection_id}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className={`w-3 h-3 ${isPolling ? "animate-spin" : ""}`} />
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

        {/* Widget Grid */}
        {dashboard && !isLoading && (
          <div className="relative" style={{ minHeight: getGridHeight(dashboard.widgets) }}>
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
              (() => {
                const isCompact = dashboard.widgets.length > 20;
                return dashboard.widgets.map((widget, i) => {
                  const telemetryKey = widget.adapter?.telemetry_key || `zbx:widget:${widget.id}`;
                  const mergedConfig = {
                    ...(widget.config as Record<string, unknown>),
                    ...((widget.config as any)?.extra || {}),
                    style: (widget.config as any)?.style,
                  };
                  return (
                    <motion.div
                      key={widget.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="absolute"
                      style={{
                        left: `${widget.position_x * COL_WIDTH_PERCENT}%`,
                        top: `${widget.position_y * ROW_HEIGHT}px`,
                        width: `${widget.width * COL_WIDTH_PERCENT}%`,
                        height: `${widget.height * ROW_HEIGHT}px`,
                        padding: isCompact ? "2px" : "3px",
                        contain: "layout style paint",
                      }}
                    >
                      <WidgetRenderer
                        widgetType={widget.widget_type}
                        widgetId={widget.id}
                        telemetryKey={telemetryKey}
                        title={widget.title}
                        cache={telemetryCache}
                        config={mergedConfig}
                        onCritical={handleCritical}
                        compact={isCompact}
                      />
                    </motion.div>
                  );
                });
              })()
            )}
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-4 mt-8">
          <p className="text-[10px] font-mono text-muted-foreground/50">
            FLOWPULSE | Dashboard Viewer • Realtime via Reactor
          </p>
        </div>
      </div>
    </div>
  );
}

function getGridHeight(widgets: Array<{ position_y: number; height: number }>): string {
  if (!widgets.length) return "200px";
  const maxBottom = Math.max(...widgets.map((w) => (w.position_y + w.height) * ROW_HEIGHT));
  return `${maxBottom + 16}px`;
}
