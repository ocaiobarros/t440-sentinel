import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Map, Plus, Trash2, Eye, ArrowLeft, Zap, Settings2, Radio, Maximize, Minimize, Volume2, VolumeX, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import FlowMapSetupWizard, { type FlowMapWizardResult } from "@/components/flowmap/FlowMapSetupWizard";
import {
  useFlowMapList,
  useFlowMapDetail,
  useFlowMapMutations,
  type FlowMapHost,
  type FlowMapLink,
  type HostStatus,
} from "@/hooks/useFlowMaps";
import { useFlowMapStatus } from "@/hooks/useFlowMapStatus";
import { useZabbixConnections } from "@/hooks/useZabbixConnections";
import FlowMapCanvas from "@/components/flowmap/FlowMapCanvas";
import MapBuilderPanel, { type BuilderMode } from "@/components/flowmap/MapBuilderPanel";
import NocConsolePanel from "@/components/flowmap/NocConsolePanel";
import CableVertexEditor from "@/components/flowmap/CableVertexEditor";
import ViabilityPanel from "@/components/flowmap/ViabilityPanel";
import { useAudioAlert } from "@/hooks/useAudioAlert";
import { useIsMobile } from "@/hooks/use-mobile";
import FieldOverlay from "@/components/flowmap/FieldOverlay";
import OLTHealthPanel from "@/components/flowmap/OLTHealthPanel";
import { useTranslation } from "react-i18next";

/* ─────────── MAP LIST ─────────── */
function MapListView() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: maps = [], isLoading } = useFlowMapList();
  const { deleteMap, createMap } = useFlowMapMutations();
  const { toast } = useToast();
  const [showWizard, setShowWizard] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("profiles").select("tenant_id").limit(1).single().then(({ data }) => {
      if (data) setTenantId(data.tenant_id);
    });
  }, []);

  const handleWizardComplete = async (result: FlowMapWizardResult) => {
    if (!tenantId) return;
    try {
      const mapResult = await createMap.mutateAsync({ name: result.mapName, tenant_id: tenantId });
      setShowWizard(false);
      navigate(`/app/operations/flowmap/${mapResult.id}`);
    } catch (e: any) {
      toast({ variant: "destructive", title: t("flowmap.errorCreatingMap"), description: e.message });
    }
  };

  return (
    <div className="min-h-screen bg-background grid-pattern scanlines relative p-4 md:p-6 lg:p-8">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-neon-green/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-[1200px] mx-auto relative z-10">
        <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-3">
              <Zap className="w-6 h-6 text-neon-green" />
              <span className="text-glow-green text-neon-green">{t("flowmap.title")}</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-1">{t("flowmap.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => navigate("/app/monitoring/dashboards")}>
              <ArrowLeft className="w-3.5 h-3.5" />{t("dashboards.title")}
            </Button>
            <Button size="sm" className="gap-1.5 text-xs bg-neon-green/20 text-neon-green border border-neon-green/30 hover:bg-neon-green/30" onClick={() => setShowWizard(true)}>
              <Plus className="w-3.5 h-3.5" />{t("flowmap.newMap")}
            </Button>
          </div>
        </motion.header>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <div key={i} className="glass-card rounded-xl p-6 h-[160px] animate-pulse" />)}
          </div>
        ) : maps.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card-elevated rounded-xl p-12 text-center max-w-md mx-auto">
            <Map className="w-12 h-12 text-neon-green mx-auto mb-4" />
            <h2 className="text-lg font-display font-bold text-foreground mb-2">{t("flowmap.createFirst")}</h2>
            <p className="text-sm text-muted-foreground mb-6">{t("flowmap.createFirstDesc")}</p>
            <Button className="gap-2 bg-neon-green/20 text-neon-green border border-neon-green/30 hover:bg-neon-green/30" onClick={() => setShowWizard(true)}>
              <Plus className="w-4 h-4" />{t("flowmap.createMap")}
            </Button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {maps.map((m, i) => (
              <motion.div key={m.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass-card rounded-xl p-5 border border-border/50 hover:border-neon-green/20 transition-all group">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-display font-bold text-foreground group-hover:text-neon-green transition-colors">{m.name}</h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Zoom: {m.zoom} • Refresh: {m.refresh_interval}s</p>
                  </div>
                  <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20 font-display uppercase">{m.theme}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground mb-4">
                  <span>{new Date(m.updated_at).toLocaleDateString("pt-BR")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => navigate(`/app/operations/flowmap/${m.id}`)} className="flex-1 gap-1 text-[10px] h-7">
                    <Eye className="w-3 h-3" />{t("flowmap.open")}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteMap.mutate(m.id)} className="h-7 w-7 text-muted-foreground hover:text-neon-red">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {showWizard && (
        <div className="fixed inset-0 z-50">
          <FlowMapSetupWizard
            onComplete={handleWizardComplete}
            onCancel={() => setShowWizard(false)}
          />
        </div>
      )}
    </div>
  );
}

/* ─────────── MAP EDITOR / VIEWER ─────────── */
function MapEditorView({ mapId }: { mapId: string }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data, isLoading } = useFlowMapDetail(mapId);
  const { addHost, removeHost, updateHost, addLink, updateLink, removeLink, addLinkItem, removeLinkItem, addCTO, updateCTO, removeCTO, addCable, updateCable, removeCable, addReserva, removeReserva } = useFlowMapMutations();

  const [mode, setMode] = useState<BuilderMode>("idle");
  const [pendingOrigin, setPendingOrigin] = useState<string | null>(null);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [routePoints, setRoutePoints] = useState<[number, number][]>([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showNoc, setShowNoc] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [focusHost, setFocusHost] = useState<FlowMapHost | null>(null);
  const [warRoom, setWarRoom] = useState(false);
  const [leafletMap, setLeafletMap] = useState<any>(null);
  const [editingCableId, setEditingCableId] = useState<string | null>(null);
  const [snapToStreet, setSnapToStreet] = useState(false);
  const [hideAccessNetwork, setHideAccessNetwork] = useState(false);
  const [showViability, setShowViability] = useState(false);
  const [viabilityPick, setViabilityPick] = useState<{ lat: number; lon: number } | null>(null);
  const [viabilityPicking, setViabilityPicking] = useState(false);
  const isMobile = useIsMobile();
  const { muted, toggleMute, playBeep } = useAudioAlert();

  useEffect(() => {
    supabase.from("profiles").select("tenant_id").limit(1).single().then(({ data }) => {
      if (data) setTenantId(data.tenant_id);
    });
  }, []);

  const { connections } = useZabbixConnections();
  const activeConnectionId = useMemo(
    () => connections.find((c) => c.is_active)?.id,
    [connections],
  );

  const { statusMap, impactedLinks, isolatedNodes, linkStatuses, linkEvents, linkTraffic, effectiveStatuses, engineStale, loading: statusLoading, error: statusError } = useFlowMapStatus({
    mapId,
    hosts: data?.hosts ?? [],
    connectionId: activeConnectionId,
    refreshInterval: data?.map.refresh_interval ?? 30,
    enabled: !!data && !!activeConnectionId,
  });

  const handleMapClick = useCallback(
    (lat: number, lon: number) => {
      if (viabilityPicking) {
        setViabilityPick({ lat, lon });
        setViabilityPicking(false);
        return;
      }
      if (mode === "place-host" && tenantId) {
        window.dispatchEvent(new CustomEvent("flowmap-place-host", { detail: { lat, lon } }));
      } else if (mode === "draw-route" && editingLinkId) {
        setRoutePoints((p) => [...p, [lon, lat]]);
      }
    },
    [mode, tenantId, editingLinkId, viabilityPicking],
  );

  // CTO telemetry state from aggregator
  const [ctoTelemetry, setCtoTelemetry] = useState<Record<string, {
    status: string; healthRatio: number; onuOnline: number; onuOffline: number;
    onuAuthorized: number; onuUnprovisioned: number; ponLinkStatus: string; trafficIn: number | null;
    trafficOut: number | null; temperature: number | null; fanStatus: string | null;
    fanRotation: number | null; txPower: number | null; cpuLoad: number | null; uptime: number | null;
    isMassiva?: boolean;
  }>>({});

  // OLT-level health data
  const [oltHealth, setOltHealth] = useState<Record<string, {
    hostId: string; hostName: string; temperature: number | null;
    fanStatus: string | null; fanRotation: number | null; cpuLoad: number | null;
    uptime: number | null; totalOnuOnline: number; totalOnuOffline: number; totalUnprovisioned: number;
    slotTemperatures?: Array<{ slot: string; temperature: number }>;
    topPons?: Array<{ pon: string; trafficBps: number; hostId: string }>;
  }>>({});

  // CTO status aggregator polling
  useEffect(() => {
    if (!activeConnectionId || !data?.ctos?.length) return;
    const poll = async () => {
      try {
        const { data: result } = await supabase.functions.invoke("cto-status-aggregator", {
          body: { map_id: mapId, connection_id: activeConnectionId },
        });
        if (result?.ctos) {
          const telMap: typeof ctoTelemetry = {};
          for (const c of result.ctos) telMap[c.id] = c;
          setCtoTelemetry(telMap);
        }
        if (result?.oltHealth) {
          setOltHealth(result.oltHealth);
        }
      } catch (e) {
        console.warn("[CTO aggregator] error:", e);
      }
    };
    poll();
    const interval = setInterval(poll, 60_000);
    return () => clearInterval(interval);
  }, [mapId, activeConnectionId, data?.ctos?.length]);

  const handleAddHost = useCallback(
    async (hostData: { zabbix_host_id: string; host_name: string; host_group: string; icon_type: string; is_critical: boolean; lat: number; lon: number }) => {
      if (!tenantId) return;
      await addHost.mutateAsync({
        map_id: mapId,
        tenant_id: tenantId,
        ...hostData,
      });
      toast({ title: t("flowmap.hostAdded") });
    },
    [tenantId, mapId, addHost, toast],
  );

  /* Handle host marker click on canvas — used for link origin/dest selection */
  const handleHostClick = useCallback(
    (hostId: string) => {
      if (mode === "connect-origin") {
        setPendingOrigin(hostId);
        setMode("connect-dest");
      } else if (mode === "connect-dest" && pendingOrigin) {
        if (pendingOrigin === hostId) {
          toast({ variant: "destructive", title: t("flowmap.originDestDifferent") });
          return;
        }
        handleCreateLink({ origin_host_id: pendingOrigin, dest_host_id: hostId, link_type: "fiber", is_ring: false });
      }
    },
    [mode, pendingOrigin],
  );

  const handleCreateLink = useCallback(
    async (linkData: { origin_host_id: string; dest_host_id: string; link_type: string; is_ring: boolean; capacity_mbps?: number }) => {
      if (!tenantId || !data) return;
      try {
        const originHost = data.hosts.find((h) => h.id === linkData.origin_host_id);
        const destHost = data.hosts.find((h) => h.id === linkData.dest_host_id);

        // Try to fetch road route via OSRM
        let geometry: Record<string, unknown> = { type: "LineString", coordinates: [] };
        if (originHost && destHost) {
          try {
            const { data: routeData, error: routeError } = await supabase.functions.invoke("flowmap-route", {
              body: {
                origin_lat: originHost.lat,
                origin_lon: originHost.lon,
                dest_lat: destHost.lat,
                dest_lon: destHost.lon,
              },
            });
            if (!routeError && routeData?.geometry?.coordinates?.length > 0) {
              geometry = { ...routeData.geometry, distance_km: routeData.distance_km, duration_min: routeData.duration_min };
              toast({ title: routeData.routed ? `${t("flowmap.routeCalculated")} (${routeData.distance_km} km)` : t("flowmap.straightLine") });
            }
          } catch {
            // Fallback: straight line
          }
        }

        await addLink.mutateAsync({
          map_id: mapId,
          tenant_id: tenantId,
          ...linkData,
          capacity_mbps: linkData.capacity_mbps ?? 1000,
          priority: 0,
          geometry: geometry as any,
        });
        setPendingOrigin(null);
        setMode("idle");
        toast({ title: t("flowmap.linkCreated") });
      } catch (e: any) {
        toast({ variant: "destructive", title: t("flowmap.errorCreatingLink"), description: e.message });
      }
    },
    [tenantId, mapId, data, addLink, toast, supabase],
  );

  const handleEditRoute = useCallback((linkId: string) => {
    setEditingLinkId(linkId);
    const link = data?.links.find((l) => l.id === linkId);
    setRoutePoints(link?.geometry?.coordinates ?? []);
    setMode("draw-route");
  }, [data?.links]);

  const handleSaveRoute = useCallback(async () => {
    if (!editingLinkId) return;
    await updateLink.mutateAsync({
      id: editingLinkId,
      map_id: mapId,
      geometry: { type: "LineString", coordinates: routePoints } as any,
    });
    setEditingLinkId(null);
    setRoutePoints([]);
    setMode("idle");
    toast({ title: t("flowmap.routeSaved") });
  }, [editingLinkId, routePoints, mapId, updateLink, toast]);

  const handleUpdateHostPosition = useCallback(
    async (hostId: string, lat: number, lon: number) => {
      await updateHost.mutateAsync({ id: hostId, map_id: mapId, lat, lon });
      toast({ title: t("flowmap.positionUpdated") });
    },
    [mapId, updateHost, toast],
  );

  const handleRecalculateRoute = useCallback(
    async (linkId: string) => {
      if (!data) return;
      const link = data.links.find((l) => l.id === linkId);
      if (!link) return;
      const originHost = data.hosts.find((h) => h.id === link.origin_host_id);
      const destHost = data.hosts.find((h) => h.id === link.dest_host_id);
      if (!originHost || !destHost) return;
      try {
        const { data: routeData, error: routeError } = await supabase.functions.invoke("flowmap-route", {
          body: { origin_lat: originHost.lat, origin_lon: originHost.lon, dest_lat: destHost.lat, dest_lon: destHost.lon },
        });
        if (routeError) throw new Error(String(routeError));
        const geometry = routeData?.geometry?.coordinates?.length > 0
          ? { ...routeData.geometry, distance_km: routeData.distance_km, duration_min: routeData.duration_min }
          : { type: "LineString", coordinates: [[originHost.lon, originHost.lat], [destHost.lon, destHost.lat]] };
        await updateLink.mutateAsync({ id: linkId, map_id: mapId, geometry: geometry as any });
        toast({ title: routeData?.routed ? `${t("flowmap.recalculated")} (${routeData.distance_km} km)` : t("flowmap.straightLine") });
      } catch (e: any) {
        toast({ variant: "destructive", title: t("flowmap.errorRecalculating"), description: e.message });
      }
    },
    [data, mapId, updateLink, toast],
  );

  const handleCableGeometryUpdate = useCallback(
    async (cableId: string, geometry: { type: string; coordinates: [number, number][] }) => {
      await updateCable.mutateAsync({
        id: cableId,
        map_id: mapId,
        geometry: geometry as any,
      });
    },
    [mapId, updateCable],
  );

  const handleEditCableVertices = useCallback((cableId: string) => {
    setEditingCableId((prev) => (prev === cableId ? null : cableId));
  }, []);

  const handleFocusHost = useCallback((host: FlowMapHost) => {
    setFocusHost(host);
    setTimeout(() => setFocusHost(null), 2000);
  }, []);

  const handleCriticalDown = useCallback((host: FlowMapHost) => {
    playBeep(`flowmap-${host.id}`);
    setFocusHost(host);
    setTimeout(() => setFocusHost(null), 2000);
  }, [playBeep]);

  const handleCableMassiva = useCallback((cableId: string, ctoName: string) => {
    playBeep(`cable-massiva-${cableId}`);
    console.warn(`[FlowMap] 🔴 Queda Massiva detectada no cabo → CTO: ${ctoName}`);
  }, [playBeep]);

  const handleWebhookAlert = useCallback((ponIndex: string, hostName: string, severity: string) => {
    playBeep(`webhook-alert-${ponIndex}`);
    toast({
      title: "🚨 Alerta Webhook Recebido",
      description: `Host: ${hostName} | PON: ${ponIndex} | Sev: ${severity}`,
      variant: "destructive",
    });
  }, [playBeep, toast]);

  // War Room: toggle fullscreen
  const toggleWarRoom = useCallback(() => {
    setWarRoom((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.requestFullscreen?.().catch(() => {});
        setShowNoc(true);
        setShowBuilder(false);
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
      return next;
    });
  }, []);

  // Global incident counters for header
  const incidentCounts = useMemo(() => {
    if (!data) return { hostsDown: 0, linkDown: 0, linkDegraded: 0, total: 0 };
    let hostsDown = 0;
    let linkDown = 0;
    let linkDegraded = 0;
    for (const h of data.hosts) {
      if (statusMap[h.zabbix_host_id]?.status === "DOWN") hostsDown++;
    }
    for (const ls of Object.values(linkStatuses)) {
      if (ls.status === "DOWN") linkDown++;
      else if (ls.status === "DEGRADED") linkDegraded++;
    }
    return { hostsDown, linkDown, linkDegraded, total: hostsDown + linkDown + linkDegraded };
  }, [data, statusMap, linkStatuses]);

  if (isLoading || !data) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-neon-green font-display animate-pulse">{t("flowmap.loadingMap")}</div>
      </div>
    );
  }

  const displayLinks = data.links.map((l) => {
    if (l.id === editingLinkId) {
      return { ...l, geometry: { type: "LineString" as const, coordinates: routePoints } };
    }
    return l;
  });

  return (
    <div className={`h-screen flex flex-col bg-background ${warRoom ? "war-room" : ""}`}>
      {/* Top bar — hidden in War Room */}
      {!warRoom && (
        <div className="h-11 flex items-center justify-between px-3 border-b border-border/30 bg-card/90 backdrop-blur-xl shrink-0 z-20">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate("/app/operations/flowmap")}>
              <ArrowLeft className="w-3.5 h-3.5" />
            </Button>
            <h1 className="font-display text-xs font-bold text-neon-green tracking-wider">{data.map.name}</h1>
            <div className="flex items-center gap-1 ml-2">
              <span className={`w-1.5 h-1.5 rounded-full ${activeConnectionId ? (statusError ? "bg-neon-red" : "bg-neon-green pulse-green") : "bg-muted-foreground/30"}`} />
              <span className="text-[9px] font-mono text-muted-foreground">
              {!activeConnectionId ? t("flowmap.noZabbix") : statusError ? t("common.error") : statusLoading ? "Polling..." : t("flowmap.live")}
              </span>
            </div>
            {/* Global incident counter */}
            {incidentCounts.total > 0 && (
              <div className="flex items-center gap-2 ml-3 px-2 py-0.5 rounded-full bg-neon-red/10 border border-neon-red/20">
                {incidentCounts.hostsDown > 0 && (
                  <span className="text-[9px] font-display text-neon-red font-bold">🔴 {incidentCounts.hostsDown} DOWN</span>
                )}
                {incidentCounts.linkDown > 0 && (
                  <span className="text-[9px] font-display text-neon-red font-bold">⛓ {incidentCounts.linkDown} LINK</span>
                )}
                {incidentCounts.linkDegraded > 0 && (
                  <span className="text-[9px] font-display text-neon-amber font-bold">🟡 {incidentCounts.linkDegraded} DEGRADED</span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${muted ? "text-muted-foreground" : "text-neon-amber"}`}
              onClick={toggleMute}
              title={muted ? t("flowmap.enableSound") : t("flowmap.muteSound")}
            >
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </Button>
            <Button
              variant={showNoc ? "default" : "outline"}
              size="sm"
              className={`h-7 text-[10px] gap-1 ${showNoc ? "bg-neon-green/20 text-neon-green border border-neon-green/30" : ""}`}
              onClick={() => { setShowNoc((p) => !p); if (!showNoc) setShowBuilder(false); }}
            >
              <Radio className="w-3 h-3" />NOC
            </Button>
            <Button
              variant={showBuilder ? "default" : "outline"}
              size="sm"
              className="h-7 text-[10px] gap-1"
              onClick={() => { setShowBuilder((p) => !p); if (!showBuilder) setShowNoc(false); }}
            >
              <Settings2 className="w-3 h-3" />Builder
            </Button>
            <Button
              variant={showViability ? "default" : "outline"}
              size="sm"
              className={`h-7 text-[10px] gap-1 ${showViability ? "bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30" : ""}`}
              onClick={() => { setShowViability((p) => !p); if (!showViability) { setShowBuilder(false); setShowNoc(false); } }}
            >
              <Search className="w-3 h-3" />{t("flowmap.viability")}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-neon-green"
              onClick={toggleWarRoom}
              title={t("flowmap.warRoom")}
            >
              <Maximize className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 relative">
          <FlowMapCanvas
            flowMap={data.map}
            hosts={data.hosts}
            links={displayLinks}
            ctos={data.ctos}
            cables={hideAccessNetwork ? data.cables.filter((c) => c.cable_type !== "ASU") : data.cables}
            reservas={data.reservas}
            statusMap={statusMap}
            linkStatuses={linkStatuses}
            linkEvents={linkEvents}
            linkTraffic={linkTraffic}
            impactedLinkIds={impactedLinks}
            isolatedNodeIds={isolatedNodes}
            effectiveStatuses={effectiveStatuses}
            ctoTelemetry={ctoTelemetry}
            onMapClick={handleMapClick}
            onHostClick={handleHostClick}
            onMapReady={setLeafletMap}
            focusHost={focusHost}
            onCableMassiva={handleCableMassiva}
            onWebhookAlert={handleWebhookAlert}
          />

          {/* OLT Health Panel — floating overlay */}
          <OLTHealthPanel oltHealth={oltHealth} visible={Object.keys(oltHealth).length > 0} />

          {editingCableId && leafletMap && data.cables && (() => {
            const cable = data.cables.find((c) => c.id === editingCableId);
            return cable ? (
              <CableVertexEditor
                map={leafletMap}
                cable={cable}
                mapId={mapId}
                onUpdate={handleCableGeometryUpdate}
                snapToStreet={snapToStreet}
                onClose={() => setEditingCableId(null)}
              />
            ) : null;
          })()}

          {/* Field-NOC overlay — mobile only */}
          {isMobile && (
            <FieldOverlay
              mapRef={leafletMap}
              hosts={data.hosts}
              ctos={data.ctos}
              statusMap={statusMap}
              linkStatuses={linkStatuses}
              linkTraffic={linkTraffic}
              mapId={mapId}
              onUpdateCTO={(id, d) => updateCTO.mutateAsync({ id, map_id: mapId, ...d } as any)}
            />
          )}

          {/* War Room floating controls */}
          {warRoom && (
            <div className="absolute top-3 left-3 z-[1000] flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 bg-background/50 backdrop-blur-xl border border-border/30 ${muted ? "text-muted-foreground" : "text-neon-amber"}`}
                onClick={toggleMute}
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 bg-background/50 backdrop-blur-xl border border-border/30 ${showNoc ? "text-neon-green" : "text-muted-foreground"}`}
                onClick={() => setShowNoc((p) => !p)}
                title="NOC Console"
              >
                <Radio className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 bg-background/50 backdrop-blur-xl border border-border/30 text-muted-foreground hover:text-neon-red"
                onClick={toggleWarRoom}
                title={t("flowmap.exitFullscreen")}
              >
                <Minimize className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          {showNoc && (
            <motion.div
              key="noc"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: warRoom ? 360 : 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden shrink-0"
            >
              <NocConsolePanel
                hosts={data.hosts}
                links={data.links}
                statusMap={statusMap}
                impactedLinks={impactedLinks}
                isolatedNodes={isolatedNodes}
                linkStatuses={linkStatuses}
                linkEvents={linkEvents}
                effectiveStatuses={effectiveStatuses}
                engineStale={engineStale}
                onFocusHost={handleFocusHost}
                onCriticalDown={handleCriticalDown}
                warRoom={warRoom}
                hideAccessNetwork={hideAccessNetwork}
                onHideAccessNetworkChange={setHideAccessNetwork}
              />
            </motion.div>
          )}
          {showBuilder && (
            <motion.div
              key="builder"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden shrink-0"
            >
              <MapBuilderPanel
                hosts={data.hosts}
                links={data.links}
                ctos={data.ctos}
                cables={data.cables}
                reservas={data.reservas}
                mode={mode}
                onModeChange={setMode}
                connectionId={activeConnectionId}
                tenantId={tenantId ?? undefined}
                mapId={mapId}
                onAddHost={handleAddHost}
                onRemoveHost={(id) => removeHost.mutate({ id, map_id: mapId })}
                onUpdateHostPosition={handleUpdateHostPosition}
                pendingOrigin={pendingOrigin}
                onSelectOrigin={handleHostClick}
                onCreateLink={handleCreateLink}
                onRemoveLink={(id) => removeLink.mutate({ id, map_id: mapId })}
                onAddLinkItem={(item) => addLinkItem.mutate(item)}
                onRemoveLinkItem={(id, linkId) => removeLinkItem.mutate({ id, link_id: linkId })}
                onUpdateLinkCapacity={async (id, capacity) => {
                  await updateLink.mutateAsync({ id, map_id: mapId, capacity_mbps: capacity });
                  toast({ title: `${t("flowmap.capacityUpdated")}: ${capacity >= 1000 ? `${capacity / 1000}G` : `${capacity}M`}` });
                }}
                editingLinkId={editingLinkId}
                onEditRoute={handleEditRoute}
                onCancelEditRoute={handleSaveRoute}
                onRecalculateRoute={handleRecalculateRoute}
                onAddCTO={(data) => addCTO.mutate(data as any)}
                onRemoveCTO={(id) => removeCTO.mutate({ id, map_id: mapId })}
                onAddCable={(data) => addCable.mutate(data as any)}
                onRemoveCable={(id) => removeCable.mutate({ id, map_id: mapId })}
                onEditCableVertices={handleEditCableVertices}
                editingCableId={editingCableId}
                snapToStreet={snapToStreet}
                onSnapToStreetChange={setSnapToStreet}
                onAddReserva={(data) => addReserva.mutate(data as any)}
                onRemoveReserva={(id) => removeReserva.mutate({ id, map_id: mapId })}
              />
            </motion.div>
          )}
          {showViability && (
            <motion.div
              key="viability"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden shrink-0 border-l border-border/30 bg-card/95 backdrop-blur-xl p-3"
            >
              <ViabilityPanel
                mapId={mapId}
                tenantId={tenantId}
                onStartPicking={() => setViabilityPicking(true)}
                pickedPoint={viabilityPick}
                onClearPick={() => setViabilityPick(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ─────────── MAIN PAGE ─────────── */
export default function FlowMapPage() {
  const { mapId } = useParams<{ mapId: string }>();

  if (mapId) {
    return <MapEditorView mapId={mapId} />;
  }
  return <MapListView />;
}
