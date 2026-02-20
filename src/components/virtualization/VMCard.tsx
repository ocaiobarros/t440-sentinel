import { motion } from "framer-motion";
import { Clock, HardDrive, Network, Cpu, MemoryStick } from "lucide-react";
import type { VirtVM } from "@/hooks/useVirtExtractors";

interface Props {
  vm: VirtVM;
  index: number;
}

function MiniBar({ value, color, bg }: { value: number; color: string; bg: string }) {
  return (
    <div className={`h-1.5 rounded-full w-full ${bg}`}>
      <motion.div
        className="h-full rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(value, 100)}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{
          background: color,
          boxShadow: `0 0 6px ${color}80`,
        }}
      />
    </div>
  );
}

function formatUptime(raw: string): string {
  if (!raw) return "—";
  const m = raw.match(/(\d+)\s*(?:dias?|days?)/i);
  if (m) return `${m[1]}d`;
  const secs = parseInt(raw);
  if (!isNaN(secs)) {
    const days = Math.floor(secs / 86400);
    const hours = Math.floor((secs % 86400) / 3600);
    return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
  }
  return raw.length > 12 ? raw.slice(0, 12) : raw;
}

function formatBytes(raw: string): string {
  if (!raw) return "—";
  const fmtMatch = raw.match(/([\d.]+)\s*(KB|MB|GB|TB|KiB|MiB|GiB|TiB|B)/i);
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
  const num = parseFloat(raw);
  if (isNaN(num)) return raw;
  if (num >= 1024 ** 4) return `${(num / 1024 ** 4).toFixed(2)} TB`;
  if (num >= 1024 ** 3) return `${(num / 1024 ** 3).toFixed(2)} GB`;
  if (num >= 1024 ** 2) return `${(num / 1024 ** 2).toFixed(1)} MB`;
  if (num >= 1024) return `${(num / 1024).toFixed(0)} KB`;
  return `${num.toFixed(0)} B`;
}

export default function VMCard({ vm, index }: Props) {
  const isRunning = vm.status === "running";
  const isStopped = vm.status === "stopped";

  const statusColor = isRunning
    ? "hsl(142, 100%, 50%)"
    : isStopped
      ? "hsl(0, 90%, 50%)"
      : "hsl(43, 100%, 50%)";

  const cpuColor = vm.cpuUsage > 80
    ? "hsl(0, 90%, 50%)"
    : vm.cpuUsage > 50
      ? "hsl(43, 100%, 50%)"
      : "hsl(186, 100%, 50%)";

  const memColor = vm.memPercent > 85
    ? "hsl(0, 90%, 50%)"
    : vm.memPercent > 60
      ? "hsl(43, 100%, 50%)"
      : "hsl(210, 100%, 56%)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, delay: index * 0.03 }}
      className="group relative rounded-lg border overflow-hidden transition-all duration-300 hover:scale-[1.02]"
      style={{
        background: "linear-gradient(145deg, hsl(220 40% 8% / 0.9) 0%, hsl(225 35% 5% / 0.85) 100%)",
        borderColor: isRunning
          ? "hsl(186 100% 50% / 0.2)"
          : isStopped
            ? "hsl(0 90% 50% / 0.3)"
            : "hsl(43 100% 50% / 0.25)",
        boxShadow: isRunning
          ? "0 0 12px hsl(186 100% 50% / 0.06), inset 0 1px 0 hsl(186 100% 50% / 0.05)"
          : isStopped
            ? "0 0 12px hsl(0 90% 50% / 0.08)"
            : "none",
      }}
    >
      {/* Top edge glow line */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${statusColor}60 50%, transparent 100%)`,
        }}
      />

      <div className="p-3 space-y-2.5">
        {/* Header: status + name */}
        <div className="flex items-center gap-2">
          <motion.span
            className="w-2 h-2 rounded-full flex-shrink-0"
            animate={isRunning ? { scale: [1, 1.15, 1] } : {}}
            transition={isRunning ? { duration: 2, repeat: Infinity } : {}}
            style={{
              background: statusColor,
              boxShadow: `0 0 6px ${statusColor}, 0 0 12px ${statusColor}60`,
            }}
          />
          <span className="text-[11px] font-display font-bold text-foreground truncate flex-1">
            {vm.name}
          </span>
          {vm.type && (
            <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground uppercase tracking-wider">
              {vm.type}
            </span>
          )}
        </div>

        {/* CPU */}
        <div className="space-y-0.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Cpu className="w-2.5 h-2.5 text-muted-foreground/60" />
              <span className="text-[8px] font-mono text-muted-foreground uppercase">CPU</span>
            </div>
            <span className="text-[9px] font-mono-data font-bold" style={{ color: cpuColor }}>
              {vm.cpuUsage.toFixed(1)}%
            </span>
          </div>
          <MiniBar value={vm.cpuUsage} color={cpuColor} bg="bg-muted/30" />
        </div>

        {/* Memory */}
        <div className="space-y-0.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <MemoryStick className="w-2.5 h-2.5 text-muted-foreground/60" />
              <span className="text-[8px] font-mono text-muted-foreground uppercase">MEM</span>
            </div>
            <span className="text-[9px] font-mono-data font-bold" style={{ color: memColor }}>
              {formatBytes(vm.memUsed)}<span className="text-muted-foreground/50 font-normal">/{formatBytes(vm.memTotal)}</span>
            </span>
          </div>
          <MiniBar value={vm.memPercent} color={memColor} bg="bg-muted/30" />
        </div>

        {/* Bottom row: Network + Disk + Uptime */}
        <div className="flex items-center justify-between pt-1 border-t border-border/20">
          <div className="flex items-center gap-1.5" title="Network In / Out">
            <Network className="w-2.5 h-2.5 text-muted-foreground/40" />
            <span className="text-[8px] font-mono text-muted-foreground">
              {vm.netIn || "—"} <span className="text-muted-foreground/30">↕</span> {vm.netOut || "—"}
            </span>
          </div>
          <div className="flex items-center gap-1" title="Uptime">
            <Clock className="w-2.5 h-2.5 text-muted-foreground/40" />
            <span className="text-[8px] font-mono text-muted-foreground">
              {formatUptime(vm.uptime)}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
