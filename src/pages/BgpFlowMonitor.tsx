import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Server, Terminal, CheckCircle, ChevronRight, ChevronLeft,
  Settings2, Network, Globe, ArrowDownToLine, ArrowUpFromLine,
  BarChart3, Filter, Activity, Eye, EyeOff, Lock, User,
  RefreshCw, Wifi, WifiOff, TrendingUp, TrendingDown, Minus,
  Zap, ArrowRight,
} from "lucide-react";
import { Icon } from "@iconify/react";
import { supabase } from "@/integrations/supabase/client";

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
  const labels = ["Hardware", "Terminal SSH", "Confirmação"];
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
  const [vendorFilter, setVendorFilter] = useState<"all" | "huawei" | "datacom">("all");

  const filtered = useMemo(() =>
    vendorFilter === "all" ? HARDWARE_CATALOG : HARDWARE_CATALOG.filter(h => h.vendor === vendorFilter),
    [vendorFilter]
  );

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-orbitron font-bold text-foreground tracking-wide">
          Selecione o Hardware
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Escolha o roteador para monitoramento BGP</p>
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
            {v === "all" ? "Todos" : v === "huawei" ? "🟠 Huawei" : "🔵 Datacom"}
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
  const [showPwd, setShowPwd] = useState(false);
  const selectedHw = HARDWARE_CATALOG.find(h => h.id === config.model);

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="text-center">
        <h2 className="text-xl font-orbitron font-bold text-foreground tracking-wide">
          Terminal SSH
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Credenciais de acesso ao {selectedHw?.name || "roteador"}
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
              <label className="text-[10px] font-mono text-cyan-400/70 uppercase tracking-wider">Porta</label>
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
              <User className="w-3 h-3 inline mr-1" />Usuário
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
              <Lock className="w-3 h-3 inline mr-1" />Senha
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
  const hw = HARDWARE_CATALOG.find(h => h.id === config.model);
  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="text-center">
        <h2 className="text-xl font-orbitron font-bold text-foreground tracking-wide">
          Confirmação
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Revise as configurações antes de conectar</p>
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
            { label: "Host", value: config.host, icon: Globe },
            { label: "Porta", value: config.port || "22", icon: Terminal },
            { label: "Usuário", value: config.username, icon: User },
            { label: "Senha", value: "••••••••", icon: Lock },
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
          <div className="text-[9px] font-mono text-muted-foreground/40 mb-1">Comandos que serão executados:</div>
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
  transit: { gradient: "from-cyan-400 to-blue-500", solid: "#00e5ff", label: "Trânsito IP" },
  ix:      { gradient: "from-purple-400 to-fuchsia-500", solid: "#c050ff", label: "IX-BR / Peering" },
  cdn:     { gradient: "from-emerald-400 to-green-500", solid: "#00e676", label: "CDNs" },
  enterprise: { gradient: "from-amber-400 to-orange-500", solid: "#ffab40", label: "Enterprise" },
  unknown: { gradient: "from-gray-400 to-gray-500", solid: "#9e9e9e", label: "Outros" },
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
  timestamp: number | null;
  connected: boolean;
}

function useBgpRealtime(configId: string): BgpState & { refresh: () => void } {
  const [state, setState] = useState<BgpState>({
    stats: null, peers: [], flow_data: [], timestamp: null, connected: false,
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

function BgpDashboard({ config, onReconfigure }: { config: BgpConfig; onReconfigure: () => void }) {
  const hw = HARDWARE_CATALOG.find(h => h.id === config.model);
  const configId = `${config.host}:${config.port}`;
  const { stats, peers, flow_data, timestamp, connected, refresh } = useBgpRealtime(configId);
  const [viewMode, setViewMode] = useState<"bgp" | "flow">("bgp");
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
                {config.host}:{config.port} • Peering Analytics • Atualizado: {lastUpdate}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-muted/20 overflow-hidden">
            {(["bgp", "flow"] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 text-[10px] font-mono uppercase transition-all ${
                  viewMode === mode
                    ? "bg-cyan-500/15 text-cyan-400 border-cyan-400/20"
                    : "text-muted-foreground/50 hover:text-muted-foreground/80"
                }`}
              >
                {mode === "bgp" ? "Visão BGP" : "Visão Flow"}
              </button>
            ))}
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
              {connected ? "ONLINE" : "AGUARDANDO"}
            </span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-muted/20 p-6 min-h-[400px]"
          style={{ background: "linear-gradient(145deg, hsl(220 40% 8% / 0.95) 0%, hsl(225 35% 5% / 0.9) 100%)" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-mono text-sm text-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              {viewMode === "flow" ? "Traffic Flow — Sankey" : "BGP Peers Overview"}
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
                <p className="text-[11px] font-mono">Aguardando dados de peers...</p>
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
            { label: "BGP Sessions", value: stats ? `${stats.established_peers}/${stats.total_peers}` : "—", icon: Activity, color: "#00e5ff" },
            { label: "Prefixes Received", value: stats ? stats.prefixes_received.toLocaleString() : "—", icon: ArrowDownToLine, color: "#448aff" },
            { label: "Prefixes Sent", value: stats ? stats.prefixes_sent.toLocaleString() : "—", icon: ArrowUpFromLine, color: "#00e676" },
            { label: "Active ASNs", value: stats ? String(stats.active_asns) : "—", icon: Globe, color: "#c050ff" },
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
            ASN Peers — Enriquecimento LACNIC/Registro.br
          </h3>
          <div className="flex gap-2">
            {([
              { key: "all", label: "Todos" },
              { key: "top10", label: "Top 10 ASNs" },
              { key: "latency", label: "Maior Latência" },
              { key: "cost", label: "Custo por Mb" },
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
            Como enviar dados para o dashboard
          </h4>
          <div className="text-[11px] font-mono text-muted-foreground/70 space-y-2">
            <p>Execute no seu coletor local (servidor com acesso SSH aos roteadores):</p>
            <div className="p-3 rounded-lg bg-black/40 border border-muted/10 overflow-x-auto">
              <pre className="text-emerald-400/70 whitespace-pre">{`curl -X POST \\
  https://${import.meta.env.VITE_SUPABASE_PROJECT_ID || "<PROJECT_ID>"}.supabase.co/functions/v1/bgp-collector \\
  -H "apikey: <ANON_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "config_id": "${configId}",
    "host": "${config.host}",
    "vendor": "${config.vendor}",
    "model": "${config.model}",
    "peers": [
      { "asn": 15169, "ip": "10.0.0.1", "state": "Established", "prefixes_received": 1200, "bw_in_mbps": 450 },
      { "asn": 2906, "ip": "10.0.0.2", "state": "Established", "prefixes_received": 800, "bw_in_mbps": 1200 }
    ],
    "flow_data": [
      { "source_asn": 26599, "target_asn": 15169, "bw_mbps": 2500 },
      { "source_asn": 26599, "target_asn": 2906, "bw_mbps": 1800 }
    ]
  }'`}</pre>
            </div>
            <p className="text-muted-foreground/40 mt-2">
              💡 O {config.vendor === "huawei" ? '"display bgp peer"' : '"show bgp summary"'} pode ser parseado com um script Python/Bash e enviado como JSON.
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
  const [config, setConfig] = useState<Partial<BgpConfig>>(() => loadConfig() || {});
  const [step, setStep] = useState(1);
  const [showDashboard, setShowDashboard] = useState(() => !!loadConfig());

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

  if (showDashboard) {
    const fullConfig = loadConfig();
    if (fullConfig) {
      return <BgpDashboard config={fullConfig} onReconfigure={handleReconfigure} />;
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
            <ChevronLeft className="w-4 h-4" /> Voltar
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
              Avançar <ChevronRight className="w-4 h-4" />
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
              <CheckCircle className="w-4 h-4" /> Conectar & Monitorar
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
