import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Trash2, MapPin, Link2, AlertTriangle, Save, X, Pencil,
  Navigation, Network, Server, ChevronRight, ChevronLeft,
  Loader2, Search, Cable, RotateCcw, Box,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { FlowMapHost, FlowMapLink, FlowMapLinkItem, FlowMapCTO, FlowMapCable } from "@/hooks/useFlowMaps";
import LinkItemsEditor from "./LinkItemsEditor";

export type BuilderMode = "idle" | "place-host" | "connect-origin" | "connect-dest" | "draw-route";

/* ── Zabbix types ── */
interface ZabbixHostGroup { groupid: string; name: string }
interface ZabbixHost { hostid: string; host: string; name: string }

async function zabbixProxy(connectionId: string, method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke("zabbix-proxy", {
    body: { connection_id: connectionId, method, params },
  });
  if (error) throw new Error(String(error));
  if (data?.error) throw new Error(data.error);
  return data?.result;
}

/* ── Host add steps ── */
type HostAddStep = "idle" | "groups" | "hosts" | "placing";

interface Props {
  hosts: FlowMapHost[];
  links: FlowMapLink[];
  ctos?: FlowMapCTO[];
  cables?: FlowMapCable[];
  mode: BuilderMode;
  onModeChange: (m: BuilderMode) => void;
  connectionId?: string;
  tenantId?: string;
  mapId: string;
  /* Host actions */
  onAddHost: (data: { zabbix_host_id: string; host_name: string; host_group: string; icon_type: string; is_critical: boolean; lat: number; lon: number }) => void;
  onRemoveHost: (id: string) => void;
  onUpdateHostPosition?: (id: string, lat: number, lon: number) => void;
  /* Link actions */
  pendingOrigin: string | null;
  onSelectOrigin: (id: string) => void;
  onCreateLink: (data: { origin_host_id: string; dest_host_id: string; link_type: string; is_ring: boolean; capacity_mbps?: number }) => void;
  onRemoveLink: (id: string) => void;
  onUpdateLinkCapacity?: (id: string, capacity_mbps: number) => void;
  /* Link item actions */
  onAddLinkItem?: (item: Omit<FlowMapLinkItem, "id" | "created_at">) => void;
  onRemoveLinkItem?: (id: string, linkId: string) => void;
  /* Route editor */
  editingLinkId: string | null;
  onEditRoute: (linkId: string) => void;
  onCancelEditRoute: () => void;
  onRecalculateRoute?: (linkId: string) => Promise<void>;
  /* CTO/Cable actions */
  onAddCTO?: (data: Omit<FlowMapCTO, "id" | "created_at" | "updated_at" | "status_calculated">) => void;
  onRemoveCTO?: (id: string) => void;
  onUpdateCTO?: (id: string, data: Partial<FlowMapCTO>) => void;
  onAddCable?: (data: Omit<FlowMapCable, "id" | "created_at" | "updated_at">) => void;
  onRemoveCable?: (id: string) => void;
}

export default function MapBuilderPanel({
  hosts, links, ctos = [], cables = [], mode, onModeChange, connectionId, tenantId, mapId,
  onAddHost, onRemoveHost, onUpdateHostPosition,
  pendingOrigin, onSelectOrigin, onCreateLink, onRemoveLink,
  onAddLinkItem, onRemoveLinkItem,
  editingLinkId, onEditRoute, onCancelEditRoute, onRecalculateRoute, onUpdateLinkCapacity,
  onAddCTO, onRemoveCTO, onUpdateCTO, onAddCable, onRemoveCable,
}: Props) {
  const [editingLinkItemsId, setEditingLinkItemsId] = useState<string | null>(null);
  const [editingHostCoords, setEditingHostCoords] = useState<string | null>(null);
  const [coordsForm, setCoordsForm] = useState({ lat: "", lon: "" });
  /* ── Host add state ── */
  const [hostStep, setHostStep] = useState<HostAddStep>("idle");
  const [groups, setGroups] = useState<ZabbixHostGroup[]>([]);
  const [zbxHosts, setZbxHosts] = useState<ZabbixHost[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<{ id: string; name: string } | null>(null);
  const [selectedZbxHost, setSelectedZbxHost] = useState<ZabbixHost | null>(null);
  const [hostForm, setHostForm] = useState({ icon_type: "router", is_critical: false });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  /* ── Link form ── */
  const [linkForm, setLinkForm] = useState({ link_type: "fiber", is_ring: false, capacity_mbps: 1000 });
  const [recalculating, setRecalculating] = useState<string | null>(null);

  /* ── CTO form ── */
  const [ctoAdding, setCtoAdding] = useState(false);
  const [ctoForm, setCtoForm] = useState({ name: "", capacity: "16" as "8" | "16" | "32", pon_port_index: 0, description: "" });
  const [ctoPlacing, setCtoPlacing] = useState(false);
  const [ctoOltId, setCtoOltId] = useState<string | null>(null);

  /* ── Fetch groups ── */
  const fetchGroups = async () => {
    if (!connectionId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await zabbixProxy(connectionId, "hostgroup.get", {
        output: ["groupid", "name"],
        sortfield: "name",
        real_hosts: true,
      });
      setGroups(result as ZabbixHostGroup[]);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  /* ── Fetch hosts ── */
  const fetchHosts = async (groupId: string) => {
    if (!connectionId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await zabbixProxy(connectionId, "host.get", {
        output: ["hostid", "host", "name"],
        groupids: groupId,
        sortfield: "name",
      });
      setZbxHosts(result as ZabbixHost[]);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleStartAdd = () => {
    if (!connectionId) {
      setError("Nenhuma conexão Zabbix ativa");
      return;
    }
    setHostStep("groups");
    setSearch("");
    fetchGroups();
  };

  const handleSelectGroup = (g: ZabbixHostGroup) => {
    setSelectedGroup({ id: g.groupid, name: g.name });
    setHostStep("hosts");
    setSearch("");
    fetchHosts(g.groupid);
  };

  const handleSelectHost = (h: ZabbixHost) => {
    setSelectedZbxHost(h);
    setHostStep("placing");
    onModeChange("place-host");
  };

  const handleCancelAdd = () => {
    setHostStep("idle");
    setSelectedGroup(null);
    setSelectedZbxHost(null);
    setSearch("");
    setError(null);
    if (mode === "place-host") onModeChange("idle");
  };

  /* Listen for map click when placing host */
  useEffect(() => {
    if (mode !== "place-host" || !selectedZbxHost) return;

    const handler = (e: Event) => {
      const { lat, lon } = (e as CustomEvent).detail;
      onAddHost({
        zabbix_host_id: selectedZbxHost.hostid,
        host_name: selectedZbxHost.name || selectedZbxHost.host,
        host_group: selectedGroup?.name ?? "",
        icon_type: hostForm.icon_type,
        is_critical: hostForm.is_critical,
        lat,
        lon,
      });
      // Reset to host list so user can add more from same group
      setSelectedZbxHost(null);
      setHostStep("hosts");
      onModeChange("idle");
    };

    window.addEventListener("flowmap-place-host", handler);
    return () => window.removeEventListener("flowmap-place-host", handler);
  }, [mode, selectedZbxHost, selectedGroup, hostForm, onAddHost, onModeChange]);

  /* Listen for map click when placing CTO */
  useEffect(() => {
    if (!ctoPlacing || !tenantId || !onAddCTO) return;
    const handler = (e: Event) => {
      const { lat, lon } = (e as CustomEvent).detail;
      onAddCTO({
        tenant_id: tenantId,
        map_id: mapId,
        name: ctoForm.name || `CTO-${ctos.length + 1}`,
        description: ctoForm.description,
        olt_host_id: ctoOltId,
        pon_port_index: ctoForm.pon_port_index,
        lat,
        lon,
        capacity: ctoForm.capacity,
        metadata: {},
        zabbix_host_ids: [],
      });
      setCtoPlacing(false);
      setCtoAdding(false);
      setCtoForm({ name: "", capacity: "16", pon_port_index: 0, description: "" });
      setCtoOltId(null);
      onModeChange("idle");
    };
    window.addEventListener("flowmap-place-host", handler);
    return () => window.removeEventListener("flowmap-place-host", handler);
  }, [ctoPlacing, ctoForm, ctoOltId, tenantId, mapId, ctos.length, onAddCTO, onModeChange]);

  const filteredGroups = search
    ? groups.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
    : groups;

  const filteredHosts = search
    ? zbxHosts.filter((h) => (h.name || h.host).toLowerCase().includes(search.toLowerCase()))
    : zbxHosts;

  return (
    <div className="w-80 h-full flex flex-col border-l border-border/50 bg-card/95 backdrop-blur-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border/30">
        <h2 className="font-display text-sm font-bold text-foreground tracking-wider flex items-center gap-2">
          <Navigation className="w-4 h-4 text-neon-green" />
          BUILDER
        </h2>
        <p className="text-[10px] text-muted-foreground mt-0.5">Hosts, Links & Rotas</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {error && <p className="text-xs text-neon-red font-mono">{error}</p>}

        {/* ── HOSTS SECTION ── */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-display uppercase text-muted-foreground tracking-wider">Hosts ({hosts.length})</span>
            {hostStep === "idle" ? (
              <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={handleStartAdd}>
                <Plus className="w-3 h-3" /> Adicionar
              </Button>
            ) : (
              <Button size="sm" variant="default" className="h-6 text-[10px] gap-1" onClick={handleCancelAdd}>
                <X className="w-3 h-3" /> Cancelar
              </Button>
            )}
          </div>

          <AnimatePresence mode="wait">
            {/* Step: Groups */}
            {hostStep === "groups" && (
              <motion.div key="groups" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="space-y-2 p-2 rounded-lg border border-neon-green/20 bg-neon-green/5">
                  <p className="text-[10px] text-neon-green font-mono">Selecione o Grupo de Hosts</p>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input placeholder="Buscar grupo..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-7 text-xs pl-7" />
                  </div>
                  {loading ? (
                    <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 text-neon-green animate-spin" /></div>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {filteredGroups.map((g) => (
                        <button
                          key={g.groupid}
                          onClick={() => handleSelectGroup(g)}
                          className="w-full rounded p-2 border border-border/20 hover:border-neon-green/30 transition-all text-left flex items-center justify-between"
                        >
                          <div className="flex items-center gap-1.5">
                            <Network className="w-3 h-3 text-neon-blue" />
                            <span className="text-[10px] font-mono text-foreground">{g.name}</span>
                          </div>
                          <ChevronRight className="w-3 h-3 text-muted-foreground/30" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Step: Hosts in group */}
            {hostStep === "hosts" && (
              <motion.div key="hosts" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="space-y-2 p-2 rounded-lg border border-neon-green/20 bg-neon-green/5">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-neon-green font-mono">Hosts: <span className="text-neon-blue">{selectedGroup?.name}</span></p>
                    <button onClick={() => { setHostStep("groups"); setSearch(""); }} className="text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                      <ChevronLeft className="w-2.5 h-2.5" />Grupos
                    </button>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input placeholder="Buscar host..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-7 text-xs pl-7" />
                  </div>
                  {/* Icon type + critical toggle */}
                  <div className="flex items-center gap-2">
                    <Select value={hostForm.icon_type} onValueChange={(v) => setHostForm((p) => ({ ...p, icon_type: v }))}>
                      <SelectTrigger className="h-6 text-[10px] flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["router", "switch", "firewall", "server", "antenna", "olt", "dwdm"].map((t) => (
                          <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-muted-foreground">Crítico</span>
                      <Switch checked={hostForm.is_critical} onCheckedChange={(c) => setHostForm((p) => ({ ...p, is_critical: c }))} className="scale-75" />
                    </div>
                  </div>
                  {loading ? (
                    <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 text-neon-green animate-spin" /></div>
                  ) : zbxHosts.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground text-center py-3">Nenhum host encontrado</p>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {filteredHosts.map((h) => {
                        const alreadyAdded = hosts.some((ex) => ex.zabbix_host_id === h.hostid);
                        return (
                          <button
                            key={h.hostid}
                            onClick={() => !alreadyAdded && handleSelectHost(h)}
                            disabled={alreadyAdded}
                            className={`w-full rounded p-2 border transition-all text-left flex items-center justify-between ${
                              alreadyAdded
                                ? "border-neon-green/20 bg-neon-green/5 opacity-50 cursor-not-allowed"
                                : "border-border/20 hover:border-neon-green/30"
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <Server className="w-3 h-3 text-neon-green" />
                              <span className="text-[10px] font-mono text-foreground">{h.name || h.host}</span>
                            </div>
                            {alreadyAdded ? (
                              <span className="text-[8px] text-neon-green/60">✓</span>
                            ) : (
                              <MapPin className="w-3 h-3 text-muted-foreground/30" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Step: Placing on map */}
            {hostStep === "placing" && (
              <motion.div key="placing" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="space-y-2 p-2 rounded-lg border border-neon-amber/30 bg-neon-amber/5">
                  <p className="text-[10px] text-neon-amber font-display uppercase tracking-wider">Clique no mapa para posicionar</p>
                  <div className="flex items-center gap-1.5">
                    <Server className="w-3 h-3 text-neon-green" />
                    <span className="text-xs font-display font-bold text-foreground">{selectedZbxHost?.name || selectedZbxHost?.host}</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground font-mono">Grupo: {selectedGroup?.name} • Tipo: {hostForm.icon_type}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Host list */}
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {hosts.map((h) => (
              <div key={h.id} className="space-y-1">
                <div className="flex items-center justify-between p-1.5 rounded bg-muted/20 text-[10px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <MapPin className="w-3 h-3 text-neon-green shrink-0" />
                    <span className="font-mono text-foreground truncate">{h.host_name || h.zabbix_host_id}</span>
                    {h.is_critical && <AlertTriangle className="w-3 h-3 text-neon-red shrink-0" />}
                  </div>
                  <div className="flex gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-5 w-5 ${editingHostCoords === h.id ? "text-neon-blue" : ""}`}
                      onClick={() => {
                        if (editingHostCoords === h.id) {
                          setEditingHostCoords(null);
                        } else {
                          setEditingHostCoords(h.id);
                          setCoordsForm({ lat: String(h.lat), lon: String(h.lon) });
                        }
                      }}
                      title="Editar coordenadas"
                    >
                      <Pencil className="w-3 h-3 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onRemoveHost(h.id)}>
                      <Trash2 className="w-3 h-3 text-muted-foreground hover:text-neon-red" />
                    </Button>
                  </div>
                </div>
                {/* Inline coords editor */}
                <AnimatePresence>
                  {editingHostCoords === h.id && onUpdateHostPosition && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-2 rounded border border-neon-blue/20 bg-neon-blue/5 space-y-1.5">
                        <div className="flex gap-1.5">
                          <div className="flex-1">
                            <label className="text-[8px] text-muted-foreground">Latitude</label>
                            <Input
                              value={coordsForm.lat}
                              onChange={(e) => setCoordsForm((p) => ({ ...p, lat: e.target.value }))}
                              className="h-6 text-[10px] font-mono"
                              placeholder="-23.5505"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-[8px] text-muted-foreground">Longitude</label>
                            <Input
                              value={coordsForm.lon}
                              onChange={(e) => setCoordsForm((p) => ({ ...p, lon: e.target.value }))}
                              className="h-6 text-[10px] font-mono"
                              placeholder="-46.6333"
                            />
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            className="h-5 text-[9px] flex-1 gap-1 bg-neon-green/10 text-neon-green border border-neon-green/30"
                            onClick={() => {
                              const lat = parseFloat(coordsForm.lat);
                              const lon = parseFloat(coordsForm.lon);
                              if (isNaN(lat) || isNaN(lon)) return;
                              onUpdateHostPosition(h.id, lat, lon);
                              setEditingHostCoords(null);
                            }}
                          >
                            <Save className="w-2.5 h-2.5" />Aplicar
                          </Button>
                          <Button size="sm" variant="outline" className="h-5 text-[9px]" onClick={() => setEditingHostCoords(null)}>
                            <X className="w-2.5 h-2.5" />
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </section>

        {/* ── CREATE LINK ── */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-display uppercase text-muted-foreground tracking-wider">Links ({links.length})</span>
            <Button
              size="sm"
              variant={mode === "connect-origin" || mode === "connect-dest" ? "default" : "outline"}
              className="h-6 text-[10px] gap-1"
              onClick={() => onModeChange(mode === "connect-origin" || mode === "connect-dest" ? "idle" : "connect-origin")}
            >
              {mode === "connect-origin" || mode === "connect-dest" ? <X className="w-3 h-3" /> : <Link2 className="w-3 h-3" />}
              {mode === "connect-origin" ? "Sel. Origem" : mode === "connect-dest" ? "Sel. Destino" : "Conectar"}
            </Button>
          </div>

          <AnimatePresence>
            {(mode === "connect-origin" || mode === "connect-dest") && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-2 p-2 rounded-lg border border-neon-blue/20 bg-neon-blue/5">
                  <p className="text-[10px] text-neon-blue font-mono">
                    {mode === "connect-origin" ? "Clique no host de ORIGEM no mapa" : "Clique no host de DESTINO no mapa"}
                  </p>
                  {mode === "connect-dest" && pendingOrigin && (
                    <p className="text-[9px] text-muted-foreground font-mono">
                      Origem: <span className="text-neon-green">{hosts.find((h) => h.id === pendingOrigin)?.host_name ?? "?"}</span>
                    </p>
                  )}
                  <Select value={linkForm.link_type} onValueChange={(v) => setLinkForm((p) => ({ ...p, link_type: v }))}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["fiber", "radio", "mpls", "vpn", "starlink", "copper"].map((t) => (
                        <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Topologia em Anel</span>
                    <Switch checked={linkForm.is_ring} onCheckedChange={(c) => setLinkForm((p) => ({ ...p, is_ring: c }))} />
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground">Capacidade (Mbps)</label>
                    <Input
                      type="number"
                      value={linkForm.capacity_mbps ?? 1000}
                      onChange={(e) => setLinkForm((p) => ({ ...p, capacity_mbps: parseInt(e.target.value) || 1000 }))}
                      className="h-7 text-xs font-mono"
                      placeholder="100000 = 100GE"
                    />
                    <p className="text-[8px] text-muted-foreground/60 mt-0.5">Ex: 100000 (100GE), 10000 (10G), 1000 (1G)</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Link list */}
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {links.map((l) => {
              const oName = hosts.find((h) => h.id === l.origin_host_id)?.host_name || "?";
              const dName = hosts.find((h) => h.id === l.dest_host_id)?.host_name || "?";
              return (
                <div key={l.id} className="space-y-1">
                  <div className="flex items-center justify-between p-1.5 rounded bg-muted/20 text-[10px]">
                    <div className="flex items-center gap-1 min-w-0">
                      <Link2 className="w-3 h-3 text-neon-blue shrink-0" />
                      <span className="font-mono text-foreground truncate">{oName} → {dName}</span>
                      {l.is_ring && <span className="text-[8px] px-1 rounded bg-neon-amber/10 text-neon-amber">ANEL</span>}
                      <span className="text-[8px] text-muted-foreground/60 shrink-0">{l.capacity_mbps >= 1000 ? `${l.capacity_mbps / 1000}G` : `${l.capacity_mbps}M`}</span>
                    </div>
                    <div className="flex gap-0.5">
                      {connectionId && tenantId && onAddLinkItem && onRemoveLinkItem && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-5 w-5 ${editingLinkItemsId === l.id ? "text-neon-blue" : ""}`}
                          onClick={() => setEditingLinkItemsId(editingLinkItemsId === l.id ? null : l.id)}
                          title="Telemetria"
                        >
                          <Cable className="w-3 h-3 text-muted-foreground" />
                        </Button>
                      )}
                      {onRecalculateRoute && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          disabled={recalculating === l.id}
                          onClick={async () => {
                            setRecalculating(l.id);
                            try { await onRecalculateRoute(l.id); } finally { setRecalculating(null); }
                          }}
                          title="Recalcular Rota"
                        >
                          <RotateCcw className={`w-3 h-3 text-muted-foreground ${recalculating === l.id ? "animate-spin" : ""}`} />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onEditRoute(l.id)}>
                        <Pencil className="w-3 h-3 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onRemoveLink(l.id)}>
                        <Trash2 className="w-3 h-3 text-muted-foreground hover:text-neon-red" />
                      </Button>
                    </div>
                  </div>
                  {/* Link Items Editor inline */}
                  <AnimatePresence>
                    {editingLinkItemsId === l.id && connectionId && tenantId && onAddLinkItem && onRemoveLinkItem && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden space-y-1"
                      >
                        {/* Capacity editor */}
                        {onUpdateLinkCapacity && (
                          <div className="p-2 rounded border border-border/20 bg-muted/10 space-y-1">
                            <label className="text-[9px] text-muted-foreground font-mono">Capacidade (Mbps)</label>
                            <div className="flex gap-1">
                              <Input
                                type="number"
                                defaultValue={l.capacity_mbps}
                                className="h-6 text-[10px] font-mono flex-1"
                                placeholder="100000"
                                onBlur={(e) => {
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val) && val > 0 && val !== l.capacity_mbps) {
                                    onUpdateLinkCapacity(l.id, val);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    const val = parseInt((e.target as HTMLInputElement).value);
                                    if (!isNaN(val) && val > 0) onUpdateLinkCapacity(l.id, val);
                                  }
                                }}
                              />
                              <div className="flex gap-0.5">
                                {[1000, 10000, 100000].map((v) => (
                                  <Button
                                    key={v}
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-1.5 text-[8px] font-mono"
                                    onClick={() => onUpdateLinkCapacity(l.id, v)}
                                  >
                                    {v >= 1000 ? `${v / 1000}G` : `${v}M`}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                        <LinkItemsEditor
                          link={l}
                          hosts={hosts}
                          connectionId={connectionId}
                          tenantId={tenantId}
                          onAddItem={onAddLinkItem}
                          onRemoveItem={onRemoveLinkItem}
                          onClose={() => setEditingLinkItemsId(null)}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── FTTH / CTOs SECTION ── */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-display uppercase text-muted-foreground tracking-wider">
              CTOs ({ctos.length})
            </span>
            {!ctoAdding ? (
              <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => { setCtoAdding(true); }} disabled={!onAddCTO}>
                <Plus className="w-3 h-3" /> Adicionar CTO
              </Button>
            ) : (
              <Button size="sm" variant="default" className="h-6 text-[10px] gap-1" onClick={() => { setCtoAdding(false); setCtoPlacing(false); onModeChange("idle"); }}>
                <X className="w-3 h-3" /> Cancelar
              </Button>
            )}
          </div>

          <AnimatePresence>
            {ctoAdding && !ctoPlacing && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="space-y-2 p-2 rounded-lg border border-neon-cyan/20 bg-neon-cyan/5">
                  <p className="text-[10px] text-neon-cyan font-mono">Nova CTO</p>
                  <Input placeholder="Nome da CTO" value={ctoForm.name} onChange={(e) => setCtoForm((p) => ({ ...p, name: e.target.value }))} className="h-7 text-xs" />
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[8px] text-muted-foreground">Capacidade</label>
                      <Select value={ctoForm.capacity} onValueChange={(v) => setCtoForm((p) => ({ ...p, capacity: v as "8" | "16" | "32" }))}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="8" className="text-xs">8 portas</SelectItem>
                          <SelectItem value="16" className="text-xs">16 portas</SelectItem>
                          <SelectItem value="32" className="text-xs">32 portas</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1">
                      <label className="text-[8px] text-muted-foreground">Porta PON</label>
                      <Input type="number" value={ctoForm.pon_port_index} onChange={(e) => setCtoForm((p) => ({ ...p, pon_port_index: parseInt(e.target.value) || 0 }))} className="h-7 text-xs font-mono" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[8px] text-muted-foreground">OLT (Host Pai)</label>
                    <Select value={ctoOltId || ""} onValueChange={(v) => setCtoOltId(v || null)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="" className="text-xs">Nenhuma</SelectItem>
                        {hosts.map((h) => (
                          <SelectItem key={h.id} value={h.id} className="text-xs">{h.host_name || h.zabbix_host_id}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input placeholder="Descrição (opcional)" value={ctoForm.description} onChange={(e) => setCtoForm((p) => ({ ...p, description: e.target.value }))} className="h-7 text-xs" />
                  <Button size="sm" className="w-full h-7 text-[10px] gap-1 bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30" onClick={() => { setCtoPlacing(true); onModeChange("place-host"); }}>
                    <MapPin className="w-3 h-3" /> Clicar no mapa para posicionar
                  </Button>
                </div>
              </motion.div>
            )}
            {ctoPlacing && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="p-2 rounded-lg border border-neon-amber/30 bg-neon-amber/5">
                  <p className="text-[10px] text-neon-amber font-display uppercase tracking-wider">Clique no mapa para posicionar a CTO</p>
                  <p className="text-[9px] text-muted-foreground font-mono mt-1">{ctoForm.name || "CTO"} • {ctoForm.capacity} portas</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* CTO list */}
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {ctos.map((c) => {
              const statusColor = c.status_calculated === "OK" ? "text-neon-green" : c.status_calculated === "CRITICAL" ? "text-neon-red" : c.status_calculated === "DEGRADED" ? "text-neon-amber" : "text-muted-foreground";
              return (
                <div key={c.id} className="flex items-center justify-between p-1.5 rounded bg-muted/20 text-[10px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Box className="w-3 h-3 text-neon-cyan shrink-0" />
                    <span className="font-mono text-foreground truncate">{c.name || "CTO"}</span>
                    <span className={`text-[8px] font-bold ${statusColor}`}>{c.status_calculated}</span>
                    <span className="text-[8px] text-muted-foreground/60">{c.capacity}p</span>
                  </div>
                  {onRemoveCTO && (
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onRemoveCTO(c.id)}>
                      <Trash2 className="w-3 h-3 text-muted-foreground hover:text-neon-red" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── ROUTE EDITOR INFO ── */}
        <AnimatePresence>
          {editingLinkId && (
            <motion.section
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="p-2 rounded-lg border border-neon-amber/30 bg-neon-amber/5 space-y-2">
                <p className="text-[10px] text-neon-amber font-display uppercase tracking-wider">Modo Desenhar Rota</p>
                <p className="text-[10px] text-muted-foreground font-mono">Clique no mapa para adicionar pontos intermediários. A polyline é atualizada em tempo real.</p>
                <div className="flex gap-2">
                  <Button size="sm" className="h-6 text-[10px] flex-1 gap-1 bg-neon-green/10 text-neon-green border border-neon-green/30" onClick={onCancelEditRoute}>
                    <Save className="w-3 h-3" />Salvar
                  </Button>
                  <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={onCancelEditRoute}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export { type Props as MapBuilderPanelProps };
