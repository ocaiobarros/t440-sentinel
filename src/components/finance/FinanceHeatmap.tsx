import { useMemo } from "react";
import { motion } from "framer-motion";

interface Props {
  transactions: any[];
  monthReference: string;
}

export default function FinanceHeatmap({ transactions, monthReference }: Props) {
  const { cells, maxAbs } = useMemo(() => {
    const [y, m] = monthReference.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const firstDayOfWeek = new Date(y, m - 1, 1).getDay();

    const dailyMap = new Map<number, number>();
    for (const t of transactions) {
      const d = new Date(t.transaction_date).getDate();
      const sign = t.type === "RECEBER" ? 1 : -1;
      dailyMap.set(d, (dailyMap.get(d) || 0) + Number(t.amount) * sign);
    }

    const max = Math.max(...[...dailyMap.values()].map(Math.abs), 1);
    const grid: { day: number; value: number; empty?: boolean }[] = [];

    for (let i = 0; i < firstDayOfWeek; i++) {
      grid.push({ day: 0, value: 0, empty: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      grid.push({ day: d, value: dailyMap.get(d) || 0 });
    }

    return { cells: grid, maxAbs: max };
  }, [transactions, monthReference]);

  if (transactions.length === 0) return null;

  // Quiet by default. Only anomalies glow.
  const getStyle = (value: number) => {
    const intensity = Math.min(Math.abs(value) / maxAbs, 1);
    if (value === 0) {
      return { bg: "hsl(215, 15%, 8%)", opacity: 0.4 };
    }
    if (value > 0) {
      // Positive: very subtle green that intensifies only for big surpluses
      const alpha = 0.08 + intensity * 0.5;
      return { bg: `hsla(142, 70%, 45%, ${alpha})`, opacity: 1 };
    }
    // Negative: quiet until significant, then glows red
    if (intensity < 0.3) {
      // Minor deficit - barely visible
      return { bg: `hsla(0, 50%, 40%, ${0.1 + intensity * 0.2})`, opacity: 0.7 };
    }
    // Significant deficit - alerts
    const alpha = 0.3 + intensity * 0.5;
    return { bg: `hsla(0, 70%, 45%, ${alpha})`, opacity: 1 };
  };

  const weekdays = ["D", "S", "T", "Q", "Q", "S", "S"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.6 }}
      className="rounded-2xl bg-card/20 backdrop-blur-sm p-6"
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-[9px] font-mono tracking-[0.3em] text-muted-foreground/40 uppercase">
          Mapa Térmico
        </h3>
        <div className="flex items-center gap-3 text-[7px] font-mono text-muted-foreground/25">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "hsla(0,70%,45%,0.6)" }} />
            déficit
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "hsl(215,15%,8%)" }} />
            neutro
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "hsla(142,70%,45%,0.5)" }} />
            superávit
          </span>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekdays.map((d, i) => (
          <div key={i} className="text-center text-[7px] font-mono text-muted-foreground/20 uppercase">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid — compact */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          const style = cell.empty ? null : getStyle(cell.value);
          return (
            <div key={i} className="relative group">
              <div
                className={`aspect-[4/3] rounded-md flex items-center justify-center transition-all duration-300 ${
                  !cell.empty ? "hover:scale-110 hover:z-10" : ""
                }`}
                style={{
                  backgroundColor: cell.empty ? "transparent" : style!.bg,
                  opacity: cell.empty ? 0 : style!.opacity,
                }}
              >
                {!cell.empty && (
                  <span className="text-[8px] font-mono text-foreground/50">
                    {cell.day}
                  </span>
                )}
              </div>

              {/* Tooltip */}
              {!cell.empty && cell.value !== 0 && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-50 pointer-events-none">
                  <div className="rounded-md bg-background/95 backdrop-blur-xl border border-border/30 px-2 py-1 text-[8px] font-mono shadow-xl whitespace-nowrap">
                    <span className={cell.value >= 0 ? "text-emerald-400" : "text-red-400"}>
                      {cell.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
