import { Activity, Radio } from "lucide-react";
import TelemetryWizard from "@/components/admin/TelemetryWizard";
import TelemetryHealthPanel from "@/components/admin/TelemetryHealthPanel";
import AdminBreadcrumb from "./AdminBreadcrumb";

export default function AdminTelemetryPage() {
  return (
    <div className="space-y-6">
      <AdminBreadcrumb items={[{ label: "Telemetria" }]} />
      <h2 className="text-xl font-bold text-foreground font-[Orbitron] tracking-wide">Telemetria</h2>

      <section className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6 space-y-4">
        <div className="flex items-center gap-3"><Activity className="w-5 h-5 text-primary" /><h3 className="text-base font-bold font-[Orbitron] tracking-wide text-foreground">STATUS DO PIPELINE</h3></div>
        <TelemetryHealthPanel />
      </section>

      <section className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6 space-y-4">
        <div className="flex items-center gap-3"><Radio className="w-5 h-5 text-primary" /><h3 className="text-base font-bold font-[Orbitron] tracking-wide text-foreground">CONFIGURAÇÃO DE TELEMETRIA</h3></div>
        <p className="text-sm text-muted-foreground">Configure o pipeline de alertas: Zabbix Webhook → FlowPulse → Telegram.</p>
        <TelemetryWizard />
      </section>
    </div>
  );
}
