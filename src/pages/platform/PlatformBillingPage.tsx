import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CreditCard, Users, Layers, LayoutDashboard, Cable, Crown, Rocket, Building2, Loader2,
} from "lucide-react";

const PLAN_INFO: Record<string, { label: string; icon: typeof Rocket; color: string }> = {
  starter: { label: "Starter", icon: Building2, color: "text-muted-foreground bg-muted/50 border-border" },
  growth: { label: "Growth", icon: Rocket, color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
  enterprise: { label: "Enterprise", icon: Crown, color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
};

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  max_users: number;
  max_teams: number;
  max_dashboards: number;
  max_integrations: number;
}

export default function PlatformBillingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["platform-billing-tenants"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("tenant-admin", {
        body: { action: "list" },
      });
      if (error || data?.error) {
        const { data: fallback } = await supabase.from("tenants")
          .select("id, name, slug, plan, max_users, max_teams, max_dashboards, max_integrations")
          .order("name");
        return (fallback ?? []) as TenantRow[];
      }
      return (data?.tenants ?? []) as TenantRow[];
    },
  });

  const selected = tenants.find((t) => t.id === selectedId) ?? tenants[0] ?? null;
  const activeTenantId = selected?.id ?? null;

  const { data: usageCounts } = useQuery({
    queryKey: ["platform-billing-usage", activeTenantId],
    queryFn: async () => {
      if (!activeTenantId) return { users: 0, teams: 0, dashboards: 0, integrations: 0 };
      const { data } = await supabase.functions.invoke("tenant-admin", { body: { action: "members" } });
      const roles = (data?.roles ?? []) as { tenant_id: string }[];
      const users = roles.filter((r) => r.tenant_id === activeTenantId).length;
      return { users, teams: 0, dashboards: 0, integrations: 0 };
    },
    enabled: !!activeTenantId,
  });

  const upgradeMutation = useMutation({
    mutationFn: async (newPlan: string) => {
      const { data, error } = await supabase.functions.invoke("tenant-admin", {
        body: { action: "update_plan", tenant_id: activeTenantId, plan: newPlan },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast({ title: "Plano atualizado" });
      queryClient.invalidateQueries({ queryKey: ["platform-billing-tenants"] });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Erro", description: err?.message });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
      </div>
    );
  }

  const currentPlan = selected?.plan ?? "starter";
  const planInfo = PLAN_INFO[currentPlan] ?? PLAN_INFO.starter;
  const PlanIcon = planInfo.icon;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground font-[Orbitron] tracking-wide">Billing & Planos</h2>
          <p className="text-sm text-muted-foreground mt-1">Gerencie planos e limites de todas as organizações.</p>
        </div>
      </div>

      {/* Tenant selector */}
      <div className="flex flex-wrap gap-2">
        {tenants.map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant={t.id === (selected?.id) ? "default" : "outline"}
            onClick={() => setSelectedId(t.id)}
            className="text-xs"
          >
            {t.name}
            <Badge variant="secondary" className="ml-2 text-[10px]">{t.plan}</Badge>
          </Button>
        ))}
      </div>

      {selected && (
        <>
          <div className={`rounded-xl border-2 ${planInfo.color} p-6 flex items-center justify-between`}>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-background/50 border border-border flex items-center justify-center">
                <PlanIcon className="w-7 h-7" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono">{selected.name}</p>
                <h3 className="text-2xl font-bold font-[Orbitron] tracking-wide">{planInfo.label}</h3>
              </div>
            </div>
            <Select value={currentPlan} onValueChange={(v) => upgradeMutation.mutate(v)}>
              <SelectTrigger className="w-40 bg-background/80 border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="growth">Growth</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Usuários", icon: Users, current: usageCounts?.users ?? 0, max: selected.max_users },
              { label: "Times", icon: Layers, current: usageCounts?.teams ?? 0, max: selected.max_teams },
              { label: "Dashboards", icon: LayoutDashboard, current: usageCounts?.dashboards ?? 0, max: selected.max_dashboards },
              { label: "Integrações", icon: Cable, current: usageCounts?.integrations ?? 0, max: selected.max_integrations },
            ].map((item) => {
              const pct = item.max > 0 ? Math.round((item.current / item.max) * 100) : 0;
              return (
                <div key={item.label} className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <item.icon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">{item.label}</span>
                    {pct >= 100 && <Badge variant="destructive" className="text-[10px]">LIMITE</Badge>}
                  </div>
                  <div className="flex items-end justify-between">
                    <span className="text-3xl font-bold font-mono text-foreground">{item.current}</span>
                    <span className="text-sm text-muted-foreground font-mono">/ {item.max}</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary"}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
