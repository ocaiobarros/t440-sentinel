import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, FileText, Calendar, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface BillingEntry {
  hostId: string;
  name: string;
  ip: string;
  zabbixCounter: number;
  baseCounter: number;
  billingCounter: number;
  serial: string;
}

interface BillingLog {
  id: string;
  period: string;
  snapshot_at: string;
  entries: BillingEntry[];
  total_pages: number;
}

export default function BillingHistory() {
  const navigate = useNavigate();

  const { data: logs = [], isLoading } = useQuery<BillingLog[]>({
    queryKey: ["billing-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_logs")
        .select("*")
        .order("period", { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? []).map((d: any) => ({
        ...d,
        entries: Array.isArray(d.entries) ? d.entries : JSON.parse(d.entries || "[]"),
      }));
    },
  });

  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-background grid-pattern scanlines relative p-4 md:p-6 lg:p-8">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-neon-cyan/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10">
        <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6 text-neon-cyan" />
            <div>
              <h1 className="text-lg font-display font-bold text-foreground">
                <span className="text-neon-cyan text-glow-cyan">HISTÓRICO</span> DE FECHAMENTOS
              </h1>
              <p className="text-[10px] text-muted-foreground font-mono">
                Snapshots mensais de contadores de impressão
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate("/app/monitoring/printers")}
            className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground/50 hover:text-muted-foreground transition-colors mt-3"
          >
            <ArrowLeft className="w-3 h-3" /> Voltar
          </button>
        </motion.header>

        {isLoading && (
          <div className="glass-card rounded-xl p-16 text-center">
            <Loader2 className="w-8 h-8 text-neon-cyan animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground font-mono">Carregando histórico...</p>
          </div>
        )}

        {!isLoading && logs.length === 0 && (
          <div className="glass-card rounded-xl p-12 text-center">
            <Calendar className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum fechamento registrado</p>
            <p className="text-[10px] text-muted-foreground/50 mt-1">Os snapshots são gerados automaticamente no dia 30 de cada mês</p>
          </div>
        )}

        <div className="space-y-3">
          {logs.map((log) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card rounded-xl border border-border/30 overflow-hidden"
            >
              <button
                onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-neon-cyan" />
                  </div>
                  <div>
                    <h3 className="text-sm font-display font-bold text-foreground">{log.period}</h3>
                    <p className="text-[9px] font-mono text-muted-foreground">
                      {new Date(log.snapshot_at).toLocaleString("pt-BR")} • {log.entries.length} impressoras
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-display font-bold text-neon-cyan">
                    {log.total_pages.toLocaleString("pt-BR")}
                  </p>
                  <p className="text-[8px] font-mono text-muted-foreground uppercase">páginas</p>
                </div>
              </button>

              {expanded === log.id && (
                <div className="border-t border-border/20 p-4">
                  <table className="w-full text-[10px] font-mono">
                    <thead>
                      <tr className="text-muted-foreground uppercase">
                        <th className="text-left pb-2">Nome</th>
                        <th className="text-right pb-2">Base</th>
                        <th className="text-right pb-2">Zabbix</th>
                        <th className="text-right pb-2 font-bold text-foreground">Faturado</th>
                        <th className="text-left pb-2 pl-3">Serial</th>
                      </tr>
                    </thead>
                    <tbody>
                      {log.entries.map((e, i) => (
                        <tr key={i} className="border-t border-border/10">
                          <td className="py-1.5 text-foreground">{e.name}</td>
                          <td className="py-1.5 text-right text-muted-foreground">{e.baseCounter.toLocaleString("pt-BR")}</td>
                          <td className="py-1.5 text-right text-muted-foreground">{e.zabbixCounter.toLocaleString("pt-BR")}</td>
                          <td className="py-1.5 text-right font-bold text-neon-cyan">{e.billingCounter.toLocaleString("pt-BR")}</td>
                          <td className="py-1.5 pl-3 text-muted-foreground">{e.serial || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          ))}
        </div>

        <div className="text-center py-4 mt-4">
          <p className="text-[10px] font-mono text-muted-foreground/50">
            FLOWPULSE | Billing History • Snapshots mensais automáticos
          </p>
        </div>
      </div>
    </div>
  );
}
