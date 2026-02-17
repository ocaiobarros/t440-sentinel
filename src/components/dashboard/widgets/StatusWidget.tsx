import { motion } from "framer-motion";
import { useWidgetData } from "@/hooks/useWidgetData";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import { getMappedStatus, extractRawValue } from "@/lib/telemetry-utils";
import AnimatedIcon from "./AnimatedIcon";

interface Props {
  telemetryKey: string;
  title: string;
  cache: Map<string, TelemetryCacheEntry>;
  config?: Record<string, unknown>;
  compact?: boolean;
}

export default function StatusWidget({ telemetryKey, title, cache, config, compact }: Props) {
  const { data, isInitial } = useWidgetData({ telemetryKey, cache });

  const rawValue = extractRawValue(data);
  const colorMap = (config?.color_map as Record<string, unknown>) || (config?.extra as any)?.color_map;
  const defaultColor = (config?.default_color as string) || (config?.extra as any)?.default_color || "#A0A0A0";
  const status = getMappedStatus(rawValue, colorMap, defaultColor, "Aguardando…");

  const iconName = (config?.style as any)?.icon || "";
  const numValue = rawValue !== null ? parseFloat(String(rawValue)) : null;

  return (
    <motion.div
      initial={isInitial ? { opacity: 0, scale: 0.95 } : false}
      animate={{ opacity: 1, scale: 1 }}
      className={`glass-card rounded-lg ${compact ? "p-2 gap-1" : "p-4 gap-2"} h-full flex flex-col items-center justify-center border border-border/50 relative overflow-hidden`}
    >
      <span className={`${compact ? "text-[8px]" : "text-[10px]"} font-display uppercase tracking-wider text-muted-foreground truncate w-full text-center`}>
        {title}
      </span>
      <div className="flex items-center gap-2">
        {iconName ? (
          <AnimatedIcon
            iconName={iconName}
            color={status.color}
            size="w-6 h-6"
            value={numValue}
            isCritical={status.isCritical}
            isHealthy={!status.isCritical && rawValue !== null}
          />
        ) : (
          <motion.span
            className="w-3.5 h-3.5 rounded-full flex-shrink-0"
            animate={status.isCritical ? { scale: [1, 1.3, 1] } : {}}
            transition={status.isCritical ? { duration: 0.8, repeat: Infinity } : {}}
            style={{
              background: status.color,
              boxShadow: `0 0 8px ${status.color}, 0 0 16px ${status.color}80`,
            }}
          />
        )}
        <span
          className="text-base font-bold font-mono"
          style={{ color: status.color }}
        >
          {status.label}
        </span>
      </div>
      {rawValue === null && (
        <span className="text-[9px] text-muted-foreground/50 animate-pulse">aguardando dados…</span>
      )}
    </motion.div>
  );
}
