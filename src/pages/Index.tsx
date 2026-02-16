import { Activity, Server, Database, Power } from 'lucide-react';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import StatusCard from '@/components/dashboard/StatusCard';
import TemperatureSection from '@/components/dashboard/TemperatureSection';
import FanSection from '@/components/dashboard/FanSection';
import PowerSection from '@/components/dashboard/PowerSection';
import StorageSection from '@/components/dashboard/StorageSection';
import NetworkSection from '@/components/dashboard/NetworkSection';
import InventorySection from '@/components/dashboard/InventorySection';
import { serverStatus } from '@/data/serverData';

const Index = () => {
  return (
    <div className="min-h-screen bg-background grid-pattern scanlines relative p-4 md:p-6 lg:p-8">
      {/* Ambient glow effect */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-neon-green/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-[400px] h-[400px] bg-neon-blue/3 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-[1600px] mx-auto relative z-10">
        {/* Header */}
        <DashboardHeader />

        {/* TOPO — Status Rápido */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatusCard
            title="Status Geral"
            rawValue={serverStatus.overallStatus}
            icon={<Server className="w-4 h-4 text-muted-foreground" />}
            delay={0.1}
          />
          <StatusCard
            title="Rollup"
            rawValue={serverStatus.rollupStatus}
            icon={<Activity className="w-4 h-4 text-muted-foreground" />}
            delay={0.15}
          />
          <StatusCard
            title="Storage"
            rawValue={serverStatus.storageStatus}
            icon={<Database className="w-4 h-4 text-muted-foreground" />}
            delay={0.2}
          />
          <StatusCard
            title="Energia"
            rawValue={serverStatus.powerState}
            icon={<Power className="w-4 h-4 text-muted-foreground" />}
            delay={0.25}
          />
        </div>

        {/* MEIO — Temperatura + Ventilação + Energia */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div className="lg:col-span-1">
            <TemperatureSection />
          </div>
          <div className="lg:col-span-1">
            <FanSection />
          </div>
          <div className="lg:col-span-1">
            <PowerSection />
          </div>
        </div>

        {/* BASE — Armazenamento */}
        <div className="mb-6">
          <StorageSection />
        </div>

        {/* Rede */}
        <div className="mb-6">
          <NetworkSection />
        </div>

        {/* Inventário */}
        <div className="mb-6">
          <InventorySection />
        </div>

        {/* Footer */}
        <div className="text-center py-4">
          <p className="text-[10px] font-mono text-muted-foreground/50">
            FLOWPULSE | iDRAC — T440-MDP • Datasource: Zabbix-MDP • Refresh: 4min
          </p>
        </div>
      </div>
    </div>
  );
};

export default Index;
