import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart3, ChevronLeft, ChevronRight, Settings2, X, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import FinanceUploadWizard from "@/components/finance/FinanceUploadWizard";
import PressureAnalysisChart from "@/components/finance/PressureAnalysisChart";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

/* ── Helpers ── */
const fmtBRL = (v: number) =>
  "R$ " + Math.round(v).toLocaleString("pt-BR");

const tickFmt = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(v);
};

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function getAvailableMonths(): { label: string; value: string; shortLabel: string }[] {
  const months: { label: string; value: string; shortLabel: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    const shortLabel = MONTH_NAMES[d.getMonth()];
    months.push({ label, value, shortLabel });
  }
  return months;
}

/* ── Tooltip ── */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-card border border-border px-3 py-2 shadow-xl">
      <p className="text-xs text-muted-foreground mb-1">Dia {label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <span className="text-xs text-muted-foreground">{p.name}</span>
          <span style={{ color: p.color }} className="font-semibold text-xs">
            {typeof p.value === "number" ? fmtBRL(p.value) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Types ── */
type ChartType = "line" | "bar" | "combined";
type Metric = "pagamentos" | "recebimentos" | "saldo";

export default function FlowFinance() {
  const allMonths = useMemo(() => getAvailableMonths(), []);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [metric, setMetric] = useState<Metric>("pagamentos");
  const { activeTenantId } = useTenantFilter();

  const selectedMonth = allMonths[selectedIdx].value;
  const selectedLabel = allMonths[selectedIdx].label;

  // Show up to 3 months as tabs
  const visibleMonths = allMonths.slice(0, 3);

  const goPrev = useCallback(() => setSelectedIdx(i => Math.min(i + 1, allMonths.length - 1)), [allMonths.length]);
  const goNext = useCallback(() => setSelectedIdx(i => Math.max(i - 1, 0)), []);

  const { data: transactions = [], refetch } = useQuery({
    queryKey: ["finance-transactions", selectedMonth, activeTenantId],
    queryFn: async () => {
      let q = supabase
        .from("financial_transactions")
        .select("*")
        .eq("month_reference", selectedMonth)
        .order("transaction_date", { ascending: true });
      if (activeTenantId) q = q.eq("tenant_id", activeTenantId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  /* ── KPI Aggregation ── */
  const kpis = useMemo(() => {
    const calc = (scenario: string, type: string) =>
      transactions
        .filter((t: any) => t.scenario === scenario && t.type === type)
        .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    const prevPagar = calc("PREVISTO", "PAGAR");
    const realPagar = calc("REALIZADO", "PAGAR");
    const prevReceber = calc("PREVISTO", "RECEBER");
    const realReceber = calc("REALIZADO", "RECEBER");

    const saldoPrevisto = prevReceber - prevPagar;
    const saldoRealizado = realReceber - realPagar;

    const diffPagar = realPagar - prevPagar;
    const diffReceber = realReceber - prevReceber;

    return {
      prevPagar, realPagar, prevReceber, realReceber,
      saldoPrevisto, saldoRealizado,
      diffPagar, diffReceber,
      hasData: transactions.length > 0,
    };
  }, [transactions]);

  /* ── Chart Data ── */
  const chartData = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();

    const dailyMap = new Map<number, { prevPagar: number; prevReceber: number; realPagar: number; realReceber: number }>();
    for (const t of transactions) {
      const d = new Date(t.transaction_date).getDate();
      if (!dailyMap.has(d)) dailyMap.set(d, { prevPagar: 0, prevReceber: 0, realPagar: 0, realReceber: 0 });
      const entry = dailyMap.get(d)!;
      const amount = Number(t.amount) || 0;
      if (t.scenario === "PREVISTO") {
        if (t.type === "PAGAR") entry.prevPagar += amount;
        else entry.prevReceber += amount;
      } else {
        if (t.type === "PAGAR") entry.realPagar += amount;
        else entry.realReceber += amount;
      }
    }

    const data: any[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const entry = dailyMap.get(d) || { prevPagar: 0, prevReceber: 0, realPagar: 0, realReceber: 0 };
      data.push({
        day: String(d),
        prevPagar: entry.prevPagar,
        realPagar: entry.realPagar,
        prevReceber: entry.prevReceber,
        realReceber: entry.realReceber,
        saldoPrevisto: entry.prevReceber - entry.prevPagar,
        saldoRealizado: entry.realReceber - entry.realPagar,
      });
    }
    return data;
  }, [transactions, selectedMonth]);

  const metricConfig: Record<Metric, { title: string; keys: { prev: string; real: string; prevName: string; realName: string } }> = {
    pagamentos: { title: "Pagamentos", keys: { prev: "prevPagar", real: "realPagar", prevName: "Previsto Pagar", realName: "Realizado Pago" } },
    recebimentos: { title: "Recebimentos", keys: { prev: "prevReceber", real: "realReceber", prevName: "Previsto Receber", realName: "Realizado Recebido" } },
    saldo: { title: "Saldo", keys: { prev: "saldoPrevisto", real: "saldoRealizado", prevName: "Saldo Previsto", realName: "Saldo Realizado" } },
  };

  const mc = metricConfig[metric];
  const [yM, mM] = selectedMonth.split("-").map(Number);
  const chartTitle = `${MONTH_NAMES[mM - 1]} ${yM} - ${mc.title}: Previsto vs Realizado`;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-6 md:py-10 space-y-8">

        {/* ── Header ── */}
        <motion.header
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-between"
        >
          <div>
            <div className="flex items-center gap-2.5">
              <BarChart3 className="w-6 h-6 text-neon-blue" />
              <h1 className="text-xl font-bold text-foreground">Dashboard Financeiro</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Análise Interativa: Previsto vs Realizado ({visibleMonths.map(m => m.shortLabel.slice(0, 3)).join(", ")} {yM})
            </p>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
          >
            <Settings2 className="w-5 h-5" />
          </button>
        </motion.header>

        <hr className="border-border/30" />

        {/* ── Month Navigation ── */}
        <div className="rounded-2xl bg-card/40 border border-border/20 p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={goPrev}
              disabled={selectedIdx >= allMonths.length - 1}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 transition px-3 py-1.5 rounded-lg hover:bg-accent"
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>

            <div className="flex items-center gap-2">
              {visibleMonths.map((m, i) => (
                <button
                  key={m.value}
                  onClick={() => setSelectedIdx(i)}
                  className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                    selectedIdx === i
                      ? "bg-neon-blue text-white shadow-lg shadow-neon-blue/20"
                      : "bg-accent/50 text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {m.shortLabel}
                </button>
              ))}
            </div>

            <button
              onClick={goNext}
              disabled={selectedIdx <= 0}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 transition px-3 py-1.5 rounded-lg hover:bg-accent"
            >
              Próximo <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Month Title ── */}
        <div>
          <h2 className="text-lg font-bold text-foreground">{selectedLabel}</h2>
          <p className="text-sm text-muted-foreground">Resumo do desempenho financeiro</p>
        </div>

        {/* ── KPI Cards ── */}
        {kpis.hasData ? (
          <div className="space-y-4">
            {/* Top row: 4 cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard label="Pagamentos Previstos" value={kpis.prevPagar} color="blue" />
              <KPICard label="Pagamentos Realizados" value={kpis.realPagar} color="blue" diff={kpis.diffPagar} />
              <KPICard label="Recebimentos Previstos" value={kpis.prevReceber} color="green" />
              <KPICard label="Recebimentos Realizados" value={kpis.realReceber} color="green" diff={kpis.diffReceber} />
            </div>
            {/* Bottom row: 2 balance cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <BalanceCard label="Saldo Previsto (Receber - Pagar)" value={kpis.saldoPrevisto} />
              <BalanceCard label="Saldo Realizado (Receber - Pagar)" value={kpis.saldoRealizado} />
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-card/30 border border-border/20 p-12 text-center">
            <p className="text-muted-foreground text-sm">Nenhum dado importado para este mês</p>
            <button
              onClick={() => setShowSettings(true)}
              className="mt-3 text-neon-blue hover:underline text-sm"
            >
              Importar dados
            </button>
          </div>
        )}

        {/* ── Chart Controls + Chart ── */}
        {kpis.hasData && (
          <>
            <div className="rounded-2xl bg-card/40 border border-border/20 p-5">
              <div className="flex flex-col sm:flex-row gap-6">
                {/* Chart Type */}
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">Tipo de Gráfico</p>
                  <div className="flex gap-1">
                    {(["line", "bar", "combined"] as ChartType[]).map(t => (
                      <button
                        key={t}
                        onClick={() => setChartType(t)}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          chartType === t
                            ? "bg-neon-blue text-white"
                            : "bg-accent/50 text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {t === "line" ? "Linha" : t === "bar" ? "Barra" : "Combinado"}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Metric */}
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">Métrica</p>
                  <div className="flex flex-col gap-1">
                    {(["pagamentos", "recebimentos", "saldo"] as Metric[]).map(m => (
                      <button
                        key={m}
                        onClick={() => setMetric(m)}
                        className={`px-4 py-1.5 rounded-lg text-sm text-left font-medium transition-all ${
                          metric === m
                            ? "bg-neon-blue text-white"
                            : "bg-accent/30 text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {m === "pagamentos" ? "Pagamentos" : m === "recebimentos" ? "Recebimentos" : "Saldo"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="rounded-2xl bg-card/40 border border-border/20 p-6">
              <h3 className="text-base font-bold text-foreground mb-6">{chartTitle}</h3>
              <ResponsiveContainer width="100%" height={380}>
                {chartType === "bar" ? (
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={tickFmt} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={55} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: 12 }}
                      formatter={(val: string) => <span className="text-muted-foreground">{val}</span>}
                    />
                    <Bar dataKey={mc.keys.prev} name={mc.keys.prevName} fill="hsl(var(--neon-blue))" radius={[3, 3, 0, 0]} barSize={10} />
                    <Bar dataKey={mc.keys.real} name={mc.keys.realName} fill="hsl(35, 100%, 55%)" radius={[3, 3, 0, 0]} barSize={10} />
                  </BarChart>
                ) : chartType === "line" ? (
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={tickFmt} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={55} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: 12 }}
                      formatter={(val: string) => <span className="text-muted-foreground">{val}</span>}
                    />
                    <Line type="monotone" dataKey={mc.keys.prev} name={mc.keys.prevName} stroke="hsl(var(--neon-blue))" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey={mc.keys.real} name={mc.keys.realName} stroke="hsl(35, 100%, 55%)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                ) : (
                  <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={tickFmt} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={55} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: 12 }}
                      formatter={(val: string) => <span className="text-muted-foreground">{val}</span>}
                    />
                    <Bar dataKey={mc.keys.prev} name={mc.keys.prevName} fill="hsl(var(--neon-blue))" radius={[3, 3, 0, 0]} barSize={10} opacity={0.7} />
                    <Line type="monotone" dataKey={mc.keys.real} name={mc.keys.realName} stroke="hsl(35, 100%, 55%)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* ── Pressure Analysis ── */}
            <PressureAnalysisChart transactions={transactions} monthReference={selectedMonth} />
          </>
        )}

        {/* ── Settings Panel ── */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-x-0 bottom-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border/20 p-6 md:p-8 max-h-[60vh] overflow-y-auto"
            >
              <div className="max-w-3xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">Importar & Gerenciar</h2>
                  <button
                    onClick={() => setShowSettings(false)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <FinanceUploadWizard
                  monthReference={selectedMonth}
                  onImportComplete={() => { refetch(); }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function KPICard({ label, value, color, diff }: { label: string; value: number; color: "blue" | "green"; diff?: number }) {
  const borderColor = color === "blue" ? "border-neon-blue/30" : "border-emerald-500/30";
  const bgTint = color === "blue" ? "bg-neon-blue/5" : "bg-emerald-500/5";
  const textColor = color === "blue" ? "text-neon-blue" : "text-emerald-400";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border ${borderColor} ${bgTint} p-5`}
    >
      <p className="text-sm text-muted-foreground mb-2">{label}</p>
      <p className={`text-2xl font-bold ${textColor}`}>{fmtBRL(value)}</p>
      {diff !== undefined && diff !== 0 && (
        <div className={`flex items-center gap-1 mt-2 text-xs ${diff > 0 ? "text-emerald-400" : "text-red-400"}`}>
          <TrendingUp className="w-3.5 h-3.5" />
          <span>{diff > 0 ? "+" : ""}{fmtBRL(diff)}</span>
        </div>
      )}
    </motion.div>
  );
}

function BalanceCard({ label, value }: { label: string; value: number }) {
  const isNeg = value < 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border p-5 ${isNeg ? "border-red-500/20 bg-red-500/5" : "border-emerald-500/20 bg-emerald-500/5"}`}
    >
      <p className="text-sm text-muted-foreground mb-2">{label}</p>
      <p className={`text-2xl font-bold ${isNeg ? "text-red-400" : "text-emerald-400"}`}>
        {isNeg ? "-" : ""}R$ {Math.abs(Math.round(value)).toLocaleString("pt-BR")}
      </p>
    </motion.div>
  );
}
