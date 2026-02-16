import { motion } from 'framer-motion';
import { Thermometer } from 'lucide-react';
import { temperatures, temperatureHistory, parseStatus } from '@/data/serverData';
import { StatusIndicator } from './StatusCard';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

const TempCard = ({ label, value, status }: { label: string; value: string; status: string }) => {
  const { level } = parseStatus(status);
  const numVal = parseInt(value);
  
  return (
    <div className="glass-card rounded-lg p-3 flex items-center justify-between gap-3">
      <div>
        <div className="text-xs text-muted-foreground font-mono uppercase">{label}</div>
        <div className="text-2xl font-bold font-mono text-foreground mt-1">
          {numVal}<span className="text-sm text-muted-foreground ml-1">°C</span>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <StatusIndicator status={level} size="lg" />
        <span className={`text-xs font-display font-bold ${level === 'ok' ? 'text-neon-green' : level === 'warning' ? 'text-neon-amber' : 'text-neon-red'}`}>
          {parseStatus(status).text}
        </span>
      </div>
    </div>
  );
};

const TemperatureSection = () => {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="glass-card rounded-xl p-5 relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neon-amber/30 to-transparent" />
      
      <div className="flex items-center gap-2 mb-4">
        <Thermometer className="w-5 h-5 text-neon-amber" />
        <h2 className="font-display text-sm font-bold uppercase tracking-wider text-neon-amber text-glow-amber">
          Temperatura
        </h2>
      </div>

      {/* Chart */}
      <div className="h-44 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={temperatureHistory}>
            <defs>
              <linearGradient id="cpu1Grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(110 100% 54%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(110 100% 54%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="cpu2Grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(180 100% 50%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(180 100% 50%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="inletGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(43 100% 50%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(43 100% 50%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 15% 18%)" />
            <XAxis dataKey="time" tick={{ fill: 'hsl(215 10% 50%)', fontSize: 10, fontFamily: 'JetBrains Mono' }} stroke="hsl(220 15% 18%)" />
            <YAxis domain={[15, 75]} tick={{ fill: 'hsl(215 10% 50%)', fontSize: 10, fontFamily: 'JetBrains Mono' }} stroke="hsl(220 15% 18%)" />
            <Tooltip
              contentStyle={{ background: 'hsl(220 20% 10%)', border: '1px solid hsl(220 15% 22%)', borderRadius: 8, fontFamily: 'JetBrains Mono', fontSize: 11 }}
              labelStyle={{ color: 'hsl(180 10% 88%)' }}
            />
            <Area type="monotone" dataKey="cpu1" stroke="hsl(110 100% 54%)" fill="url(#cpu1Grad)" strokeWidth={2} name="CPU1" />
            <Area type="monotone" dataKey="cpu2" stroke="hsl(180 100% 50%)" fill="url(#cpu2Grad)" strokeWidth={2} name="CPU2" />
            <Area type="monotone" dataKey="inlet" stroke="hsl(43 100% 50%)" fill="url(#inletGrad)" strokeWidth={2} name="Inlet" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Temp cards */}
      <div className="grid grid-cols-3 gap-3">
        <TempCard label="CPU1" value={temperatures.cpu1.value} status={temperatures.cpu1.status} />
        <TempCard label="CPU2" value={temperatures.cpu2.value} status={temperatures.cpu2.status} />
        <TempCard label="Inlet" value={temperatures.inlet.value} status={temperatures.inlet.status} />
      </div>
    </motion.div>
  );
};

export default TemperatureSection;
