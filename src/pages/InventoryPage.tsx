import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast, toast } from "@/hooks/use-toast";
import {
  Server, Box, Cable, Search, Download, Plus, Filter, X,
  MapPin, ExternalLink, AlertTriangle, CheckCircle, XCircle,
  Loader2, Package, Upload, Globe,
} from "lucide-react";
import { motion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import KmlImportExportModal from "@/components/inventory/KmlImportExportModal";

/* ───── types ───── */
type Host = {
  id: string;
  host_name: string;
  zabbix_host_id: string;
  host_group: string;
  icon_type: string;
  current_status: string;
  lat: number;
  lon: number;
  is_critical: boolean;
  map_id: string;
  map_name?: string;
};

type CTO = {
  id: string;
  name: string;
  capacity: string;
  occupied_ports: number;
  status_calculated: string;
  lat: number;
  lon: number;
  map_id: string;
  map_name?: string;
};

type CableRow = {
  id: string;
  label: string;
  cable_type: string;
  fiber_count: number;
  distance_km: number | null;
  source_node_id: string;
  target_node_id: string;
  source_node_type: string;
  target_node_type: string;
  map_id: string;
  map_name?: string;
};

/* ───── helpers ───── */
const statusColor = (s: string) => {
  switch (s) {
    case "UP": case "OK": return "text-emerald-400";
    case "DOWN": case "CRITICAL": return "text-red-400";
    case "DEGRADED": return "text-amber-400";
    default: return "text-muted-foreground";
  }
};

const statusBadge = (s: string) => {
  switch (s) {
    case "UP": case "OK": return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">{s}</Badge>;
    case "DOWN": case "CRITICAL": return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">{s}</Badge>;
    case "DEGRADED": return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">{s}</Badge>;
    default: return <Badge variant="outline">{s}</Badge>;
  }
};

const occupancyColor = (pct: number) => {
  if (pct >= 90) return "text-red-400";
  if (pct >= 70) return "text-amber-400";
  return "text-emerald-400";
};

function exportCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(","), ...rows.map(r => keys.map(k => `"${r[k] ?? ""}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ───── main component ───── */
export default function InventoryPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "hosts";
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [fullFilter, setFullFilter] = useState(false);
  const [selectedMapId, setSelectedMapId] = useState("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [kmlMode, setKmlMode] = useState<"import" | "export" | null>(null);

  const setTab = (t: string) => {
    setSearchParams(prev => { prev.set("tab", t); return prev; }, { replace: true });
    setSearch("");
    setGroupFilter("all");
    setFullFilter(false);
  };

  /* ── queries ── */
  const { data: maps } = useQuery({
    queryKey: ["inv-maps"],
    queryFn: async () => {
      const { data } = await supabase.from("flow_maps").select("id, name, tenant_id");
      return data ?? [];
    },
  });

  const { data: hosts = [], isLoading: hostsLoading } = useQuery({
    queryKey: ["inv-hosts"],
    queryFn: async () => {
      const { data } = await supabase.from("flow_map_hosts").select("*");
      return (data ?? []) as Host[];
    },
  });

  const { data: ctos = [], isLoading: ctosLoading } = useQuery({
    queryKey: ["inv-ctos"],
    queryFn: async () => {
      const { data } = await supabase.from("flow_map_ctos").select("id, name, capacity, occupied_ports, status_calculated, lat, lon, map_id");
      return (data ?? []) as CTO[];
    },
  });

  const { data: cables = [], isLoading: cablesLoading } = useQuery({
    queryKey: ["inv-cables"],
    queryFn: async () => {
      const { data } = await supabase.from("flow_map_cables").select("id, label, cable_type, fiber_count, distance_km, source_node_id, target_node_id, source_node_type, target_node_type, map_id");
      return (data ?? []) as CableRow[];
    },
  });

  const { data: links = [] } = useQuery({
    queryKey: ["inv-links"],
    queryFn: async () => {
      const { data } = await supabase.from("flow_map_links").select("id, origin_host_id, dest_host_id, current_status, capacity_mbps, link_type, map_id");
      return data ?? [];
    },
  });

  /* ── derived ── */
  const mapLookup = useMemo(() => {
    const m: Record<string, string> = {};
    maps?.forEach(mp => { m[mp.id] = mp.name; });
    return m;
  }, [maps]);

  const hostLookup = useMemo(() => {
    const m: Record<string, string> = {};
    hosts.forEach(h => { m[h.id] = h.host_name; });
    return m;
  }, [hosts]);

  const groups = useMemo(() => [...new Set(hosts.map(h => h.host_group).filter(Boolean))].sort(), [hosts]);

  const q = search.toLowerCase();

  const filteredHosts = useMemo(() => {
    let list = hosts.map(h => ({ ...h, map_name: mapLookup[h.map_id] }));
    if (selectedMapId !== "all") list = list.filter(h => h.map_id === selectedMapId);
    if (groupFilter !== "all") list = list.filter(h => h.host_group === groupFilter);
    if (q) list = list.filter(h => h.host_name.toLowerCase().includes(q) || h.host_group.toLowerCase().includes(q) || h.icon_type.toLowerCase().includes(q));
    return list;
  }, [hosts, selectedMapId, groupFilter, q, mapLookup]);

  const filteredCTOs = useMemo(() => {
    let list = ctos.map(c => ({ ...c, map_name: mapLookup[c.map_id] }));
    if (selectedMapId !== "all") list = list.filter(c => c.map_id === selectedMapId);
    if (fullFilter) list = list.filter(c => (c.occupied_ports / parseInt(c.capacity)) * 100 >= 90);
    if (q) list = list.filter(c => c.name.toLowerCase().includes(q));
    return list;
  }, [ctos, selectedMapId, fullFilter, q, mapLookup]);

  const filteredCables = useMemo(() => {
    let list = cables.map(c => ({ ...c, map_name: mapLookup[c.map_id] }));
    if (selectedMapId !== "all") list = list.filter(c => c.map_id === selectedMapId);
    if (q) list = list.filter(c => c.label.toLowerCase().includes(q) || c.cable_type.toLowerCase().includes(q));
    return list;
  }, [cables, selectedMapId, q, mapLookup]);

  /* ── scorecards ── */
  const totalHosts = filteredHosts.length;
  const hostsUp = filteredHosts.filter(h => h.current_status === "UP").length;
  const totalCTOs = filteredCTOs.length;
  const ctosFull = filteredCTOs.filter(c => (c.occupied_ports / parseInt(c.capacity)) * 100 >= 90).length;

  const clearFilters = () => { setSearch(""); setGroupFilter("all"); setFullFilter(false); setSelectedMapId("all"); };

  const handleExport = () => {
    if (activeTab === "hosts") exportCSV(filteredHosts.map(h => ({ Nome: h.host_name, Grupo: h.host_group, Role: h.icon_type, Status: h.current_status, Lat: h.lat, Lon: h.lon, Mapa: h.map_name })), "inventario-hosts");
    else if (activeTab === "ctos") exportCSV(filteredCTOs.map(c => ({ Nome: c.name, Capacidade: c.capacity, Ocupadas: c.occupied_ports, Livres: parseInt(c.capacity) - c.occupied_ports, Status: c.status_calculated, Mapa: c.map_name })), "inventario-ctos");
    else exportCSV(filteredCables.map(c => ({ Label: c.label, Tipo: c.cable_type, Fibras: c.fiber_count, Distancia_km: c.distance_km, Mapa: c.map_name })), "inventario-cabos");
    toast({ title: t("inventory.csvExported") });
  };

  const isLoading = activeTab === "hosts" ? hostsLoading : activeTab === "ctos" ? ctosLoading : cablesLoading;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 h-full">
      {/* Header — mobile-friendly */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            {t("inventory.title")}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">{t("inventory.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setKmlMode("import")} className="gap-1.5 h-10 sm:h-8 min-w-[44px] text-xs">
            <Upload className="w-4 h-4 sm:w-3.5 sm:h-3.5" /> <span className="hidden sm:inline">{t("inventory.importKml")}</span><span className="sm:hidden">KML</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setKmlMode("export")} className="gap-1.5 h-10 sm:h-8 min-w-[44px] text-xs">
            <Globe className="w-4 h-4 sm:w-3.5 sm:h-3.5" /> <span className="hidden sm:inline">{t("inventory.exportKml")}</span><span className="sm:hidden">Exp</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 h-10 sm:h-8 min-w-[44px] text-xs">
            <Download className="w-4 h-4 sm:w-3.5 sm:h-3.5" /> <span className="hidden sm:inline">{t("inventory.exportCsv")}</span><span className="sm:hidden">CSV</span>
          </Button>
          <Button size="sm" onClick={() => setAddDialogOpen(true)} className="gap-1.5 h-10 sm:h-8 min-w-[44px]">
            <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" /> <span className="hidden sm:inline">{t("inventory.add")}</span>
          </Button>
        </div>
      </div>

      {/* Scorecards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ScoreCard icon={<Server className="w-4 h-4" />} label={t("inventory.hosts")} value={totalHosts} sub={`${hostsUp} ${t("inventory.online")}`} color="text-primary" />
        <ScoreCard icon={<Box className="w-4 h-4" />} label={t("inventory.ctos")} value={totalCTOs} sub={ctosFull > 0 ? `${ctosFull} ${t("inventory.full")}` : t("inventory.noFull")} color="text-cyan-400" />
        <ScoreCard icon={<Cable className="w-4 h-4" />} label={t("inventory.cables")} value={filteredCables.length} sub={`${filteredCables.reduce((s, c) => s + (c.distance_km ?? 0), 0).toFixed(1)} ${t("inventory.kmTotal")}`} color="text-violet-400" />
        <ScoreCard icon={<AlertTriangle className="w-4 h-4" />} label="Links" value={links.length} sub={`${links.filter((l: any) => l.current_status === "DOWN").length} ${t("inventory.down")}`} color="text-amber-400" />
      </div>

      {/* Filters bar — touch-friendly */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-3.5 sm:h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("inventory.searchAssets")} className="pl-8 h-10 sm:h-8 text-sm sm:text-xs" />
        </div>
        {maps && maps.length > 1 && (
          <Select value={selectedMapId} onValueChange={setSelectedMapId}>
            <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue placeholder={t("inventory.allMaps")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("inventory.allMaps")}</SelectItem>
              {maps.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {activeTab === "hosts" && groups.length > 0 && (
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder={t("inventory.group")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("inventory.allGroups")}</SelectItem>
              {groups.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {activeTab === "ctos" && (
          <Button variant={fullFilter ? "default" : "outline"} size="sm" className="h-8 text-xs gap-1" onClick={() => setFullFilter(!fullFilter)}>
            <Filter className="w-3 h-3" /> Lotadas (&ge;90%)
          </Button>
        )}
        {(search || groupFilter !== "all" || fullFilter || selectedMapId !== "all") && (
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={clearFilters}>
            <X className="w-3 h-3" /> {t("inventory.clear")}
          </Button>
        )}
      </div>

      {/* Tabs + Tables */}
      <Tabs value={activeTab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-fit">
          <TabsTrigger value="hosts" className="gap-1.5 text-xs"><Server className="w-3.5 h-3.5" /> {t("inventory.hosts")} ({totalHosts})</TabsTrigger>
          <TabsTrigger value="ctos" className="gap-1.5 text-xs"><Box className="w-3.5 h-3.5" /> {t("inventory.ctos")} ({totalCTOs})</TabsTrigger>
          <TabsTrigger value="cables" className="gap-1.5 text-xs"><Cable className="w-3.5 h-3.5" /> {t("inventory.cables")} ({filteredCables.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="hosts" className="flex-1 min-h-0 mt-3">
          {isLoading ? <TableSkeleton /> : (
            <ScrollArea className="h-[calc(100vh-360px)]">
              <Table>
                <TableHeader>
                  <TableRow>
                     <TableHead className="text-xs">{t("inventory.name")}</TableHead>
                     <TableHead className="text-xs">{t("inventory.group")}</TableHead>
                     <TableHead className="text-xs">{t("inventory.role")}</TableHead>
                     <TableHead className="text-xs">{t("inventory.status")}</TableHead>
                     <TableHead className="text-xs">{t("inventory.map")}</TableHead>
                     <TableHead className="text-xs w-[80px]">{t("inventory.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHosts.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">{t("inventory.noHostFound")}</TableCell></TableRow>
                  ) : filteredHosts.map(h => (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs font-medium">{h.host_name}{h.is_critical && <Badge className="ml-2 bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">{t("inventory.critical")}</Badge>}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{h.host_group || "—"}</TableCell>
                      <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">{h.icon_type}</Badge></TableCell>
                      <TableCell className="text-xs">{statusBadge(h.current_status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{h.map_name || "—"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" asChild>
                          <a href={`/app/operations/flowmap/${h.map_id}`} target="_blank" rel="noopener noreferrer" title={t("inventory.viewOnMap")}>
                            <MapPin className="w-3.5 h-3.5" />
                          </a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="ctos" className="flex-1 min-h-0 mt-3">
          {isLoading ? <TableSkeleton /> : (
            <ScrollArea className="h-[calc(100vh-360px)]">
              <Table>
                <TableHeader>
                  <TableRow>
                     <TableHead className="text-xs">{t("inventory.name")}</TableHead>
                     <TableHead className="text-xs">{t("inventory.capacity")}</TableHead>
                     <TableHead className="text-xs">{t("inventory.occupied")}</TableHead>
                     <TableHead className="text-xs">{t("inventory.free")}</TableHead>
                     <TableHead className="text-xs">{t("inventory.occupancy")}</TableHead>
                     <TableHead className="text-xs">{t("inventory.status")}</TableHead>
                     <TableHead className="text-xs">{t("inventory.map")}</TableHead>
                     <TableHead className="text-xs w-[80px]">{t("inventory.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCTOs.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8">{t("inventory.noCtoFound")}</TableCell></TableRow>
                  ) : filteredCTOs.map(c => {
                    const cap = parseInt(c.capacity);
                    const pct = cap > 0 ? (c.occupied_ports / cap) * 100 : 0;
                    const free = cap - c.occupied_ports;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="text-xs font-medium">{c.name || t("inventory.noName")}</TableCell>
                        <TableCell className="text-xs">{cap} {t("inventory.ports")}</TableCell>
                        <TableCell className="text-xs">{c.occupied_ports}</TableCell>
                        <TableCell className="text-xs">{free}</TableCell>
                        <TableCell className="text-xs">
                          <span className={occupancyColor(pct)}>{pct.toFixed(0)}%</span>
                          {pct >= 90 && <AlertTriangle className="inline w-3 h-3 ml-1 text-red-400" />}
                        </TableCell>
                        <TableCell className="text-xs">{statusBadge(c.status_calculated)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.map_name || "—"}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" asChild>
                          <a href={`/app/operations/flowmap/${c.map_id}`} target="_blank" rel="noopener noreferrer" title={t("inventory.viewOnMap")}>
                              <MapPin className="w-3.5 h-3.5" />
                            </a>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="cables" className="flex-1 min-h-0 mt-3">
          {isLoading ? <TableSkeleton /> : (
            <ScrollArea className="h-[calc(100vh-360px)]">
              <Table>
                <TableHeader>
                  <TableRow>
                     <TableHead className="text-xs">{t("inventory.label")}</TableHead>
                     <TableHead className="text-xs">{t("inventory.type")}</TableHead>
                     <TableHead className="text-xs">{t("inventory.fibers")}</TableHead>
                     <TableHead className="text-xs">{t("inventory.distance")}</TableHead>
                     <TableHead className="text-xs">{t("inventory.source")}</TableHead>
                     <TableHead className="text-xs">{t("inventory.target")}</TableHead>
                     <TableHead className="text-xs">{t("inventory.map")}</TableHead>
                     <TableHead className="text-xs w-[80px]">{t("inventory.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCables.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8">{t("inventory.noCableFound")}</TableCell></TableRow>
                  ) : filteredCables.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="text-xs font-medium">{c.label || "Sem label"}</TableCell>
                      <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">{c.cable_type}</Badge></TableCell>
                      <TableCell className="text-xs">{c.fiber_count}</TableCell>
                      <TableCell className="text-xs">{c.distance_km != null ? `${c.distance_km.toFixed(2)} km` : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{hostLookup[c.source_node_id] || c.source_node_type}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{hostLookup[c.target_node_id] || c.target_node_type}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.map_name || "—"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" asChild>
                          <a href={`/app/operations/flowmap/${c.map_id}`} target="_blank" rel="noopener noreferrer" title={t("inventory.viewOnMap")}>
                            <MapPin className="w-3.5 h-3.5" />
                          </a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Dialog placeholder */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("inventory.add")} {activeTab === "hosts" ? "Host" : activeTab === "ctos" ? "CTO" : t("inventory.cables")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">{t("common.loading")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* KML Import/Export Modal */}
      <KmlImportExportModal
        open={kmlMode !== null}
        onOpenChange={(open) => { if (!open) setKmlMode(null); }}
        mode={kmlMode ?? "import"}
      />
    </div>
  );
}

/* ── sub-components ── */
function ScoreCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: number; sub: string; color: string }) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className={color}>{icon}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
        </div>
        <p className="text-xl font-display font-bold text-foreground">{value}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
    </div>
  );
}
