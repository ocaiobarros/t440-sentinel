import { Box } from "lucide-react";
import ModuleDashboardList from "@/pages/ModuleDashboardList";

export default function VirtualizationList() {
  return (
    <ModuleDashboardList
      category="virtualization"
      title="Virtualização"
      description="Painéis de monitoramento de virtualização"
      icon={<Box className="w-6 h-6 text-neon-green" />}
    />
  );
}
