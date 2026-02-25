import { Server } from "lucide-react";
import { useTranslation } from "react-i18next";
import ModuleDashboardList from "@/pages/ModuleDashboardList";

export default function ServerMonitorList() {
  const { t } = useTranslation();
  return (
    <ModuleDashboardList
      category="server"
      title={t("sidebar.serverMonitor")}
      description={t("dashboards.subtitle")}
      icon={<Server className="w-6 h-6 text-neon-green" />}
      createPath="/app/monitoring/server/new"
      viewBasePath="/app/monitoring/server"
    />
  );
}
