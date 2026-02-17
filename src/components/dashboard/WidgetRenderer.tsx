import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import type { ImageHotspot } from "@/types/builder";
import StatWidget from "./widgets/StatWidget";
import GaugeWidget from "./widgets/GaugeWidget";
import TimeseriesWidget from "./widgets/TimeseriesWidget";
import TableWidget from "./widgets/TableWidget";
import TextWidget from "./widgets/TextWidget";
import ImageMapWidget from "./widgets/ImageMapWidget";

interface Props {
  widgetType: string;
  telemetryKey: string;
  title: string;
  cache: Map<string, TelemetryCacheEntry>;
  config?: Record<string, unknown>;
}

export default function WidgetRenderer({ widgetType, telemetryKey, title, cache, config }: Props) {
  switch (widgetType) {
    case "stat":
      return <StatWidget telemetryKey={telemetryKey} title={title} cache={cache} config={config} />;
    case "gauge":
      return <GaugeWidget telemetryKey={telemetryKey} title={title} cache={cache} />;
    case "timeseries":
      return <TimeseriesWidget telemetryKey={telemetryKey} title={title} cache={cache} />;
    case "table":
      return <TableWidget telemetryKey={telemetryKey} title={title} cache={cache} />;
    case "text":
      return <TextWidget telemetryKey={telemetryKey} title={title} cache={cache} />;
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
}
