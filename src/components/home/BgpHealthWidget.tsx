import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Globe, ChevronRight, Wifi, WifiOff } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";

/* Mock 24h prefix data */
function generatePrefixTrend() {
  const data = [];
  let val = 850000;
  for (let i = 24; i >= 0; i--) {
    val += (Math.random() - 0.48) * 15000;
    data.push({ h: `${i}h`, v: Math.round(val) });
  }
  return data.reverse();
}

const MOCK_BGP = { established: 13, down: 1, total: 14 };

export default function BgpHealthWidget() {
  const navigate = useNavigate();
  const prefixData = useMemo(generatePrefixTrend, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
      onClick={() => navigate("/app/monitoring/bgp")}
      className="glass-card rounded-xl p-4 cursor-pointer group
        hover:border-primary/30 transition-all duration-300
        hover:shadow-[0_0_16px_hsl(var(--primary)/0.1)]"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-[hsl(var(--neon-cyan))]" />
          <span className="text-xs font-semibold text-foreground">Core BGP Status</span>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Sessions summary */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <Wifi className="h-3.5 w-3.5 text-[hsl(var(--neon-green))]" />
          <span className="text-lg font-bold font-mono text-[hsl(var(--neon-green))]">{MOCK_BGP.established}</span>
          <span className="text-[10px] text-muted-foreground">Established</span>
        </div>
        <div className="flex items-center gap-1.5">
          <WifiOff className="h-3.5 w-3.5 text-[hsl(var(--neon-red))]" />
          <span className="text-lg font-bold font-mono text-[hsl(var(--neon-red))]">{MOCK_BGP.down}</span>
          <span className="text-[10px] text-muted-foreground">Down</span>
        </div>
      </div>

      {/* Sparkline — Prefixes 24h */}
      <div className="h-[60px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={prefixData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="bgpPrefixGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(186 100% 50%)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(186 100% 50%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={["dataMin - 5000", "dataMax + 5000"]} />
            <Area
              type="monotone"
              dataKey="v"
              stroke="hsl(186 100% 50%)"
              strokeWidth={1.5}
              fill="url(#bgpPrefixGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[9px] text-muted-foreground mt-1 text-right font-mono">
        Prefixos recebidos · 24h
      </p>
    </motion.div>
  );
}
