import { motion } from 'framer-motion';
import { Server, Zap } from 'lucide-react';

const DashboardHeader = () => {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="glass-card rounded-xl p-4 mb-6 relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neon-green/40 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neon-green/20 to-transparent" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Server className="w-8 h-8 text-neon-green" />
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-neon-green rounded-full pulse-green" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-wider">
              <span className="text-neon-green text-glow-green">FLOWPULSE</span>
              <span className="text-muted-foreground mx-2">|</span>
              <span className="text-foreground">iDRAC</span>
              <span className="text-muted-foreground mx-2">—</span>
              <span className="text-neon-cyan text-glow-cyan">T440-MDP</span>
            </h1>
            <p className="text-xs text-muted-foreground font-mono mt-1">
              Dell PowerEdge T440 • Monitoramento em Tempo Real
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-xs text-muted-foreground font-mono">ATUALIZAÇÃO</div>
            <div className="text-sm font-mono text-foreground">4 min</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground font-mono">HORA LOCAL</div>
            <div className="text-sm font-mono text-neon-green">{timeStr}</div>
          </div>
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-neon-green/10 border border-neon-green/20">
            <Zap className="w-3 h-3 text-neon-green" />
            <span className="text-xs font-display text-neon-green">ATIVO</span>
          </div>
        </div>
      </div>
    </motion.header>
  );
};

export default DashboardHeader;
