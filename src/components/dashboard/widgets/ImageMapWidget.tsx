import { useMemo } from "react";
import type { TelemetryCacheEntry } from "@/hooks/useDashboardRealtime";
import type { ImageHotspot } from "@/types/builder";
import { getMappedStatus, extractRawValue } from "@/lib/telemetry-utils";

interface Props {
  imageUrl: string;
  hotspots: ImageHotspot[];
  cache: Map<string, TelemetryCacheEntry>;
  title: string;
}

function getHotspotColor(hotspot: ImageHotspot, cache: Map<string, TelemetryCacheEntry>): { color: string; isCritical: boolean; rawValue: string | null } {
  if (!hotspot.telemetry_key) {
    return { color: hotspot.default_color || "#555555", isCritical: false, rawValue: null };
  }

  const entry = cache.get(hotspot.telemetry_key);
  if (!entry || !entry.data) {
    return { color: hotspot.default_color || "#555555", isCritical: false, rawValue: null };
  }

  const rawValue = extractRawValue(entry.data);
  // Use ONLY the user's color_map — no automatic assumptions
  const status = getMappedStatus(rawValue, hotspot.color_map, hotspot.default_color || "#555555");
  return { color: status.color, isCritical: status.isCritical, rawValue };
}

export default function ImageMapWidget({ imageUrl, hotspots, cache, title }: Props) {
  const hotspotColors = useMemo(
    () => hotspots.map((h) => ({ ...h, ...getHotspotColor(h, cache) })),
    [hotspots, cache],
  );

  return (
    <div className="glass-card rounded-lg h-full w-full flex flex-col overflow-hidden border border-border/50">
      <div className="px-3 pt-2 pb-1">
        <span className="text-[10px] font-display uppercase tracking-wider text-muted-foreground">{title}</span>
      </div>
      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        <div className="relative w-full" style={{ lineHeight: 0 }}>
          <img
            src={imageUrl}
            alt={title}
            className="block w-full h-auto select-none"
            draggable={false}
          />
          <div className="absolute inset-0">
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
                  animation: h.isCritical ? "pulseRed 1.5s ease-in-out infinite" : undefined,
                }}
                title={`${h.label}: ${h.rawValue ?? "sem dados"}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
