import { motion } from 'framer-motion';
import { HardDrive, Database, Shield, Battery } from 'lucide-react';
import { parseStatus, parseDiskState, parseRaidLevel, parseRaidVolumeState } from '@/data/serverData';
import { StatusIndicator } from './StatusCard';

function formatSizeHuman(raw: string): string {
  if (!raw || raw === "0" || raw === "") return "—";
  // Already formatted (e.g. "1.45 TB")
  if (/[A-Za-z]/.test(raw) && /\d/.test(raw)) return raw;
  const num = parseFloat(raw);
  if (isNaN(num) || num === 0) return "—";
  if (num >= 1024 ** 4) return `${(num / (1024 ** 4)).toFixed(2)} TB`;
  if (num >= 1024 ** 3) return `${(num / (1024 ** 3)).toFixed(2)} GB`;
  if (num >= 1024 ** 2) return `${(num / (1024 ** 2)).toFixed(2)} MB`;
  if (num >= 1024) return `${(num / 1024).toFixed(2)} KB`;
  return `${num} B`;
}

interface DiskData {
  id: number;
  size: string;
  state: string;
  status: string;
  manufacturer: string;
  model: string;
  name: string;
  serial: string;
  mediaType?: string;
  smartStatus?: string;
}

interface VolumeData {
  id: number;
  name: string;
  size: string;
  state: string;
  status: string;
  vdState: string;
  layoutType?: string;
  readPolicy?: string;
  writePolicy?: string;
}

interface RaidData {
  name: string;
  status: string;
  firmware: string;
  batteryStatus?: string;
}

interface Props {
  disks: DiskData[];
  raidController: RaidData;
  volumes: VolumeData[];
}

const StorageSection = ({ disks, raidController, volumes }: Props) => {
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
            {disks.map((d) => {
              const mediaLabel = d.mediaType
                ? (d.mediaType.toLowerCase().includes("ssd") || d.mediaType.includes("3") ? "SSD" : "HDD")
                : (d.name?.toLowerCase().includes("solid state") ? "SSD" : "HDD");
              const displayName = d.name?.replace(/^(Physical Disk|Solid State Disk)\s+/, '') || `Disco ${d.id}`;
              return (
                <div key={d.id} className="flex items-center justify-between text-xs font-mono py-1 border-b border-border/30 last:border-0">
                  <span className="text-muted-foreground" title={d.name}>{displayName}</span>
                  <span className={`font-bold ${mediaLabel === 'SSD' ? 'text-neon-cyan' : 'text-neon-amber'}`}>{mediaLabel}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Integridade */}
        <div className="glass-card rounded-xl p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neon-green/20 to-transparent" />
          <h3 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <Shield className="w-3.5 h-3.5" /> Integridade
          </h3>
          <div className="space-y-1.5">
            {disks.map((d) => {
              const statusText = d.status || d.smartStatus || "OK (3)";
              const { level } = parseStatus(statusText);
              const displayName = d.name?.replace(/^(Physical Disk|Solid State Disk)\s+/, '') || `Disco ${d.id}`;
              return (
                <div key={d.id} className="flex items-center justify-between text-xs font-mono py-1 border-b border-border/30 last:border-0">
                  <span className="text-muted-foreground">{displayName}</span>
                  <div className="flex items-center gap-1.5">
                    <StatusIndicator status={level} size="sm" />
                    <span className={level === 'ok' ? 'text-neon-green' : 'text-neon-red'}>{parseStatus(statusText).text}</span>
                    {d.smartStatus && (
                      <span className="text-[9px] text-muted-foreground ml-1">SMART: {parseStatus(d.smartStatus).text}</span>
                    )}
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
            <HardDrive className="w-3.5 h-3.5" /> Tamanho
          </h3>
          <div className="space-y-1.5">
            {disks.map((d) => {
              const displayName = d.name?.replace(/^(Physical Disk|Solid State Disk)\s+/, '') || `Disco ${d.id}`;
              return (
                <div key={d.id} className="flex items-center justify-between text-xs font-mono py-1 border-b border-border/30 last:border-0">
                  <span className="text-muted-foreground">{displayName}</span>
                  <span className="text-foreground font-bold">{formatSizeHuman(d.size) || "—"}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* RAID / Volumes */}
        <div className="glass-card rounded-xl p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
          <h3 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
            Configuração RAID
          </h3>

          {/* RAID Controller */}
          {raidController.name && (
            <div className="glass-card rounded-lg p-2.5 mb-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-muted-foreground truncate max-w-[140px]" title={raidController.name}>{raidController.name}</span>
                <div className="flex items-center gap-1">
                  <StatusIndicator status={parseStatus(raidController.status || "OK (3)").level} size="sm" />
                  <span className="text-neon-green font-bold font-display">{parseStatus(raidController.status || "OK").text}</span>
                </div>
              </div>
              {raidController.firmware && (
                <div className="text-[10px] font-mono text-muted-foreground mt-1">FW: {raidController.firmware}</div>
              )}
              {raidController.batteryStatus && (
                <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground mt-1">
                  <Battery className="w-3 h-3" />
                  Bateria: <span className="text-neon-green">{parseStatus(raidController.batteryStatus).text}</span>
                </div>
              )}
            </div>
          )}

          {/* Volumes */}
          <div className="space-y-2">
            {volumes.map((v) => {
              const { level } = parseStatus(v.status || "OK (3)");
              return (
                <div key={v.id} className="glass-card rounded-lg p-2.5 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-foreground font-bold truncate max-w-[100px]" title={v.name}>{v.name}</span>
                    <div className="flex items-center gap-1">
                      <StatusIndicator status={level} size="sm" />
                      <span className="text-neon-green font-display text-[10px]">{parseRaidVolumeState(v.vdState || v.status || "Online").text}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                    <span>{v.layoutType ? parseRaidLevel(v.layoutType).text : (v.state ? parseRaidLevel(v.state).text : "")}</span>
                    <span className="text-foreground">{formatSizeHuman(v.size)}</span>
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
