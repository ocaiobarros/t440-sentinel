import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, MapPin, Link2, AlertTriangle, Save, X, Pencil, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FlowMapHost, FlowMapLink } from "@/hooks/useFlowMaps";

export type BuilderMode = "idle" | "add-host" | "connect-origin" | "connect-dest" | "draw-route";

interface Props {
  hosts: FlowMapHost[];
  links: FlowMapLink[];
  mode: BuilderMode;
  onModeChange: (m: BuilderMode) => void;
  /* Host actions */
  onAddHost: (data: { zabbix_host_id: string; host_name: string; host_group: string; icon_type: string; is_critical: boolean; lat: number; lon: number }) => void;
  onRemoveHost: (id: string) => void;
  /* Link actions */
  pendingOrigin: string | null;
  onSelectOrigin: (id: string) => void;
  onCreateLink: (data: { origin_host_id: string; dest_host_id: string; link_type: string; is_ring: boolean }) => void;
  onRemoveLink: (id: string) => void;
  /* Route editor */
  editingLinkId: string | null;
  onEditRoute: (linkId: string) => void;
  onCancelEditRoute: () => void;
}

export default function MapBuilderPanel({
  hosts, links, mode, onModeChange,
  onAddHost, onRemoveHost,
  pendingOrigin, onSelectOrigin, onCreateLink, onRemoveLink,
  editingLinkId, onEditRoute, onCancelEditRoute,
}: Props) {
  const [hostForm, setHostForm] = useState({
    zabbix_host_id: "", host_name: "", host_group: "", icon_type: "router", is_critical: false,
  });
  const [linkForm, setLinkForm] = useState({ link_type: "fiber", is_ring: false });

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
        {/* ── ADD HOST ── */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-display uppercase text-muted-foreground tracking-wider">Hosts ({hosts.length})</span>
            <Button
              size="sm"
              variant={mode === "add-host" ? "default" : "outline"}
              className="h-6 text-[10px] gap-1"
              onClick={() => onModeChange(mode === "add-host" ? "idle" : "add-host")}
            >
              {mode === "add-host" ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
              {mode === "add-host" ? "Cancelar" : "Adicionar"}
            </Button>
          </div>

          <AnimatePresence>
            {mode === "add-host" && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-2 p-2 rounded-lg border border-neon-green/20 bg-neon-green/5">
                  <p className="text-[10px] text-neon-green font-mono">Clique no mapa para posicionar</p>
                  <Input placeholder="Zabbix Host ID" value={hostForm.zabbix_host_id} onChange={(e) => setHostForm((p) => ({ ...p, zabbix_host_id: e.target.value }))} className="h-7 text-xs" />
                  <Input placeholder="Nome do Host" value={hostForm.host_name} onChange={(e) => setHostForm((p) => ({ ...p, host_name: e.target.value }))} className="h-7 text-xs" />
                  <Input placeholder="Grupo (Backbone, Cliente...)" value={hostForm.host_group} onChange={(e) => setHostForm((p) => ({ ...p, host_group: e.target.value }))} className="h-7 text-xs" />
                  <Select value={hostForm.icon_type} onValueChange={(v) => setHostForm((p) => ({ ...p, icon_type: v }))}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["router", "switch", "firewall", "server", "antenna", "olt", "dwdm"].map((t) => (
                        <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Host Crítico</span>
                    <Switch checked={hostForm.is_critical} onCheckedChange={(c) => setHostForm((p) => ({ ...p, is_critical: c }))} />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Host list */}
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {hosts.map((h) => (
              <div key={h.id} className="flex items-center justify-between p-1.5 rounded bg-muted/20 text-[10px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <MapPin className="w-3 h-3 text-neon-green shrink-0" />
                  <span className="font-mono text-foreground truncate">{h.host_name || h.zabbix_host_id}</span>
                  {h.is_critical && <AlertTriangle className="w-3 h-3 text-neon-red shrink-0" />}
                </div>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onRemoveHost(h.id)}>
                  <Trash2 className="w-3 h-3 text-muted-foreground hover:text-neon-red" />
                </Button>
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
                    {mode === "connect-origin" ? "Clique no host de ORIGEM" : "Clique no host de DESTINO"}
                  </p>
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
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Link list */}
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {links.map((l) => {
              const oName = hosts.find((h) => h.id === l.origin_host_id)?.host_name || "?";
              const dName = hosts.find((h) => h.id === l.dest_host_id)?.host_name || "?";
              return (
                <div key={l.id} className="flex items-center justify-between p-1.5 rounded bg-muted/20 text-[10px]">
                  <div className="flex items-center gap-1 min-w-0">
                    <Link2 className="w-3 h-3 text-neon-blue shrink-0" />
                    <span className="font-mono text-foreground truncate">{oName} → {dName}</span>
                    {l.is_ring && <span className="text-[8px] px-1 rounded bg-neon-amber/10 text-neon-amber">ANEL</span>}
                  </div>
                  <div className="flex gap-0.5">
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onEditRoute(l.id)}>
                      <Pencil className="w-3 h-3 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onRemoveLink(l.id)}>
                      <Trash2 className="w-3 h-3 text-muted-foreground hover:text-neon-red" />
                    </Button>
                  </div>
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
