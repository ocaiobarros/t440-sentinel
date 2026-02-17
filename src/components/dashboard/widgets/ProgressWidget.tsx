import { memo, useMemo } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { useWidgetData } from "@/hooks/useWidgetData";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import { extractRawValue } from "@/lib/telemetry-utils";

interface Props {
  telemetryKey: string;
  title: string;
  cache: Map<string, TelemetryCacheEntry>;
  config?: Record<string, unknown>;
  compact?: boolean;
}

/** Format bytes to human-readable (KB, MB, GB, TB) using base 1024 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024));
  const idx = Math.min(i, units.length - 1);
  const val = bytes / Math.pow(1024, idx);
  return `${val.toFixed(1)} ${units[idx]}`;
}

function ProgressWidgetInner({ telemetryKey, title, cache, config, compact }: Props) {
  const { data, isInitial } = useWidgetData({ telemetryKey, cache });

  const rawValue = extractRawValue(data);
  const numValue = rawValue !== null ? parseFloat(rawValue) : 0;

  const units = (config?.units as string) || (config?.extra as any)?.units || "";
  const isBytes = units.toLowerCase() === "b" || units.toLowerCase() === "bytes";
  const maxValue = (config?.max_value as number) || (config?.extra as any)?.max_value || (isBytes ? 0 : 100);
  const isPercent = !isBytes && maxValue === 100;

  // Calculate percentage for the bar
  const pct = useMemo(() => {
    if (isPercent) return Math.min(100, Math.max(0, numValue));
    if (maxValue > 0) return Math.min(100, Math.max(0, (numValue / maxValue) * 100));
    return 0;
  }, [numValue, isPercent, maxValue]);

  // Format display value
  const displayValue = useMemo(() => {
    if (rawValue === null) return "—";
    if (isBytes) return formatBytes(numValue);
    if (isPercent) return `${numValue.toFixed(1)}%`;
    return `${numValue.toFixed(1)}`;
  }, [rawValue, numValue, isBytes, isPercent]);

  const colorMap = (config?.color_map as Record<string, string>) || (config?.extra as any)?.color_map;
  const defaultColor = (config?.default_color as string) || (config?.extra as any)?.default_color || "#39FF14";

  const barColor = useMemo(() => {
    if (!colorMap) return defaultColor;
    const thresholds = Object.keys(colorMap).map(Number).filter(n => !isNaN(n)).sort((a, b) => b - a);
    for (const t of thresholds) {
      if (numValue >= t) {
        const entry = colorMap[String(t)];
        return typeof entry === "string" ? entry : (entry as any)?.color || defaultColor;
      }
    }
    return defaultColor;
  }, [colorMap, numValue, defaultColor]);

  const springPct = useSpring(pct, { stiffness: 80, damping: 20 });
  const widthStr = useTransform(springPct, (v) => `${v}%`);

  return (
    <motion.div
      initial={isInitial ? { opacity: 0, scale: 0.95 } : false}
      animate={{ opacity: 1, scale: 1 }}
      className={`glass-card rounded-lg ${compact ? "p-2 gap-1" : "p-4 gap-2"} h-full flex flex-col justify-center border border-border/50`}
    >
      <div className="flex items-center justify-between">
        <span className={`${compact ? "text-[8px]" : "text-[10px]"} font-display uppercase tracking-wider text-muted-foreground truncate`}>
          {title}
        </span>
        <span className="text-sm font-bold font-mono" style={{ color: barColor }}>
          {displayValue}
        </span>
      </div>
      <div className={`${compact ? "h-2" : "h-3"} rounded-full bg-muted overflow-hidden`}>
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

const ProgressWidget = memo(ProgressWidgetInner);
export default ProgressWidget;
