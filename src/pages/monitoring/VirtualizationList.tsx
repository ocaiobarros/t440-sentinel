import { Box } from "lucide-react";
import { useTranslation } from "react-i18next";
import ModuleDashboardList from "@/pages/ModuleDashboardList";

export default function VirtualizationList() {
  const { t } = useTranslation();
  return (
    <ModuleDashboardList
      category="virtualization"
      title={t("sidebar.virtualization")}
      description={t("virtualization.subtitle")}
      icon={<Box className="w-6 h-6 text-neon-green" />}
      createPath="/app/monitoring/virtualization/new"
      viewBasePath="/app/monitoring/virtualization"
    />
  );
}
