import BackendHealthPanel from "@/components/admin/BackendHealthPanel";
import MigrationChecklistPanel from "@/components/admin/MigrationChecklistPanel";

export default function PlatformHealthPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground font-[Orbitron] tracking-wide">System Health</h2>
        <p className="text-sm text-muted-foreground mt-1">Health checks globais do backend e checklist de migração.</p>
      </div>
      <BackendHealthPanel />
      <MigrationChecklistPanel />
    </div>
  );
}
