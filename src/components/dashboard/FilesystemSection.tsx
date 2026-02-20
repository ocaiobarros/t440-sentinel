import { motion } from 'framer-motion';
import { HardDrive } from 'lucide-react';

interface FilesystemData {
  mountpoint: string;
  total: string;
  used: string;
}

interface Props {
  filesystems: FilesystemData[];
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

const FilesystemSection = ({ filesystems }: Props) => {
  if (filesystems.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
      className="space-y-4"
    >
      <div className="flex items-center gap-2">
        <HardDrive className="w-5 h-5 text-neon-amber" />
        <h2 className="font-display text-sm font-bold uppercase tracking-wider text-neon-amber">
          Filesystems
        </h2>
        <div className="flex-1 h-px bg-gradient-to-r from-neon-amber/30 to-transparent ml-2" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filesystems.map((fs) => {
          const total = parseFloat(fs.total);
          const used = parseFloat(fs.used);
          const pct = total > 0 ? (used / total) * 100 : 0;

          return (
            <div key={fs.mountpoint} className="glass-card rounded-xl p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neon-amber/20 to-transparent" />

              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-foreground font-bold">{fs.mountpoint}</span>
                <span className={`text-xs font-bold font-mono ${pct > 90 ? 'text-neon-red' : pct > 70 ? 'text-neon-amber' : 'text-neon-green'}`}>
                  {pct.toFixed(1)}%
                </span>
              </div>

              <div className="h-2 bg-background/50 rounded-full overflow-hidden border border-border/30 mb-2">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${pct > 90 ? 'bg-neon-red' : pct > 70 ? 'bg-neon-amber' : 'bg-neon-green'}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                <span>Usado: {formatBytes(fs.used)}</span>
                <span>Total: {formatBytes(fs.total)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default FilesystemSection;
