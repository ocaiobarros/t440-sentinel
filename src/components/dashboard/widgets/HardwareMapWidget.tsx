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

function getHotspotState(hotspot: ImageHotspot, cache: Map<string, TelemetryCacheEntry>) {
  if (!hotspot.telemetry_key) {
    return { color: hotspot.default_color || "#555555", isCritical: false, rawValue: null, label: "" };
  }
  const entry = cache.get(hotspot.telemetry_key);
  if (!entry || !entry.data) {
    return { color: hotspot.default_color || "#555555", isCritical: false, rawValue: null, label: "" };
  }
  const rawValue = extractRawValue(entry.data);
  const status = getMappedStatus(rawValue, hotspot.color_map, hotspot.default_color || "#555555");
  return { color: status.color, isCritical: status.isCritical, rawValue, label: status.label };
}

export default function HardwareMapWidget({ imageUrl, hotspots, cache, title }: Props) {
  const hotspotStates = useMemo(
    () => hotspots.map((h) => ({ ...h, ...getHotspotState(h, cache) })),
    [hotspots, cache],
  );

  return (
    <div className="glass-card rounded-lg h-full w-full flex flex-col overflow-hidden border border-border/50">
      <div className="px-3 pt-2 pb-1">
        <span className="text-[10px] font-display uppercase tracking-wider text-muted-foreground">{title}</span>
      </div>
      <div className="flex-1 relative overflow-hidden flex items-start justify-center">
        <HardwareMapInner imageUrl={imageUrl} title={title} hotspotStates={hotspotStates} />
      </div>
    </div>
  );
}

function HardwareMapInner({ imageUrl, title, hotspotStates }: { imageUrl: string; title: string; hotspotStates: any[] }) {
  return (
    <div className="relative w-full" style={{ lineHeight: 0 }}>
      <img
        src={imageUrl}
        alt={title}
        className="block w-full h-auto select-none"
        style={{ margin: 0, padding: 0, border: "none" }}
        draggable={false}
      />
      {/* LED overlay – exactly same size as the img via inset:0 + lineHeight:0 on parent */}
      <div className="absolute inset-0">
        {hotspotStates.map((h) => {
          const size = h.size || 12;
          const glowMul = h.glowRadius || 1;
          const shouldBlink = h.blinkOnCritical !== false && h.isCritical;
          const height = h.shape === "bar-h" ? size / 3 : h.shape === "bar-v" ? size * 2 : size;
          const radius = h.shape === "circle" ? "50%" : h.shape === "square" ? "2px" : "1px";

          return (
            <div
              key={h.id}
              className="absolute"
              style={{
                left: `${h.x}%`,
                top: `${h.y}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              {/* Glow layer */}
              <div
                className="absolute transition-all duration-500"
                style={{
                  left: 0, top: 0,
                  width: size,
                  height,
                  borderRadius: radius,
                  backgroundColor: "transparent",
                  boxShadow: `0 0 ${size * glowMul}px ${h.color}, 0 0 ${size * glowMul * 2}px ${h.color}50, 0 0 ${size * glowMul * 3}px ${h.color}20`,
                  animation: shouldBlink ? "hwBlink 1s ease-in-out infinite" : undefined,
                }}
              />
              {/* LED core */}
              <div
                className="transition-colors duration-500"
                style={{
                  width: size,
                  height,
                  borderRadius: radius,
                  backgroundColor: h.color,
                  boxShadow: `inset 0 0 ${size / 3}px rgba(255,255,255,0.3)`,
                  animation: shouldBlink ? "hwBlink 1s ease-in-out infinite" : undefined,
                }}
                title={`${h.label}: ${h.rawValue ?? "sem dados"}`}
              />
              {/* Value overlay */}
              {h.showValue && h.rawValue !== null && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none"
                  style={{
                    top: height + 2,
                    fontSize: Math.max(8, Math.min(size * 0.7, 12)),
                    fontFamily: "'JetBrains Mono', monospace",
                    color: h.color,
                    textShadow: `0 0 4px ${h.color}`,
                    lineHeight: 1,
                  }}
                >
                  {h.label !== h.rawValue ? h.label : h.rawValue}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
