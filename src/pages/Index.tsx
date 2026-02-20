import { useState, useCallback, useEffect } from 'react';
import { Activity, Server, Database, Power, Loader2, Settings2, Wifi, Cpu as CpuIcon } from 'lucide-react';
import { parsePowerState, parseSnmpAvailability } from '@/data/serverData';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import StatusCard from '@/components/dashboard/StatusCard';
import TemperatureSection from '@/components/dashboard/TemperatureSection';
import FanSection from '@/components/dashboard/FanSection';
import PowerSection from '@/components/dashboard/PowerSection';
import StorageSection from '@/components/dashboard/StorageSection';
import NetworkSection from '@/components/dashboard/NetworkSection';
import InventorySection from '@/components/dashboard/InventorySection';
import CpuMemorySection from '@/components/dashboard/CpuMemorySection';
import FilesystemSection from '@/components/dashboard/FilesystemSection';
import IdracSetupWizard, { loadIdracConfig, clearIdracConfig, type IdracConfig } from '@/components/dashboard/IdracSetupWizard';
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
  extractCpu,
  extractLinuxMemory,
  extractFilesystems,
} from '@/hooks/useIdracLive';

const Index = () => {
  const [config, setConfig] = useState<IdracConfig | null>(loadIdracConfig);
  const [showSetup, setShowSetup] = useState(!config);
  const { data, dataLoading, lastRefresh, refresh, error, fetchItems } = useIdracLive();

  // Auto-fetch on mount when config exists from localStorage
  useEffect(() => {
    if (config && !data && !dataLoading) {
      fetchItems(config.connectionId, config.hostId);
    }
  }, [config, data, dataLoading, fetchItems]);

  const handleConfigComplete = useCallback((cfg: IdracConfig) => {
    setConfig(cfg);
    setShowSetup(false);
    fetchItems(cfg.connectionId, cfg.hostId);
  }, [fetchItems]);

  const handleReconfigure = () => {
    clearIdracConfig();
    setConfig(null);
    setShowSetup(true);
  };

  if (showSetup) {
    return <IdracSetupWizard onComplete={handleConfigComplete} existingConfig={config} />;
  }

  // Extracted data
  const status = data ? extractStatus(data) : null;
  const temps = data ? extractTemperatures(data) : null;
  const fans = data ? extractFans(data) : null;
  const power = data ? extractPower(data) : null;
  const disks = data ? extractDisks(data) : null;
  const raid = data ? extractRaid(data) : null;
  const nics = data ? extractNics(data) : null;
  const inventory = data ? extractInventory(data) : null;
  const cpu = data ? extractCpu(data) : null;
  const linuxMem = data ? extractLinuxMemory(data) : null;
  const filesystems = data ? extractFilesystems(data) : null;

  // Only show sections with real data (non-zero / non-empty values)
  const hasTemps = temps && (temps.cpu1.numValue > 0 || temps.cpu2.numValue > 0 || temps.inlet.numValue > 0);
  const hasFans = fans && fans.length > 0 && fans.some(f => f.speedNum > 0);
  const hasPower = power && power.supplies.length > 0 && power.supplies.some(p => p.status && p.status !== "0");
  const hasDisks = disks && disks.length > 0 && disks.some(d => d.size && d.size !== "0" && d.size !== "");
  const hasRaid = raid && (raid.controller.name || raid.volumes.length > 0);
  const hasNics = nics && nics.length > 0 && nics.some(n => n.connectionStatus || n.status || n.speed);
  const hasCpu = cpu && cpu.utilization;
  const hasLinuxMem = linuxMem && linuxMem.total;
  const hasFilesystems = filesystems && filesystems.length > 0;
  const isLinux = data?.hostType === "linux";

  // Filter out disks/nics with no real data
  const validDisks = disks?.filter(d => d.size && d.size !== "0" && d.size !== "") ?? [];
  const validNics = nics?.filter(n => n.connectionStatus || n.status || n.name) ?? [];

  return (
    <div className="min-h-screen bg-background grid-pattern scanlines relative p-4 md:p-6 lg:p-8">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-neon-green/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-[400px] h-[400px] bg-neon-blue/3 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-[1600px] mx-auto relative z-10">
        <DashboardHeader
          hostName={config?.hostName ?? "Server"}
          lastRefresh={lastRefresh}
          onRefresh={data ? refresh : undefined}
          isLoading={dataLoading}
        />

        <div className="flex justify-end mb-2 -mt-4">
          <button
            onClick={handleReconfigure}
            className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <Settings2 className="w-3 h-3" />
            Reconfigurar
          </button>
        </div>

        {dataLoading && !data && (
          <div className="glass-card rounded-xl p-16 text-center">
            <Loader2 className="w-8 h-8 text-neon-green animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground font-mono">Carregando dados do Zabbix...</p>
            <p className="text-[10px] text-muted-foreground/50 font-mono mt-1">Host: {config?.hostName}</p>
          </div>
        )}

        {error && !data && (
          <div className="glass-card rounded-xl p-8 text-center">
            <p className="text-sm text-neon-red font-mono mb-2">Erro ao carregar dados</p>
            <p className="text-[10px] text-muted-foreground font-mono">{error}</p>
            <button onClick={() => config && fetchItems(config.connectionId, config.hostId)} className="mt-3 text-[10px] text-neon-cyan hover:underline font-mono">
              Tentar novamente
            </button>
          </div>
        )}

        {data && status && (
          <>
            {/* Status Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatusCard title="Status Geral" rawValue={status.overallStatus || "—"} icon={<Server className="w-4 h-4 text-muted-foreground" />} delay={0.1} />
              {!isLinux && <StatusCard title="Rollup" rawValue={status.rollupStatus || "—"} icon={<Activity className="w-4 h-4 text-muted-foreground" />} delay={0.15} />}
              {!isLinux && <StatusCard title="Storage" rawValue={status.storageStatus || "—"} icon={<Database className="w-4 h-4 text-muted-foreground" />} delay={0.2} />}
              {!isLinux && <StatusCard title="Energia" rawValue={status.powerState || "—"} icon={<Power className="w-4 h-4 text-muted-foreground" />} delay={0.25} parser={parsePowerState} />}
              {isLinux && <StatusCard title="ICMP" rawValue={status.icmpPing || "—"} icon={<Wifi className="w-4 h-4 text-muted-foreground" />} delay={0.15} />}
              {isLinux && <StatusCard title="SNMP" rawValue={status.snmpAvailability || "—"} icon={<Activity className="w-4 h-4 text-muted-foreground" />} delay={0.2} parser={parseSnmpAvailability} />}
              {isLinux && hasCpu && <StatusCard title="CPU" rawValue={cpu!.utilization ? `${(parseFloat(cpu!.utilization) * 100).toFixed(1)}%` : "—"} icon={<CpuIcon className="w-4 h-4 text-muted-foreground" />} delay={0.25} />}
            </div>

            {/* CPU + Memory (Linux hosts) */}
            {(hasCpu || hasLinuxMem) && (
              <div className="mb-6">
                <CpuMemorySection cpu={hasCpu ? cpu : null} memory={hasLinuxMem ? linuxMem : null} />
              </div>
            )}

            {/* Temperature + Fans + Power (iDRAC hosts) */}
            {(hasTemps || hasFans || hasPower) && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                <div className="lg:col-span-1">
                  {hasTemps && temps && <TemperatureSection temperatures={temps} />}
                </div>
                <div className="lg:col-span-1">
                  {hasFans && fans && <FanSection fans={fans} />}
                </div>
                <div className="lg:col-span-1">
                  {hasPower && power && <PowerSection powerSupplies={power.supplies} minIdlePower={power.minIdlePower} />}
                </div>
              </div>
            )}

            {/* Filesystems (Linux hosts) */}
            {hasFilesystems && filesystems && (
              <div className="mb-6">
                <FilesystemSection filesystems={filesystems} />
              </div>
            )}

            {/* Storage (iDRAC hosts) */}
            {hasDisks && hasRaid && validDisks.length > 0 && raid && (
              <div className="mb-6">
                <StorageSection disks={validDisks} raidController={raid.controller} volumes={raid.volumes} />
              </div>
            )}

            {/* Network */}
            {hasNics && nics && (
              <div className="mb-6">
                <NetworkSection nics={nics} />
              </div>
            )}

            {/* Inventory */}
            {inventory && (
              <div className="mb-6">
                <InventorySection inventory={inventory} />
              </div>
            )}
          </>
        )}

        <div className="text-center py-4">
          <p className="text-[10px] font-mono text-muted-foreground/50">
            FLOWPULSE | {config?.hostName ?? "Server"} • Datasource: Zabbix • Refresh: 2min
          </p>
        </div>
      </div>
    </div>
  );
};

export default Index;
