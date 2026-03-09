import { motion } from "framer-motion";
import { Wifi, WifiOff, Activity } from "lucide-react";
import type { HostAvailability } from "@/hooks/useFlowDisponibilityData";

interface Props {
  host: HostAvailability;
  index: number;
}

function SlaBar({ value }: { value: number }) {
  const color =
    value >= 99.5 ? "from-emerald-400 to-green-500" :
    value >= 99   ? "from-yellow-400 to-amber-500" :
    value >= 95   ? "from-orange-400 to-orange-500" :
    "from-red-500 to-rose-600";

  return (
    <div className="h-1 w-full bg-border/20 rounded-full overflow-hidden mt-1">
      <motion.div
        className={`h-full rounded-full bg-gradient-to-r ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, value)}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
    </div>
  );
}

export default function HostAvailCard({ host, index }: Props) {
  const isOnline = host.isOnline;
  const slaColor =
    host.sla >= 99.5 ? "text-emerald-400" :
    host.sla >= 99   ? "text-yellow-400" :
    host.sla >= 95   ? "text-orange-400" :
    "text-red-400";

  const cardGlow = isOnline
    ? "hover:border-emerald-500/40 hover:shadow-[0_0_20px_rgba(52,211,153,0.08)]"
    : "border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.12)]";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.03, duration: 0.35, ease: "easeOut" }}
      className={`
        relative rounded-xl border bg-card/50 backdrop-blur-sm overflow-hidden
        transition-all duration-300 cursor-default group
        ${isOnline ? "border-border/30" : "border-red-500/40"}
        ${cardGlow}
      `}
    >
      {/* Offline pulse overlay */}
      {!isOnline && (
        <motion.div
          className="absolute inset-0 bg-red-500/5 rounded-xl pointer-events-none"
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      {/* Top accent bar */}
      <div className={`h-0.5 w-full ${isOnline ? "bg-gradient-to-r from-emerald-500/60 via-emerald-400/30 to-transparent" : "bg-gradient-to-r from-red-500/70 via-red-400/40 to-transparent"}`} />

      <div className="p-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-mono text-muted-foreground/70 truncate uppercase tracking-wider">
              {host.group}
            </p>
            <h3 className="text-xs font-display font-bold text-foreground truncate leading-tight mt-0.5">
              {host.displayName}
            </h3>
          </div>

          {/* Status badge */}
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full shrink-0 text-[8px] font-display font-bold uppercase tracking-wider
            ${isOnline ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}
          >
            {isOnline
              ? <><motion.span className="w-1.5 h-1.5 rounded-full bg-emerald-400" animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />{" "}ONLINE</>
              : <><motion.span className="w-1.5 h-1.5 rounded-full bg-red-400" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }} />{" "}OFFLINE</>
            }
          </div>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div>
            <p className="text-[8px] font-mono text-muted-foreground/60 uppercase tracking-wider">SLA</p>
            <p className={`text-sm font-display font-bold leading-none mt-0.5 ${slaColor}`}>
              {host.sla.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-[8px] font-mono text-muted-foreground/60 uppercase tracking-wider">ERRO</p>
            <p className={`text-sm font-display font-bold leading-none mt-0.5 ${(host.icmpLoss ?? 0) > 0 ? "text-orange-400" : "text-muted-foreground"}`}>
              {host.icmpLoss !== null ? `${host.icmpLoss.toFixed(1)}%` : "—"}
            </p>
          </div>
          <div>
            <p className="text-[8px] font-mono text-muted-foreground/60 uppercase tracking-wider">QUEDAS</p>
            <p className={`text-sm font-display font-bold leading-none mt-0.5 ${host.drops > 0 ? "text-red-400" : "text-muted-foreground"}`}>
              {host.drops}
            </p>
          </div>
        </div>

        {/* SLA bar */}
        <SlaBar value={host.sla} />

        {/* Response time */}
        {host.icmpResponse !== null && (
          <div className="flex items-center gap-1 mt-2">
            <Activity className="w-2.5 h-2.5 text-muted-foreground/40" />
            <span className="text-[8px] font-mono text-muted-foreground/50">
              {host.icmpResponse.toFixed(1)}ms RTT
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
