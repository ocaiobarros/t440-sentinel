import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle, ShieldCheck, Activity, Wifi,
  Server, MapPin, TrendingUp, Clock, Zap,
  ChevronRight, BarChart3, Globe2, BookOpen, Send
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip } from "recharts";
import BgpHealthWidget from "@/components/home/BgpHealthWidget";

/* ── Animated counter ── */
function AnimatedCounter({ target, duration = 1200 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return <>{count}</>;
}

/* ── Motion helpers ── */
const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

/* ── Mock uptime data ── */
function generateUptimeData() {
  const data = [];
  const now = Date.now();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    data.push({
      day: d.toLocaleDateString(undefined, { weekday: "short" }),
      uptime: 95 + Math.random() * 5,
    });
  }
  return data;
}

export default function OperationsHome() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [stats, setStats] = useState({ incidents: 0, sla: 99.8, capacity: 0, viability: 0 });
  const [activities, setActivities] = useState<{ text: string; time: string; type: string }[]>([]);
  const uptimeData = useMemo(generateUptimeData, []);

  // Load real counts from DB
  useEffect(() => {
    (async () => {
      const [incRes, ctoRes] = await Promise.all([
        supabase.from("alert_instances").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("flow_map_ctos").select("id, occupied_ports, capacity", { count: "exact" }),
      ]);
      
      const openIncidents = incRes.count ?? 0;
      const ctos = ctoRes.data ?? [];
      const totalPorts = ctos.reduce((s, c) => s + parseInt(String(c.capacity) || "0"), 0);
      const usedPorts = ctos.reduce((s, c) => s + (c.occupied_ports || 0), 0);
      const capacityPct = totalPorts > 0 ? Math.round((usedPorts / totalPorts) * 100) : 0;

      setStats(prev => ({ ...prev, incidents: openIncidents, capacity: capacityPct }));

      // Recent activities from audit logs
      const { data: logs } = await supabase
        .from("flow_audit_logs")
        .select("action, table_name, created_at, user_email")
        .order("created_at", { ascending: false })
        .limit(8);

      if (logs?.length) {
        setActivities(logs.map(l => ({
          text: `${l.user_email?.split("@")[0] || "Sistema"} → ${l.action} em ${l.table_name}`,
          time: new Date(l.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
          type: l.action === "DELETE" ? "danger" : l.action === "INSERT" ? "success" : "info",
        })));
      }
    })();
  }, []);

  const kpiCards = [
    {
      label: t("operations.openIncidents"),
      value: stats.incidents,
      icon: AlertTriangle,
      color: stats.incidents > 0 ? "text-[hsl(var(--neon-red))]" : "text-[hsl(var(--neon-green))]",
      glow: stats.incidents > 0 ? "glow-red" : "glow-green",
      onClick: () => navigate("/app/operations/incidents"),
    },
    {
      label: t("operations.slaUptime"),
      value: stats.sla,
      suffix: "%",
      icon: ShieldCheck,
      color: "text-[hsl(var(--neon-green))]",
      glow: "glow-green",
      onClick: () => navigate("/app/governance/sla"),
    },
    {
      label: t("operations.capacityOccupied"),
      value: stats.capacity,
      suffix: "%",
      icon: BarChart3,
      color: stats.capacity > 80 ? "text-[hsl(var(--neon-amber))]" : "text-[hsl(var(--neon-cyan))]",
      glow: stats.capacity > 80 ? "glow-amber" : "glow-cyan",
      onClick: () => navigate("/app/engineering/capacity"),
    },
    {
      label: t("operations.viabilityToday"),
      value: stats.viability,
      icon: MapPin,
      color: "text-[hsl(var(--neon-blue))]",
      glow: "glow-blue",
      onClick: () => navigate("/app/engineering/viability"),
    },
  ];

  const quickLinks = [
    { label: "FlowMap", icon: Globe2, path: "/app/operations/flowmap" },
    { label: t("sidebar.dashboards"), icon: Activity, path: "/app/monitoring/dashboards" },
    { label: t("operations.inventory"), icon: Server, path: "/app/engineering/inventory" },
    { label: t("operations.connections"), icon: Wifi, path: "/app/settings/connections" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center gap-3"
      >
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Zap className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground font-display tracking-tight">
            {t("operations.title")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("operations.subtitle")} · {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
      </motion.div>

      {/* ── Bento Grid ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {/* KPI Cards */}
        {kpiCards.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            custom={i}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            onClick={kpi.onClick}
            className={`glass-card rounded-xl p-4 cursor-pointer group
              hover:border-primary/30 transition-all duration-300
              hover:shadow-[0_0_20px_hsl(var(--primary)/0.12)]`}
          >
            <div className="flex items-center justify-between mb-3">
              <kpi.icon className={`h-5 w-5 ${kpi.color} transition-transform group-hover:scale-110`} />
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className={`text-2xl md:text-3xl font-bold font-mono ${kpi.color}`}>
              <AnimatedCounter target={typeof kpi.value === "number" ? kpi.value : 0} />
              {kpi.suffix && <span className="text-lg ml-0.5">{kpi.suffix}</span>}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 uppercase tracking-wider">
              {kpi.label}
            </p>
          </motion.div>
        ))}
      </div>

      {/* ── Main content row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Uptime Chart — spans 2 cols */}
        <motion.div
          custom={4}
          initial="hidden"
          animate="visible"
          variants={cardVariants}
          className="lg:col-span-2 glass-card rounded-xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[hsl(var(--neon-cyan))]" />
              <h2 className="text-sm font-semibold text-foreground">{t("operations.uptimeLast7Days")}</h2>
            </div>
            <span className="text-xs text-muted-foreground font-mono">avg {(uptimeData.reduce((s, d) => s + d.uptime, 0) / uptimeData.length).toFixed(2)}%</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={uptimeData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="uptimeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(186 100% 50%)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(186 100% 50%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="day"
                tick={{ fill: "hsl(215 15% 40%)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[90, 100]}
                tick={{ fill: "hsl(215 15% 40%)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <RechartsTooltip
                contentStyle={{
                  background: "hsl(220 35% 8%)",
                  border: "1px solid hsl(215 20% 16%)",
                  borderRadius: "8px",
                  fontSize: 12,
                }}
                labelStyle={{ color: "hsl(210 20% 92%)" }}
                formatter={(v: number) => [`${v.toFixed(2)}%`, "Uptime"]}
              />
              <Area
                type="monotone"
                dataKey="uptime"
                stroke="hsl(186 100% 50%)"
                strokeWidth={2}
                fill="url(#uptimeGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Activity Feed */}
        <motion.div
          custom={5}
          initial="hidden"
          animate="visible"
          variants={cardVariants}
          className="glass-card rounded-xl p-5 flex flex-col"
        >
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-[hsl(var(--neon-amber))]" />
            <h2 className="text-sm font-semibold text-foreground">{t("operations.recentActivity")}</h2>
          </div>
          <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[220px] pr-1">
            {activities.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">{t("operations.noRecentActivity")}</p>
            ) : (
              activities.map((a, i) => (
                <div key={i} className="flex items-start gap-2.5 group">
                  <div className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${
                    a.type === "danger" ? "bg-[hsl(var(--neon-red))]" :
                    a.type === "success" ? "bg-[hsl(var(--neon-green))]" :
                    "bg-[hsl(var(--neon-blue))]"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground/80 truncate">{a.text}</p>
                    <p className="text-[10px] text-muted-foreground">{a.time}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>

      {/* ── Announcement Banner ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass-card rounded-xl p-4 border-primary/20 bg-primary/[0.03] flex items-center gap-4 cursor-pointer hover:border-primary/40 transition-all"
        onClick={() => navigate("/app/docs")}
      >
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{t("operations.helpCenterTitle")}</p>
          <p className="text-[11px] text-muted-foreground">{t("operations.helpCenterDesc")}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); navigate("/app/docs"); }}
          className="hidden sm:flex items-center gap-1.5 text-[10px] text-primary font-semibold shrink-0 hover:underline"
        >
          <Send className="h-3 w-3" />
          {t("operations.botManual")}
        </button>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </motion.div>

      {/* ── BGP Health + Quick Links row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BgpHealthWidget />

        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-3">
          {quickLinks.map((link) => (
          <button
            key={link.label}
            onClick={() => navigate(link.path)}
            className="glass-card rounded-xl p-4 flex items-center gap-3 group
              hover:border-primary/30 transition-all duration-300
              hover:shadow-[0_0_16px_hsl(var(--primary)/0.1)]
              text-left"
          >
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center
              group-hover:bg-primary/20 transition-colors">
              <link.icon className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{link.label}</p>
              <p className="text-[10px] text-muted-foreground">{t("operations.accessModule")}</p>
            </div>
          </button>
          ))}
        </div>
      </div>
    </div>
  );
}
