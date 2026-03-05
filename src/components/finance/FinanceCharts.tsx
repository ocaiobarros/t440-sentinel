import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { motion } from "framer-motion";

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const tickFmt = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(v);
};

function MinimalTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-background/95 backdrop-blur-xl border border-border/30 px-3 py-2 shadow-2xl">
      <p className="font-mono text-muted-foreground/50 text-[8px] uppercase tracking-wider mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3 py-0.5">
          <span className="text-[9px] font-mono text-muted-foreground/70">{p.name}</span>
          <span style={{ color: p.color || p.fill }} className="font-mono font-semibold text-xs">
            {typeof p.value === "number" ? fmt(p.value) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

interface Props {
  monthReference: string;
  transactions: any[];
}

export default function FinanceCharts({ monthReference, transactions }: Props) {
  const { data: raw = [], isLoading } = useQuery({
    queryKey: ["finance-performance", monthReference],
    queryFn: async () => {
      const start = monthReference;
      const [y, m] = monthReference.split("-").map(Number);
      const endDate = new Date(y, m, 0);
      const end = `${y}-${String(m).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;

      const { data, error } = await supabase
        .from("vw_financial_daily_performance" as any)
        .select("*")
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // S-Curve data
  const chartData = useMemo(() => {
    const map = new Map<string, any>();
    for (const row of raw) {
      const dateStr = new Date(row.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      if (!map.has(dateStr)) map.set(dateStr, { date: dateStr });
      const entry = map.get(dateStr)!;
      if (row.scenario === "PREVISTO") {
        entry.previsto = Number(row.running_balance);
      } else {
        entry.realizado = Number(row.running_balance);
      }
    }
    const entries = Array.from(map.values());
    for (const e of entries) {
      if (e.previsto !== undefined) {
        const m = Math.abs(e.previsto) * 0.1;
        e.bandHigh = e.previsto + m;
        e.bandLow = e.previsto - m;
      }
    }
    return entries;
  }, [raw]);

  // Pressure line chart: cross-scenario comparison
  // Pressão Operacional = Realizado PAGAR (F) - Previsto PAGAR (B)
  // Pressão Financeira  = Realizado RECEBER (G) - Previsto RECEBER (C)
  const pressureLineData = useMemo(() => {
    const [y, m] = monthReference.split("-").map(Number);
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

    const data: { day: string; pressaoOperacional: number | null; pressaoFinanceira: number | null }[] = [];
    const hasPrev = transactions.some((t: any) => t.scenario === "PREVISTO");
    const hasReal = transactions.some((t: any) => t.scenario === "REALIZADO");
    const hasBoth = hasPrev && hasReal;

    for (let d = 1; d <= daysInMonth; d++) {
      const entry = dailyMap.get(d) || { prevPagar: 0, prevReceber: 0, realPagar: 0, realReceber: 0 };
      data.push({
        day: String(d).padStart(2, "0"),
        // F - B: quanto a mais (ou menos) foi pago vs previsto
        pressaoOperacional: hasBoth ? Math.round((entry.realPagar - entry.prevPagar) * 100) / 100 : null,
        // G - C: quanto a mais (ou menos) foi recebido vs previsto
        pressaoFinanceira: hasBoth ? Math.round((entry.realReceber - entry.prevReceber) * 100) / 100 : null,
      });
    }

    return { data, hasBoth };
  }, [transactions, monthReference]);

  const hasRealizado = chartData.some(d => d.realizado !== undefined);
  const isOutsideBand = chartData.some(d =>
    d.realizado !== undefined && d.bandHigh !== undefined &&
    (d.realizado > d.bandHigh || d.realizado < d.bandLow)
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 rounded-2xl bg-card/20 h-[360px] animate-pulse" />
        <div className="lg:col-span-2 rounded-2xl bg-card/20 h-[360px] animate-pulse" />
      </div>
    );
  }

  if (chartData.length === 0 && transactions.length === 0) {
    return (
      <div className="rounded-2xl bg-card/20 p-16 text-center">
        <p className="text-[10px] font-mono text-muted-foreground/30 uppercase tracking-[0.3em]">
          Importe dados para ativar a visualização
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* ── S-Curve: Tendência de Saldo (60%) ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="lg:col-span-3 rounded-2xl bg-card/20 backdrop-blur-sm p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-[10px] font-mono tracking-[0.3em] text-muted-foreground/70 uppercase">
              Tendência de Saldo
            </h3>
            {isOutsideBand && (
              <p className="text-[9px] font-mono text-amber-400/70 mt-1">
                ⚠ Realizado fora do corredor de confiança
              </p>
            )}
          </div>
          <div className="flex items-center gap-4 text-[9px] font-mono text-muted-foreground/60">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-px bg-[hsl(210,100%,56%)] inline-block" style={{ borderTop: "1px dashed hsl(210,100%,56%)" }} />
              Previsto
            </span>
            {hasRealizado && (
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-emerald-400 inline-block rounded" />
                Realizado
              </span>
            )}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(210,100%,56%)" stopOpacity={0.06} />
                <stop offset="100%" stopColor="hsl(210,100%,56%)" stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id="realizadoFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(142,100%,50%)" stopOpacity={0.15} />
                <stop offset="100%" stopColor="hsl(142,100%,50%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(210,20%,60%)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tickFormatter={tickFmt} tick={{ fontSize: 9, fill: "hsl(210,20%,60%)" }} width={50} axisLine={false} tickLine={false} />
            <Tooltip content={<MinimalTooltip />} />
            <ReferenceLine y={0} stroke="hsl(215,15%,15%)" strokeWidth={0.5} />

            <Area type="monotone" dataKey="bandHigh" stroke="none" fill="url(#bandFill)" dot={false} activeDot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="bandLow" stroke="hsl(210,100%,56%)" strokeWidth={0.5} strokeDasharray="2 4" strokeOpacity={0.15} fill="hsl(var(--background))" dot={false} activeDot={false} isAnimationActive={false} />

            <Area type="monotone" dataKey="previsto" stroke="hsl(210,100%,56%)" strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.5} fill="none" dot={false} activeDot={{ r: 3, strokeWidth: 1, fill: "hsl(210,100%,56%)" }} />

            {hasRealizado && (
              <Area type="monotone" dataKey="realizado" stroke="hsl(142,100%,50%)" strokeWidth={2} fill="url(#realizadoFill)" dot={false} activeDot={{ r: 4, strokeWidth: 1.5, fill: "hsl(142,100%,50%)" }} />
            )}
          </AreaChart>
        </ResponsiveContainer>

        {!hasRealizado && (
          <p className="text-[8px] font-mono text-amber-400/40 text-center mt-3 tracking-wider">
            Projeção baseada no previsto — tracejado indica estimativa
          </p>
        )}
      </motion.div>

      {/* ── Pressão de Caixa Diária (Line Chart - 40%) ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1 }}
        className="lg:col-span-2 rounded-2xl bg-card/20 backdrop-blur-sm p-6"
      >
        <div className="mb-6">
          <h3 className="text-[10px] font-mono tracking-[0.3em] text-muted-foreground/70 uppercase">
            Pressão de Caixa Diária
          </h3>
          <p className="text-[9px] font-mono text-muted-foreground/50 mt-1">
            Realizado − Previsto por dia • Positivo = desvio para cima
          </p>
        </div>

        <div className="flex items-center gap-4 mb-4 text-[9px] font-mono text-muted-foreground/60">
          {pressureLineData.hasBoth && (
            <>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 inline-block rounded" style={{ backgroundColor: "hsl(210,100%,56%)" }} />
                Operacional (F−B)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-emerald-400 inline-block rounded" />
                Financeira (G−C)
              </span>
            </>
          )}
        </div>

        {pressureLineData.data.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={pressureLineData.data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <XAxis dataKey="day" tick={{ fontSize: 8, fill: "hsl(210,20%,60%)" }} axisLine={false} tickLine={false} interval={1} />
              <YAxis tickFormatter={tickFmt} tick={{ fontSize: 9, fill: "hsl(210,20%,60%)" }} width={50} axisLine={false} tickLine={false} />
              <Tooltip content={<MinimalTooltip />} />
              <ReferenceLine y={0} stroke="hsl(215,15%,20%)" strokeWidth={1} label="" />

              {pressureLineData.hasBoth && (
                <>
                  <Line
                    type="monotone"
                    dataKey="pressaoOperacional"
                    name="Operacional (F−B)"
                    stroke="hsl(210,100%,56%)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 1, fill: "hsl(210,100%,56%)" }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="pressaoFinanceira"
                    name="Financeira (G−C)"
                    stroke="hsl(142,100%,50%)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 1.5, fill: "hsl(142,100%,50%)" }}
                    connectNulls
                  />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[260px] flex items-center justify-center">
            <p className="text-[9px] font-mono text-muted-foreground/20 uppercase tracking-wider">
              Sem transações para análise
            </p>
          </div>
        )}

        <p className="text-[8px] font-mono text-muted-foreground/30 text-center mt-2 tracking-wider">
          Operacional: Pago(F) − Previsto Pagar(B) • Financeira: Recebido(G) − Previsto Receber(C)
        </p>
      </motion.div>
    </div>
  );
}
