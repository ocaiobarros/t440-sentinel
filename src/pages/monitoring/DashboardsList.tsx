import { LayoutDashboard } from "lucide-react";
import { useTranslation } from "react-i18next";
import ModuleDashboardList from "@/pages/ModuleDashboardList";

export default function DashboardsList() {
  const { t } = useTranslation();
  return (
    <ModuleDashboardList
      category="dashboard"
      title={t("sidebar.dashboards")}
      description={t("dashboards.subtitle")}
      icon={<LayoutDashboard className="w-6 h-6 text-neon-green" />}
    />
  );
}
