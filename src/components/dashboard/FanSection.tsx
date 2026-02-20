import { motion } from 'framer-motion';
import { Fan } from 'lucide-react';
import { parseStatus } from '@/data/serverData';
import { StatusIndicator } from './StatusCard';

interface FanData {
  name: string;
  speed: string;
  speedNum: number;
  status: string;
}

interface Props {
  fans: FanData[];
}

const FanSection = ({ fans }: Props) => {
  const maxRpm = 6000;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="glass-card rounded-xl p-5 relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neon-green/30 to-transparent" />

      <div className="flex items-center gap-2 mb-5">
        <Fan className="w-5 h-5 text-neon-green animate-spin" style={{ animationDuration: '3s' }} />
        <h2 className="font-display text-sm font-bold uppercase tracking-wider text-neon-green text-glow-green">
          Nível de Ventilação
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-2 max-h-[420px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800">
        {fans.map((fan, i) => {
          const { level } = parseStatus(fan.status || "OK (3)");
          const pct = (fan.speedNum / maxRpm) * 100;

          return (
            <motion.div
              key={fan.name}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.5 + i * 0.05 }}
              className="glass-card rounded-lg px-3 py-2"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <StatusIndicator status={level} />
                  <span className="text-xs font-display font-bold text-foreground">{fan.name}</span>
                </div>
                <span className="text-xs font-mono text-neon-green font-bold">{fan.speed}</span>
              </div>

              {/* RPM Bar */}
              <div className="relative h-4 bg-secondary/50 rounded-md overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 1, delay: 0.6 + i * 0.05 }}
                  className="absolute inset-y-0 left-0 rounded-md"
                  style={{
                    background: `linear-gradient(90deg, hsl(110 100% 54% / 0.3), hsl(110 100% 54% / 0.7))`,
                    boxShadow: '0 0 12px hsl(110 100% 54% / 0.3)',
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-end pr-2">
                  <span className="text-[9px] font-mono text-muted-foreground">{Math.round(pct)}%</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default FanSection;
