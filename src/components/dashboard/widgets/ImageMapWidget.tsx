import { useMemo } from "react";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import type { ImageHotspot } from "@/types/builder";

interface Props {
  imageUrl: string;
  hotspots: ImageHotspot[];
  cache: Map<string, TelemetryCacheEntry>;
  title: string;
}

function getHotspotColor(hotspot: ImageHotspot, cache: Map<string, TelemetryCacheEntry>): string {
  if (!hotspot.telemetry_key) return hotspot.default_color || "#39FF14";

  const entry = cache.get(hotspot.telemetry_key);
  if (!entry || !entry.data) return hotspot.default_color || "#555555";

  const value = typeof entry.data === "object" && entry.data !== null && "value" in (entry.data as any)
    ? String((entry.data as any).value)
    : String(entry.data);

  // Check color_map
  if (hotspot.color_map && hotspot.color_map[value]) {
    return hotspot.color_map[value];
  }

  // Numeric thresholds: green < 70, amber 70-90, red > 90
  const num = parseFloat(value);
  if (!isNaN(num)) {
    if (num > 90) return "#FF4444";
    if (num > 70) return "#FFBF00";
    return "#39FF14";
  }

  // String status mapping
  const lower = value.toLowerCase();
  if (["ok", "up", "online", "1", "true", "running"].includes(lower)) return "#39FF14";
  if (["warning", "degraded", "2"].includes(lower)) return "#FFBF00";
  if (["critical", "down", "offline", "0", "false", "error"].includes(lower)) return "#FF4444";

  return hotspot.default_color || "#39FF14";
}

export default function ImageMapWidget({ imageUrl, hotspots, cache, title }: Props) {
  const hotspotColors = useMemo(
    () => hotspots.map((h) => ({ ...h, color: getHotspotColor(h, cache) })),
    [hotspots, cache],
  );

  return (
    <div className="glass-card rounded-lg h-full w-full flex flex-col overflow-hidden border border-border/50">
      <div className="px-3 pt-2 pb-1">
        <span className="text-[10px] font-display uppercase tracking-wider text-muted-foreground">{title}</span>
      </div>
      <div className="flex-1 relative overflow-hidden">
        <img
          src={imageUrl}
          alt={title}
          className="w-full h-full object-contain"
          draggable={false}
        />
        {hotspotColors.map((h) => (
          <div
            key={h.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-500"
            style={{
              left: `${h.x}%`,
              top: `${h.y}%`,
              width: h.size || 12,
              height: h.shape === "bar-h" ? (h.size || 12) / 3 : h.shape === "bar-v" ? (h.size || 12) * 2 : h.size || 12,
              borderRadius: h.shape === "circle" ? "50%" : h.shape === "square" ? "2px" : "1px",
              backgroundColor: h.color,
              boxShadow: `0 0 ${(h.size || 12)}px ${h.color}, 0 0 ${(h.size || 12) * 2}px ${h.color}40`,
              animation: h.color === "#FF4444" ? "pulseRed 1.5s ease-in-out infinite" : undefined,
            }}
            title={`${h.label}: ${cache.get(h.telemetry_key)?.data ? JSON.stringify((cache.get(h.telemetry_key)!.data as any)?.value ?? cache.get(h.telemetry_key)!.data) : "sem dados"}`}
          />
        ))}
      </div>
    </div>
  );
}
