import React, { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, Wifi, Users, ChevronRight, ChevronLeft,
  Loader2, CheckCircle2, MapPin, Search, Check,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useZabbixConnections } from "@/hooks/useZabbixConnections";
import { useDashboardPersist } from "@/hooks/useDashboardPersist";
import { supabase } from "@/integrations/supabase/client";
import type { FlowDispConfig } from "@/hooks/useFlowDisponibilityData";

async function zabbixProxy(connectionId: string, method: string, params: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("zabbix-proxy", {
    body: { connection_id: connectionId, method, params },
  });
  if (error) throw new Error(String(error));
  if (data?.error) throw new Error(data.error);
  return data?.result;
}

const STEPS = [
  { icon: MapPin, label: "Nome" },
  { icon: Wifi, label: "Conexão" },
  { icon: Users, label: "Grupo" },
  { icon: Activity, label: "Hosts" },
];

export default function FlowDisponibility() {
  const navigate = useNavigate();
  const { connections, isLoading: connLoading } = useZabbixConnections();
  const { dashboardId, save, saving, loadedConfig, loadedName, loading: loadingExisting } = useDashboardPersist<FlowDispConfig>({
    category: "flowdisp",
    listPath: "/app/monitoring/flowdisp",
  });

  const [step, setStep] = useState(0);
  const [panelName, setPanelName] = useState("");
  const [selectedConn, setSelectedConn] = useState<{ id: string; name: string } | null>(null);
  const [groups, setGroups] = useState<{ groupid: string; name: string }[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<{ groupid: string; name: string } | null>(null);
  const [hostSearch, setHostSearch] = useState("");
  const [allHosts, setAllHosts] = useState<{ hostid: string; host: string; name: string }[]>([]);
  const [hostsLoading, setHostsLoading] = useState(false);
  const [selectedHostIds, setSelectedHostIds] = useState<Set<string>>(new Set());
  const [groupSearch, setGroupSearch] = useState("");

  // Load existing config
  useEffect(() => {
    if (loadedConfig) {
      setPanelName(loadedName || "");
      setSelectedConn({ id: loadedConfig.connectionId, name: loadedConfig.connectionName });
      setSelectedGroup({ groupid: loadedConfig.groupId, name: loadedConfig.groupName });
      setSelectedHostIds(new Set(loadedConfig.hostIds));
      setStep(3);
    }
  }, [loadedConfig, loadedName]);

  const activeConns = connections.filter((c) => c.is_active);

  // Fetch groups when connection selected
  const fetchGroups = useCallback(async (connId: string) => {
    setGroupsLoading(true);
    try {
      const result = await zabbixProxy(connId, "hostgroup.get", {
        output: ["groupid", "name"],
        real_hosts: true,
        sortfield: "name",
      });
      setGroups((result as any[]) || []);
    } catch (err) {
      setGroups([]);
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  // Fetch hosts when group selected
  const fetchHosts = useCallback(async (connId: string, groupId: string) => {
    setHostsLoading(true);
    try {
      const result = await zabbixProxy(connId, "host.get", {
        output: ["hostid", "host", "name"],
        groupids: [groupId],
        monitored_hosts: true,
        sortfield: "name",
      });
      setAllHosts((result as any[]) || []);
    } catch (err) {
      setAllHosts([]);
    } finally {
      setHostsLoading(false);
    }
  }, []);

  const handleSelectConn = (conn: { id: string; name: string }) => {
    setSelectedConn(conn);
    setSelectedGroup(null);
    setAllHosts([]);
    setSelectedHostIds(new Set());
    fetchGroups(conn.id);
    setStep(2);
  };

  const handleSelectGroup = (group: { groupid: string; name: string }) => {
    setSelectedGroup(group);
    setSelectedHostIds(new Set());
    if (selectedConn) fetchHosts(selectedConn.id, group.groupid);
    setStep(3);
  };

  const toggleHost = (hostId: string) => {
    setSelectedHostIds((prev) => {
      const next = new Set(prev);
      if (next.has(hostId)) next.delete(hostId);
      else next.add(hostId);
      return next;
    });
  };

  const selectAll = () => setSelectedHostIds(new Set(filteredHosts.map((h) => h.hostid)));
  const selectNone = () => setSelectedHostIds(new Set());

  const handleSave = async () => {
    if (!selectedConn || !selectedGroup || selectedHostIds.size === 0) return;
    const config: FlowDispConfig = {
      connectionId: selectedConn.id,
      connectionName: selectedConn.name,
      groupId: selectedGroup.groupid,
      groupName: selectedGroup.name,
      hostIds: Array.from(selectedHostIds),
    };
    await save(panelName, config);
  };

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(groupSearch.toLowerCase())
  );

  const filteredHosts = allHosts.filter((h) =>
    (h.name || h.host).toLowerCase().includes(hostSearch.toLowerCase())
  );

  if (loadingExisting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-neon-green animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-neon-green/4 rounded-full blur-[150px] pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-[500px] h-[300px] bg-neon-cyan/3 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl relative z-10"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            >
              <Activity className="w-8 h-8 text-neon-green" />
            </motion.div>
            <h1 className="font-display text-2xl font-bold tracking-wider">
              <span className="text-neon-green" style={{ textShadow: "0 0 20px rgba(57,255,20,0.5)" }}>FLOW</span>
              <span className="text-foreground">DISPONIBILITY</span>
            </h1>
          </div>
          <p className="text-xs text-muted-foreground font-mono">Configure seu painel de disponibilidade de rede via ICMP Ping</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-1 mb-8">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;
            return (
              <div key={i} className="flex items-center gap-1">
                {i > 0 && <div className={`w-6 h-px transition-colors ${isDone ? "bg-neon-green" : "bg-border/30"}`} />}
                <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-display uppercase transition-all border ${
                  isActive ? "bg-neon-green/10 text-neon-green border-neon-green/30" :
                  isDone ? "bg-neon-green/5 text-neon-green/70 border-neon-green/20" :
                  "text-muted-foreground border-border/20"
                }`}>
                  {isDone ? <CheckCircle2 className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div className="glass-card rounded-xl border border-border/30 min-h-[320px] overflow-hidden">
          <AnimatePresence mode="wait">

            {/* Step 0 — Nome */}
            {step === 0 && (
              <motion.div key="s0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-6">
                <h3 className="text-sm font-display font-bold text-foreground mb-1">Nome do Painel</h3>
                <p className="text-[10px] text-muted-foreground font-mono mb-4">Identifique este painel de disponibilidade</p>
                <Input
                  placeholder="Ex: Disponibilidade NOC, Rede Backbone..."
                  value={panelName}
                  onChange={(e) => setPanelName(e.target.value)}
                  className="text-sm mb-4"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && panelName.trim() && setStep(1)}
                />
                <Button
                  onClick={() => setStep(1)}
                  disabled={!panelName.trim()}
                  className="w-full gap-2 bg-neon-green/20 text-neon-green border border-neon-green/30 hover:bg-neon-green/30"
                >
                  Próximo <ChevronRight className="w-4 h-4" />
                </Button>
                <div className="mt-4 text-center">
                  <button onClick={() => navigate("/app/monitoring/flowdisp")} className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors">
                    ← Voltar para lista
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 1 — Conexão */}
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-display font-bold text-foreground">Conexão Zabbix</h3>
                    <p className="text-[10px] text-muted-foreground font-mono">Painel: <span className="text-neon-green">{panelName}</span></p>
                  </div>
                  <button onClick={() => setStep(0)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                    <ChevronLeft className="w-3 h-3" /> Voltar
                  </button>
                </div>
                {connLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 text-neon-green animate-spin" /></div>
                ) : activeConns.length === 0 ? (
                  <div className="text-center py-8">
                    <Wifi className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Nenhuma conexão Zabbix ativa</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeConns.map((c) => (
                      <button key={c.id} onClick={() => handleSelectConn({ id: c.id, name: c.name })}
                        className="w-full glass-card rounded-lg p-4 border border-border/30 hover:border-neon-green/30 transition-all group text-left flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <Wifi className="w-5 h-5 text-neon-cyan" />
                          <div>
                            <div className="text-sm font-display font-bold text-foreground group-hover:text-neon-green transition-colors">{c.name}</div>
                            <div className="text-[10px] font-mono text-muted-foreground">{c.url}</div>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-neon-green" />
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 2 — Grupo */}
            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-display font-bold text-foreground">Grupo de Hosts</h3>
                    <p className="text-[10px] text-muted-foreground font-mono">Conexão: <span className="text-neon-cyan">{selectedConn?.name}</span></p>
                  </div>
                  <button onClick={() => setStep(1)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                    <ChevronLeft className="w-3 h-3" /> Voltar
                  </button>
                </div>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                  <Input placeholder="Filtrar grupos..." value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} className="pl-8 text-xs h-8" />
                </div>
                {groupsLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 text-neon-green animate-spin" /></div>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {filteredGroups.map((g) => (
                      <button key={g.groupid} onClick={() => handleSelectGroup(g)}
                        className="w-full text-left px-3 py-2.5 rounded-lg border border-border/20 hover:border-neon-green/30 hover:bg-neon-green/5 transition-all group flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-neon-cyan group-hover:text-neon-green" />
                          <span className="text-xs font-mono text-foreground">{g.name}</span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-neon-green" />
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 3 — Hosts */}
            {step === 3 && (
              <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-display font-bold text-foreground">Selecionar Hosts</h3>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      Grupo: <span className="text-neon-cyan">{selectedGroup?.name}</span>
                      {selectedHostIds.size > 0 && <span className="ml-2 text-neon-green">• {selectedHostIds.size} selecionado(s)</span>}
                    </p>
                  </div>
                  <button onClick={() => setStep(2)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                    <ChevronLeft className="w-3 h-3" /> Voltar
                  </button>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                    <Input placeholder="Filtrar hosts..." value={hostSearch} onChange={(e) => setHostSearch(e.target.value)} className="pl-8 text-xs h-8" />
                  </div>
                  <button onClick={selectAll} className="text-[9px] font-mono text-neon-cyan hover:underline whitespace-nowrap">Todos</button>
                  <button onClick={selectNone} className="text-[9px] font-mono text-muted-foreground hover:underline whitespace-nowrap">Nenhum</button>
                </div>

                {hostsLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 text-neon-green animate-spin" /></div>
                ) : (
                  <div className="space-y-1 max-h-52 overflow-y-auto pr-1 mb-4">
                    {filteredHosts.map((h) => {
                      const selected = selectedHostIds.has(h.hostid);
                      return (
                        <button key={h.hostid} onClick={() => toggleHost(h.hostid)}
                          className={`w-full text-left px-3 py-2 rounded-lg border transition-all flex items-center gap-2.5 ${
                            selected ? "border-neon-green/30 bg-neon-green/8" : "border-border/20 hover:border-border/40"
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                            selected ? "bg-neon-green/20 border-neon-green/50" : "border-border/40"
                          }`}>
                            {selected && <Check className="w-2.5 h-2.5 text-neon-green" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-mono text-foreground truncate">{h.name || h.host}</p>
                            {h.name && h.name !== h.host && <p className="text-[8px] font-mono text-muted-foreground/50 truncate">{h.host}</p>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <Button
                  onClick={handleSave}
                  disabled={selectedHostIds.size === 0 || saving}
                  className="w-full gap-2 bg-neon-green/20 text-neon-green border border-neon-green/30 hover:bg-neon-green/30"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                  {dashboardId ? "Salvar Alterações" : "Criar Painel"}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
