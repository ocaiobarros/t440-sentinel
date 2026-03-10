import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "./AdminContext";
import AdminBreadcrumb from "./AdminBreadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CreditCard,
  Users,
  Layers,
  LayoutDashboard,
  Cable,
  Crown,
  Rocket,
  Building2,
  ArrowUpRight,
} from "lucide-react";

const PLAN_INFO: Record<string, { label: string; icon: typeof Rocket; color: string; limits: { max_users: number; max_teams: number; max_dashboards: number; max_integrations: number } }> = {
  starter: {
    label: "Starter",
    icon: Building2,
    color: "text-muted-foreground bg-muted/50 border-border",
    limits: { max_users: 10, max_teams: 5, max_dashboards: 20, max_integrations: 3 },
  },
  growth: {
    label: "Growth",
    icon: Rocket,
    color: "text-blue-400 bg-blue-500/10 border-blue-500/30",
    limits: { max_users: 50, max_teams: 20, max_dashboards: 100, max_integrations: 10 },
  },
  enterprise: {
    label: "Enterprise",
    icon: Crown,
    color: "text-amber-400 bg-amber-500/10 border-amber-500/30",
    limits: { max_users: 500, max_teams: 100, max_dashboards: 1000, max_integrations: 50 },
  },
};

interface TenantWithPlan {
  id: string;
  name: string;
  plan: string;
  max_users: number;
  max_teams: number;
  max_dashboards: number;
  max_integrations: number;
}

export default function AdminBillingPage() {
  const { tenants, selectedTenantId, isSuperAdmin, roles } = useAdmin();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tenantDetails, isLoading } = useQuery({
    queryKey: ["tenant-plan", selectedTenantId],
    queryFn: async () => {
      if (!selectedTenantId) return null;
      // For super admins, use the list from tenant-admin which includes plan info
      const { data, error } = await supabase.functions.invoke("tenant-admin", {
        body: { action: "list" },
      });
      if (error || data?.error) return null;
      const t = (data?.tenants ?? []).find((t: any) => t.id === selectedTenantId);
      return t as TenantWithPlan | null;
    },
    enabled: !!selectedTenantId,
  });

  const { data: usageCounts } = useQuery({
    queryKey: ["tenant-usage", selectedTenantId],
    queryFn: async () => {
      if (!selectedTenantId) return { users: 0, teams: 0, dashboards: 0, integrations: 0 };
      const [usersRes, teamsRes, dashRes, intRes] = await Promise.all([
        supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("tenant_id", selectedTenantId),
        supabase.from("teams").select("id", { count: "exact", head: true }).eq("tenant_id", selectedTenantId),
        supabase.from("dashboards").select("id", { count: "exact", head: true }).eq("tenant_id", selectedTenantId),
        supabase.from("zabbix_connections").select("id", { count: "exact", head: true }).eq("tenant_id", selectedTenantId),
      ]);
      return {
        users: usersRes.count ?? 0,
        teams: teamsRes.count ?? 0,
        dashboards: dashRes.count ?? 0,
        integrations: intRes.count ?? 0,
      };
    },
    enabled: !!selectedTenantId,
  });

  const upgradeMutation = useMutation({
    mutationFn: async (newPlan: string) => {
      const { data, error } = await supabase.functions.invoke("tenant-admin", {
        body: { action: "update_plan", tenant_id: selectedTenantId, plan: newPlan },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, newPlan) => {
      toast({ title: "Plano atualizado", description: `Plano alterado para ${PLAN_INFO[newPlan]?.label ?? newPlan}.` });
      queryClient.invalidateQueries({ queryKey: ["tenant-plan"] });
      queryClient.invalidateQueries({ queryKey: ["tenant-usage"] });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Erro", description: err?.message || "Falha ao atualizar plano." });
    },
  });

  const currentPlan = tenantDetails?.plan ?? "starter";
  const planInfo = PLAN_INFO[currentPlan] ?? PLAN_INFO.starter;
  const PlanIcon = planInfo.icon;

  const limits = [
    { label: "Usuários", icon: Users, current: usageCounts?.users ?? 0, max: tenantDetails?.max_users ?? 10 },
    { label: "Times", icon: Layers, current: usageCounts?.teams ?? 0, max: tenantDetails?.max_teams ?? 5 },
    { label: "Dashboards", icon: LayoutDashboard, current: usageCounts?.dashboards ?? 0, max: tenantDetails?.max_dashboards ?? 20 },
    { label: "Integrações", icon: Cable, current: usageCounts?.integrations ?? 0, max: tenantDetails?.max_integrations ?? 3 },
  ];

  const selectedTenantName = tenants.find(t => t.id === selectedTenantId)?.name ?? "—";

  return (
    <div className="space-y-6">
      <AdminBreadcrumb items={[{ label: "Billing & Planos" }]} />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground font-[Orbitron] tracking-wide">Billing & Planos</h2>
          <p className="text-sm text-muted-foreground mt-1">Gerencie o plano e limites da organização <span className="font-medium text-foreground">{selectedTenantName}</span>.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : (
        <>
          {/* Current Plan Card */}
          <div className={`rounded-xl border-2 ${planInfo.color} p-6 flex items-center justify-between`}>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-background/50 border border-border flex items-center justify-center">
                <PlanIcon className="w-7 h-7" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono">Plano Atual</p>
                <h3 className="text-2xl font-bold font-[Orbitron] tracking-wide">{planInfo.label}</h3>
              </div>
            </div>
            {isSuperAdmin && (
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
            )}
          </div>

          {/* Usage / Limits Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {limits.map((item) => {
              const pct = item.max > 0 ? Math.round((item.current / item.max) * 100) : 0;
              const isHigh = pct >= 80;
              const isFull = pct >= 100;

              return (
                <div key={item.label} className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <item.icon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">{item.label}</span>
                    </div>
                    {isFull && <Badge variant="destructive" className="text-[10px]">LIMITE</Badge>}
                    {isHigh && !isFull && <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30">ALTO</Badge>}
                  </div>
                  <div className="flex items-end justify-between">
                    <span className="text-3xl font-bold font-mono text-foreground">{item.current}</span>
                    <span className="text-sm text-muted-foreground font-mono">/ {item.max}</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isFull ? "bg-destructive" : isHigh ? "bg-amber-500" : "bg-primary"}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Plan Comparison */}
          <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6 space-y-4">
            <h3 className="text-base font-bold font-[Orbitron] tracking-wide text-foreground">Comparação de Planos</h3>
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div className="text-muted-foreground font-medium">Recurso</div>
              {Object.entries(PLAN_INFO).map(([key, info]) => (
                <div key={key} className={`font-bold ${key === currentPlan ? "text-primary" : "text-foreground"}`}>
                  {info.label} {key === currentPlan && "✓"}
                </div>
              ))}
              {(["max_users", "max_teams", "max_dashboards", "max_integrations"] as const).map((field) => {
                const labels: Record<string, string> = {
                  max_users: "Usuários",
                  max_teams: "Times",
                  max_dashboards: "Dashboards",
                  max_integrations: "Integrações",
                };
                return (
                  <>
                    <div key={field} className="text-muted-foreground">{labels[field]}</div>
                    {Object.entries(PLAN_INFO).map(([key, info]) => (
                      <div key={`${field}-${key}`} className={`font-mono ${key === currentPlan ? "text-primary font-bold" : "text-foreground"}`}>
                        {info.limits[field]}
                      </div>
                    ))}
                  </>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
