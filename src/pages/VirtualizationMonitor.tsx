import { useState, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, Settings2, Server, Cpu, MemoryStick, HardDrive, Network,
  Activity, Zap, MonitorCheck, Box, ArrowDownToLine, ArrowUpFromLine, Clock,
} from "lucide-react";
import { useIdracLive } from "@/hooks/useIdracLive";
import { extractVirtData } from "@/hooks/useVirtExtractors";
import type { VirtData, VirtDatastore } from "@/hooks/useVirtExtractors";
import IdracSetupWizard, { type IdracConfig } from "@/components/dashboard/IdracSetupWizard";
import VMCard from "@/components/virtualization/VMCard";

/* ─── Local storage (separate from Server Monitor) ── */

const STORAGE_KEY = "flowpulse_virt_config";

function loadConfig(): IdracConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveConfig(config: IdracConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function clearConfig() {
  localStorage.removeItem(STORAGE_KEY);
}

/* ─── Resource Ring (SVG circular gauge) ──────────── */

function ResourceRing({
  label, value, max, unit, icon: Icon, color, glowColor, subtitle,
}: {
  label: string; value: number; max: number; unit: string;
  icon: React.ElementType; color: string; glowColor: string; subtitle?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const R = 38;
  const STROKE = 5;
  const C = Math.PI * 2 * R;
  const offset = C - (pct / 100) * C;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke="hsl(var(--muted) / 0.25)" strokeWidth={STROKE} />
          <motion.circle
            cx="50" cy="50" r={R} fill="none"
            stroke={color} strokeWidth={STROKE} strokeLinecap="round"
            strokeDasharray={C}
            initial={{ strokeDashoffset: C }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            style={{ filter: `drop-shadow(0 0 6px ${glowColor})` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold font-mono-data" style={{ color, textShadow: `0 0 10px ${glowColor}` }}>
            {pct.toFixed(1)}
          </span>
          <span className="text-[8px] font-mono text-muted-foreground">{unit}</span>
        </div>
      </div>
      <div className="text-center">
        <div className="flex items-center gap-1 justify-center">
          <Icon className="w-3 h-3" style={{ color }} />
          <span className="text-[10px] font-display uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
        {subtitle && <span className="text-[8px] font-mono text-muted-foreground/60">{subtitle}</span>}
      </div>
    </div>
  );
}

/* ─── Storage Bar ─────────────────────── */

function formatBytesHuman(s: string): string {
  if (!s) return "—";
  // Try matching already-formatted values like "4.36 TB"
  const fm = s.match(/([\d.]+)\s*(B|KB|KiB|MB|MiB|GB|GiB|TB|TiB)/i);
  if (fm) return s; // already human-readable
  // Raw number (bytes)
  const num = parseFloat(s);
  if (isNaN(num)) return s;
  if (num >= 1e12) return `${(num / (1024 ** 4)).toFixed(2)} TB`;
  if (num >= 1e9) return `${(num / (1024 ** 3)).toFixed(2)} GB`;
  if (num >= 1e6) return `${(num / (1024 ** 2)).toFixed(2)} MB`;
  if (num >= 1e3) return `${(num / 1024).toFixed(2)} KB`;
  return `${num} B`;
}

function parseSizeToBytes(s: string): number {
  if (!s) return 0;
  const m = s.match(/([\d.]+)\s*(B|KB|KiB|MB|MiB|GB|GiB|TB|TiB)?/i);
  if (!m) return 0;
  const num = parseFloat(m[1]);
  const unit = (m[2] || "B").toUpperCase();
  const mul: Record<string, number> = {
    B: 1, KB: 1024, KIB: 1024, MB: 1024 ** 2, MIB: 1024 ** 2,
    GB: 1024 ** 3, GIB: 1024 ** 3, TB: 1024 ** 4, TIB: 1024 ** 4,
  };
  return num * (mul[unit] || 1);
}

function StorageBar({ ds, index }: { ds: VirtDatastore; index: number }) {
  let usedPct = 0;
  if (ds.freePercent !== undefined && ds.freePercent > 0) {
    usedPct = 100 - ds.freePercent;
  } else if (ds.usedSize && ds.totalSize) {
    const used = parseSizeToBytes(ds.usedSize);
    const total = parseSizeToBytes(ds.totalSize);
    usedPct = total > 0 ? (used / total) * 100 : 0;
  }

  const usedHuman = formatBytesHuman(ds.usedSize || "");
  const totalHuman = formatBytesHuman(ds.totalSize || "");

  const barColor = usedPct > 85
    ? "hsl(0, 90%, 50%)"
    : usedPct > 65
      ? "hsl(43, 100%, 50%)"
      : "hsl(186, 100%, 50%)";

  const glowColor = usedPct > 85
    ? "hsl(0 90% 50% / 0.25)"
    : usedPct > 65
      ? "hsl(43 100% 50% / 0.2)"
      : "hsl(186 100% 50% / 0.15)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className="rounded-xl border border-border/30 p-4 relative overflow-hidden"
      style={{
        background: `linear-gradient(145deg, hsl(220 35% 8% / 0.95), hsl(225 30% 5% / 0.9))`,
        boxShadow: `0 0 20px ${glowColor}, inset 0 1px 0 hsl(0 0% 100% / 0.03)`,
      }}
    >
      {/* Top row: name + type */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4" style={{ color: barColor }} />
          <span className="text-sm font-display font-black text-foreground uppercase tracking-wide">{ds.name}</span>
        </div>
        {ds.type && (
          <span className="text-[9px] font-mono px-2 py-1 rounded-md uppercase tracking-wider font-bold"
            style={{ background: `${barColor}15`, color: barColor, border: `1px solid ${barColor}30` }}
          >
            {ds.type}
          </span>
        )}
      </div>

      {/* Main row: big percentage + size info */}
      <div className="flex items-end justify-between mb-3">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-mono-data font-black leading-none" style={{ color: barColor, textShadow: `0 0 20px ${glowColor}` }}>
            {usedPct.toFixed(1)}
          </span>
          <span className="text-lg font-mono-data font-bold" style={{ color: barColor, opacity: 0.7 }}>%</span>
        </div>
        <div className="text-right">
          <div className="text-sm font-mono-data font-bold text-foreground">
            {ds.usedSize ? usedHuman : `${(100 - (ds.freePercent || 0)).toFixed(0)}% used`}
          </div>
          <div className="text-xs font-mono text-muted-foreground/60">
            de {totalHuman}
          </div>
        </div>
      </div>

      {/* Thick progress bar */}
      <div className="h-4 rounded-full overflow-hidden relative" style={{ background: "hsl(220 30% 10% / 0.8)" }}>
        <motion.div
          className="h-full rounded-full relative"
          initial={{ width: 0 }}
          animate={{ width: `${usedPct}%` }}
          transition={{ duration: 1, ease: "easeOut", delay: index * 0.08 }}
          style={{
            background: `linear-gradient(90deg, ${barColor}90, ${barColor})`,
            boxShadow: `0 0 12px ${barColor}60, inset 0 1px 0 hsl(0 0% 100% / 0.2)`,
          }}
        />
        {/* Glow overlay on bar */}
        <div className="absolute inset-0 rounded-full" style={{ background: `linear-gradient(180deg, hsl(0 0% 100% / 0.08), transparent)` }} />
      </div>
    </motion.div>
  );
}

/* ─── Formatting helpers ──────────────── */

function formatUptimeHuman(raw: string): string {
  if (!raw) return "—";
  if (/\d+\s*(dias?|days?)/i.test(raw)) return raw;
  const secs = parseInt(raw);
  if (isNaN(secs)) return raw;
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (days > 0) return `${days} dias, ${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  return `${hours}h ${mins}m`;
}

function formatToMbps(raw: string): string {
  if (!raw) return "—";
  // Already formatted like "22.51 Mbps"
  const fmtMatch = raw.match(/([\d.]+)\s*(bps|Kbps|Mbps|Gbps|KBps|MBps|GBps|Bps)/i);
  if (fmtMatch) {
    const val = parseFloat(fmtMatch[1]);
    const unit = fmtMatch[2];
    let bps = val;
    if (/^Bps$/i.test(unit)) bps = val * 8;
    else if (/^KBps$/i.test(unit)) bps = val * 8 * 1000;
    else if (/^MBps$/i.test(unit)) bps = val * 8 * 1e6;
    else if (/^GBps$/i.test(unit)) bps = val * 8 * 1e9;
    else if (/^bps$/i.test(unit)) bps = val;
    else if (/^Kbps$/i.test(unit)) bps = val * 1000;
    else if (/^Mbps$/i.test(unit)) bps = val * 1e6;
    else if (/^Gbps$/i.test(unit)) bps = val * 1e9;
    const mbps = bps / 1e6;
    if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
    if (mbps >= 1) return `${mbps.toFixed(2)} Mbps`;
    return `${(bps / 1000).toFixed(2)} Kbps`;
  }
  // Raw number (assume bytes/s from Zabbix)
  const num = parseFloat(raw);
  if (isNaN(num)) return raw;
  const bps = num * 8;
  const mbps = bps / 1e6;
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
  if (mbps >= 1) return `${mbps.toFixed(2)} Mbps`;
  if (bps >= 1000) return `${(bps / 1000).toFixed(2)} Kbps`;
  return `${bps.toFixed(0)} bps`;
}

/* ─── Info Badge ──────────────────────── */

function InfoBadge({ label, value, icon: Icon, color }: {
  label: string; value: string; icon: React.ElementType; color?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/20"
      style={{ background: "hsl(220 40% 7% / 0.7)" }}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: color || "hsl(var(--muted-foreground))" }} />
      <div className="min-w-0">
        <div className="text-[8px] font-mono text-muted-foreground/60 uppercase">{label}</div>
        <div className="text-[10px] font-mono text-foreground truncate">{value}</div>
      </div>
    </div>
  );
}

/* ─── Status Pill ─────────────────────── */

function StatusPill({ label, value, isOk }: { label: string; value: string; isOk: boolean }) {
  const color = isOk ? "hsl(142, 100%, 50%)" : "hsl(0, 90%, 50%)";
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-2 px-4 py-3 rounded-lg border"
      style={{
        background: `linear-gradient(145deg, hsl(220 35% 8% / 0.9), hsl(225 30% 5% / 0.85))`,
        borderColor: `${color}30`,
        boxShadow: `0 0 12px ${color}10, inset 0 1px 0 ${color}08`,
      }}
    >
      <motion.span
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        animate={isOk ? { scale: [1, 1.2, 1] } : {}}
        transition={{ duration: 2, repeat: Infinity }}
        style={{
          background: color,
          boxShadow: `0 0 8px ${color}, 0 0 16px ${color}60`,
        }}
      />
      <div>
        <div className="text-[8px] font-mono text-muted-foreground/60 uppercase tracking-wider">{label}</div>
        <div className="text-xs font-display font-bold" style={{ color }}>{value || "—"}</div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════ */

export default function VirtualizationMonitor() {
  const [config, setConfig] = useState<IdracConfig | null>(loadConfig);
  const [showSetup, setShowSetup] = useState(!config);
  const { data, dataLoading, lastRefresh, refresh, error, fetchItems } = useIdracLive();

  useEffect(() => {
    if (config && !data && !dataLoading) {
      fetchItems(config.connectionId, config.hostId);
    }
  }, [config, data, dataLoading, fetchItems]);

  const handleConfigComplete = useCallback((cfg: IdracConfig) => {
    saveConfig(cfg);
    setConfig(cfg);
    setShowSetup(false);
    fetchItems(cfg.connectionId, cfg.hostId);
  }, [fetchItems]);

  const handleReconfigure = () => {
    clearConfig();
    setConfig(null);
    setShowSetup(true);
  };

  const virt = useMemo(() => (data ? extractVirtData(data) : null), [data]);

  if (showSetup) {
    return <IdracSetupWizard onComplete={handleConfigComplete} existingConfig={config} />;
  }

  const isVMware = virt?.type === "vmware";
  const isProxmox = virt?.type === "proxmox";
  const accentColor = isVMware ? "hsl(186, 100%, 50%)" : "hsl(210, 100%, 56%)";
  const accentGlow = isVMware ? "hsl(186 100% 50% / 0.15)" : "hsl(210 100% 56% / 0.15)";

  const isOverallOk = virt?.host.overallStatus
    ? /green|online|ok|up|running|1/i.test(virt.host.overallStatus)
    : false;

  const isPingOk = virt?.host.ping
    ? /ok|up|200|1/i.test(virt.host.ping)
    : false;

  return (
    <div className="min-h-screen bg-background grid-pattern scanlines relative p-4 md:p-6 lg:p-8">
      {/* Ambient glow */}
      <div className="fixed top-0 left-1/3 w-[500px] h-[300px] rounded-full blur-[120px] pointer-events-none"
        style={{ background: accentGlow }}
      />
      <div className="fixed bottom-0 right-1/4 w-[400px] h-[300px] rounded-full blur-[100px] pointer-events-none"
        style={{ background: "hsl(265 80% 50% / 0.05)" }}
      />

      <div className="max-w-[1600px] mx-auto relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-6"
        >
          <div className="flex items-center gap-4">
            <div className="relative">
              <Box className="w-8 h-8" style={{ color: accentColor }} />
              <motion.div
                className="absolute inset-0 rounded-full"
                animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 3, repeat: Infinity }}
                style={{ background: accentColor, filter: "blur(8px)" }}
              />
            </div>
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-black tracking-wider leading-tight">
                <span style={{ color: accentColor, textShadow: `0 0 20px ${accentColor}60` }}>
                  {config?.hostName || "HOST"}
                </span>
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">
                  {virt?.type === "vmware" ? "VMware ESXi" : virt?.type === "proxmox" ? "Proxmox VE" : "Virtualization"}
                </span>
                {virt?.host.version && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground/50">
                    v{virt.host.version}
                  </span>
                )}
                {lastRefresh && (
                  <span className="text-[9px] font-mono text-muted-foreground/40">
                    • {lastRefresh.toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data && (
              <button onClick={refresh} className="text-[9px] font-mono text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border/20 hover:border-border/40">
                ↻ Refresh
              </button>
            )}
            <button onClick={handleReconfigure} className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground/50 hover:text-muted-foreground transition-colors">
              <Settings2 className="w-3 h-3" /> Reconfigurar
            </button>
          </div>
        </motion.div>

        {/* Loading */}
        {dataLoading && !data && (
          <div className="glass-card rounded-xl p-16 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: accentColor }} />
            <p className="text-sm text-muted-foreground font-mono">Carregando dados do host...</p>
          </div>
        )}

        {/* Error */}
        {error && !data && (
          <div className="glass-card rounded-xl p-8 text-center">
            <p className="text-sm text-neon-red font-mono mb-2">Erro ao carregar dados</p>
            <p className="text-[10px] text-muted-foreground font-mono">{error}</p>
            <button onClick={() => config && fetchItems(config.connectionId, config.hostId)}
              className="mt-3 text-[10px] hover:underline font-mono" style={{ color: accentColor }}>
              Tentar novamente
            </button>
          </div>
        )}

        {/* Not virtualization host */}
        {data && !virt && (
          <div className="glass-card rounded-xl p-8 text-center">
            <Server className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-mono">
              Este host não parece ser VMware ESXi ou Proxmox VE.
            </p>
            <p className="text-[10px] text-muted-foreground/50 font-mono mt-1">
              Tipo detectado: {data.hostType}
            </p>
          </div>
        )}

        {/* Dashboard */}
        {virt && (
          <AnimatePresence>
            <div className="space-y-5">
              {/* ── Status Row ── */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatusPill
                  label={isVMware ? "Overall Status" : "Node Status"}
                  value={virt.host.overallStatus}
                  isOk={isOverallOk}
                />
                <StatusPill
                  label={isVMware ? "Hypervisor Ping" : "API Status"}
                  value={virt.host.ping}
                  isOk={isPingOk}
                />
                <StatusPill
                  label="VMs"
                  value={isProxmox
                    ? `${virt.runningCount} running / ${virt.vmCount} total`
                    : `${virt.vmCount} guest VMs`
                  }
                  isOk={virt.runningCount > 0 || virt.vmCount > 0}
                />
                {virt.powerUsage ? (
                  <StatusPill label="Power" value={virt.powerUsage} isOk={true} />
                ) : (
                  <StatusPill
                    label="Uptime"
                     value={formatUptimeHuman(virt.host.uptime)}
                    isOk={!!virt.host.uptime}
                  />
                )}
              </div>

              {/* ── Resource Gauges ── */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-card rounded-xl p-6 border border-border/30"
              >
                <div className="flex items-center gap-2 mb-5">
                  <Activity className="w-4 h-4" style={{ color: accentColor }} />
                  <span className="text-xs font-display font-bold uppercase tracking-wider text-foreground">Recursos do Host</span>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
                  <ResourceRing
                    label="CPU" value={virt.cpu.usagePercent} max={100} unit="%"
                    icon={Cpu}
                    color={virt.cpu.usagePercent > 80 ? "hsl(0,90%,50%)" : virt.cpu.usagePercent > 50 ? "hsl(43,100%,50%)" : accentColor}
                    glowColor={accentColor + "80"}
                    subtitle={virt.cpu.cores ? `${virt.cpu.cores}C / ${virt.cpu.threads}T` : undefined}
                  />
                  <ResourceRing
                    label="Memória" value={virt.memory.usedPercent} max={100} unit="%"
                    icon={MemoryStick}
                    color={virt.memory.usedPercent > 85 ? "hsl(0,90%,50%)" : virt.memory.usedPercent > 60 ? "hsl(43,100%,50%)" : "hsl(210,100%,56%)"}
                    glowColor="hsl(210 100% 56% / 0.5)"
                    subtitle={`${virt.memory.used} / ${virt.memory.total}`}
                  />
                  {/* Network */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-24 h-24 flex flex-col items-center justify-center rounded-full border border-border/20"
                      style={{ background: "hsl(220 40% 7% / 0.5)" }}
                    >
                      <Network className="w-5 h-5 mb-1" style={{ color: "hsl(142, 100%, 50%)" }} />
                      <div className="text-center">
                        <div className="flex items-center gap-0.5">
                          <ArrowDownToLine className="w-2 h-2 text-neon-green/70" />
                          <span className="text-[8px] font-mono-data text-neon-green">{formatToMbps(virt.network.bytesIn)}</span>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <ArrowUpFromLine className="w-2 h-2 text-neon-blue/70" />
                          <span className="text-[8px] font-mono-data text-neon-blue">{formatToMbps(virt.network.bytesOut)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center gap-1 justify-center">
                        <Network className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[10px] font-display uppercase tracking-wider text-muted-foreground">Rede</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Extra info row */}
                {(virt.cpu.model || virt.cpu.frequency || virt.memory.ballooned) && (
                  <div className="mt-4 pt-3 border-t border-border/15 flex flex-wrap gap-3 justify-center">
                    {virt.cpu.model && (
                      <span className="text-[8px] font-mono text-muted-foreground/50 truncate max-w-xs">{virt.cpu.model}</span>
                    )}
                    {virt.cpu.frequency && (
                      <span className="text-[8px] font-mono text-muted-foreground/50">{virt.cpu.frequency}</span>
                    )}
                    {virt.memory.ballooned && virt.memory.ballooned !== "0 B" && (
                      <span className="text-[8px] font-mono text-neon-amber/60">Ballooned: {virt.memory.ballooned}</span>
                    )}
                    {virt.cpu.iowait !== undefined && virt.cpu.iowait > 0 && (
                      <span className="text-[8px] font-mono text-neon-amber/60">IOWait: {virt.cpu.iowait.toFixed(2)}%</span>
                    )}
                  </div>
                )}
              </motion.div>

              {/* ── Storage / Datastores ── */}
              {virt.datastores.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="glass-card rounded-xl p-5 border border-border/30"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <HardDrive className="w-4 h-4" style={{ color: accentColor }} />
                    <span className="text-xs font-display font-bold uppercase tracking-wider text-foreground">
                      {isVMware ? "Datastores" : "Storage Pools"}
                    </span>
                    <span className="text-[9px] font-mono text-muted-foreground/40 ml-auto">
                      {virt.datastores.length} {isVMware ? "datastores" : "pools"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {virt.datastores.map((ds, i) => (
                      <StorageBar key={ds.name} ds={ds} index={i} />
                    ))}
                  </div>
                </motion.div>
              )}

              {/* ── Network Adapters ── */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="glass-card rounded-xl p-5 border border-border/30"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Network className="w-4 h-4" style={{ color: accentColor }} />
                  <span className="text-xs font-display font-bold uppercase tracking-wider text-foreground">
                    Adaptadores de Rede
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Download */}
                  <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border/20"
                    style={{ background: "hsl(220 40% 7% / 0.7)" }}
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ background: "hsl(142 100% 50% / 0.1)", border: "1px solid hsl(142 100% 50% / 0.2)" }}
                    >
                      <ArrowDownToLine className="w-5 h-5" style={{ color: "hsl(142, 100%, 50%)" }} />
                    </div>
                    <div>
                      <div className="text-[8px] font-mono text-muted-foreground/60 uppercase tracking-wider">Incoming (RX)</div>
                      <div className="text-lg font-mono-data font-bold" style={{ color: "hsl(142, 100%, 50%)", textShadow: "0 0 10px hsl(142 100% 50% / 0.3)" }}>
                        {formatToMbps(virt.network.bytesIn)}
                      </div>
                    </div>
                  </div>
                  {/* Upload */}
                  <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border/20"
                    style={{ background: "hsl(220 40% 7% / 0.7)" }}
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ background: "hsl(210 100% 56% / 0.1)", border: "1px solid hsl(210 100% 56% / 0.2)" }}
                    >
                      <ArrowUpFromLine className="w-5 h-5" style={{ color: "hsl(210, 100%, 56%)" }} />
                    </div>
                    <div>
                      <div className="text-[8px] font-mono text-muted-foreground/60 uppercase tracking-wider">Outgoing (TX)</div>
                      <div className="text-lg font-mono-data font-bold" style={{ color: "hsl(210, 100%, 56%)", textShadow: "0 0 10px hsl(210 100% 56% / 0.3)" }}>
                        {formatToMbps(virt.network.bytesOut)}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>


              {/* ── Host Info Footer ── */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="glass-card rounded-xl p-5 border border-border/30"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Server className="w-4 h-4" style={{ color: accentColor }} />
                  <span className="text-xs font-display font-bold uppercase tracking-wider text-foreground">
                    Informações do Host
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  <InfoBadge label="Versão" value={virt.host.fullName || virt.host.version} icon={Box} color={accentColor} />
                  {virt.host.model && <InfoBadge label="Modelo" value={virt.host.model} icon={Server} />}
                  {virt.host.vendor && <InfoBadge label="Fabricante" value={virt.host.vendor} icon={Server} />}
                  <InfoBadge label="Uptime" value={formatUptimeHuman(virt.host.uptime)} icon={Clock} color="hsl(142,100%,50%)" />
                  {virt.host.datacenter && <InfoBadge label="Datacenter" value={virt.host.datacenter} icon={Box} />}
                  {virt.host.nodeName && <InfoBadge label="Node" value={virt.host.nodeName} icon={Server} color={accentColor} />}
                  {virt.host.pveVersion && <InfoBadge label="PVE Version" value={virt.host.pveVersion} icon={Box} />}
                  {virt.host.kernelVersion && <InfoBadge label="Kernel" value={virt.host.kernelVersion} icon={Cpu} />}
                  {virt.host.timezone && <InfoBadge label="Timezone" value={virt.host.timezone} icon={Clock} />}
                  {virt.powerUsage && <InfoBadge label="Power" value={virt.powerUsage} icon={Zap} color="hsl(43,100%,50%)" />}
                </div>
              </motion.div>

              {/* Footer */}
              <div className="text-center py-3">
                <p className="text-[9px] font-mono text-muted-foreground/40">
                  FLOWPULSE | {config?.hostName} • {virt.type.toUpperCase()} • Refresh: 2min
                </p>
              </div>
            </div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
