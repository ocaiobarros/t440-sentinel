import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Cell,
} from "recharts";

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const tickFmt = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(v);
};

function PressureTooltip({ active, payload, label, metric }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-background/95 backdrop-blur-xl border border-border/30 px-3 py-2.5 shadow-2xl min-w-[180px]">
      <p className="font-mono text-muted-foreground/50 text-[8px] uppercase tracking-wider mb-1.5">
        Dia {label} • {metric}
      </p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3 py-0.5">
          <span className="text-[9px] font-mono text-muted-foreground/70">{p.name}</span>
          <span
            style={{ color: p.value > 0 ? "hsl(0,70%,55%)" : p.value < 0 ? "hsl(142,70%,50%)" : "hsl(210,20%,60%)" }}
            className="font-mono font-semibold text-xs"
          >
            {fmt(p.value)}
          </span>
        </div>
      ))}
      <div className="border-t border-border/20 mt-1.5 pt-1.5">
        <p className="text-[8px] font-mono text-muted-foreground/40">
          {(payload[0]?.value ?? 0) > 0 ? "⚠ Realizado > Previsto" : "✓ Previsto ≥ Realizado"}
        </p>
      </div>
    </div>
  );
}

interface Props {
  transactions: any[];
  monthReference: string;
}

function PressurePanel({
  label,
  subtitle,
  chartData,
  avgPressure,
  peakDay,
  accumulated,
}: {
  label: string;
  subtitle: string;
  chartData: { day: string; pressure: number }[];
  avgPressure: number;
  peakDay: { day: number; value: number };
  accumulated: number;
}) {
  return (
    <div className="rounded-2xl bg-card/20 backdrop-blur-sm p-5 flex-1 min-w-0">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[10px] font-mono tracking-[0.3em] text-muted-foreground/70 uppercase">
            {label}
          </h3>
          <p className="text-[9px] font-mono text-muted-foreground/50 mt-1">
            {subtitle} •{" "}
            <span className={avgPressure > 0 ? "text-red-400/80" : "text-emerald-400/80"}>
              Média: {fmt(avgPressure)}/dia
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3 text-[9px] font-mono text-muted-foreground/60">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "hsla(0,70%,50%,0.7)" }} />
            Acima
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "hsla(142,70%,45%,0.7)" }} />
            Abaixo
          </span>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl bg-card/30 p-2.5">
          <p className="text-[8px] font-mono text-muted-foreground/50 uppercase tracking-wider">Média Diária</p>
          <p className={`text-sm font-mono font-bold mt-0.5 ${avgPressure > 0 ? "text-red-400" : "text-emerald-400"}`}>
            {fmt(avgPressure)}
          </p>
        </div>
        <div className="rounded-xl bg-card/30 p-2.5">
          <p className="text-[8px] font-mono text-muted-foreground/50 uppercase tracking-wider">Pico</p>
          <p className={`text-sm font-mono font-bold mt-0.5 ${peakDay.value > 0 ? "text-red-400" : "text-emerald-400"}`}>
            {fmt(peakDay.value)}
          </p>
          <p className="text-[8px] font-mono text-muted-foreground/40">Dia {peakDay.day}</p>
        </div>
        <div className="rounded-xl bg-card/30 p-2.5">
          <p className="text-[8px] font-mono text-muted-foreground/50 uppercase tracking-wider">Acumulado</p>
          <p className={`text-sm font-mono font-bold mt-0.5 ${accumulated > 0 ? "text-red-400" : "text-emerald-400"}`}>
            {fmt(accumulated)}
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id={`pressRed-${label}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(0,70%,55%)" stopOpacity={0.9} />
              <stop offset="100%" stopColor="hsl(0,70%,40%)" stopOpacity={0.6} />
            </linearGradient>
            <linearGradient id={`pressGreen-${label}`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="hsl(142,70%,45%)" stopOpacity={0.9} />
              <stop offset="100%" stopColor="hsl(142,70%,35%)" stopOpacity={0.6} />
            </linearGradient>
          </defs>
          <XAxis dataKey="day" tick={{ fontSize: 8, fill: "hsl(210,20%,60%)" }} axisLine={false} tickLine={false} interval={1} />
          <YAxis tickFormatter={tickFmt} tick={{ fontSize: 9, fill: "hsl(210,20%,60%)" }} width={50} axisLine={false} tickLine={false} />
          <Tooltip content={<PressureTooltip metric={label} />} />
          <ReferenceLine y={0} stroke="hsl(215,15%,20%)" strokeWidth={1} />
          {avgPressure !== 0 && (
            <ReferenceLine
              y={avgPressure}
              stroke={avgPressure > 0 ? "hsl(0,60%,50%)" : "hsl(142,60%,45%)"}
              strokeWidth={1}
              strokeDasharray="4 3"
              strokeOpacity={0.5}
            />
          )}
          <Bar dataKey="pressure" name="Desvio" radius={[3, 3, 0, 0]} barSize={8} maxBarSize={12}>
            {chartData.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.pressure > 0 ? `url(#pressRed-${label})` : entry.pressure < 0 ? `url(#pressGreen-${label})` : "hsl(215,15%,15%)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <p className="text-[8px] font-mono text-muted-foreground/30 text-center mt-2 tracking-wider">
        Positivo = realizado &gt; previsto • Negativo = previsto &gt; realizado
      </p>
    </div>
  );
}

export default function CashPressureChart({ transactions, monthReference }: Props) {
  const { operacional, financeira, hasBoth } = useMemo(() => {
    const [y, m] = monthReference.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();

    const hasPrev = transactions.some((t: any) => t.scenario === "PREVISTO");
    const hasReal = transactions.some((t: any) => t.scenario === "REALIZADO");

    if (!hasPrev || !hasReal) {
      return { operacional: null, financeira: null, hasBoth: false };
    }

    // Build daily aggregation
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

    // Operacional: F - B (realPagar - prevPagar)
    const opData: { day: string; pressure: number }[] = [];
    let opTotal = 0, opPeak = { day: 0, value: 0 }, opDaysWithData = 0;

    // Financeira: G - C (realReceber - prevReceber)
    const finData: { day: string; pressure: number }[] = [];
    let finTotal = 0, finPeak = { day: 0, value: 0 }, finDaysWithData = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const entry = dailyMap.get(d) || { prevPagar: 0, prevReceber: 0, realPagar: 0, realReceber: 0 };
      
      const opPressure = Math.round((entry.realPagar - entry.prevPagar) * 100) / 100;
      opData.push({ day: String(d).padStart(2, "0"), pressure: opPressure });
      opTotal += opPressure;
      if (opPressure !== 0) opDaysWithData++;
      if (Math.abs(opPressure) > Math.abs(opPeak.value)) opPeak = { day: d, value: opPressure };

      const finPressure = Math.round((entry.realReceber - entry.prevReceber) * 100) / 100;
      finData.push({ day: String(d).padStart(2, "0"), pressure: finPressure });
      finTotal += finPressure;
      if (finPressure !== 0) finDaysWithData++;
      if (Math.abs(finPressure) > Math.abs(finPeak.value)) finPeak = { day: d, value: finPressure };
    }

    return {
      operacional: {
        chartData: opData,
        avgPressure: opDaysWithData > 0 ? Math.round((opTotal / opDaysWithData) * 100) / 100 : 0,
        peakDay: opPeak,
        accumulated: Math.round(opTotal * 100) / 100,
      },
      financeira: {
        chartData: finData,
        avgPressure: finDaysWithData > 0 ? Math.round((finTotal / finDaysWithData) * 100) / 100 : 0,
        peakDay: finPeak,
        accumulated: Math.round(finTotal * 100) / 100,
      },
      hasBoth: true,
    };
  }, [transactions, monthReference]);

  if (!hasBoth || !operacional || !financeira) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.2 }}
      className="flex flex-col lg:flex-row gap-4"
    >
      <PressurePanel
        label="Pressão Operacional"
        subtitle="Pago(F) − Prev. Pagar(B)"
        chartData={operacional.chartData}
        avgPressure={operacional.avgPressure}
        peakDay={operacional.peakDay}
        accumulated={operacional.accumulated}
      />
      <PressurePanel
        label="Pressão Financeira"
        subtitle="Recebido(G) − Prev. Receber(C)"
        chartData={financeira.chartData}
        avgPressure={financeira.avgPressure}
        peakDay={financeira.peakDay}
        accumulated={financeira.accumulated}
      />
    </motion.div>
  );
}
