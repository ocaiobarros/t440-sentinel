import { useState, useEffect } from 'react';
import { Activity, Server, Database, Power, Loader2, RefreshCw, Wifi } from 'lucide-react';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import StatusCard from '@/components/dashboard/StatusCard';
import TemperatureSection from '@/components/dashboard/TemperatureSection';
import FanSection from '@/components/dashboard/FanSection';
import PowerSection from '@/components/dashboard/PowerSection';
import StorageSection from '@/components/dashboard/StorageSection';
import NetworkSection from '@/components/dashboard/NetworkSection';
import InventorySection from '@/components/dashboard/InventorySection';
import { useZabbixConnections } from '@/hooks/useZabbixConnections';
import {
  useIdracLive,
  extractStatus,
  extractTemperatures,
  extractFans,
  extractPower,
  extractDisks,
  extractRaid,
  extractNics,
  extractInventory,
} from '@/hooks/useIdracLive';

const Index = () => {
  const { connections, isLoading: connectionsLoading } = useZabbixConnections();
  const { hosts, hostsLoading, data, dataLoading, lastRefresh, refresh, error, fetchHosts, fetchItems } = useIdracLive();

  const [selectedConnection, setSelectedConnection] = useState<string>("");
  const [selectedHost, setSelectedHost] = useState<string>("");

  // Auto-select first connection
  useEffect(() => {
    if (connections.length > 0 && !selectedConnection) {
      const active = connections.find(c => c.is_active);
      if (active) {
        setSelectedConnection(active.id);
        fetchHosts(active.id);
      }
    }
  }, [connections, selectedConnection, fetchHosts]);

  const handleConnectionChange = (connId: string) => {
    setSelectedConnection(connId);
    setSelectedHost("");
    if (connId) fetchHosts(connId);
  };

  const handleHostChange = (hostId: string) => {
    setSelectedHost(hostId);
    if (hostId && selectedConnection) {
      fetchItems(selectedConnection, hostId);
    }
  };

  // Extracted data
  const status = data ? extractStatus(data) : null;
  const temps = data ? extractTemperatures(data) : null;
  const fans = data ? extractFans(data) : null;
  const power = data ? extractPower(data) : null;
  const disks = data ? extractDisks(data) : null;
  const raid = data ? extractRaid(data) : null;
  const nics = data ? extractNics(data) : null;
  const inventory = data ? extractInventory(data) : null;

  const selectedHostName = hosts.find(h => h.hostid === selectedHost)?.name ?? "";

  return (
    <div className="min-h-screen bg-background grid-pattern scanlines relative p-4 md:p-6 lg:p-8">
      {/* Ambient glow effect */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-neon-green/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-[400px] h-[400px] bg-neon-blue/3 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-[1600px] mx-auto relative z-10">
        {/* Header */}
        <DashboardHeader
          hostName={selectedHostName || "T440-MDP"}
          lastRefresh={lastRefresh}
          onRefresh={data ? refresh : undefined}
          isLoading={dataLoading}
        />

        {/* Connection / Host Selector */}
        <div className="glass-card rounded-xl p-4 mb-6 border border-border/30">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Wifi className="w-4 h-4 text-neon-cyan" />
              <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">Conexão Zabbix</span>
            </div>
            <select
              value={selectedConnection}
              onChange={(e) => handleConnectionChange(e.target.value)}
              className="bg-secondary/50 border border-border/50 rounded-md px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-neon-green/50 min-w-[200px]"
            >
              <option value="">Selecione...</option>
              {connections.filter(c => c.is_active).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            {selectedConnection && (
              <>
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-neon-green" />
                  <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">Host</span>
                </div>
                <select
                  value={selectedHost}
                  onChange={(e) => handleHostChange(e.target.value)}
                  disabled={hostsLoading}
                  className="bg-secondary/50 border border-border/50 rounded-md px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-neon-green/50 min-w-[250px] disabled:opacity-50"
                >
                  <option value="">{hostsLoading ? "Carregando hosts..." : "Selecione o host..."}</option>
                  {hosts.map((h) => (
                    <option key={h.hostid} value={h.hostid}>{h.name || h.host}</option>
                  ))}
                </select>
              </>
            )}

            {dataLoading && <Loader2 className="w-4 h-4 text-neon-green animate-spin" />}
            {data && !dataLoading && (
              <button onClick={refresh} className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-neon-green transition-colors">
                <RefreshCw className="w-3 h-3" />
                Atualizar
              </button>
            )}
          </div>
          {error && (
            <p className="text-xs text-neon-red mt-2 font-mono">{error}</p>
          )}
        </div>

        {/* No data state */}
        {!data && !dataLoading && (
          <div className="glass-card rounded-xl p-16 text-center">
            <Server className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground font-mono">
              Selecione uma conexão Zabbix e um host para carregar o dashboard
            </p>
          </div>
        )}

        {dataLoading && !data && (
          <div className="glass-card rounded-xl p-16 text-center">
            <Loader2 className="w-8 h-8 text-neon-green animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground font-mono">Carregando dados do Zabbix...</p>
          </div>
        )}

        {/* Dashboard content */}
        {data && status && (
          <>
            {/* TOPO — Status Rápido */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatusCard title="Status Geral" rawValue={status.overallStatus} icon={<Server className="w-4 h-4 text-muted-foreground" />} delay={0.1} />
              <StatusCard title="Rollup" rawValue={status.rollupStatus} icon={<Activity className="w-4 h-4 text-muted-foreground" />} delay={0.15} />
              <StatusCard title="Storage" rawValue={status.storageStatus} icon={<Database className="w-4 h-4 text-muted-foreground" />} delay={0.2} />
              <StatusCard title="Energia" rawValue={status.powerState} icon={<Power className="w-4 h-4 text-muted-foreground" />} delay={0.25} />
            </div>

            {/* MEIO — Temperatura + Ventilação + Energia */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              <div className="lg:col-span-1">
                {temps && <TemperatureSection temperatures={temps} />}
              </div>
              <div className="lg:col-span-1">
                {fans && <FanSection fans={fans} />}
              </div>
              <div className="lg:col-span-1">
                {power && <PowerSection powerSupplies={power.supplies} minIdlePower={power.minIdlePower} />}
              </div>
            </div>

            {/* BASE — Armazenamento */}
            {disks && raid && (
              <div className="mb-6">
                <StorageSection disks={disks} raidController={raid.controller} volumes={raid.volumes} />
              </div>
            )}

            {/* Rede */}
            {nics && (
              <div className="mb-6">
                <NetworkSection nics={nics} />
              </div>
            )}

            {/* Inventário */}
            {inventory && (
              <div className="mb-6">
                <InventorySection inventory={inventory} />
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div className="text-center py-4">
          <p className="text-[10px] font-mono text-muted-foreground/50">
            FLOWPULSE | iDRAC — {selectedHostName || "T440-MDP"} • Datasource: Zabbix • Refresh: 2min
          </p>
        </div>
      </div>
    </div>
  );
};

export default Index;
