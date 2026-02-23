import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck, AlertTriangle, TrendingDown, Clock, RefreshCw, FileDown,
  CheckCircle, XCircle, Activity, BarChart3,
} from "lucide-react";
import { motion } from "framer-motion";
import { format, subDays, startOfMonth, endOfMonth, subMonths, differenceInSeconds, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { AlertInstance } from "@/hooks/useIncidents";

type Period = "current" | "previous";

/* ─── Helpers ─── */
function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h${m > 0 ? ` ${m}m` : ""}`;
}

/* ─── Hooks ─── */
function useSLAPolicies() {
  return useQuery({
    queryKey: ["sla-policies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sla_policies")
        .select("*")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useSLAAlerts(period: Period) {
  const range = useMemo(() => {
    const now = new Date();
    if (period === "current") return { start: startOfMonth(now), end: endOfMonth(now) };
    const prev = subMonths(now, 1);
    return { start: startOfMonth(prev), end: endOfMonth(prev) };
  }, [period]);

  return useQuery({
    queryKey: ["sla-alerts", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alert_instances")
        .select("*")
        .gte("opened_at", range.start.toISOString())
        .lte("opened_at", range.end.toISOString())
        .order("opened_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as AlertInstance[];
    },
  });
}

function useSLASweep() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("sla_sweep_breaches");
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["sla-alerts"] });
      toast({ title: `Compliance verificado — ${count} violação(ões) atualizada(s)` });
    },
    onError: (e) => toast({ variant: "destructive", title: "Erro", description: String(e) }),
  });
}

/* ─── Main Page ─── */
export default function SLAGovernance() {
  const [period, setPeriod] = useState<Period>("current");
  const { data: policies, isLoading: policiesLoading } = useSLAPolicies();
  const { data: alerts, isLoading: alertsLoading, refetch } = useSLAAlerts(period);
  const sweep = useSLASweep();

  const isLoading = policiesLoading || alertsLoading;

  /* ── Computed Metrics ── */
  const metrics = useMemo(() => {
    if (!alerts?.length) return { uptime: 100, breaches: 0, totalDownSeconds: 0, totalAlerts: 0, worstHosts: [] as { host: string; downSeconds: number; uptime: number }[], dailyUptime: [] as { day: string; uptime: number }[] };

    const now = new Date();
    const periodStart = period === "current" ? startOfMonth(now) : startOfMonth(subMonths(now, 1));
    const periodEnd = period === "current" ? now : endOfMonth(subMonths(now, 1));
    const totalPeriodSeconds = differenceInSeconds(periodEnd, periodStart);

    // Per-host downtime
    const hostDown: Record<string, number> = {};
    let breaches = 0;

    for (const a of alerts) {
      const host = (a.payload as any)?.hostname || (a.payload as any)?.host || a.dedupe_key;
      const start = new Date(a.opened_at);
      const end = a.resolved_at ? new Date(a.resolved_at) : now;
      const down = differenceInSeconds(end, start);
      hostDown[host] = (hostDown[host] || 0) + down;

      if (a.ack_breached_at || a.resolve_breached_at) breaches++;
    }

    // Global uptime
    const uniqueHosts = Object.keys(hostDown);
    const totalPossible = totalPeriodSeconds * Math.max(uniqueHosts.length, 1);
    const totalDown = Object.values(hostDown).reduce((s, v) => s + v, 0);
    const uptime = Math.max(0, ((totalPossible - totalDown) / totalPossible) * 100);

    // Worst 5
    const worstHosts = uniqueHosts
      .map((host) => ({
        host,
        downSeconds: hostDown[host],
        uptime: Math.max(0, ((totalPeriodSeconds - hostDown[host]) / totalPeriodSeconds) * 100),
      }))
      .sort((a, b) => a.uptime - b.uptime)
      .slice(0, 5);

    // Daily uptime (last 30 days)
    const dailyUptime: { day: string; uptime: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = subDays(now, i);
      const dayStr = format(day, "dd/MM");
      const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);
      const daySeconds = 86400;

      let dayDownSeconds = 0;
      let dayHosts = new Set<string>();

      for (const a of alerts) {
        const host = (a.payload as any)?.hostname || (a.payload as any)?.host || a.dedupe_key;
        const aStart = new Date(a.opened_at);
        const aEnd = a.resolved_at ? new Date(a.resolved_at) : now;

        // Check overlap with this day
        const overlapStart = Math.max(aStart.getTime(), dayStart.getTime());
        const overlapEnd = Math.min(aEnd.getTime(), dayEnd.getTime());
        if (overlapStart < overlapEnd) {
          dayDownSeconds += (overlapEnd - overlapStart) / 1000;
          dayHosts.add(host);
        }
      }

      const hostCount = Math.max(dayHosts.size, uniqueHosts.length, 1);
      const possibleDay = daySeconds * hostCount;
      dailyUptime.push({ day: dayStr, uptime: parseFloat(Math.max(0, ((possibleDay - dayDownSeconds) / possibleDay) * 100).toFixed(2)) });
    }

    return { uptime: parseFloat(uptime.toFixed(3)), breaches, totalDownSeconds: totalDown, totalAlerts: alerts.length, worstHosts, dailyUptime };
  }, [alerts, period]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-neon-green" />
            <h1 className="text-lg font-display font-bold text-foreground">SLA & Disponibilidade</h1>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="h-7 w-36 text-[10px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Mês Atual</SelectItem>
                <SelectItem value="previous">Mês Anterior</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-[10px]"
              onClick={() => sweep.mutate()}
              disabled={sweep.isPending}
            >
              <CheckCircle className="w-3 h-3" />
              {sweep.isPending ? "Verificando..." : "Check Compliance"}
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-[10px]" onClick={() => refetch()}>
              <RefreshCw className="w-3 h-3" /> Atualizar
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-[10px] opacity-50 cursor-not-allowed" disabled>
              <FileDown className="w-3 h-3" /> Exportar PDF
            </Button>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* ── Scorecards ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <ScoreCard
              icon={Activity}
              label="Uptime Global"
              value={isLoading ? null : `${metrics.uptime.toFixed(3)}%`}
              color={metrics.uptime >= 99.9 ? "text-neon-green" : metrics.uptime >= 99 ? "text-neon-amber" : "text-neon-red"}
              sub={isLoading ? "" : `${metrics.totalAlerts} incidentes no período`}
            />
            <ScoreCard
              icon={XCircle}
              label="Violações SLA"
              value={isLoading ? null : String(metrics.breaches)}
              color={metrics.breaches === 0 ? "text-neon-green" : "text-neon-red"}
              sub={isLoading ? "" : metrics.breaches === 0 ? "Nenhuma violação" : "Incidentes fora do prazo"}
            />
            <ScoreCard
              icon={Clock}
              label="Downtime Total"
              value={isLoading ? null : formatDuration(metrics.totalDownSeconds)}
              color="text-neon-amber"
              sub={isLoading ? "" : "Soma de indisponibilidade"}
            />
            <ScoreCard
              icon={BarChart3}
              label="Ativos Monitorados"
              value={isLoading ? null : String(metrics.worstHosts.length || "—")}
              color="text-neon-cyan"
              sub={isLoading ? "" : "Hosts com incidentes"}
            />
          </div>

          {/* ── Daily Uptime Chart ── */}
          <Card className="glass-card border-border/50">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-xs font-display uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5" /> Uptime Diário — Últimos 30 dias
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={metrics.dailyUptime} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <XAxis dataKey="day" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} interval={2} />
                    <YAxis domain={[95, 100]} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                      formatter={(value: number) => [`${value.toFixed(3)}%`, "Uptime"]}
                    />
                    <Bar dataKey="uptime" radius={[2, 2, 0, 0]} maxBarSize={14}>
                      {metrics.dailyUptime.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.uptime >= 99.9 ? "hsl(142 100% 50%)" : entry.uptime >= 99 ? "hsl(43 100% 50%)" : "hsl(0 90% 50%)"}
                          fillOpacity={0.7}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* ── Worst Hosts ── */}
            <Card className="glass-card border-border/50">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-xs font-display uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <TrendingDown className="w-3.5 h-3.5" /> Pior Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {isLoading ? (
                  <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                ) : metrics.worstHosts.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-xs">Nenhum incidente no período</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/30 hover:bg-transparent">
                        <TableHead className="text-[10px] font-display uppercase py-1 px-2 h-auto">Host</TableHead>
                        <TableHead className="text-[10px] font-display uppercase py-1 px-2 h-auto text-right">Downtime</TableHead>
                        <TableHead className="text-[10px] font-display uppercase py-1 px-2 h-auto text-right">Uptime</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {metrics.worstHosts.map((h) => (
                        <TableRow key={h.host} className="border-border/20">
                          <TableCell className="text-xs font-mono py-1.5 px-2 truncate max-w-[200px]">{h.host}</TableCell>
                          <TableCell className="text-xs font-mono py-1.5 px-2 text-right text-neon-amber">{formatDuration(h.downSeconds)}</TableCell>
                          <TableCell className="text-xs font-mono py-1.5 px-2 text-right">
                            <span className={h.uptime >= 99.9 ? "text-neon-green" : h.uptime >= 99 ? "text-neon-amber" : "text-neon-red"}>
                              {h.uptime.toFixed(3)}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* ── SLA Policies ── */}
            <Card className="glass-card border-border/50">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-xs font-display uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5" /> Políticas de SLA
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {policiesLoading ? (
                  <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                ) : !policies?.length ? (
                  <div className="text-center py-6 text-muted-foreground text-xs">Nenhuma política configurada</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/30 hover:bg-transparent">
                        <TableHead className="text-[10px] font-display uppercase py-1 px-2 h-auto">Política</TableHead>
                        <TableHead className="text-[10px] font-display uppercase py-1 px-2 h-auto text-right">Resposta</TableHead>
                        <TableHead className="text-[10px] font-display uppercase py-1 px-2 h-auto text-right">Resolução</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {policies.map((p) => (
                        <TableRow key={p.id} className="border-border/20">
                          <TableCell className="text-xs py-1.5 px-2 font-medium">{p.name}</TableCell>
                          <TableCell className="text-xs font-mono py-1.5 px-2 text-right text-neon-cyan">{formatDuration(p.ack_target_seconds)}</TableCell>
                          <TableCell className="text-xs font-mono py-1.5 px-2 text-right text-neon-green">{formatDuration(p.resolve_target_seconds)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Recent Incidents with SLA Badges ── */}
          <Card className="glass-card border-border/50">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-xs font-display uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" /> Incidentes no Período
                {!isLoading && (
                  <Badge variant="outline" className="text-[9px] font-mono ml-1">{alerts?.length ?? 0}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-2">
              {alertsLoading ? (
                <div className="px-4 space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : !alerts?.length ? (
                <div className="text-center py-8 text-muted-foreground text-xs">Sem incidentes no período selecionado</div>
              ) : (
                <ScrollArea className="max-h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/30 hover:bg-transparent">
                        <TableHead className="text-[10px] font-display uppercase py-1 px-3 h-auto">Sev</TableHead>
                        <TableHead className="text-[10px] font-display uppercase py-1 px-3 h-auto">Host</TableHead>
                        <TableHead className="text-[10px] font-display uppercase py-1 px-3 h-auto">Alerta</TableHead>
                        <TableHead className="text-[10px] font-display uppercase py-1 px-3 h-auto">Status</TableHead>
                        <TableHead className="text-[10px] font-display uppercase py-1 px-3 h-auto">Duração</TableHead>
                        <TableHead className="text-[10px] font-display uppercase py-1 px-3 h-auto">SLA</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {alerts.slice(0, 100).map((a) => {
                        const host = (a.payload as any)?.hostname || (a.payload as any)?.host || "—";
                        const isDependency = (a.payload as any)?.effective_status === "ISOLATED";
                        const slaViolated = !!a.ack_breached_at || !!a.resolve_breached_at;
                        const duration = differenceInSeconds(
                          a.resolved_at ? new Date(a.resolved_at) : new Date(),
                          new Date(a.opened_at)
                        );

                        return (
                          <TableRow key={a.id} className={`border-border/20 ${slaViolated ? "bg-neon-red/5" : ""}`}>
                            <TableCell className="py-1.5 px-3">
                              <SeverityDot severity={a.severity} />
                            </TableCell>
                            <TableCell className="text-xs font-mono py-1.5 px-3 truncate max-w-[160px]">
                              {host}
                              {isDependency && (
                                <Badge variant="outline" className="ml-1 text-[7px] text-neon-cyan border-neon-cyan/30">DEP</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs py-1.5 px-3 truncate max-w-[240px]">{a.title}</TableCell>
                            <TableCell className="py-1.5 px-3">
                              <StatusBadge status={a.status} />
                            </TableCell>
                            <TableCell className="text-xs font-mono py-1.5 px-3 text-muted-foreground">{formatDuration(duration)}</TableCell>
                            <TableCell className="py-1.5 px-3">
                              {slaViolated ? (
                                <Badge className="text-[8px] bg-neon-red/20 text-neon-red border-neon-red/30 hover:bg-neon-red/30">VIOLADO</Badge>
                              ) : a.status !== "resolved" ? (
                                <Badge variant="outline" className="text-[8px] text-neon-green border-neon-green/30">No Prazo</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[8px] text-muted-foreground">OK</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}

/* ─── Sub-components ─── */
function ScoreCard({ icon: Icon, label, value, color, sub }: { icon: React.ElementType; label: string; value: string | null; color: string; sub: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="glass-card border-border/50">
        <CardContent className="p-4 flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-card/80 border border-border/30`}>
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-display uppercase tracking-wider text-muted-foreground">{label}</p>
            {value === null ? (
              <Skeleton className="h-6 w-20 mt-1" />
            ) : (
              <p className={`text-xl font-display font-bold ${color}`}>{value}</p>
            )}
            <p className="text-[9px] text-muted-foreground truncate">{sub}</p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    disaster: "bg-red-500",
    high: "bg-orange-500",
    average: "bg-neon-amber",
    warning: "bg-yellow-400",
    info: "bg-neon-cyan",
  };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[severity] || "bg-muted"}`} />;
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    open: { label: "Aberto", cls: "text-neon-red border-neon-red/30" },
    ack: { label: "ACK", cls: "text-neon-blue border-neon-blue/30" },
    resolved: { label: "Resolvido", cls: "text-neon-green border-neon-green/30" },
  };
  const c = cfg[status] || cfg.open;
  return <Badge variant="outline" className={`text-[8px] ${c.cls}`}>{c.label}</Badge>;
}
