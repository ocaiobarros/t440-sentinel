import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import type { ImageHotspot } from "@/types/builder";
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
    case "status":
      return <StatusWidget telemetryKey={telemetryKey} title={title} cache={cache} config={config} />;
    case "progress":
      return <ProgressWidget telemetryKey={telemetryKey} title={title} cache={cache} config={config} />;
    case "icon-value":
      return <IconValueWidget telemetryKey={telemetryKey} title={title} cache={cache} config={config} />;
    case "traffic-light":
      return <TrafficLightWidget telemetryKey={telemetryKey} title={title} cache={cache} config={config} />;
    case "label":
      return <LabelWidget title={title} config={config} />;
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
