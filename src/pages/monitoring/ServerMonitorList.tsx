import { Server } from "lucide-react";
import ModuleDashboardList from "@/pages/ModuleDashboardList";

export default function ServerMonitorList() {
  return (
    <ModuleDashboardList
      category="server"
      title="Server Monitor"
      description="Painéis de monitoramento de servidores"
      icon={<Server className="w-6 h-6 text-neon-green" />}
    />
  );
}
