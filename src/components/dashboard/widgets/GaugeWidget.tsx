import { motion } from "framer-motion";
import { useWidgetData } from "@/hooks/useWidgetData";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import type { TelemetryGaugeData } from "@/types/telemetry";

interface Props {
  telemetryKey: string;
  title: string;
  cache: Map<string, TelemetryCacheEntry>;
}

export default function GaugeWidget({ telemetryKey, title, cache }: Props) {
  const { data, isInitial } = useWidgetData({ telemetryKey, cache });
  const gauge = data as TelemetryGaugeData | null;

  const min = gauge?.min ?? 0;
  const max = gauge?.max ?? 100;
  const value = gauge?.value ?? 0;
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  // SVG arc gauge
  const radius = 40;
  const circumference = Math.PI * radius; // half circle
  const offset = circumference - (pct / 100) * circumference;

  const color = pct > 80 ? "hsl(0 100% 40%)" : pct > 60 ? "hsl(43 100% 50%)" : "hsl(110 100% 54%)";

  return (
    <motion.div
      initial={isInitial ? { opacity: 0, scale: 0.95 } : false}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card rounded-lg p-4 h-full flex flex-col items-center justify-center gap-1 border border-border/50"
    >
      <span className="text-[10px] font-display uppercase tracking-wider text-muted-foreground truncate w-full text-center">
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
        {/* Value arc */}
        <path
          d="M 10 55 A 40 40 0 0 1 90 55"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease" }}
        />
        <text x="50" y="52" textAnchor="middle" fill={color} fontSize="14" fontFamily="'JetBrains Mono', monospace" fontWeight="bold">
          {gauge ? value.toFixed(1) : "—"}
        </text>
      </svg>
      {gauge?.unit && (
        <span className="text-[10px] text-muted-foreground">{gauge.unit}</span>
      )}
    </motion.div>
  );
}
