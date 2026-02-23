import { Fuel } from "lucide-react";
import ModuleDashboardList from "@/pages/ModuleDashboardList";

export default function FleetIntelligenceList() {
  return (
    <ModuleDashboardList
      category="fleet"
      title="Fleet Intelligence"
      description="Painéis de inteligência de frota e geradores"
      icon={<Fuel className="w-6 h-6 text-neon-green" />}
      createPath="/app/monitoring/fleet/new"
      viewBasePath="/app/monitoring/fleet"
    />
  );
}
