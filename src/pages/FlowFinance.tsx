import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DollarSign, Calendar, ChevronDown, ChevronUp, TableIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import FinanceUploadWizard from "@/components/finance/FinanceUploadWizard";
import FinanceCharts from "@/components/finance/FinanceCharts";
import ExecutiveKPICards from "@/components/finance/ExecutiveKPICards";
import FinanceInsight from "@/components/finance/FinanceInsight";
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
  const [showTable, setShowTable] = useState(false);

  const selectedLabel = monthOptions.find(m => m.value === selectedMonth)?.label ?? "";

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
  const hasRealizado = summary.realizadoReceber > 0 || summary.realizadoPagar > 0;

  const varianciaPercent = saldoPrevisto !== 0
    ? ((saldoRealizado - saldoPrevisto) / Math.abs(saldoPrevisto)) * 100
    : 0;

  // Runway: months of cash remaining based on avg monthly burn
  const avgBurn = summary.realizadoPagar > 0 ? summary.realizadoPagar : summary.previstoPagar;
  const runwayCaixa = avgBurn > 0 ? saldoRealizado / avgBurn : 0;

  // Assertividade: how close realizado is to previsto (100% = perfect match)
  const totalPrevisto = summary.previstoReceber + summary.previstoPagar;
  const totalRealizado = summary.realizadoReceber + summary.realizadoPagar;
  const assertividade = totalPrevisto > 0
    ? Math.max(0, 100 - Math.abs(((totalRealizado - totalPrevisto) / totalPrevisto) * 100))
    : 0;

  return (
    <div className="min-h-screen bg-background relative">
      {/* Subtle ambient glow */}
      <div className="fixed top-0 left-1/3 w-[800px] h-[400px] bg-emerald-500/3 rounded-full blur-[150px] pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-[600px] h-[300px] bg-neon-blue/3 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10 p-4 md:p-6 lg:p-8 space-y-6">
        {/* ── Header ── */}
        <motion.header
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between flex-wrap gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <DollarSign className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-display font-bold text-foreground tracking-tight">
                <span className="text-emerald-400">FLOW</span>FINANCE
              </h1>
              <p className="text-[10px] text-muted-foreground font-mono tracking-wider">
                Executive Dashboard — Previsto vs Realizado
              </p>
            </div>
          </div>

          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-56 bg-card/80 border-border/30 backdrop-blur-sm rounded-xl">
              <Calendar className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </motion.header>

        {/* ── Month Status Banner (when no realizado) ── */}
        {!hasRealizado && transactions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl border border-amber-500/20 bg-amber-500/5 backdrop-blur-sm px-5 py-3 flex items-center gap-3"
          >
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <p className="text-xs font-mono text-amber-300/90">
              <span className="font-bold">{selectedLabel}:</span> Em curso — Aguardando dados Realizados. Exibindo projeções com base no Previsto.
            </p>
          </motion.div>
        )}

        {/* ── KPI Cards ── */}
        <ExecutiveKPICards
          data={{
            saldoAcumulado: hasRealizado ? saldoRealizado : saldoPrevisto,
            varianciaPercent,
            runwayCaixa: Math.max(0, runwayCaixa),
            assertividade,
            hasRealizado,
          }}
        />

        {/* ── Charts ── */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <FinanceCharts monthReference={selectedMonth} />
        </motion.div>

        {/* ── Insights ── */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <h2 className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Insights Automáticos
          </h2>
          <FinanceInsight
            transactions={transactions}
            saldoPrevisto={saldoPrevisto}
            saldoRealizado={saldoRealizado}
            hasRealizado={hasRealizado}
            monthLabel={selectedLabel}
          />
        </motion.div>

        {/* ── Upload Wizard ── */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <h2 className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-[0.2em] mb-3">
            Importar Dados
          </h2>
          <FinanceUploadWizard
            monthReference={selectedMonth}
            onImportComplete={() => refetch()}
          />
        </motion.div>

        {/* ── Collapsible Transaction Table ── */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <button
            onClick={() => setShowTable(!showTable)}
            className="flex items-center gap-2 text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-[0.2em] mb-3 hover:text-foreground transition-colors group"
          >
            <TableIcon className="w-3.5 h-3.5" />
            Transações do Período ({transactions.length})
            {showTable
              ? <ChevronUp className="w-3 h-3 group-hover:text-foreground" />
              : <ChevronDown className="w-3 h-3 group-hover:text-foreground" />
            }
          </button>

          <AnimatePresence>
            {showTable && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                {isLoading ? (
                  <div className="rounded-2xl bg-card/60 border border-border/20 p-8 text-center">
                    <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="rounded-2xl bg-card/60 border border-border/20 p-8 text-center">
                    <DollarSign className="w-10 h-10 text-muted-foreground/15 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Nenhuma transação neste período</p>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/20 overflow-x-auto shadow-lg">
                    <table className="w-full text-[11px] font-mono">
                      <thead>
                        <tr className="text-muted-foreground uppercase border-b border-border/15 text-[9px] tracking-wider">
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
                          <tr key={t.id} className="border-t border-border/8 hover:bg-muted/10 transition-colors">
                            <td className="p-3 text-foreground/80">
                              {new Date(t.transaction_date).toLocaleDateString("pt-BR")}
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold ${
                                t.scenario === "PREVISTO"
                                  ? "bg-neon-blue/10 text-neon-blue border border-neon-blue/20"
                                  : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              }`}>
                                {t.scenario}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className={`${t.type === "RECEBER" ? "text-emerald-400" : "text-amber-400"}`}>
                                {t.type}
                              </span>
                            </td>
                            <td className="p-3 text-foreground/70 max-w-[200px] truncate">
                              {t.description || "—"}
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {t.category || "—"}
                            </td>
                            <td className="p-3 text-right font-bold text-foreground/90">
                              {Number(t.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <div className="text-center py-6">
          <p className="text-[9px] font-mono text-muted-foreground/30 tracking-widest uppercase">
            FlowPulse • FlowFinance Executive Dashboard
          </p>
        </div>
      </div>
    </div>
  );
}
