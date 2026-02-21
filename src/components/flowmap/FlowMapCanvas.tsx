import { useEffect, useRef } from "react";
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
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};box-shadow:0 0 ${size}px ${color}80;${pulse}cursor:pointer;"></div>
    </div>`,
  });
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

function linkTooltipHtml(
  linkId: string,
  linkStatus: { status: string; originHost: string; destHost: string } | undefined,
  activeEvent: { status: string; started_at: string } | undefined,
  linkMeta?: { link_type: string; is_ring: boolean; priority: number },
): string {
  const st = linkStatus?.status ?? "UNKNOWN";
  const color = st === "DOWN" ? "#ff1744" : st === "DEGRADED" ? "#ff9100" : st === "UP" ? "#00e676" : "#9e9e9e";
  const origin = linkStatus?.originHost ?? "?";
  const dest = linkStatus?.destHost ?? "?";

  let durationHtml = "";
  if (activeEvent && !activeEvent.started_at.includes("null")) {
    const startMs = new Date(activeEvent.started_at).getTime();
    const elapsed = Math.floor((Date.now() - startMs) / 1000);
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    const dur = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
    durationHtml = `<div style="margin-top:4px;">Duração: <span style="color:#ff9100;font-weight:700;">${dur}</span></div>`;
  }

  const metaHtml = linkMeta
    ? `<div style="margin-top:4px;color:#888;font-size:9px;">
        Tipo: <span style="color:#e0e0e0;">${linkMeta.link_type}</span>
        ${linkMeta.is_ring ? ' • <span style="color:#00e5ff;">Ring</span>' : ""}
        ${linkMeta.priority > 0 ? ` • P${linkMeta.priority}` : ""}
      </div>`
    : "";

  return `
    <div style="font-family:'JetBrains Mono',monospace;font-size:11px;line-height:1.6;min-width:180px;">
      <div style="font-family:'Orbitron',sans-serif;font-weight:700;font-size:10px;color:#e0e0e0;margin-bottom:2px;">${origin} ⟷ ${dest}</div>
      <hr style="border:none;border-top:1px solid #333;margin:4px 0;">
      <div>Link: <span style="color:${color};font-weight:700;">${st}</span></div>
      ${durationHtml}
      ${metaHtml}
    </div>
  `;
}

/* ── CSS injection ── */
const STYLE_ID = "flowmap-pulse-style";
function ensurePulseStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes fmPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.6);opacity:0.5}}
    @keyframes fmLinkPulse{0%,100%{opacity:0.9}50%{opacity:0.3}}
    .fm-link-pulse{animation:fmLinkPulse 1.2s ease-in-out infinite}
    .fm-link-pulse-slow{animation:fmLinkPulse 2s ease-in-out infinite}
    .flowmap-tooltip{background:#1a1a2e!important;border:1px solid #333!important;border-radius:8px!important;padding:8px 10px!important;box-shadow:0 4px 20px rgba(0,0,0,0.5)!important;}
    .flowmap-tooltip::before{border-top-color:#333!important;}
  `;
  document.head.appendChild(s);
}

/* ── Props ── */
export interface LinkStatusInfo {
  status: string;
  originHost: string;
  destHost: string;
}

export interface LinkEventInfo {
  id: string;
  link_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
}

interface Props {
  flowMap: FlowMap;
  hosts: FlowMapHost[];
  links: FlowMapLink[];
  statusMap: Record<string, HostStatus>;
  linkStatuses?: Record<string, LinkStatusInfo>;
  linkEvents?: LinkEventInfo[];
  impactedLinkIds?: string[];
  isolatedNodeIds?: string[];
  onMapClick?: (lat: number, lon: number) => void;
  onHostClick?: (hostId: string) => void;
  focusHost?: FlowMapHost | null;
  className?: string;
}

export default function FlowMapCanvas({
  flowMap,
  hosts,
  links,
  statusMap,
  linkStatuses = {},
  linkEvents = [],
  impactedLinkIds = [],
  isolatedNodeIds = [],
  onMapClick,
  onHostClick,
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

  /* Update layers */
  useEffect(() => {
    if (!layersRef.current) return;
    const { markers, lines: linesLayer } = layersRef.current;
    markers.clearLayers();
    linesLayer.clearLayers();

    const hostStatusById: Record<string, HostStatus> = {};
    hosts.forEach((h) => {
      hostStatusById[h.id] = statusMap[h.zabbix_host_id] ?? { status: "UNKNOWN" };
    });

    const impactedSet = new Set(impactedLinkIds);

    // Build active events by link_id
    const activeEventByLink = new Map<string, LinkEventInfo>();
    for (const ev of linkEvents) {
      if (!ev.ended_at) {
        activeEventByLink.set(ev.link_id, ev);
      }
    }

    // Determine if any link is DOWN or DEGRADED → dim healthy links
    const hasIncident = links.some((l) => {
      const s = linkStatuses[l.id]?.status;
      return s === "DOWN" || s === "DEGRADED";
    });

    // Links
    links.forEach((link) => {
      const originHost = hosts.find((h) => h.id === link.origin_host_id);
      const destHost = hosts.find((h) => h.id === link.dest_host_id);
      if (!originHost || !destHost) return;

      const ls = linkStatuses[link.id];
      const linkSt = ls?.status ?? "UNKNOWN";
      const isImpacted = impactedSet.has(link.id);
      const isAffected = linkSt === "DOWN" || linkSt === "DEGRADED" || isImpacted;

      let color: string;
      if (linkSt === "DOWN") color = "#ff1744";
      else if (linkSt === "DEGRADED") color = "#ff9100";
      else if (isImpacted) color = "#8b0000";
      else color = "#00e676";

      const weight = linkSt === "DOWN" ? 5 : linkSt === "DEGRADED" ? 4 : isImpacted ? 5 : link.is_ring ? 3 : 2;
      const dashArray = linkSt === "DOWN" ? "10, 6" : linkSt === "DEGRADED" ? "6, 4" : isImpacted ? "8, 4" : undefined;
      const pulseClass = linkSt === "DOWN" ? "fm-link-pulse" : linkSt === "DEGRADED" ? "fm-link-pulse-slow" : "";
      const opacity = hasIncident && !isAffected ? 0.25 : 0.9;

      const coords =
        link.geometry?.coordinates?.length >= 2
          ? link.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number])
          : [
              [originHost.lat, originHost.lon] as [number, number],
              [destHost.lat, destHost.lon] as [number, number],
            ];

      const polyline = L.polyline(coords, {
        color,
        weight,
        opacity,
        dashArray,
        className: pulseClass,
      });

      const activeEvent = activeEventByLink.get(link.id);
      polyline.bindTooltip(
        linkTooltipHtml(link.id, ls, activeEvent, {
          link_type: link.link_type,
          is_ring: link.is_ring,
          priority: link.priority,
        }),
        { className: "flowmap-tooltip", sticky: true },
      );

      polyline.addTo(linesLayer);
    });

    // Hosts — clickable markers
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

      // Emit host click for link creation
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        onHostClick?.(h.id);
      });

      marker.addTo(markers);
    });
  }, [hosts, links, statusMap, linkStatuses, linkEvents, impactedLinkIds, isolatedNodeIds, onHostClick]);

  return (
    <div ref={containerRef} className={`w-full h-full ${className ?? ""}`} style={{ background: "#0a0b10" }} />
  );
}
