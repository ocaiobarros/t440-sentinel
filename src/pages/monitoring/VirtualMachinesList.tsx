import { MonitorCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import ModuleDashboardList from "@/pages/ModuleDashboardList";

export default function VirtualMachinesList() {
  const { t } = useTranslation();
  return (
    <ModuleDashboardList
      category="virtual-machines"
      title={t("sidebar.virtualMachines")}
      description={t("dashboards.subtitle")}
      icon={<MonitorCheck className="w-6 h-6 text-neon-green" />}
      createPath="/app/monitoring/virtual-machines/new"
      viewBasePath="/app/monitoring/virtual-machines"
    />
  );
}
