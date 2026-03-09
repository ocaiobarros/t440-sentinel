import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, RefreshCw, Loader2, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFlowDisponibilityData, type FlowDispConfig } from "@/hooks/useFlowDisponibilityData";
import FlowDispStatsSidebar from "@/components/flowdisp/FlowDispStatsSidebar";
import HostAvailCard from "@/components/flowdisp/HostAvailCard";

export default function FlowDisponibilityView() {
  const { dashboardId } = useParams<{ dashboardId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [config, setConfig] = useState<FlowDispConfig | null>(null);
  const [panelName, setPanelName] = useState<string | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

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

  if (loadingConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-neon-green animate-spin" />
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
          className="absolute top-0 left-1/4 w-[600px] h-[400px] bg-neon-green/3 rounded-full blur-[150px]"
          animate={{ x: [0, 50, 0], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-0 right-1/4 w-[500px] h-[300px] bg-neon-cyan/2 rounded-full blur-[120px]"
          animate={{ x: [0, -30, 0], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />
      </div>

      {/* Header */}
      <div className="relative z-10 border-b border-border/30 bg-card/50 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/app/monitoring/flowdisp")} className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5">
              <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }}>
                <Activity className="w-6 h-6 text-neon-green" />
              </motion.div>
              <div>
                <h1 className="text-sm font-display font-bold text-foreground">{panelName}</h1>
                <p className="text-[9px] font-mono text-muted-foreground">
                  {config.connectionName} → {config.groupName}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {lastPoll && (
              <span className="text-[9px] font-mono text-muted-foreground hidden sm:inline">
                Última atualização: {lastPoll.toLocaleTimeString("pt-BR")}
              </span>
            )}
            <Button onClick={refresh} disabled={loading} variant="outline" size="sm" className="gap-1.5 h-7">
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              <span className="text-xs hidden sm:inline">Atualizar</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="container mx-auto px-4 py-4 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          {/* Stats sidebar (left column) */}
          <div>
            <FlowDispStatsSidebar
              total={total}
              online={totalOnline}
              offline={totalOffline}
              slaGeral={slaGeral}
              groupStats={groupStats}
            />
          </div>

          {/* Host cards grid (right column) */}
          <div className="min-h-[400px]">
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 mb-4">
                <p className="text-xs text-red-400 font-mono">{error}</p>
              </div>
            )}

            {loading && hosts.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 text-neon-green animate-spin" />
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
    </div>
  );
}
