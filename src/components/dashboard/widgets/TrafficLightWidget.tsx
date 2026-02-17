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

export default function TrafficLightWidget({ telemetryKey, title, cache, config }: Props) {
  const { data, isInitial } = useWidgetData({ telemetryKey, cache });
  
  const rawValue = extractRawValue(data);
  const colorMap = (config?.color_map as Record<string, string>) || (config?.extra as any)?.color_map;
  const defaultColor = (config?.default_color as string) || (config?.extra as any)?.default_color || "#A0A0A0";
  const status = getMappedStatus(rawValue, colorMap, defaultColor);

  // 3 lights: red, amber, green - highlight the active one
  const lights = [
    { color: "#FF4444", active: status.color.toLowerCase() === "#ff4444" || status.color.toLowerCase() === "#8b0000" },
    { color: "#FFBF00", active: status.color.toLowerCase() === "#ffbf00" || status.color.toLowerCase() === "#f59e0b" },
    { color: "#39FF14", active: status.color.toLowerCase() === "#39ff14" || status.color.toLowerCase() === "#22c55e" },
  ];

  // If none matches standard colors, just highlight based on the actual matched color
  const hasMatch = lights.some(l => l.active);
  
  return (
    <motion.div
      initial={isInitial ? { opacity: 0, scale: 0.95 } : false}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card rounded-lg p-3 h-full flex flex-col items-center justify-center gap-1.5 border border-border/50"
    >
      <span className="text-[9px] font-display uppercase tracking-wider text-muted-foreground truncate w-full text-center">
        {title}
      </span>
      <div className="flex flex-col gap-1.5 items-center">
        {lights.map((light, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-500"
            style={{
              width: 18,
              height: 18,
              background: light.active ? light.color : `${light.color}20`,
              boxShadow: light.active ? `0 0 10px ${light.color}, 0 0 20px ${light.color}60` : "none",
              opacity: light.active ? 1 : 0.3,
            }}
          />
        ))}
        {!hasMatch && rawValue !== null && (
          <div
            className="rounded-full mt-1"
            style={{
              width: 18,
              height: 18,
              background: status.color,
              boxShadow: `0 0 10px ${status.color}, 0 0 20px ${status.color}60`,
            }}
          />
        )}
      </div>
      <span className="text-[8px] font-mono text-muted-foreground">{status.label}</span>
    </motion.div>
  );
}
