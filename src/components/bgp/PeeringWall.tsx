import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Wifi, WifiOff, Filter, Bell, Clock, TrendingUp,
  AlertTriangle, Globe,
} from "lucide-react";
import { Icon } from "@iconify/react";
import { toast } from "sonner";

/* ─── ASN Logo Map ── */
const ASN_LOGOS: Record<number, { icon: string; color: string }> = {
  15169: { icon: "simple-icons:google", color: "#4285f4" },
  2906: { icon: "simple-icons:netflix", color: "#e50914" },
  32934: { icon: "simple-icons:meta", color: "#0082fb" },
  20940: { icon: "simple-icons:akamai", color: "#0096d6" },
  13335: { icon: "simple-icons:cloudflare", color: "#f48120" },
  16509: { icon: "simple-icons:amazonaws", color: "#ff9900" },
  8075: { icon: "simple-icons:microsoft", color: "#00a4ef" },
  714: { icon: "simple-icons:apple", color: "#a2aaad" },
  26162: { icon: "mdi:swap-horizontal-bold", color: "#00e676" },
  4230: { icon: "mdi:transit-connection-variant", color: "#00bcd4" },
  26599: { icon: "mdi:phone-classic", color: "#7c4dff" },
  28573: { icon: "mdi:antenna", color: "#ff5252" },
  3356: { icon: "mdi:earth", color: "#ff6d00" },
  53013: { icon: "mdi:access-point-network", color: "#69f0ae" },
};

function countryFlag(code: string): string {
  if (!code || code === "??" || code.length !== 2) return "🌐";
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

/* ─── Types ── */
export interface BgpPeer {
  asn: number;
  ip: string;
  state: string;
  prefixes_received?: number;
  prefixes_sent?: number;
  uptime?: string;
  bw_in_mbps?: number;
  bw_out_mbps?: number;
  info?: { name: string; country: string; type: string } | null;
}

/* ─── Status helpers ── */
function getStatusMeta(state: string) {
  const s = state?.toLowerCase();
  if (s === "established") return { label: "ESTABLISHED", color: "hsl(var(--neon-green))", bg: "hsl(var(--neon-green) / 0.1)", borderColor: "hsl(var(--neon-green) / 0.3)", pulse: true };
  if (s === "idle") return { label: "IDLE", color: "hsl(var(--neon-red))", bg: "hsl(var(--neon-red) / 0.1)", borderColor: "hsl(var(--neon-red) / 0.3)", pulse: false };
  if (s === "connect" || s === "active") return { label: state.toUpperCase(), color: "hsl(var(--neon-amber))", bg: "hsl(var(--neon-amber) / 0.1)", borderColor: "hsl(var(--neon-amber) / 0.3)", pulse: false };
  return { label: state?.toUpperCase() || "UNKNOWN", color: "hsl(var(--muted-foreground))", bg: "hsl(var(--muted) / 0.2)", borderColor: "hsl(var(--border))", pulse: false };
}

export default function PeeringWall({ peers }: { peers: BgpPeer[] }) {
  const { t } = useTranslation();
  const [showOnlyDown, setShowOnlyDown] = useState(false);

  const TRAFFIC_LABELS: Record<string, string> = {
    transit: t("peeringWall.transitIp"),
    ix: t("peeringWall.ixPeering"),
    cdn: t("peeringWall.cdn"),
    enterprise: t("peeringWall.enterprise"),
    unknown: t("peeringWall.other"),
  };

  const filtered = useMemo(() => {
    if (!showOnlyDown) return peers;
    return peers.filter(p => p.state?.toLowerCase() !== "established");
  }, [peers, showOnlyDown]);

  const downCount = useMemo(() =>
    peers.filter(p => p.state?.toLowerCase() !== "established").length,
    [peers]
  );

  if (peers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground/40">
        <Globe className="w-12 h-12" />
        <p className="text-xs font-mono">{t("peeringWall.waitingData")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-muted-foreground">
            {peers.length} {t("peeringWall.sessions")} • {peers.length - downCount} {t("peeringWall.active")}
          </span>
          {downCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-[hsl(var(--neon-red))]">
              <AlertTriangle className="w-3 h-3" /> {downCount} DOWN
            </span>
          )}
        </div>
        <button
          onClick={() => setShowOnlyDown(p => !p)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono border transition-all ${
            showOnlyDown
              ? "border-[hsl(var(--neon-red)/0.4)] bg-[hsl(var(--neon-red)/0.1)] text-[hsl(var(--neon-red))]"
              : "border-border text-muted-foreground hover:border-border/80"
          }`}
        >
          <Filter className="w-3 h-3" />
          {showOnlyDown ? t("peeringWall.showingDown") : t("peeringWall.filterDown")}
        </button>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {filtered.map((peer, i) => {
          const status = getStatusMeta(peer.state);
          const logo = ASN_LOGOS[peer.asn];
          const isUp = peer.state?.toLowerCase() === "established";

          return (
            <motion.div
              key={`${peer.asn}-${peer.ip}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="relative rounded-xl border overflow-hidden group"
              style={{
                background: "linear-gradient(145deg, hsl(220 40% 8% / 0.95) 0%, hsl(225 35% 5% / 0.9) 100%)",
                borderColor: status.borderColor,
              }}
            >
              {/* Status glow line */}
              <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: status.color }} />

              <div className="p-4 space-y-3">
                {/* Header: Logo + Name + Status LED */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {/* Logo */}
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: logo ? `${logo.color}15` : "hsl(var(--muted) / 0.2)" }}
                    >
                      {logo ? (
                        <Icon icon={logo.icon} className="w-5 h-5" style={{ color: logo.color }} />
                      ) : (
                        <Globe className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-sm text-foreground truncate">
                          {peer.info?.name || `AS${peer.asn}`}
                        </span>
                        {peer.info?.country && (
                          <span className="text-sm">{countryFlag(peer.info.country)}</span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground/60">
                        AS{peer.asn} • {peer.ip}
                      </span>
                    </div>
                  </div>

                  {/* Status LED */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="relative">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ background: status.color }}
                      />
                      {status.pulse && (
                        <div
                          className="absolute inset-0 w-2.5 h-2.5 rounded-full animate-ping"
                          style={{ background: status.color, opacity: 0.4 }}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Status badge + Type */}
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold"
                    style={{ background: status.bg, color: status.color }}
                  >
                    {isUp ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                    {status.label}
                  </span>
                  <span className="text-[9px] font-mono text-muted-foreground/50">
                    {TRAFFIC_LABELS[peer.info?.type || "unknown"]}
                  </span>
                </div>

                {/* Metrics grid */}
                <div className="grid grid-cols-3 gap-2">
                  <MetricCell icon={Clock} label={t("peeringWall.uptime")} value={peer.uptime || "—"} />
                  <MetricCell icon={TrendingUp} label={t("peeringWall.prefixesRx")} value={peer.prefixes_received?.toLocaleString() || "0"} />
                  <MetricCell
                    label={t("peeringWall.bwIn")}
                    value={peer.bw_in_mbps
                      ? peer.bw_in_mbps >= 1000
                        ? `${(peer.bw_in_mbps / 1000).toFixed(1)}G`
                        : `${peer.bw_in_mbps}M`
                      : "—"
                    }
                  />
                </div>

                {/* Telegram button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toast.info(`${t("peeringWall.notifyTelegram")} AS${peer.asn} — ${peer.info?.name || "Peer"}`);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg
                    border border-border/50 text-[9px] font-mono text-muted-foreground/50
                    hover:border-[hsl(var(--neon-cyan)/0.3)] hover:text-[hsl(var(--neon-cyan))]
                    hover:bg-[hsl(var(--neon-cyan)/0.05)] transition-all opacity-0 group-hover:opacity-100"
                >
                  <Bell className="w-3 h-3" />
                  {t("peeringWall.notifyTelegram")}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function MetricCell({ icon: Ic, label, value }: { icon?: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/10 border border-border/30 px-2 py-1.5 text-center">
      <div className="text-[8px] font-mono text-muted-foreground/40 uppercase flex items-center justify-center gap-0.5">
        {Ic && <Ic className="w-2.5 h-2.5" />}
        {label}
      </div>
      <div className="text-[11px] font-mono font-bold text-foreground">{value}</div>
    </div>
  );
}
