import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import ModuleDashboardList from "@/pages/ModuleDashboardList";

export default function BgpFlowList() {
  const { t } = useTranslation();
  return (
    <ModuleDashboardList
      category="bgp"
      title={t("sidebar.bgpFlow")}
      description={t("bgpDashboard.bgpPeersOverview")}
      icon={<Globe className="w-6 h-6 text-neon-green" />}
      createPath="/app/monitoring/bgp/new"
      viewBasePath="/app/monitoring/bgp"
    />
  );
}
