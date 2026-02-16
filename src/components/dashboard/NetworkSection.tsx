import { motion } from 'framer-motion';
import { Network } from 'lucide-react';
import { nics, parseStatus } from '@/data/serverData';
import { StatusIndicator } from './StatusCard';

const NetworkSection = () => {
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
              <th className="text-left py-2 px-2 text-muted-foreground font-display text-[10px] uppercase tracking-wider">NIC</th>
              <th className="text-left py-2 px-2 text-muted-foreground font-display text-[10px] uppercase tracking-wider">Nome</th>
              <th className="text-left py-2 px-2 text-muted-foreground font-display text-[10px] uppercase tracking-wider">MAC</th>
              <th className="text-center py-2 px-2 text-muted-foreground font-display text-[10px] uppercase tracking-wider">Link</th>
              <th className="text-center py-2 px-2 text-muted-foreground font-display text-[10px] uppercase tracking-wider">Saúde</th>
            </tr>
          </thead>
          <tbody>
            {nics.map((nic) => {
              const connStatus = parseStatus(nic.connectionStatus);
              const healthStatus = parseStatus(nic.status);
              // Shorten name
              const shortName = nic.name.split(' - ')[0];

              return (
                <tr key={nic.id} className="border-b border-border/20 hover:bg-accent/20 transition-colors">
                  <td className="py-2 px-2 text-foreground font-bold">{nic.id}</td>
                  <td className="py-2 px-2 text-muted-foreground text-[11px] max-w-[200px] truncate">{shortName}</td>
                  <td className="py-2 px-2 text-muted-foreground">{nic.mac}</td>
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
