import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Activity, AlertTriangle } from "lucide-react";

/* ─── Types ── */
interface FlapEvent {
  time: number;
  type: "reset" | "flap";
}

export interface PeerFlapData {
  asn: number;
  name: string;
  flaps: FlapEvent[];
}

export function generateMockFlaps(peers: Array<{ asn: number; state: string; info?: { name: string } | null }>): PeerFlapData[] {
  const now = Date.now();
  const h24 = 24 * 60 * 60 * 1000;
  return peers.map(p => {
    const isDown = p.state?.toLowerCase() !== "established";
    const flapCount = isDown ? Math.floor(3 + Math.random() * 8) : Math.floor(Math.random() * 3);
    const flaps: FlapEvent[] = [];
    for (let i = 0; i < flapCount; i++) {
      flaps.push({ time: now - Math.random() * h24, type: Math.random() > 0.3 ? "flap" : "reset" });
    }
    flaps.sort((a, b) => a.time - b.time);
    return { asn: p.asn, name: p.info?.name || `AS${p.asn}`, flaps };
  }).sort((a, b) => b.flaps.length - a.flaps.length);
}

export default function FlapHistory({ data }: { data: PeerFlapData[] }) {
  const { t } = useTranslation();
  const now = useMemo(() => Date.now(), []);
  const h24 = 24 * 60 * 60 * 1000;
  const startTime = now - h24;

  const hours = useMemo(() => {
    const arr = [];
    for (let i = 0; i <= 24; i += 4) {
      arr.push({ offset: (i / 24) * 100, label: `${24 - i}h` });
    }
    return arr;
  }, []);

  const totalFlaps = useMemo(() => data.reduce((s, d) => s + d.flaps.length, 0), [data]);

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground/40">
        <Activity className="w-10 h-10" />
        <p className="text-xs font-mono">{t("flapHistory.noData")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono font-semibold text-foreground flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          {t("flapHistory.title")}
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-muted-foreground/60">
            {t("flapHistory.total")}: <span className={`font-bold ${totalFlaps > 10 ? "text-[hsl(var(--neon-red))]" : totalFlaps > 3 ? "text-[hsl(var(--neon-amber))]" : "text-[hsl(var(--neon-green))]"}`}>
              {totalFlaps} {t("flapHistory.flapsDay")}
            </span>
          </span>
          <div className="flex items-center gap-2 text-[9px] font-mono text-muted-foreground/40">
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[hsl(var(--neon-red))]" /> {t("flapHistory.reset")}</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[hsl(var(--neon-amber))]" /> {t("flapHistory.flap")}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/30 overflow-hidden" style={{ background: "linear-gradient(145deg, hsl(220 40% 8% / 0.95) 0%, hsl(225 35% 5% / 0.9) 100%)" }}>
        <div className="relative h-6 border-b border-border/20 px-32">
          {hours.map(h => (
            <span key={h.label} className="absolute text-[8px] font-mono text-muted-foreground/30 -translate-x-1/2" style={{ left: `${h.offset}%`, top: "4px" }}>{h.label}</span>
          ))}
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {data.map((peer, i) => {
            const hasHighFlaps = peer.flaps.length >= 5;
            return (
              <motion.div key={peer.asn} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }} className={`flex items-center border-b border-border/10 hover:bg-muted/5 transition-colors ${hasHighFlaps ? "bg-[hsl(var(--neon-red)/0.03)]" : ""}`}>
                <div className="w-32 px-3 py-2.5 shrink-0 flex items-center gap-2">
                  <span className="text-[10px] font-mono text-foreground truncate font-medium">{peer.name}</span>
                  {hasHighFlaps && (<AlertTriangle className="w-3 h-3 text-[hsl(var(--neon-red))] shrink-0" />)}
                </div>
                <div className="flex-1 relative h-8 mx-2">
                  <div className="absolute inset-y-1 inset-x-0 rounded bg-muted/5" />
                  {peer.flaps.map((flap, fi) => {
                    const offsetPct = Math.max(0, Math.min(100, ((flap.time - startTime) / h24) * 100));
                    const isReset = flap.type === "reset";
                    return (
                      <div key={fi} className="absolute top-1 bottom-1 w-[3px] rounded-full" style={{
                        left: `${offsetPct}%`,
                        background: isReset ? "hsl(var(--neon-red))" : "hsl(var(--neon-amber))",
                        boxShadow: isReset ? "0 0 6px hsl(var(--neon-red) / 0.5)" : "0 0 4px hsl(var(--neon-amber) / 0.4)",
                      }} title={`${isReset ? t("flapHistory.reset") : t("flapHistory.flap")} — ${new Date(flap.time).toLocaleTimeString()}`} />
                    );
                  })}
                </div>
                <div className="w-16 px-2 text-right shrink-0">
                  <span className={`text-[10px] font-mono font-bold ${peer.flaps.length >= 5 ? "text-[hsl(var(--neon-red))]" : peer.flaps.length >= 2 ? "text-[hsl(var(--neon-amber))]" : "text-[hsl(var(--neon-green))]"}`}>{peer.flaps.length}</span>
                  <span className="text-[8px] font-mono text-muted-foreground/30 ml-0.5">flaps</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
