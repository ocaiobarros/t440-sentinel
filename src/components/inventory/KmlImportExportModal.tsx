import { useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Upload, Download, FileUp, CheckCircle, AlertTriangle, MapPin, Loader2, FileText, X } from "lucide-react";
import { parseKml, generateKml, downloadKml, haversineM, toGeoJsonLineString, type KmlParseResult, type KmlPoint, type KmlLine } from "@/lib/kml-utils";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "import" | "export";
}

interface ImportLog {
  type: "success" | "error" | "info";
  message: string;
}

export default function KmlImportExportModal({ open, onOpenChange, mode }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [selectedMapId, setSelectedMapId] = useState<string>("");
  const [parseResult, setParseResult] = useState<KmlParseResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [done, setDone] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data: maps = [] } = useQuery({
    queryKey: ["kml-maps"],
    queryFn: async () => {
      const { data } = await supabase.from("flow_maps").select("id, name, tenant_id");
      return data ?? [];
    },
  });

  const addLog = useCallback((log: ImportLog) => {
    setLogs(prev => [...prev, log]);
  }, []);

  /* ── File selection ── */
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseResult(null);
    setLogs([]);
    setDone(false);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const result = parseKml(text);
      setParseResult(result);
      if (result.errors.length) {
        result.errors.forEach(err => addLog({ type: "error", message: err }));
      }
      addLog({ type: "info", message: `Encontrados: ${result.points.length} pontos, ${result.lines.length} linhas` });
    };
    reader.readAsText(file);
  }, [addLog]);

  /* ── Toggle point type ── */
  const togglePointType = useCallback((idx: number) => {
    if (!parseResult) return;
    setParseResult(prev => {
      if (!prev) return prev;
      const newPoints = [...prev.points];
      newPoints[idx] = { ...newPoints[idx], type: newPoints[idx].type === "host" ? "cto" : "host" };
      return { ...prev, points: newPoints };
    });
  }, [parseResult]);

  /* ── Import to DB ── */
  const handleImport = useCallback(async () => {
    if (!parseResult || !selectedMapId) return;
    const map = maps.find(m => m.id === selectedMapId);
    if (!map) return;

    setImporting(true);
    setLogs([]);
    const tenantId = map.tenant_id;
    let hostsCreated = 0, ctosCreated = 0, cablesCreated = 0;

    // Import points
    const hostPoints = parseResult.points.filter(p => p.type === "host");
    const ctoPoints = parseResult.points.filter(p => p.type === "cto");

    // Hosts
    if (hostPoints.length) {
      const rows = hostPoints.map(p => ({
        host_name: p.name,
        lat: p.lat,
        lon: p.lon,
        map_id: selectedMapId,
        tenant_id: tenantId,
        zabbix_host_id: `kml_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        icon_type: "router",
        host_group: p.hint || "KML Import",
      }));
      const { data, error } = await supabase.from("flow_map_hosts").insert(rows).select("id, host_name, lat, lon");
      if (error) {
        addLog({ type: "error", message: `Erro ao criar hosts: ${error.message}` });
      } else {
        hostsCreated = data?.length ?? 0;
        addLog({ type: "success", message: `${hostsCreated} host(s) criado(s)` });
      }
    }

    // CTOs
    if (ctoPoints.length) {
      const rows = ctoPoints.map(p => ({
        name: p.name,
        lat: p.lat,
        lon: p.lon,
        map_id: selectedMapId,
        tenant_id: tenantId,
        capacity: "16" as const,
        occupied_ports: 0,
      }));
      const { data, error } = await supabase.from("flow_map_ctos").insert(rows).select("id, name, lat, lon");
      if (error) {
        addLog({ type: "error", message: `Erro ao criar CTOs: ${error.message}` });
      } else {
        ctosCreated = data?.length ?? 0;
        addLog({ type: "success", message: `${ctosCreated} CTO(s) criada(s)` });
      }
    }

    // Cables — we need to find nearest source/target nodes for each line
    if (parseResult.lines.length) {
      // Fetch all nodes in this map to find nearest
      const { data: allHosts } = await supabase.from("flow_map_hosts").select("id, lat, lon").eq("map_id", selectedMapId);
      const { data: allCtos } = await supabase.from("flow_map_ctos").select("id, lat, lon").eq("map_id", selectedMapId);
      const allNodes = [
        ...(allHosts ?? []).map(h => ({ id: h.id, lat: h.lat, lon: h.lon, type: "host" as const })),
        ...(allCtos ?? []).map(c => ({ id: c.id, lat: c.lat, lon: c.lon, type: "cto" as const })),
      ];

      const findNearest = (lat: number, lon: number) => {
        let best = allNodes[0];
        let bestDist = Infinity;
        for (const n of allNodes) {
          const d = haversineM(lat, lon, n.lat, n.lon);
          if (d < bestDist) { bestDist = d; best = n; }
        }
        return best;
      };

      for (const line of parseResult.lines) {
        if (allNodes.length < 2) {
          addLog({ type: "error", message: `Cabo "${line.name}": sem nós suficientes para vincular` });
          continue;
        }
        const startCoord = line.coordinates[0]; // [lon, lat]
        const endCoord = line.coordinates[line.coordinates.length - 1];
        const source = findNearest(startCoord[1], startCoord[0]);
        const target = findNearest(endCoord[1], endCoord[0]);

        if (source.id === target.id) {
          addLog({ type: "error", message: `Cabo "${line.name}": origem e destino são o mesmo nó` });
          continue;
        }

        // Calculate distance
        let totalDist = 0;
        for (let i = 1; i < line.coordinates.length; i++) {
          totalDist += haversineM(line.coordinates[i - 1][1], line.coordinates[i - 1][0], line.coordinates[i][1], line.coordinates[i][0]);
        }

        const cableRow = {
          label: line.name,
          map_id: selectedMapId,
          tenant_id: tenantId,
          source_node_id: source.id,
          source_node_type: source.type,
          target_node_id: target.id,
          target_node_type: target.type,
          geometry: toGeoJsonLineString(line.coordinates) as any,
          distance_km: Math.round((totalDist / 1000) * 100) / 100,
          cable_type: "ASU" as "ASU",
          fiber_count: 12,
        };
        const { error } = await supabase.from("flow_map_cables").insert(cableRow);

        if (error) {
          addLog({ type: "error", message: `Cabo "${line.name}": ${error.message}` });
        } else {
          cablesCreated++;
        }
      }
      if (cablesCreated) addLog({ type: "success", message: `${cablesCreated} cabo(s) criado(s)` });
    }

    addLog({ type: "info", message: `Importação concluída: ${hostsCreated} hosts, ${ctosCreated} CTOs, ${cablesCreated} cabos` });
    setDone(true);
    setImporting(false);
    queryClient.invalidateQueries({ queryKey: ["inv-hosts"] });
    queryClient.invalidateQueries({ queryKey: ["inv-ctos"] });
    queryClient.invalidateQueries({ queryKey: ["inv-cables"] });
    toast({ title: "Importação KML concluída", description: `${hostsCreated + ctosCreated + cablesCreated} ativos criados` });
  }, [parseResult, selectedMapId, maps, addLog, queryClient, toast]);

  /* ── Export ── */
  const handleExport = useCallback(async () => {
    if (!selectedMapId) return;
    const map = maps.find(m => m.id === selectedMapId);
    if (!map) return;
    setExporting(true);

    const [{ data: hosts }, { data: ctos }, { data: cables }] = await Promise.all([
      supabase.from("flow_map_hosts").select("host_name, lat, lon, current_status, icon_type").eq("map_id", selectedMapId),
      supabase.from("flow_map_ctos").select("name, lat, lon, status_calculated, capacity, occupied_ports").eq("map_id", selectedMapId),
      supabase.from("flow_map_cables").select("label, geometry, cable_type, fiber_count").eq("map_id", selectedMapId),
    ]);

    const kml = generateKml(hosts ?? [], ctos ?? [], cables ?? [], map.name);
    downloadKml(kml, `${map.name.replace(/\s+/g, "_")}_export.kml`);
    setExporting(false);
    toast({ title: "KML exportado", description: `Arquivo ${map.name}.kml baixado` });
  }, [selectedMapId, maps, toast]);

  /* ── Reset on close ── */
  const handleClose = (open: boolean) => {
    if (!open) {
      setParseResult(null);
      setLogs([]);
      setDone(false);
      setSelectedMapId("");
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            {mode === "import" ? <Upload className="w-4 h-4 text-primary" /> : <Download className="w-4 h-4 text-primary" />}
            {mode === "import" ? "Importar KML (Google Earth)" : "Exportar Projeto KML"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Map selector */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Mapa de destino</label>
            <Select value={selectedMapId} onValueChange={setSelectedMapId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecione um mapa..." />
              </SelectTrigger>
              <SelectContent>
                {maps.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {mode === "import" && (
            <>
              {/* File upload */}
              <div>
                <input ref={fileRef} type="file" accept=".kml,.kmz" onChange={handleFileChange} className="hidden" />
                <Button variant="outline" size="sm" className="gap-1.5 w-full text-xs" onClick={() => fileRef.current?.click()}>
                  <FileUp className="w-3.5 h-3.5" /> Selecionar arquivo .kml
                </Button>
              </div>

              {/* Preview */}
              {parseResult && (
                <div className="space-y-3">
                  <div className="flex gap-2 text-xs">
                    <Badge variant="outline" className="gap-1">
                      <MapPin className="w-3 h-3" /> {parseResult.points.length} pontos
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <FileText className="w-3 h-3" /> {parseResult.lines.length} linhas
                    </Badge>
                  </div>

                  {/* Point classification */}
                  {parseResult.points.length > 0 && (
                    <ScrollArea className="h-40 border border-border/50 rounded-md p-2">
                      <div className="space-y-1">
                        {parseResult.points.map((p, i) => (
                          <div key={i} className="flex items-center justify-between text-xs py-1 px-1 hover:bg-muted/30 rounded">
                            <span className="truncate flex-1 mr-2">{p.name}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-2 text-[10px] gap-1"
                              onClick={() => togglePointType(i)}
                            >
                              {p.type === "cto" ? (
                                <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-[10px]">CTO</Badge>
                              ) : (
                                <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">Host</Badge>
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}

                  <Button
                    size="sm"
                    className="w-full gap-1.5 text-xs"
                    disabled={importing || !selectedMapId}
                    onClick={handleImport}
                  >
                    {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    {importing ? "Importando..." : "Importar para o Mapa"}
                  </Button>
                </div>
              )}
            </>
          )}

          {mode === "export" && (
            <Button
              size="sm"
              className="w-full gap-1.5 text-xs"
              disabled={exporting || !selectedMapId}
              onClick={handleExport}
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {exporting ? "Gerando KML..." : "Exportar KML"}
            </Button>
          )}

          {/* Import Log */}
          <AnimatePresence>
            {logs.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="border border-border/50 rounded-md overflow-hidden"
              >
                <div className="px-2 py-1.5 bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center justify-between">
                  Log de importação
                  <Button variant="ghost" size="sm" className="h-4 w-4 p-0" onClick={() => setLogs([])}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
                <ScrollArea className="max-h-32 p-2">
                  <div className="space-y-1">
                    {logs.map((log, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-[11px]">
                        {log.type === "success" && <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />}
                        {log.type === "error" && <AlertTriangle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />}
                        {log.type === "info" && <FileText className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />}
                        <span className="text-muted-foreground">{log.message}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Post-import: View on map */}
          {done && selectedMapId && (
            <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" asChild>
              <a href={`/app/operations/flowmap/${selectedMapId}`} target="_blank" rel="noopener noreferrer">
                <MapPin className="w-3.5 h-3.5" /> Ver no Mapa
              </a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
