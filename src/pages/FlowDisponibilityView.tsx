import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, RefreshCw, Loader2, Activity, Save, Settings,
  Maximize2, Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFlowDisponibilityData, type FlowDispConfig } from "@/hooks/useFlowDisponibilityData";
import FlowDispStatsSidebar from "@/components/flowdisp/FlowDispStatsSidebar";
import HostAvailCard from "@/components/flowdisp/HostAvailCard";

export default function FlowDisponibilityView() {
  const { dashboardId } = useParams<{ dashboardId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [config, setConfig] = useState<FlowDispConfig | null>(null);
  const [panelName, setPanelName] = useState<string | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [saving, setSaving] = useState(false);

  // Kiosk mode — synced with URL param so AppLayout hides sidebar+header
  const isKiosk = searchParams.get("kiosk") === "true";

  const toggleKiosk = useCallback(() => {
    const next = !isKiosk;
    const sp = new URLSearchParams(searchParams);
    if (next) {
      sp.set("kiosk", "true");
      document.documentElement.requestFullscreen?.();
    } else {
      sp.delete("kiosk");
      document.exitFullscreen?.();
    }
    navigate(`?${sp.toString()}`, { replace: true });
  }, [isKiosk, searchParams, navigate]);

  // Load dashboard config
  useEffect(() => {
    if (!dashboardId) return;
    (async () => {
      const { data } = await supabase
        .from("dashboards")
        .select("name, settings")
        .eq("id", dashboardId)
        .single();
      if (data) {
        const settings = data.settings as Record<string, unknown>;
        setConfig((settings?.wizardConfig as FlowDispConfig) ?? null);
        setPanelName(data.name);
      } else {
        toast({ title: "Painel não encontrado", variant: "destructive" });
        navigate("/app/monitoring/flowdisp");
      }
      setLoadingConfig(false);
    })();
  }, [dashboardId, navigate, toast]);

  const {
    hosts,
    loading,
    error,
    lastPoll,
    totalOnline,
    totalOffline,
    slaGeral,
    groupStats,
    refresh,
  } = useFlowDisponibilityData(config, 30_000);

  // Save current snapshot (updates updated_at)
  const handleSave = useCallback(async () => {
    if (!dashboardId) return;
    setSaving(true);
    const { error: err } = await supabase
      .from("dashboards")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", dashboardId);
    setSaving(false);
    toast({
      title: err ? "Erro ao salvar" : "Painel salvo",
      description: err ? String(err.message) : "Atualizado com sucesso.",
      variant: err ? "destructive" : "default",
    });
  }, [dashboardId, toast]);

  // Reconfigure — navigate to wizard with edit param
  const handleReconfigure = useCallback(() => {
    navigate(`/app/flowdisp/new?edit=${dashboardId}`);
  }, [dashboardId, navigate]);

  if (loadingConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center p-4">
        <div>
          <Activity className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Configuração não encontrada</p>
          <Button onClick={() => navigate("/app/monitoring/flowdisp")} variant="outline" className="mt-4">
            Voltar para lista
          </Button>
        </div>
      </div>
    );
  }

  const total = hosts.length;

  return (
    <div className="min-h-screen bg-background relative">
      {/* Animated gradient background */}
      <div className="fixed inset-0 pointer-events-none">
        <motion.div
          className="absolute top-0 left-1/4 w-[600px] h-[400px] bg-primary/3 rounded-full blur-[150px]"
          animate={{ x: [0, 50, 0], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-0 right-1/4 w-[500px] h-[300px] bg-accent/2 rounded-full blur-[120px]"
          animate={{ x: [0, -30, 0], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />
      </div>

      {/* Header — hidden in kiosk */}
      <AnimatePresence>
        {!isKiosk && (
          <motion.div
            initial={{ y: -48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -48, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="relative z-10 border-b border-border/30 bg-card/50 backdrop-blur-xl"
          >
            <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
              {/* Left: Back + Title */}
              <div className="flex items-center gap-3 min-w-0">
                <Button
                  onClick={() => navigate("/app/monitoring/flowdisp")}
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <div className="flex items-center gap-2.5 min-w-0">
                  <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }}>
                    <Activity className="w-5 h-5 text-primary shrink-0" />
                  </motion.div>
                  <div className="min-w-0">
                    <h1 className="text-sm font-display font-bold text-foreground truncate">{panelName}</h1>
                    <p className="text-[9px] font-mono text-muted-foreground truncate">
                      {config.connectionName} → {config.groupName}
                    </p>
                  </div>
                </div>
              </div>

              {/* Right: Action buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                {lastPoll && (
                  <span className="text-[9px] font-mono text-muted-foreground hidden lg:inline mr-1">
                    {lastPoll.toLocaleTimeString("pt-BR")}
                  </span>
                )}

                <Button onClick={refresh} disabled={loading} variant="outline" size="sm" className="gap-1.5 h-7">
                  <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
                  <span className="text-xs hidden sm:inline">Refresh</span>
                </Button>

                <Button onClick={handleSave} disabled={saving} variant="outline" size="sm" className="gap-1.5 h-7">
                  <Save className={`w-3 h-3 ${saving ? "animate-pulse" : ""}`} />
                  <span className="text-xs hidden sm:inline">Salvar</span>
                </Button>

                <Button onClick={handleReconfigure} variant="outline" size="sm" className="gap-1.5 h-7">
                  <Settings className="w-3 h-3" />
                  <span className="text-xs hidden sm:inline">Reconfigurar</span>
                </Button>

                <Button onClick={toggleKiosk} variant="outline" size="sm" className="gap-1.5 h-7">
                  <Maximize2 className="w-3 h-3" />
                  <span className="text-xs hidden sm:inline">Kiosk</span>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="container mx-auto px-4 py-4 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          {/* Stats sidebar */}
          <div>
            <FlowDispStatsSidebar
              total={total}
              online={totalOnline}
              offline={totalOffline}
              slaGeral={slaGeral}
              groupStats={groupStats}
            />
          </div>

          {/* Host cards grid */}
          <div className="min-h-[400px]">
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 mb-4">
                <p className="text-xs text-destructive font-mono">{error}</p>
              </div>
            )}

            {loading && hosts.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                {hosts.map((h, i) => (
                  <HostAvailCard key={h.hostId} host={h} index={i} />
                ))}
              </div>
            )}

            {!loading && hosts.length === 0 && (
              <div className="text-center py-16">
                <Activity className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">Nenhum host configurado</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Kiosk exit FAB */}
      <AnimatePresence>
        {isKiosk && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={toggleKiosk}
            className="fixed bottom-4 right-4 z-50 h-10 w-10 rounded-full
              bg-card/80 backdrop-blur-lg border border-border/30
              flex items-center justify-center
              text-muted-foreground hover:text-foreground hover:border-primary/30
              shadow-lg transition-colors"
            title="Sair do Modo Kiosk"
          >
            <Minimize2 className="h-4 w-4" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
