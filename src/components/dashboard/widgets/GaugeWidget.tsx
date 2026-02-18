import { motion, useSpring, useTransform } from "framer-motion";
import { useWidgetData } from "@/hooks/useWidgetData";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import type { TelemetryGaugeData } from "@/types/telemetry";
import { extractRawValue } from "@/lib/telemetry-utils";
import { useMemo } from "react";

interface Props {
  telemetryKey: string;
  title: string;
  cache: Map<string, TelemetryCacheEntry>;
  config?: Record<string, unknown>;
  compact?: boolean;
}

/** RGB color stop for lerp interpolation */
interface RGBStop { t: number; r: number; g: number; b: number }

/** Palette definitions — each is an array of normalized [0→1] RGB stops */
const PALETTES: Record<string, RGBStop[]> = {
  thermal: [
    { t: 0,   r: 0,   g: 100, b: 255 }, // Cold blue
    { t: 0.3, r: 0,   g: 220, b: 255 }, // Cyan
    { t: 0.55,r: 255, g: 230, b: 0   }, // Yellow
    { t: 0.8, r: 255, g: 140, b: 0   }, // Orange
    { t: 1,   r: 255, g: 20,  b: 20  }, // Hot red
  ],
  energy: [
    { t: 0,   r: 255, g: 30,  b: 30  }, // Empty red
    { t: 0.4, r: 255, g: 200, b: 0   }, // Yellow
    { t: 1,   r: 30,  g: 255, b: 80   }, // Full green
  ],
};

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function interpolateColor(stops: RGBStop[], pct01: number): [number, number, number] {
  if (pct01 <= stops[0].t) return [stops[0].r, stops[0].g, stops[0].b];
  const last = stops[stops.length - 1];
  if (pct01 >= last.t) return [last.r, last.g, last.b];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (pct01 >= a.t && pct01 <= b.t) {
      const t = (pct01 - a.t) / (b.t - a.t);
      return [lerp(a.r, b.r, t), lerp(a.g, b.g, t), lerp(a.b, b.b, t)];
    }
  }
  return [128, 128, 128];
}

function rgbStr(rgb: [number, number, number]): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

/** Build SVG gradient stops from a palette */
function buildGradientStops(stops: RGBStop[], inverted: boolean) {
  const s = inverted ? [...stops].reverse().map((st, i, arr) => ({ ...st, t: i / (arr.length - 1) })) : stops;
  return s.map((st) => ({
    offset: `${Math.round(st.t * 100)}%`,
    color: `rgb(${st.r}, ${st.g}, ${st.b})`,
  }));
}

export default function GaugeWidget({ telemetryKey, title, cache, config, compact }: Props) {
  const { data, isInitial } = useWidgetData({ telemetryKey, cache });
  const gauge = data as TelemetryGaugeData | null;

  // Read builder config
  const extra = (config?.extra as Record<string, unknown>) || config || {};
  const styleConfig = (config?.style as Record<string, unknown>) || {};

  const min = (extra.gaugeMin as number) ?? gauge?.min ?? (config?.min as number) ?? 0;
  const max = (extra.gaugeMax as number) ?? gauge?.max ?? (config?.max as number) ?? 100;
  const decimals = (extra.gaugeDecimals as number) ?? 1;
  const paletteName = (extra.gaugePalette as string) || "thermal";
  const inverted = (extra.gaugeInvert as boolean) ?? false;

  // Style from builder
  const valueFont = (styleConfig.valueFont as string) || "'JetBrains Mono', monospace";
  const titleFont = (styleConfig.titleFont as string) || "'Orbitron', sans-serif";
  const valueFontSize = (styleConfig.valueFontSize as number) || undefined;
  const valueColor = (styleConfig.valueColor as string) || undefined;
  const labelColor = (styleConfig.labelColor as string) || undefined;

  const rawValue = extractRawValue(data);
  const value = gauge?.value ?? (rawValue !== null ? parseFloat(rawValue) : 0);
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const pct01 = pct / 100;

  const radius = 40;
  const circumference = Math.PI * radius;

  const springPct = useSpring(pct, { stiffness: 60, damping: 20 });
  const animatedOffset = useTransform(springPct, (v) => circumference - (v / 100) * circumference);

  // Palette and interpolation
  const paletteStops = PALETTES[paletteName] || PALETTES.thermal;
  const effectiveStops = useMemo(() => {
    if (!inverted) return paletteStops;
    return [...paletteStops].reverse().map((st, i, arr) => ({ ...st, t: i / (arr.length - 1) }));
  }, [paletteStops, inverted]);

  const currentRGB = useMemo(() => interpolateColor(effectiveStops, pct01), [effectiveStops, pct01]);
  const currentColor = rgbStr(currentRGB);

  // The color to use for the value text: builder override > interpolated
  const displayColor = valueColor || currentColor;

  // Gradient stops for the SVG arc
  const gradStops = useMemo(() => buildGradientStops(paletteStops, inverted), [paletteStops, inverted]);

  const gradId = `gauge-grad-${telemetryKey}`;

  // Neon glow styles
  const glowFilter = `drop-shadow(0 0 10px ${currentColor}80)`;
  const textGlow = `0 0 12px ${currentColor}80, 0 0 4px ${currentColor}`;

  return (
    <motion.div
      initial={isInitial ? { opacity: 0, scale: 0.95 } : false}
      animate={{ opacity: 1, scale: 1 }}
      className={`glass-card rounded-lg ${compact ? "p-2 gap-0.5" : "p-4 gap-1"} h-full flex flex-col items-center justify-center border border-border/50`}
    >
      <span
        className={`${compact ? "text-[8px]" : "text-[10px]"} uppercase tracking-wider text-muted-foreground truncate w-full text-center`}
        style={{
          fontFamily: titleFont,
          color: labelColor || undefined,
        }}
      >
        {title}
      </span>

      <svg viewBox="0 0 100 60" className="w-full max-w-[120px]" style={{ filter: glowFilter, transition: "filter 0.8s ease" }}>
        {/* Background arc */}
        <path
          d="M 10 55 A 40 40 0 0 1 90 55"
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth="6"
          strokeLinecap="round"
        />
        {/* Gradient definition */}
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            {gradStops.map((s, i) => (
              <stop key={i} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
        </defs>
        {/* Animated foreground arc */}
        <motion.path
          d="M 10 55 A 40 40 0 0 1 90 55"
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ strokeDashoffset: animatedOffset }}
        />
        {/* Needle indicator dot */}
        <motion.circle
          cx={useTransform(springPct, (v) => {
            const angle = Math.PI - (v / 100) * Math.PI;
            return 50 + 40 * Math.cos(angle);
          })}
          cy={useTransform(springPct, (v) => {
            const angle = Math.PI - (v / 100) * Math.PI;
            return 55 - 40 * Math.sin(angle);
          })}
          r="3"
          fill={currentColor}
          style={{
            filter: `drop-shadow(0 0 6px ${currentColor})`,
            transition: "fill 0.8s ease",
          }}
        />
        {/* Value text */}
        <text
          x="50" y="52"
          textAnchor="middle"
          fill={displayColor}
          fontSize={valueFontSize ? Math.min(valueFontSize, 18) : 14}
          fontFamily={valueFont}
          fontWeight="bold"
          style={{
            transition: "fill 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
            filter: `drop-shadow(0 0 8px ${displayColor}80)`,
          }}
        >
          {data ? value.toFixed(decimals) : "—"}
        </text>
        {/* Min / Max labels */}
        <text x="10" y="60" textAnchor="start" fill="hsl(var(--muted-foreground))" fontSize="5" fontFamily={valueFont}>
          {min}
        </text>
        <text x="90" y="60" textAnchor="end" fill="hsl(var(--muted-foreground))" fontSize="5" fontFamily={valueFont}>
          {max}
        </text>
      </svg>

      {gauge?.unit && (
        <span className="text-[10px] text-muted-foreground">{gauge.unit}</span>
      )}
    </motion.div>
  );
}
