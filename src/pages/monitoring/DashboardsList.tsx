import { LayoutDashboard } from "lucide-react";
import ModuleDashboardList from "@/pages/ModuleDashboardList";

export default function DashboardsList() {
  return (
    <ModuleDashboardList
      category="dashboard"
      title="Dashboards"
      description="Dashboards gerais de monitoramento"
      icon={<LayoutDashboard className="w-6 h-6 text-neon-green" />}
    />
  );
}
