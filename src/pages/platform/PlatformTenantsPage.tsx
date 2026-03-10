import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  createTenant,
  updateTenant,
  deleteTenant,
} from "@/services/admin/tenantService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Building2, Loader2, Trash2, Plus, Pencil, Users, LayoutDashboard, Cable, Crown, Rocket,
} from "lucide-react";

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  max_users: number;
  max_teams: number;
  max_dashboards: number;
  max_integrations: number;
  created_at: string;
}

const PLAN_ICONS: Record<string, typeof Crown> = {
  enterprise: Crown,
  growth: Rocket,
  starter: Building2,
};

export default function PlatformTenantsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [newOrgForm, setNewOrgForm] = useState({ name: "", slug: "" });
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["platform-tenants"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("tenant-admin", {
        body: { action: "list" },
      });
      if (error || data?.error) {
        // Fallback to direct query
        const { data: fallback } = await supabase
          .from("tenants")
          .select("id, name, slug, plan, max_users, max_teams, max_dashboards, max_integrations, created_at")
          .order("created_at", { ascending: true });
        return (fallback ?? []) as TenantRow[];
      }
      return (data?.tenants ?? []) as TenantRow[];
    },
  });

  const { data: memberCounts = {} } = useQuery({
    queryKey: ["platform-tenant-member-counts"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("tenant-admin", {
        body: { action: "members" },
      });
      const roles = (data?.roles ?? []) as { tenant_id: string; user_id: string }[];
      const counts: Record<string, number> = {};
      roles.forEach((r) => {
        counts[r.tenant_id] = (counts[r.tenant_id] ?? 0) + 1;
      });
      return counts;
    },
  });

  const handleCreateOrg = async () => {
    if (!newOrgForm.name.trim()) return;
    setCreatingOrg(true);
    try {
      await createTenant({ name: newOrgForm.name, slug: newOrgForm.slug });
      toast({ title: "Organização criada" });
      setCreateOrgOpen(false);
      setNewOrgForm({ name: "", slug: "" });
      queryClient.invalidateQueries({ queryKey: ["platform-tenants"] });
      queryClient.invalidateQueries({ queryKey: ["platform-tenant-member-counts"] });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    } finally {
      setCreatingOrg(false);
    }
  };

  const handleDelete = async (tenantId: string) => {
    const count = memberCounts[tenantId] ?? 0;
    if (count > 0) {
      toast({ variant: "destructive", title: "Erro", description: "Não é possível excluir com membros vinculados." });
      return;
    }
    setDeletingId(tenantId);
    try {
      await deleteTenant(tenantId);
      toast({ title: "Organização excluída" });
      queryClient.invalidateQueries({ queryKey: ["platform-tenants"] });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground font-[Orbitron] tracking-wide">Tenants</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Todas as organizações da plataforma. Total: <strong>{tenants.length}</strong>
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOrgOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nova Organização
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {tenants.map((t) => {
            const PlanIcon = PLAN_ICONS[t.plan] ?? Building2;
            const members = memberCounts[t.id] ?? 0;

            return (
              <div key={t.id} className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground">{t.name}</h3>
                      <p className="text-xs text-muted-foreground font-mono">{t.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs font-mono gap-1">
                      <PlanIcon className="w-3 h-3" /> {t.plan}
                    </Badge>
                    {members === 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        disabled={deletingId === t.id}
                        onClick={() => handleDelete(t.id)}
                      >
                        {deletingId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Users className="w-3 h-3" /> {members}/{t.max_users}
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <LayoutDashboard className="w-3 h-3" /> {t.max_dashboards} dash
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Cable className="w-3 h-3" /> {t.max_integrations} integ
                  </div>
                  <div className="text-muted-foreground font-mono">
                    {new Date(t.created_at).toLocaleDateString("pt-BR")}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={createOrgOpen} onOpenChange={(o) => !creatingOrg && setCreateOrgOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Organização</DialogTitle>
            <DialogDescription>Crie um novo ecossistema isolado na plataforma.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Nome *</Label>
              <Input value={newOrgForm.name} onChange={(e) => setNewOrgForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nome da organização" className="bg-muted/50 border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Slug (opcional)</Label>
              <Input value={newOrgForm.slug} onChange={(e) => setNewOrgForm((f) => ({ ...f, slug: e.target.value }))} placeholder="nome-slug" className="bg-muted/50 border-border font-mono text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOrgOpen(false)} disabled={creatingOrg}>Cancelar</Button>
            <Button onClick={handleCreateOrg} disabled={creatingOrg || !newOrgForm.name.trim()}>
              {creatingOrg ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />} Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
