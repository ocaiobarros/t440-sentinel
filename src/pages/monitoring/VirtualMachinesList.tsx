import { MonitorCheck } from "lucide-react";
import ModuleDashboardList from "@/pages/ModuleDashboardList";

export default function VirtualMachinesList() {
  return (
    <ModuleDashboardList
      category="virtual-machines"
      title="Máquinas Virtuais"
      description="Painéis de monitoramento de VMs"
      icon={<MonitorCheck className="w-6 h-6 text-neon-green" />}
      createPath="/app/monitoring/virtual-machines/new"
      viewBasePath="/app/monitoring/virtual-machines"
    />
  );
}
