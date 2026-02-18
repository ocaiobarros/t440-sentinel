import { useWidgetData } from "@/hooks/useWidgetData";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import type { TelemetryTextData } from "@/types/telemetry";
import { useMemo } from "react";

interface Props {
  telemetryKey: string;
  title: string;
  cache: Map<string, TelemetryCacheEntry>;
  config?: Record<string, unknown>;
}

export default function TextWidget({ telemetryKey, title, cache, config }: Props) {
  const { data } = useWidgetData({ telemetryKey, cache });
  const textData = data as TelemetryTextData | null;

  // Style config from builder
  const styleConfig = (config?.style as Record<string, unknown>) || {};
  const labelColor = styleConfig.labelColor as string | undefined;
  const titleFont = styleConfig.titleFont as string | undefined;
  const labelFontSize = styleConfig.labelFontSize as number | undefined;
  const textColor = styleConfig.textColor as string | undefined;
  const valueFont = styleConfig.valueFont as string | undefined;
  const valueFontSize = styleConfig.valueFontSize as number | undefined;

  // Critical alarm detection via color_map or external flag
  const extra = (config?.extra as Record<string, unknown>) || {};
  const isCritical = !!(extra.critical as boolean);

  const accentColor = textColor || labelColor || "hsl(142, 100%, 50%)";

  const containerClass = useMemo(() => {
    const base = "glass-card rounded-lg h-full flex items-center justify-center border border-border/50 overflow-hidden relative neon-border-beam neon-scanline";
    if (isCritical) return `${base} neon-critical-flash`;
    return base;
  }, [isCritical]);

  const textStyle = useMemo((): React.CSSProperties => ({
    color: isCritical ? "hsl(0, 90%, 55%)" : accentColor,
    fontFamily: valueFont || titleFont || "'Orbitron', sans-serif",
    fontSize: valueFontSize ? `${valueFontSize}px` : labelFontSize ? `${labelFontSize}px` : "1.5rem",
    fontWeight: 700,
    lineHeight: 1.2,
    textAlign: "center" as const,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    ["--neon-banner-color" as string]: isCritical ? "hsl(0 90% 50%)" : accentColor,
  }), [isCritical, accentColor, valueFont, titleFont, valueFontSize, labelFontSize]);

  const displayText = textData?.text || title;

  return (
    <div
      className={containerClass}
      style={{ ["--neon-banner-color" as string]: isCritical ? "hsl(0 90% 50%)" : accentColor } as React.CSSProperties}
    >
      <span
        className="neon-breathe neon-banner-text relative z-10 px-4 py-2 select-none cursor-default w-full text-center"
        style={textStyle}
      >
        {displayText}
      </span>
    </div>
  );
}
