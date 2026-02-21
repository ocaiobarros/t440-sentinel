import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { FlowMap, FlowMapHost, FlowMapLink, HostStatus } from "@/hooks/useFlowMaps";

/* ── Icon factories ── */
function hostIcon(status: "UP" | "DOWN" | "UNKNOWN", isCritical: boolean): L.DivIcon {
  const color = status === "UP" ? "#00e676" : status === "DOWN" ? "#ff1744" : "#9e9e9e";
  const size = isCritical && status === "DOWN" ? 20 : 14;
  const pulse = status === "DOWN" ? `animation: fmPulse ${isCritical ? "0.8s" : "1.4s"} ease-in-out infinite;` : "";

  return L.divIcon({
    className: "",
    iconSize: [size * 2, size * 2],
    iconAnchor: [size, size],
    html: `<div style="width:${size * 2}px;height:${size * 2}px;display:flex;align-items:center;justify-content:center;">
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};box-shadow:0 0 ${size}px ${color}80;${pulse}"></div>
    </div>`,
  });
}

function linkColor(
  originStatus: string,
  destStatus: string,
  isImpacted: boolean,
): string {
  if (isImpacted) return "#8b0000";
  if (originStatus === "UP" && destStatus === "UP") return "#00e676";
  if (originStatus === "DOWN" && destStatus === "DOWN") return "#ff1744";
  return "#ff9100";
}

/* ── Tooltip ── */
function hostTooltipHtml(host: FlowMapHost, st: HostStatus | undefined): string {
  const status = st?.status ?? "UNKNOWN";
  const color = status === "UP" ? "#00e676" : status === "DOWN" ? "#ff1744" : "#9e9e9e";
  return `
    <div style="font-family:'JetBrains Mono',monospace;font-size:11px;line-height:1.6;min-width:180px;">
      <div style="font-family:'Orbitron',sans-serif;font-weight:700;font-size:12px;color:#e0e0e0;margin-bottom:4px;">${host.host_name || host.zabbix_host_id}</div>
      <div style="color:#888;font-size:10px;">${host.host_group || "—"}</div>
      <hr style="border:none;border-top:1px solid #333;margin:6px 0;">
      <div>Status: <span style="color:${color};font-weight:700;">${status}</span></div>
      ${st?.latency != null ? `<div>Latência: <span style="color:#00e5ff;">${st.latency}ms</span></div>` : ""}
      ${st?.availability24h != null ? `<div>Disp. 24h: <span style="color:#00e676;">${st.availability24h.toFixed(1)}%</span></div>` : ""}
      ${st?.lastCheck ? `<div style="color:#666;font-size:9px;margin-top:4px;">Últ. check: ${new Date(st.lastCheck).toLocaleTimeString("pt-BR")}</div>` : ""}
    </div>
  `;
}

/* ── CSS injection ── */
const STYLE_ID = "flowmap-pulse-style";
function ensurePulseStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `@keyframes fmPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.6);opacity:0.5}}`;
  document.head.appendChild(s);
}

/* ── Props ── */
interface Props {
  flowMap: FlowMap;
  hosts: FlowMapHost[];
  links: FlowMapLink[];
  statusMap: Record<string, HostStatus>;
  impactedLinkIds?: string[];
  isolatedNodeIds?: string[];
  onMapClick?: (lat: number, lon: number) => void;
  focusHost?: FlowMapHost | null;
  className?: string;
}

export default function FlowMapCanvas({
  flowMap,
  hosts,
  links,
  statusMap,
  impactedLinkIds = [],
  isolatedNodeIds = [],
  onMapClick,
  focusHost,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<{ markers: L.LayerGroup; lines: L.LayerGroup } | null>(null);

  /* Init map once */
  useEffect(() => {
    ensurePulseStyle();
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [flowMap.center_lat, flowMap.center_lon],
      zoom: flowMap.zoom,
      zoomControl: false,
      attributionControl: false,
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      subdomains: "abcd",
    }).addTo(map);

    const markers = L.layerGroup().addTo(map);
    const lines = L.layerGroup().addTo(map);
    layersRef.current = { markers, lines };
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  /* Forward click */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !onMapClick) return;
    const handler = (e: L.LeafletMouseEvent) => onMapClick(e.latlng.lat, e.latlng.lng);
    map.on("click", handler);
    return () => { map.off("click", handler); };
  }, [onMapClick]);

  /* Auto-zoom to focused host */
  useEffect(() => {
    if (!focusHost || !mapRef.current) return;
    mapRef.current.flyTo([focusHost.lat, focusHost.lon], Math.max(mapRef.current.getZoom(), 12), {
      duration: 1.2,
    });
  }, [focusHost]);

  /* Update layers (no map recreation) */
  useEffect(() => {
    if (!layersRef.current) return;
    const { markers, lines: linesLayer } = layersRef.current;
    markers.clearLayers();
    linesLayer.clearLayers();

    // Build host-id → status map keyed by flow_map_hosts.id
    const hostStatusById: Record<string, HostStatus> = {};
    hosts.forEach((h) => {
      hostStatusById[h.id] = statusMap[h.zabbix_host_id] ?? { status: "UNKNOWN" };
    });

    // Use backend-provided impacted links set
    const impactedSet = new Set(impactedLinkIds);

    // Links
    links.forEach((link) => {
      const originHost = hosts.find((h) => h.id === link.origin_host_id);
      const destHost = hosts.find((h) => h.id === link.dest_host_id);
      if (!originHost || !destHost) return;

      const oSt = hostStatusById[link.origin_host_id]?.status ?? "UNKNOWN";
      const dSt = hostStatusById[link.dest_host_id]?.status ?? "UNKNOWN";
      const isImpacted = impactedSet.has(link.id);
      const color = linkColor(oSt, dSt, isImpacted);
      const weight = isImpacted ? 5 : link.is_ring ? 3 : 2;
      const dashArray = isImpacted ? "8, 4" : undefined;

      const coords =
        link.geometry?.coordinates?.length >= 2
          ? link.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number])
          : [
              [originHost.lat, originHost.lon] as [number, number],
              [destHost.lat, destHost.lon] as [number, number],
            ];

      L.polyline(coords, { color, weight, opacity: 0.85, dashArray }).addTo(linesLayer);
    });

    // Hosts
    const isolatedSet = new Set(isolatedNodeIds);
    hosts.forEach((h) => {
      const st = hostStatusById[h.id];
      const isIsolated = isolatedSet.has(h.id);
      const marker = L.marker([h.lat, h.lon], {
        icon: hostIcon(st?.status ?? "UNKNOWN", h.is_critical || isIsolated),
      });
      marker.bindTooltip(hostTooltipHtml(h, st), {
        className: "flowmap-tooltip",
        direction: "top",
        offset: [0, -12],
      });
      marker.addTo(markers);
    });
  }, [hosts, links, statusMap, impactedLinkIds, isolatedNodeIds]);

  return (
    <div ref={containerRef} className={`w-full h-full ${className ?? ""}`} style={{ background: "#0a0b10" }} />
  );
}
