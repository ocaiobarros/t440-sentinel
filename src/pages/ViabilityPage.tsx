import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  MapPin, Search, Loader2, CheckCircle, XCircle, Cable, Wifi,
  History, RefreshCw, Navigation, Crosshair,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ViabilityResult {
  cto_id: string;
  cto_name: string;
  distance_m: number;
  capacity: string;
  occupied_ports: number;
  free_ports: number;
  status_calculated: string;
}

interface ConsultationRecord {
  id: string;
  lat: number;
  lon: number;
  mapId: string;
  mapName: string;
  timestamp: number;
  result: "positive" | "negative";
  ctoName?: string;
  distance?: number;
}

function useFlowMaps() {
  return useQuery({
    queryKey: ["viability-flow-maps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flow_maps")
        .select("id, name, tenant_id")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

const HISTORY_KEY = "flowpulse-viability-history";

function loadHistory(): ConsultationRecord[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch { return []; }
}

function saveHistory(records: ConsultationRecord[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(records.slice(0, 20)));
}

export default function ViabilityPage() {
  const { toast } = useToast();
  const { data: maps, isLoading: mapsLoading } = useFlowMaps();

  const [selectedMapId, setSelectedMapId] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ViabilityResult[] | null>(null);
  const [history, setHistory] = useState<ConsultationRecord[]>(loadHistory);

  // Auto-select first map
  useEffect(() => {
    if (maps?.length && !selectedMapId) setSelectedMapId(maps[0].id);
  }, [maps, selectedMapId]);

  const selectedMap = useMemo(() => maps?.find((m) => m.id === selectedMapId), [maps, selectedMapId]);

  const canSearch = !!selectedMapId && lat.trim() !== "" && lon.trim() !== "";

  const handleSearch = useCallback(async () => {
    if (!canSearch || !selectedMap) return;
    const pLat = parseFloat(lat);
    const pLon = parseFloat(lon);
    if (isNaN(pLat) || isNaN(pLon)) {
      toast({ variant: "destructive", title: "Coordenadas inválidas" });
      return;
    }

    setLoading(true);
    setResults(null);
    try {
      const { data, error } = await supabase.rpc("check_viability", {
        p_lat: pLat,
        p_lon: pLon,
        p_tenant_id: selectedMap.tenant_id,
        p_map_id: selectedMapId,
      });
      if (error) throw error;
      const res = (data as unknown as ViabilityResult[]) ?? [];
      setResults(res);

      // Save to history
      const record: ConsultationRecord = {
        id: crypto.randomUUID(),
        lat: pLat,
        lon: pLon,
        mapId: selectedMapId,
        mapName: selectedMap.name,
        timestamp: Date.now(),
        result: res.length > 0 && res.some((r) => r.free_ports > 0) ? "positive" : "negative",
        ctoName: res[0]?.cto_name,
        distance: res[0]?.distance_m,
      };
      const updated = [record, ...history].slice(0, 20);
      setHistory(updated);
      saveHistory(updated);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro na consulta", description: e.message });
    } finally {
      setLoading(false);
    }
  }, [canSearch, lat, lon, selectedMapId, selectedMap, history, toast]);

  const handleRecheck = useCallback((record: ConsultationRecord) => {
    setSelectedMapId(record.mapId);
    setLat(String(record.lat));
    setLon(String(record.lon));
    setResults(null);
  }, []);

  const statusColor = (st: string) =>
    st === "OK" ? "text-neon-green" : st === "CRITICAL" ? "text-neon-red" : st === "DEGRADED" ? "text-neon-amber" : "text-muted-foreground";

  const isPositive = results !== null && results.length > 0 && results.some((r) => r.free_ports > 0);
  const isNegative = results !== null && (results.length === 0 || results.every((r) => r.free_ports === 0));

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Navigation className="w-5 h-5 text-neon-cyan" />
          <h1 className="text-lg font-display font-bold text-foreground">Viabilidade FTTH</h1>
          <Badge variant="outline" className="text-[9px] text-neon-cyan border-neon-cyan/30 ml-2">Standalone</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          Consulte a viabilidade de instalação de novos clientes verificando CTOs próximas e portas disponíveis.
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* ── Search Panel ── */}
          <Card className="glass-card border-border/50">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-xs font-display uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Crosshair className="w-3.5 h-3.5" /> Consulta de Viabilidade
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {/* Map Selector */}
              <div className="space-y-1">
                <label className="text-[10px] font-display uppercase text-muted-foreground">Mapa de Rede</label>
                <Select value={selectedMapId} onValueChange={setSelectedMapId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={mapsLoading ? "Carregando..." : "Selecione o mapa"} />
                  </SelectTrigger>
                  <SelectContent>
                    {maps?.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Coordinates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-display uppercase text-muted-foreground">Latitude</label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="-20.46300"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-display uppercase text-muted-foreground">Longitude</label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="-54.61900"
                    value={lon}
                    onChange={(e) => setLon(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              <Button
                className="w-full gap-2 h-9 text-xs bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30 hover:bg-neon-cyan/30"
                onClick={handleSearch}
                disabled={!canSearch || loading}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Consultar Viabilidade
              </Button>
            </CardContent>
          </Card>

          {/* ── Result Card ── */}
          <AnimatePresence mode="wait">
            {results !== null && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                {/* Main verdict */}
                <Card className={`glass-card border-2 ${isPositive ? "border-neon-green/40" : "border-neon-red/40"}`}>
                  <CardContent className="p-5 text-center">
                    {isPositive ? (
                      <>
                        <CheckCircle className="w-10 h-10 text-neon-green mx-auto mb-2" />
                        <p className="text-lg font-display font-bold text-neon-green">VIABILIDADE POSITIVA</p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {results.length} CTO(s) encontrada(s) no raio de 200m com portas disponíveis.
                        </p>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-10 h-10 text-neon-red mx-auto mb-2" />
                        <p className="text-lg font-display font-bold text-neon-red">VIABILIDADE NEGATIVA</p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {results.length === 0
                            ? "Nenhuma CTO encontrada no raio de 200m."
                            : "CTOs encontradas, mas sem portas disponíveis. Necessidade de ampliação de rede."}
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* CTO Details */}
                {results.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {results.map((r, i) => (
                      <Card key={r.cto_id} className={`glass-card border-border/50 ${i === 0 && r.free_ports > 0 ? "border-neon-green/30" : ""}`}>
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {i === 0 && r.free_ports > 0 && <CheckCircle className="w-4 h-4 text-neon-green" />}
                              <span className="text-sm font-display font-bold text-foreground">{r.cto_name || "CTO"}</span>
                              {i === 0 && <Badge variant="outline" className="text-[8px] text-neon-cyan border-neon-cyan/30">Mais próxima</Badge>}
                            </div>
                            <span className={`text-xs font-bold ${statusColor(r.status_calculated)}`}>{r.status_calculated}</span>
                          </div>

                          <div className="grid grid-cols-4 gap-3">
                            <DetailItem label="Distância" value={`${r.distance_m.toFixed(0)}m`} color="text-neon-cyan" icon={<MapPin className="w-3 h-3" />} />
                            <DetailItem label="Capacidade" value={r.capacity} color="text-foreground" icon={<Cable className="w-3 h-3" />} />
                            <DetailItem label="Portas Livres" value={`${r.free_ports}/${r.capacity}`} color={r.free_ports > 0 ? "text-neon-green" : "text-neon-red"} icon={<Wifi className="w-3 h-3" />} />
                            <DetailItem label="Ocupação" value={`${r.occupied_ports}/${r.capacity}`} color="text-neon-amber" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── History ── */}
          <Card className="glass-card border-border/50">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-xs font-display uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <History className="w-3.5 h-3.5" /> Histórico de Consultas
                <Badge variant="outline" className="text-[9px] font-mono ml-1">{history.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-2">
              {history.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-xs">Nenhuma consulta realizada ainda.</div>
              ) : (
                <ScrollArea className="max-h-[300px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/30 hover:bg-transparent">
                        <TableHead className="text-[10px] font-display uppercase py-1 px-3 h-auto">Data/Hora</TableHead>
                        <TableHead className="text-[10px] font-display uppercase py-1 px-3 h-auto">Mapa</TableHead>
                        <TableHead className="text-[10px] font-display uppercase py-1 px-3 h-auto">Coordenadas</TableHead>
                        <TableHead className="text-[10px] font-display uppercase py-1 px-3 h-auto">CTO</TableHead>
                        <TableHead className="text-[10px] font-display uppercase py-1 px-3 h-auto">Resultado</TableHead>
                        <TableHead className="text-[10px] font-display uppercase py-1 px-3 h-auto"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((h) => (
                        <TableRow key={h.id} className="border-border/20">
                          <TableCell className="text-[10px] font-mono py-1.5 px-3 text-muted-foreground">
                            {new Date(h.timestamp).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </TableCell>
                          <TableCell className="text-xs py-1.5 px-3 truncate max-w-[120px]">{h.mapName}</TableCell>
                          <TableCell className="text-[10px] font-mono py-1.5 px-3">
                            {h.lat.toFixed(5)}, {h.lon.toFixed(5)}
                          </TableCell>
                          <TableCell className="text-xs py-1.5 px-3">
                            {h.ctoName || "—"}
                            {h.distance != null && <span className="text-[9px] text-muted-foreground ml-1">({h.distance.toFixed(0)}m)</span>}
                          </TableCell>
                          <TableCell className="py-1.5 px-3">
                            {h.result === "positive" ? (
                              <Badge variant="outline" className="text-[8px] text-neon-green border-neon-green/30">VIÁVEL</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[8px] text-neon-red border-neon-red/30">INVIÁVEL</Badge>
                            )}
                          </TableCell>
                          <TableCell className="py-1.5 px-3">
                            <Button size="sm" variant="ghost" className="h-6 text-[9px] gap-1 text-neon-cyan hover:text-neon-cyan/80" onClick={() => handleRecheck(h)}>
                              <RefreshCw className="w-3 h-3" /> Re-checar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
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

function DetailItem({ label, value, color, icon }: { label: string; value: string; color: string; icon?: React.ReactNode }) {
  return (
    <div>
      <span className="text-[9px] text-muted-foreground flex items-center gap-1">{icon}{label}</span>
      <div className={`text-sm font-mono font-bold ${color}`}>{value}</div>
    </div>
  );
}
