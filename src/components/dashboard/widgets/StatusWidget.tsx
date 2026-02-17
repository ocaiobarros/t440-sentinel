import { motion } from "framer-motion";
import { useWidgetData } from "@/hooks/useWidgetData";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import { getMappedStatus, extractRawValue } from "@/lib/telemetry-utils";

interface Props {
  telemetryKey: string;
  title: string;
  cache: Map<string, TelemetryCacheEntry>;
  config?: Record<string, unknown>;
}

export default function StatusWidget({ telemetryKey, title, cache, config }: Props) {
  const { data, isInitial } = useWidgetData({ telemetryKey, cache });

  const rawValue = extractRawValue(data);
  const colorMap = (config?.color_map as Record<string, string>) || (config?.extra as any)?.color_map;
  const defaultColor = (config?.default_color as string) || (config?.extra as any)?.default_color || "#A0A0A0";
  const status = getMappedStatus(rawValue, colorMap, defaultColor, "Aguardando…");

  return (
    <motion.div
      initial={isInitial ? { opacity: 0, scale: 0.95 } : false}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card rounded-lg p-4 h-full flex flex-col items-center justify-center gap-2 border border-border/50 relative overflow-hidden"
      style={status.isCritical ? {
        boxShadow: `0 0 12px ${status.color}4D, 0 0 30px ${status.color}26`,
        animation: "pulseRedBorder 1.5s ease-in-out infinite",
      } : undefined}
    >
      <span className="text-[10px] font-display uppercase tracking-wider text-muted-foreground truncate w-full text-center">
        {title}
      </span>
      <div className="flex items-center gap-2">
        <span
          className="w-3.5 h-3.5 rounded-full flex-shrink-0"
          style={{
            background: status.color,
            boxShadow: `0 0 8px ${status.color}, 0 0 16px ${status.color}80`,
            animation: status.isCritical ? "pulse 1.5s ease-in-out infinite" : undefined,
          }}
        />
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
