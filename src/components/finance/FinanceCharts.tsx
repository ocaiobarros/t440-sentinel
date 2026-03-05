import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
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
        <p key={p.dataKey} style={{ color: p.color || p.fill }} className="font-mono font-semibold text-xs">
          {typeof p.value === "number" ? fmt(p.value) : "—"}
        </p>
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

  // Build S-Curve data
  const chartData = (() => {
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
    // Add confidence band (±10%)
    const entries = Array.from(map.values());
    for (const e of entries) {
      if (e.previsto !== undefined) {
        const m = Math.abs(e.previsto) * 0.1;
        e.bandHigh = e.previsto + m;
        e.bandLow = e.previsto - m;
      }
    }
    return entries;
  })();

  // Build Waterfall: TOP impact events by CATEGORY, not by day
  const waterfallData = (() => {
    if (!transactions.length) return [];
    const catMap = new Map<string, { receber: number; pagar: number }>();
    for (const t of transactions) {
      const cat = t.category || t.description || "Outros";
      if (!catMap.has(cat)) catMap.set(cat, { receber: 0, pagar: 0 });
      const entry = catMap.get(cat)!;
      if (t.type === "RECEBER") entry.receber += Number(t.amount);
      else entry.pagar += Number(t.amount);
    }
    // Net impact per category
    const impacts = [...catMap.entries()]
      .map(([cat, v]) => ({ category: cat.length > 18 ? cat.slice(0, 16) + "…" : cat, impact: v.receber - v.pagar }))
      .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
      .slice(0, 7); // Top 7 impacts
    return impacts;
  })();

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

  if (chartData.length === 0 && waterfallData.length === 0) {
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
      {/* ── S-Curve: 60% width ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="lg:col-span-3 rounded-2xl bg-card/20 backdrop-blur-sm p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-[9px] font-mono tracking-[0.3em] text-muted-foreground/40 uppercase">
              Tendência de Saldo
            </h3>
            {isOutsideBand && (
              <p className="text-[9px] font-mono text-amber-400/70 mt-1">
                ⚠ Realizado fora do corredor de confiança
              </p>
            )}
          </div>
          <div className="flex items-center gap-4 text-[8px] font-mono text-muted-foreground/30">
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
            <XAxis
              dataKey="date"
              tick={{ fontSize: 8, fill: "hsl(215,15%,25%)" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={tickFmt}
              tick={{ fontSize: 8, fill: "hsl(215,15%,25%)" }}
              width={50}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<MinimalTooltip />} />
            <ReferenceLine y={0} stroke="hsl(215,15%,15%)" strokeWidth={0.5} />

            {/* Confidence band - upper boundary */}
            <Area
              type="monotone"
              dataKey="bandHigh"
              stroke="none"
              fill="url(#bandFill)"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
            {/* Confidence band - lower boundary (fills background) */}
            <Area
              type="monotone"
              dataKey="bandLow"
              stroke="hsl(210,100%,56%)"
              strokeWidth={0.5}
              strokeDasharray="2 4"
              strokeOpacity={0.15}
              fill="hsl(var(--background))"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />

            {/* Previsto */}
            <Area
              type="monotone"
              dataKey="previsto"
              stroke="hsl(210,100%,56%)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              strokeOpacity={0.5}
              fill="none"
              dot={false}
              activeDot={{ r: 3, strokeWidth: 1, fill: "hsl(210,100%,56%)" }}
            />

            {/* Realizado */}
            {hasRealizado && (
              <Area
                type="monotone"
                dataKey="realizado"
                stroke="hsl(142,100%,50%)"
                strokeWidth={2}
                fill="url(#realizadoFill)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 1.5, fill: "hsl(142,100%,50%)" }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>

        {!hasRealizado && (
          <p className="text-[8px] font-mono text-amber-400/40 text-center mt-3 tracking-wider">
            Projeção baseada no previsto — tracejado indica estimativa
          </p>
        )}
      </motion.div>

      {/* ── Waterfall: Top Impact Events (40% width) ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1 }}
        className="lg:col-span-2 rounded-2xl bg-card/20 backdrop-blur-sm p-6"
      >
        <div className="mb-6">
          <h3 className="text-[9px] font-mono tracking-[0.3em] text-muted-foreground/40 uppercase">
            Impacto por Categoria
          </h3>
          <p className="text-[8px] font-mono text-muted-foreground/25 mt-1">
            Top {waterfallData.length} eventos — O que moveu o caixa
          </p>
        </div>

        {waterfallData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={waterfallData}
              layout="vertical"
              margin={{ top: 0, right: 5, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="impactPositive" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="hsl(142,80%,40%)" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="hsl(142,80%,45%)" stopOpacity={0.9} />
                </linearGradient>
                <linearGradient id="impactNegative" x1="1" y1="0" x2="0" y2="0">
                  <stop offset="0%" stopColor="hsl(0,70%,45%)" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="hsl(0,70%,50%)" stopOpacity={0.9} />
                </linearGradient>
              </defs>
              <XAxis
                type="number"
                tickFormatter={tickFmt}
                tick={{ fontSize: 8, fill: "hsl(215,15%,25%)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="category"
                tick={{ fontSize: 8, fill: "hsl(215,15%,35%)" }}
                width={90}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<MinimalTooltip />} />
              <ReferenceLine x={0} stroke="hsl(215,15%,15%)" strokeWidth={0.5} />
              <Bar dataKey="impact" name="Impacto" radius={[0, 4, 4, 0]} barSize={18}>
                {waterfallData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.impact >= 0 ? "url(#impactPositive)" : "url(#impactNegative)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[280px] flex items-center justify-center">
            <p className="text-[9px] font-mono text-muted-foreground/20 uppercase tracking-wider">
              Sem transações para análise
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
