import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Crosshair, Camera, Sun, X, Wifi, WifiOff, Clock, MapPin, ImageIcon, Loader2, Navigation } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { FlowMapHost, FlowMapCTO, HostStatus } from "@/hooks/useFlowMaps";
import type { LinkTraffic } from "@/hooks/useFlowMapStatus";
import type L from "leaflet";

interface Props {
  mapRef: L.Map | null;
  hosts: FlowMapHost[];
  ctos?: FlowMapCTO[];
  statusMap: Record<string, HostStatus>;
  linkStatuses: Record<string, { status: string; originHost: string; destHost: string }>;
  linkTraffic: Record<string, LinkTraffic>;
  mapId: string;
  onUpdateCTO?: (id: string, data: Partial<FlowMapCTO>) => void;
}

export default function FieldOverlay({ mapRef, hosts, ctos = [], statusMap, linkStatuses, linkTraffic, mapId, onUpdateCTO }: Props) {
  const [gpsActive, setGpsActive] = useState(false);
  const [gpsPos, setGpsPos] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedHost, setSelectedHost] = useState<FlowMapHost | null>(null);
  const [selectedCTO, setSelectedCTO] = useState<FlowMapCTO | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photos, setPhotos] = useState<{ name: string; url: string }[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const gpsMarkerRef = useRef<L.Marker | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // ─── GPS tracking ───
  const startGps = useCallback(() => {
    if (!navigator.geolocation) {
      toast({ title: "GPS não suportado", variant: "destructive" });
      return;
    }
    setGpsActive(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setGpsPos(loc);
      },
      (err) => {
        toast({ title: "Erro GPS", description: err.message, variant: "destructive" });
        setGpsActive(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
  }, [toast]);

  const stopGps = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setGpsActive(false);
    if (gpsMarkerRef.current) {
      gpsMarkerRef.current.remove();
      gpsMarkerRef.current = null;
    }
  }, []);

  // Update GPS marker on map
  useEffect(() => {
    if (!mapRef || !gpsPos) return;
    const L = (window as any).L;
    if (!L) return;

    if (gpsMarkerRef.current) {
      gpsMarkerRef.current.setLatLng([gpsPos.lat, gpsPos.lon]);
    } else {
      const icon = L.divIcon({
        className: "",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        html: `<div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
          <div style="width:14px;height:14px;border-radius:50%;background:#2979ff;border:3px solid #fff;box-shadow:0 0 12px #2979ff80;"></div>
        </div>`,
      });
      gpsMarkerRef.current = L.marker([gpsPos.lat, gpsPos.lon], { icon, zIndexOffset: 9999 }).addTo(mapRef);
    }
  }, [mapRef, gpsPos]);

  const centerOnMe = useCallback(() => {
    if (!gpsPos || !mapRef) {
      startGps();
      return;
    }
    mapRef.flyTo([gpsPos.lat, gpsPos.lon], 15, { duration: 1 });
  }, [gpsPos, mapRef, startGps]);

  // Cleanup
  useEffect(() => () => stopGps(), [stopGps]);

  // ─── Host tap handler via custom event ───
  useEffect(() => {
    const handler = (e: Event) => {
      const hostId = (e as CustomEvent).detail;
      const host = hosts.find((h) => h.id === hostId);
      console.log("[FieldOverlay] field-host-tap received, hostId:", hostId, "found:", !!host);
      if (host) { setSelectedHost(host); setSelectedCTO(null); }
    };
    window.addEventListener("field-host-tap", handler);
    return () => window.removeEventListener("field-host-tap", handler);
  }, [hosts]);

  // ─── CTO tap handler via custom event ───
  useEffect(() => {
    const handler = (e: Event) => {
      const ctoId = (e as CustomEvent).detail;
      const cto = ctos.find((c) => c.id === ctoId);
      if (cto) { setSelectedCTO(cto); setSelectedHost(null); }
    };
    window.addEventListener("field-cto-tap", handler);
    return () => window.removeEventListener("field-cto-tap", handler);
  }, [ctos]);

  // ─── GPS Calibration for CTO ───
  const handleCalibrateCTO = useCallback(async () => {
    if (!selectedCTO || !onUpdateCTO) return;
    setCalibrating(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 });
      });
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      onUpdateCTO(selectedCTO.id, { lat, lon, map_id: selectedCTO.map_id } as any);
      setSelectedCTO((prev) => prev ? { ...prev, lat, lon } : null);
      toast({ title: "📍 Localização calibrada!", description: `${lat.toFixed(6)}, ${lon.toFixed(6)}` });
    } catch (err) {
      toast({ title: "Erro GPS", description: (err as GeolocationPositionError).message, variant: "destructive" });
    } finally {
      setCalibrating(false);
    }
  }, [selectedCTO, onUpdateCTO, toast]);

  // ─── Fetch photos from ALL technicians when host is selected ───
  useEffect(() => {
    if (!selectedHost) {
      setPhotos([]);
      return;
    }

    let cancelled = false;
    const fetchPhotos = async () => {
      setLoadingPhotos(true);
      try {
        // List top-level user folders in the bucket
        const { data: topFolders, error: topErr } = await supabase.storage
          .from("flowmap-attachments")
          .list("", { limit: 200 });

        if (topErr) throw topErr;

        const allPhotos: { name: string; url: string }[] = [];

        // For each user folder, try listing mapId/hostId path
        const userFolders = (topFolders || []).filter((f) => !f.metadata); // folders have no metadata
        const hostPath = (userId: string) => `${userId}/${mapId}/${selectedHost.id}`;

        await Promise.all(
          userFolders.map(async (folder) => {
            const path = hostPath(folder.name);
            const { data: files, error } = await supabase.storage
              .from("flowmap-attachments")
              .list(path, { limit: 50, sortBy: { column: "created_at", order: "desc" } });

            if (error || !files) return;
            for (const file of files) {
              if (file.name && file.metadata) {
                const { data: urlData } = supabase.storage
                  .from("flowmap-attachments")
                  .getPublicUrl(`${path}/${file.name}`);
                allPhotos.push({ name: file.name, url: urlData.publicUrl });
              }
            }
          }),
        );

        if (!cancelled) setPhotos(allPhotos);
      } catch (err) {
        console.error("[FieldOverlay] Error fetching photos:", err);
      } finally {
        if (!cancelled) setLoadingPhotos(false);
      }
    };

    fetchPhotos();
    return () => { cancelled = true; };
  }, [selectedHost, mapId]);

  // ─── High contrast toggle ───
  useEffect(() => {
    const labels = document.querySelectorAll(".fm-label-content");
    labels.forEach((el) => {
      (el as HTMLElement).style.filter = highContrast ? "invert(1)" : "none";
    });
  }, [highContrast]);

  // ─── Photo upload ───
  const handlePhoto = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedHost) return;

    setUploading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) throw new Error("Não autenticado");

      const userId = session.session.user.id;
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/${mapId}/${selectedHost.id}/${Date.now()}.${ext}`;

      const { error } = await supabase.storage
        .from("flowmap-attachments")
        .upload(path, file, { contentType: file.type });

      if (error) throw error;

      const { data: urlData } = supabase.storage.from("flowmap-attachments").getPublicUrl(path);
      
      // Add to local gallery immediately
      setPhotos((prev) => [{ name: path.split("/").pop() || "", url: urlData.publicUrl }, ...prev]);
      toast({ title: "📸 Foto anexada!" });
    } catch (err) {
      toast({ title: "Erro no upload", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [selectedHost, mapId, toast]);

  // ─── Selected host data ───
  const hostStatus = selectedHost ? statusMap[selectedHost.zabbix_host_id] : undefined;
  const stColor = hostStatus?.status === "UP" ? "#00e676" : hostStatus?.status === "DOWN" ? "#ff1744" : "#9e9e9e";

  return (
    <>
      {/* ── Floating action buttons ── */}
      <div className="absolute bottom-20 right-3 z-[1000] flex flex-col gap-2">
        <button
          onClick={() => setHighContrast((p) => !p)}
          className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg border transition-all ${
            highContrast
              ? "bg-amber-400 border-amber-500 text-black"
              : "bg-card/90 backdrop-blur border-border/50 text-muted-foreground"
          }`}
          title="Alto contraste (sol)"
        >
          <Sun className="w-5 h-5" />
        </button>

        <button
          onClick={gpsActive ? centerOnMe : startGps}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg border transition-all ${
            gpsActive
              ? "bg-blue-600 border-blue-500 text-white"
              : "bg-card/90 backdrop-blur border-border/50 text-muted-foreground"
          }`}
          title={gpsActive ? "Centralizar no GPS" : "Ativar GPS"}
        >
          {gpsActive ? <MapPin className="w-6 h-6" /> : <Crosshair className="w-6 h-6" />}
        </button>
      </div>

      {/* ── GPS status indicator ── */}
      {gpsActive && gpsPos && (
        <div className="absolute top-2 left-2 z-[1000] bg-card/80 backdrop-blur rounded-lg px-3 py-1.5 border border-border/50 flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span>{gpsPos.lat.toFixed(5)}, {gpsPos.lon.toFixed(5)}</span>
        </div>
      )}

      {/* ── Host detail drawer — z-index forced to 9999 ── */}
      <Drawer open={!!selectedHost} onOpenChange={(open) => !open && setSelectedHost(null)}>
        <DrawerContent 
          className="bg-card border-t border-border/50 max-h-[70vh]"
          style={{ zIndex: 9999 }}
        >
          <DrawerHeader className="pb-2">
            <div className="flex items-center justify-between">
              <DrawerTitle className="text-sm font-display flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full inline-block"
                  style={{ background: stColor, boxShadow: `0 0 8px ${stColor}80` }}
                />
                {selectedHost?.host_name || selectedHost?.zabbix_host_id}
                {photos.length > 0 && (
                  <Badge className="bg-neon-cyan/20 text-neon-cyan border-neon-cyan/30 text-[9px] px-1.5 py-0 h-4 font-mono gap-1">
                    <Camera className="w-2.5 h-2.5" />
                    {photos.length}
                  </Badge>
                )}
              </DrawerTitle>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <X className="w-4 h-4" />
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>

          <ScrollArea className="px-4 pb-4 max-h-[55vh]">
            <div className="space-y-3">
              {/* Status card */}
              <div className="rounded-lg bg-background/50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <span className="text-sm font-bold" style={{ color: stColor }}>
                    {hostStatus?.status === "UP" ? (
                      <span className="flex items-center gap-1"><Wifi className="w-4 h-4" /> UP</span>
                    ) : hostStatus?.status === "DOWN" ? (
                      <span className="flex items-center gap-1"><WifiOff className="w-4 h-4" /> DOWN</span>
                    ) : "UNKNOWN"}
                  </span>
                </div>
                {hostStatus?.latency != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Latência</span>
                    <span className="text-sm font-mono text-neon-cyan">{hostStatus.latency}ms</span>
                  </div>
                )}
                {hostStatus?.availability24h != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Disp. 24h</span>
                    <span className="text-sm font-mono text-neon-green">{hostStatus.availability24h.toFixed(1)}%</span>
                  </div>
                )}
                {hostStatus?.lastCheck && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Último check</span>
                    <span className="text-xs font-mono text-muted-foreground">{new Date(hostStatus.lastCheck).toLocaleTimeString("pt-BR")}</span>
                  </div>
                )}
              </div>

              {/* Host info */}
              <div className="rounded-lg bg-background/50 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Grupo</span>
                  <span className="text-xs font-mono">{selectedHost?.host_group || "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Coordenadas</span>
                  <span className="text-xs font-mono">{selectedHost?.lat.toFixed(5)}, {selectedHost?.lon.toFixed(5)}</span>
                </div>
                {selectedHost?.is_critical && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Criticidade</span>
                    <span className="text-xs font-bold text-neon-red">CRÍTICO</span>
                  </div>
                )}
              </div>

              {/* Photo capture */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-neon-green/10 border border-neon-green/30 text-neon-green text-sm font-display hover:bg-neon-green/20 transition-colors disabled:opacity-50"
              >
                <Camera className="w-5 h-5" />
                {uploading ? "Enviando..." : "Tirar Foto do Equipamento"}
              </button>

              {/* ── Photo Gallery ── */}
              <div className="rounded-lg bg-background/50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <ImageIcon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-display text-muted-foreground">
                    Fotos de Manutenção
                  </span>
                  {photos.length > 0 && (
                    <Badge className="bg-neon-green/20 text-neon-green border-neon-green/30 text-[9px] px-1.5 py-0 h-4 font-mono ml-auto">
                      {photos.length} {photos.length === 1 ? "foto" : "fotos"}
                    </Badge>
                  )}
                </div>
                {loadingPhotos ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : photos.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground text-center py-3">
                    Nenhuma foto registrada para este equipamento.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {photos.map((photo, idx) => (
                      <a
                        key={idx}
                        href={photo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="aspect-square rounded-md overflow-hidden border border-border/30 hover:border-neon-green/50 transition-colors"
                      >
                        <img
                          src={photo.url}
                          alt={photo.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Distance to host */}
              {gpsPos && selectedHost && (
                <div className="text-center text-xs text-muted-foreground">
                  📍 Distância estimada: <span className="font-bold text-foreground">
                    {calcDistance(gpsPos.lat, gpsPos.lon, selectedHost.lat, selectedHost.lon).toFixed(1)} km
                  </span>
                </div>
              )}
            </div>
          </ScrollArea>
        </DrawerContent>
      </Drawer>

      {/* ── CTO detail drawer ── */}
      <Drawer open={!!selectedCTO} onOpenChange={(open) => !open && setSelectedCTO(null)}>
        <DrawerContent
          className="bg-card border-t border-border/50 max-h-[70vh]"
          style={{ zIndex: 9999 }}
        >
          <DrawerHeader className="pb-2">
            <div className="flex items-center justify-between">
              <DrawerTitle className="text-sm font-display flex items-center gap-2">
                <span className="w-3 h-3 rounded-full inline-block bg-neon-cyan" style={{ boxShadow: "0 0 8px #00e5ff80" }} />
                {selectedCTO?.name || "CTO"}
              </DrawerTitle>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <X className="w-4 h-4" />
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>

          <ScrollArea className="px-4 pb-4 max-h-[55vh]">
            <div className="space-y-3">
              {/* CTO info */}
              <div className="rounded-lg bg-background/50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Capacidade</span>
                  <span className="text-sm font-mono text-neon-cyan">{selectedCTO?.occupied_ports}/{selectedCTO?.capacity} portas</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <span className={`text-sm font-bold ${selectedCTO?.status_calculated === "OK" ? "text-neon-green" : selectedCTO?.status_calculated === "CRITICAL" ? "text-neon-red" : "text-muted-foreground"}`}>
                    {selectedCTO?.status_calculated || "UNKNOWN"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Coordenadas</span>
                  <span className="text-xs font-mono">{selectedCTO?.lat.toFixed(5)}, {selectedCTO?.lon.toFixed(5)}</span>
                </div>
                {selectedCTO?.description && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Descrição</span>
                    <span className="text-xs font-mono truncate max-w-[160px]">{selectedCTO.description}</span>
                  </div>
                )}
              </div>

              {/* GPS Calibration button */}
              {onUpdateCTO && (
                <button
                  onClick={handleCalibrateCTO}
                  disabled={calibrating}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan text-sm font-display hover:bg-neon-cyan/20 transition-colors disabled:opacity-50"
                >
                  <Navigation className="w-5 h-5" />
                  {calibrating ? "Obtendo GPS..." : "Calibrar Localização (GPS)"}
                </button>
              )}

              {/* Distance to CTO */}
              {gpsPos && selectedCTO && (
                <div className="text-center text-xs text-muted-foreground">
                  📍 Distância estimada: <span className="font-bold text-foreground">
                    {calcDistance(gpsPos.lat, gpsPos.lon, selectedCTO.lat, selectedCTO.lon).toFixed(1)} km
                  </span>
                </div>
              )}
            </div>
          </ScrollArea>
        </DrawerContent>
      </Drawer>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhoto}
        className="hidden"
      />
    </>
  );
}

// Haversine distance (km)
function calcDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
