import { useWidgetData } from "@/hooks/useWidgetData";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import type { TelemetryTextData } from "@/types/telemetry";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  telemetryKey: string;
  title: string;
  cache: Map<string, TelemetryCacheEntry>;
}

export default function TextWidget({ telemetryKey, title, cache }: Props) {
  const { data } = useWidgetData({ telemetryKey, cache });
  const textData = data as TelemetryTextData | null;

  return (
    <div className="glass-card rounded-lg p-4 h-full flex flex-col border border-border/50">
      <span className="text-[10px] font-display uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </span>
      <ScrollArea className="flex-1 min-h-0">
        {textData ? (
          <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-words">
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
