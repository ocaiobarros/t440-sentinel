import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Users, LayoutDashboard, Map, Cable, Activity } from "lucide-react";

export default function PlatformMetricsPage() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ["platform-global-metrics"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("tenant-admin", { body: { action: "list" } });
      const tenants = (data?.tenants ?? []) as any[];

      const { data: membersData } = await supabase.functions.invoke("tenant-admin", { body: { action: "members" } });
      const roles = (membersData?.roles ?? []) as { tenant_id: string; user_id: string }[];
      const uniqueUsers = new Set(roles.map((r) => r.user_id));

      return {
        totalTenants: tenants.length,
        totalUsers: uniqueUsers.size,
        totalRoles: roles.length,
        planDistribution: {
          starter: tenants.filter((t) => t.plan === "starter").length,
          growth: tenants.filter((t) => t.plan === "growth").length,
          enterprise: tenants.filter((t) => t.plan === "enterprise").length,
        },
        tenantSizes: tenants.map((t) => ({
          name: t.name,
          members: roles.filter((r) => r.tenant_id === t.id).length,
          plan: t.plan,
        })).sort((a, b) => b.members - a.members),
      };
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const cards = [
    { label: "Organizações", value: metrics?.totalTenants ?? 0, icon: Building2 },
    { label: "Usuários Únicos", value: metrics?.totalUsers ?? 0, icon: Users },
    { label: "Vínculos (Roles)", value: metrics?.totalRoles ?? 0, icon: Activity },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground font-[Orbitron] tracking-wide">Global Metrics</h2>
        <p className="text-sm text-muted-foreground mt-1">Visão geral do uso da plataforma.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6 space-y-2">
            <div className="flex items-center gap-2">
              <card.icon className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{card.label}</span>
            </div>
            <p className="text-3xl font-bold font-mono text-foreground">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Plan distribution */}
      <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6 space-y-4">
        <h3 className="text-base font-bold font-[Orbitron] tracking-wide text-foreground">Distribuição por Plano</h3>
        <div className="flex gap-4">
          {Object.entries(metrics?.planDistribution ?? {}).map(([plan, count]) => (
            <div key={plan} className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-mono capitalize">{plan}</Badge>
              <span className="text-lg font-bold text-foreground">{count as number}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top tenants by size */}
      <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6 space-y-4">
        <h3 className="text-base font-bold font-[Orbitron] tracking-wide text-foreground">Ranking por Membros</h3>
        <div className="space-y-2">
          {(metrics?.tenantSizes ?? []).map((t, i) => (
            <div key={t.name} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-muted-foreground w-6">{i + 1}.</span>
                <span className="text-sm font-medium text-foreground">{t.name}</span>
                <Badge variant="secondary" className="text-[10px]">{t.plan}</Badge>
              </div>
              <span className="text-sm font-mono text-foreground">{t.members} usuários</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
