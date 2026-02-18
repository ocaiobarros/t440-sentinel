import { memo, useMemo } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { useWidgetData } from "@/hooks/useWidgetData";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import { extractRawValue, getMappedStatus } from "@/lib/telemetry-utils";
import { BatteryWarning, Zap } from "lucide-react";

interface Props {
  telemetryKey: string;
  title: string;
  cache: Map<string, TelemetryCacheEntry>;
  config?: Record<string, unknown>;
  compact?: boolean;
}

/** Voltage-based color stops (inverted: red=low, green=high) */
interface RGBStop { pct: number; r: number; g: number; b: number }
const BATTERY_STOPS: RGBStop[] = [
  { pct: 0,   r: 255, g: 0,   b: 0   },
  { pct: 25,  r: 255, g: 80,  b: 0   },
  { pct: 50,  r: 255, g: 200, b: 0   },
  { pct: 75,  r: 100, g: 220, b: 50  },
  { pct: 100, r: 0,   g: 220, b: 80  },
];

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function getBatteryColor(pct: number): string {
  const clamped = Math.min(100, Math.max(0, pct));
  if (clamped <= BATTERY_STOPS[0].pct) {
    const s = BATTERY_STOPS[0];
    return `rgb(${s.r}, ${s.g}, ${s.b})`;
  }
  const last = BATTERY_STOPS[BATTERY_STOPS.length - 1];
  if (clamped >= last.pct) return `rgb(${last.r}, ${last.g}, ${last.b})`;

  for (let i = 0; i < BATTERY_STOPS.length - 1; i++) {
    const a = BATTERY_STOPS[i];
    const b = BATTERY_STOPS[i + 1];
    if (clamped >= a.pct && clamped <= b.pct) {
      const t = (clamped - a.pct) / (b.pct - a.pct);
      return `rgb(${lerp(a.r, b.r, t)}, ${lerp(a.g, b.g, t)}, ${lerp(a.b, b.b, t)})`;
    }
  }
  return `rgb(128, 128, 128)`;
}

/** Number of visual segments in the bar */
const SEGMENT_COUNT = 20;

function BatteryBarWidgetInner({ telemetryKey, title, cache, config, compact }: Props) {
  const { data, isInitial } = useWidgetData({ telemetryKey, cache });
  const rawValue = extractRawValue(data);
  const numValue = rawValue !== null ? parseFloat(rawValue) : 0;

  const extra = (config?.extra as Record<string, unknown>) || config || {};
  const minVoltage = (extra.minVoltage as number) ?? (extra.min as number) ?? 22;
  const maxVoltage = (extra.maxVoltage as number) ?? (extra.max as number) ?? 27;
  const criticalThreshold = (extra.criticalThreshold as number) ?? (extra.critical as number) ?? 23;
  const unit = (extra.units as string) || "V";

  // ── Color mapping from Builder (value → label/color) ──
  const colorMap = (config?.color_map as Record<string, unknown>) || (extra?.color_map as Record<string, unknown>);
  const defaultColor = (config?.default_color as string) || (extra?.default_color as string) || undefined;
  const mappedStatus = getMappedStatus(rawValue, colorMap, defaultColor);
  const hasMapping = colorMap && rawValue !== null && mappedStatus.label !== rawValue && mappedStatus.label !== "N/A";

  // ── Style config from Builder ──
  const styleConfig = (config?.style as Record<string, unknown>) || {};
  const valueColor = styleConfig.valueColor as string | undefined;
  const labelColor = styleConfig.labelColor as string | undefined;
  const titleFont = styleConfig.titleFont as string | undefined;
  const valueFont = styleConfig.valueFont as string | undefined;
  const valueFontSize = styleConfig.valueFontSize as number | undefined;
  const iconColor = styleConfig.iconColor as string | undefined;
  const textAlign = (styleConfig.textAlign as string) || "center";

  const pct = useMemo(() => {
    if (maxVoltage <= minVoltage) return 0;
    return Math.min(100, Math.max(0, ((numValue - minVoltage) / (maxVoltage - minVoltage)) * 100));
  }, [numValue, minVoltage, maxVoltage]);

  const isCritical = numValue <= criticalThreshold && rawValue !== null;
  const dynamicColor = getBatteryColor(pct);
  // If color_map matched, use that color; else builder valueColor; else dynamic interpolation
  const color = hasMapping ? mappedStatus.color : (valueColor || dynamicColor);

  const springPct = useSpring(pct, { stiffness: 80, damping: 20 });
  const widthStr = useTransform(springPct, (v) => `${v}%`);

  // Display: mapped label if available, else voltage value
  const displayValue = useMemo(() => {
    if (rawValue === null) return "—";
    if (hasMapping) return mappedStatus.label;
    return `${numValue.toFixed(1)}${unit}`;
  }, [rawValue, hasMapping, mappedStatus.label, numValue, unit]);

  // Segments: which ones are "lit"
  const litSegments = useMemo(() => {
    return Math.round((pct / 100) * SEGMENT_COUNT);
  }, [pct]);

  const alignClass = textAlign === "left" ? "items-start text-left" : textAlign === "right" ? "items-end text-right" : "items-center text-center";

  return (
    <motion.div
      initial={isInitial ? { opacity: 0, scale: 0.95 } : false}
      animate={{ opacity: 1, scale: 1 }}
      className={`glass-card rounded-lg ${compact ? "p-2 gap-1.5" : "p-3 gap-2"} h-full flex flex-col justify-center border border-border/50 relative overflow-hidden ${
        isCritical ? "battery-critical-pulse" : ""
      }`}
      style={isCritical ? {
        borderColor: "hsl(0 100% 45%)",
        boxShadow: "0 0 15px hsla(0, 100%, 45%, 0.4), inset 0 0 15px hsla(0, 100%, 45%, 0.1)",
      } : undefined}
    >
      {/* Title row with icon */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap
            className={`${compact ? "w-3 h-3" : "w-4 h-4"} shrink-0`}
            style={{
              color: iconColor || color,
              filter: `drop-shadow(0 0 6px ${iconColor || color})`,
              transition: "all 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
          <span
            className={`${compact ? "text-[8px]" : "text-[10px]"} font-display uppercase tracking-wider truncate`}
            style={{
              color: labelColor || undefined,
              fontFamily: titleFont || undefined,
              transition: "all 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            {title}
          </span>
        </div>

        {isCritical && (
          <BatteryWarning
            className={`${compact ? "w-3 h-3" : "w-4 h-4"} text-destructive shrink-0`}
            style={{ animation: "battery-icon-blink 1.5s ease-in-out infinite" }}
          />
        )}
      </div>

      {/* Value — respects textAlign */}
      <div className={`flex flex-col ${alignClass}`}>
        <span
          className="font-bold leading-none"
          style={{
            color,
            fontFamily: valueFont || "'JetBrains Mono', monospace",
            fontSize: valueFontSize ? `${valueFontSize}px` : (compact ? "18px" : "24px"),
            textShadow: `0 0 15px ${color}80, 0 0 5px ${color}`,
            transition: "all 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {displayValue}
        </span>
      </div>

      {/* ── Segmented Battery Bar ── */}
      <div className="relative">
        {/* Background: full gradient (always visible, dimmed) */}
        <div className={`flex gap-[2px] ${compact ? "h-3" : "h-4"}`}>
          {Array.from({ length: SEGMENT_COUNT }).map((_, i) => {
            const segPct = ((i + 0.5) / SEGMENT_COUNT) * 100;
            const segColor = getBatteryColor(segPct);
            const isLit = i < litSegments;

            return (
              <motion.div
                key={i}
                className="flex-1 rounded-[2px]"
                initial={false}
                animate={{
                  opacity: isLit ? 1 : 0.15,
                  scale: isLit ? 1 : 0.95,
                }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                style={{
                  background: segColor,
                  boxShadow: isLit
                    ? `0 0 6px ${segColor}80, inset 0 1px 0 rgba(255,255,255,0.2)`
                    : "none",
                }}
              />
            );
          })}
        </div>

        {/* Continuous overlay bar for smooth glow effect */}
        <div
          className={`absolute top-0 left-0 ${compact ? "h-3" : "h-4"} pointer-events-none rounded-sm`}
          style={{ width: "100%" }}
        >
          <motion.div
            className="h-full rounded-sm"
            style={{
              width: widthStr,
              background: "transparent",
              boxShadow: `0 0 12px ${dynamicColor}60, 0 0 4px ${dynamicColor}40`,
              transition: "box-shadow 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </div>
      </div>

      {/* Range labels */}
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-mono" style={{ color: labelColor || undefined, transition: "color 0.5s" }}>
          {minVoltage}{unit}
        </span>
        <span className="text-[8px] font-mono font-bold" style={{ color: dynamicColor, transition: "color 0.5s" }}>
          {pct.toFixed(0)}%
        </span>
        <span className="text-[8px] font-mono" style={{ color: labelColor || undefined, transition: "color 0.5s" }}>
          {maxVoltage}{unit}
        </span>
      </div>
    </motion.div>
  );
}

const BatteryBarWidget = memo(BatteryBarWidgetInner);
export default BatteryBarWidget;
