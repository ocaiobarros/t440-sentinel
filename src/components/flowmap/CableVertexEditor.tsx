/**
 * CableVertexEditor — Interactive vertex editing for fiber cables on Leaflet.
 *
 * Features:
 * - White circle handlers on each vertex (draggable)
 * - Ghost midpoints between vertices (drag to create new vertex)
 * - Debounced persistence to DB (geometry JSONB)
 * - Real-time distance label (meters) during editing
 * - Optional snap-to-street via OSRM
 * - Canvas-based cable rendering for performance
 */

import { useEffect, useRef, useCallback, useState } from "react";
import L from "leaflet";
import type { FlowMapCable } from "@/hooks/useFlowMaps";
import { supabase } from "@/integrations/supabase/client";

/* ── Style injection ── */
const STYLE_ID = "cable-vertex-editor-style";
function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    .cve-vertex{width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid #00e5ff;cursor:grab;box-shadow:0 0 6px #00e5ff80;transition:transform 0.1s;}
    .cve-vertex:hover{transform:scale(1.3);background:#00e5ff;}
    .cve-vertex:active{cursor:grabbing;}
    .cve-ghost{width:10px;height:10px;border-radius:50%;background:rgba(0,229,255,0.3);border:1.5px dashed #00e5ff80;cursor:pointer;transition:all 0.15s;}
    .cve-ghost:hover{background:#00e5ff;opacity:1;transform:scale(1.2);}
    .cve-distance-label{background:#0d0e1a!important;border:1px solid #00e5ff50!important;border-radius:6px!important;padding:3px 8px!important;font-family:'JetBrains Mono',monospace!important;font-size:10px!important;color:#00e5ff!important;box-shadow:0 2px 10px rgba(0,0,0,0.5)!important;pointer-events:none;}
  `;
  document.head.appendChild(s);
}

/* ── Haversine distance (meters) ── */
function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function totalDistance(coords: [number, number][]): number {
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += haversineM(coords[i - 1], coords[i]);
  return d;
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

interface Props {
  map: L.Map;
  cable: FlowMapCable;
  mapId: string;
  onUpdate: (cableId: string, geometry: { type: string; coordinates: [number, number][] }) => void;
  snapToStreet?: boolean;
  onClose: () => void;
}

export default function CableVertexEditor({ map, cable, mapId, onUpdate, snapToStreet = false, onClose }: Props) {
  const layerRef = useRef<L.LayerGroup | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);
  const glowRef = useRef<L.Polyline | null>(null);
  const labelRef = useRef<L.Marker | null>(null);
  const coordsRef = useRef<[number, number][]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [distance, setDistance] = useState(0);

  // Snap a single coordinate to nearest road via OSRM nearest endpoint
  const snapCoord = useCallback(async (lon: number, lat: number): Promise<[number, number]> => {
    if (!snapToStreet) return [lon, lat];
    try {
      const resp = await fetch(`https://router.project-osrm.org/nearest/v1/driving/${lon},${lat}`);
      const data = await resp.json();
      if (data?.waypoints?.[0]?.location) {
        return data.waypoints[0].location as [number, number];
      }
    } catch { /* fallback */ }
    return [lon, lat];
  }, [snapToStreet]);

  // Persist geometry (debounced 500ms)
  const persistGeometry = useCallback((coords: [number, number][]) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const geometry = { type: "LineString", coordinates: coords };
      onUpdate(cable.id, geometry);
    }, 500);
  }, [cable.id, onUpdate]);

  // Rebuild visual layer
  const rebuild = useCallback(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();

    const coords = coordsRef.current;
    if (coords.length < 2) return;

    const latLngs = coords.map(([lon, lat]) => [lat, lon] as [number, number]);

    // Glow underlay
    const glow = L.polyline(latLngs, { color: "#00e5ff", weight: 8, opacity: 0.15 });
    glow.addTo(layer);
    glowRef.current = glow;

    // Main line
    const line = L.polyline(latLngs, {
      color: "#00e5ff",
      weight: 3,
      opacity: 0.9,
      dashArray: "6, 10",
    });
    line.addTo(layer);
    lineRef.current = line;

    // Double-click on line to add vertex
    line.on("dblclick", async (e: L.LeafletMouseEvent) => {
      L.DomEvent.stop(e);
      const clickLatLng = e.latlng;
      // Find nearest segment
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < latLngs.length - 1; i++) {
        const segDist = L.LineUtil.pointToSegmentDistance(
          map.latLngToLayerPoint(clickLatLng),
          map.latLngToLayerPoint(L.latLng(latLngs[i])),
          map.latLngToLayerPoint(L.latLng(latLngs[i + 1])),
        );
        if (segDist < bestDist) {
          bestDist = segDist;
          bestIdx = i + 1;
        }
      }
      let newCoord: [number, number] = [clickLatLng.lng, clickLatLng.lat];
      if (snapToStreet) {
        newCoord = await snapCoord(clickLatLng.lng, clickLatLng.lat);
      }
      coordsRef.current.splice(bestIdx, 0, newCoord);
      rebuild();
      persistGeometry(coordsRef.current);
    });

    // Vertex handlers (white circles)
    coords.forEach((coord, idx) => {
      const icon = L.divIcon({ className: "cve-vertex", iconSize: [12, 12], iconAnchor: [6, 6] });
      const marker = L.marker([coord[1], coord[0]], { icon, draggable: true, zIndexOffset: 1000 });

      marker.on("drag", (e: any) => {
        const pos = e.target.getLatLng();
        coordsRef.current[idx] = [pos.lng, pos.lat];
        // Update line in real-time
        const newLatLngs = coordsRef.current.map(([lo, la]) => [la, lo] as [number, number]);
        lineRef.current?.setLatLngs(newLatLngs);
        glowRef.current?.setLatLngs(newLatLngs);
        // Update distance
        const d = totalDistance(coordsRef.current);
        setDistance(d);
        updateDistanceLabel(d, newLatLngs);
      });

      marker.on("dragend", async (e: any) => {
        const pos = e.target.getLatLng();
        let finalCoord: [number, number] = [pos.lng, pos.lat];
        if (snapToStreet) {
          finalCoord = await snapCoord(pos.lng, pos.lat);
          coordsRef.current[idx] = finalCoord;
          marker.setLatLng(L.latLng(finalCoord[1], finalCoord[0]));
          const newLatLngs = coordsRef.current.map(([lo, la]) => [la, lo] as [number, number]);
          lineRef.current?.setLatLngs(newLatLngs);
          glowRef.current?.setLatLngs(newLatLngs);
        }
        persistGeometry(coordsRef.current);
      });

      // Right-click to delete vertex (min 2)
      marker.on("contextmenu", (e: any) => {
        L.DomEvent.stop(e);
        if (coordsRef.current.length <= 2) return;
        coordsRef.current.splice(idx, 1);
        rebuild();
        persistGeometry(coordsRef.current);
      });

      marker.addTo(layer);
    });

    // Ghost midpoints
    for (let i = 0; i < coords.length - 1; i++) {
      const midLon = (coords[i][0] + coords[i + 1][0]) / 2;
      const midLat = (coords[i][1] + coords[i + 1][1]) / 2;
      const ghostIcon = L.divIcon({ className: "cve-ghost", iconSize: [10, 10], iconAnchor: [5, 5] });
      const ghost = L.marker([midLat, midLon], { icon: ghostIcon, draggable: true, zIndexOffset: 900 });

      const segIdx = i + 1;
      ghost.on("dragstart", () => {
        // Insert ghost as real vertex
        coordsRef.current.splice(segIdx, 0, [midLon, midLat]);
      });

      ghost.on("drag", (e: any) => {
        const pos = e.target.getLatLng();
        coordsRef.current[segIdx] = [pos.lng, pos.lat];
        const newLatLngs = coordsRef.current.map(([lo, la]) => [la, lo] as [number, number]);
        lineRef.current?.setLatLngs(newLatLngs);
        glowRef.current?.setLatLngs(newLatLngs);
        const d = totalDistance(coordsRef.current);
        setDistance(d);
        updateDistanceLabel(d, newLatLngs);
      });

      ghost.on("dragend", async (e: any) => {
        const pos = e.target.getLatLng();
        if (snapToStreet) {
          const snapped = await snapCoord(pos.lng, pos.lat);
          coordsRef.current[segIdx] = snapped;
        }
        rebuild();
        persistGeometry(coordsRef.current);
      });

      ghost.addTo(layer);
    }

    // Distance label at midpoint
    const d = totalDistance(coords);
    setDistance(d);
    updateDistanceLabel(d, latLngs);
  }, [map, snapToStreet, snapCoord, persistGeometry]);

  const updateDistanceLabel = useCallback((meters: number, latLngs: [number, number][]) => {
    const midIdx = Math.floor(latLngs.length / 2);
    const midPt = latLngs[midIdx] || latLngs[0];
    if (labelRef.current) {
      labelRef.current.setLatLng(L.latLng(midPt));
      const el = labelRef.current.getElement();
      if (el) el.innerHTML = `📏 ${formatDistance(meters)}`;
    }
  }, []);

  // Initialize
  useEffect(() => {
    ensureStyles();
    const layer = L.layerGroup().addTo(map);
    layerRef.current = layer;

    // Parse initial coordinates
    const coords: [number, number][] = cable.geometry?.coordinates?.length >= 2
      ? [...cable.geometry.coordinates]
      : [];
    coordsRef.current = coords;

    // Distance label
    if (coords.length >= 2) {
      const latLngs = coords.map(([lon, lat]) => [lat, lon] as [number, number]);
      const midIdx = Math.floor(latLngs.length / 2);
      const midPt = latLngs[midIdx] || latLngs[0];
      const label = L.marker(L.latLng(midPt), {
        icon: L.divIcon({
          className: "cve-distance-label",
          html: `📏 ${formatDistance(totalDistance(coords))}`,
          iconSize: [120, 24],
          iconAnchor: [60, 12],
        }),
        interactive: false,
        zIndexOffset: 2000,
      });
      label.addTo(layer);
      labelRef.current = label;
    }

    // Disable map double-click zoom while editing
    map.doubleClickZoom.disable();

    rebuild();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      layer.remove();
      layerRef.current = null;
      lineRef.current = null;
      glowRef.current = null;
      labelRef.current = null;
      map.doubleClickZoom.enable();
    };
  }, [map, cable.id]);

  // Re-run rebuild when snapToStreet changes
  useEffect(() => {
    rebuild();
  }, [snapToStreet, rebuild]);

  return null; // Pure side-effect component
}
