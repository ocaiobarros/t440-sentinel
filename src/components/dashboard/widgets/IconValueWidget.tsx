import { motion } from "framer-motion";
import { useWidgetData } from "@/hooks/useWidgetData";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import { extractRawValue, getMappedStatus } from "@/lib/telemetry-utils";
import DynamicIcon from "@/components/builder/DynamicIcon";

interface Props {
  telemetryKey: string;
  title: string;
  cache: Map<string, TelemetryCacheEntry>;
  config?: Record<string, unknown>;
}

export default function IconValueWidget({ telemetryKey, title, cache, config }: Props) {
  const { data, isInitial } = useWidgetData({ telemetryKey, cache });

  const rawValue = extractRawValue(data);
  const colorMap = (config?.color_map as Record<string, string>) || (config?.extra as any)?.color_map;
  const defaultColor = (config?.default_color as string) || (config?.extra as any)?.default_color || "#39FF14";
  const status = getMappedStatus(rawValue, colorMap, defaultColor);

  const iconName = (config?.style as any)?.icon || (config?.extra as any)?.icon || "Activity";
  const unit = (data as any)?.unit || "";

  return (
    <motion.div
      initial={isInitial ? { opacity: 0, scale: 0.95 } : false}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card rounded-lg p-4 h-full flex flex-col items-center justify-center gap-2 border border-border/50"
    >
      <span className="text-[10px] font-display uppercase tracking-wider text-muted-foreground truncate w-full text-center">
        {title}
      </span>
      <div className="flex items-center gap-3">
        <DynamicIcon
          name={iconName}
          className="w-8 h-8"
          style={{ color: status.color, filter: `drop-shadow(0 0 6px ${status.color}80)` }}
        />
        <div className="text-right">
          <div className="text-xl font-bold font-mono" style={{ color: status.color }}>
            {rawValue ?? "—"}
          </div>
          {unit && <div className="text-[9px] text-muted-foreground">{unit}</div>}
        </div>
      </div>
    </motion.div>
  );
}
