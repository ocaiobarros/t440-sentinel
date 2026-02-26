import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Server, Network, MonitorSpeaker, ChevronRight, ChevronLeft, Loader2, CheckCircle2, Wifi, Settings2, Check } from "lucide-react";
import { useZabbixConnections } from "@/hooks/useZabbixConnections";
import { supabase } from "@/integrations/supabase/client";

/* ─── Types ──────────────────────────── */

export interface IdracConfig {
  connectionId: string;
  connectionName: string;
  hostgroupId: string;
  hostgroupName: string;
  hostId: string;
  hostName: string;
  /** Multi-host selection (optional, used by VM monitor) */
  hosts?: Array<{ id: string; name: string }>;
}

interface ZabbixHostGroup {
  groupid: string;
  name: string;
}

interface ZabbixHost {
  hostid: string;
  host: string;
  name: string;
}

interface Props {
  onComplete: (config: IdracConfig) => void;
  existingConfig?: IdracConfig | null;
  /** Override the wizard title (default: "Server Monitor") */
  title?: string;
  /** Override the wizard subtitle */
  subtitle?: string;
  /** Override the wizard icon */
  icon?: React.ElementType;
  /** Allow selecting multiple hosts (used by VM monitor) */
  multiSelect?: boolean;
}

const STORAGE_KEY = "flowpulse_idrac_config";

export function loadIdracConfig(): IdracConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as IdracConfig;
  } catch {
    return null;
  }
}

export function saveIdracConfig(config: IdracConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearIdracConfig() {
  localStorage.removeItem(STORAGE_KEY);
}

/* ─── Zabbix proxy helper ────────────── */

async function zabbixProxy(connectionId: string, method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke("zabbix-proxy", {
    body: { connection_id: connectionId, method, params },
  });
  if (error) throw new Error(String(error));
  if (data?.error) throw new Error(data.error);
  return data?.result;
}

/* ─── Component ──────────────────────── */

export default function IdracSetupWizard({ onComplete, existingConfig, title = "Server Monitor", subtitle = "Dell iDRAC (T440, R440, R720, R740) • Linux/SNMP (Huawei 2288H)", icon: HeaderIcon = MonitorSpeaker, multiSelect = false }: Props) {
  const { connections, isLoading: connectionsLoading } = useZabbixConnections();
  const [step, setStep] = useState(0); // 0=connection, 1=hostgroup, 2=host

  // Selections
  const [selectedConnection, setSelectedConnection] = useState<{ id: string; name: string } | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<{ id: string; name: string } | null>(null);
  const [selectedHost, setSelectedHost] = useState<{ id: string; name: string } | null>(null);
  const [selectedHosts, setSelectedHosts] = useState<Array<{ id: string; name: string }>>([]);

  // Data
  const [hostgroups, setHostgroups] = useState<ZabbixHostGroup[]>([]);
  const [hosts, setHosts] = useState<ZabbixHost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch host groups when connection selected
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

  // Fetch hosts when group selected
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
    setSelectedGroup(null);
    setSelectedHost(null);
    setStep(1);
    fetchHostGroups(conn.id);
  };

  const handleSelectGroup = (group: ZabbixHostGroup) => {
    setSelectedGroup({ id: group.groupid, name: group.name });
    setSelectedHost(null);
    setStep(2);
    fetchHosts(selectedConnection!.id, group.groupid);
  };

  const handleSelectHost = (host: ZabbixHost) => {
    if (multiSelect) {
      setSelectedHosts(prev => {
        const exists = prev.some(h => h.id === host.hostid);
        if (exists) return prev.filter(h => h.id !== host.hostid);
        return [...prev, { id: host.hostid, name: host.name || host.host }];
      });
      return;
    }
    const config: IdracConfig = {
      connectionId: selectedConnection!.id,
      connectionName: selectedConnection!.name,
      hostgroupId: selectedGroup!.id,
      hostgroupName: selectedGroup!.name,
      hostId: host.hostid,
      hostName: host.name || host.host,
    };
    saveIdracConfig(config);
    onComplete(config);
  };

  const handleConfirmMultiSelect = () => {
    if (selectedHosts.length === 0) return;
    const first = selectedHosts[0];
    const config: IdracConfig = {
      connectionId: selectedConnection!.id,
      connectionName: selectedConnection!.name,
      hostgroupId: selectedGroup!.id,
      hostgroupName: selectedGroup!.name,
      hostId: first.id,
      hostName: selectedHosts.map(h => h.name).join(", "),
      hosts: selectedHosts,
    };
    saveIdracConfig(config);
    onComplete(config);
  };

  const activeConnections = connections.filter((c) => c.is_active);

  const steps = [
    { icon: Wifi, label: "Conexão Zabbix", description: "Selecione o servidor Zabbix" },
    { icon: Network, label: "Grupo de Hosts", description: "Selecione o grupo de hosts" },
    { icon: Server, label: "Host", description: "Selecione o servidor para monitorar" },
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
            <HeaderIcon className="w-8 h-8 text-neon-green" />
            <h1 className="font-display text-2xl font-bold tracking-wider">
              <span className="text-neon-green text-glow-green">FLOWPULSE</span>
              <span className="text-muted-foreground mx-2">|</span>
              <span className="text-foreground">{title}</span>
            </h1>
          </div>
          <p className="text-xs text-muted-foreground font-mono">{subtitle}</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;
            return (
              <div key={i} className="flex items-center gap-2">
                {i > 0 && <div className={`w-8 h-px ${isDone ? "bg-neon-green" : "bg-border/30"}`} />}
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-display uppercase transition-all border ${
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
              <motion.div key="step0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h3 className="text-sm font-display font-bold text-foreground mb-1">{steps[0].description}</h3>
                <p className="text-[10px] text-muted-foreground font-mono mb-4">
                  Conexões configuradas no Admin Hub
                </p>
                {connectionsLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 text-neon-green animate-spin" /></div>
                ) : activeConnections.length === 0 ? (
                  <div className="text-center py-8">
                    <Wifi className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Nenhuma conexão Zabbix ativa encontrada</p>
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
              </motion.div>
            )}

            {/* Step 1: Host Group */}
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-display font-bold text-foreground">{steps[1].description}</h3>
                    <p className="text-[10px] text-muted-foreground font-mono">Conexão: <span className="text-neon-cyan">{selectedConnection?.name}</span></p>
                  </div>
                  <button onClick={() => setStep(0)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronLeft className="w-3 h-3" /> Voltar
                  </button>
                </div>
                {loading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 text-neon-green animate-spin" /></div>
                ) : (
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                    {hostgroups.map((g) => (
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
                )}
              </motion.div>
            )}

            {/* Step 2: Host */}
            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-display font-bold text-foreground">{steps[2].description}</h3>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      Grupo: <span className="text-neon-blue">{selectedGroup?.name}</span>
                    </p>
                  </div>
                  <button onClick={() => setStep(1)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronLeft className="w-3 h-3" /> Voltar
                  </button>
                </div>
                {loading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 text-neon-green animate-spin" /></div>
                ) : hosts.length === 0 ? (
                  <div className="text-center py-8">
                    <Server className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Nenhum host encontrado neste grupo</p>
                  </div>
                ) : (
                  <>
                    {multiSelect && selectedHosts.length > 0 && (
                      <div className="flex items-center justify-between mb-3 px-1">
                        <span className="text-[10px] font-mono text-neon-green">
                          {selectedHosts.length} host{selectedHosts.length > 1 ? 's' : ''} selecionado{selectedHosts.length > 1 ? 's' : ''}
                        </span>
                        <button
                          onClick={handleConfirmMultiSelect}
                          className="px-4 py-1.5 rounded-lg text-xs font-display font-bold bg-neon-green/20 text-neon-green border border-neon-green/30 hover:bg-neon-green/30 transition-all"
                        >
                          Confirmar Seleção →
                        </button>
                      </div>
                    )}
                    <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                      {hosts.map((h) => {
                        const isSelected = multiSelect && selectedHosts.some(s => s.id === h.hostid);
                        return (
                          <button
                            key={h.hostid}
                            onClick={() => handleSelectHost(h)}
                            className={`w-full glass-card rounded-lg p-3 border transition-all group text-left flex items-center justify-between ${
                              isSelected ? 'border-neon-green/50 bg-neon-green/5' : 'border-border/20 hover:border-neon-green/30'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {multiSelect ? (
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                                  isSelected ? 'bg-neon-green border-neon-green' : 'border-muted-foreground/40'
                                }`}>
                                  {isSelected && <Check className="w-3 h-3 text-background" />}
                                </div>
                              ) : (
                                <Server className="w-4 h-4 text-neon-green" />
                              )}
                              <div>
                                <span className={`text-xs font-display font-bold transition-colors ${
                                  isSelected ? 'text-neon-green' : 'text-foreground group-hover:text-neon-green'
                                }`}>{h.name || h.host}</span>
                                {h.name && h.host !== h.name && (
                                  <span className="text-[9px] font-mono text-muted-foreground ml-2">{h.host}</span>
                                )}
                              </div>
                            </div>
                            {!multiSelect && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-neon-green transition-colors" />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Existing config shortcut */}
        {existingConfig && (
          <div className="mt-4 text-center">
            <button
              onClick={() => onComplete(existingConfig)}
              className="text-[10px] font-mono text-muted-foreground hover:text-neon-green transition-colors"
            >
              Usar configuração anterior: <span className="text-neon-cyan">{existingConfig.hostName}</span> →
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
