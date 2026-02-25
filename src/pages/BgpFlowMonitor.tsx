import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Server, Terminal, CheckCircle, ChevronRight, ChevronLeft,
  Settings2, Network, Globe, ArrowDownToLine, ArrowUpFromLine,
  BarChart3, Filter, Activity, Eye, EyeOff, Lock, User,
  RefreshCw, Wifi, WifiOff, TrendingUp, TrendingDown, Minus,
  Zap, ArrowRight, Layers, ArrowLeft, Save,
} from "lucide-react";
import { Icon } from "@iconify/react";
import { supabase } from "@/integrations/supabase/client";
import { useDashboardPersist } from "@/hooks/useDashboardPersist";
import NetworkSummaryPanel, { type NetworkSummaryData } from "@/components/bgp/NetworkSummaryPanel";
import PeeringWall from "@/components/bgp/PeeringWall";
import FlapHistory, { generateMockFlaps } from "@/components/bgp/FlapHistory";
import GeoBgpMap from "@/components/bgp/GeoBgpMap";

/* ─── Config persistence ── */

const STORAGE_KEY = "flowpulse_bgp_config";

interface BgpConfig {
  vendor: "huawei" | "datacom";
  model: string;
  host: string;
  port: string;
  username: string;
  password: string;
}

function loadConfig(): BgpConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveConfig(config: BgpConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function clearConfig() {
  localStorage.removeItem(STORAGE_KEY);
}

/* ─── Hardware catalog ── */

interface HardwareModel {
  id: string;
  name: string;
  series: string;
  description: string;
  icon: string;
  vendor: "huawei" | "datacom";
}

const HARDWARE_CATALOG: HardwareModel[] = [
  // Huawei
  { id: "ne8000-m8", name: "NE8000-M8", series: "NE8000", description: "Core Router — Carrier-grade BGP com capacidade de 25.6 Tbps", icon: "simple-icons:huawei", vendor: "huawei" },
  { id: "ne8000-f1a", name: "NE8000-F1A", series: "NE8000", description: "Edge Router — Alta densidade de portas 100GE/400GE", icon: "simple-icons:huawei", vendor: "huawei" },
  { id: "ne40-m2kb", name: "NE40-M2KB", series: "NE40E", description: "Universal Router — MPLS/VPN e BGP full-table", icon: "simple-icons:huawei", vendor: "huawei" },
  { id: "s6750", name: "S6750-EI", series: "S6700", description: "Switch L3 — 10GE Aggregation com BGP Lite", icon: "simple-icons:huawei", vendor: "huawei" },
  { id: "s6730", name: "S6730-H", series: "S6700", description: "Switch L3 — Campus Core com EVPN-VXLAN", icon: "simple-icons:huawei", vendor: "huawei" },
  { id: "s5720", name: "S5720-HI", series: "S5700", description: "Switch L3 — Acesso avançado com stack virtual", icon: "simple-icons:huawei", vendor: "huawei" },
  // Datacom
  { id: "dm4770", name: "DM4770", series: "DM4000", description: "Core Router — BGP full-table, MPLS-TE e Segment Routing", icon: "mdi:router-network", vendor: "datacom" },
  { id: "dm4370", name: "DM4370", series: "DM4000", description: "Edge Router — ISP de médio porte com NetFlow nativo", icon: "mdi:router-network", vendor: "datacom" },
];

/* ─── Step Indicator ── */

function StepIndicator({ current, total }: { current: number; total: number }) {
  const labels = ["Hardware", "SSH", "✓"];
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1;
        const isActive = step === current;
        const isDone = step < current;
        return (
          <div key={step} className="flex items-center gap-2">
            <motion.div
              animate={{
                scale: isActive ? 1.15 : 1,
                boxShadow: isActive ? "0 0 20px rgba(0, 229, 255, 0.5)" : "none",
              }}
              className={`
                w-10 h-10 rounded-full flex items-center justify-center text-sm font-mono font-bold
                border-2 transition-all duration-300
                ${isDone ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : ""}
                ${isActive ? "bg-cyan-500/20 border-cyan-400 text-cyan-300" : ""}
                ${!isDone && !isActive ? "bg-muted/10 border-muted/30 text-muted-foreground/40" : ""}
              `}
            >
              {isDone ? <CheckCircle className="w-5 h-5" /> : step}
            </motion.div>
            <span className={`text-xs font-mono hidden sm:block ${isActive ? "text-cyan-300" : isDone ? "text-emerald-400" : "text-muted-foreground/40"}`}>
              {labels[i]}
            </span>
            {i < total - 1 && (
              <div className={`w-12 h-0.5 mx-1 ${isDone ? "bg-emerald-500/50" : "bg-muted/20"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Step 1: Hardware Selection ── */

function HardwareStep({ config, onChange }: { config: Partial<BgpConfig>; onChange: (c: Partial<BgpConfig>) => void }) {
  const { t } = useTranslation();
  const [vendorFilter, setVendorFilter] = useState<"all" | "huawei" | "datacom">("all");

  const filtered = useMemo(() =>
    vendorFilter === "all" ? HARDWARE_CATALOG : HARDWARE_CATALOG.filter(h => h.vendor === vendorFilter),
    [vendorFilter]
  );

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-orbitron font-bold text-foreground tracking-wide">
          {t("bgp.selectHardware")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{t("bgp.selectHardwareSub")}</p>
      </div>

      {/* Vendor filter */}
      <div className="flex justify-center gap-3">
        {(["all", "huawei", "datacom"] as const).map(v => (
          <button
            key={v}
            onClick={() => setVendorFilter(v)}
            className={`
              px-4 py-2 rounded-lg text-xs font-mono uppercase tracking-wider transition-all duration-300
              border ${vendorFilter === v
                ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-300 shadow-[0_0_12px_rgba(0,229,255,0.2)]"
                : "border-muted/20 bg-muted/5 text-muted-foreground/60 hover:border-muted/40"
              }
            `}
          >
            {v === "all" ? t("bgp.all") : v === "huawei" ? "🟠 Huawei" : "🔵 Datacom"}
          </button>
        ))}
      </div>

      {/* Hardware grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[420px] overflow-y-auto pr-1">
        {filtered.map((hw, i) => {
          const isSelected = config.model === hw.id;
          return (
            <motion.button
              key={hw.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => onChange({ vendor: hw.vendor, model: hw.id })}
              className={`
                relative group text-left rounded-xl p-4 transition-all duration-300 border overflow-hidden
                ${isSelected
                  ? "border-cyan-400/60 bg-cyan-500/10 shadow-[0_0_20px_rgba(0,229,255,0.15)]"
                  : "border-muted/20 bg-muted/5 hover:border-muted/40 hover:bg-muted/10"
                }
              `}
            >
              {/* Glow effect */}
              {isSelected && (
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent pointer-events-none" />
              )}

              <div className="relative z-10 flex items-start gap-3">
                <div className={`
                  w-12 h-12 rounded-lg flex items-center justify-center shrink-0
                  ${hw.vendor === "huawei" ? "bg-orange-500/10" : "bg-blue-500/10"}
                `}>
                  <Icon
                    icon={hw.icon}
                    className={`w-7 h-7 ${hw.vendor === "huawei" ? "text-orange-400" : "text-blue-400"}`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-foreground">{hw.name}</span>
                    <span className={`
                      text-[9px] px-1.5 py-0.5 rounded font-mono uppercase
                      ${hw.vendor === "huawei" ? "bg-orange-500/10 text-orange-400" : "bg-blue-500/10 text-blue-400"}
                    `}>
                      {hw.series}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/70 mt-1 leading-relaxed">
                    {hw.description}
                  </p>
                </div>
              </div>

              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-2 right-2"
                >
                  <CheckCircle className="w-5 h-5 text-cyan-400" />
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Step 2: SSH Terminal ── */

function SSHStep({ config, onChange }: { config: Partial<BgpConfig>; onChange: (c: Partial<BgpConfig>) => void }) {
  const { t } = useTranslation();
  const [showPwd, setShowPwd] = useState(false);
  const selectedHw = HARDWARE_CATALOG.find(h => h.id === config.model);

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="text-center">
        <h2 className="text-xl font-orbitron font-bold text-foreground tracking-wide">
          {t("bgp.sshTerminal")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("bgp.credentialsSub")} {selectedHw?.name || "router"}
        </p>
      </div>

      {/* Terminal frame */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{
          background: "linear-gradient(180deg, hsl(220 40% 6%) 0%, hsl(225 35% 4%) 100%)",
          borderColor: "hsl(200 80% 40% / 0.3)",
          boxShadow: "0 0 30px rgba(0, 229, 255, 0.05), inset 0 1px 0 rgba(255,255,255,0.03)",
        }}
      >
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-muted/10" style={{ background: "hsl(220 30% 8%)" }}>
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
          </div>
          <span className="text-[10px] font-mono text-muted-foreground/50 ml-2">
            ssh — {selectedHw?.name || "router"} — {config.host || "0.0.0.0"}:{config.port || "22"}
          </span>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label className="text-[10px] font-mono text-cyan-400/70 uppercase tracking-wider">
                <Globe className="w-3 h-3 inline mr-1" />Host / IP
              </label>
              <input
                type="text"
                placeholder="192.168.1.1"
                value={config.host || ""}
                onChange={e => onChange({ host: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-muted/20 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 focus:border-cyan-400/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/20 transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-cyan-400/70 uppercase tracking-wider">{t("bgp.port")}</label>
              <input
                type="text"
                placeholder="22"
                value={config.port || ""}
                onChange={e => onChange({ port: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-muted/20 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 focus:border-cyan-400/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/20 transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-cyan-400/70 uppercase tracking-wider">
              <User className="w-3 h-3 inline mr-1" />{t("bgp.user")}
            </label>
            <input
              type="text"
              placeholder="admin"
              value={config.username || ""}
              onChange={e => onChange({ username: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-muted/20 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 focus:border-cyan-400/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/20 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-cyan-400/70 uppercase tracking-wider">
              <Lock className="w-3 h-3 inline mr-1" />{t("bgp.password")}
            </label>
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                placeholder="••••••••"
                value={config.password || ""}
                onChange={e => onChange({ password: e.target.value })}
                className="w-full px-3 py-2.5 pr-10 rounded-lg bg-black/40 border border-muted/20 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 focus:border-cyan-400/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/20 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPwd(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Simulated prompt */}
          <div className="pt-2 border-t border-muted/10">
            <div className="text-[10px] font-mono text-emerald-400/50">
              <span className="text-cyan-400/40">$</span> ssh {config.username || "admin"}@{config.host || "..."} -p {config.port || "22"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Step 3: Confirmation ── */

function ConfirmStep({ config }: { config: Partial<BgpConfig> }) {
  const { t } = useTranslation();
  const hw = HARDWARE_CATALOG.find(h => h.id === config.model);
  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="text-center">
        <h2 className="text-xl font-orbitron font-bold text-foreground tracking-wide">
          {t("bgp.confirmation")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{t("bgp.confirmSub")}</p>
      </div>

      <div
        className="rounded-xl border p-6 space-y-4"
        style={{
          background: "linear-gradient(145deg, hsl(220 40% 8% / 0.95) 0%, hsl(225 35% 5% / 0.9) 100%)",
          borderColor: "hsl(140 60% 40% / 0.3)",
          boxShadow: "0 0 20px rgba(0, 200, 100, 0.05)",
        }}
      >
        {/* Hardware */}
        <div className="flex items-center gap-3 pb-3 border-b border-muted/10">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${hw?.vendor === "huawei" ? "bg-orange-500/10" : "bg-blue-500/10"}`}>
            <Icon icon={hw?.icon || "mdi:router-network"} className={`w-6 h-6 ${hw?.vendor === "huawei" ? "text-orange-400" : "text-blue-400"}`} />
          </div>
          <div>
            <span className="font-mono font-bold text-sm text-foreground">{hw?.name}</span>
            <p className="text-[10px] text-muted-foreground">{hw?.description}</p>
          </div>
        </div>

        {/* Connection details */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: t("bgp.host"), value: config.host, icon: Globe },
            { label: t("bgp.port"), value: config.port || "22", icon: Terminal },
            { label: t("bgp.user"), value: config.username, icon: User },
            { label: t("bgp.password"), value: "••••••••", icon: Lock },
          ].map(({ label, value, icon: Ic }) => (
            <div key={label} className="flex items-center gap-2 p-2.5 rounded-lg bg-black/20 border border-muted/10">
              <Ic className="w-3.5 h-3.5 text-cyan-400/50 shrink-0" />
              <div>
                <div className="text-[9px] font-mono text-muted-foreground/50 uppercase">{label}</div>
                <div className="text-xs font-mono text-foreground">{value || "—"}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Command preview */}
        <div className="p-3 rounded-lg bg-black/30 border border-emerald-500/10">
          <div className="text-[9px] font-mono text-muted-foreground/40 mb-1">{t("bgp.commandsToExecute")}</div>
          <div className="text-[11px] font-mono text-emerald-400/70 space-y-0.5">
            {config.vendor === "huawei" ? (
              <>
                <div><span className="text-cyan-400/40">&gt;</span> display bgp peer</div>
                <div><span className="text-cyan-400/40">&gt;</span> display bgp routing-table statistics</div>
                <div><span className="text-cyan-400/40">&gt;</span> display ip routing-table statistics</div>
              </>
            ) : (
              <>
                <div><span className="text-cyan-400/40">#</span> show bgp summary</div>
                <div><span className="text-cyan-400/40">#</span> show bgp ipv4 unicast summary</div>
                <div><span className="text-cyan-400/40">#</span> show ip route summary</div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Country flag emoji ── */
function countryFlag(code: string): string {
  if (!code || code === "??" || code.length !== 2) return "🌐";
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

/* ─── Traffic type colors ── */
const TRAFFIC_COLORS: Record<string, { gradient: string; solid: string; label: string }> = {
  transit: { gradient: "from-cyan-400 to-blue-500", solid: "#00e5ff", label: "IP Transit" },
  ix:      { gradient: "from-purple-400 to-fuchsia-500", solid: "#c050ff", label: "IX / Peering" },
  cdn:     { gradient: "from-emerald-400 to-green-500", solid: "#00e676", label: "CDNs" },
  enterprise: { gradient: "from-amber-400 to-orange-500", solid: "#ffab40", label: "Enterprise" },
  unknown: { gradient: "from-gray-400 to-gray-500", solid: "#9e9e9e", label: "Others" },
};

/* ─── Sankey-style flow visualization ── */
function SankeyFlow({ flows }: { flows: Array<{ source_asn: number; target_asn: number; bw_mbps: number; source_info?: { name: string; type: string } | null; target_info?: { name: string; type: string } | null; traffic_type?: string }> }) {
  if (!flows || flows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground/40">
        <BarChart3 className="w-10 h-10" />
        <p className="text-[11px] font-mono">Aguardando dados de fluxo via POST...</p>
        <p className="text-[9px] font-mono text-muted-foreground/25">Envie flow_data[] para o endpoint bgp-collector</p>
      </div>
    );
  }

  const sorted = [...flows].sort((a, b) => b.bw_mbps - a.bw_mbps).slice(0, 15);
  const maxBw = Math.max(...sorted.map(f => f.bw_mbps), 1);

  return (
    <div className="space-y-2">
      {sorted.map((flow, i) => {
        const tc = TRAFFIC_COLORS[flow.traffic_type || "unknown"] || TRAFFIC_COLORS.unknown;
        const widthPct = Math.max(15, (flow.bw_mbps / maxBw) * 100);
        const srcName = flow.source_info?.name || `AS${flow.source_asn}`;
        const tgtName = flow.target_info?.name || `AS${flow.target_asn}`;

        return (
          <motion.div
            key={`${flow.source_asn}-${flow.target_asn}-${i}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className="flex items-center gap-2 group"
          >
            <span className="text-[9px] font-mono text-muted-foreground/60 w-20 text-right truncate">{srcName}</span>
            <ArrowRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />
            <div className="flex-1 relative h-6 rounded-md overflow-hidden bg-muted/5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${widthPct}%` }}
                transition={{ duration: 0.6, delay: i * 0.03 }}
                className={`absolute inset-y-0 left-0 rounded-md bg-gradient-to-r ${tc.gradient} opacity-70`}
              />
              <div className="absolute inset-0 flex items-center px-2">
                <span className="text-[9px] font-mono text-white/80 font-bold drop-shadow">
                  {flow.bw_mbps >= 1000 ? `${(flow.bw_mbps / 1000).toFixed(1)} Gbps` : `${flow.bw_mbps.toFixed(0)} Mbps`}
                </span>
              </div>
            </div>
            <span className="text-[9px] font-mono text-muted-foreground/60 w-24 truncate">{tgtName}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ─── ASN Table ── */
function AsnTable({ peers, filter }: {
  peers: Array<{
    asn: number; ip: string; state: string;
    prefixes_received?: number; prefixes_sent?: number;
    uptime?: string; bw_in_mbps?: number; bw_out_mbps?: number;
    info?: { name: string; country: string; type: string } | null;
  }>;
  filter: string;
}) {
  const filtered = useMemo(() => {
    let list = [...peers];
    if (filter === "top10") list = list.sort((a, b) => (b.prefixes_received || 0) - (a.prefixes_received || 0)).slice(0, 10);
    if (filter === "latency") list = list.sort((a, b) => (b.bw_in_mbps || 0) - (a.bw_in_mbps || 0));
    if (filter === "cost") list = list.sort((a, b) => (b.bw_out_mbps || 0) - (a.bw_out_mbps || 0));
    return list;
  }, [peers, filter]);

  if (filtered.length === 0) {
    return (
      <div className="text-center py-8">
        <Server className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
        <p className="text-[11px] font-mono text-muted-foreground/40">
          Aguardando dados de peers via POST no bgp-collector...
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] font-mono">
        <thead>
          <tr className="border-b border-muted/10 text-muted-foreground/50">
            <th className="text-left py-2 px-2">ASN</th>
            <th className="text-left py-2 px-2">Empresa</th>
            <th className="text-left py-2 px-2">País</th>
            <th className="text-left py-2 px-2">Tipo</th>
            <th className="text-left py-2 px-2">IP</th>
            <th className="text-center py-2 px-2">Estado</th>
            <th className="text-right py-2 px-2">Prefixos Rx</th>
            <th className="text-right py-2 px-2">Prefixos Tx</th>
            <th className="text-right py-2 px-2">BW In</th>
            <th className="text-left py-2 px-2">Uptime</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((peer, i) => {
            const tc = TRAFFIC_COLORS[peer.info?.type || "unknown"] || TRAFFIC_COLORS.unknown;
            const isEstablished = peer.state?.toLowerCase() === "established";
            return (
              <motion.tr
                key={`${peer.asn}-${peer.ip}-${i}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                className="border-b border-muted/5 hover:bg-muted/5 transition-colors"
              >
                <td className="py-2 px-2 font-bold" style={{ color: tc.solid }}>AS{peer.asn}</td>
                <td className="py-2 px-2 text-foreground/80">{peer.info?.name || `AS${peer.asn}`}</td>
                <td className="py-2 px-2">{countryFlag(peer.info?.country || "??")}</td>
                <td className="py-2 px-2">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] bg-gradient-to-r ${tc.gradient} text-white`}>
                    {tc.label}
                  </span>
                </td>
                <td className="py-2 px-2 text-muted-foreground/60">{peer.ip}</td>
                <td className="py-2 px-2 text-center">
                  <span className={`inline-flex items-center gap-1 ${isEstablished ? "text-emerald-400" : "text-red-400"}`}>
                    {isEstablished ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                    {peer.state}
                  </span>
                </td>
                <td className="py-2 px-2 text-right text-cyan-400/80">{(peer.prefixes_received || 0).toLocaleString()}</td>
                <td className="py-2 px-2 text-right text-purple-400/80">{(peer.prefixes_sent || 0).toLocaleString()}</td>
                <td className="py-2 px-2 text-right text-emerald-400/80">
                  {peer.bw_in_mbps ? `${peer.bw_in_mbps >= 1000 ? (peer.bw_in_mbps / 1000).toFixed(1) + " G" : peer.bw_in_mbps.toFixed(0) + " M"}` : "—"}
                </td>
                <td className="py-2 px-2 text-muted-foreground/50">{peer.uptime || "—"}</td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── useBgpRealtime hook ── */
interface BgpState {
  stats: {
    total_peers: number;
    established_peers: number;
    prefixes_received: number;
    prefixes_sent: number;
    active_asns: number;
  } | null;
  peers: Array<{
    asn: number; ip: string; state: string;
    prefixes_received?: number; prefixes_sent?: number;
    uptime?: string; bw_in_mbps?: number; bw_out_mbps?: number;
    info?: { name: string; country: string; type: string } | null;
  }>;
  flow_data: Array<{
    source_asn: number; target_asn: number; bw_mbps: number;
    source_info?: { name: string; type: string } | null;
    target_info?: { name: string; type: string } | null;
    traffic_type?: string;
  }>;
  network_summary: NetworkSummaryData;
  timestamp: number | null;
  connected: boolean;
}

/* ─── Mock data for demo ── */
const MOCK_PEERS: BgpState["peers"] = [
  { asn: 15169, ip: "187.16.214.1", state: "Established", prefixes_received: 1247, prefixes_sent: 523, bw_in_mbps: 4500, bw_out_mbps: 1200, uptime: "45d 12h", info: { name: "Google", country: "US", type: "cdn" } },
  { asn: 2906, ip: "187.16.214.5", state: "Established", prefixes_received: 842, prefixes_sent: 210, bw_in_mbps: 3200, bw_out_mbps: 800, uptime: "32d 07h", info: { name: "Netflix", country: "US", type: "cdn" } },
  { asn: 32934, ip: "187.16.214.9", state: "Established", prefixes_received: 654, prefixes_sent: 315, bw_in_mbps: 2800, bw_out_mbps: 650, uptime: "28d 19h", info: { name: "Meta/Facebook", country: "US", type: "cdn" } },
  { asn: 20940, ip: "187.16.214.13", state: "Established", prefixes_received: 1890, prefixes_sent: 420, bw_in_mbps: 5100, bw_out_mbps: 1400, uptime: "60d 03h", info: { name: "Akamai", country: "US", type: "cdn" } },
  { asn: 13335, ip: "187.16.214.17", state: "Established", prefixes_received: 980, prefixes_sent: 290, bw_in_mbps: 2100, bw_out_mbps: 550, uptime: "15d 22h", info: { name: "Cloudflare", country: "US", type: "cdn" } },
  { asn: 16509, ip: "187.16.214.21", state: "Established", prefixes_received: 1120, prefixes_sent: 380, bw_in_mbps: 1800, bw_out_mbps: 420, uptime: "41d 11h", info: { name: "Amazon/AWS", country: "US", type: "cdn" } },
  { asn: 8075, ip: "187.16.214.25", state: "Established", prefixes_received: 760, prefixes_sent: 195, bw_in_mbps: 1500, bw_out_mbps: 380, uptime: "52d 08h", info: { name: "Microsoft", country: "US", type: "cdn" } },
  { asn: 26162, ip: "200.219.148.1", state: "Established", prefixes_received: 95000, prefixes_sent: 850, bw_in_mbps: 8500, bw_out_mbps: 7200, uptime: "90d 00h", info: { name: "IX.br/PTT-SP", country: "BR", type: "ix" } },
  { asn: 4230, ip: "200.244.0.1", state: "Established", prefixes_received: 720000, prefixes_sent: 850, bw_in_mbps: 6200, bw_out_mbps: 3100, uptime: "120d 05h", info: { name: "Embratel", country: "BR", type: "transit" } },
  { asn: 26599, ip: "200.192.0.1", state: "Established", prefixes_received: 680000, prefixes_sent: 820, bw_in_mbps: 5800, bw_out_mbps: 2900, uptime: "88d 14h", info: { name: "Vivo/Telefônica", country: "BR", type: "transit" } },
  { asn: 28573, ip: "201.174.0.1", state: "Established", prefixes_received: 540000, prefixes_sent: 780, bw_in_mbps: 4100, bw_out_mbps: 2200, uptime: "67d 21h", info: { name: "Claro/NET", country: "BR", type: "transit" } },
  { asn: 3356, ip: "4.69.184.1", state: "Established", prefixes_received: 890000, prefixes_sent: 850, bw_in_mbps: 3500, bw_out_mbps: 1800, uptime: "145d 09h", info: { name: "Lumen/Level3", country: "US", type: "transit" } },
  { asn: 53013, ip: "177.124.0.1", state: "Idle", prefixes_received: 0, prefixes_sent: 0, bw_in_mbps: 0, bw_out_mbps: 0, uptime: "—", info: { name: "Brisanet", country: "BR", type: "transit" } },
  { asn: 714, ip: "17.0.0.1", state: "Established", prefixes_received: 420, prefixes_sent: 150, bw_in_mbps: 980, bw_out_mbps: 210, uptime: "38d 16h", info: { name: "Apple", country: "US", type: "cdn" } },
];

const MOCK_FLOWS: BgpState["flow_data"] = [
  { source_asn: 26599, target_asn: 15169, bw_mbps: 4500, source_info: { name: "Vivo/Telefônica", type: "transit" }, target_info: { name: "Google", type: "cdn" }, traffic_type: "cdn" },
  { source_asn: 26162, target_asn: 20940, bw_mbps: 5100, source_info: { name: "IX.br/PTT-SP", type: "ix" }, target_info: { name: "Akamai", type: "cdn" }, traffic_type: "ix" },
  { source_asn: 4230, target_asn: 2906, bw_mbps: 3200, source_info: { name: "Embratel", type: "transit" }, target_info: { name: "Netflix", type: "cdn" }, traffic_type: "transit" },
  { source_asn: 28573, target_asn: 32934, bw_mbps: 2800, source_info: { name: "Claro/NET", type: "transit" }, target_info: { name: "Meta/Facebook", type: "cdn" }, traffic_type: "cdn" },
  { source_asn: 26162, target_asn: 13335, bw_mbps: 2100, source_info: { name: "IX.br/PTT-SP", type: "ix" }, target_info: { name: "Cloudflare", type: "cdn" }, traffic_type: "ix" },
  { source_asn: 3356, target_asn: 16509, bw_mbps: 1800, source_info: { name: "Lumen/Level3", type: "transit" }, target_info: { name: "Amazon/AWS", type: "cdn" }, traffic_type: "transit" },
  { source_asn: 26599, target_asn: 8075, bw_mbps: 1500, source_info: { name: "Vivo/Telefônica", type: "transit" }, target_info: { name: "Microsoft", type: "cdn" }, traffic_type: "cdn" },
  { source_asn: 26162, target_asn: 714, bw_mbps: 980, source_info: { name: "IX.br/PTT-SP", type: "ix" }, target_info: { name: "Apple", type: "cdn" }, traffic_type: "ix" },
  { source_asn: 4230, target_asn: 26162, bw_mbps: 8500, source_info: { name: "Embratel", type: "transit" }, target_info: { name: "IX.br/PTT-SP", type: "ix" }, traffic_type: "ix" },
  { source_asn: 28573, target_asn: 3356, bw_mbps: 3500, source_info: { name: "Claro/NET", type: "transit" }, target_info: { name: "Lumen/Level3", type: "transit" }, traffic_type: "transit" },
];

const MOCK_STATS: BgpState["stats"] = {
  total_peers: MOCK_PEERS.length,
  established_peers: MOCK_PEERS.filter(p => p.state === "Established").length,
  prefixes_received: MOCK_PEERS.reduce((s, p) => s + (p.prefixes_received || 0), 0),
  prefixes_sent: MOCK_PEERS.reduce((s, p) => s + (p.prefixes_sent || 0), 0),
  active_asns: new Set(MOCK_PEERS.map(p => p.asn)).size,
};

const MOCK_NETWORK_SUMMARY: NetworkSummaryData = {
  subnets: [
    { name: "IPv4", in_bytes: 32.51e12, out_bytes: 32.51e12, total_bytes: 65.01e12 },
    { name: "IPv6", in_bytes: 13.61e12, out_bytes: 13.61e12, total_bytes: 27.21e12 },
    { name: "Bloco - 2804:4afc::/32", in_bytes: 6.32e12, out_bytes: 8.93e12, total_bytes: 15.25e12 },
    { name: "Bloco - 2804:4afc:8000::/33", in_bytes: 6.32e12, out_bytes: 8.76e12, total_bytes: 15.08e12 },
    { name: "Bloco - 2804:4afc:8000::/34", in_bytes: 6.32e12, out_bytes: 6.90e12, total_bytes: 13.22e12 },
    { name: "Bloco - 2804:4afc:8000::/35", in_bytes: 6.32e12, out_bytes: 6.90e12, total_bytes: 13.22e12 },
    { name: "FNA", in_bytes: 8.36e12, out_bytes: 2.27e12, total_bytes: 10.63e12 },
    { name: "GGC", in_bytes: 7.09e12, out_bytes: 3.33e12, total_bytes: 10.42e12 },
    { name: "Bloco - 45.232.214.0/24", in_bytes: 5.86e12, out_bytes: 3.57e12, total_bytes: 9.43e12 },
    { name: "Bloco - 45.232.213.0/24", in_bytes: 5.77e12, out_bytes: 646.23e9, total_bytes: 6.42e12 },
  ],
  applications: [
    { name: "HTTPS", total_bytes: 19.62e12 },
    { name: "QUIC", total_bytes: 18.83e12 },
    { name: "HTTP", total_bytes: 2.87e12 },
    { name: "DNS", total_bytes: 19.19e9 },
    { name: "POP", total_bytes: 158.15e6 },
    { name: "TRAFIP", total_bytes: 145.09e6 },
    { name: "SMTP", total_bytes: 96.71e6 },
  ],
  protocols: [
    { name: "TCP", total_bytes: 23.70e12 },
    { name: "UDP", total_bytes: 22.40e12 },
    { name: "GRE", total_bytes: 6.02e9 },
    { name: "ICMP", total_bytes: 2.75e9 },
    { name: "VRRP", total_bytes: 2.77e6 },
    { name: "OSPF", total_bytes: 596e3 },
    { name: "IPoIP", total_bytes: 60e3 },
  ],
  autonomous_systems: [
    { name: "67 61614", in_bytes: 18.92e12, out_bytes: 15.00e12, total_bytes: 33.92e12 },
    { name: "Cliente - M2 Bonito", in_bytes: 0, out_bytes: 8.34e12, total_bytes: 8.34e12 },
    { name: "Google", in_bytes: 5.65e12, out_bytes: 290.37e9, total_bytes: 5.94e12 },
    { name: "67 TELECOM RESERVA", in_bytes: 952.06e9, out_bytes: 4.13e12, total_bytes: 5.08e12 },
    { name: "AS CGNAT", in_bytes: 176.50e9, out_bytes: 4.81e12, total_bytes: 4.99e12 },
    { name: "Facebook", in_bytes: 4.27e12, out_bytes: 155.67e9, total_bytes: 4.43e12 },
    { name: "67 26947", in_bytes: 83.33e6, out_bytes: 4.38e12, total_bytes: 4.38e12 },
    { name: "Cliente - MDA Bela Vista", in_bytes: 169.71e6, out_bytes: 2.72e12, total_bytes: 2.72e12 },
    { name: "Akamai", in_bytes: 1.99e12, out_bytes: 42.70e9, total_bytes: 2.03e12 },
    { name: "Cliente - GMN", in_bytes: 0, out_bytes: 1.90e12, total_bytes: 1.90e12 },
  ],
  tos: [
    { name: "CS0", total_bytes: 44.17e12 },
    { name: "CS1 CISCO", total_bytes: 284.96e9 },
    { name: "AF41 Vanguard", total_bytes: 130.78e9 },
    { name: "CS1 Vanguard", total_bytes: 115.44e9 },
    { name: "CS3 Vanguard", total_bytes: 112.68e9 },
    { name: "AF41 CISCO", total_bytes: 80.94e9 },
    { name: "AF32 CISCO", total_bytes: 70.67e9 },
    { name: "AF11 CISCO", total_bytes: 60.14e9 },
    { name: "CS4 CISCO", total_bytes: 37.16e9 },
    { name: "AF43 CISCO", total_bytes: 31.45e9 },
  ],
  subnet_groups: [
    { name: "67 TELECOM", in_bytes: 19.97e12, out_bytes: 24.37e12, total_bytes: 44.34e12 },
    { name: "AS61614", in_bytes: 19.87e12, out_bytes: 19.13e12, total_bytes: 39.00e12 },
    { name: "CDN", in_bytes: 17.44e12, out_bytes: 5.60e12, total_bytes: 23.04e12 },
    { name: "Clientes - Subredes", in_bytes: 1.24e9, out_bytes: 5.05e12, total_bytes: 5.06e12 },
    { name: "AS26947", in_bytes: 83.33e6, out_bytes: 4.38e12, total_bytes: 4.38e12 },
    { name: "CGNAT", in_bytes: 148e3, out_bytes: 3.90e12, total_bytes: 3.90e12 },
    { name: "AS64165", in_bytes: 95.18e9, out_bytes: 858.76e9, total_bytes: 953.94e9 },
  ],
  interface_groups: [
    { name: "1 - Total Trânsito", in_bytes: 16.08e12, out_bytes: 3.31e12, total_bytes: 19.39e12 },
    { name: "1 - Total CDNs", in_bytes: 18.74e12, out_bytes: 91.59e9, total_bytes: 18.83e12 },
    { name: "C21 - Computize DDoS", in_bytes: 5.39e12, out_bytes: 3.18e12, total_bytes: 8.57e12 },
    { name: "C83 - CDN MNA", in_bytes: 8.36e12, out_bytes: 0, total_bytes: 8.36e12 },
    { name: "C82 - CDN GGC", in_bytes: 7.09e12, out_bytes: 66.69e9, total_bytes: 7.15e12 },
    { name: "C01 - Vivo", in_bytes: 6.57e12, out_bytes: 133.08e9, total_bytes: 6.70e12 },
    { name: "1 - Total PNI", in_bytes: 5.32e12, out_bytes: 840.28e9, total_bytes: 6.16e12 },
    { name: "A10-OUTSIDE", in_bytes: 1.05e12, out_bytes: 4.62e12, total_bytes: 5.67e12 },
    { name: "CLIENTES", in_bytes: 678.87e9, out_bytes: 3.86e12, total_bytes: 4.54e12 },
    { name: "C03 - OpenX", in_bytes: 4.11e12, out_bytes: 64e3, total_bytes: 4.11e12 },
  ],
  as_groups: [
    { name: "Clientes", in_bytes: 20.37e12, out_bytes: 38.97e12, total_bytes: 59.34e12 },
    { name: "Conteúdos", in_bytes: 21.30e12, out_bytes: 783.09e9, total_bytes: 22.08e12 },
    { name: "Games", in_bytes: 614.41e9, out_bytes: 42.14e9, total_bytes: 656.55e9 },
  ],
  tos_groups: [
    { name: "Best Effort", total_bytes: 44.17e12 },
    { name: "Bulk [EBT]", total_bytes: 498.19e9 },
    { name: "Missão Crítica [EBT]", total_bytes: 196.08e9 },
    { name: "Vídeo [EBT]", total_bytes: 80.94e9 },
    { name: "Network Control [EBT]", total_bytes: 27.57e9 },
    { name: "Voz", total_bytes: 25.84e9 },
    { name: "DADOSBL [PRIMESYS]", total_bytes: 3.92e9 },
    { name: "Interativa [EBT]", total_bytes: 1.43e9 },
    { name: "SUP [PRIMESYS]", total_bytes: 570.94e6 },
    { name: "DADOSBG [PRIMESYS]", total_bytes: 339.18e6 },
  ],
  mapped_objects: [
    { name: "[Virtual-Ethernet0/1/701.970] VS-BGP-SP4", in_bytes: 3.02e12, out_bytes: 8.33e12, total_bytes: 11.35e12 },
    { name: "[Virtual-Ethernet0/1/701.970] VS01-BGP-CGR", in_bytes: 8.21e12, out_bytes: 3.02e12, total_bytes: 11.22e12 },
    { name: "[Virtual-Ethernet0/1/701.4000] VS01-BGP-CGR", in_bytes: 2.89e12, out_bytes: 7.67e12, total_bytes: 10.56e12 },
    { name: "[100GE0/0/1] PE-PPR-02", in_bytes: 0, out_bytes: 9.05e12, total_bytes: 9.05e12 },
    { name: "[100GE0/0/2] PE-PPR-02", in_bytes: 0, out_bytes: 9.02e12, total_bytes: 9.02e12 },
    { name: "[Eth-Trunk149.3105] VS-BGP-SP4", in_bytes: 5.39e12, out_bytes: 3.18e12, total_bytes: 8.57e12 },
    { name: "[Virtual-Ethernet0/1/701.4001] VS01-BGP-CGR", in_bytes: 1.16e12, out_bytes: 7.03e12, total_bytes: 8.19e12 },
    { name: "[Eth-Trunk31.1310] VS01-BGP-CGR", in_bytes: 6.57e12, out_bytes: 133.08e9, total_bytes: 6.70e12 },
    { name: "[Eth-Trunk31.48] VS01-BGP-CGR", in_bytes: 952.05e9, out_bytes: 4.09e12, total_bytes: 5.04e12 },
    { name: "[Virtual-Ethernet0/1/701.980] VS01-BGP-DOS", in_bytes: 4.79e12, out_bytes: 3.01e9, total_bytes: 4.79e12 },
  ],
  devices: [
    { name: "VS01-BGP-CGR", total_bytes: 30.26e12 },
    { name: "PE-PPR-02", total_bytes: 18.35e12 },
    { name: "VS-BGP-SP4", total_bytes: 12.86e12 },
    { name: "VS-PNI-SP4", total_bytes: 6.16e12 },
    { name: "VS01-BGP-DOS", total_bytes: 4.98e12 },
    { name: "VS-IXs-SP4", total_bytes: 3.20e12 },
  ],
};

function useBgpRealtime(configId: string): BgpState & { refresh: () => void } {
  const [state, setState] = useState<BgpState>({
    stats: MOCK_STATS, peers: MOCK_PEERS, flow_data: MOCK_FLOWS, network_summary: MOCK_NETWORK_SUMMARY, timestamp: Date.now(), connected: false,
  });
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/bgp-collector?config_id=${encodeURIComponent(configId)}`,
        {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
        }
      );
      if (resp.ok) {
        const data = await resp.json();
        if (data.stats || data.peers?.length > 0) {
          setState(prev => ({
            ...prev,
            stats: data.stats || prev.stats,
            peers: data.peers || prev.peers,
            flow_data: data.flow_data || prev.flow_data,
            network_summary: data.network_summary || prev.network_summary,
            timestamp: data.timestamp || Date.now(),
          }));
        }
      }
    } catch (e) {
      console.error("[BGP] refresh error:", e);
    }
  }, [configId]);

  useEffect(() => {
    refresh();

    const channelName = `bgp:${configId}`;
    const channel = supabase.channel(channelName);
    channel.on("broadcast", { event: "BGP_UPDATE" }, ({ payload }) => {
      if (payload) {
        setState(prev => ({
          ...prev,
          stats: payload.stats || prev.stats,
          peers: payload.peers || prev.peers,
          flow_data: payload.flow_data || prev.flow_data,
          network_summary: payload.network_summary || prev.network_summary,
          timestamp: payload.timestamp || Date.now(),
          connected: true,
        }));
      }
    }).subscribe((status) => {
      setState(prev => ({ ...prev, connected: status === "SUBSCRIBED" }));
    });

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [configId, refresh]);

  return { ...state, refresh };
}

/* ─── Dashboard (Phase 2) ── */

function BgpDashboard({ config, onReconfigure, onSave, saving }: { config: BgpConfig; onReconfigure: () => void; onSave?: () => void; saving?: boolean }) {
  const { t } = useTranslation();
  const hw = HARDWARE_CATALOG.find(h => h.id === config.model);
  const configId = `${config.host}:${config.port}`;
  const { stats, peers, flow_data, network_summary, timestamp, connected, refresh } = useBgpRealtime(configId);
  const [viewMode, setViewMode] = useState<"peering" | "bgp" | "flow" | "resumo" | "flaps" | "geo">("peering");
  const [asnFilter, setAsnFilter] = useState<"all" | "top10" | "latency" | "cost">("all");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refresh();
    setTimeout(() => setIsRefreshing(false), 800);
  }, [refresh]);

  const lastUpdate = timestamp ? new Date(timestamp).toLocaleTimeString() : "—";

  return (
    <div className="min-h-screen p-6" style={{ background: "linear-gradient(180deg, hsl(220 30% 4%) 0%, hsl(225 25% 6%) 50%, hsl(220 30% 4%) 100%)" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => window.history.back()} className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground/50 hover:text-muted-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> {t("common.back")}
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-cyan-500/10 border border-cyan-400/20">
              <Network className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-lg font-orbitron font-bold text-foreground tracking-wide flex items-center gap-2">
                BGP & ASN Flow Monitor
                <span className="text-[9px] px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-400/20 text-cyan-400 font-mono">
                  {hw?.name}
                </span>
              </h1>
              <p className="text-[11px] font-mono text-muted-foreground/60">
                {config.host}:{config.port} • Peering Analytics • {t("bgpDashboard.updated")}: {lastUpdate}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-muted/20 overflow-hidden">
            {(["peering", "bgp", "flow", "flaps", "geo", "resumo"] as const).map(mode => {
              const labels: Record<string, string> = {
                peering: t("bgp.peeringWall"),
                bgp: t("bgp.bgpView"),
                flow: t("bgp.flowView"),
                flaps: t("bgp.stability"),
                geo: t("bgp.geoBgp"),
                resumo: t("bgp.networkSummary"),
              };
              return (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 text-[10px] font-mono uppercase transition-all ${
                    viewMode === mode
                      ? "bg-cyan-500/15 text-cyan-400 border-cyan-400/20"
                      : "text-muted-foreground/50 hover:text-muted-foreground/80"
                  }`}
                >
                  {labels[mode]}
                </button>
              );
            })}
          </div>

          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg border border-muted/20 text-muted-foreground/50 hover:text-cyan-400 hover:border-cyan-400/30 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>

          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${
            connected
              ? "bg-emerald-500/10 border-emerald-500/20"
              : "bg-amber-500/10 border-amber-500/20"
          }`}>
            <div className={`w-2 h-2 rounded-full animate-pulse ${connected ? "bg-emerald-400" : "bg-amber-400"}`} />
            <span className={`text-[10px] font-mono ${connected ? "text-emerald-400" : "text-amber-400"}`}>
              {connected ? t("bgpDashboard.online") : t("bgpDashboard.waiting")}
            </span>
          </div>

          {onSave && (
            <button onClick={onSave} disabled={saving} className="flex items-center gap-1 text-[9px] font-mono text-neon-green/70 hover:text-neon-green transition-colors disabled:opacity-50">
              <Save className="w-3 h-3" /> {saving ? t("virtualization.saving") : t("common.save")}
            </button>
          )}
          <button onClick={onReconfigure} className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground/50 hover:text-muted-foreground transition-colors">
            <Settings2 className="w-3 h-3" /> {t("bgp.reconfigure")}
          </button>
        </div>
      </div>

      {/* Main content */}
      {viewMode === "resumo" ? (
        <NetworkSummaryPanel data={network_summary} />
      ) : viewMode === "peering" ? (
        <PeeringWall peers={peers} />
      ) : viewMode === "flaps" ? (
        <FlapHistory data={generateMockFlaps(peers)} />
      ) : viewMode === "geo" ? (
        <GeoBgpMap peers={peers} coreLocation={{ lat: -20.46, lon: -54.62, name: config.host || "Core ISP" }} />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-xl border border-muted/20 p-6 min-h-[400px]"
              style={{ background: "linear-gradient(145deg, hsl(220 40% 8% / 0.95) 0%, hsl(225 35% 5% / 0.9) 100%)" }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-mono text-sm text-foreground flex items-center gap-2">
                  <Zap className="w-4 h-4 text-cyan-400" />
                  {viewMode === "flow" ? t("bgpDashboard.trafficFlow") : t("bgpDashboard.bgpPeersOverview")}
                </h3>
                <div className="flex gap-2">
                  {Object.entries(TRAFFIC_COLORS).filter(([k]) => k !== "unknown").map(([, tc]) => (
                    <div key={tc.label} className="flex items-center gap-1.5">
                      <div className="w-3 h-1.5 rounded-full" style={{ background: tc.solid }} />
                      <span className="text-[9px] font-mono text-muted-foreground/50">{tc.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {viewMode === "flow" ? (
                <SankeyFlow flows={flow_data} />
              ) : (
                peers.length > 0 ? (
                  <SankeyFlow
                    flows={peers.filter(p => p.prefixes_received).map(p => ({
                      source_asn: 0,
                      target_asn: p.asn,
                      bw_mbps: p.bw_in_mbps || (p.prefixes_received || 0) / 10,
                      source_info: { name: config.host, type: "transit" },
                      target_info: p.info ? { name: p.info.name, type: p.info.type } : null,
                      traffic_type: p.info?.type || "unknown",
                    }))}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground/40">
                    <BarChart3 className="w-10 h-10" />
                    <p className="text-[11px] font-mono">{t("bgpDashboard.waitingPeerData")}</p>
                    <p className="text-[9px] font-mono text-muted-foreground/25">
                      POST para /functions/v1/bgp-collector com peers[]
                    </p>
                  </div>
                )
              )}
            </div>

            {/* Stats panel */}
            <div className="space-y-4">
              {[
                { label: t("bgpDashboard.bgpSessions"), value: stats ? `${stats.established_peers}/${stats.total_peers}` : "—", icon: Activity, color: "#00e5ff" },
                { label: t("bgpDashboard.prefixesReceived"), value: stats ? stats.prefixes_received.toLocaleString() : "—", icon: ArrowDownToLine, color: "#448aff" },
                { label: t("bgpDashboard.prefixesSent"), value: stats ? stats.prefixes_sent.toLocaleString() : "—", icon: ArrowUpFromLine, color: "#00e676" },
                { label: t("bgpDashboard.activeAsns"), value: stats ? String(stats.active_asns) : "—", icon: Globe, color: "#c050ff" },
              ].map(({ label, value, icon: Ic, color }) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="rounded-xl border border-muted/20 p-4 flex items-center gap-3"
                  style={{ background: "linear-gradient(145deg, hsl(220 40% 8% / 0.95) 0%, hsl(225 35% 5% / 0.9) 100%)" }}
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
                    <Ic className="w-4.5 h-4.5" style={{ color }} />
                  </div>
                  <div>
                    <div className="text-[9px] font-mono text-muted-foreground/50 uppercase">{label}</div>
                    <div className="text-lg font-mono font-bold text-foreground">{value}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* ASN Table */}
          <div className="mt-6 rounded-xl border border-muted/20 p-6"
            style={{ background: "linear-gradient(145deg, hsl(220 40% 8% / 0.95) 0%, hsl(225 35% 5% / 0.9) 100%)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-mono text-sm text-foreground flex items-center gap-2">
                <Globe className="w-4 h-4 text-cyan-400" />
                {t("bgpDashboard.asnPeers")}
              </h3>
              <div className="flex gap-2">
                {([
                  { key: "all", label: t("bgpDashboard.all") },
                  { key: "top10", label: t("bgpDashboard.top10Asns") },
                  { key: "latency", label: t("bgpDashboard.highestLatency") },
                  { key: "cost", label: t("bgpDashboard.costPerMb") },
                ] as const).map(f => (
                  <button
                    key={f.key}
                    onClick={() => setAsnFilter(f.key)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-mono border transition-all ${
                      asnFilter === f.key
                        ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-400"
                        : "border-muted/20 text-muted-foreground/50 hover:border-muted/40 hover:text-muted-foreground/80"
                    }`}
                  >
                    <Filter className="w-3 h-3 inline mr-1" />
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <AsnTable peers={peers} filter={asnFilter} />
          </div>
        </>
      )}

      {/* Collector instructions (shown when no data) */}
      {!stats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 rounded-xl border border-amber-500/20 p-6"
          style={{ background: "linear-gradient(145deg, hsl(40 40% 8% / 0.5) 0%, hsl(35 35% 5% / 0.4) 100%)" }}
        >
          <h4 className="font-mono text-sm text-amber-400 mb-3 flex items-center gap-2">
            <Terminal className="w-4 h-4" />
            {t("bgpDashboard.howToSend")}
          </h4>
          <div className="text-[11px] font-mono text-muted-foreground/70 space-y-2">
            <p>1. Baixe o script coletor e configure as variáveis de ambiente:</p>
            <div className="p-3 rounded-lg bg-black/40 border border-muted/10 overflow-x-auto">
              <pre className="text-emerald-400/70 whitespace-pre">{`# Baixe o script
wget ${window.location.origin}/scripts/ne8000-bgp-collector.sh

# Configure as variáveis obrigatórias
export ROUTER_HOST="${config.host || "10.150.255.1"}"
export COLLECTOR_URL="https://${import.meta.env.VITE_SUPABASE_PROJECT_ID || "<PROJECT_ID>"}.supabase.co/functions/v1/bgp-collector"

# Variáveis opcionais
export CONFIG_ID="${configId}"
export VENDOR="${config.vendor}"
export MODEL="${config.model}"
export COLLECT_MODE="ssh"        # ou "snmp"
export ROUTER_USER="${config.username || "admin"}"
export ROUTER_PASS="SuaSenhaAqui"
export INTERVAL=30

# Execute
bash ne8000-bgp-collector.sh`}</pre>
            </div>
            <p className="text-muted-foreground/40 mt-2">
              {'💡'} O script detecta automaticamente OIDs Huawei proprietários e faz fallback para BGP4-MIB genérico.
            </p>
            <p className="text-muted-foreground/40">
              {'⚠️'} Nenhum IP ou URL fica hardcoded — cada ambiente configura suas próprias variáveis.
            </p>
          </div>
        </motion.div>
      )}

      {/* Reconfigure button (floating) */}
      <motion.button
        onClick={onReconfigure}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1 }}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full flex items-center justify-center
          bg-muted/10 border border-muted/20 backdrop-blur-md
          hover:bg-muted/20 hover:border-cyan-400/30 transition-all duration-300 group
          shadow-lg"
        title="Reconfigurar"
      >
        <Settings2 className="w-5 h-5 text-muted-foreground/50 group-hover:text-cyan-400 transition-colors" />
      </motion.button>
    </div>
  );
}

/* ─── Main Page ── */

export default function BgpFlowMonitor() {
  const { t } = useTranslation();
  const { save: saveDashboard, saving, dashboardId, loadedConfig } = useDashboardPersist<BgpConfig>({
    category: 'bgp',
    listPath: '/app/monitoring/bgp',
  });
  const [config, setConfig] = useState<Partial<BgpConfig>>(() => dashboardId ? (loadConfig() || {}) : {});
  const [step, setStep] = useState(1);
  const [showDashboard, setShowDashboard] = useState(() => dashboardId ? !!loadConfig() : false);

  useEffect(() => {
    if (loadedConfig && !showDashboard) {
      setConfig(loadedConfig);
      saveConfig(loadedConfig);
      setShowDashboard(true);
    }
  }, [loadedConfig]);

  const updateConfig = useCallback((partial: Partial<BgpConfig>) => {
    setConfig(prev => ({ ...prev, ...partial }));
  }, []);

  const canAdvance = useMemo(() => {
    if (step === 1) return !!config.model;
    if (step === 2) return !!config.host && !!config.username && !!config.password;
    return true;
  }, [step, config]);

  const handleFinish = useCallback(() => {
    const full: BgpConfig = {
      vendor: config.vendor || "huawei",
      model: config.model || "",
      host: config.host || "",
      port: config.port || "22",
      username: config.username || "",
      password: config.password || "",
    };
    saveConfig(full);
    setShowDashboard(true);
  }, [config]);

  const handleReconfigure = useCallback(() => {
    clearConfig();
    setConfig({});
    setStep(1);
    setShowDashboard(false);
  }, []);

  const handleSave = useCallback(() => {
    const full = loadConfig();
    if (!full) return;
    const hw = HARDWARE_CATALOG.find(h => h.id === full.model);
    saveDashboard(`BGP ${hw?.name || full.host}`, full);
  }, [saveDashboard]);

  if (showDashboard) {
    const fullConfig = loadConfig();
    if (fullConfig) {
      return <BgpDashboard config={fullConfig} onReconfigure={handleReconfigure} onSave={handleSave} saving={saving} />;
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "linear-gradient(180deg, hsl(220 30% 4%) 0%, hsl(225 25% 6%) 50%, hsl(220 30% 4%) 100%)" }}
    >
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <h1 className="text-2xl md:text-3xl font-orbitron font-black tracking-wider">
          <span className="text-cyan-400" style={{ textShadow: "0 0 20px rgba(0, 229, 255, 0.4)" }}>
            BGP
          </span>
          <span className="text-muted-foreground/30 mx-2">|</span>
          <span className="text-foreground">Flow Monitor</span>
        </h1>
        <p className="text-xs font-mono text-muted-foreground/50 mt-2 tracking-wider">
          Peering & ASN Traffic Analysis
        </p>
      </motion.div>

      {/* Wizard container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-3xl rounded-2xl border p-6 md:p-8"
        style={{
          background: "linear-gradient(145deg, hsl(220 40% 8% / 0.95) 0%, hsl(225 35% 5% / 0.9) 100%)",
          borderColor: "hsl(200 80% 40% / 0.15)",
          boxShadow: "0 0 40px rgba(0, 229, 255, 0.03), 0 20px 60px rgba(0, 0, 0, 0.4)",
          backdropFilter: "blur(16px)",
        }}
      >
        <StepIndicator current={step} total={3} />

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {step === 1 && <HardwareStep config={config} onChange={updateConfig} />}
            {step === 2 && <SSHStep config={config} onChange={updateConfig} />}
            {step === 3 && <ConfirmStep config={config} />}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-4 border-t border-muted/10">
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 1}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-mono
              text-muted-foreground/60 hover:text-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" /> {t("common.back")}
          </button>

          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canAdvance}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-mono font-bold
                transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: canAdvance ? "linear-gradient(135deg, hsl(190 80% 40%), hsl(200 90% 50%))" : undefined,
                color: canAdvance ? "white" : undefined,
                boxShadow: canAdvance ? "0 0 20px rgba(0, 229, 255, 0.2)" : undefined,
              }}
            >
              {t("common.next")} <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-mono font-bold text-white transition-all duration-300"
              style={{
                background: "linear-gradient(135deg, hsl(140 60% 35%), hsl(160 70% 40%))",
                boxShadow: "0 0 20px rgba(0, 200, 100, 0.2)",
              }}
            >
              <CheckCircle className="w-4 h-4" /> {t("bgp.connect")}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
