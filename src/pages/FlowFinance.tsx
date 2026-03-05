import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { DollarSign, TrendingUp, TrendingDown, Calendar, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import FinanceUploadWizard from "@/components/finance/FinanceUploadWizard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function getMonthOptions() {
  const months: { label: string; value: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    months.push({ label: label.charAt(0).toUpperCase() + label.slice(1), value });
  }
  return months;
}

export default function FlowFinance() {
  const monthOptions = useMemo(() => getMonthOptions(), []);
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);

  const { data: transactions = [], refetch, isLoading } = useQuery({
    queryKey: ["finance-transactions", selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions")
        .select("*")
        .eq("month_reference", selectedMonth)
        .order("transaction_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const summary = useMemo(() => {
    const calc = (scenario: string, type: string) =>
      transactions
        .filter((t: any) => t.scenario === scenario && t.type === type)
        .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    return {
      previstoReceber: calc("PREVISTO", "RECEBER"),
      previstoPagar: calc("PREVISTO", "PAGAR"),
      realizadoReceber: calc("REALIZADO", "RECEBER"),
      realizadoPagar: calc("REALIZADO", "PAGAR"),
    };
  }, [transactions]);

  const saldoPrevisto = summary.previstoReceber - summary.previstoPagar;
  const saldoRealizado = summary.realizadoReceber - summary.realizadoPagar;

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="min-h-screen bg-background grid-pattern scanlines relative p-4 md:p-6 lg:p-8">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10 space-y-6">
        {/* ── Header ── */}
        <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <DollarSign className="w-6 h-6 text-primary" />
              <div>
                <h1 className="text-lg font-display font-bold text-foreground">
                  <span className="text-primary text-glow-cyan">FLOW</span>FINANCE
                </h1>
                <p className="text-[10px] text-muted-foreground font-mono">
                  Gestão Financeira — Previsto vs Realizado
                </p>
              </div>
            </div>

            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-52 bg-card border-border/40">
                <Calendar className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </motion.header>

        {/* ── Summary Cards ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          <SummaryCard
            label="A Receber (Previsto)"
            value={fmt(summary.previstoReceber)}
            icon={<ArrowUpRight className="w-4 h-4" />}
            color="text-primary"
          />
          <SummaryCard
            label="A Pagar (Previsto)"
            value={fmt(summary.previstoPagar)}
            icon={<ArrowDownRight className="w-4 h-4" />}
            color="text-neon-amber"
          />
          <SummaryCard
            label="Recebido (Realizado)"
            value={fmt(summary.realizadoReceber)}
            icon={<TrendingUp className="w-4 h-4" />}
            color="text-primary"
          />
          <SummaryCard
            label="Pago (Realizado)"
            value={fmt(summary.realizadoPagar)}
            icon={<TrendingDown className="w-4 h-4" />}
            color="text-destructive"
          />
        </motion.div>

        {/* ── Saldo ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          <div className="glass-card rounded-xl p-4 border border-border/30">
            <p className="text-[9px] font-mono text-muted-foreground uppercase mb-1">Saldo Previsto</p>
            <p className={`text-xl font-display font-bold ${saldoPrevisto >= 0 ? "text-primary" : "text-destructive"}`}>
              {fmt(saldoPrevisto)}
            </p>
          </div>
          <div className="glass-card rounded-xl p-4 border border-border/30">
            <p className="text-[9px] font-mono text-muted-foreground uppercase mb-1">Saldo Realizado</p>
            <p className={`text-xl font-display font-bold ${saldoRealizado >= 0 ? "text-primary" : "text-destructive"}`}>
              {fmt(saldoRealizado)}
            </p>
          </div>
        </motion.div>

        {/* ── Upload Wizard ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider mb-3">
            Importar Dados
          </h2>
          <FinanceUploadWizard
            monthReference={selectedMonth}
            onImportComplete={() => refetch()}
          />
        </motion.div>

        {/* ── Transaction Table ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <h2 className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider mb-3">
            Transações do Período
          </h2>

          {isLoading ? (
            <div className="glass-card rounded-xl p-8 text-center">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="glass-card rounded-xl p-8 text-center">
              <DollarSign className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma transação neste período</p>
              <p className="text-[10px] text-muted-foreground/50 mt-1">Importe um ficheiro CSV acima</p>
            </div>
          ) : (
            <div className="glass-card rounded-xl border border-border/30 overflow-x-auto">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="text-muted-foreground uppercase border-b border-border/20">
                    <th className="text-left p-3">Data</th>
                    <th className="text-left p-3">Cenário</th>
                    <th className="text-left p-3">Tipo</th>
                    <th className="text-left p-3">Descrição</th>
                    <th className="text-left p-3">Categoria</th>
                    <th className="text-right p-3">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t: any) => (
                    <tr key={t.id} className="border-t border-border/10 hover:bg-muted/10 transition-colors">
                      <td className="p-3 text-foreground">
                        {new Date(t.transaction_date).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="p-3">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          t.scenario === "PREVISTO"
                            ? "bg-neon-blue/10 text-neon-blue"
                            : "bg-primary/10 text-primary"
                        }`}>
                          {t.scenario}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`${t.type === "RECEBER" ? "text-primary" : "text-neon-amber"}`}>
                          {t.type}
                        </span>
                      </td>
                      <td className="p-3 text-foreground max-w-[200px] truncate">
                        {t.description || "—"}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {t.category || "—"}
                      </td>
                      <td className="p-3 text-right font-bold text-foreground">
                        {Number(t.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        <div className="text-center py-4">
          <p className="text-[10px] font-mono text-muted-foreground/50">
            FLOWPULSE | FlowFinance • Gestão Financeira
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="glass-card rounded-xl p-4 border border-border/30">
      <div className="flex items-center gap-1.5 mb-2">
        <span className={color}>{icon}</span>
        <p className="text-[9px] font-mono text-muted-foreground uppercase">{label}</p>
      </div>
      <p className={`text-base font-display font-bold ${color}`}>{value}</p>
    </div>
  );
}
