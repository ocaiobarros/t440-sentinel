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
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { motion } from "framer-motion";
import { TrendingUp, BarChart3 } from "lucide-react";

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const tickFmt = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(v);
};

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-card/95 backdrop-blur-xl border border-border/50 p-4 text-xs shadow-2xl">
      <p className="font-mono text-muted-foreground mb-2 text-[10px] uppercase tracking-wider">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color || p.fill }} className="font-semibold text-sm">
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
}

interface Props {
  monthReference: string;
}

export default function FinanceCharts({ monthReference }: Props) {
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

  const chartData = (() => {
    const map = new Map<string, any>();
    for (const row of raw) {
      const dateStr = new Date(row.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      if (!map.has(dateStr)) {
        map.set(dateStr, { date: dateStr });
      }
      const entry = map.get(dateStr)!;
      if (row.scenario === "PREVISTO") {
        entry.previsto = Number(row.running_balance);
        entry.netPrevisto = Number(row.daily_net_flow);
      } else {
        entry.realizado = Number(row.running_balance);
        entry.netRealizado = Number(row.daily_net_flow);
        entry.variance = Number(row.variance);
      }
    }
    return Array.from(map.values());
  })();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {[0, 1].map(i => (
          <div key={i} className="rounded-2xl bg-card/60 border border-border/20 p-6 h-[340px] animate-pulse">
            <div className="h-3 w-32 bg-muted rounded mb-4" />
            <div className="h-full bg-muted/30 rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="rounded-2xl bg-card/60 border border-border/20 p-8 text-center">
        <BarChart3 className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">Importe dados para visualizar os gráficos</p>
      </div>
    );
  }

  const hasRealizado = chartData.some(d => d.realizado !== undefined);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* S-Curve: Area Chart */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/20 p-5 shadow-lg"
      >
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <h3 className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-[0.2em]">
            S-Curve — Saldo Acumulado
          </h3>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="gradPrevisto" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(210, 100%, 56%)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(210, 100%, 56%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradRealizado" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(142, 100%, 50%)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(142, 100%, 50%)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(215, 20%, 12%)" opacity={0.5} />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(215, 15%, 40%)" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={tickFmt} tick={{ fontSize: 9, fill: "hsl(215, 15%, 40%)" }} width={50} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
              formatter={(v: string) => <span className="text-muted-foreground text-[10px]">{v}</span>}
            />
            <Area
              type="monotone"
              dataKey="previsto"
              name="Previsto"
              stroke="hsl(210, 100%, 56%)"
              strokeWidth={2}
              strokeDasharray="6 3"
              fill="url(#gradPrevisto)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, fill: "hsl(210, 100%, 56%)" }}
            />
            {hasRealizado && (
              <Area
                type="monotone"
                dataKey="realizado"
                name="Realizado"
                stroke="hsl(142, 100%, 50%)"
                strokeWidth={2.5}
                fill="url(#gradRealizado)"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, fill: "hsl(142, 100%, 50%)" }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Waterfall: Bar Chart with Gain/Loss colors */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/20 p-5 shadow-lg"
      >
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-amber-400" />
          <h3 className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-[0.2em]">
            Waterfall — Fluxo Diário {hasRealizado ? "(Realizado)" : "(Previsto)"}
          </h3>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="barGain" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(142, 80%, 45%)" stopOpacity={0.9} />
                <stop offset="100%" stopColor="hsl(142, 80%, 35%)" stopOpacity={0.7} />
              </linearGradient>
              <linearGradient id="barLoss" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(0, 75%, 50%)" stopOpacity={0.9} />
                <stop offset="100%" stopColor="hsl(0, 75%, 40%)" stopOpacity={0.7} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(215, 20%, 12%)" opacity={0.5} />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(215, 15%, 40%)" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={tickFmt} tick={{ fontSize: 9, fill: "hsl(215, 15%, 40%)" }} width={50} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="hsl(215, 15%, 25%)" strokeWidth={1} />
            <Bar
              dataKey={hasRealizado ? "netRealizado" : "netPrevisto"}
              name="Fluxo Líquido"
              radius={[4, 4, 0, 0]}
            >
              {chartData.map((entry, index) => {
                const val = hasRealizado ? entry.netRealizado : entry.netPrevisto;
                return (
                  <Cell
                    key={`cell-${index}`}
                    fill={(val ?? 0) >= 0 ? "url(#barGain)" : "url(#barLoss)"}
                  />
                );
              })}
            </Bar>
            {hasRealizado && (
              <Bar
                dataKey="variance"
                name="Variância"
                radius={[4, 4, 0, 0]}
                fill="hsl(43, 100%, 50%)"
                opacity={0.35}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  );
}
