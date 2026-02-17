import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { useWidgetData } from "@/hooks/useWidgetData";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import { getMappedStatus, extractRawValue } from "@/lib/telemetry-utils";
import DynamicIcon from "@/components/builder/DynamicIcon";

interface Props {
  telemetryKey: string;
  title: string;
  cache: Map<string, TelemetryCacheEntry>;
  config?: Record<string, unknown>;
}

export default function StatusWidget({ telemetryKey, title, cache, config }: Props) {
  const { data, isInitial } = useWidgetData({ telemetryKey, cache });

  const rawValue = extractRawValue(data);
  const colorMap = (config?.color_map as Record<string, unknown>) || (config?.extra as any)?.color_map;
  const defaultColor = (config?.default_color as string) || (config?.extra as any)?.default_color || "#A0A0A0";
  const status = getMappedStatus(rawValue, colorMap, defaultColor, "Aguardando…");

  const iconName = (config?.style as any)?.icon || "";
  const isInfraIcon = iconName.includes(":");

  return (
    <motion.div
      initial={isInitial ? { opacity: 0, scale: 0.95 } : false}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card rounded-lg p-4 h-full flex flex-col items-center justify-center gap-2 border border-border/50 relative overflow-hidden"
    >
      <span className="text-[10px] font-display uppercase tracking-wider text-muted-foreground truncate w-full text-center">
        {title}
      </span>
      <div className="flex items-center gap-2">
        {iconName ? (
          <motion.div
            animate={status.isCritical ? { scale: [1, 1.15, 1] } : {}}
            transition={status.isCritical ? { duration: 0.8, repeat: Infinity } : {}}
          >
            {isInfraIcon ? (
              <Icon icon={iconName} className="w-6 h-6" style={{ color: status.color }} />
            ) : (
              <DynamicIcon name={iconName} className="w-6 h-6" style={{ color: status.color }} />
            )}
          </motion.div>
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
