import { motion } from 'framer-motion';
import { Plug, Zap } from 'lucide-react';
import { parseStatus, parsePsuState } from '@/data/serverData';
import { StatusIndicator } from './StatusCard';

interface PSU {
  id: number;
  status: string;
  voltage: string;
  maxPower: string;
  state: string;
  sensorState: string;
}

interface Props {
  powerSupplies: PSU[];
  minIdlePower: string;
}

const PowerSection = ({ powerSupplies, minIdlePower }: Props) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
      className="glass-card rounded-xl p-5 relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neon-cyan/30 to-transparent" />

      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-5 h-5 text-neon-cyan" />
        <h2 className="font-display text-sm font-bold uppercase tracking-wider text-neon-cyan text-glow-cyan">
          Energia
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        {powerSupplies.map((psu) => {
          const { level } = parseStatus(psu.status || "OK (3)");
          return (
            <div key={psu.id} className="glass-card rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-display text-xs font-bold text-foreground">PSU {psu.id}</span>
                <div className="flex items-center gap-1.5">
                  <StatusIndicator status={level} />
                  <span className={`text-xs font-bold font-display ${level === 'ok' ? 'text-neon-green' : 'text-neon-red'}`}>
                    {parseStatus(psu.status || "OK").text}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div>
                  <div className="text-muted-foreground">Tensão</div>
                  <div className="text-foreground font-bold">{psu.voltage || "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Potência Máx.</div>
                  <div className="text-foreground font-bold">{psu.maxPower || "—"}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-muted-foreground">Estado</div>
                  <div className="text-neon-green text-[11px]">{parsePsuState(psu.state || "OK").text}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="glass-card rounded-lg p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plug className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-mono text-muted-foreground">Consumo Mín. Idle</span>
        </div>
        <span className="text-sm font-mono font-bold text-neon-amber">{minIdlePower || "—"}</span>
      </div>
    </motion.div>
  );
};

export default PowerSection;
