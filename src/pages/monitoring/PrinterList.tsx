import { Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import ModuleDashboardList from "@/pages/ModuleDashboardList";

export default function PrinterList() {
  const { t } = useTranslation();
  return (
    <ModuleDashboardList
      category="printer"
      title={t("sidebar.printers")}
      description="Monitoramento inteligente de impressoras por template"
      icon={<Printer className="w-6 h-6 text-neon-cyan" />}
      createPath="/app/monitoring/printers/new"
      viewBasePath="/app/monitoring/printers"
    />
  );
}
