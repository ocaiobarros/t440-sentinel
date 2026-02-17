import { motion, useSpring, useTransform } from "framer-motion";
import { useWidgetData } from "@/hooks/useWidgetData";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import type { TelemetryGaugeData } from "@/types/telemetry";
import { extractRawValue } from "@/lib/telemetry-utils";

interface Props {
  telemetryKey: string;
  title: string;
  cache: Map<string, TelemetryCacheEntry>;
  config?: Record<string, unknown>;
  compact?: boolean;
}

export default function GaugeWidget({ telemetryKey, title, cache, config, compact }: Props) {
  const { data, isInitial } = useWidgetData({ telemetryKey, cache });
  const gauge = data as TelemetryGaugeData | null;

  // Support both gauge objects and raw numeric values
  const rawValue = extractRawValue(data);
  const min = gauge?.min ?? (config?.min as number) ?? 0;
  const max = gauge?.max ?? (config?.max as number) ?? 100;
  const value = gauge?.value ?? (rawValue !== null ? parseFloat(rawValue) : 0);
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  // SVG arc gauge
  const radius = 40;
  const circumference = Math.PI * radius;

  // Smooth animated values
  const springPct = useSpring(pct, { stiffness: 60, damping: 20 });
  const animatedOffset = useTransform(springPct, (v) => circumference - (v / 100) * circumference);

  const color = pct > 80 ? "hsl(0 100% 40%)" : pct > 60 ? "hsl(43 100% 50%)" : "hsl(110 100% 54%)";

  return (
    <motion.div
      initial={isInitial ? { opacity: 0, scale: 0.95 } : false}
      animate={{ opacity: 1, scale: 1 }}
      className={`glass-card rounded-lg ${compact ? "p-2 gap-0.5" : "p-4 gap-1"} h-full flex flex-col items-center justify-center border border-border/50`}
    >
      <span className={`${compact ? "text-[8px]" : "text-[10px]"} font-display uppercase tracking-wider text-muted-foreground truncate w-full text-center`}>
        {title}
      </span>
      <svg viewBox="0 0 100 60" className="w-full max-w-[120px]">
        {/* Background arc */}
        <path
          d="M 10 55 A 40 40 0 0 1 90 55"
          fill="none"
          stroke="hsl(220 15% 20%)"
          strokeWidth="6"
          strokeLinecap="round"
        />
        {/* Gradient definition */}
        <defs>
          <linearGradient id={`gauge-grad-${telemetryKey}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(110 100% 54%)" />
            <stop offset="60%" stopColor="hsl(43 100% 50%)" />
            <stop offset="100%" stopColor="hsl(0 100% 40%)" />
          </linearGradient>
        </defs>
        {/* Value arc */}
        <motion.path
          d="M 10 55 A 40 40 0 0 1 90 55"
          fill="none"
          stroke={`url(#gauge-grad-${telemetryKey})`}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ strokeDashoffset: animatedOffset }}
        />
        <text x="50" y="52" textAnchor="middle" fill={color} fontSize="14" fontFamily="'JetBrains Mono', monospace" fontWeight="bold">
          {data ? value.toFixed(1) : "—"}
        </text>
      </svg>
      {gauge?.unit && (
        <span className="text-[10px] text-muted-foreground">{gauge.unit}</span>
      )}
    </motion.div>
  );
}
