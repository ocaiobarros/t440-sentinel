import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { FlowMap, FlowMapHost, FlowMapLink, HostStatus, FlowMapCTO, FlowMapCable, FlowMapReserva } from "@/hooks/useFlowMaps";
import type { LinkTraffic } from "@/hooks/useFlowMapStatus";

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
  linkMeta?: { link_type: string; is_ring: boolean; priority: number; distance_km?: number },
  traffic?: LinkTraffic,
): string {
  const st = linkStatus?.status ?? "UNKNOWN";
  const color = st === "DOWN" ? "#ff1744" : st === "DEGRADED" ? "#ff9100" : st === "UP" ? "#00e676" : "#9e9e9e";
  const origin = linkStatus?.originHost ?? "?";
  const dest = linkStatus?.destHost ?? "?";

  const fmtBps = (bps: number | null): string => {
    if (bps == null || bps === 0) return "0";
    if (bps >= 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`;
    if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} Mbps`;
    if (bps >= 1e3) return `${(bps / 1e3).toFixed(0)} Kbps`;
    return `${bps.toFixed(0)} bps`;
  };

  let durationHtml = "";
  if (activeEvent && !activeEvent.started_at.includes("null")) {
    const startMs = new Date(activeEvent.started_at).getTime();
    const elapsed = Math.floor((Date.now() - startMs) / 1000);
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    const dur = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
    durationHtml = `<div>⏱ Duração: <span style="color:#ff9100;font-weight:700;">${dur}</span></div>`;
  }

  let routeHtml = "";
  if (linkMeta?.distance_km != null && linkMeta.distance_km > 0) {
    routeHtml += `<div>📏 Distância: <span style="color:#00e5ff;font-weight:700;">${linkMeta.distance_km} km</span></div>`;
  }

  // Traffic section — Upload first, Download second
  const dlA = traffic?.sideA?.in_bps;
  const ulA = traffic?.sideA?.out_bps;
  const dlB = traffic?.sideB?.in_bps;
  const ulB = traffic?.sideB?.out_bps;
  const utilA = traffic?.sideA?.utilization;
  const utilB = traffic?.sideB?.utilization;
  const errInA = traffic?.sideA?.errors_in;
  const errOutA = traffic?.sideA?.errors_out;
  const errInB = traffic?.sideB?.errors_in;
  const errOutB = traffic?.sideB?.errors_out;
  const hasTraffic = dlA != null || ulA != null || dlB != null || ulB != null;

  let trafficHtml = "";
  if (hasTraffic) {
    trafficHtml = `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #333;">
      <div style="font-weight:700;color:#e0e0e0;margin-bottom:4px;">📊 Tráfego</div>`;
    if (ulA != null || dlA != null) {
      const errA = (errInA ?? 0) + (errOutA ?? 0);
      const errHtml = errA > 0 ? ` <span style="color:#ff1744;">⚠ ${errA} erros</span>` : ` <span style="color:#4caf50;">0 erros</span>`;
      trafficHtml += `<div style="margin-bottom:2px;">Lado A: <span style="color:#ff9100;">▲ ${fmtBps(ulA)}</span> <span style="color:#00e5ff;">▼ ${fmtBps(dlA)}</span>${utilA != null ? ` <span style="color:#888;">(${Math.min(utilA, 100).toFixed(1)}%)</span>` : ""}${errHtml}</div>`;
    }
    if (ulB != null || dlB != null) {
      const errB = (errInB ?? 0) + (errOutB ?? 0);
      const errHtml = errB > 0 ? ` <span style="color:#ff1744;">⚠ ${errB} erros</span>` : ` <span style="color:#4caf50;">0 erros</span>`;
      trafficHtml += `<div>Lado B: <span style="color:#ff9100;">▲ ${fmtBps(ulB)}</span> <span style="color:#00e5ff;">▼ ${fmtBps(dlB)}</span>${utilB != null ? ` <span style="color:#888;">(${Math.min(utilB, 100).toFixed(1)}%)</span>` : ""}${errHtml}</div>`;
    }
    trafficHtml += `</div>`;
  }

  const metaHtml = linkMeta
    ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #333;color:#888;font-size:10px;">
        Tipo: <span style="color:#e0e0e0;font-weight:600;">${linkMeta.link_type}</span>
        ${linkMeta.is_ring ? ' • <span style="color:#00e5ff;">Ring</span>' : ""}
        ${linkMeta.priority > 0 ? ` • Prioridade: P${linkMeta.priority}` : ""}
      </div>`
    : "";

  return `
    <div style="font-family:'JetBrains Mono',monospace;font-size:11px;line-height:1.7;min-width:220px;max-width:320px;">
      <div style="font-family:'Orbitron',sans-serif;font-weight:700;font-size:11px;color:#e0e0e0;margin-bottom:4px;">${origin} ⟷ ${dest}</div>
      <hr style="border:none;border-top:1px solid #333;margin:6px 0;">
      <div style="font-size:13px;">Status: <span style="color:${color};font-weight:700;text-shadow:0 0 6px ${color}80;">${st}</span></div>
      ${durationHtml}
      ${routeHtml}
      ${trafficHtml}
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
    @keyframes fmTrafficFlow{0%{stroke-dashoffset:40}100%{stroke-dashoffset:0}}
    @keyframes fmGlow{0%,100%{filter:drop-shadow(0 0 2px currentColor)}50%{filter:drop-shadow(0 0 8px currentColor)}}
    .fm-link-pulse{animation:fmLinkPulse 1.2s ease-in-out infinite}
    .fm-link-pulse-slow{animation:fmLinkPulse 2s ease-in-out infinite}
    .fm-traffic-flow{animation:fmTrafficFlow 0.6s linear infinite}
    .fm-traffic-glow{animation:fmGlow 2s ease-in-out infinite}
    .flowmap-tooltip{background:#0d0e1a!important;border:1px solid #00e67650!important;border-radius:10px!important;padding:12px 14px!important;box-shadow:0 8px 32px rgba(0,0,0,0.7),0 0 15px rgba(0,230,118,0.1)!important;}
    .flowmap-tooltip::before{border-top-color:#00e67650!important;}
    .fm-traffic-label,.fm-traffic-label.leaflet-div-icon{background:none!important;border:none!important;padding:0!important;box-shadow:none!important;pointer-events:none!important;transition:opacity 0.3s ease;margin:0!important;width:auto!important;height:auto!important;outline:none!important;}
    .fm-label-content{background:none;border:none;border-radius:0;padding:0;box-shadow:none;font-size:10px;text-shadow:0 0 4px rgba(0,0,0,0.9),0 1px 2px rgba(0,0,0,0.8);}
    .fm-traffic-label.fm-zoom-far{display:none!important;}
    .fm-traffic-label.fm-zoom-mid{display:none!important;}
    .fm-traffic-label.fm-zoom-close{opacity:1;}
    .fm-traffic-label.fm-zoom-detail{opacity:1;}
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

export interface CTOTelemetryData {
  status: string; healthRatio: number; onuOnline: number; onuOffline: number;
  onuAuthorized: number; ponLinkStatus: string; trafficIn: number | null;
  trafficOut: number | null; temperature: number | null; fanStatus: string | null;
}

interface Props {
  flowMap: FlowMap;
  hosts: FlowMapHost[];
  links: FlowMapLink[];
  ctos?: FlowMapCTO[];
  cables?: FlowMapCable[];
  reservas?: FlowMapReserva[];
  statusMap: Record<string, HostStatus>;
  linkStatuses?: Record<string, LinkStatusInfo>;
  linkEvents?: LinkEventInfo[];
  linkTraffic?: Record<string, LinkTraffic>;
  impactedLinkIds?: string[];
  isolatedNodeIds?: string[];
  ctoTelemetry?: Record<string, CTOTelemetryData>;
  onMapClick?: (lat: number, lon: number) => void;
  onHostClick?: (hostId: string) => void;
  onCTOClick?: (ctoId: string) => void;
  onMapReady?: (map: L.Map) => void;
  focusHost?: FlowMapHost | null;
  className?: string;
}

export default function FlowMapCanvas({
  flowMap,
  hosts,
  links,
  ctos = [],
  cables = [],
  reservas = [],
  statusMap,
  linkStatuses = {},
  linkEvents = [],
  linkTraffic = {},
  impactedLinkIds = [],
  isolatedNodeIds = [],
  ctoTelemetry = {},
  onMapClick,
  onHostClick,
  onCTOClick,
  onMapReady,
  focusHost,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<{ markers: L.LayerGroup; lines: L.LayerGroup; labels: L.LayerGroup; ctoLayer: L.LayerGroup; cableLayer: L.LayerGroup; reservaLayer: L.LayerGroup } | null>(null);

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
    const labels = L.layerGroup().addTo(map);
    const ctoLayer = L.layerGroup().addTo(map);
    const cableLayer = L.layerGroup().addTo(map);
    const reservaLayer = L.layerGroup().addTo(map);
    layersRef.current = { markers, lines, labels, ctoLayer, cableLayer, reservaLayer };
    mapRef.current = map;
    onMapReady?.(map);

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

  /* Zoom-responsive label sizing */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function applyZoomClass() {
      const zoom = map!.getZoom();
      const labels = document.querySelectorAll(".fm-traffic-label");
      const cls = zoom <= 6 ? "fm-zoom-far" : zoom <= 9 ? "fm-zoom-mid" : zoom <= 13 ? "fm-zoom-close" : "fm-zoom-detail";
      labels.forEach((el) => {
        el.classList.remove("fm-zoom-far", "fm-zoom-mid", "fm-zoom-close", "fm-zoom-detail");
        el.classList.add(cls);
      });
    }

    applyZoomClass();
    map.on("zoomend", applyZoomClass);
    return () => { map.off("zoomend", applyZoomClass); };
  }, [hosts, links]);

  /* Update layers */
  useEffect(() => {
    if (!layersRef.current) return;
    const { markers, lines: linesLayer, labels: labelsLayer } = layersRef.current;
    markers.clearLayers();
    linesLayer.clearLayers();
    labelsLayer.clearLayers();

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

    // Helper: format bps to Mbps/Gbps
    const fmtBps = (bps: number | null): string => {
      if (bps == null || bps === 0) return "0";
      if (bps >= 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`;
      if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} Mbps`;
      if (bps >= 1e3) return `${(bps / 1e3).toFixed(0)} Kbps`;
      return `${bps.toFixed(0)} bps`;
    };

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

      const weight = linkSt === "DOWN" ? 6 : linkSt === "DEGRADED" ? 5 : isImpacted ? 6 : link.is_ring ? 4 : 3;
      const dashArray = linkSt === "DOWN" ? "10, 6" : linkSt === "DEGRADED" ? "6, 4" : isImpacted ? "8, 4" : undefined;
      const pulseClass = linkSt === "DOWN" ? "fm-link-pulse" : linkSt === "DEGRADED" ? "fm-link-pulse-slow" : "fm-traffic-glow";
      const opacity = hasIncident && !isAffected ? 0.25 : 0.9;

      const coords =
        link.geometry?.coordinates?.length >= 2
          ? link.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number])
          : [
              [originHost.lat, originHost.lon] as [number, number],
              [destHost.lat, destHost.lon] as [number, number],
            ];

      // Glow underlay for visibility
      const glowLine = L.polyline(coords, {
        color,
        weight: weight + 4,
        opacity: 0.15,
      });
      glowLine.addTo(linesLayer);

      // Main polyline
      const polyline = L.polyline(coords, {
        color,
        weight,
        opacity,
        dashArray,
        className: pulseClass,
      });

      // Traffic flow animation overlay — bold dashes
      if (linkSt === "UP" || linkSt === "UNKNOWN") {
        const flowLine = L.polyline(coords, {
          color: "#00e5ff",
          weight: weight + 2,
          opacity: 0.45,
          dashArray: "8, 32",
          className: "fm-traffic-flow",
        });
        flowLine.addTo(linesLayer);
      }

      const activeEvent = activeEventByLink.get(link.id);
      const geom = link.geometry as any;
      const traffic = linkTraffic[link.id];

      polyline.bindTooltip(
        linkTooltipHtml(link.id, ls, activeEvent, {
          link_type: link.link_type,
          is_ring: link.is_ring,
          priority: link.priority,
          distance_km: geom?.distance_km,
        }, traffic),
        { className: "flowmap-tooltip", sticky: true },
      );

      polyline.addTo(linesLayer);

      // ── Persistent traffic label at midpoint ──
      const midIdx = Math.floor(coords.length / 2);
      const midPoint: [number, number] = coords[midIdx] || coords[0];

      const ulBps = traffic?.sideA?.out_bps ?? traffic?.sideB?.out_bps;
      const dlBps = traffic?.sideA?.in_bps ?? traffic?.sideB?.in_bps;
      const util = traffic?.sideA?.utilization ?? traffic?.sideB?.utilization;
      const hasTelemetry = dlBps != null || ulBps != null;
      const totalErrors = (traffic?.sideA?.errors_in ?? 0) + (traffic?.sideA?.errors_out ?? 0) + (traffic?.sideB?.errors_in ?? 0) + (traffic?.sideB?.errors_out ?? 0);

      const qualityColor = linkSt === "DOWN" ? "#ff1744" : linkSt === "DEGRADED" ? "#ff9100" : "#00e676";
      const qualityLabel = linkSt === "DOWN" ? "⛔ DOWN" : linkSt === "DEGRADED" ? "⚠ DEGRADED" : "✔ UP";
      const distKm = geom?.distance_km;

      // Utilization bar color (capped at 100% for display)
      const utilVal = util ?? 0;
      const utilDisplay = Math.min(utilVal, 100);
      const utilColor = utilVal > 80 ? "#ff1744" : utilVal > 50 ? "#ff9100" : "#00e676";

      const errHtml = totalErrors > 0
        ? `<div style="color:#ff1744;font-size:9px;font-weight:700;margin-top:2px;">⚠ ${totalErrors} erros</div>`
        : "";

      const ts = "text-shadow:0 0 3px #000,0 0 6px #000,0 1px 2px #000;";
      const labelHtml = `
        <div class="fm-label-content" style="font-family:'JetBrains Mono',monospace;line-height:1.3;white-space:nowrap;text-align:center;">
          <div style="font-size:11px;color:${qualityColor};font-weight:700;${ts}text-shadow:0 0 6px ${qualityColor}80,0 0 3px #000,0 1px 2px #000;">${qualityLabel}</div>
          ${hasTelemetry ? `
            <div style="display:flex;align-items:center;gap:5px;justify-content:center;font-weight:600;font-size:10px;${ts}">
              <span style="color:#ff9100;">▲${fmtBps(ulBps)}</span>
              <span style="color:#00e5ff;">▼${fmtBps(dlBps)}</span>
            </div>
            ${util != null ? `<div style="color:${utilColor};font-size:9px;font-weight:700;${ts}">${utilVal.toFixed(1)}%</div>` : ""}
          ` : ""}
          ${totalErrors > 0 ? `<div style="color:#ff1744;font-size:9px;font-weight:700;${ts}">⚠${totalErrors}</div>` : ""}
        </div>
      `;

      const labelIcon = L.divIcon({
        className: "fm-traffic-label",
        html: labelHtml,
        iconSize: L.point(0, 0),
        iconAnchor: L.point(0, 0),
      });

      const labelMarker = L.marker(midPoint, { icon: labelIcon, interactive: false });
      labelMarker.addTo(labelsLayer);
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

      // Emit host click for link creation + mobile field overlay
      const emitHostClick = (e: any) => {
        // Stop native DOM event so the map doesn't receive a "click" 
        // which would trigger Vaul's outside-click and close the Drawer immediately
        if (e.originalEvent) {
          e.originalEvent.stopPropagation();
          e.originalEvent.preventDefault();
        }
        console.log("[FlowMapCanvas] host click/tap:", h.id, h.host_name);
        onHostClick?.(h.id);
        // Dispatch for mobile FieldOverlay
        window.dispatchEvent(new CustomEvent("field-host-tap", { detail: h.id }));
      };
      marker.on("click", emitHostClick);
      // Also listen for touch to ensure mobile works
      marker.getElement()?.addEventListener("touchend", (te) => {
        te.stopPropagation();
        te.preventDefault();
        console.log("[FlowMapCanvas] touchend on host:", h.id);
        onHostClick?.(h.id);
        window.dispatchEvent(new CustomEvent("field-host-tap", { detail: h.id }));
      }, { passive: false });

      marker.addTo(markers);
    });
  }, [hosts, links, statusMap, linkStatuses, linkEvents, linkTraffic, impactedLinkIds, isolatedNodeIds, onHostClick]);

  /* ── CTO & Cable rendering with Level of Detail ── */
  useEffect(() => {
    if (!layersRef.current || !mapRef.current) return;
    const { ctoLayer, cableLayer, reservaLayer } = layersRef.current;
    const map = mapRef.current;

    function renderFTTH() {
      ctoLayer.clearLayers();
      cableLayer.clearLayers();
      reservaLayer.clearLayers();
      const zoom = map.getZoom();
      if (zoom < 15) return; // LoD: only show FTTH at zoom >= 15

      // Render cables first (below CTOs)
      cables.forEach((cable) => {
        const coords = cable.geometry?.coordinates?.length >= 2
          ? cable.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number])
          : [];
        if (coords.length < 2) return;

        const cableColor = cable.color_override || "#00e5ff";
        const glow = L.polyline(coords, { color: cableColor, weight: 6, opacity: 0.15 });
        glow.addTo(cableLayer);

        const line = L.polyline(coords, {
          color: cableColor,
          weight: 2,
          opacity: 0.8,
          dashArray: "4, 8",
          className: "fm-traffic-glow",
        });
        line.bindTooltip(
          `<div style="font-family:'JetBrains Mono',monospace;font-size:11px;">
            <div style="font-weight:700;color:#e0e0e0;">${cable.label || "Cabo"}</div>
            <div>Tipo: <span style="color:#00e5ff;">${cable.cable_type}</span></div>
            <div>Fibras: <span style="color:#00e676;">${cable.fiber_count}</span></div>
            ${cable.distance_km ? `<div>Distância: <span style="color:#ff9100;">${cable.distance_km} km</span></div>` : ""}
          </div>`,
          { className: "flowmap-tooltip", sticky: true },
        );
        line.addTo(cableLayer);
      });

      // Render reservas at zoom >= 16
      if (zoom >= 16) {
        reservas.forEach((r) => {
          const icon = L.divIcon({
            className: "",
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            html: `<div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
              <div style="width:16px;height:16px;border-radius:50%;background:#ff9100;box-shadow:0 0 8px #ff910080;border:2px solid #0a0b10;display:flex;align-items:center;justify-content:center;">
                <span style="font-size:8px;font-weight:900;color:#0a0b10;">R</span>
              </div>
            </div>`,
          });

          const marker = L.marker([r.lat, r.lon], { icon });
          marker.bindTooltip(
            `<div style="font-family:'JetBrains Mono',monospace;font-size:11px;min-width:140px;">
              <div style="font-family:'Orbitron',sans-serif;font-weight:700;font-size:12px;color:#ff9100;margin-bottom:4px;">📦 ${r.label || "Reserva"}</div>
              <div>Comprimento: <span style="color:#00e5ff;">${r.comprimento_m}m</span></div>
              <div>Tipo: <span style="color:#00e676;">${r.tipo_cabo}</span></div>
              ${r.description ? `<div style="color:#888;font-size:10px;margin-top:4px;">${r.description}</div>` : ""}
            </div>`,
            { className: "flowmap-tooltip", direction: "top", offset: [0, -12] },
          );
          marker.addTo(reservaLayer);
        });
      }

      // Render CTOs
      ctos.forEach((cto) => {
        const tel = ctoTelemetry[cto.id];
        const effectiveStatus = tel?.status ?? cto.status_calculated;
        const statusColor = effectiveStatus === "OK" ? "#00e676"
          : effectiveStatus === "CRITICAL" ? "#ff1744"
          : effectiveStatus === "DEGRADED" ? "#ff9100"
          : "#9e9e9e";

        const healthPct = tel ? `${tel.healthRatio}%` : null;

        const icon = L.divIcon({
          className: "",
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          html: `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;">
            <div style="width:18px;height:18px;border-radius:3px;background:${statusColor};box-shadow:0 0 10px ${statusColor}80;border:2px solid #0a0b10;display:flex;align-items:center;justify-content:center;">
              <span style="font-size:8px;font-weight:900;color:#0a0b10;">C</span>
            </div>
          </div>`,
        });

        const fmtBpsCto = (bps: number | null): string => {
          if (bps == null || bps === 0) return "0";
          if (bps >= 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`;
          if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} Mbps`;
          if (bps >= 1e3) return `${(bps / 1e3).toFixed(0)} Kbps`;
          return `${bps.toFixed(0)} bps`;
        };

        // Build rich tooltip
        let tooltipHtml = `<div style="font-family:'JetBrains Mono',monospace;font-size:11px;min-width:200px;line-height:1.6;">
          <div style="font-family:'Orbitron',sans-serif;font-weight:700;font-size:12px;color:#e0e0e0;margin-bottom:4px;">${cto.name || "CTO"}</div>
          <div>Status: <span style="color:${statusColor};font-weight:700;">${effectiveStatus}</span>${healthPct ? ` <span style="color:#888;font-size:10px;">(${healthPct})</span>` : ""}</div>
          <div>Capacidade: <span style="color:#00e5ff;">${cto.occupied_ports}/${cto.capacity} portas</span></div>`;

        if (tel) {
          const ponColor = tel.ponLinkStatus === "UP" ? "#00e676" : tel.ponLinkStatus === "DOWN" ? "#ff1744" : "#9e9e9e";
          tooltipHtml += `<hr style="border:none;border-top:1px solid #333;margin:6px 0;">
            <div style="font-weight:700;color:#e0e0e0;margin-bottom:2px;">📡 PON Telemetria</div>
            <div>Link: <span style="color:${ponColor};font-weight:700;">${tel.ponLinkStatus}</span></div>
            <div>ONUs: <span style="color:#00e676;">▲ ${tel.onuOnline} ON</span> • <span style="color:#ff4444;">${tel.onuOffline} OFF</span> • <span style="color:#3B82F6;">Σ ${tel.onuAuthorized}</span></div>`;

          if (tel.trafficIn != null || tel.trafficOut != null) {
            tooltipHtml += `<div style="margin-top:4px;">📊 <span style="color:#ff9100;">▲ ${fmtBpsCto(tel.trafficOut)}</span> <span style="color:#00e5ff;">▼ ${fmtBpsCto(tel.trafficIn)}</span></div>`;
          }

          if (tel.temperature != null) {
            const tempColor = tel.temperature >= 60 ? "#ff1744" : tel.temperature >= 45 ? "#ff9100" : "#00e676";
            tooltipHtml += `<div>🌡 Temp: <span style="color:${tempColor};font-weight:700;">${tel.temperature}°C</span></div>`;
          }
          if (tel.fanStatus) {
            const fanColor = tel.fanStatus === "ACTIVE" ? "#00e676" : "#ff1744";
            tooltipHtml += `<div>🌀 Fan: <span style="color:${fanColor};font-weight:700;">${tel.fanStatus}</span></div>`;
          }
        }

        if (cto.pon_port_index) tooltipHtml += `<div style="color:#888;font-size:10px;">Porta PON: ${cto.pon_port_index}</div>`;
        if (cto.description) tooltipHtml += `<div style="color:#888;font-size:10px;margin-top:4px;">${cto.description}</div>`;
        tooltipHtml += `</div>`;

        const marker = L.marker([cto.lat, cto.lon], { icon });
        marker.bindTooltip(tooltipHtml, { className: "flowmap-tooltip", direction: "top", offset: [0, -14] });

        marker.on("click", (e) => {
          if (e.originalEvent) {
            e.originalEvent.stopPropagation();
            e.originalEvent.preventDefault();
          }
          onCTOClick?.(cto.id);
          window.dispatchEvent(new CustomEvent("field-cto-tap", { detail: cto.id }));
        });

        marker.addTo(ctoLayer);
      });
    }

    renderFTTH();
    map.on("zoomend", renderFTTH);
    return () => { map.off("zoomend", renderFTTH); };
  }, [ctos, cables, reservas, ctoTelemetry, onCTOClick]);

  return (
    <div ref={containerRef} className={`w-full h-full ${className ?? ""}`} style={{ background: "#0a0b10" }} />
  );
}
