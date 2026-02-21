import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Map, Plus, Trash2, Eye, ArrowLeft, Zap, Settings2, Radio } from "lucide-react";
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

/* ─────────── MAP LIST ─────────── */
function MapListView() {
  const navigate = useNavigate();
  const { data: maps = [], isLoading } = useFlowMapList();
  const { deleteMap, createMap, addHost } = useFlowMapMutations();
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
      // Add selected hosts with auto-generated positions (spread around center)
      const centerLat = -15.7;
      const centerLon = -47.9;
      await Promise.all(
        result.selectedHosts.map((h, i) => {
          const angle = (2 * Math.PI * i) / result.selectedHosts.length;
          const radius = 0.5 + Math.random() * 0.5;
          return addHost.mutateAsync({
            map_id: mapResult.id,
            tenant_id: tenantId,
            zabbix_host_id: h.hostid,
            host_name: h.hostName,
            host_group: h.groupName,
            icon_type: "router",
            is_critical: false,
            lat: centerLat + radius * Math.sin(angle),
            lon: centerLon + radius * Math.cos(angle),
          });
        }),
      );
      setShowWizard(false);
      navigate(`/flowmap/maps/${mapResult.id}`);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao criar mapa", description: e.message });
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
              <span className="text-glow-green text-neon-green">FLOWMAP</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-1">Topologia Geoespacial NOC</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => navigate("/")}>
              <ArrowLeft className="w-3.5 h-3.5" />Dashboards
            </Button>
            <Button size="sm" className="gap-1.5 text-xs bg-neon-green/20 text-neon-green border border-neon-green/30 hover:bg-neon-green/30" onClick={() => setShowWizard(true)}>
              <Plus className="w-3.5 h-3.5" />Novo Mapa
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
            <h2 className="text-lg font-display font-bold text-foreground mb-2">Crie seu primeiro FlowMap</h2>
            <p className="text-sm text-muted-foreground mb-6">Mapas geoespaciais com topologia de rede, detecção de anel e status em tempo real via Zabbix.</p>
            <Button className="gap-2 bg-neon-green/20 text-neon-green border border-neon-green/30 hover:bg-neon-green/30" onClick={() => setShowWizard(true)}>
              <Plus className="w-4 h-4" />Criar Mapa
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
                  <Button variant="outline" size="sm" onClick={() => navigate(`/flowmap/maps/${m.id}`)} className="flex-1 gap-1 text-[10px] h-7">
                    <Eye className="w-3 h-3" />Abrir
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
  const { toast } = useToast();
  const { data, isLoading } = useFlowMapDetail(mapId);
  const { addHost, removeHost, addLink, updateLink, removeLink } = useFlowMapMutations();

  const [mode, setMode] = useState<BuilderMode>("idle");
  const [pendingOrigin, setPendingOrigin] = useState<string | null>(null);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [routePoints, setRoutePoints] = useState<[number, number][]>([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showNoc, setShowNoc] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [focusHost, setFocusHost] = useState<FlowMapHost | null>(null);

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

  const { statusMap, impactedLinks, isolatedNodes, linkStatuses, linkEvents, loading: statusLoading, error: statusError } = useFlowMapStatus({
    mapId,
    hosts: data?.hosts ?? [],
    connectionId: activeConnectionId,
    refreshInterval: data?.map.refresh_interval ?? 30,
    enabled: !!data && !!activeConnectionId,
  });

  const handleMapClick = useCallback(
    (lat: number, lon: number) => {
      if (mode === "add-host" && tenantId) {
        window.dispatchEvent(new CustomEvent("flowmap-click", { detail: { lat, lon } }));
      } else if (mode === "draw-route" && editingLinkId) {
        setRoutePoints((p) => [...p, [lon, lat]]);
      }
    },
    [mode, tenantId, editingLinkId],
  );

  const pendingClickRef = useRef<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const { lat, lon } = (e as CustomEvent).detail;
      pendingClickRef.current = { lat, lon };
    };
    window.addEventListener("flowmap-click", handler);
    return () => window.removeEventListener("flowmap-click", handler);
  }, []);

  const handleAddHost = useCallback(
    async (hostData: { zabbix_host_id: string; host_name: string; host_group: string; icon_type: string; is_critical: boolean; lat: number; lon: number }) => {
      if (!tenantId) return;
      const pos = pendingClickRef.current;
      if (!pos && !hostData.lat) {
        toast({ variant: "destructive", title: "Clique no mapa primeiro" });
        return;
      }
      await addHost.mutateAsync({
        map_id: mapId,
        tenant_id: tenantId,
        zabbix_host_id: hostData.zabbix_host_id,
        host_name: hostData.host_name,
        host_group: hostData.host_group,
        icon_type: hostData.icon_type,
        is_critical: hostData.is_critical,
        lat: pos?.lat ?? hostData.lat,
        lon: pos?.lon ?? hostData.lon,
      });
      pendingClickRef.current = null;
      toast({ title: "Host adicionado" });
    },
    [tenantId, mapId, addHost, toast],
  );

  const handleSelectOriginOrDest = useCallback(
    (hostId: string) => {
      if (mode === "connect-origin") {
        setPendingOrigin(hostId);
        setMode("connect-dest");
      } else if (mode === "connect-dest" && pendingOrigin) {
        if (pendingOrigin === hostId) {
          toast({ variant: "destructive", title: "Origem e destino devem ser diferentes" });
          return;
        }
        handleCreateLink({ origin_host_id: pendingOrigin, dest_host_id: hostId, link_type: "fiber", is_ring: false });
      }
    },
    [mode, pendingOrigin],
  );

  const handleCreateLink = useCallback(
    async (linkData: { origin_host_id: string; dest_host_id: string; link_type: string; is_ring: boolean }) => {
      if (!tenantId) return;
      try {
        await addLink.mutateAsync({
          map_id: mapId,
          tenant_id: tenantId,
          ...linkData,
          priority: 0,
          geometry: { type: "LineString", coordinates: [] },
        });
        setPendingOrigin(null);
        setMode("idle");
        toast({ title: "Link criado" });
      } catch (e: any) {
        toast({ variant: "destructive", title: "Erro ao criar link", description: e.message });
      }
    },
    [tenantId, mapId, addLink, toast],
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
    toast({ title: "Rota salva" });
  }, [editingLinkId, routePoints, mapId, updateLink, toast]);

  const handleFocusHost = useCallback((host: FlowMapHost) => {
    setFocusHost(host);
    // Reset after animation
    setTimeout(() => setFocusHost(null), 2000);
  }, []);

  if (isLoading || !data) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-neon-green font-display animate-pulse">Carregando mapa...</div>
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
    <div className="h-screen flex flex-col bg-background">
      {/* Top bar */}
      <div className="h-11 flex items-center justify-between px-3 border-b border-border/30 bg-card/90 backdrop-blur-xl shrink-0 z-20">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate("/flowmap/maps")}>
            <ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <h1 className="font-display text-xs font-bold text-neon-green tracking-wider">{data.map.name}</h1>
          <div className="flex items-center gap-1 ml-2">
            <span className={`w-1.5 h-1.5 rounded-full ${activeConnectionId ? (statusError ? "bg-neon-red" : "bg-neon-green pulse-green") : "bg-muted-foreground/30"}`} />
            <span className="text-[9px] font-mono text-muted-foreground">
              {!activeConnectionId ? "Sem Zabbix" : statusError ? "Erro" : statusLoading ? "Polling..." : "Live"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
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
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 relative">
          <FlowMapCanvas
            flowMap={data.map}
            hosts={data.hosts}
            links={displayLinks}
            statusMap={statusMap}
            linkStatuses={linkStatuses}
            linkEvents={linkEvents}
            impactedLinkIds={impactedLinks}
            isolatedNodeIds={isolatedNodes}
            onMapClick={handleMapClick}
            focusHost={focusHost}
          />
        </div>

        <AnimatePresence mode="wait">
          {showNoc && (
            <motion.div
              key="noc"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
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
                onFocusHost={handleFocusHost}
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
                mode={mode}
                onModeChange={setMode}
                onAddHost={handleAddHost}
                onRemoveHost={(id) => removeHost.mutate({ id, map_id: mapId })}
                pendingOrigin={pendingOrigin}
                onSelectOrigin={handleSelectOriginOrDest}
                onCreateLink={handleCreateLink}
                onRemoveLink={(id) => removeLink.mutate({ id, map_id: mapId })}
                editingLinkId={editingLinkId}
                onEditRoute={handleEditRoute}
                onCancelEditRoute={handleSaveRoute}
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
