import { motion } from 'framer-motion';
import { Cpu, MemoryStick } from 'lucide-react';

interface CpuData {
  utilization: string;
  idle: string;
  user: string;
  system: string;
  iowait: string;
  loadAvg1: string;
  loadAvg5: string;
  loadAvg15: string;
  numCpus: string;
}

interface LinuxMemoryData {
  total: string;
  free: string;
  cached: string;
  buffers: string;
  totalSwap: string;
  freeSwap: string;
}

interface Props {
  cpu: CpuData | null;
  memory: LinuxMemoryData | null;
}

function formatBytes(val: string): string {
  if (!val) return "—";
  const num = parseFloat(val);
  if (isNaN(num)) return val;
  if (num >= 1e12) return `${(num / 1e12).toFixed(2)} TB`;
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)} GB`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)} MB`;
  return `${num.toFixed(0)} B`;
}

function pctVal(val: string): number {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : Math.min(n * 100, 100);
}

function pctDisplay(val: string): string {
  const n = parseFloat(val);
  return isNaN(n) ? "—" : `${(n * 100).toFixed(1)}%`;
}

const CpuMemorySection = ({ cpu, memory }: Props) => {
  const cpuPct = cpu ? pctVal(cpu.utilization) : 0;

  const memTotal = memory ? parseFloat(memory.total) : 0;
  const memFree = memory ? parseFloat(memory.free) : 0;
  const memCached = memory ? parseFloat(memory.cached) : 0;
  const memBuffers = memory ? parseFloat(memory.buffers) : 0;
  const memUsed = memTotal > 0 ? memTotal - memFree - memCached - memBuffers : 0;
  const memPct = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* CPU */}
      {cpu && cpu.utilization && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="glass-card rounded-xl p-5 relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neon-cyan/30 to-transparent" />

          <div className="flex items-center gap-2 mb-4">
            <Cpu className="w-5 h-5 text-neon-cyan" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-neon-cyan">
              CPU
            </h2>
            {cpu.numCpus && (
              <span className="text-[10px] font-mono text-muted-foreground ml-auto">{cpu.numCpus} cores</span>
            )}
          </div>

          {/* CPU utilization bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono text-muted-foreground">Utilização</span>
              <span className={`text-sm font-bold font-mono ${cpuPct > 80 ? 'text-neon-red' : cpuPct > 50 ? 'text-neon-amber' : 'text-neon-green'}`}>
                {pctDisplay(cpu.utilization)}
              </span>
            </div>
            <div className="h-3 bg-background/50 rounded-full overflow-hidden border border-border/30">
              <div
                className={`h-full rounded-full transition-all duration-500 ${cpuPct > 80 ? 'bg-neon-red' : cpuPct > 50 ? 'bg-neon-amber' : 'bg-neon-green'}`}
                style={{ width: `${cpuPct}%` }}
              />
            </div>
          </div>

          {/* Load Average */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: "1m", value: cpu.loadAvg1 },
              { label: "5m", value: cpu.loadAvg5 },
              { label: "15m", value: cpu.loadAvg15 },
            ].map((la) => (
              <div key={la.label} className="glass-card rounded-lg p-2 text-center">
                <div className="text-[10px] font-mono text-muted-foreground uppercase">Load {la.label}</div>
                <div className="text-sm font-bold font-mono text-foreground">{la.value ? parseFloat(la.value).toFixed(2) : "—"}</div>
              </div>
            ))}
          </div>

          {/* CPU breakdown */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {[
              { label: "User", value: cpu.user },
              { label: "System", value: cpu.system },
              { label: "IOWait", value: cpu.iowait },
              { label: "Idle", value: cpu.idle },
            ].filter(i => i.value).map((item) => (
              <div key={item.label} className="flex items-center justify-between text-[10px] font-mono py-0.5">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="text-foreground">{pctDisplay(item.value)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Memory */}
      {memory && memory.total && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="glass-card rounded-xl p-5 relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neon-blue/30 to-transparent" />

          <div className="flex items-center gap-2 mb-4">
            <MemoryStick className="w-5 h-5 text-neon-blue" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-neon-blue">
              Memória
            </h2>
          </div>

          {/* Memory bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono text-muted-foreground">Uso</span>
              <span className={`text-sm font-bold font-mono ${memPct > 85 ? 'text-neon-red' : memPct > 60 ? 'text-neon-amber' : 'text-neon-green'}`}>
                {memPct.toFixed(1)}%
              </span>
            </div>
            <div className="h-3 bg-background/50 rounded-full overflow-hidden border border-border/30">
              <div
                className={`h-full rounded-full transition-all duration-500 ${memPct > 85 ? 'bg-neon-red' : memPct > 60 ? 'bg-neon-amber' : 'bg-neon-blue'}`}
                style={{ width: `${memPct}%` }}
              />
            </div>
          </div>

          {/* Memory details */}
          <div className="space-y-1.5">
            {[
              { label: "Total", value: formatBytes(memory.total) },
              { label: "Usado", value: formatBytes(String(memUsed)) },
              { label: "Livre", value: formatBytes(memory.free) },
              { label: "Cache", value: formatBytes(memory.cached) },
              { label: "Buffers", value: formatBytes(memory.buffers) },
            ].filter(i => i.value !== "—").map((item) => (
              <div key={item.label} className="flex items-center justify-between text-xs font-mono py-0.5 border-b border-border/20 last:border-0">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="text-foreground font-bold">{item.value}</span>
              </div>
            ))}
          </div>

          {/* Swap */}
          {memory.totalSwap && parseFloat(memory.totalSwap) > 0 && (
            <div className="mt-3 pt-2 border-t border-border/30">
              <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Swap</div>
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-muted-foreground">Total: {formatBytes(memory.totalSwap)}</span>
                <span className="text-foreground">Livre: {formatBytes(memory.freeSwap)}</span>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

export default CpuMemorySection;
