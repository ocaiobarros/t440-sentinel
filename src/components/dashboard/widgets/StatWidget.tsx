import { motion } from "framer-motion";
import { useWidgetData } from "@/hooks/useWidgetData";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import type { TelemetryStatData } from "@/types/telemetry";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { getThermalStyle, isThermalMetric } from "@/lib/thermal-scale";
import { extractRawValue, getMappedStatus } from "@/lib/telemetry-utils";
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

  // Color mapping
  const extra = (config?.extra as Record<string, unknown>) || {};
  const colorMap = (config?.color_map as Record<string, unknown>) || (extra?.color_map as Record<string, unknown>);
  const defaultColor = (config?.default_color as string) || (extra?.default_color as string);
  const rawValue = extractRawValue(data);
  const mappedStatus = getMappedStatus(rawValue, colorMap, defaultColor);
  const hasMapping = colorMap && rawValue !== null && mappedStatus.label !== rawValue && mappedStatus.label !== "N/A";

  // Thermal neon style
  const thermalStyle = useMemo(() => {
    if (hasMapping) return null;
    if (!stat || typeof stat.value !== "number") return null;
    if (!isThermalMetric(title, stat.unit)) return null;
    return getThermalStyle(stat.value);
  }, [stat?.value, title, stat?.unit, hasMapping]);

  // Style config from builder
  const styleConfig = (config?.style as Record<string, unknown>) || {};
  const valueColor = styleConfig.valueColor as string | undefined;
  const valueFont = styleConfig.valueFont as string | undefined;
  const valueFontSize = styleConfig.valueFontSize as number | undefined;
  const labelColor = styleConfig.labelColor as string | undefined;
  const titleFont = styleConfig.titleFont as string | undefined;

  // Final value color: color_map > builder valueColor > thermal > default
  const finalValueStyle = useMemo((): React.CSSProperties => {
    if (hasMapping) {
      return {
        color: mappedStatus.color,
        textShadow: `0 0 15px ${mappedStatus.color}80, 0 0 5px ${mappedStatus.color}`,
        transition: "all 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
      };
    }
    if (thermalStyle) return thermalStyle;
    if (valueColor) {
      return {
        color: valueColor,
        textShadow: `0 0 8px ${valueColor}60`,
        transition: "all 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
      };
    }
    return { textShadow: '0 0 8px hsl(var(--primary) / 0.6), 0 0 24px hsl(var(--primary) / 0.25)' };
  }, [hasMapping, mappedStatus.color, thermalStyle, valueColor]);

  // Display: mapped label > formatted stat > raw
  const displayValue = useMemo(() => {
    if (hasMapping) return mappedStatus.label;
    if (stat && typeof stat.value === "number") {
      return stat.value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    if (stat) return stat.value;
    return null;
  }, [hasMapping, mappedStatus.label, stat]);

  return (
    <motion.div
      initial={isInitial ? { opacity: 0, scale: 0.95 } : false}
      animate={{ opacity: 1, scale: 1 }}
      className={`glass-card rounded-lg ${compact ? "p-2 gap-1" : "p-4 gap-2"} h-full flex flex-col items-center justify-center border border-border/50`}
    >
      <span
        className={`${compact ? "text-[8px]" : "text-[10px]"} font-display uppercase tracking-wider truncate w-full text-center`}
        style={{
          color: labelColor || undefined,
          fontFamily: titleFont || undefined,
        }}
      >
        {title}
      </span>
      {displayValue !== null ? (
        <>
          <span
            className={`font-bold font-mono-data ${!hasMapping && !thermalStyle && !valueColor ? "text-primary" : ""}`}
            style={{
              ...finalValueStyle,
              fontFamily: valueFont || undefined,
              fontSize: valueFontSize ? `${valueFontSize}px` : (compact ? "18px" : "24px"),
            }}
          >
            {displayValue}
          </span>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            {!hasMapping && stat?.unit && <span>{stat.unit}</span>}
            {trendIcon}
          </div>
        </>
      ) : (
        <span className="text-lg text-muted-foreground/50 font-mono animate-pulse">—</span>
      )}
    </motion.div>
  );
}
