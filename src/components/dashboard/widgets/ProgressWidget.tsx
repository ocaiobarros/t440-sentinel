import { motion, useSpring, useTransform } from "framer-motion";
import { useWidgetData } from "@/hooks/useWidgetData";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import { extractRawValue } from "@/lib/telemetry-utils";

interface Props {
  telemetryKey: string;
  title: string;
  cache: Map<string, TelemetryCacheEntry>;
  config?: Record<string, unknown>;
}

export default function ProgressWidget({ telemetryKey, title, cache, config }: Props) {
  const { data, isInitial } = useWidgetData({ telemetryKey, cache });

  const rawValue = extractRawValue(data);
  const numValue = rawValue !== null ? parseFloat(rawValue) : 0;
  const pct = Math.min(100, Math.max(0, numValue));
  
  const colorMap = (config?.color_map as Record<string, string>) || (config?.extra as any)?.color_map;
  const defaultColor = (config?.default_color as string) || (config?.extra as any)?.default_color || "#39FF14";
  
  // Use color map for thresholds or just default
  let barColor = defaultColor;
  if (colorMap) {
    const thresholds = Object.keys(colorMap).map(Number).filter(n => !isNaN(n)).sort((a, b) => b - a);
    for (const t of thresholds) {
      if (numValue >= t) { 
        const entry = colorMap[String(t)];
        barColor = typeof entry === "string" ? entry : (entry as any)?.color || defaultColor;
        break; 
      }
    }
  }

  // Smooth animation
  const springPct = useSpring(pct, { stiffness: 80, damping: 20 });
  const widthStr = useTransform(springPct, (v) => `${v}%`);

  return (
    <motion.div
      initial={isInitial ? { opacity: 0, scale: 0.95 } : false}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card rounded-lg p-4 h-full flex flex-col justify-center gap-2 border border-border/50"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-display uppercase tracking-wider text-muted-foreground truncate">
          {title}
        </span>
        <span className="text-sm font-bold font-mono" style={{ color: barColor }}>
          {rawValue !== null ? `${numValue.toFixed(1)}%` : "—"}
        </span>
      </div>
      <div className="h-3 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{
            width: widthStr,
            background: `linear-gradient(90deg, ${barColor}CC, ${barColor})`,
            boxShadow: `0 0 8px ${barColor}80`,
          }}
        />
      </div>
    </motion.div>
  );
}
