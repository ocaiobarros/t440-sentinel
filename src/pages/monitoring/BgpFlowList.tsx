import { Globe } from "lucide-react";
import ModuleDashboardList from "@/pages/ModuleDashboardList";

export default function BgpFlowList() {
  return (
    <ModuleDashboardList
      category="bgp"
      title="BGP Flow"
      description="Painéis de monitoramento BGP e ASN"
      icon={<Globe className="w-6 h-6 text-neon-green" />}
      createPath="/app/monitoring/bgp/new"
      viewBasePath="/app/monitoring/bgp"
    />
  );
}
