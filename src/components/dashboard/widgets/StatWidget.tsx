import { motion } from "framer-motion";
import { useWidgetData } from "@/hooks/useWidgetData";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import type { TelemetryStatData } from "@/types/telemetry";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { getThermalColor, getThermalGlow, isThermalMetric } from "@/lib/thermal-scale";
import { useMemo } from "react";

interface Props {
  telemetryKey: string;
  title: string;
  cache: Map<string, TelemetryCacheEntry>;
  config?: Record<string, unknown>;
  compact?: boolean;
}

export default function StatWidget({ telemetryKey, title, cache, config, compact }: Props) {
  const { data, isInitial } = useWidgetData({ telemetryKey, cache });
  const stat = data as TelemetryStatData | null;

  const trendIcon = stat?.trend
    ? stat.trend > 0 ? <TrendingUp className="w-3 h-3 text-neon-green" />
      : stat.trend < 0 ? <TrendingDown className="w-3 h-3 text-neon-red" />
      : <Minus className="w-3 h-3 text-muted-foreground" />
    : null;

  // Thermal color logic
  const thermal = useMemo(() => {
    if (!stat || typeof stat.value !== "number") return null;
    if (!isThermalMetric(title, stat.unit)) return null;
    const color = getThermalColor(stat.value);
    const glow = getThermalGlow(stat.value);
    return { color, glow };
  }, [stat?.value, title, stat?.unit]);

  const valueColor = thermal?.color ?? undefined;
  const valueShadow = thermal
    ? thermal.glow
    : '0 0 8px hsl(var(--primary) / 0.6), 0 0 24px hsl(var(--primary) / 0.25)';

  return (
    <motion.div
      initial={isInitial ? { opacity: 0, scale: 0.95 } : false}
      animate={{ opacity: 1, scale: 1 }}
      className={`glass-card rounded-lg ${compact ? "p-2 gap-1" : "p-4 gap-2"} h-full flex flex-col items-center justify-center border border-border/50`}
    >
      <span className={`${compact ? "text-[8px]" : "text-[10px]"} font-display uppercase tracking-wider text-muted-foreground truncate w-full text-center`}>
        {title}
      </span>
      {stat ? (
        <>
          <span
            className={`${compact ? "text-lg" : "text-2xl"} font-bold font-mono-data ${!thermal ? "text-primary" : ""}`}
            style={{ color: valueColor, textShadow: valueShadow }}
          >
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
