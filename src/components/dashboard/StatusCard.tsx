import { motion } from 'framer-motion';
import { StatusLevel, parseStatus, ParsedStatus } from '@/data/serverData';

interface StatusIndicatorProps {
  status: StatusLevel;
  size?: 'sm' | 'md' | 'lg';
}

export const StatusIndicator = ({ status, size = 'md' }: StatusIndicatorProps) => {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  const colorClasses = {
    ok: 'bg-neon-green pulse-green',
    warning: 'bg-neon-amber pulse-amber',
    critical: 'bg-neon-red pulse-red',
    info: 'bg-neon-blue',
  };

  return (
    <span className={`inline-block rounded-full ${sizeClasses[size]} ${colorClasses[status]}`} />
  );
};

interface StatusCardProps {
  title: string;
  rawValue: string;
  icon?: React.ReactNode;
  delay?: number;
  parser?: (raw: string) => ParsedStatus;
}

const StatusCard = ({ title, rawValue, icon, delay = 0, parser }: StatusCardProps) => {
  const { text, level } = (parser || parseStatus)(rawValue);

  const borderColor = {
    ok: 'border-neon-green/30',
    warning: 'border-neon-amber/30',
    critical: 'border-neon-red/30',
    info: 'border-neon-blue/30',
  };

  const glowClass = {
    ok: 'glow-green',
    warning: 'glow-amber',
    critical: 'glow-red',
    info: '',
  };

  const textGlow = {
    ok: 'text-glow-green text-neon-green',
    warning: 'text-glow-amber text-neon-amber',
    critical: 'text-glow-red text-neon-red',
    info: 'text-neon-blue',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay }}
      className={`glass-card rounded-lg p-4 ${borderColor[level]} ${glowClass[level]} flex flex-col items-center gap-2 relative overflow-hidden`}
    >
      {/* Subtle top highlight */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
      
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-display uppercase tracking-wider text-muted-foreground">{title}</span>
      </div>
      
      <div className="flex items-center gap-2">
        <StatusIndicator status={level} size="lg" />
        <span className={`text-lg font-bold font-display ${textGlow[level]}`}>
          {text}
        </span>
      </div>
    </motion.div>
  );
};

export default StatusCard;
