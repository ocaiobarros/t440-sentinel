import { motion } from "framer-motion";
import { Wifi, WifiOff, Activity, TrendingUp } from "lucide-react";

interface GroupStat {
  name: string;
  online: number;
  total: number;
  sla: number;
}

interface Props {
  total: number;
  online: number;
  offline: number;
  slaGeral: number;
  groupStats: GroupStat[];
}

function SlaGauge({ value }: { value: number }) {
  // Draw a semicircle gauge
  const radius = 54;
  const cx = 70;
  const cy = 70;
  const startAngle = 210;
  const endAngle = 330;
  const totalAngle = 360 - startAngle + endAngle; // 300 degrees

  function polarToXY(deg: number, r: number) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function arcPath(from: number, to: number, r: number) {
    const s = polarToXY(from, r);
    const e = polarToXY(to, r);
    const large = to - from > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  const clampedValue = Math.max(0, Math.min(100, value));
  const fillAngle = startAngle + (clampedValue / 100) * totalAngle;

  const color =
    value >= 99.5 ? "#34d399" :
    value >= 99   ? "#fbbf24" :
    value >= 95   ? "#f97316" :
    "#ef4444";

  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="100" viewBox="0 0 140 100">
        {/* Background track */}
        <path
          d={arcPath(startAngle, startAngle + totalAngle, radius)}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="10"
          strokeLinecap="round"
          opacity={0.3}
        />
        {/* Value arc */}
        <motion.path
          d={arcPath(startAngle, fillAngle, radius)}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
        {/* Glow dot at tip */}
        {(() => {
          const tip = polarToXY(fillAngle, radius);
          return (
            <motion.circle
              cx={tip.x}
              cy={tip.y}
              r="5"
              fill={color}
              style={{ filter: `drop-shadow(0 0 8px ${color})` }}
              animate={{ opacity: [1, 0.6, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          );
        })()}
        {/* Value text */}
        <text x={cx} y={cy + 10} textAnchor="middle" fill={color} fontSize="18" fontWeight="bold" fontFamily="monospace">
          {value.toFixed(2)}%
        </text>
        <text x={cx} y={cy + 24} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="7" fontFamily="monospace" opacity={0.7}>
          TAXA DE SUCESSO
        </text>
      </svg>
    </div>
  );
}

export default function FlowDispStatsSidebar({ total, online, offline, slaGeral, groupStats }: Props) {
  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto">
      {/* Counters */}
      <div className="space-y-2">
        {[
          { label: "TOTAL EQUIPAMENTOS", value: total, icon: Activity, color: "text-neon-cyan", glow: "rgba(0,255,255,0.15)" },
          { label: "TOTAL ONLINE", value: online, icon: Wifi, color: "text-emerald-400", glow: "rgba(52,211,153,0.15)" },
          { label: "TOTAL OFFLINE", value: offline, icon: WifiOff, color: "text-red-400", glow: "rgba(239,68,68,0.15)" },
        ].map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className="flex items-center gap-3 p-3 rounded-xl border border-border/20 bg-card/40"
            style={{ boxShadow: `0 0 15px ${item.glow}` }}
          >
            <item.icon className={`w-5 h-5 ${item.color} shrink-0`} />
            <div>
              <motion.p
                className={`text-2xl font-display font-black leading-none ${item.color}`}
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 0.08 + 0.1, type: "spring" }}
              >
                {item.value}
              </motion.p>
              <p className="text-[8px] font-mono text-muted-foreground/60 uppercase tracking-wider mt-0.5">{item.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* SLA Gauge */}
      <div className="rounded-xl border border-border/20 bg-card/40 p-3">
        <p className="text-[9px] font-display uppercase tracking-[0.2em] text-muted-foreground/60 text-center mb-1">SLA GERAL</p>
        <SlaGauge value={slaGeral} />
      </div>

      {/* SLA por grupo */}
      {groupStats.length > 0 && (
        <div className="rounded-xl border border-border/20 bg-card/40 p-3">
          <p className="text-[9px] font-display uppercase tracking-[0.2em] text-muted-foreground/60 mb-3 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> SLA POR GRUPO
          </p>
          <div className="space-y-2.5">
            {groupStats.map((g) => {
              const color =
                g.sla >= 99.5 ? "bg-emerald-400" :
                g.sla >= 99   ? "bg-yellow-400" :
                g.sla >= 95   ? "bg-orange-400" :
                "bg-red-400";
              const textColor =
                g.sla >= 99.5 ? "text-emerald-400" :
                g.sla >= 99   ? "text-yellow-400" :
                g.sla >= 95   ? "text-orange-400" :
                "text-red-400";
              return (
                <div key={g.name}>
                  <div className="flex justify-between items-center mb-1">
                    <div>
                      <p className="text-[9px] font-mono text-foreground font-semibold truncate max-w-[110px]">{g.name}</p>
                      <p className="text-[7px] font-mono text-muted-foreground/50">{g.online}/{g.total} online</p>
                    </div>
                    <span className={`text-[10px] font-display font-bold ${textColor}`}>{g.sla.toFixed(2)}%</span>
                  </div>
                  <div className="h-1.5 bg-border/20 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${color}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, g.sla)}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
