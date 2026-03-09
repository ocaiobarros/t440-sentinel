import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFlowDisponibilityData, type FlowDispConfig } from "@/hooks/useFlowDisponibilityData";
import FlowDispStatsSidebar from "@/components/flowdisp/FlowDispStatsSidebar";
import HostAvailCard from "@/components/flowdisp/HostAvailCard";
import MonitoringHeader, { useKioskMode } from "@/components/layout/MonitoringHeader";

export default function FlowDisponibilityView() {
  const { dashboardId } = useParams<{ dashboardId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [config, setConfig] = useState<FlowDispConfig | null>(null);
  const [panelName, setPanelName] = useState<string | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [saving, setSaving] = useState(false);
  const isKiosk = useKioskMode();

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

      <MonitoringHeader
        title={panelName || "Flow Disponibility"}
        subtitle={`${config.connectionName} → ${config.groupName}`}
        icon={<motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }}><Activity className="w-5 h-5 text-primary" /></motion.div>}
        backPath="/app/monitoring/flowdisp"
        onRefresh={refresh}
        isRefreshing={loading}
        onSave={handleSave}
        saving={saving}
        onReconfigure={handleReconfigure}
        lastRefresh={lastPoll}
      />

      {/* Main content — full width */}
      <div className="w-full px-3 py-3 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-3">
          <div>
            <FlowDispStatsSidebar
              total={total}
              online={totalOnline}
              offline={totalOffline}
              slaGeral={slaGeral}
              groupStats={groupStats}
            />
          </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6 4k:grid-cols-8 gap-2.5 3xl:gap-4">
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
