import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, Wifi, MapPin, ChevronRight, ChevronLeft,
  Loader2, CheckCircle2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useZabbixConnections } from "@/hooks/useZabbixConnections";

/* ── Types ── */
export interface FlowMapWizardResult {
  connectionId: string;
  connectionName: string;
  mapName: string;
}

interface Props {
  onComplete: (result: FlowMapWizardResult) => void;
  onCancel?: () => void;
}

/* ── Component ── */
export default function FlowMapSetupWizard({ onComplete, onCancel }: Props) {
  const { connections, isLoading: connectionsLoading } = useZabbixConnections();
  const [step, setStep] = useState(0); // 0=connection, 1=name

  const [selectedConnection, setSelectedConnection] = useState<{ id: string; name: string } | null>(null);
  const [mapName, setMapName] = useState("");

  const activeConnections = connections.filter((c) => c.is_active);

  const handleSelectConnection = (conn: { id: string; name: string }) => {
    setSelectedConnection(conn);
    setStep(1);
  };

  const handleFinish = () => {
    if (!selectedConnection || !mapName.trim()) return;
    onComplete({
      connectionId: selectedConnection.id,
      connectionName: selectedConnection.name,
      mapName: mapName.trim(),
    });
  };

  const steps = [
    { icon: Wifi, label: "Conexão" },
    { icon: MapPin, label: "Nome" },
  ];

  return (
    <div className="min-h-screen bg-background grid-pattern scanlines relative flex items-center justify-center p-4">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-neon-green/5 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl relative z-10"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Zap className="w-8 h-8 text-neon-green" />
            <h1 className="font-display text-2xl font-bold tracking-wider">
              <span className="text-neon-green text-glow-green">FLOWMAP</span>
              <span className="text-muted-foreground mx-2">|</span>
              <span className="text-foreground">Setup</span>
            </h1>
          </div>
          <p className="text-xs text-muted-foreground font-mono">Configure a conexão e dê um nome ao mapa</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-1 mb-8">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;
            return (
              <div key={i} className="flex items-center gap-1">
                {i > 0 && <div className={`w-6 h-px ${isDone ? "bg-neon-green" : "bg-border/30"}`} />}
                <div
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-display uppercase transition-all border ${
                    isActive
                      ? "bg-neon-green/10 text-neon-green border-neon-green/30"
                      : isDone
                        ? "bg-neon-green/5 text-neon-green/70 border-neon-green/20"
                        : "text-muted-foreground border-border/20"
                  }`}
                >
                  {isDone ? <CheckCircle2 className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div className="glass-card rounded-xl p-6 border border-border/30 min-h-[250px]">
          <AnimatePresence mode="wait">
            {/* Step 0: Connection */}
            {step === 0 && (
              <motion.div key="s0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h3 className="text-sm font-display font-bold text-foreground mb-1">Selecione a Conexão Zabbix</h3>
                <p className="text-[10px] text-muted-foreground font-mono mb-4">Conexões ativas configuradas no FlowPulse</p>
                {connectionsLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 text-neon-green animate-spin" /></div>
                ) : activeConnections.length === 0 ? (
                  <div className="text-center py-8">
                    <Wifi className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Nenhuma conexão Zabbix ativa</p>
                    <a href="/admin" className="text-[10px] text-neon-cyan hover:underline mt-1 inline-block">Ir para Admin Hub →</a>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeConnections.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => handleSelectConnection({ id: c.id, name: c.name })}
                        className="w-full glass-card rounded-lg p-4 border border-border/30 hover:border-neon-green/30 transition-all group text-left flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <Wifi className="w-5 h-5 text-neon-cyan" />
                          <div>
                            <div className="text-sm font-display font-bold text-foreground group-hover:text-neon-green transition-colors">{c.name}</div>
                            <div className="text-[10px] font-mono text-muted-foreground">{c.url}</div>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-neon-green transition-colors" />
                      </button>
                    ))}
                  </div>
                )}
                {onCancel && (
                  <div className="mt-4 text-center">
                    <button onClick={onCancel} className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors">
                      ← Voltar para lista
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 1: Map Name + Create */}
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-display font-bold text-foreground">Nome do Mapa</h3>
                    <p className="text-[10px] text-muted-foreground font-mono">Conexão: <span className="text-neon-cyan">{selectedConnection?.name}</span></p>
                  </div>
                  <button onClick={() => setStep(0)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronLeft className="w-3 h-3" /> Voltar
                  </button>
                </div>
                <div className="space-y-4">
                  <Input
                    placeholder="Ex: Backbone Nacional, Ring SP-RJ..."
                    value={mapName}
                    onChange={(e) => setMapName(e.target.value)}
                    className="text-sm"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleFinish()}
                  />
                  <p className="text-[10px] text-muted-foreground font-mono">
                    Após criar, use o Builder para adicionar hosts e links clique a clique no mapa.
                  </p>
                  <Button
                    onClick={handleFinish}
                    disabled={!mapName.trim()}
                    className="w-full gap-2 bg-neon-green/20 text-neon-green border border-neon-green/30 hover:bg-neon-green/30"
                  >
                    <MapPin className="w-4 h-4" />
                    Criar Mapa
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
