import { TrendingUp, Shield, Activity } from "lucide-react";
import ReservationFunnelPanel from "@/components/admin/ReservationFunnelPanel";
import AuditLogPanel from "@/components/admin/AuditLogPanel";
import LatencyMonitorWidget from "@/components/admin/LatencyMonitorWidget";
import AdminBreadcrumb from "./AdminBreadcrumb";

export default function AdminOpsPage() {
  return (
    <div className="space-y-6">
      <AdminBreadcrumb items={[{ label: "Intelligence Ops" }]} />
      <h2 className="text-xl font-bold text-foreground font-[Orbitron] tracking-wide">Intelligence Ops</h2>

      <LatencyMonitorWidget />

      <section className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6 space-y-4">
        <div className="flex items-center gap-3"><TrendingUp className="w-5 h-5 text-primary" /><h3 className="text-base font-bold font-[Orbitron] tracking-wide text-foreground">FUNIL DE VENDAS & ATIVAÇÃO</h3></div>
        <ReservationFunnelPanel />
      </section>

      <section className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6 space-y-4">
        <div className="flex items-center gap-3"><Shield className="w-5 h-5 text-primary" /><h3 className="text-base font-bold font-[Orbitron] tracking-wide text-foreground">TRILHA DE AUDITORIA</h3></div>
        <AuditLogPanel />
      </section>
    </div>
  );
}
