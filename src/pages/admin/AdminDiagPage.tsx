import { useAdmin } from "./AdminContext";
import BackendHealthPanel from "@/components/admin/BackendHealthPanel";
import DiagnosticPanel from "@/components/admin/DiagnosticPanel";
import MigrationChecklistPanel from "@/components/admin/MigrationChecklistPanel";
import AdminBreadcrumb from "./AdminBreadcrumb";

export default function AdminDiagPage() {
  const { tenants, selectedTenantId } = useAdmin();

  return (
    <div className="space-y-6">
      <AdminBreadcrumb items={[{ label: "Diagnóstico" }]} />
      <h2 className="text-xl font-bold text-foreground font-[Orbitron] tracking-wide">Diagnóstico & Migração</h2>

      <BackendHealthPanel />
      <DiagnosticPanel tenants={tenants} selectedTenantId={selectedTenantId} />
      <MigrationChecklistPanel />
    </div>
  );
}
