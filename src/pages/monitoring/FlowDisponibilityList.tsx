import { Activity } from "lucide-react";
import ModuleDashboardList from "@/pages/ModuleDashboardList";

export default function FlowDisponibilityList() {
  return (
    <ModuleDashboardList
      category="flowdisp"
      title="FlowDisponibility"
      description="Disponibilidade de rede em tempo real via ICMP Ping Zabbix"
      icon={<Activity className="w-6 h-6 text-neon-green" />}
      createPath="/app/monitoring/flowdisp/new"
      viewBasePath="/app/monitoring/flowdisp"
    />
  );
}
