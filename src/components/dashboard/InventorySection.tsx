import { motion } from 'framer-motion';
import { Info, ExternalLink } from 'lucide-react';

interface InventoryData {
  model: string;
  assetTag: string;
  serviceCode: string;
  biosVersion: string;
  biosDate: string;
  dracFirmware: string;
  dracUrl: string;
  dracVersion: string;
  systemName?: string;
  uptime?: string;
  systemDescription?: string;
  systemLocation?: string;
  systemContact?: string;
  os?: string;
}

interface Props {
  inventory: InventoryData;
}

const InventorySection = ({ inventory }: Props) => {
  const items = [
    { label: 'Modelo', value: inventory.model },
    { label: 'Asset Tag', value: inventory.assetTag },
    { label: 'Service Code / Serial', value: inventory.serviceCode },
    { label: 'BIOS', value: `${inventory.biosVersion}${inventory.biosDate ? ` (${inventory.biosDate})` : ''}` },
    { label: 'Firmware', value: inventory.dracFirmware },
    { label: 'Nome', value: inventory.systemName },
    { label: 'Uptime', value: inventory.uptime },
    { label: 'SO', value: inventory.os },
    { label: 'Local', value: inventory.systemLocation },
  ].filter(i => i.value && i.value.trim());

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.8 }}
      className="glass-card rounded-xl p-4 relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-muted-foreground/20 to-transparent" />

      <div className="flex items-center gap-2 mb-3">
        <Info className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Inventário / Informações
        </h2>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {items.map((item) => (
          <div key={item.label} className="text-xs font-mono">
            <span className="text-muted-foreground">{item.label}: </span>
            <span className="text-foreground font-bold">{item.value}</span>
          </div>
        ))}
        {inventory.dracUrl && (
          <div className="text-xs font-mono">
            <span className="text-muted-foreground">iDRAC URL: </span>
            <a
              href={inventory.dracUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-neon-cyan hover:underline inline-flex items-center gap-1"
            >
              {inventory.dracUrl}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default InventorySection;
