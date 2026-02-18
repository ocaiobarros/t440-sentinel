import { useWidgetData } from "@/hooks/useWidgetData";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import type { TelemetryTextData } from "@/types/telemetry";
import { ScrollArea } from "@/components/ui/scroll-area";
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

  const styleConfig = (config?.style as Record<string, unknown>) || {};
  const labelColor = styleConfig.labelColor as string | undefined;
  const titleFont = styleConfig.titleFont as string | undefined;
  const labelFontSize = styleConfig.labelFontSize as number | undefined;
  const textColor = styleConfig.textColor as string | undefined;
  const valueFont = styleConfig.valueFont as string | undefined;
  const valueFontSize = styleConfig.valueFontSize as number | undefined;

  const labelStyle = useMemo((): React.CSSProperties => ({
    color: labelColor || undefined,
    fontFamily: titleFont || undefined,
    fontSize: labelFontSize ? `${labelFontSize}px` : "10px",
    textShadow: labelColor
      ? `0 0 6px ${labelColor}80, 0 0 16px ${labelColor}40`
      : undefined,
  }), [labelColor, titleFont, labelFontSize]);

  return (
    <div className="glass-card rounded-lg p-4 h-full flex flex-col border border-border/50">
      <span
        className="font-display uppercase tracking-wider text-muted-foreground mb-2"
        style={labelStyle}
      >
        {title}
      </span>
      <ScrollArea className="flex-1 min-h-0">
        {textData ? (
          <pre
            className="font-mono text-foreground whitespace-pre-wrap break-words"
            style={{
              color: textColor || undefined,
              fontFamily: valueFont || undefined,
              fontSize: valueFontSize ? `${valueFontSize}px` : "0.75rem",
            }}
          >
            {textData.text}
          </pre>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground/50 text-xs font-mono">
            Aguardando dados…
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
