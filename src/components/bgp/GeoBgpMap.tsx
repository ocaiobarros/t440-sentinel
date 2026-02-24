import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Globe, MapPin } from "lucide-react";

/* ─── ASN Geo Coordinates (approximate HQ locations) ── */
const ASN_GEO: Record<number, { lat: number; lon: number; city: string }> = {
  15169: { lat: 37.42, lon: -122.08, city: "Mountain View, CA" },
  2906: { lat: 37.27, lon: -121.96, city: "San Jose, CA" },
  32934: { lat: 37.48, lon: -122.15, city: "Menlo Park, CA" },
  20940: { lat: 42.36, lon: -71.06, city: "Cambridge, MA" },
  13335: { lat: 37.78, lon: -122.39, city: "San Francisco, CA" },
  16509: { lat: 47.62, lon: -122.34, city: "Seattle, WA" },
  8075: { lat: 47.64, lon: -122.13, city: "Redmond, WA" },
  714: { lat: 37.33, lon: -122.03, city: "Cupertino, CA" },
  26162: { lat: -23.55, lon: -46.63, city: "São Paulo, BR" },
  4230: { lat: -22.91, lon: -43.17, city: "Rio de Janeiro, BR" },
  26599: { lat: -23.56, lon: -46.66, city: "São Paulo, BR" },
  28573: { lat: -22.90, lon: -43.21, city: "Rio de Janeiro, BR" },
  3356: { lat: 38.90, lon: -77.04, city: "Washington, DC" },
  53013: { lat: -3.72, lon: -38.52, city: "Fortaleza, BR" },
};

/* ─── Types ── */
interface GeoPeer {
  asn: number;
  name: string;
  state: string;
  lat: number;
  lon: number;
  city: string;
  bw_in_mbps?: number;
}

export default function GeoBgpMap({ peers, coreLocation }: {
  peers: Array<{
    asn: number; ip: string; state: string;
    bw_in_mbps?: number;
    info?: { name: string; country: string; type: string } | null;
  }>;
  coreLocation?: { lat: number; lon: number; name: string };
}) {
  const { t } = useTranslation();
  const core = coreLocation || { lat: -20.46, lon: -54.62, name: "Core ISP" };

  const geoPeers: GeoPeer[] = useMemo(() =>
    peers
      .map(p => {
        const geo = ASN_GEO[p.asn];
        if (!geo) return null;
        return {
          asn: p.asn,
          name: p.info?.name || `AS${p.asn}`,
          state: p.state,
          lat: geo.lat,
          lon: geo.lon,
          city: geo.city,
          bw_in_mbps: p.bw_in_mbps,
        };
      })
      .filter(Boolean) as GeoPeer[],
    [peers]
  );

  // Map projection (Mercator-ish, bounded)
  const mapBounds = { minLat: -60, maxLat: 70, minLon: -170, maxLon: -10 };

  function project(lat: number, lon: number): { x: number; y: number } {
    const x = ((lon - mapBounds.minLon) / (mapBounds.maxLon - mapBounds.minLon)) * 900;
    const y = ((mapBounds.maxLat - lat) / (mapBounds.maxLat - mapBounds.minLat)) * 500;
    return { x, y };
  }

  const corePos = project(core.lat, core.lon);

  if (geoPeers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground/40">
        <Globe className="w-10 h-10" />
        <p className="text-xs font-mono">{t("geoBgp.noGeoData")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono font-semibold text-foreground flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          {t("geoBgp.title")}
        </h3>
        <div className="flex items-center gap-3 text-[9px] font-mono text-muted-foreground/40">
          <span className="flex items-center gap-1">
            <div className="w-2 h-0.5 bg-[hsl(var(--neon-green))]" />
            {t("geoBgp.established")}
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-0.5 bg-[hsl(var(--neon-red))]" />
            {t("geoBgp.down")}
          </span>
        </div>
      </div>

      <div
        className="rounded-xl border border-border/30 overflow-hidden relative"
        style={{
          background: "linear-gradient(180deg, hsl(220 35% 6%) 0%, hsl(225 30% 4%) 100%)",
        }}
      >
        <svg viewBox="0 0 900 500" className="w-full h-auto" style={{ minHeight: 300 }}>
          {/* Grid lines */}
          {Array.from({ length: 9 }, (_, i) => (
            <line key={`vg${i}`} x1={i * 100 + 50} y1={0} x2={i * 100 + 50} y2={500}
              stroke="hsl(220 30% 15%)" strokeWidth={0.5} opacity={0.3} />
          ))}
          {Array.from({ length: 5 }, (_, i) => (
            <line key={`hg${i}`} x1={0} y1={i * 100 + 50} x2={900} y2={i * 100 + 50}
              stroke="hsl(220 30% 15%)" strokeWidth={0.5} opacity={0.3} />
          ))}

          {/* Arcs from peers to core */}
          {geoPeers.map((peer, i) => {
            const pos = project(peer.lat, peer.lon);
            const isUp = peer.state?.toLowerCase() === "established";
            const strokeColor = isUp ? "hsl(142 70% 50%)" : "hsl(0 80% 55%)";
            const bwScale = Math.min(3, Math.max(0.8, (peer.bw_in_mbps || 100) / 3000));

            // Cubic bezier control point (arc effect)
            const midX = (pos.x + corePos.x) / 2;
            const midY = Math.min(pos.y, corePos.y) - 60 - Math.abs(pos.x - corePos.x) * 0.15;

            return (
              <motion.path
                key={peer.asn}
                d={`M ${pos.x} ${pos.y} Q ${midX} ${midY} ${corePos.x} ${corePos.y}`}
                fill="none"
                stroke={strokeColor}
                strokeWidth={bwScale}
                strokeOpacity={isUp ? 0.6 : 0.3}
                strokeDasharray={isUp ? "none" : "4 3"}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.2, delay: i * 0.08 }}
              />
            );
          })}

          {/* Peer nodes */}
          {geoPeers.map((peer) => {
            const pos = project(peer.lat, peer.lon);
            const isUp = peer.state?.toLowerCase() === "established";
            const fillColor = isUp ? "hsl(142 70% 50%)" : "hsl(0 80% 55%)";

            return (
              <g key={`node-${peer.asn}`}>
                {/* Glow */}
                <circle cx={pos.x} cy={pos.y} r={8} fill={fillColor} opacity={0.15} />
                {/* Dot */}
                <circle cx={pos.x} cy={pos.y} r={4} fill={fillColor} stroke="hsl(220 30% 4%)" strokeWidth={1.5} />
                {/* Label */}
                <text
                  x={pos.x + 7} y={pos.y - 6}
                  className="text-[8px] font-mono"
                  fill="hsl(0 0% 70%)" opacity={0.8}
                >
                  {peer.name}
                </text>
                <text
                  x={pos.x + 7} y={pos.y + 3}
                  className="text-[7px] font-mono"
                  fill="hsl(0 0% 50%)" opacity={0.6}
                >
                  {peer.city}
                </text>
              </g>
            );
          })}

          {/* Core node (ISP) */}
          <g>
            <circle cx={corePos.x} cy={corePos.y} r={14} fill="hsl(186 100% 50%)" opacity={0.1} />
            <circle cx={corePos.x} cy={corePos.y} r={8} fill="hsl(186 100% 50%)" opacity={0.25} />
            <circle cx={corePos.x} cy={corePos.y} r={5} fill="hsl(186 100% 50%)" stroke="hsl(220 30% 4%)" strokeWidth={2} />
            <text
              x={corePos.x + 10} y={corePos.y - 4}
              className="text-[9px] font-mono font-bold"
              fill="hsl(186 100% 60%)"
            >
              {core.name}
            </text>
            <text
              x={corePos.x + 10} y={corePos.y + 6}
              className="text-[7px] font-mono"
              fill="hsl(0 0% 50%)"
            >
              CORE
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
}
