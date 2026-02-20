import { motion } from "framer-motion";
import {
  Globe, Server, Layers, Shield, Activity, Network,
  ArrowDownToLine, ArrowUpFromLine, BarChart3,
} from "lucide-react";

/* ─── Types ── */
export interface TrafficEntry {
  name: string;
  in_bytes?: number;
  out_bytes?: number;
  total_bytes: number;
}

export interface NetworkSummaryData {
  subnets?: TrafficEntry[];
  applications?: TrafficEntry[];
  mapped_objects?: TrafficEntry[];
  protocols?: TrafficEntry[];
  tos?: TrafficEntry[];
  autonomous_systems?: TrafficEntry[];
  subnet_groups?: TrafficEntry[];
  interface_groups?: TrafficEntry[];
  as_groups?: TrafficEntry[];
  tos_groups?: TrafficEntry[];
  devices?: TrafficEntry[];
}

/* ─── Format bytes to human-readable ── */
function formatTraffic(bytes: number | undefined): string {
  if (!bytes || bytes === 0) return "0.00";
  const abs = Math.abs(bytes);
  if (abs >= 1e12) return (bytes / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (bytes / 1e9).toFixed(2) + "G";
  if (abs >= 1e6) return (bytes / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (bytes / 1e3).toFixed(2) + "k";
  return bytes.toFixed(2);
}

/* ─── Summary card ── */
function SummaryCard({ label, value, icon: Ic, color }: {
  label: string; value: string; icon: React.ElementType; color: string;
}) {
  return (
    <div className="rounded-xl border border-muted/20 p-4 flex items-center gap-3"
      style={{ background: "linear-gradient(145deg, hsl(220 40% 8% / 0.95) 0%, hsl(225 35% 5% / 0.9) 100%)" }}
    >
      <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
        <Ic className="w-4.5 h-4.5" style={{ color }} />
      </div>
      <div>
        <div className="text-[9px] font-mono text-muted-foreground/50 uppercase">{label}</div>
        <div className="text-lg font-mono font-bold text-foreground">{value}</div>
      </div>
    </div>
  );
}

/* ─── Top 10 Table (bidirectional: in/out/total) ── */
function Top10TableBidi({ title, icon: Ic, color, data }: {
  title: string; icon: React.ElementType; color: string; data: TrafficEntry[];
}) {
  const maxTotal = Math.max(...data.map(d => d.total_bytes), 1);

  return (
    <div className="rounded-xl border border-muted/20 overflow-hidden"
      style={{ background: "linear-gradient(145deg, hsl(220 40% 8% / 0.95) 0%, hsl(225 35% 5% / 0.9) 100%)" }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-muted/10">
        <Ic className="w-4 h-4" style={{ color }} />
        <span className="font-mono text-xs font-bold text-foreground">{title}</span>
        <span className="text-[9px] font-mono text-muted-foreground/40 ml-auto">Top {data.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono">
          <thead>
            <tr className="border-b border-muted/10 text-muted-foreground/40">
              <th className="text-left py-2 px-4">{title.split(" ")[0]}</th>
              <th className="text-right py-2 px-3 w-24">
                <span className="flex items-center justify-end gap-1">
                  <ArrowDownToLine className="w-3 h-3 text-cyan-400/50" /> Entrada
                </span>
              </th>
              <th className="text-right py-2 px-3 w-24">
                <span className="flex items-center justify-end gap-1">
                  <ArrowUpFromLine className="w-3 h-3 text-emerald-400/50" /> Saída
                </span>
              </th>
              <th className="text-right py-2 px-3 w-24">Total</th>
              <th className="w-32 py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {data.map((entry, i) => {
              const pct = (entry.total_bytes / maxTotal) * 100;
              return (
                <motion.tr
                  key={entry.name + i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="border-b border-muted/5 hover:bg-muted/5 transition-colors"
                >
                  <td className="py-2 px-4 text-foreground/90 truncate max-w-[200px]">{entry.name}</td>
                  <td className="py-2 px-3 text-right text-cyan-400/70">{formatTraffic(entry.in_bytes)}</td>
                  <td className="py-2 px-3 text-right text-emerald-400/70">{formatTraffic(entry.out_bytes)}</td>
                  <td className="py-2 px-3 text-right text-foreground font-bold">{formatTraffic(entry.total_bytes)}</td>
                  <td className="py-2 px-3">
                    <div className="w-full h-2 rounded-full bg-muted/10 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5, delay: i * 0.03 }}
                        className="h-full rounded-full"
                        style={{ background: `linear-gradient(90deg, ${color}99, ${color}40)` }}
                      />
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Top 10 Table (single total column) ── */
function Top10TableSingle({ title, icon: Ic, color, data }: {
  title: string; icon: React.ElementType; color: string; data: TrafficEntry[];
}) {
  const maxTotal = Math.max(...data.map(d => d.total_bytes), 1);

  return (
    <div className="rounded-xl border border-muted/20 overflow-hidden"
      style={{ background: "linear-gradient(145deg, hsl(220 40% 8% / 0.95) 0%, hsl(225 35% 5% / 0.9) 100%)" }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-muted/10">
        <Ic className="w-4 h-4" style={{ color }} />
        <span className="font-mono text-xs font-bold text-foreground">{title}</span>
        <span className="text-[9px] font-mono text-muted-foreground/40 ml-auto">Top {data.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono">
          <thead>
            <tr className="border-b border-muted/10 text-muted-foreground/40">
              <th className="text-left py-2 px-4">{title.split(" ")[0]}</th>
              <th className="text-right py-2 px-3 w-24">Total</th>
              <th className="w-40 py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {data.map((entry, i) => {
              const pct = (entry.total_bytes / maxTotal) * 100;
              return (
                <motion.tr
                  key={entry.name + i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="border-b border-muted/5 hover:bg-muted/5 transition-colors"
                >
                  <td className="py-2 px-4 text-foreground/90 truncate max-w-[200px]">{entry.name}</td>
                  <td className="py-2 px-3 text-right text-foreground font-bold">{formatTraffic(entry.total_bytes)}</td>
                  <td className="py-2 px-3">
                    <div className="w-full h-2 rounded-full bg-muted/10 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5, delay: i * 0.03 }}
                        className="h-full rounded-full"
                        style={{ background: `linear-gradient(90deg, ${color}99, ${color}40)` }}
                      />
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Main Panel ── */
export default function NetworkSummaryPanel({ data }: { data: NetworkSummaryData }) {
  const totalIn = (data.subnets || []).reduce((s, e) => s + (e.in_bytes || 0), 0);
  const totalOut = (data.subnets || []).reduce((s, e) => s + (e.out_bytes || 0), 0);
  const totalTraffic = totalIn + totalOut;
  const deviceCount = (data.devices || []).length;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Tráfego Total (1h)" value={formatTraffic(totalTraffic)} icon={Activity} color="#00e5ff" />
        <SummaryCard label="Entrada Total" value={formatTraffic(totalIn)} icon={ArrowDownToLine} color="#448aff" />
        <SummaryCard label="Saída Total" value={formatTraffic(totalOut)} icon={ArrowUpFromLine} color="#00e676" />
        <SummaryCard label="Dispositivos" value={String(deviceCount)} icon={Server} color="#c050ff" />
      </div>

      {/* Grid: 2 columns on large screens */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Subredes */}
        {data.subnets && data.subnets.length > 0 && (
          <Top10TableBidi title="Subrede Top 10" icon={Globe} color="#00e5ff" data={data.subnets} />
        )}

        {/* Sistemas Autônomos */}
        {data.autonomous_systems && data.autonomous_systems.length > 0 && (
          <Top10TableBidi title="Sistema Autônomo Top 10" icon={Network} color="#c050ff" data={data.autonomous_systems} />
        )}

        {/* Aplicação */}
        {data.applications && data.applications.length > 0 && (
          <Top10TableSingle title="Aplicação Top 10" icon={Layers} color="#00e676" data={data.applications} />
        )}

        {/* Protocolo */}
        {data.protocols && data.protocols.length > 0 && (
          <Top10TableSingle title="Protocolo Top 10" icon={Shield} color="#ffab40" data={data.protocols} />
        )}

        {/* Grupo de Subredes */}
        {data.subnet_groups && data.subnet_groups.length > 0 && (
          <Top10TableBidi title="Grupo de Subredes Top 10" icon={Globe} color="#448aff" data={data.subnet_groups} />
        )}

        {/* Grupo de Interfaces */}
        {data.interface_groups && data.interface_groups.length > 0 && (
          <Top10TableBidi title="Grupo de Interfaces Top 10" icon={BarChart3} color="#00e5ff" data={data.interface_groups} />
        )}

        {/* Grupo de Sistemas Autônomos */}
        {data.as_groups && data.as_groups.length > 0 && (
          <Top10TableBidi title="Grupo de Sistemas Autônomos Top 10" icon={Network} color="#c050ff" data={data.as_groups} />
        )}

        {/* ToS */}
        {data.tos && data.tos.length > 0 && (
          <Top10TableSingle title="ToS Top 10" icon={Shield} color="#ff5252" data={data.tos} />
        )}

        {/* Grupo de ToS */}
        {data.tos_groups && data.tos_groups.length > 0 && (
          <Top10TableSingle title="Grupo de ToS Top 10" icon={Shield} color="#ff5252" data={data.tos_groups} />
        )}

        {/* Objetos Mapeados */}
        {data.mapped_objects && data.mapped_objects.length > 0 && (
          <Top10TableBidi title="Objeto Mapeado Top 10" icon={Server} color="#ffab40" data={data.mapped_objects} />
        )}

        {/* Dispositivos */}
        {data.devices && data.devices.length > 0 && (
          <Top10TableSingle title="Dispositivo Top 10" icon={Server} color="#c050ff" data={data.devices} />
        )}
      </div>
    </div>
  );
}
