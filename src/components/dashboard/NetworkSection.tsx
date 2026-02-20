import { motion } from 'framer-motion';
import { Network, ArrowDown, ArrowUp } from 'lucide-react';
import { parseStatus, parseConnectionStatus } from '@/data/serverData';
import { StatusIndicator } from './StatusCard';

interface NicData {
  id: number;
  name: string;
  mac: string;
  connectionStatus: string;
  status: string;
  slot?: string;
  speed?: string;
  bitsIn?: string;
  bitsOut?: string;
}

interface Props {
  nics: NicData[];
}

function formatBits(val: string): string {
  if (!val) return "—";
  const num = parseFloat(val);
  if (isNaN(num)) return val;
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)} Gbps`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)} Mbps`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)} Kbps`;
  return `${num.toFixed(0)} bps`;
}

function formatSpeed(val: string): string {
  if (!val) return "";
  const num = parseFloat(val);
  if (isNaN(num)) return val;
  if (num >= 1e9) return `${(num / 1e9).toFixed(0)} Gbps`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(0)} Mbps`;
  return val;
}

const NetworkSection = ({ nics }: Props) => {
  const hasTraffic = nics.some(n => n.bitsIn || n.bitsOut);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.7 }}
      className="glass-card rounded-xl p-5 relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neon-blue/30 to-transparent" />

      <div className="flex items-center gap-2 mb-4">
        <Network className="w-5 h-5 text-neon-blue" />
        <h2 className="font-display text-sm font-bold uppercase tracking-wider text-neon-blue">
          Interfaces de Rede
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left py-2 px-2 text-muted-foreground font-display text-[10px] uppercase tracking-wider">Interface</th>
              {!hasTraffic && (
                <>
                  <th className="text-left py-2 px-2 text-muted-foreground font-display text-[10px] uppercase tracking-wider">Nome</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-display text-[10px] uppercase tracking-wider">MAC</th>
                </>
              )}
              {hasTraffic && (
                <>
                  <th className="text-center py-2 px-2 text-muted-foreground font-display text-[10px] uppercase tracking-wider">Speed</th>
                  <th className="text-center py-2 px-2 text-muted-foreground font-display text-[10px] uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1"><ArrowDown className="w-3 h-3" /> RX</span>
                  </th>
                  <th className="text-center py-2 px-2 text-muted-foreground font-display text-[10px] uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1"><ArrowUp className="w-3 h-3" /> TX</span>
                  </th>
                </>
              )}
              <th className="text-center py-2 px-2 text-muted-foreground font-display text-[10px] uppercase tracking-wider">Link</th>
              <th className="text-center py-2 px-2 text-muted-foreground font-display text-[10px] uppercase tracking-wider">Saúde</th>
            </tr>
          </thead>
          <tbody>
            {nics.map((nic) => {
              const connStatus = parseConnectionStatus(nic.connectionStatus || "");
              const healthStatus = parseStatus(nic.status || "OK (3)");
              const shortName = nic.name.split(' - ')[0];

              return (
                <tr key={nic.id} className="border-b border-border/20 hover:bg-accent/20 transition-colors">
                  <td className="py-2 px-2 text-foreground font-bold">{hasTraffic ? nic.name : nic.id}</td>
                  {!hasTraffic && (
                    <>
                      <td className="py-2 px-2 text-muted-foreground text-[11px] max-w-[200px] truncate">{shortName}</td>
                      <td className="py-2 px-2 text-muted-foreground">{nic.mac}</td>
                    </>
                  )}
                  {hasTraffic && (
                    <>
                      <td className="py-2 px-2 text-center text-muted-foreground">{formatSpeed(nic.speed || "")}</td>
                      <td className="py-2 px-2 text-center text-neon-cyan">{formatBits(nic.bitsIn || "")}</td>
                      <td className="py-2 px-2 text-center text-neon-amber">{formatBits(nic.bitsOut || "")}</td>
                    </>
                  )}
                  <td className="py-2 px-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <StatusIndicator status={connStatus.level} size="sm" />
                      <span className={connStatus.level === 'ok' ? 'text-neon-green' : connStatus.level === 'critical' ? 'text-neon-red' : 'text-muted-foreground'}>
                        {connStatus.text}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <StatusIndicator status={healthStatus.level} size="sm" />
                      <span className={healthStatus.level === 'ok' ? 'text-neon-green' : 'text-neon-red'}>
                        {healthStatus.text}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
};

export default NetworkSection;
