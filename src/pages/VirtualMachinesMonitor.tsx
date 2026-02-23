import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, Settings2, Server, Cpu, MemoryStick, HardDrive, Network,
  Activity, Box, ArrowDownToLine, ArrowUpFromLine, Clock, Search,
  Filter, MonitorCheck, Power, Gauge, ArrowLeft, Save,
} from "lucide-react";
import { useDashboardPersist } from "@/hooks/useDashboardPersist";
import { useIdracLive } from "@/hooks/useIdracLive";
import { extractVirtData } from "@/hooks/useVirtExtractors";
import type { VirtData, VirtVM } from "@/hooks/useVirtExtractors";
import IdracSetupWizard, { type IdracConfig } from "@/components/dashboard/IdracSetupWizard";

/* ─── Local storage ── */

const STORAGE_KEY = "flowpulse_vms_config";

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

/* ─── Helpers ── */

function formatUptime(raw: string): string {
  if (!raw) return "—";
  const m = raw.match(/(\d+)\s*(?:dias?|days?)/i);
  if (m) {
    const hm = raw.match(/(\d+):(\d+)/);
    return hm ? `${m[1]}d ${hm[1]}h` : `${m[1]}d`;
  }
  const secs = parseInt(raw);
  if (!isNaN(secs)) {
    const days = Math.floor(secs / 86400);
    const hours = Math.floor((secs % 86400) / 3600);
    return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
  }
  return raw.length > 16 ? raw.slice(0, 16) : raw;
}

function formatBytes(raw: string): string {
  if (!raw) return "—";
  // Already formatted (e.g. "4.00 GB")
  const fmtMatch = raw.match(/([\d.]+)\s*(KB|MB|GB|TB|KiB|MiB|GiB|TiB)/i);
  if (fmtMatch) {
    const num = parseFloat(fmtMatch[1]);
    const unit = fmtMatch[2].toUpperCase().replace("I", "");
    const toBytes: Record<string, number> = { KB: 1e3, KIB: 1024, MB: 1e6, MIB: 1024 ** 2, GB: 1e9, GIB: 1024 ** 3, TB: 1e12, TIB: 1024 ** 4, B: 1 };
    const bytes = num * (toBytes[unit] || 1);
    if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(2)} TB`;
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  // Raw number (assume bytes)
  const num = parseFloat(raw);
  if (isNaN(num)) return raw;
  if (num >= 1024 ** 4) return `${(num / 1024 ** 4).toFixed(2)} TB`;
  if (num >= 1024 ** 3) return `${(num / 1024 ** 3).toFixed(2)} GB`;
  if (num >= 1024 ** 2) return `${(num / 1024 ** 2).toFixed(1)} MB`;
  if (num >= 1024) return `${(num / 1024).toFixed(0)} KB`;
  return `${num.toFixed(0)} B`;
}

function formatHz(raw: string): string {
  if (!raw) return "—";
  const fmtMatch = raw.match(/([\d.]+)\s*(Hz|KHz|MHz|GHz)/i);
  if (fmtMatch) {
    const num = parseFloat(fmtMatch[1]);
    const unit = fmtMatch[2].toLowerCase();
    const toHz: Record<string, number> = { hz: 1, khz: 1e3, mhz: 1e6, ghz: 1e9 };
    const hz = num * (toHz[unit] || 1);
    if (hz >= 1e9) return `${(hz / 1e9).toFixed(2)} GHz`;
    if (hz >= 1e6) return `${(hz / 1e6).toFixed(0)} MHz`;
    return `${(hz / 1e3).toFixed(0)} KHz`;
  }
  const num = parseFloat(raw);
  if (isNaN(num)) return raw;
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)} GHz`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(0)} MHz`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(0)} KHz`;
  return `${num.toFixed(0)} Hz`;
}

function formatRate(raw: string): string {
  if (!raw) return "—";
  const fmtMatch = raw.match(/([\d.]+)\s*(bps|Kbps|Mbps|Gbps|KBps|MBps|GBps|Bps|B\/s|KB\/s|MB\/s)/i);
  if (fmtMatch) return raw;
  const num = parseFloat(raw);
  if (isNaN(num)) return raw;
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)} GB/s`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)} MB/s`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)} KB/s`;
  return `${num.toFixed(0)} B/s`;
}

type SortKey = "name" | "cpu" | "mem" | "status";
type FilterStatus = "all" | "running" | "stopped" | "other";

/* ─── Mini Bar ── */

function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2 rounded-full w-full" style={{ background: "hsl(220 30% 12% / 0.9)" }}>
      <motion.div
        className="h-full rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(value, 100)}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{
          background: `linear-gradient(90deg, ${color}cc, ${color})`,
          boxShadow: `0 0 8px ${color}80`,
        }}
      />
    </div>
  );
}

/* ─── VM Detail Card (TV-optimized) ── */

function VMDetailCard({ vm, index, hostCpuFreqHz }: { vm: VirtVM; index: number; hostCpuFreqHz?: number }) {
  const isRunning = vm.status === "running";
  const isStopped = vm.status === "stopped";

  const statusColor = isRunning ? "#00e676" : isStopped ? "#e02020" : "#f5a623";
  const statusLabel = isRunning ? "RUNNING" : isStopped ? "STOPPED" : (vm.status || "UNKNOWN").toUpperCase();

  const cpuColor = vm.cpuUsage > 85 ? "#e02020" : vm.cpuUsage > 60 ? "#f5a623" : "#00e5ff";
  const memColor = vm.memPercent > 85 ? "#e02020" : vm.memPercent > 60 ? "#f5a623" : "#448aff";

  // Compute CPU in MHz: use cpuUsageHz if available, else estimate from host frequency
  const cpuMhzDisplay = useMemo(() => {
    // Debug: log what we have
    console.log(`[VM ${vm.name}] cpuUsageHz="${vm.cpuUsageHz}", cpuUsage=${vm.cpuUsage}, hostCpuFreqHz=${hostCpuFreqHz}`);
    
    if (vm.cpuUsageHz) return formatHz(vm.cpuUsageHz);
    // Estimate from host CPU frequency × usage%
    if (hostCpuFreqHz && hostCpuFreqHz > 0) {
      const estimatedHz = (vm.cpuUsage / 100) * hostCpuFreqHz;
      return formatHz(String(estimatedHz));
    }
    // Last resort: if we have vCpus and a typical 2.4GHz frequency, estimate
    const vCpuCount = parseInt(vm.vCpus || "0", 10);
    if (vCpuCount > 0) {
      const estimatedHz = (vm.cpuUsage / 100) * vCpuCount * 2.4e9;
      return formatHz(String(estimatedHz));
    }
    return null;
  }, [vm.cpuUsageHz, vm.cpuUsage, hostCpuFreqHz, vm.vCpus, vm.name]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, delay: index * 0.025 }}
      className="group relative rounded-xl border overflow-hidden transition-all duration-300 hover:scale-[1.01]"
      style={{
        background: "linear-gradient(145deg, hsl(220 40% 8% / 0.95) 0%, hsl(225 35% 5% / 0.9) 100%)",
        borderColor: isRunning ? `${statusColor}30` : isStopped ? `${statusColor}40` : `${statusColor}30`,
        boxShadow: isRunning
          ? `0 0 16px ${statusColor}10, inset 0 1px 0 ${statusColor}08`
          : isStopped
            ? `0 0 12px ${statusColor}15`
            : "none",
      }}
    >
      {/* Top glow */}
      <div className="absolute top-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent 0%, ${statusColor}50 50%, transparent 100%)` }}
      />

      <div className="p-4 space-y-3">
        {/* Header: Status + Name + Type */}
        <div className="flex items-center gap-3">
          <motion.span
            className="w-3 h-3 rounded-full flex-shrink-0"
            animate={isRunning ? { scale: [1, 1.2, 1] } : {}}
            transition={isRunning ? { duration: 2, repeat: Infinity } : {}}
            style={{
              background: statusColor,
              boxShadow: `0 0 8px ${statusColor}, 0 0 16px ${statusColor}60`,
            }}
          />
          <span className="text-sm font-display font-black text-foreground truncate flex-1">
            {vm.name}
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {vm.type && (
              <span className="text-[9px] font-mono px-2 py-0.5 rounded-md uppercase tracking-wider font-bold"
                style={{ background: `${statusColor}12`, color: statusColor, border: `1px solid ${statusColor}25` }}>
                {vm.type}
              </span>
            )}
            <span className="text-[9px] font-mono px-2 py-0.5 rounded-md uppercase tracking-wider font-bold"
              style={{ background: `${statusColor}12`, color: statusColor, border: `1px solid ${statusColor}25` }}>
              {statusLabel}
            </span>
          </div>
        </div>

        {/* CPU + Memory row */}
        <div className="grid grid-cols-2 gap-3">
          {/* CPU */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" style={{ color: cpuColor }} />
                <span className="text-[10px] font-mono text-muted-foreground uppercase">CPU</span>
              </div>
              <span className="text-lg font-mono-data font-black" style={{ color: cpuColor, textShadow: `0 0 10px ${cpuColor}60` }}>
                {vm.cpuUsage.toFixed(1)}%
              </span>
            </div>
            <MiniBar value={vm.cpuUsage} color={cpuColor} />
            {cpuMhzDisplay && (
              <div className="text-[10px] font-mono text-muted-foreground/60 text-center">
                {cpuMhzDisplay}
              </div>
            )}
          </div>

          {/* Memory */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <MemoryStick className="w-3.5 h-3.5" style={{ color: memColor }} />
                <span className="text-[10px] font-mono text-muted-foreground uppercase">MEM</span>
              </div>
              <span className="text-lg font-mono-data font-black" style={{ color: memColor, textShadow: `0 0 10px ${memColor}60` }}>
                {vm.memPercent.toFixed(1)}%
              </span>
            </div>
            <MiniBar value={vm.memPercent} color={memColor} />
            <div className="text-[10px] font-mono text-muted-foreground/60 text-center">
              {formatBytes(vm.memUsed)} / {formatBytes(vm.memTotal)}
            </div>
          </div>
        </div>

        {/* Bottom row: Network + Disk + Uptime */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/15">
          {/* Network */}
          <div className="text-center">
            <Network className="w-3 h-3 mx-auto mb-1 text-muted-foreground/40" />
            <div className="text-[9px] font-mono text-muted-foreground/50 uppercase mb-0.5">Network</div>
            <div className="text-[10px] font-mono">
              <span className="text-neon-green/80">↓{formatRate(vm.netIn)}</span>
            </div>
            <div className="text-[10px] font-mono">
              <span className="text-neon-blue/80">↑{formatRate(vm.netOut)}</span>
            </div>
          </div>

          {/* Disk IO */}
          <div className="text-center">
            <HardDrive className="w-3 h-3 mx-auto mb-1 text-muted-foreground/40" />
            <div className="text-[9px] font-mono text-muted-foreground/50 uppercase mb-0.5">Disk I/O</div>
            <div className="text-[10px] font-mono">
              <span className="text-neon-green/80">R:{formatRate(vm.diskRead)}</span>
            </div>
            <div className="text-[10px] font-mono">
              <span className="text-neon-blue/80">W:{formatRate(vm.diskWrite)}</span>
            </div>
          </div>

          {/* Uptime */}
          <div className="text-center">
            <Clock className="w-3 h-3 mx-auto mb-1 text-muted-foreground/40" />
            <div className="text-[9px] font-mono text-muted-foreground/50 uppercase mb-0.5">Uptime</div>
            <div className="text-[11px] font-mono-data font-bold text-foreground/80">
              {formatUptime(vm.uptime)}
            </div>
          </div>
        </div>

        {/* VMware Guest extras */}
        {vm.type === "vmware-guest" && (
          <div className="pt-2 border-t border-border/15 space-y-2">
            {/* vCPUs + Latency */}
            <div className="grid grid-cols-3 gap-2 text-center">
              {vm.vCpus && (
                <div>
                  <div className="text-[9px] font-mono text-muted-foreground/50 uppercase">vCPUs</div>
                  <div className="text-sm font-mono-data font-bold text-foreground/80">{vm.vCpus}</div>
                </div>
              )}
              {vm.cpuLatency && (
                <div>
                  <div className="text-[9px] font-mono text-muted-foreground/50 uppercase">CPU Latency</div>
                  <div className="text-sm font-mono-data font-bold text-foreground/80">{parseFloat(vm.cpuLatency).toFixed(2)}%</div>
                </div>
              )}
              {vm.cpuReadiness && (
                <div>
                  <div className="text-[9px] font-mono text-muted-foreground/50 uppercase">Readiness</div>
                  <div className="text-sm font-mono-data font-bold text-foreground/80">{parseFloat(vm.cpuReadiness).toFixed(2)}%</div>
                </div>
              )}
            </div>

            {/* Memory extras */}
            {(vm.ballooned || vm.swapped || vm.compressed) && (
              <div className="grid grid-cols-3 gap-2 text-center">
                {vm.ballooned && (
                  <div>
                    <div className="text-[9px] font-mono text-muted-foreground/50 uppercase">Ballooned</div>
                    <div className="text-[10px] font-mono text-foreground/70">{formatBytes(vm.ballooned)}</div>
                  </div>
                )}
                {vm.swapped && (
                  <div>
                    <div className="text-[9px] font-mono text-muted-foreground/50 uppercase">Swapped</div>
                    <div className="text-[10px] font-mono text-foreground/70">{formatBytes(vm.swapped)}</div>
                  </div>
                )}
                {vm.compressed && (
                  <div>
                    <div className="text-[9px] font-mono text-muted-foreground/50 uppercase">Compressed</div>
                    <div className="text-[10px] font-mono text-foreground/70">{formatBytes(vm.compressed)}</div>
                  </div>
                )}
              </div>
            )}

            {/* Storage + Snapshots */}
            <div className="grid grid-cols-3 gap-2 text-center">
              {vm.committedStorage && (
                <div>
                  <div className="text-[9px] font-mono text-muted-foreground/50 uppercase">Committed</div>
                  <div className="text-[10px] font-mono text-foreground/70">{formatBytes(vm.committedStorage)}</div>
                </div>
              )}
              {vm.snapshotCount && (
                <div>
                  <div className="text-[9px] font-mono text-muted-foreground/50 uppercase">Snapshots</div>
                  <div className="text-sm font-mono-data font-bold text-foreground/80">{vm.snapshotCount}</div>
                </div>
              )}
              {vm.toolsVersion && (
                <div>
                  <div className="text-[9px] font-mono text-muted-foreground/50 uppercase">Tools</div>
                  <div className="text-[10px] font-mono text-foreground/70">{vm.toolsVersion}</div>
                </div>
              )}
            </div>

            {/* Hypervisor + Cluster info */}
            {(vm.hypervisorName || vm.clusterName || vm.datacenter) && (
              <div className="text-[9px] font-mono text-muted-foreground/40 text-center pt-1 border-t border-border/10">
                {[vm.datacenter, vm.clusterName, vm.hypervisorName].filter(Boolean).join(" → ")}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Summary Stat ── */

function SummaryStat({ label, value, icon: Icon, color, sub }: {
  label: string; value: string | number; icon: React.ElementType; color: string; sub?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/30 p-4 relative overflow-hidden"
      style={{
        background: "linear-gradient(145deg, hsl(220 35% 8% / 0.95), hsl(225 30% 5% / 0.9))",
        boxShadow: `0 0 15px ${color}10, inset 0 1px 0 hsl(0 0% 100% / 0.03)`,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-5 h-5" style={{ color }} />
        <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl md:text-3xl font-display font-black" style={{ color, textShadow: `0 0 15px ${color}40` }}>
        {value}
      </div>
      {sub && <div className="text-[10px] font-mono text-muted-foreground/50 mt-1">{sub}</div>}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════ */

export default function VirtualMachinesMonitor() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<IdracConfig | null>(loadConfig);
  const [showSetup, setShowSetup] = useState(!config);
  const { data, dataLoading, lastRefresh, refresh, error, fetchItems } = useIdracLive();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const { save: saveDashboard, saving, loadedConfig } = useDashboardPersist<IdracConfig>({
    category: 'virtual-machines',
    listPath: '/app/monitoring/virtual-machines',
  });

  useEffect(() => {
    if (loadedConfig && !config) {
      setConfig(loadedConfig);
      setShowSetup(false);
    }
  }, [loadedConfig]);

  const handleSave = useCallback(() => {
    if (!config) return;
    saveDashboard(config.hostName || 'Virtual Machines', config);
  }, [config, saveDashboard]);

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

  const virt = useMemo(() => {
    if (!data) return null;
    const v = extractVirtData(data);
    // For VMware Guest, use the host name from config as the VM name
    if (v && v.vms.length === 1 && v.vms[0].name === "This VM" && config?.hostName) {
      v.vms[0].name = config.hostName;
    }
    return v;
  }, [data, config]);

  // Filter and sort VMs
  const filteredVMs = useMemo(() => {
    if (!virt) return [];
    let vms = [...virt.vms];

    // Search
    if (search) {
      const q = search.toLowerCase();
      vms = vms.filter(vm => vm.name.toLowerCase().includes(q) || (vm.type || "").toLowerCase().includes(q));
    }

    // Filter
    if (filterStatus === "running") vms = vms.filter(v => v.status === "running");
    else if (filterStatus === "stopped") vms = vms.filter(v => v.status === "stopped");
    else if (filterStatus === "other") vms = vms.filter(v => v.status !== "running" && v.status !== "stopped");

    // Sort
    switch (sortKey) {
      case "cpu": vms.sort((a, b) => b.cpuUsage - a.cpuUsage); break;
      case "mem": vms.sort((a, b) => b.memPercent - a.memPercent); break;
      case "status": vms.sort((a, b) => {
        const order = { running: 0, stopped: 2 };
        return (order[a.status as keyof typeof order] ?? 1) - (order[b.status as keyof typeof order] ?? 1);
      }); break;
      default: vms.sort((a, b) => a.name.localeCompare(b.name));
    }

    return vms;
  }, [virt, search, sortKey, filterStatus]);

  // Summary stats
  const stats = useMemo(() => {
    if (!virt || virt.vms.length === 0) return null;
    const running = virt.vms.filter(v => v.status === "running");
    const stopped = virt.vms.filter(v => v.status === "stopped");
    const avgCpu = running.length > 0
      ? running.reduce((s, v) => s + v.cpuUsage, 0) / running.length
      : 0;
    const avgMem = running.length > 0
      ? running.reduce((s, v) => s + v.memPercent, 0) / running.length
      : 0;
    const maxCpuVM = running.reduce((max, v) => v.cpuUsage > max.cpuUsage ? v : max, running[0] || virt.vms[0]);
    const maxMemVM = running.reduce((max, v) => v.memPercent > max.memPercent ? v : max, running[0] || virt.vms[0]);
    return { running: running.length, stopped: stopped.length, total: virt.vms.length, avgCpu, avgMem, maxCpuVM, maxMemVM };
  }, [virt]);

  // Parse host CPU frequency to Hz for estimating VM MHz
  const hostCpuFreqHz = useMemo(() => {
    console.log("[VMs] virt.cpu:", JSON.stringify(virt?.cpu));
    if (!virt?.cpu?.frequency) return 0;
    const raw = virt.cpu.frequency;
    const m = raw.match(/([\d.]+)\s*(Hz|KHz|MHz|GHz)/i);
    if (m) {
      const num = parseFloat(m[1]);
      const unit = m[2].toLowerCase();
      const mult: Record<string, number> = { hz: 1, khz: 1e3, mhz: 1e6, ghz: 1e9 };
      return num * (mult[unit] || 1);
    }
    const num = parseFloat(raw);
    if (!isNaN(num)) {
      // If raw is a large number, assume Hz; if small (< 100), assume GHz
      if (num > 1000) return num;
      if (num > 0 && num < 100) return num * 1e9;
    }
    return 0;
  }, [virt?.cpu?.frequency]);

  if (showSetup) {
    return <IdracSetupWizard onComplete={handleConfigComplete} existingConfig={config} />;
  }

  const isVMware = virt?.type === "vmware";
  const accentColor = isVMware ? "#00e5ff" : "#448aff";

  return (
    <div className="min-h-screen bg-background grid-pattern scanlines relative p-4 md:p-6 lg:p-8">
      {/* Ambient glow */}
      <div className="fixed top-0 left-1/4 w-[500px] h-[300px] rounded-full blur-[120px] pointer-events-none"
        style={{ background: `${accentColor}08` }}
      />
      <div className="fixed bottom-0 right-1/3 w-[400px] h-[300px] rounded-full blur-[100px] pointer-events-none"
        style={{ background: "hsl(265 80% 50% / 0.04)" }}
      />

      <div className="max-w-[1800px] mx-auto relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-6"
        >
          <div className="flex items-center gap-4">
            <div className="relative">
              <MonitorCheck className="w-8 h-8" style={{ color: accentColor }} />
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
                  Virtual Machines
                </span>
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">
                  {config?.hostName || "Host"} • {virt?.type === "vmware" ? "VMware ESXi" : virt?.type === "proxmox" ? "Proxmox VE" : "Hypervisor"}
                </span>
                {lastRefresh && (
                  <span className="text-[9px] font-mono text-muted-foreground/40">
                    • {lastRefresh.toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/app/monitoring/virtual-machines')} className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground/50 hover:text-muted-foreground transition-colors">
              <ArrowLeft className="w-3 h-3" /> Voltar
            </button>
            {data && (
              <button onClick={refresh} className="text-[9px] font-mono text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border/20 hover:border-border/40">
                ↻ Refresh
              </button>
            )}
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 text-[9px] font-mono text-neon-green/70 hover:text-neon-green transition-colors disabled:opacity-50">
              <Save className="w-3 h-3" /> {saving ? 'Salvando…' : 'Salvar'}
            </button>
            <button onClick={handleReconfigure} className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground/50 hover:text-muted-foreground transition-colors">
              <Settings2 className="w-3 h-3" /> Reconfigurar
            </button>
          </div>
        </motion.div>

        {/* Loading */}
        {dataLoading && !data && (
          <div className="glass-card rounded-xl p-16 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: accentColor }} />
            <p className="text-sm text-muted-foreground font-mono">Carregando dados das VMs...</p>
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

        {/* No VMs */}
        {data && virt && virt.vms.length === 0 && (
          <div className="glass-card rounded-xl p-8 text-center">
            <Server className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-mono">
              Nenhuma VM encontrada neste host.
            </p>
          </div>
        )}

        {/* Not virtualization host */}
        {data && !virt && (
          <div className="glass-card rounded-xl p-8 text-center">
            <Server className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-mono">
              Este host não parece ser VMware ESXi, VMware Guest ou Proxmox VE.
            </p>
          </div>
        )}

        {/* Dashboard */}
        {virt && virt.vms.length > 0 && stats && (
          <AnimatePresence>
            <div className="space-y-5">
              {/* ── Summary Stats ── */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <SummaryStat
                  label="Total VMs"
                  value={stats.total}
                  icon={Box}
                  color={accentColor}
                />
                <SummaryStat
                  label="Running"
                  value={stats.running}
                  icon={Power}
                  color="#00e676"
                  sub={`${((stats.running / stats.total) * 100).toFixed(0)}% do total`}
                />
                <SummaryStat
                  label="Stopped"
                  value={stats.stopped}
                  icon={Power}
                  color={stats.stopped > 0 ? "#e02020" : "#666"}
                />
                <SummaryStat
                  label="CPU Médio"
                  value={`${stats.avgCpu.toFixed(1)}%`}
                  icon={Cpu}
                  color={stats.avgCpu > 80 ? "#e02020" : stats.avgCpu > 50 ? "#f5a623" : "#00e5ff"}
                  sub={`Top: ${stats.maxCpuVM?.name} (${stats.maxCpuVM?.cpuUsage.toFixed(1)}%)`}
                />
                <SummaryStat
                  label="MEM Médio"
                  value={`${stats.avgMem.toFixed(1)}%`}
                  icon={MemoryStick}
                  color={stats.avgMem > 85 ? "#e02020" : stats.avgMem > 60 ? "#f5a623" : "#448aff"}
                  sub={`Top: ${stats.maxMemVM?.name} (${stats.maxMemVM?.memPercent.toFixed(1)}%)`}
                />
                <SummaryStat
                  label="Tipo"
                  value={virt.type === "vmware" ? "VMware" : "Proxmox"}
                  icon={Server}
                  color={accentColor}
                  sub={config?.hostName}
                />
              </div>

              {/* ── Search & Filter Bar ── */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="glass-card rounded-xl p-4 border border-border/30 flex flex-wrap items-center gap-3"
              >
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                  <input
                    type="text"
                    placeholder="Buscar VM..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full bg-muted/20 border border-border/20 rounded-lg pl-9 pr-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-border/40 transition-colors"
                  />
                </div>

                {/* Status filter */}
                <div className="flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-muted-foreground/40 mr-1" />
                  {(["all", "running", "stopped", "other"] as FilterStatus[]).map(f => (
                    <button
                      key={f}
                      onClick={() => setFilterStatus(f)}
                      className="text-[10px] font-mono px-3 py-1.5 rounded-md uppercase tracking-wider transition-all"
                      style={{
                        background: filterStatus === f ? `${accentColor}20` : "transparent",
                        color: filterStatus === f ? accentColor : "hsl(var(--muted-foreground) / 0.5)",
                        border: `1px solid ${filterStatus === f ? `${accentColor}40` : "transparent"}`,
                      }}
                    >
                      {f === "all" ? "Todas" : f === "running" ? "Running" : f === "stopped" ? "Stopped" : "Outros"}
                    </button>
                  ))}
                </div>

                {/* Sort */}
                <div className="flex items-center gap-1">
                  <Gauge className="w-3.5 h-3.5 text-muted-foreground/40 mr-1" />
                  {(["name", "cpu", "mem", "status"] as SortKey[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setSortKey(s)}
                      className="text-[10px] font-mono px-3 py-1.5 rounded-md uppercase tracking-wider transition-all"
                      style={{
                        background: sortKey === s ? `${accentColor}20` : "transparent",
                        color: sortKey === s ? accentColor : "hsl(var(--muted-foreground) / 0.5)",
                        border: `1px solid ${sortKey === s ? `${accentColor}40` : "transparent"}`,
                      }}
                    >
                      {s === "name" ? "Nome" : s.toUpperCase()}
                    </button>
                  ))}
                </div>

                {/* Count */}
                <span className="text-[10px] font-mono text-muted-foreground/40 ml-auto">
                  {filteredVMs.length} / {virt.vms.length} VMs
                </span>
              </motion.div>

              {/* ── VM Grid ── */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4"
              >
                {filteredVMs.map((vm, i) => (
                  <VMDetailCard key={vm.name} vm={vm} index={i} hostCpuFreqHz={hostCpuFreqHz} />
                ))}
              </motion.div>

              {filteredVMs.length === 0 && search && (
                <div className="text-center py-8">
                  <Search className="w-8 h-8 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground/50 font-mono">
                    Nenhuma VM encontrada para "{search}"
                  </p>
                </div>
              )}

              {/* Footer */}
              <div className="text-center py-3">
                <p className="text-[9px] font-mono text-muted-foreground/40">
                  FLOWPULSE | {config?.hostName} • {virt.type.toUpperCase()} • {virt.vms.length} VMs • Refresh: 2min
                </p>
              </div>
            </div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
