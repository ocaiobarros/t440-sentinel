import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Server, Terminal, CheckCircle, ChevronRight, ChevronLeft,
  Settings2, Network, Globe, ArrowDownToLine, ArrowUpFromLine,
  BarChart3, Filter, Activity, Eye, EyeOff, Lock, User,
} from "lucide-react";
import { Icon } from "@iconify/react";

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

/* ─── Mock Dashboard (placeholder for Phase 2) ── */

function BgpDashboard({ config, onReconfigure }: { config: BgpConfig; onReconfigure: () => void }) {
  const hw = HARDWARE_CATALOG.find(h => h.id === config.model);

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
                {config.host}:{config.port} • Peering Analytics
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-mono text-emerald-400">ONLINE</span>
          </div>
        </div>
      </div>

      {/* Placeholder content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sankey placeholder */}
        <div className="lg:col-span-2 rounded-xl border border-muted/20 p-6 min-h-[400px] flex flex-col items-center justify-center gap-4"
          style={{ background: "linear-gradient(145deg, hsl(220 40% 8% / 0.95) 0%, hsl(225 35% 5% / 0.9) 100%)" }}>
          <BarChart3 className="w-12 h-12 text-cyan-400/30" />
          <div className="text-center">
            <h3 className="font-mono text-sm text-muted-foreground/60">Sankey Flow Chart</h3>
            <p className="text-[10px] text-muted-foreground/40 mt-1">
              Fase 2 — Gráfico de fluxo de tráfego BGP com enriquecimento ASN
            </p>
          </div>
          <div className="flex gap-3 mt-2">
            {[
              { label: "Trânsito IP", color: "#00e5ff" },
              { label: "IX-BR / Peering", color: "#c050ff" },
              { label: "CDNs", color: "#00e676" },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-3 h-1.5 rounded-full" style={{ background: color }} />
                <span className="text-[9px] font-mono text-muted-foreground/50">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats panel */}
        <div className="space-y-4">
          {[
            { label: "BGP Sessions", value: "—", icon: Activity, color: "#00e5ff" },
            { label: "Prefixes Received", value: "—", icon: ArrowDownToLine, color: "#448aff" },
            { label: "Prefixes Sent", value: "—", icon: ArrowUpFromLine, color: "#00e676" },
            { label: "Active ASNs", value: "—", icon: Globe, color: "#c050ff" },
          ].map(({ label, value, icon: Ic, color }) => (
            <div key={label} className="rounded-xl border border-muted/20 p-4 flex items-center gap-3"
              style={{ background: "linear-gradient(145deg, hsl(220 40% 8% / 0.95) 0%, hsl(225 35% 5% / 0.9) 100%)" }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
                <Ic className="w-4.5 h-4.5" style={{ color }} />
              </div>
              <div>
                <div className="text-[9px] font-mono text-muted-foreground/50 uppercase">{label}</div>
                <div className="text-lg font-mono font-bold text-foreground">{value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ASN Table placeholder */}
      <div className="mt-6 rounded-xl border border-muted/20 p-6"
        style={{ background: "linear-gradient(145deg, hsl(220 40% 8% / 0.95) 0%, hsl(225 35% 5% / 0.9) 100%)" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-mono text-sm text-foreground flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-400" />
            ASN Peers — Enriquecimento LACNIC/Registro.br
          </h3>
          <div className="flex gap-2">
            {["Top 10 ASNs", "Maior Latência", "Custo por Mb"].map(f => (
              <button key={f} className="px-3 py-1.5 rounded-lg text-[10px] font-mono border border-muted/20 text-muted-foreground/50 hover:border-muted/40 hover:text-muted-foreground/80 transition-all">
                <Filter className="w-3 h-3 inline mr-1" />
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="text-center py-8">
          <Server className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-[11px] font-mono text-muted-foreground/40">
            Fase 2 — Tabela de ASNs com nome da empresa, país (bandeira) e fluxo em tempo real
          </p>
        </div>
      </div>

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
