import { useState, useCallback, useMemo, useRef, useEffect, startTransition } from "react";
import { Responsive, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import type { DashboardConfig, WidgetConfig } from "@/types/builder";
import { createDefaultWidget } from "@/types/builder";
import WidgetPalette from "@/components/builder/WidgetPalette";
import WidgetConfigPanel from "@/components/builder/WidgetConfigPanel";
import WidgetPreviewCard from "@/components/builder/WidgetPreviewCard";
import DashboardSettingsPanel from "@/components/builder/DashboardSettingsPanel";
import PresetGallery from "@/components/builder/PresetGallery";
import type { DashboardPreset } from "@/data/dashboardPresets";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Save, ArrowLeft, Eye, Settings2, PanelLeftClose, PanelLeft,
  Layers, Undo2, Redo2,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const DEFAULT_CONFIG: DashboardConfig = {
  name: "Novo Dashboard",
  description: "",
  zabbix_connection_id: null,
  settings: {
    poll_interval_seconds: 60,
    cols: 12,
    rowHeight: 80,
    showGrid: true,
    scanlines: true,
    ambientGlow: true,
    ambientGlowColor: "#39FF14",
  },
  widgets: [],
};

export default function DashboardBuilder() {
  const { dashboardId } = useParams<{ dashboardId?: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isNew = !dashboardId;

  // State
  const [config, setConfig] = useState<DashboardConfig>(DEFAULT_CONFIG);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [sidebarMode, setSidebarMode] = useState<"widgets" | "settings" | "config">("widgets");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [history, setHistory] = useState<DashboardConfig[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  // Manual width measurement for the grid canvas — replaces WidthProvider
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () => setCanvasWidth(el.offsetWidth);
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const selectedWidget = useMemo(
    () => config.widgets.find((w) => w.id === selectedWidgetId) ?? null,
    [config.widgets, selectedWidgetId],
  );

  // Fetch connections for dropdown
  const { data: connections = [] } = useQuery({
    queryKey: ["zabbix-connections-list"],
    queryFn: async () => {
      const { data } = await supabase.from("zabbix_connections").select("id, name").eq("is_active", true);
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  // Load existing dashboard
  useQuery({
    queryKey: ["builder-dashboard", dashboardId],
    queryFn: async () => {
      if (!dashboardId) return null;
      const { data: dash } = await supabase
        .from("dashboards")
        .select("*")
        .eq("id", dashboardId)
        .single();
      if (!dash) throw new Error("Dashboard not found");

      const { data: widgets } = await supabase
        .from("widgets")
        .select("*")
        .eq("dashboard_id", dashboardId);

      const loaded: DashboardConfig = {
        id: dash.id,
        name: dash.name,
        description: dash.description || "",
        zabbix_connection_id: dash.zabbix_connection_id,
        settings: {
          ...DEFAULT_CONFIG.settings,
          ...((dash.settings as Record<string, unknown>) || {}),
        },
        widgets: (widgets || []).map((w: any) => ({
          id: w.id,
          widget_type: w.widget_type,
          title: w.title,
          x: w.position_x,
          y: w.position_y,
          w: w.width,
          h: w.height,
          style: (w.config as any)?.style || {},
          query: (w.query as any) || { source: "zabbix", method: "item.get", params: {} },
          adapter: (w.adapter as any) || { type: "auto" },
          extra: (w.config as any)?.extra || {},
        })),
      };
      setConfig(loaded);
      return loaded;
    },
    enabled: !!dashboardId,
  });

  // History management
  const pushHistory = useCallback(() => {
    setHistory((prev) => [...prev.slice(0, historyIdx + 1), JSON.parse(JSON.stringify(config))]);
    setHistoryIdx((i) => i + 1);
  }, [config, historyIdx]);

  const undo = () => {
    if (historyIdx > 0) {
      setConfig(history[historyIdx - 1]);
      setHistoryIdx((i) => i - 1);
    }
  };

  const redo = () => {
    if (historyIdx < history.length - 1) {
      setConfig(history[historyIdx + 1]);
      setHistoryIdx((i) => i + 1);
    }
  };

  // Widget operations
  const addWidget = useCallback((widget: WidgetConfig) => {
    pushHistory();
    setConfig((prev) => ({ ...prev, widgets: [...prev.widgets, widget] }));
    setSelectedWidgetId(widget.id);
    setSidebarMode("config");
  }, [pushHistory]);

  const loadPreset = useCallback((preset: DashboardPreset) => {
    pushHistory();
    setConfig((prev) => ({
      ...prev,
      name: prev.name === "Novo Dashboard" ? preset.name : prev.name,
      description: prev.description || preset.description,
      widgets: [...prev.widgets, ...preset.widgets],
      settings: { ...prev.settings, ...preset.settings, category: preset.category },
    }));
    setSelectedWidgetId(null);
    setSidebarMode("widgets");
    toast({ title: `Template "${preset.name}" carregado`, description: `${preset.widgets.length} widgets adicionados ao canvas.` });
  }, [pushHistory, toast]);

  const updateWidget = useCallback((updated: WidgetConfig) => {
    setConfig((prev) => ({
      ...prev,
      widgets: prev.widgets.map((w) => (w.id === updated.id ? updated : w)),
    }));
  }, []);

  const deleteWidget = useCallback((id: string) => {
    pushHistory();
    setConfig((prev) => ({ ...prev, widgets: prev.widgets.filter((w) => w.id !== id) }));
    if (selectedWidgetId === id) {
      setSelectedWidgetId(null);
      setSidebarMode("widgets");
    }
  }, [selectedWidgetId, pushHistory]);

  // ─── Drag / Resize handling ───
  // CRITICAL: We ONLY update widget positions on drag/resize STOP events.
  // We do NOT use onLayoutChange because it fires on every width recalculation
  // (e.g. when sidebar opens/closes), which would corrupt saved widget sizes.
  // ─── Click vs Drag detection ───
  // draggableHandle ensures only the title bar starts drags.
  // Widget content clicks fire onClick directly without RGL interference.
  const isDraggingRef = useRef(false);

  const handleDragMove = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const handleWidgetClick = useCallback((widgetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      return;
    }
    startTransition(() => {
      setSelectedWidgetId(widgetId);
      setSidebarMode("config");
      setSidebarOpen(true);
    });
  }, []);

  const handleDragStop = useCallback((_layout: Layout[], _oldItem: Layout, newItem: Layout) => {
    setConfig((prev) => ({
      ...prev,
      widgets: prev.widgets.map((w) => {
        if (w.id !== newItem.i) return w;
        return { ...w, x: newItem.x, y: newItem.y };
      }),
    }));
  }, []);

  const handleResizeStop = useCallback((_layout: Layout[], _oldItem: Layout, newItem: Layout) => {
    setConfig((prev) => ({
      ...prev,
      widgets: prev.widgets.map((w) => {
        if (w.id !== newItem.i) return w;
        return { ...w, x: newItem.x, y: newItem.y, w: newItem.w, h: newItem.h };
      }),
    }));
  }, []);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) throw new Error("Not authenticated");

      const userId = session.session.user.id;
      const { data: tenantData } = await supabase.rpc("get_user_tenant_id", { p_user_id: userId });
      const tenantId = tenantData as string;

      let dashId = config.id;

      if (dashId) {
        await supabase.from("dashboards").update({
          name: config.name,
          description: config.description,
          zabbix_connection_id: config.zabbix_connection_id,
          settings: config.settings as any,
        }).eq("id", dashId);
      } else {
        const { data, error } = await supabase.from("dashboards").insert({
          tenant_id: tenantId,
          name: config.name,
          description: config.description,
          zabbix_connection_id: config.zabbix_connection_id,
          settings: config.settings as any,
          created_by: userId,
        }).select("id").single();
        if (error) throw error;
        dashId = data.id;
        setConfig((prev) => ({ ...prev, id: dashId }));
      }

      // Sync widgets: delete all then re-insert
      await supabase.from("widgets").delete().eq("dashboard_id", dashId!);

      if (config.widgets.length > 0) {
        const widgetRows = config.widgets.map((w) => ({
          id: w.id,
          dashboard_id: dashId!,
          widget_type: w.widget_type,
          title: w.title,
          position_x: w.x,
          position_y: w.y,
          width: w.w,
          height: w.h,
          query: w.query as any,
          adapter: w.adapter as any,
          config: {
            style: w.style,
            extra: w.extra,
            imageUrl: w.extra?.imageUrl,
            hotspots: w.extra?.hotspots,
            color_map: w.extra?.color_map,
            default_color: w.extra?.default_color,
          } as any,
          created_by: userId,
        }));
        const { error: wErr } = await supabase.from("widgets").insert(widgetRows);
        if (wErr) throw wErr;
      }

      return dashId;
    },
    onSuccess: (dashId) => {
      toast({ title: "Dashboard salvo!", description: "Todas as alterações foram persistidas." });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      if (isNew && dashId) navigate(`/builder/${dashId}`, { replace: true });
    },
    onError: (err) => {
      toast({ title: "Erro ao salvar", description: (err as Error).message, variant: "destructive" });
    },
  });

  // Grid layout items — built from config (source of truth), never from onLayoutChange
  const gridLayout: Layout[] = config.widgets.map((w) => ({
    i: w.id,
    x: w.x,
    y: w.y,
    w: w.w,
    h: w.h,
    minW: w.minW || 2,
    minH: w.minH || 2,
  }));

  const isLightTheme = (config.settings.category || "") === "cameras";
  const bgStyle: React.CSSProperties = config.settings.bgGradient
    ? { background: config.settings.bgGradient }
    : { background: 'var(--category-bg, linear-gradient(180deg, hsl(228 30% 4%) 0%, hsl(230 35% 2%) 100%))' };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden" data-theme-category={config.settings.category || ""}>
      {/* ── Top Bar ── */}
      <header className="h-12 border-b border-border/30 flex items-center justify-between px-4 flex-shrink-0 glass-card-elevated z-20">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="h-8 w-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="h-5 w-px bg-border/50" />
          <span className="text-xs font-display font-bold text-primary truncate max-w-[200px]">
            {config.name || "Novo Dashboard"}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" onClick={undo} disabled={historyIdx <= 0} className="h-8 w-8" title="Desfazer">
            <Undo2 className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={redo} disabled={historyIdx >= history.length - 1} className="h-8 w-8" title="Refazer">
            <Redo2 className="w-3.5 h-3.5" />
          </Button>
          <div className="h-5 w-px bg-border/50" />
          {config.id && (
            <Button variant="ghost" size="sm" onClick={() => navigate(`/dashboard/${config.id}`)} className="gap-1.5 text-xs h-8">
              <Eye className="w-3.5 h-3.5" />
              Preview
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="gap-1.5 text-xs h-8 bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30"
          >
            <Save className="w-3.5 h-3.5" />
            {saveMutation.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* ── Left Sidebar ── */}
        <AnimatePresence mode="wait">
          {sidebarOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 450, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={`border-r border-border/30 flex flex-col h-full overflow-hidden overflow-y-auto flex-shrink-0 ${isLightTheme ? 'bg-background' : 'bg-card/50'}`}
            >
              {/* Sidebar tabs */}
              <div className="flex border-b border-border/30">
                <button
                  onClick={() => setSidebarMode("widgets")}
                  className={`flex-1 py-2 text-[9px] font-display uppercase flex items-center justify-center gap-1 transition-colors ${
                    sidebarMode === "widgets" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  Widgets
                </button>
                <button
                  onClick={() => setSidebarMode("settings")}
                  className={`flex-1 py-2 text-[9px] font-display uppercase flex items-center justify-center gap-1 transition-colors ${
                    sidebarMode === "settings" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Settings2 className="w-3 h-3" />
                  Config
                </button>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-3">
                  {sidebarMode === "widgets" && (
                    <>
                      <PresetGallery onSelect={loadPreset} />
                      <div className="my-3 border-t border-border/20" />
                      <WidgetPalette onAddWidget={addWidget} />
                    </>
                  )}
                  {sidebarMode === "settings" && (
                    <DashboardSettingsPanel config={config} onUpdate={setConfig} connections={connections} />
                  )}
                  {sidebarMode === "config" && selectedWidget && (
                    <WidgetConfigPanel
                      widget={selectedWidget}
                      onUpdate={updateWidget}
                      onDelete={deleteWidget}
                      connectionId={config.zabbix_connection_id}
                      onClose={() => {
                        setSelectedWidgetId(null);
                        setSidebarMode("widgets");
                      }}
                    />
                  )}
                </div>
              </ScrollArea>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="absolute left-0 top-14 z-30 glass-card p-1.5 rounded-r-md border border-l-0 border-border/30 text-muted-foreground hover:text-foreground transition-colors"
          style={{ left: sidebarOpen ? 450 : 0 }}
        >
          {sidebarOpen ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeft className="w-3.5 h-3.5" />}
        </button>

        {/* ── Main Canvas ── */}
        <main
          className={`flex-1 overflow-auto relative ${config.settings.showGrid !== false ? "grid-pattern" : ""} ${config.settings.scanlines !== false ? "scanlines" : ""}`}
          style={bgStyle}
        >
          {/* Ambient glow — hidden for light themes */}
          {config.settings.ambientGlow !== false && !isLightTheme && (
            <div
              className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full blur-[120px] pointer-events-none"
              style={{ background: `var(--category-glow, ${config.settings.ambientGlowColor || "#39FF14"}08)` }}
            />
          )}

          <div ref={canvasRef} className="p-4 relative z-10" style={{ width: '100%' }}>
            {config.widgets.length === 0 ? (
              <div className="flex items-center justify-center min-h-[50vh]">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-card-elevated rounded-xl p-8 text-center max-w-md"
                >
                  <Layers className="w-8 h-8 text-primary mx-auto mb-3" />
                  <h2 className="text-sm font-display font-bold text-foreground mb-2">Canvas Vazio</h2>
                  <p className="text-xs text-muted-foreground">
                    Clique nos widgets à esquerda para adicionar ao dashboard. Arraste e redimensione livremente.
                  </p>
                </motion.div>
              </div>
            ) : canvasWidth > 0 ? (
              <Responsive
                width={canvasWidth}
                layouts={{ lg: gridLayout }}
                breakpoints={{ lg: 0 }}
                cols={{ lg: config.settings.cols }}
                rowHeight={config.settings.rowHeight}
                draggableHandle=".widget-drag-handle"
                onDrag={handleDragMove}
                onDragStop={handleDragStop}
                onResize={handleDragMove}
                onResizeStop={handleResizeStop}
                isDraggable
                isResizable
                compactType="vertical"
                margin={[4, 4]}
                containerPadding={[0, 0]}
                useCSSTransforms
              >
                {config.widgets.map((widget) => (
                  <div key={widget.id} data-widget-id={widget.id}>
                    <WidgetPreviewCard
                      widget={widget}
                      isSelected={selectedWidgetId === widget.id}
                      onClick={(e) => handleWidgetClick(widget.id, e!)}
                    />
                  </div>
                ))}
              </Responsive>
            ) : null}
          </div>
        </main>
        {/* Right config panel REMOVED — config only lives in left sidebar */}
      </div>
    </div>
  );
}
