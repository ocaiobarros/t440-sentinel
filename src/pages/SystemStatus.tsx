import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Server, Cpu, HardDrive, MemoryStick, Activity,
  Database, Clock, RefreshCw, Loader2, MonitorCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

/* ─── Types ─── */
interface SystemData {
  os: { name: string; kernel: string; arch: string };
  app_version: string;
  uptime: { system_seconds: number; app_seconds: number };
  cpu: {
    model: string; cores: number; usage_percent: number;
    frequency_mhz: number;
    per_core: { core: number; usage: number }[];
  };
  memory: { total_gb: number; used_gb: number; percent: number };
  swap: { total_gb: number; used_gb: number; percent: number };
  disks: { mount: string; totalGb: number; usedGb: number; percent: number }[];
  database: { size_mb: number; engine: string };
  services: { name: string; status: string; pid: number }[];
  collected_at: string;
}

/* ─── Helpers ─── */
function fmtUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

function barColor(pct: number) {
  if (pct < 60) return "bg-[hsl(var(--neon-green))]";
  if (pct < 85) return "bg-[hsl(var(--neon-amber))]";
  return "bg-destructive";
}

/* ─── Page ─── */
export default function SystemStatus() {
  const [data, setData] = useState<SystemData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const { data: resp, error } = await supabase.functions.invoke("system-status");
      if (error) throw error;
      setData(resp as SystemData);
    } catch {
      toast.error("Erro ao buscar status do sistema");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Server className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground font-display tracking-tight">Status do Host</h1>
            <p className="text-xs text-muted-foreground">Saúde do sistema em tempo real</p>
          </div>
        </div>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </motion.div>

      {/* ── Top Cards ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <InfoCard icon={MonitorCheck} label="Sistema Operacional" value={data.os.name} sub={`Kernel ${data.os.kernel}`} />
        <InfoCard icon={Activity} label="Uptime do Sistema" value={fmtUptime(data.uptime.system_seconds)} sub={`App: ${fmtUptime(data.uptime.app_seconds)}`} />
        <InfoCard icon={Database} label="Banco de Dados" value={`${data.database.size_mb} MB`} sub={data.database.engine} />
        <InfoCard icon={Cpu} label="FLOWPULSE" value={`v${data.app_version}`} sub={`Porta 3060 • ${data.os.arch}`} />
      </motion.div>

      {/* ── Resource Bars ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="glass-card rounded-xl p-6 space-y-5">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" /> Monitoramento de Recursos
        </h2>

        {/* CPU */}
        <ResourceBar
          label="CPU"
          detail={`${data.cpu.usage_percent}% • ${data.cpu.frequency_mhz} MHz`}
          percent={data.cpu.usage_percent}
        />

        {/* RAM */}
        <ResourceBar
          label="Memória RAM"
          detail={`${data.memory.used_gb} GB / ${data.memory.total_gb} GB (${data.memory.percent}%)`}
          percent={data.memory.percent}
        />

        {/* Swap */}
        <ResourceBar
          label="Swap"
          detail={`${data.swap.used_gb} GB / ${data.swap.total_gb} GB (${data.swap.percent}%)`}
          percent={data.swap.percent}
        />

        {/* Disks */}
        {data.disks.map((d) => (
          <ResourceBar
            key={d.mount}
            label={`Disco ${d.mount}`}
            detail={`${d.usedGb} GB / ${d.totalGb} GB (${d.percent}%)`}
            percent={d.percent}
          />
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── CPU Cores Grid ── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="glass-card rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" /> Detalhes da CPU
          </h2>
          <p className="text-[10px] text-muted-foreground font-mono">{data.cpu.model}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {data.cpu.per_core.map((c) => (
              <div key={c.core} className="rounded-lg border border-border bg-muted/20 p-3 text-center space-y-2">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  Core #{c.core}
                </span>
                <div className="relative mx-auto w-12 h-12">
                  <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
                    <circle cx="18" cy="18" r="15.5" fill="none" className="stroke-muted/40" strokeWidth="3" />
                    <circle
                      cx="18" cy="18" r="15.5" fill="none"
                      className={c.usage < 60 ? "stroke-[hsl(var(--neon-green))]" : c.usage < 85 ? "stroke-[hsl(var(--neon-amber))]" : "stroke-destructive"}
                      strokeWidth="3"
                      strokeDasharray={`${(c.usage / 100) * 97.4} 97.4`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold font-mono text-foreground">
                    {c.usage}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Services ── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="glass-card rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-primary" /> Status de Serviços
          </h2>
          <div className="space-y-3">
            {data.services.map((svc) => (
              <div key={svc.name} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    svc.status === "running"
                      ? "bg-[hsl(var(--neon-green))] shadow-[0_0_6px_hsl(var(--neon-green)/0.5)]"
                      : "bg-destructive shadow-[0_0_6px_hsl(var(--destructive)/0.5)]"
                  }`} />
                  <span className="text-sm font-mono text-foreground">{svc.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-muted-foreground">PID {svc.pid}</span>
                  <span className={`text-[10px] font-mono font-semibold uppercase ${
                    svc.status === "running" ? "text-[hsl(var(--neon-green))]" : "text-destructive"
                  }`}>
                    {svc.status === "running" ? "ATIVO" : "INATIVO"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-border/50">
            <p className="text-[10px] text-muted-foreground font-mono">
              Última coleta: {new Date(data.collected_at).toLocaleString("pt-BR")}
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function InfoCard({ icon: Icon, label, value, sub }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; sub: string;
}) {
  return (
    <div className="glass-card rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] font-mono uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-base font-bold text-foreground font-display leading-tight">{value}</p>
      <p className="text-[10px] text-muted-foreground font-mono">{sub}</p>
    </div>
  );
}

function ResourceBar({ label, detail, percent }: { label: string; detail: string; percent: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span className="text-[10px] font-mono text-muted-foreground">{detail}</span>
      </div>
      <div className="h-2.5 rounded-full bg-muted/30 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className={`h-full rounded-full ${barColor(percent)}`}
        />
      </div>
    </div>
  );
}
