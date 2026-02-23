/**
 * KML Import/Export utilities for FTTH network projects.
 * Parses Google Earth KML files and maps them to FlowPulse DB entities.
 */

/* ───── Types ───── */
export interface KmlPoint {
  name: string;
  description: string;
  lat: number;
  lon: number;
  type: "host" | "cto";
  /** Raw style or folder hint used to classify */
  hint: string;
}

export interface KmlLine {
  name: string;
  description: string;
  coordinates: [number, number][]; // [lon, lat]
  hint: string;
}

export interface KmlParseResult {
  points: KmlPoint[];
  lines: KmlLine[];
  errors: string[];
}

/* ───── CTO keyword detection ───── */
const CTO_KEYWORDS = /\b(cto|caixa|splitter|nap|terminal|cx|atendimento)\b/i;

function classifyPoint(name: string, description: string, folderName: string): "host" | "cto" {
  const combined = `${name} ${description} ${folderName}`;
  return CTO_KEYWORDS.test(combined) ? "cto" : "host";
}

/* ───── Parser ───── */
export function parseKml(kmlText: string): KmlParseResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlText, "application/xml");

  const errors: string[] = [];
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    return { points: [], lines: [], errors: ["Arquivo KML inválido: " + parseError.textContent?.slice(0, 200)] };
  }

  const points: KmlPoint[] = [];
  const lines: KmlLine[] = [];

  const placemarks = doc.querySelectorAll("Placemark");

  placemarks.forEach((pm, idx) => {
    const name = pm.querySelector("name")?.textContent?.trim() || `Item_${idx + 1}`;
    const description = pm.querySelector("description")?.textContent?.trim() || "";

    // Get parent Folder name as hint
    let folderName = "";
    let parent = pm.parentElement;
    while (parent) {
      if (parent.tagName === "Folder" || parent.tagName === "Document") {
        const fn = parent.querySelector(":scope > name")?.textContent?.trim();
        if (fn) { folderName = fn; break; }
      }
      parent = parent.parentElement;
    }

    // Check for Point geometry
    const point = pm.querySelector("Point");
    if (point) {
      const coordsText = point.querySelector("coordinates")?.textContent?.trim();
      if (coordsText) {
        const parts = coordsText.split(",").map(Number);
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          const type = classifyPoint(name, description, folderName);
          points.push({ name, description, lat: parts[1], lon: parts[0], type, hint: folderName });
        } else {
          errors.push(`Coordenadas inválidas no ponto "${name}"`);
        }
      }
      return;
    }

    // Check for LineString geometry
    const lineString = pm.querySelector("LineString");
    if (lineString) {
      const coordsText = lineString.querySelector("coordinates")?.textContent?.trim();
      if (coordsText) {
        const coordinates: [number, number][] = [];
        coordsText.split(/\s+/).forEach(seg => {
          const parts = seg.split(",").map(Number);
          if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            coordinates.push([parts[0], parts[1]]);
          }
        });
        if (coordinates.length >= 2) {
          lines.push({ name, description, coordinates, hint: folderName });
        } else {
          errors.push(`Linha "${name}" precisa de pelo menos 2 coordenadas`);
        }
      }
      return;
    }

    // MultiGeometry — extract first useful geometry
    const multi = pm.querySelector("MultiGeometry");
    if (multi) {
      const innerPoint = multi.querySelector("Point");
      if (innerPoint) {
        const coordsText = innerPoint.querySelector("coordinates")?.textContent?.trim();
        if (coordsText) {
          const parts = coordsText.split(",").map(Number);
          if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            const type = classifyPoint(name, description, folderName);
            points.push({ name, description, lat: parts[1], lon: parts[0], type, hint: folderName });
          }
        }
      }
      const innerLine = multi.querySelector("LineString");
      if (innerLine) {
        const coordsText = innerLine.querySelector("coordinates")?.textContent?.trim();
        if (coordsText) {
          const coordinates: [number, number][] = [];
          coordsText.split(/\s+/).forEach(seg => {
            const parts = seg.split(",").map(Number);
            if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              coordinates.push([parts[0], parts[1]]);
            }
          });
          if (coordinates.length >= 2) {
            lines.push({ name, description, coordinates, hint: folderName });
          }
        }
      }
    }
  });

  return { points, lines, errors };
}

/* ───── Haversine distance (meters) ───── */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ───── GeoJSON geometry builder ───── */
export function toGeoJsonLineString(coords: [number, number][]): object {
  return {
    type: "LineString",
    coordinates: coords,
  };
}

/* ───── KML Exporter ───── */
interface ExportHost { host_name: string; lat: number; lon: number; current_status: string; icon_type: string; }
interface ExportCTO { name: string; lat: number; lon: number; status_calculated: string; capacity: string; occupied_ports: number; }
interface ExportCable { label: string; geometry: any; cable_type: string; fiber_count: number; }

export function generateKml(
  hosts: ExportHost[],
  ctos: ExportCTO[],
  cables: ExportCable[],
  mapName: string,
): string {
  const statusColor = (s: string) => {
    switch (s) {
      case "UP": case "OK": return "ff00ff00"; // green
      case "DOWN": case "CRITICAL": return "ff0000ff"; // red (AABBGGRR)
      case "DEGRADED": return "ff00aaff"; // amber
      default: return "ffaaaaaa";
    }
  };

  const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>${escapeXml(mapName)}</name>
<description>Exportado pelo FlowPulse</description>
`;

  // Styles
  ["ff00ff00", "ff0000ff", "ff00aaff", "ffaaaaaa"].forEach(c => {
    kml += `<Style id="s_${c}"><IconStyle><color>${c}</color><scale>1.0</scale></IconStyle><LineStyle><color>${c}</color><width>2</width></LineStyle></Style>\n`;
  });

  // Hosts folder
  if (hosts.length) {
    kml += `<Folder><name>Hosts</name>\n`;
    hosts.forEach(h => {
      const c = statusColor(h.current_status);
      kml += `<Placemark><name>${escapeXml(h.host_name)}</name><description>Tipo: ${escapeXml(h.icon_type)}\nStatus: ${h.current_status}</description><styleUrl>#s_${c}</styleUrl><Point><coordinates>${h.lon},${h.lat},0</coordinates></Point></Placemark>\n`;
    });
    kml += `</Folder>\n`;
  }

  // CTOs folder
  if (ctos.length) {
    kml += `<Folder><name>CTOs</name>\n`;
    ctos.forEach(ct => {
      const c = statusColor(ct.status_calculated);
      kml += `<Placemark><name>${escapeXml(ct.name || "CTO")}</name><description>Capacidade: ${ct.capacity}\nOcupadas: ${ct.occupied_ports}\nStatus: ${ct.status_calculated}</description><styleUrl>#s_${c}</styleUrl><Point><coordinates>${ct.lon},${ct.lat},0</coordinates></Point></Placemark>\n`;
    });
    kml += `</Folder>\n`;
  }

  // Cables folder
  if (cables.length) {
    kml += `<Folder><name>Cabos</name>\n`;
    cables.forEach(cb => {
      const coords = cb.geometry?.coordinates;
      if (!coords?.length) return;
      const coordStr = coords.map((c: number[]) => `${c[0]},${c[1]},0`).join(" ");
      kml += `<Placemark><name>${escapeXml(cb.label || "Cabo")}</name><description>Tipo: ${cb.cable_type}\nFibras: ${cb.fiber_count}</description><LineString><coordinates>${coordStr}</coordinates></LineString></Placemark>\n`;
    });
    kml += `</Folder>\n`;
  }

  kml += `</Document></kml>`;
  return kml;
}

export function downloadKml(kmlContent: string, filename: string) {
  const blob = new Blob([kmlContent], { type: "application/vnd.google-earth.kml+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".kml") ? filename : `${filename}.kml`;
  a.click();
  URL.revokeObjectURL(url);
}
