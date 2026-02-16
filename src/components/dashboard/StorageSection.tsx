import { motion } from 'framer-motion';
import { HardDrive, Database, Shield } from 'lucide-react';
import { disks, raidController, volumes, parseStatus } from '@/data/serverData';
import { StatusIndicator } from './StatusCard';

const StorageSection = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.6 }}
      className="space-y-4"
    >
      {/* Section Title */}
      <div className="flex items-center gap-2">
        <HardDrive className="w-5 h-5 text-neon-blue" />
        <h2 className="font-display text-sm font-bold uppercase tracking-wider text-neon-blue">
          Armazenamento
        </h2>
        <div className="flex-1 h-px bg-gradient-to-r from-neon-blue/30 to-transparent ml-2" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Tipo de Mídia */}
        <div className="glass-card rounded-xl p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neon-blue/20 to-transparent" />
          <h3 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <Database className="w-3.5 h-3.5" /> Tipo de Mídia
          </h3>
          <div className="space-y-1.5">
            {disks.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-xs font-mono py-1 border-b border-border/30 last:border-0">
                <span className="text-muted-foreground">Disco {d.id}</span>
                <span className="text-neon-cyan font-bold">SSD</span>
              </div>
            ))}
          </div>
        </div>

        {/* Integridade */}
        <div className="glass-card rounded-xl p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neon-green/20 to-transparent" />
          <h3 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <Shield className="w-3.5 h-3.5" /> Integridade do Disco
          </h3>
          <div className="space-y-1.5">
            {disks.map((d) => {
              const { level } = parseStatus(d.status);
              return (
                <div key={d.id} className="flex items-center justify-between text-xs font-mono py-1 border-b border-border/30 last:border-0">
                  <span className="text-muted-foreground">Disco {d.id}</span>
                  <div className="flex items-center gap-1.5">
                    <StatusIndicator status={level} size="sm" />
                    <span className={level === 'ok' ? 'text-neon-green' : 'text-neon-red'}>{parseStatus(d.status).text}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tamanho */}
        <div className="glass-card rounded-xl p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neon-amber/20 to-transparent" />
          <h3 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <HardDrive className="w-3.5 h-3.5" /> Tamanho do Disco
          </h3>
          <div className="space-y-1.5">
            {disks.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-xs font-mono py-1 border-b border-border/30 last:border-0">
                <span className="text-muted-foreground">Disco {d.id}</span>
                <span className="text-foreground font-bold">{d.size}</span>
              </div>
            ))}
          </div>
        </div>

        {/* RAID / Volumes */}
        <div className="glass-card rounded-xl p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
          <h3 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
            Configuração RAID
          </h3>

          {/* RAID Controller */}
          <div className="glass-card rounded-lg p-2.5 mb-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-muted-foreground">RAID Controller</span>
              <div className="flex items-center gap-1">
                <StatusIndicator status={parseStatus(raidController.status).level} size="sm" />
                <span className="text-neon-green font-bold font-display">{parseStatus(raidController.status).text}</span>
              </div>
            </div>
            <div className="text-[10px] font-mono text-muted-foreground mt-1">FW: {raidController.firmware}</div>
          </div>

          {/* Volumes */}
          <div className="space-y-2">
            {volumes.map((v) => {
              const stateClean = parseStatus(v.state).text;
              const { level } = parseStatus(v.status);
              return (
                <div key={v.id} className="glass-card rounded-lg p-2.5 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-foreground font-bold">Volume {v.id}</span>
                    <div className="flex items-center gap-1">
                      <StatusIndicator status={level} size="sm" />
                      <span className="text-neon-green font-display text-[10px]">{parseStatus(v.vdState).text}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                    <span>{stateClean}</span>
                    <span className="text-foreground">{v.size}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default StorageSection;
