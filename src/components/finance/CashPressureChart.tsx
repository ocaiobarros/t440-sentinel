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

function PressureTooltip({ active, payload, label, scenario }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-background/95 backdrop-blur-xl border border-border/30 px-3 py-2.5 shadow-2xl min-w-[180px]">
      <p className="font-mono text-muted-foreground/50 text-[8px] uppercase tracking-wider mb-1.5">
        Dia {label} • {scenario}
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
          {(payload[0]?.value ?? 0) > 0 ? "⚠ Saída > Entrada" : "✓ Entrada ≥ Saída"}
        </p>
      </div>
    </div>
  );
}

interface Props {
  transactions: any[];
  monthReference: string;
}

function buildDailyData(transactions: any[], monthReference: string, scenario: "PREVISTO" | "REALIZADO") {
  const [y, m] = monthReference.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();

  const filtered = transactions.filter((t: any) => t.scenario === scenario);

  const dailyMap = new Map<number, { pagar: number; receber: number }>();
  for (const t of filtered) {
    const d = new Date(t.transaction_date).getDate();
    if (!dailyMap.has(d)) dailyMap.set(d, { pagar: 0, receber: 0 });
    const entry = dailyMap.get(d)!;
    const amount = Number(t.amount) || 0;
    if (t.type === "PAGAR") entry.pagar += amount;
    else entry.receber += amount;
  }

  const data: { day: string; pressure: number }[] = [];
  let totalPressure = 0;
  let peak = { day: 0, value: 0 };

  for (let d = 1; d <= daysInMonth; d++) {
    const entry = dailyMap.get(d) || { pagar: 0, receber: 0 };
    const pressure = entry.pagar - entry.receber;
    totalPressure += pressure;
    if (Math.abs(pressure) > Math.abs(peak.value)) {
      peak = { day: d, value: pressure };
    }
    data.push({
      day: String(d).padStart(2, "0"),
      pressure: Math.round(pressure * 100) / 100,
    });
  }

  const daysWithData = data.filter((d) => d.pressure !== 0).length;
  const avg = daysWithData > 0 ? totalPressure / daysWithData : 0;

  return {
    chartData: data,
    avgPressure: Math.round(avg * 100) / 100,
    peakDay: peak,
    accumulated: Math.round(totalPressure * 100) / 100,
    hasData: filtered.length > 0,
  };
}

function PressurePanel({
  label,
  accentHue,
  chartData,
  avgPressure,
  peakDay,
  accumulated,
}: {
  label: string;
  accentHue: string;
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
            Pressão — {label}
          </h3>
          <p className="text-[9px] font-mono text-muted-foreground/50 mt-1">
            Despesas − Receitas por dia •{" "}
            <span className={avgPressure > 0 ? "text-red-400/80" : "text-emerald-400/80"}>
              Média: {fmt(avgPressure)}/dia
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3 text-[9px] font-mono text-muted-foreground/60">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "hsla(0,70%,50%,0.7)" }} />
            Pressão
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "hsla(142,70%,45%,0.7)" }} />
            Folga
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
          <Tooltip content={<PressureTooltip scenario={label} />} />
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
          <Bar dataKey="pressure" name="Pressão" radius={[3, 3, 0, 0]} barSize={8} maxBarSize={12}>
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
        Positivo = pressão (despesas &gt; receitas) • Negativo = folga
      </p>
    </div>
  );
}

export default function CashPressureChart({ transactions, monthReference }: Props) {
  const previsto = useMemo(() => buildDailyData(transactions, monthReference, "PREVISTO"), [transactions, monthReference]);
  const realizado = useMemo(() => buildDailyData(transactions, monthReference, "REALIZADO"), [transactions, monthReference]);

  if (!previsto.hasData && !realizado.hasData) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.2 }}
      className="flex flex-col lg:flex-row gap-4"
    >
      {previsto.hasData && (
        <PressurePanel
          label="Previsto"
          accentHue="210"
          chartData={previsto.chartData}
          avgPressure={previsto.avgPressure}
          peakDay={previsto.peakDay}
          accumulated={previsto.accumulated}
        />
      )}
      {realizado.hasData && (
        <PressurePanel
          label="Realizado"
          accentHue="142"
          chartData={realizado.chartData}
          avgPressure={realizado.avgPressure}
          peakDay={realizado.peakDay}
          accumulated={realizado.accumulated}
        />
      )}
    </motion.div>
  );
}
