import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, Wifi, Network, Server, ChevronRight, ChevronLeft,
  Loader2, CheckCircle2, MapPin, Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useZabbixConnections } from "@/hooks/useZabbixConnections";
import { supabase } from "@/integrations/supabase/client";

/* ── Types ── */
interface ZabbixHostGroup { groupid: string; name: string }
interface ZabbixHost { hostid: string; host: string; name: string }

export interface FlowMapWizardResult {
  connectionId: string;
  connectionName: string;
  mapName: string;
  selectedHosts: { hostid: string; hostName: string; groupName: string }[];
}

interface Props {
  onComplete: (result: FlowMapWizardResult) => void;
  onCancel?: () => void;
}

/* ── Zabbix proxy ── */
async function zabbixProxy(connectionId: string, method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke("zabbix-proxy", {
    body: { connection_id: connectionId, method, params },
  });
  if (error) throw new Error(String(error));
  if (data?.error) throw new Error(data.error);
  return data?.result;
}

/* ── Component ── */
export default function FlowMapSetupWizard({ onComplete, onCancel }: Props) {
  const { connections, isLoading: connectionsLoading } = useZabbixConnections();
  const [step, setStep] = useState(0); // 0=connection, 1=name, 2=group, 3=hosts

  const [selectedConnection, setSelectedConnection] = useState<{ id: string; name: string } | null>(null);
  const [mapName, setMapName] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<{ id: string; name: string } | null>(null);
  const [selectedHosts, setSelectedHosts] = useState<{ hostid: string; hostName: string; groupName: string }[]>([]);

  const [hostgroups, setHostgroups] = useState<ZabbixHostGroup[]>([]);
  const [hosts, setHosts] = useState<ZabbixHost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const activeConnections = connections.filter((c) => c.is_active);

  const fetchHostGroups = async (connId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await zabbixProxy(connId, "hostgroup.get", {
        output: ["groupid", "name"],
        sortfield: "name",
        real_hosts: true,
      });
      setHostgroups(result as ZabbixHostGroup[]);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const fetchHosts = async (connId: string, groupId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await zabbixProxy(connId, "host.get", {
        output: ["hostid", "host", "name"],
        groupids: groupId,
        sortfield: "name",
      });
      setHosts(result as ZabbixHost[]);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectConnection = (conn: { id: string; name: string }) => {
    setSelectedConnection(conn);
    setStep(1);
  };

  const handleNameNext = () => {
    if (!mapName.trim()) return;
    setStep(2);
    fetchHostGroups(selectedConnection!.id);
  };

  const handleSelectGroup = (group: ZabbixHostGroup) => {
    setSelectedGroup({ id: group.groupid, name: group.name });
    setStep(3);
    setSearch("");
    fetchHosts(selectedConnection!.id, group.groupid);
  };

  const toggleHost = (host: ZabbixHost) => {
    setSelectedHosts((prev) => {
      const exists = prev.find((h) => h.hostid === host.hostid);
      if (exists) return prev.filter((h) => h.hostid !== host.hostid);
      return [...prev, { hostid: host.hostid, hostName: host.name || host.host, groupName: selectedGroup!.name }];
    });
  };

  const handleFinish = () => {
    if (!selectedConnection || !mapName.trim() || selectedHosts.length === 0) return;
    onComplete({
      connectionId: selectedConnection.id,
      connectionName: selectedConnection.name,
      mapName: mapName.trim(),
      selectedHosts,
    });
  };

  const filteredGroups = search
    ? hostgroups.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
    : hostgroups;

  const filteredHosts = search
    ? hosts.filter((h) => (h.name || h.host).toLowerCase().includes(search.toLowerCase()))
    : hosts;

  const steps = [
    { icon: Wifi, label: "Conexão" },
    { icon: MapPin, label: "Nome" },
    { icon: Network, label: "Grupo" },
    { icon: Server, label: "Hosts" },
  ];

  return (
    <div className="min-h-screen bg-background grid-pattern scanlines relative flex items-center justify-center p-4">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-neon-green/5 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl relative z-10"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Zap className="w-8 h-8 text-neon-green" />
            <h1 className="font-display text-2xl font-bold tracking-wider">
              <span className="text-neon-green text-glow-green">FLOWMAP</span>
              <span className="text-muted-foreground mx-2">|</span>
              <span className="text-foreground">Setup</span>
            </h1>
          </div>
          <p className="text-xs text-muted-foreground font-mono">Configure a conexão e selecione os hosts do mapa</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-1 mb-8">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;
            return (
              <div key={i} className="flex items-center gap-1">
                {i > 0 && <div className={`w-6 h-px ${isDone ? "bg-neon-green" : "bg-border/30"}`} />}
                <div
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-display uppercase transition-all border ${
                    isActive
                      ? "bg-neon-green/10 text-neon-green border-neon-green/30"
                      : isDone
                        ? "bg-neon-green/5 text-neon-green/70 border-neon-green/20"
                        : "text-muted-foreground border-border/20"
                  }`}
                >
                  {isDone ? <CheckCircle2 className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div className="glass-card rounded-xl p-6 border border-border/30 min-h-[300px]">
          {error && <p className="text-xs text-neon-red font-mono mb-3">{error}</p>}

          <AnimatePresence mode="wait">
            {/* Step 0: Connection */}
            {step === 0 && (
              <motion.div key="s0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h3 className="text-sm font-display font-bold text-foreground mb-1">Selecione a Conexão Zabbix</h3>
                <p className="text-[10px] text-muted-foreground font-mono mb-4">Conexões ativas configuradas no FlowPulse</p>
                {connectionsLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 text-neon-green animate-spin" /></div>
                ) : activeConnections.length === 0 ? (
                  <div className="text-center py-8">
                    <Wifi className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Nenhuma conexão Zabbix ativa</p>
                    <a href="/admin" className="text-[10px] text-neon-cyan hover:underline mt-1 inline-block">Ir para Admin Hub →</a>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeConnections.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => handleSelectConnection({ id: c.id, name: c.name })}
                        className="w-full glass-card rounded-lg p-4 border border-border/30 hover:border-neon-green/30 transition-all group text-left flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <Wifi className="w-5 h-5 text-neon-cyan" />
                          <div>
                            <div className="text-sm font-display font-bold text-foreground group-hover:text-neon-green transition-colors">{c.name}</div>
                            <div className="text-[10px] font-mono text-muted-foreground">{c.url}</div>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-neon-green transition-colors" />
                      </button>
                    ))}
                  </div>
                )}
                {onCancel && (
                  <div className="mt-4 text-center">
                    <button onClick={onCancel} className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors">
                      ← Voltar para lista
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 1: Map Name */}
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-display font-bold text-foreground">Nome do Mapa</h3>
                    <p className="text-[10px] text-muted-foreground font-mono">Conexão: <span className="text-neon-cyan">{selectedConnection?.name}</span></p>
                  </div>
                  <button onClick={() => setStep(0)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronLeft className="w-3 h-3" /> Voltar
                  </button>
                </div>
                <div className="space-y-4">
                  <Input
                    placeholder="Ex: Backbone Nacional, Ring SP-RJ..."
                    value={mapName}
                    onChange={(e) => setMapName(e.target.value)}
                    className="text-sm"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleNameNext()}
                  />
                  <Button
                    onClick={handleNameNext}
                    disabled={!mapName.trim()}
                    className="w-full gap-2 bg-neon-green/20 text-neon-green border border-neon-green/30 hover:bg-neon-green/30"
                  >
                    Próximo <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 2: Host Group */}
            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-display font-bold text-foreground">Selecione o Grupo</h3>
                    <p className="text-[10px] text-muted-foreground font-mono">Mapa: <span className="text-neon-green">{mapName}</span></p>
                  </div>
                  <button onClick={() => setStep(1)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronLeft className="w-3 h-3" /> Voltar
                  </button>
                </div>
                {loading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 text-neon-green animate-spin" /></div>
                ) : (
                  <>
                    <div className="relative mb-3">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Buscar grupo..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8 h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                      {filteredGroups.map((g) => (
                        <button
                          key={g.groupid}
                          onClick={() => handleSelectGroup(g)}
                          className="w-full glass-card rounded-lg p-3 border border-border/20 hover:border-neon-green/30 transition-all group text-left flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <Network className="w-4 h-4 text-neon-blue" />
                            <span className="text-xs font-mono text-foreground group-hover:text-neon-green transition-colors">{g.name}</span>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-neon-green transition-colors" />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {/* Step 3: Hosts (multi-select) */}
            {step === 3 && (
              <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-display font-bold text-foreground">Selecione os Hosts</h3>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      Grupo: <span className="text-neon-blue">{selectedGroup?.name}</span>
                      {selectedHosts.length > 0 && (
                        <span className="ml-2 text-neon-green">• {selectedHosts.length} selecionado{selectedHosts.length > 1 ? "s" : ""}</span>
                      )}
                    </p>
                  </div>
                  <button onClick={() => { setStep(2); setSearch(""); }} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronLeft className="w-3 h-3" /> Voltar
                  </button>
                </div>
                {loading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 text-neon-green animate-spin" /></div>
                ) : hosts.length === 0 ? (
                  <div className="text-center py-8">
                    <Server className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Nenhum host encontrado</p>
                  </div>
                ) : (
                  <>
                    <div className="relative mb-3">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Buscar host..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8 h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                      {filteredHosts.map((h) => {
                        const isSelected = selectedHosts.some((s) => s.hostid === h.hostid);
                        return (
                          <button
                            key={h.hostid}
                            onClick={() => toggleHost(h)}
                            className={`w-full rounded-lg p-3 border transition-all text-left flex items-center justify-between ${
                              isSelected
                                ? "bg-neon-green/10 border-neon-green/40"
                                : "glass-card border-border/20 hover:border-neon-green/30"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {isSelected ? (
                                <CheckCircle2 className="w-4 h-4 text-neon-green shrink-0" />
                              ) : (
                                <Server className="w-4 h-4 text-muted-foreground shrink-0" />
                              )}
                              <div>
                                <span className={`text-xs font-display font-bold transition-colors ${isSelected ? "text-neon-green" : "text-foreground"}`}>
                                  {h.name || h.host}
                                </span>
                                {h.name && h.host !== h.name && (
                                  <span className="text-[9px] font-mono text-muted-foreground ml-2">{h.host}</span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Finish */}
                    <Button
                      onClick={handleFinish}
                      disabled={selectedHosts.length === 0}
                      className="w-full mt-4 gap-2 bg-neon-green/20 text-neon-green border border-neon-green/30 hover:bg-neon-green/30"
                    >
                      <MapPin className="w-4 h-4" />
                      Criar Mapa com {selectedHosts.length} host{selectedHosts.length !== 1 ? "s" : ""}
                    </Button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
