import { motion } from "framer-motion";
import { useWidgetData } from "@/hooks/useWidgetData";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import type { TelemetryStatData } from "@/types/telemetry";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Props {
  telemetryKey: string;
  title: string;
  cache: Map<string, TelemetryCacheEntry>;
  config?: Record<string, unknown>;
}

export default function StatWidget({ telemetryKey, title, cache, config }: Props) {
  const { data, isInitial } = useWidgetData({ telemetryKey, cache });
  const stat = data as TelemetryStatData | null;

  const trendIcon = stat?.trend
    ? stat.trend > 0 ? <TrendingUp className="w-3 h-3 text-neon-green" />
      : stat.trend < 0 ? <TrendingDown className="w-3 h-3 text-neon-red" />
      : <Minus className="w-3 h-3 text-muted-foreground" />
    : null;

  return (
    <motion.div
      initial={isInitial ? { opacity: 0, scale: 0.95 } : false}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card rounded-lg p-4 h-full flex flex-col items-center justify-center gap-2 border border-border/50"
    >
      <span className="text-[10px] font-display uppercase tracking-wider text-muted-foreground truncate w-full text-center">
        {title}
      </span>
      {stat ? (
        <>
          <span className="text-2xl font-bold font-mono-data text-glow-green text-neon-green">
            {typeof stat.value === "number" ? stat.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : stat.value}
          </span>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            {stat.unit && <span>{stat.unit}</span>}
            {trendIcon}
          </div>
        </>
      ) : (
        <span className="text-lg text-muted-foreground/50 font-mono animate-pulse">—</span>
      )}
    </motion.div>
  );
}
