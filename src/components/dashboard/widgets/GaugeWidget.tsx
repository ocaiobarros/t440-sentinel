import { motion, useSpring, useTransform } from "framer-motion";
import { useWidgetData } from "@/hooks/useWidgetData";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import type { TelemetryGaugeData } from "@/types/telemetry";
import { extractRawValue } from "@/lib/telemetry-utils";
import { formatDynamicValue } from "@/lib/format-utils";
import { useMemo } from "react";

interface Props {
  telemetryKey: string;
  title: string;
  cache: Map<string, TelemetryCacheEntry>;
  config?: Record<string, unknown>;
  compact?: boolean;
}

interface RGBStop { t: number; r: number; g: number; b: number }

const PALETTES: Record<string, RGBStop[]> = {
  thermal: [
    { t: 0,    r: 0,   g: 100, b: 255 },
    { t: 0.25, r: 0,   g: 200, b: 255 },
    { t: 0.5,  r: 255, g: 230, b: 0   },
    { t: 0.75, r: 255, g: 140, b: 0   },
    { t: 1,    r: 255, g: 20,  b: 20  },
  ],
  energy: [
    { t: 0,    r: 255, g: 30,  b: 30  },
    { t: 0.35, r: 255, g: 200, b: 0   },
    { t: 1,    r: 30,  g: 255, b: 80   },
  ],
};

function lerp(a: number, b: number, t: number) {
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

function rgb(c: [number, number, number]) { return `rgb(${c[0]},${c[1]},${c[2]})`; }
function rgba(c: [number, number, number], a: number) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

function buildGradientStops(stops: RGBStop[], inverted: boolean) {
  const s = inverted
    ? [...stops].reverse().map((st, i, arr) => ({ ...st, t: i / (arr.length - 1) }))
    : stops;
  return s.map((st) => ({
    offset: `${Math.round(st.t * 100)}%`,
    color: `rgb(${st.r},${st.g},${st.b})`,
  }));
}

export default function GaugeWidget({ telemetryKey, title, cache, config, compact }: Props) {
  const { data, isInitial } = useWidgetData({ telemetryKey, cache });
  const gauge = data as TelemetryGaugeData | null;

  const extra = (config?.extra as Record<string, unknown>) || config || {};
  const styleConfig = (config?.style as Record<string, unknown>) || {};

  const min = (extra.gaugeMin as number) ?? gauge?.min ?? (config?.min as number) ?? 0;
  const max = (extra.gaugeMax as number) ?? gauge?.max ?? (config?.max as number) ?? 100;
  const decimals = (extra.gaugeDecimals as number) ?? 1;
  const paletteName = (extra.gaugePalette as string) || "thermal";
  const inverted = (extra.gaugeInvert as boolean) ?? false;

  const valueFont = (styleConfig.valueFont as string) || "'JetBrains Mono', monospace";
  const titleFont = (styleConfig.titleFont as string) || "'Orbitron', sans-serif";
  const valueFontSize = (styleConfig.valueFontSize as number) || undefined;
  const valueColor = (styleConfig.valueColor as string) || undefined;
  const labelColor = (styleConfig.labelColor as string) || undefined;

  const rawValue = extractRawValue(data);
  const value = gauge?.value ?? (rawValue !== null ? parseFloat(rawValue) : 0);
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const pct01 = pct / 100;

  // ── Auto-suffix formatting ──
  const manualUnit = (extra.unit as string) || (config?.unit as string) || undefined;
  const formatted = useMemo(() => {
    return formatDynamicValue(value, title, {
      manualUnit,
      zabbixUnit: gauge?.unit,
      decimals,
    });
  }, [value, title, manualUnit, gauge?.unit, decimals]);

  // Arc geometry — 180° semicircle
  const R = 42;
  const STROKE = 7;
  const CX = 50;
  const CY = 56;
  const circumference = Math.PI * R;

  const springPct = useSpring(pct, { stiffness: 55, damping: 18 });
  const animatedOffset = useTransform(springPct, (v) => circumference - (v / 100) * circumference);

  const paletteStops = PALETTES[paletteName] || PALETTES.thermal;
  const effectiveStops = useMemo(() => {
    if (!inverted) return paletteStops;
    return [...paletteStops].reverse().map((st, i, arr) => ({ ...st, t: i / (arr.length - 1) }));
  }, [paletteStops, inverted]);

  const currentRGB = useMemo(() => interpolateColor(effectiveStops, pct01), [effectiveStops, pct01]);
  const currentColor = rgb(currentRGB);
  const displayColor = valueColor || currentColor;

  const gradStops = useMemo(() => buildGradientStops(paletteStops, inverted), [paletteStops, inverted]);
  const gradId = `gg-${telemetryKey}`;
  const glowId = `gg-glow-${telemetryKey}`;

  const needleCx = useTransform(springPct, (v) => {
    const angle = Math.PI - (v / 100) * Math.PI;
    return CX + R * Math.cos(angle);
  });
  const needleCy = useTransform(springPct, (v) => {
    const angle = Math.PI - (v / 100) * Math.PI;
    return CY - R * Math.sin(angle);
  });

  const arcPath = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;

  // Suffix font size proportional to value font
  const valFs = valueFontSize ? Math.min(valueFontSize, 16) : 13;
  const suffixFs = valFs * 0.65;

  return (
    <motion.div
      initial={isInitial ? { opacity: 0, scale: 0.92 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={`glass-card rounded-lg ${compact ? "p-2 gap-0.5" : "p-4 gap-1"} h-full flex flex-col items-center justify-center border border-border/50`}
    >
      {/* Title */}
      <span
        className={`${compact ? "text-[8px]" : "text-[10px]"} uppercase tracking-[0.18em] text-muted-foreground truncate w-full text-center`}
        style={{ fontFamily: titleFont, color: labelColor || undefined }}
      >
        {title}
      </span>

      {/* SVG Gauge */}
      <svg viewBox="0 0 100 64" className="w-full max-w-[140px]">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            {gradStops.map((s, i) => (
              <stop key={i} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
          <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background arc */}
        <path d={arcPath} fill="none" stroke="hsl(var(--muted) / 0.35)" strokeWidth={STROKE} strokeLinecap="round" />

        {/* Foreground arc — gradient + glow */}
        <motion.path
          d={arcPath}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ strokeDashoffset: animatedOffset }}
          filter={`url(#${glowId})`}
        />

        {/* Needle dot */}
        <motion.circle
          cx={needleCx} cy={needleCy} r="4" fill={currentColor}
          style={{
            filter: `drop-shadow(0 0 6px ${currentColor}) drop-shadow(0 0 12px ${rgba(currentRGB, 0.5)})`,
            transition: "fill 0.6s ease",
          }}
        />
        <motion.circle cx={needleCx} cy={needleCy} r="1.8" fill="white" opacity={0.7} />

        {/* Value + suffix */}
        <text
          x={CX} y={CY - 4}
          textAnchor="middle" dominantBaseline="middle"
          fill={displayColor}
          fontSize={valFs}
          fontFamily={valueFont}
          fontWeight="bold"
          style={{
            transition: "fill 0.6s ease",
            filter: `drop-shadow(0 0 10px ${rgba(currentRGB, 0.6)})`,
          }}
        >
          {data ? formatted.display : "—"}
          {data && formatted.suffix && (
            <tspan fontSize={suffixFs} opacity={0.85}>{formatted.suffix}</tspan>
          )}
        </text>

        {/* Min / Max labels */}
        <text x={CX - R} y={CY + 9} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="4.5" fontFamily={valueFont}>{min}</text>
        <text x={CX + R} y={CY + 9} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="4.5" fontFamily={valueFont}>{max}</text>
      </svg>
    </motion.div>
  );
}
