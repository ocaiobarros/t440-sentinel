import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  MapPin, Search, Loader2, CheckCircle, XCircle, Cable, Wifi,
  History, RefreshCw, Navigation, Crosshair, MapPinned, Building,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/* ── types ── */
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
  address?: string;
}

interface ViaCepResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

/* ── hooks ── */
function useFlowMaps() {
  return useQuery({
    queryKey: ["viability-flow-maps"],
    queryFn: async () => {
      const { data, error } = await supabase.from("flow_maps").select("id, name, tenant_id").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ── helpers ── */
const HISTORY_KEY = "flowpulse-viability-history";
function loadHistory(): ConsultationRecord[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
}
function saveHistory(records: ConsultationRecord[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(records.slice(0, 20)));
}

function maskCep(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length > 5) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return digits;
}

async function fetchViaCep(cep: string): Promise<ViaCepResponse | null> {
  const clean = cep.replace(/\D/g, "");
  if (clean.length !== 8) return null;
  const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.erro) return null;
  return data as ViaCepResponse;
}

async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  const encoded = encodeURIComponent(address);
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1&countrycodes=br`,
    { headers: { "User-Agent": "FlowPulse/1.0" } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

const statusColor = (st: string) =>
  st === "OK" ? "text-emerald-400" : st === "CRITICAL" ? "text-red-400" : st === "DEGRADED" ? "text-amber-400" : "text-muted-foreground";

/* ═══════════════════════════════════════════════ */
export default function ViabilityPage() {
  const { toast } = useToast();
  const { data: maps, isLoading: mapsLoading } = useFlowMaps();

  const [selectedMapId, setSelectedMapId] = useState("");
  const [searchMode, setSearchMode] = useState<"cep" | "coords">("cep");

  // CEP fields
  const [cep, setCep] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [numero, setNumero] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [cepFound, setCepFound] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  // Coordinate fields
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");

  // Results
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ViabilityResult[] | null>(null);
  const [history, setHistory] = useState<ConsultationRecord[]>(loadHistory);

  useEffect(() => {
    if (maps?.length && !selectedMapId) setSelectedMapId(maps[0].id);
  }, [maps, selectedMapId]);

  const selectedMap = useMemo(() => maps?.find((m) => m.id === selectedMapId), [maps, selectedMapId]);

  /* ── CEP lookup ── */
  const handleCepChange = useCallback(async (raw: string) => {
    const masked = maskCep(raw);
    setCep(masked);
    setCepFound(false);
    setLogradouro("");
    setBairro("");
    setCidade("");
    setUf("");

    const clean = masked.replace(/\D/g, "");
    if (clean.length === 8) {
      setCepLoading(true);
      try {
        const data = await fetchViaCep(clean);
        if (data) {
          setLogradouro(data.logradouro);
          setBairro(data.bairro);
          setCidade(data.localidade);
          setUf(data.uf);
          setCepFound(true);
        } else {
          toast({ variant: "destructive", title: "CEP não encontrado" });
        }
      } catch {
        toast({ variant: "destructive", title: "Erro ao buscar CEP" });
      } finally {
        setCepLoading(false);
      }
    }
  }, [toast]);

  /* ── Geocode on numero change ── */
  const handleGeocode = useCallback(async () => {
    if (!logradouro || !numero.trim() || !cidade) return;
    setGeocoding(true);
    try {
      const fullAddress = `${logradouro}, ${numero}, ${bairro}, ${cidade}, ${uf}, Brasil`;
      const coords = await geocodeAddress(fullAddress);
      if (coords) {
        setLat(coords.lat.toFixed(6));
        setLon(coords.lon.toFixed(6));
        toast({ title: "Coordenadas encontradas", description: `${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}` });
      } else {
        toast({ variant: "destructive", title: "Endereço não encontrado", description: "Tente inserir as coordenadas manualmente." });
      }
    } catch {
      toast({ variant: "destructive", title: "Erro na geocodificação" });
    } finally {
      setGeocoding(false);
    }
  }, [logradouro, numero, bairro, cidade, uf, toast]);

  /* ── Viability search ── */
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

      const addrStr = logradouro ? `${logradouro}, ${numero} - ${bairro}, ${cidade}/${uf}` : undefined;
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
        address: addrStr,
      };
      const updated = [record, ...history].slice(0, 20);
      setHistory(updated);
      saveHistory(updated);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro na consulta", description: e.message });
    } finally {
      setLoading(false);
    }
  }, [canSearch, lat, lon, selectedMapId, selectedMap, history, toast, logradouro, numero, bairro, cidade, uf]);

  const handleRecheck = useCallback((record: ConsultationRecord) => {
    setSelectedMapId(record.mapId);
    setLat(String(record.lat));
    setLon(String(record.lon));
    setResults(null);
    setSearchMode("coords");
  }, []);

  const isPositive = results !== null && results.length > 0 && results.some((r) => r.free_ports > 0);
  const isNegative = results !== null && (results.length === 0 || results.every((r) => r.free_ports === 0));

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Navigation className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-display font-bold text-foreground">Viabilidade FTTH</h1>
          <Badge variant="outline" className="text-[9px] ml-2">Standalone</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          Consulte por CEP ou coordenadas — verifique CTOs próximas e portas disponíveis.
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* ── Search Panel ── */}
          <Card className="border-border/50">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-xs font-display uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Crosshair className="w-3.5 h-3.5" /> Consulta de Viabilidade
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {/* Map Selector */}
              <div className="space-y-1">
                <Label className="text-[10px] font-display uppercase text-muted-foreground">Mapa de Rede</Label>
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

              {/* Search mode tabs */}
              <Tabs value={searchMode} onValueChange={(v) => setSearchMode(v as "cep" | "coords")}>
                <TabsList className="w-full">
                  <TabsTrigger value="cep" className="flex-1 gap-1.5 text-xs">
                    <Building className="w-3.5 h-3.5" /> Busca por CEP
                  </TabsTrigger>
                  <TabsTrigger value="coords" className="flex-1 gap-1.5 text-xs">
                    <MapPinned className="w-3.5 h-3.5" /> Coordenadas
                  </TabsTrigger>
                </TabsList>

                {/* CEP Tab */}
                <TabsContent value="cep" className="mt-3 space-y-3">
                  {/* CEP input */}
                  <div className="space-y-1">
                    <Label className="text-[10px] font-display uppercase text-muted-foreground">CEP</Label>
                    <div className="relative">
                      <Input
                        value={cep}
                        onChange={(e) => handleCepChange(e.target.value)}
                        placeholder="00000-000"
                        className="h-8 text-xs font-mono pr-8"
                        maxLength={9}
                      />
                      {cepLoading && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                      {cepFound && !cepLoading && <CheckCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-400" />}
                    </div>
                  </div>

                  {/* Address fields (auto-filled) */}
                  <AnimatePresence>
                    {cepFound && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-3">
                        <div className="space-y-1">
                          <Label className="text-[10px] font-display uppercase text-muted-foreground">Logradouro</Label>
                          <Input value={logradouro} readOnly className="h-8 text-xs bg-muted/30" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-[10px] font-display uppercase text-muted-foreground">Bairro</Label>
                            <Input value={bairro} readOnly className="h-8 text-xs bg-muted/30" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] font-display uppercase text-muted-foreground">Cidade / UF</Label>
                            <Input value={`${cidade}${uf ? ` / ${uf}` : ""}`} readOnly className="h-8 text-xs bg-muted/30" />
                          </div>
                        </div>

                        {/* Numero — editable */}
                        <div className="space-y-1">
                          <Label className="text-[10px] font-display uppercase text-muted-foreground">
                            Número <span className="text-primary">*</span>
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              value={numero}
                              onChange={(e) => setNumero(e.target.value)}
                              placeholder="Ex: 1234"
                              className="h-8 text-xs font-mono flex-1"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1"
                              disabled={!numero.trim() || geocoding}
                              onClick={handleGeocode}
                            >
                              {geocoding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
                              Localizar
                            </Button>
                          </div>
                        </div>

                        {/* Show resolved coords */}
                        {lat && lon && (
                          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-primary/5 border border-primary/20">
                            <MapPinned className="w-3.5 h-3.5 text-primary" />
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {lat}, {lon}
                            </span>
                            <CheckCircle className="w-3 h-3 text-emerald-400 ml-auto" />
                          </motion.div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </TabsContent>

                {/* Coords Tab */}
                <TabsContent value="coords" className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-display uppercase text-muted-foreground">Latitude</Label>
                      <Input type="number" step="any" placeholder="-20.46300" value={lat} onChange={(e) => setLat(e.target.value)} className="h-8 text-xs font-mono" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-display uppercase text-muted-foreground">Longitude</Label>
                      <Input type="number" step="any" placeholder="-54.61900" value={lon} onChange={(e) => setLon(e.target.value)} className="h-8 text-xs font-mono" />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <Separator />

              <Button
                className="w-full gap-2 h-9 text-xs"
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
                <Card className={`border-2 ${isPositive ? "border-emerald-500/40" : "border-red-500/40"}`}>
                  <CardContent className="p-5 text-center">
                    {isPositive ? (
                      <>
                        <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                        <p className="text-lg font-display font-bold text-emerald-400">VIABILIDADE POSITIVA</p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {results.length} CTO(s) encontrada(s) no raio de 200m com portas disponíveis.
                        </p>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-10 h-10 text-red-400 mx-auto mb-2" />
                        <p className="text-lg font-display font-bold text-red-400">VIABILIDADE NEGATIVA</p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {results.length === 0
                            ? "Nenhuma CTO encontrada no raio de 200m."
                            : "CTOs encontradas, mas sem portas disponíveis. Necessidade de ampliação de rede."}
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>

                {results.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {results.map((r, i) => (
                      <Card key={r.cto_id} className={`border-border/50 ${i === 0 && r.free_ports > 0 ? "border-emerald-500/30" : ""}`}>
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {i === 0 && r.free_ports > 0 && <CheckCircle className="w-4 h-4 text-emerald-400" />}
                              <span className="text-sm font-display font-bold text-foreground">{r.cto_name || "CTO"}</span>
                              {i === 0 && <Badge variant="outline" className="text-[8px]">Mais próxima</Badge>}
                            </div>
                            <span className={`text-xs font-bold ${statusColor(r.status_calculated)}`}>{r.status_calculated}</span>
                          </div>
                          <div className="grid grid-cols-4 gap-3">
                            <DetailItem label="Distância" value={`${r.distance_m.toFixed(0)}m`} color="text-primary" icon={<MapPin className="w-3 h-3" />} />
                            <DetailItem label="Capacidade" value={r.capacity} color="text-foreground" icon={<Cable className="w-3 h-3" />} />
                            <DetailItem label="Portas Livres" value={`${r.free_ports}/${r.capacity}`} color={r.free_ports > 0 ? "text-emerald-400" : "text-red-400"} icon={<Wifi className="w-3 h-3" />} />
                            <DetailItem label="Ocupação" value={`${r.occupied_ports}/${r.capacity}`} color="text-amber-400" />
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
          <Card className="border-border/50">
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
                        <TableHead className="text-[10px] font-display uppercase py-1 px-3 h-auto">Endereço / Coords</TableHead>
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
                          <TableCell className="text-[10px] py-1.5 px-3 max-w-[200px] truncate">
                            {h.address ? (
                              <span title={h.address}>{h.address}</span>
                            ) : (
                              <span className="font-mono">{h.lat.toFixed(5)}, {h.lon.toFixed(5)}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs py-1.5 px-3">
                            {h.ctoName || "—"}
                            {h.distance != null && <span className="text-[9px] text-muted-foreground ml-1">({h.distance.toFixed(0)}m)</span>}
                          </TableCell>
                          <TableCell className="py-1.5 px-3">
                            {h.result === "positive" ? (
                              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[8px]">VIÁVEL</Badge>
                            ) : (
                              <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[8px]">INVIÁVEL</Badge>
                            )}
                          </TableCell>
                          <TableCell className="py-1.5 px-3">
                            <Button size="sm" variant="ghost" className="h-6 text-[9px] gap-1" onClick={() => handleRecheck(h)}>
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
