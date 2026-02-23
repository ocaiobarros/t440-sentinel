import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  HardDrive, AlertTriangle, TrendingUp, Gauge, Server, Wifi, Network,
  Search, Package, MapPin, Zap,
} from "lucide-react";
import { motion } from "framer-motion";

/* ── types ── */
interface CtoRow {
  id: string;
  name: string;
  capacity: string;
  occupied_ports: number;
  status_calculated: string;
  map_id: string;
  lat: number;
  lon: number;
  created_at: string;
}

interface MapRow {
  id: string;
  name: string;
}

/* ── helpers ── */
function occupancyPct(occupied: number, capacity: string): number {
  const cap = parseInt(capacity, 10) || 1;
  return Math.min(100, Math.round((occupied / cap) * 100));
}

function occupancyColor(pct: number): string {
  if (pct >= 90) return "text-red-400";
  if (pct >= 70) return "text-amber-400";
  return "text-emerald-400";
}

function barColor(pct: number): string {
  if (pct >= 90) return "#f87171";
  if (pct >= 70) return "#fbbf24";
  return "#34d399";
}

/* ═══════════════════════════════════════════ */
export default function CapacityPage() {
  const [selectedMapId, setSelectedMapId] = useState("all");
  const [threshold, setThreshold] = useState(80);
  const [search, setSearch] = useState("");

  /* ── queries ── */
  const { data: maps } = useQuery({
    queryKey: ["capacity-maps"],
    queryFn: async () => {
      const { data, error } = await supabase.from("flow_maps").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as MapRow[];
    },
  });

  const { data: ctos, isLoading } = useQuery({
    queryKey: ["capacity-ctos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flow_map_ctos")
        .select("id, name, capacity, occupied_ports, status_calculated, map_id, lat, lon, created_at")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CtoRow[];
    },
  });

  const { data: viabilityHistory } = useQuery({
    queryKey: ["capacity-viability-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flow_map_reservas")
        .select("id, lat, lon, map_id, created_at")
        .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  /* ── computed ── */
  const filtered = useMemo(() => {
    if (!ctos) return [];
    let list = ctos;
    if (selectedMapId !== "all") list = list.filter((c) => c.map_id === selectedMapId);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    return list;
  }, [ctos, selectedMapId, search]);

  const totalPorts = useMemo(() => filtered.reduce((s, c) => s + (parseInt(c.capacity, 10) || 0), 0), [filtered]);
  const occupiedPorts = useMemo(() => filtered.reduce((s, c) => s + c.occupied_ports, 0), [filtered]);
  const exhaustedCount = useMemo(() => filtered.filter((c) => occupancyPct(c.occupied_ports, c.capacity) >= 100).length, [filtered]);
  const globalPct = totalPorts > 0 ? Math.round((occupiedPorts / totalPorts) * 100) : 0;

  // Growth: CTOs created in last 30 days
  const recentCtos = useMemo(() => {
    if (!ctos) return 0;
    const cutoff = Date.now() - 30 * 86400000;
    return ctos.filter((c) => new Date(c.created_at).getTime() > cutoff).length;
  }, [ctos]);

  // Expansion alerts
  const alertRows = useMemo(() => {
    return filtered
      .map((c) => {
        const pct = occupancyPct(c.occupied_ports, c.capacity);
        const cap = parseInt(c.capacity, 10) || 0;
        const free = cap - c.occupied_ports;
        // count viability queries near this CTO (within ~200m ≈ 0.002 lat)
        const nearbyQueries = (viabilityHistory ?? []).filter(
          (v) => v.map_id === c.map_id && Math.abs(v.lat - c.lat) < 0.002 && Math.abs(v.lon - c.lon) < 0.003
        ).length;
        return { ...c, pct, free, cap, nearbyQueries };
      })
      .filter((c) => c.pct >= threshold)
      .sort((a, b) => b.pct - a.pct);
  }, [filtered, threshold, viabilityHistory]);

  // Heatmap clusters (simplified grid-based)
  const heatClusters = useMemo(() => {
    if (!filtered.length) return [];
    const grid = new Map<string, { lat: number; lon: number; ctos: typeof filtered; avgPct: number }>();
    const GRID_SIZE = 0.01; // ~1km
    for (const c of filtered) {
      const key = `${Math.round(c.lat / GRID_SIZE)}_${Math.round(c.lon / GRID_SIZE)}`;
      if (!grid.has(key)) grid.set(key, { lat: c.lat, lon: c.lon, ctos: [], avgPct: 0 });
      grid.get(key)!.ctos.push(c);
    }
    return Array.from(grid.values())
      .map((g) => {
        const avg = g.ctos.reduce((s, c) => s + occupancyPct(c.occupied_ports, c.capacity), 0) / g.ctos.length;
        return { ...g, avgPct: Math.round(avg) };
      })
      .filter((g) => g.avgPct >= 80)
      .sort((a, b) => b.avgPct - a.avgPct)
      .slice(0, 10);
  }, [filtered]);

  const mapName = (id: string) => maps?.find((m) => m.id === id)?.name ?? "—";

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Gauge className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-display font-bold text-foreground">Capacidade de Rede</h1>
          <Badge variant="outline" className="text-[9px] ml-2">Engineering</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          Análise de ocupação, planejamento de expansão e previsão de demanda.
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1 min-w-[180px]">
              <Label className="text-[10px] font-display uppercase text-muted-foreground">Mapa</Label>
              <Select value={selectedMapId} onValueChange={setSelectedMapId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Todos os mapas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os mapas</SelectItem>
                  {maps?.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 min-w-[100px]">
              <Label className="text-[10px] font-display uppercase text-muted-foreground">Limiar de Alerta (%)</Label>
              <Input
                type="number"
                min={50}
                max={100}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value) || 80)}
                className="h-8 text-xs font-mono w-20"
              />
            </div>
            <div className="space-y-1 flex-1 min-w-[140px]">
              <Label className="text-[10px] font-display uppercase text-muted-foreground">Buscar CTO</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nome da CTO..."
                  className="h-8 text-xs pl-7"
                />
              </div>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              icon={<HardDrive className="w-4 h-4" />}
              label="Portas Totais"
              value={totalPorts}
              sub={`${occupiedPorts} ocupadas`}
              color="text-primary"
            />
            <KpiCard
              icon={<Gauge className="w-4 h-4" />}
              label="Ocupação Global"
              value={`${globalPct}%`}
              progress={globalPct}
              color={occupancyColor(globalPct)}
            />
            <KpiCard
              icon={<AlertTriangle className="w-4 h-4" />}
              label="Caixas Esgotadas"
              value={exhaustedCount}
              sub="100% ocupação"
              color={exhaustedCount > 0 ? "text-red-400" : "text-emerald-400"}
            />
            <KpiCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="Novas CTOs (30d)"
              value={recentCtos}
              sub="Ativações recentes"
              color="text-sky-400"
            />
          </div>

          {/* Tabs */}
          <Tabs defaultValue="pon">
            <TabsList>
              <TabsTrigger value="pon" className="gap-1.5 text-xs">
                <Wifi className="w-3.5 h-3.5" /> PON (Atendimento)
              </TabsTrigger>
              <TabsTrigger value="backbone" className="gap-1.5 text-xs">
                <Network className="w-3.5 h-3.5" /> Backbone
              </TabsTrigger>
              <TabsTrigger value="infra" className="gap-1.5 text-xs">
                <Server className="w-3.5 h-3.5" /> Infraestrutura
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pon" className="mt-3 space-y-4">
              {/* Heatmap clusters */}
              {heatClusters.length > 0 && (
                <Card className="border-amber-500/30">
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-xs font-display uppercase tracking-wider text-amber-400 flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5" /> Zonas Críticas (≥80% média)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {heatClusters.map((cl, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="flex items-center gap-3 p-2 rounded-md bg-muted/30 border border-border/40"
                        >
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold font-mono"
                            style={{ background: `${barColor(cl.avgPct)}22`, color: barColor(cl.avgPct) }}
                          >
                            {cl.avgPct}%
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-mono text-muted-foreground truncate">
                              {cl.lat.toFixed(4)}, {cl.lon.toFixed(4)}
                            </p>
                            <p className="text-[10px] text-muted-foreground/60">
                              {cl.ctos.length} CTO{cl.ctos.length > 1 ? "s" : ""} na zona
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Expansion alert table */}
              <Card className="border-border/50">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-xs font-display uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5" /> Alerta de Expansão (≥{threshold}%)
                    <Badge variant="outline" className="text-[9px] ml-auto">{alertRows.length} itens</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-2">
                  {alertRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground/50 text-center py-6">
                      Nenhuma CTO acima do limiar configurado.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border/30 hover:bg-transparent">
                          <TableHead className="text-[10px] font-display uppercase py-1 px-3 h-auto">Equipamento</TableHead>
                          <TableHead className="text-[10px] font-display uppercase py-1 px-3 h-auto">Mapa</TableHead>
                          <TableHead className="text-[10px] font-display uppercase py-1 px-3 h-auto text-right">Portas</TableHead>
                          <TableHead className="text-[10px] font-display uppercase py-1 px-3 h-auto text-right">Livres</TableHead>
                          <TableHead className="text-[10px] font-display uppercase py-1 px-3 h-auto text-right">Ocupação</TableHead>
                          <TableHead className="text-[10px] font-display uppercase py-1 px-3 h-auto text-right">Consultas (30d)</TableHead>
                          <TableHead className="text-[10px] font-display uppercase py-1 px-3 h-auto">Insight</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {alertRows.map((row) => (
                          <TableRow key={row.id} className="border-border/20 hover:bg-accent/30">
                            <TableCell className="text-xs font-mono py-1.5 px-3">
                              <div className="flex items-center gap-1.5">
                                <Package className="w-3 h-3 text-muted-foreground" />
                                {row.name || "Sem nome"}
                              </div>
                            </TableCell>
                            <TableCell className="text-[10px] text-muted-foreground py-1.5 px-3">{mapName(row.map_id)}</TableCell>
                            <TableCell className="text-xs font-mono text-right py-1.5 px-3">{row.cap}</TableCell>
                            <TableCell className={`text-xs font-mono text-right py-1.5 px-3 ${row.free <= 0 ? "text-red-400 font-bold" : ""}`}>
                              {row.free}
                            </TableCell>
                            <TableCell className="py-1.5 px-3">
                              <div className="flex items-center gap-2 justify-end">
                                <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{ width: `${row.pct}%`, background: barColor(row.pct) }}
                                  />
                                </div>
                                <span className={`text-xs font-mono font-bold ${occupancyColor(row.pct)}`}>{row.pct}%</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs font-mono text-right py-1.5 px-3">
                              {row.nearbyQueries > 0 ? (
                                <span className="text-amber-400 font-bold">{row.nearbyQueries}</span>
                              ) : (
                                <span className="text-muted-foreground/40">0</span>
                              )}
                            </TableCell>
                            <TableCell className="py-1.5 px-3">
                              {row.pct >= 90 && row.nearbyQueries >= 3 ? (
                                <Badge variant="destructive" className="text-[9px] gap-1">
                                  <Zap className="w-2.5 h-2.5" /> Expansão Necessária
                                </Badge>
                              ) : row.pct >= 90 ? (
                                <Badge variant="outline" className="text-[9px] border-red-500/40 text-red-400">Crítico</Badge>
                              ) : row.nearbyQueries >= 3 ? (
                                <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-400">Demanda Alta</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[9px]">Monitorar</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="backbone" className="mt-3">
              <Card className="border-border/50">
                <CardContent className="p-8 text-center">
                  <Network className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm font-display font-bold text-foreground">Backbone — Portas de Uplink</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Análise de capacidade de backbone será habilitada ao integrar dados de switches core.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="infra" className="mt-3">
              <Card className="border-border/50">
                <CardContent className="p-8 text-center">
                  <Server className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm font-display font-bold text-foreground">Infraestrutura — Espaço em Racks</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Gestão de capacidade física será adicionada em breve.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}

/* ── KPI Card ── */
function KpiCard({
  icon,
  label,
  value,
  sub,
  color,
  progress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  progress?: number;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border-border/50">
        <CardContent className="p-3 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            {icon}
            <span className="text-[9px] font-display uppercase tracking-wider">{label}</span>
          </div>
          <span className={`text-xl font-bold font-mono ${color}`}>{value}</span>
          {progress !== undefined && (
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${progress}%`, background: barColor(progress) }}
              />
            </div>
          )}
          {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
        </CardContent>
      </Card>
    </motion.div>
  );
}
