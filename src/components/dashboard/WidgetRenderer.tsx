import { memo, useEffect, useRef, useMemo } from "react";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import type { ImageHotspot } from "@/types/builder";
import { extractRawValue, getMappedStatus } from "@/lib/telemetry-utils";
import { useWidgetVisibility } from "@/hooks/useWidgetVisibility";
import { buildWidgetCSS, getGlassClass } from "@/lib/widget-style-utils";
import WidgetSkeleton from "./widgets/WidgetSkeleton";
import StatWidget from "./widgets/StatWidget";
import GaugeWidget from "./widgets/GaugeWidget";
import TimeseriesWidget from "./widgets/TimeseriesWidget";
import TableWidget from "./widgets/TableWidget";
import TextWidget from "./widgets/TextWidget";
import ImageMapWidget from "./widgets/ImageMapWidget";
import StatusWidget from "./widgets/StatusWidget";
import ProgressWidget from "./widgets/ProgressWidget";
import IconValueWidget from "./widgets/IconValueWidget";
import TrafficLightWidget from "./widgets/TrafficLightWidget";
import LabelWidget from "./widgets/LabelWidget";
import BatteryBarWidget from "./widgets/BatteryBarWidget";

interface Props {
  widgetType: string;
  widgetId?: string;
  telemetryKey: string;
  title: string;
  cache: Map<string, TelemetryCacheEntry>;
  config?: Record<string, unknown>;
  onCritical?: (widgetId: string) => void;
  compact?: boolean;
}

function WidgetRendererInner({ widgetType, widgetId, telemetryKey, title, cache, config, onCritical, compact }: Props) {
  const prevCriticalRef = useRef(false);
  const { containerRef, isVisible } = useWidgetVisibility();

  const entry = cache.get(telemetryKey);
  const colorMap = config?.color_map as Record<string, unknown> | undefined;

  // Build inline styles from the saved style config (must be before early returns)
  const styleConfig = (config?.style as Record<string, unknown>) || {};
  const customCSS = useMemo(() => buildWidgetCSS(styleConfig as any), [styleConfig]);
  const glassClass = getGlassClass(styleConfig as any);

  useEffect(() => {
    if (!entry || !colorMap || !widgetId || !onCritical) return;
    const rawValue = extractRawValue(entry.data);
    const status = getMappedStatus(rawValue, colorMap);
    if (status.isCritical && !prevCriticalRef.current) {
      onCritical(widgetId);
    }
    prevCriticalRef.current = status.isCritical;
  }, [entry?.ts, colorMap, widgetId, onCritical]);

  const isCritical = (() => {
    if (!entry || !colorMap) return false;
    const rawValue = extractRawValue(entry.data);
    return getMappedStatus(rawValue, colorMap).isCritical;
  })();

  const wrapperClass = isCritical ? "h-full critical-pulse rounded-lg border border-destructive/50" : "h-full";
  const containStyle: React.CSSProperties = { contain: "layout style paint" };

  // Show skeleton if no data yet for data-driven widgets
  const needsData = !["label", "text"].includes(widgetType);
  const hasMultiSeriesData = (() => {
    if (widgetType !== "timeseries") return false;
    const extra = config?.extra as Record<string, unknown> | undefined;
    const series = (extra?.series as Array<{ itemid: string }>) || (config?.series as Array<{ itemid: string }>) || [];
    if (series.length === 0) return false;
    return series.some((s) => cache.has(`zbx:item:${s.itemid}`));
  })();
  if (needsData && !entry && !hasMultiSeriesData) {
    return <div ref={containerRef} className="h-full"><WidgetSkeleton type={widgetType} /></div>;
  }

  // When off-screen: render a lightweight frozen placeholder
  if (!isVisible) {
    return (
      <div ref={containerRef} className={wrapperClass} style={containStyle}>
        <div className="glass-card rounded-lg p-4 h-full flex flex-col items-center justify-center border border-border/50">
          <span className="text-[10px] font-display uppercase tracking-wider text-muted-foreground truncate w-full text-center">
            {title}
          </span>
          {entry ? (
            <span className="text-xs font-mono text-muted-foreground/60 mt-1">⏸ standby</span>
          ) : (
            <WidgetSkeleton type={widgetType} />
          )}
        </div>
      </div>
    );
  }

  const inner = (() => {
    switch (widgetType) {
      case "stat":
        return <StatWidget telemetryKey={telemetryKey} title={title} cache={cache} config={config} compact={compact} />;
      case "gauge":
        return <GaugeWidget telemetryKey={telemetryKey} title={title} cache={cache} config={config} compact={compact} />;
      case "timeseries":
        return <TimeseriesWidget telemetryKey={telemetryKey} title={title} cache={cache} config={config} />;
      case "table":
        return <TableWidget telemetryKey={telemetryKey} title={title} cache={cache} />;
      case "text":
        return <TextWidget telemetryKey={telemetryKey} title={title} cache={cache} config={config} />;
      case "status":
        return <StatusWidget telemetryKey={telemetryKey} title={title} cache={cache} config={config} compact={compact} />;
      case "progress":
        return <ProgressWidget telemetryKey={telemetryKey} title={title} cache={cache} config={config} compact={compact} />;
      case "icon-value":
        return <IconValueWidget telemetryKey={telemetryKey} title={title} cache={cache} config={config} compact={compact} />;
      case "traffic-light":
        return <TrafficLightWidget telemetryKey={telemetryKey} title={title} cache={cache} config={config} compact={compact} />;
      case "label":
        return <LabelWidget title={title} config={config} />;
      case "battery-bar":
        return <BatteryBarWidget telemetryKey={telemetryKey} title={title} cache={cache} config={config} compact={compact} />;
      case "image-map":
        return (
          <ImageMapWidget
            imageUrl={(config?.imageUrl as string) || ""}
            hotspots={((config?.hotspots as ImageHotspot[]) || [])}
            cache={cache}
            title={title}
          />
        );
      default:
        return (
          <div className="glass-card rounded-lg p-4 h-full flex items-center justify-center border border-border/50">
            <span className="text-xs text-muted-foreground font-mono">Unknown: {widgetType}</span>
          </div>
        );
    }
  })();

  // Apply the same style envelope used in the Builder's WidgetPreviewCard
  const hasCustomStyle = Object.keys(styleConfig).length > 0;

  return (
    <div ref={containerRef} className={wrapperClass} style={containStyle}>
      {hasCustomStyle ? (
        <div
          className={`h-full w-full rounded-lg border border-border/50 overflow-hidden ${glassClass}`}
          style={{ ...customCSS, borderStyle: "solid" }}
        >
          {inner}
        </div>
      ) : (
        inner
      )}
    </div>
  );
}

const WidgetRenderer = memo(WidgetRendererInner);
export default WidgetRenderer;
