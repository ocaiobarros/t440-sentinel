import { Fuel } from "lucide-react";
import { useTranslation } from "react-i18next";
import ModuleDashboardList from "@/pages/ModuleDashboardList";

export default function FleetIntelligenceList() {
  const { t } = useTranslation();
  return (
    <ModuleDashboardList
      category="fleet"
      title={t("sidebar.fleetIntelligence")}
      description={t("dashboards.subtitle")}
      icon={<Fuel className="w-6 h-6 text-neon-green" />}
      createPath="/app/monitoring/fleet/new"
      viewBasePath="/app/monitoring/fleet"
    />
  );
}
