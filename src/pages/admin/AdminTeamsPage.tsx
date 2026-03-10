import { useAdmin, type Profile } from "./AdminContext";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import TeamsPanel from "@/components/admin/TeamsPanel";
import AdminBreadcrumb from "./AdminBreadcrumb";

export default function AdminTeamsPage() {
  const { roles, selectedTenantId, setSelectedTenantId, tenants, profileById } = useAdmin();
  const { activeTenantId } = useTenantFilter();

  // Use AdminContext's selectedTenantId, fallback to global tenant filter, then first tenant
  const effectiveTenantId = selectedTenantId ?? activeTenantId ?? tenants[0]?.id ?? null;

  // Sync back to AdminContext if it was null
  if (!selectedTenantId && effectiveTenantId) {
    setSelectedTenantId(effectiveTenantId);
  }

  const tenantRoles = effectiveTenantId ? roles.filter((r) => r.tenant_id === effectiveTenantId) : [];
  const members = Array.from(new Map(tenantRoles.map((r) => [r.user_id, r])).values()).map((mr) => {
    const p = profileById.get(mr.user_id);
    return { id: mr.user_id, display_name: p?.display_name ?? null, email: p?.email ?? null };
  });

  return (
    <div className="space-y-6">
      <AdminBreadcrumb items={[
        { label: "Usuários e Acesso", path: "/app/settings/admin/access" },
        { label: "Times" },
      ]} />
      <div>
        <h2 className="text-xl font-bold text-foreground font-[Orbitron] tracking-wide">Times</h2>
        <p className="text-sm text-muted-foreground mt-1">Agrupamentos internos para permissões granulares.</p>
      </div>
      <TeamsPanel tenantId={effectiveTenantId} profiles={members} />
    </div>
  );
}
