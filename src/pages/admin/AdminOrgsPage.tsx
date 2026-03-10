import { useState, useEffect } from "react";
import { useAdmin, getFunctionErrorMessage, type Profile } from "./AdminContext";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Building2, Loader2, Trash2, Plus, Pencil, Save, EyeOff,
} from "lucide-react";
import AdminBreadcrumb from "./AdminBreadcrumb";

export default function AdminOrgsPage() {
  const { toast } = useToast();
  const { profiles, roles, tenants, selectedTenantId, setSelectedTenantId, isSuperAdmin, fetchData, profileById, getRoleForUser, getRoleBadgeVariant } = useAdmin();
  const { refreshSession } = useTenantFilter();

  const [editingTeam, setEditingTeam] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamSlug, setTeamSlug] = useState("");
  const [savingTeam, setSavingTeam] = useState(false);
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [newOrgForm, setNewOrgForm] = useState({ name: "", slug: "" });
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [deletingTenantId, setDeletingTenantId] = useState<string | null>(null);

  // Invite user into this org
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", display_name: "", role: "viewer", password: "" });
  const [inviting, setInviting] = useState(false);

  const tenant = tenants.find((t) => t.id === selectedTenantId);

  useEffect(() => {
    if (tenant) { setTeamName(tenant.name); setTeamSlug(tenant.slug); }
  }, [selectedTenantId, tenant?.name, tenant?.slug]);

  const selectedTenantRoles = selectedTenantId ? roles.filter((r) => r.tenant_id === selectedTenantId) : [];
  const selectedTenantProfiles = Array.from(new Map(selectedTenantRoles.map((r) => [r.user_id, r])).values()).map((mr) => {
    const p = profileById.get(mr.user_id);
    return {
      id: mr.user_id, display_name: p?.display_name ?? null, email: p?.email ?? null,
      avatar_url: p?.avatar_url ?? null, tenant_id: selectedTenantId ?? mr.tenant_id,
      created_at: p?.created_at ?? mr.created_at ?? new Date().toISOString(),
    } satisfies Profile;
  });

  const handleSaveTeam = async () => {
    if (!tenant || !teamName.trim()) return;
    setSavingTeam(true);
    try {
      const slug = teamSlug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
      if (!slug) { toast({ variant: "destructive", title: "Slug inválido" }); setSavingTeam(false); return; }
      const { data, error } = await supabase.functions.invoke("tenant-admin", {
        body: { action: "update_tenant", tenant_id: tenant.id, name: teamName.trim(), slug },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Organização atualizada" });
      setEditingTeam(false);
      await fetchData();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    } finally { setSavingTeam(false); }
  };

  const handleCreateOrg = async () => {
    if (!newOrgForm.name.trim()) return;
    setCreatingOrg(true);
    try {
      const { data, error } = await supabase.functions.invoke("tenant-admin", {
        body: { action: "create", name: newOrgForm.name.trim(), slug: newOrgForm.slug.trim() || newOrgForm.name.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Organização criada", description: `"${data?.tenant?.name}" criada.` });
      setSelectedTenantId(data?.tenant?.id);
      setCreateOrgOpen(false);
      setNewOrgForm({ name: "", slug: "" });
      await fetchData();
    } catch (err: any) {
      const desc = await getFunctionErrorMessage(err, "Falha ao criar organização.");
      toast({ variant: "destructive", title: "Erro", description: desc });
    } finally { setCreatingOrg(false); }
  };

  const handleDeleteTenant = async (tenantId: string) => {
    setDeletingTenantId(tenantId);
    try {
      const membersCount = new Set(roles.filter((r) => r.tenant_id === tenantId).map((r) => r.user_id)).size;
      if (membersCount > 0) { toast({ variant: "destructive", title: "Erro", description: "Não é possível excluir com membros." }); return; }
      const { data, error } = await supabase.functions.invoke("tenant-admin", { body: { action: "delete", tenant_id: tenantId } });
      if (error) { const m = await getFunctionErrorMessage(error, "Falha ao excluir."); throw new Error(m); }
      if (data?.error) throw new Error(data.error);
      toast({ title: "Organização excluída" });
      if (selectedTenantId === tenantId) setSelectedTenantId(tenants.find((t) => t.id !== tenantId)?.id ?? null);
      await fetchData();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    } finally { setDeletingTenantId(null); }
  };

  const handleInvite = async () => {
    if (!inviteForm.email.trim() || !selectedTenantId) return;
    setInviting(true);
    try {
      let email = inviteForm.email.trim().toLowerCase();
      if (!email.includes("@")) email = `${email}@flowpulse.local`;
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { email, display_name: inviteForm.display_name.trim(), role: inviteForm.role, password: inviteForm.password.trim() || undefined, target_tenant_id: selectedTenantId, mode: "link" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: data?.existing ? "Usuário vinculado" : "Usuário adicionado" });
      setInviteOpen(false);
      setInviteForm({ email: "", display_name: "", role: "viewer", password: "" });
      await refreshSession();
      await fetchData();
    } catch (err: any) {
      const desc = await getFunctionErrorMessage(err, "Falha ao convidar.");
      toast({ variant: "destructive", title: "Erro", description: desc });
    } finally { setInviting(false); }
  };

  return (
    <div className="space-y-6">
      <AdminBreadcrumb items={[{ label: "Organizações" }]} />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground font-[Orbitron] tracking-wide">Organizações</h2>
          <p className="text-sm text-muted-foreground mt-1">Crie e gerencie ecossistemas isolados e seus membros.</p>
        </div>
        {isSuperAdmin && (
          <Button size="sm" onClick={() => setCreateOrgOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Nova Organização
          </Button>
        )}
      </div>

      {/* Tenant Selector */}
      {tenants.length > 1 && (
        <section className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-4">
          <div className="flex flex-wrap gap-2">
            {tenants.map((t) => {
              const memberCount = new Set(roles.filter((r) => r.tenant_id === t.id).map((r) => r.user_id)).size;
              return (
                <div key={t.id} className="flex items-center gap-1">
                  <Button size="sm" variant={t.id === selectedTenantId ? "default" : "outline"} onClick={() => setSelectedTenantId(t.id)} className="text-xs">
                    {t.name}
                    <Badge variant="secondary" className="ml-2 text-[10px]">{memberCount}</Badge>
                  </Button>
                  {memberCount === 0 && isSuperAdmin && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" disabled={deletingTenantId === t.id} onClick={() => handleDeleteTenant(t.id)}>
                      {deletingTenantId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Org Detail */}
      <section className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Building2 className="w-5 h-5 text-primary" />
            <h3 className="text-base font-bold font-[Orbitron] tracking-wide text-foreground">{tenant?.name ?? "ORGANIZAÇÃO"}</h3>
          </div>
          <div className="flex items-center gap-2">
            {tenant && !editingTeam && (
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> Adicionar Usuário
              </Button>
            )}
            {!editingTeam && tenant && (
              <Button variant="ghost" size="sm" onClick={() => setEditingTeam(true)}>
                <Pencil className="w-4 h-4 mr-1" /> Editar
              </Button>
            )}
          </div>
        </div>

        {!tenant ? (
          <p className="text-sm text-muted-foreground">Selecione uma organização.</p>
        ) : editingTeam ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Nome</Label>
                <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} className="bg-muted/50 border-border" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Slug</Label>
                <Input value={teamSlug} onChange={(e) => setTeamSlug(e.target.value)} className="bg-muted/50 border-border font-mono text-xs" />
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={handleSaveTeam} disabled={savingTeam} size="sm">
                {savingTeam ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />} Salvar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setEditingTeam(false); setTeamName(tenant.name); setTeamSlug(tenant.slug); }}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="space-y-1"><p className="text-xs text-muted-foreground">Nome</p><p className="text-sm font-medium text-foreground">{tenant.name}</p></div>
            <div className="space-y-1"><p className="text-xs text-muted-foreground">Slug</p><p className="text-sm font-mono text-muted-foreground">{tenant.slug}</p></div>
            <div className="space-y-1"><p className="text-xs text-muted-foreground">Membros</p><p className="text-sm font-medium text-foreground">{selectedTenantProfiles.length}</p></div>
          </div>
        )}

        {/* Role breakdown */}
        {tenant && !editingTeam && (
          <div className="mt-8">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Membros por Role</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {(["admin", "editor", "tech", "sales", "viewer"] as const).map((r) => {
                const members = selectedTenantProfiles.filter((p) => getRoleForUser(p.id, selectedTenantId) === r);
                return (
                  <div key={r} className="rounded-lg border border-border bg-muted/30 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant={getRoleBadgeVariant(r)} className="text-xs">{r}</Badge>
                      <span className="text-xs text-muted-foreground">({members.length})</span>
                    </div>
                    <div className="space-y-2">
                      {members.map((m) => (
                        <div key={m.id} className="flex items-center gap-2 text-xs">
                          <div className="w-5 h-5 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                            {(m.display_name?.[0] ?? "?").toUpperCase()}
                          </div>
                          <span className="text-foreground truncate">{m.display_name ?? m.email ?? "—"}</span>
                        </div>
                      ))}
                      {members.length === 0 && <p className="text-xs text-muted-foreground italic">Nenhum membro</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* ── Invite Dialog ── */}
      <Dialog open={inviteOpen} onOpenChange={(o) => !inviting && setInviteOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Usuário</DialogTitle>
            <DialogDescription>Vinculado a: <strong>{tenant?.name ?? "nenhuma"}</strong></DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">E-mail *</Label>
              <Input value={inviteForm.email} onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))} placeholder="usuario@empresa.com" className="bg-muted/50 border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Nome</Label>
              <Input value={inviteForm.display_name} onChange={(e) => setInviteForm((f) => ({ ...f, display_name: e.target.value }))} placeholder="João" className="bg-muted/50 border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Role</Label>
              <Select value={inviteForm.role} onValueChange={(v) => setInviteForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger className="bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem><SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="tech">Técnico</SelectItem><SelectItem value="sales">Vendedor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Senha</Label>
              <Input type="password" value={inviteForm.password} onChange={(e) => setInviteForm((f) => ({ ...f, password: e.target.value }))} placeholder="Opcional" className="bg-muted/50 border-border" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteOpen(false)} disabled={inviting}>Cancelar</Button>
            <Button onClick={handleInvite} disabled={inviting || !inviteForm.email.trim()}>
              {inviting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />} Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Org Dialog ── */}
      <Dialog open={createOrgOpen} onOpenChange={(o) => !creatingOrg && setCreateOrgOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Organização</DialogTitle>
            <DialogDescription>Crie um novo ecossistema isolado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Nome *</Label>
              <Input value={newOrgForm.name} onChange={(e) => setNewOrgForm((f) => ({ ...f, name: e.target.value }))} placeholder="Madeplant Logística" className="bg-muted/50 border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Slug (opcional)</Label>
              <Input value={newOrgForm.slug} onChange={(e) => setNewOrgForm((f) => ({ ...f, slug: e.target.value }))} placeholder="madeplant-logistica" className="bg-muted/50 border-border font-mono text-xs" />
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
