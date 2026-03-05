import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";

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
    <div className="rounded-lg bg-popover/95 backdrop-blur border border-border p-3 text-xs shadow-xl">
      <p className="font-mono text-muted-foreground mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-semibold">
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
      // Derive month start/end from monthReference (YYYY-MM-DD)
      const start = monthReference;
      const [y, m] = monthReference.split("-").map(Number);
      const endDate = new Date(y, m, 0); // last day of month
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

  // Build chart data: pivot scenarios into single rows per date
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
      <div className="glass-card rounded-xl p-8 text-center">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="glass-card rounded-xl p-6 text-center">
        <p className="text-xs text-muted-foreground">Importe dados para visualizar os gráficos</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* S-Curve: Running Balance */}
      <div className="glass-card rounded-xl p-4 border border-border/30">
        <h3 className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-wider mb-3">
          S-Curve — Saldo Acumulado
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tickFormatter={tickFmt} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={50} />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 10 }}
              formatter={(v: string) => <span className="text-muted-foreground">{v}</span>}
            />
            <Line
              type="monotone"
              dataKey="previsto"
              name="Previsto"
              stroke="hsl(var(--neon-blue))"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="realizado"
              name="Realizado"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Waterfall: Daily Net Flow */}
      <div className="glass-card rounded-xl p-4 border border-border/30">
        <h3 className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-wider mb-3">
          Waterfall — Fluxo Diário (Realizado)
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tickFormatter={tickFmt} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={50} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.4} />
            <Bar
              dataKey="netRealizado"
              name="Fluxo Líquido"
              radius={[3, 3, 0, 0]}
              fill="hsl(var(--primary))"
              opacity={0.85}
            />
            <Bar
              dataKey="variance"
              name="Variância"
              radius={[3, 3, 0, 0]}
              fill="hsl(var(--neon-amber))"
              opacity={0.6}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
