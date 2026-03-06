import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin, getFunctionErrorMessage, type Profile, type UserRole } from "./AdminContext";
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Users, Building2, Loader2, Trash2, Plus, Search, Crown, MoreHorizontal, Pencil, UserX,
} from "lucide-react";
import AdminBreadcrumb from "./AdminBreadcrumb";

export default function AdminUsersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { profiles, roles, tenants, selectedTenantId, setSelectedTenantId, isSuperAdmin, fetchData, profileById, getRoleForUser, getRoleBadgeVariant } = useAdmin();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [orgFilter, setOrgFilter] = useState("all");
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all");

  // Invite
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", display_name: "", role: "viewer", password: "", target_tenant_id: "" });
  const [inviting, setInviting] = useState(false);

  // Remove from org
  const [removeDialog, setRemoveDialog] = useState<{ open: boolean; userId: string; name: string; tenantId: string }>({ open: false, userId: "", name: "", tenantId: "" });
  const [removing, setRemoving] = useState(false);

  // Delete user permanently
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; userId: string; name: string }>({ open: false, userId: "", name: "" });
  const [deleting, setDeleting] = useState(false);

  // Link
  const [linkDialog, setLinkDialog] = useState<{ open: boolean; userId: string; name: string; email: string }>({ open: false, userId: "", name: "", email: "" });
  const [linkTargetTenant, setLinkTargetTenant] = useState("");
  const [linkRole, setLinkRole] = useState("viewer");
  const [linking, setLinking] = useState(false);

  // Edit permissions
  const [permissionDialog, setPermissionDialog] = useState<{
    open: boolean;
    userId: string;
    name: string;
    email: string;
    tenantId: string;
    role: string;
  }>({ open: false, userId: "", name: "", email: "", tenantId: "", role: "viewer" });
  const [savingPermission, setSavingPermission] = useState(false);

  /* ── Computed: All Users (profiles as source of truth) ── */
  const roleUserIds = new Set(roles.map((r) => r.user_id));
  const allUserProfiles: (Profile & { _roles: UserRole[] })[] = [
    // Start from all profiles
    ...profiles.map((p) => ({
      ...p,
      _roles: roles.filter((r) => r.user_id === p.id),
    })),
    // Add any users that have roles but no profile visible (edge case)
    ...([...roleUserIds].filter((uid) => !profiles.some((p) => p.id === uid)).map((uid) => ({
      id: uid,
      display_name: null,
      email: null,
      avatar_url: null,
      tenant_id: "",
      created_at: new Date().toISOString(),
      _roles: roles.filter((r) => r.user_id === uid),
    }))),
  ];

  /* ── Computed: Org Users ── */
  const orgTenantId = selectedTenantId;
  const orgRoles = orgTenantId ? roles.filter((r) => r.tenant_id === orgTenantId) : [];
  const orgUserIds = [...new Set(orgRoles.map((r) => r.user_id))];
  const orgUsers = orgUserIds.map((uid) => {
    const p = profileById.get(uid);
    return {
      id: uid,
      display_name: p?.display_name ?? null,
      email: p?.email ?? null,
      avatar_url: p?.avatar_url ?? null,
      tenant_id: orgTenantId ?? "",
      created_at: p?.created_at ?? new Date().toISOString(),
      _roles: roles.filter((r) => r.user_id === uid),
    };
  });

  const tenant = tenants.find((t) => t.id === selectedTenantId);

  /* ── Filter logic ── */
  const applyFilter = (
    list: typeof allUserProfiles,
    options: { tenantScope: string | null; includeOrgFilter: boolean },
  ) => {
    const term = search.trim().toLowerCase();
    const { tenantScope, includeOrgFilter } = options;

    return list.filter((p) => {
      const matchSearch = !term || (p.display_name?.toLowerCase().includes(term) ?? false) || (p.email?.toLowerCase().includes(term) ?? false);
      const matchRole = roleFilter === "all" || p._roles.some((r) => r.role === roleFilter && (!tenantScope || r.tenant_id === tenantScope));
      const matchOrg = !includeOrgFilter || orgFilter === "all" || p._roles.some((r) => r.tenant_id === orgFilter);
      return matchSearch && matchRole && matchOrg;
    });
  };

  const filteredAll = applyFilter(allUserProfiles, { tenantScope: null, includeOrgFilter: true });
  const filteredOrg = applyFilter(orgUsers, { tenantScope: orgTenantId, includeOrgFilter: false });

  useEffect(() => {
    if (activeTab === "org" && orgFilter !== "all") {
      setOrgFilter("all");
    }
  }, [activeTab, orgFilter]);

  /* ── Handlers ── */
  const handleRoleChange = async (userId: string, newRole: string, tenantId: string, emailHint?: string | null, nameHint?: string | null) => {
    const changeKey = `${userId}:${tenantId}`;
    setChangingRole(changeKey);

    try {
      const profile = profileById.get(userId);
      const email = (emailHint ?? profile?.email ?? "").trim().toLowerCase();
      if (!email) throw new Error("Usuário sem e-mail válido para atualizar permissões.");

      const displayName = (nameHint ?? profile?.display_name ?? email.split("@")[0] ?? "").trim();

      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email,
          display_name: displayName,
          role: newRole,
          target_tenant_id: tenantId,
          mode: "link",
        },
      });

      if (error) {
        const m = await getFunctionErrorMessage(error, "Falha ao atualizar role.");
        throw new Error(m);
      }
      if (data?.error) throw new Error(data.error);

      toast({ title: "Permissão atualizada", description: `Usuário agora é ${newRole}.` });
      await fetchData();
      return true;
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro", description: err.message });
      return false;
    } finally {
      setChangingRole(null);
    }
  };

  const openPermissionDialog = (p: typeof allUserProfiles[0], scopeTenantId: string | null) => {
    const fallbackTenantId =
      scopeTenantId
      ?? (orgFilter !== "all" ? orgFilter : null)
      ?? selectedTenantId
      ?? p._roles[0]?.tenant_id
      ?? tenants[0]?.id
      ?? "";

    const scopedRole = fallbackTenantId ? getRoleForUser(p.id, fallbackTenantId) ?? "viewer" : "viewer";

    setPermissionDialog({
      open: true,
      userId: p.id,
      name: p.display_name ?? p.email ?? "usuário",
      email: p.email ?? "",
      tenantId: fallbackTenantId,
      role: scopedRole,
    });
  };

  const handlePermissionSave = async () => {
    if (!permissionDialog.userId || !permissionDialog.tenantId) return;

    setSavingPermission(true);
    const ok = await handleRoleChange(
      permissionDialog.userId,
      permissionDialog.role,
      permissionDialog.tenantId,
      permissionDialog.email,
      permissionDialog.name,
    );
    if (ok) {
      setPermissionDialog({ open: false, userId: "", name: "", email: "", tenantId: "", role: "viewer" });
    }
    setSavingPermission(false);
  };

  const handleInvite = async () => {
    const targetTenant = inviteForm.target_tenant_id || selectedTenantId;
    if (!inviteForm.email.trim() || !targetTenant) return;
    setInviting(true);
    try {
      let email = inviteForm.email.trim().toLowerCase();
      if (!email.includes("@")) email = `${email}@flowpulse.local`;
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { email, display_name: inviteForm.display_name.trim(), role: inviteForm.role, password: inviteForm.password.trim() || undefined, target_tenant_id: targetTenant, mode: "link" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const tName = tenants.find(t => t.id === targetTenant)?.name ?? "";
      toast({ title: data?.existing ? "Usuário vinculado" : "Usuário adicionado", description: `${email} vinculado a "${tName}".` });
      setInviteOpen(false);
      setInviteForm({ email: "", display_name: "", role: "viewer", password: "", target_tenant_id: "" });
      setSelectedTenantId(targetTenant);
      setSearch("");
      setRoleFilter("all");
      setOrgFilter("all");
      await fetchData();
    } catch (err: any) {
      const desc = await getFunctionErrorMessage(err, "Falha ao convidar.");
      toast({ variant: "destructive", title: "Erro", description: desc });
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async () => {
    if (!removeDialog.tenantId) return;
    setRemoving(true);
    try {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", removeDialog.userId).eq("tenant_id", removeDialog.tenantId);
      if (error) throw error;
      toast({ title: "Acesso removido", description: `${removeDialog.name} removido da organização.` });
      setRemoveDialog({ open: false, userId: "", name: "", tenantId: "" });
      await fetchData();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    } finally {
      setRemoving(false);
    }
  };

  const handleLink = async () => {
    if (!linkTargetTenant || !linkDialog.userId) return;
    setLinking(true);
    try {
      const email = linkDialog.email?.trim().toLowerCase();
      if (!email) throw new Error("Usuário sem e-mail válido.");
      const profileToLink = profiles.find((p) => p.id === linkDialog.userId);
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { email, display_name: profileToLink?.display_name ?? "", role: linkRole, target_tenant_id: linkTargetTenant, mode: "link" },
      });
      if (error) { const m = await getFunctionErrorMessage(error, "Falha ao vincular."); throw new Error(m); }
      if (data?.error) throw new Error(data.error);
      toast({ title: "Usuário vinculado", description: `${linkDialog.name} vinculado a "${tenants.find((t) => t.id === linkTargetTenant)?.name}".` });
      setLinkDialog({ open: false, userId: "", name: "", email: "" });
      setLinkTargetTenant(""); setLinkRole("viewer");
      await fetchData();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    } finally {
      setLinking(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteDialog.userId) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { user_id: deleteDialog.userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Usuário excluído", description: `${deleteDialog.name} foi removido permanentemente.` });
      setDeleteDialog({ open: false, userId: "", name: "" });
      await fetchData();
    } catch (err: any) {
      const desc = await getFunctionErrorMessage(err, "Falha ao excluir usuário.");
      toast({ variant: "destructive", title: "Erro", description: desc });
    } finally {
      setDeleting(false);
    }
  };

  const renderUserRow = (p: typeof allUserProfiles[0], scopeTenantId: string | null) => {
    const isSelf = p.id === user?.id;
    const userTenants = [...new Set(p._roles.map((r) => r.tenant_id))].map((tid) => tenants.find((t) => t.id === tid)).filter(Boolean);
    const roleInScope = scopeTenantId ? getRoleForUser(p.id, scopeTenantId) ?? "viewer" : null;
    const distinctRoles = [...new Set(p._roles.map((r) => r.role))];

    return (
      <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary">
              {(p.display_name?.[0] ?? "?").toUpperCase()}
            </div>
            <span className="font-medium text-foreground">
              {p.display_name ?? "Sem nome"}
              {isSelf && <span className="text-xs text-primary ml-2">(você)</span>}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{p.email ?? "—"}</td>
        {!scopeTenantId && (
          <td className="px-4 py-3">
            <div className="flex flex-wrap gap-1">
              {userTenants.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : userTenants.map((t) => (
                <Badge key={t!.id} variant="outline" className="text-[10px] px-1.5 py-0 font-normal whitespace-nowrap">
                  <Building2 className="w-3 h-3 mr-1 shrink-0" />{t!.name}
                </Badge>
              ))}
            </div>
          </td>
        )}
        <td className="px-4 py-3 text-center">
          {changingRole === `${p.id}:${scopeTenantId ?? ""}` ? (
            <Loader2 className="w-4 h-4 animate-spin mx-auto text-primary" />
          ) : scopeTenantId ? (
            isSelf ? (
              <Badge variant={getRoleBadgeVariant(roleInScope!)}>{roleInScope}</Badge>
            ) : (
              <Select value={roleInScope!} onValueChange={(v) => handleRoleChange(p.id, v, scopeTenantId, p.email, p.display_name)}>
                <SelectTrigger className="w-28 h-8 mx-auto bg-muted/50 border-border text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="tech">Técnico</SelectItem>
                  <SelectItem value="sales">Vendedor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            )
          ) : (
            <div className="flex items-center justify-center gap-1 flex-wrap">
              {distinctRoles.map((r) => (
                <Badge key={`${p.id}-${r}`} variant={getRoleBadgeVariant(r)} className="text-[10px]">{r}</Badge>
              ))}
            </div>
          )}
        </td>
        <td className="px-4 py-3 text-center text-xs text-muted-foreground">
          {new Date(p.created_at).toLocaleDateString("pt-BR")}
        </td>
        <td className="px-4 py-3 text-center">
          {!isSelf && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => openPermissionDialog(p, scopeTenantId)}>
                  <Pencil className="w-4 h-4 mr-2" /> Editar permissões
                </DropdownMenuItem>
                {!scopeTenantId && tenants.length > 1 && (
                  <DropdownMenuItem onClick={() => { setLinkDialog({ open: true, userId: p.id, name: p.display_name ?? p.email ?? "usuário", email: p.email ?? "" }); setLinkTargetTenant(""); setLinkRole("viewer"); }}>
                    <Building2 className="w-4 h-4 mr-2" /> Vincular a Organização
                  </DropdownMenuItem>
                )}
                {scopeTenantId && (
                  <DropdownMenuItem onClick={() => setRemoveDialog({ open: true, userId: p.id, name: p.display_name ?? p.email ?? "usuário", tenantId: scopeTenantId })}>
                    <UserX className="w-4 h-4 mr-2" /> Remover da organização
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  onClick={() => setDeleteDialog({ open: true, userId: p.id, name: p.display_name ?? p.email ?? "usuário" })}>
                  <Trash2 className="w-4 h-4 mr-2" /> Excluir usuário
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </td>
      </tr>
    );
  };

  const renderTable = (list: typeof allUserProfiles, scopeTenantId: string | null) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Usuário</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">E-mail</th>
            {!scopeTenantId && <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Belongs to</th>}
            <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Desde</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ações</th>
          </tr>
        </thead>
        <tbody>
          {list.map((p) => renderUserRow(p, scopeTenantId))}
          {list.length === 0 && (
            <tr><td colSpan={scopeTenantId ? 5 : 6} className="px-4 py-8 text-center text-muted-foreground">Nenhum usuário encontrado.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const renderFilters = (showOrgFilter: boolean) => (
    <div className="flex items-center gap-2 flex-wrap">
      {showOrgFilter && isSuperAdmin && tenants.length > 1 && (
        <Select value={orgFilter} onValueChange={setOrgFilter}>
          <SelectTrigger className="w-48 h-9 bg-muted/50 border-border text-xs"><SelectValue placeholder="Organização" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas organizações</SelectItem>
            {tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <Select value={roleFilter} onValueChange={setRoleFilter}>
        <SelectTrigger className="w-32 h-9 bg-muted/50 border-border text-xs"><SelectValue placeholder="Role" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas Roles</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
          <SelectItem value="editor">Editor</SelectItem>
          <SelectItem value="tech">Técnico</SelectItem>
          <SelectItem value="sales">Vendedor</SelectItem>
          <SelectItem value="viewer">Viewer</SelectItem>
        </SelectContent>
      </Select>
      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome ou email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-muted/50 border-border text-sm" />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <AdminBreadcrumb items={[
        { label: "Usuários e Acesso", path: "/app/settings/admin/access" },
        { label: "Usuários" },
      ]} />

      <div>
        <h2 className="text-xl font-bold text-foreground font-[Orbitron] tracking-wide">Users</h2>
        <p className="text-sm text-muted-foreground mt-1">Gerencie todos os usuários da plataforma FlowPulse.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <TabsList className="bg-transparent border-b border-border rounded-none h-auto p-0 gap-0">
            <TabsTrigger value="all" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary px-4 py-2 text-sm">
              All users
            </TabsTrigger>
            <TabsTrigger value="org" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary px-4 py-2 text-sm">
              Organization users
            </TabsTrigger>
          </TabsList>
          {activeTab === "org" && (
            <Button size="sm" onClick={() => { setInviteForm(f => ({ ...f, target_tenant_id: selectedTenantId || "" })); setInviteOpen(true); }} disabled={!selectedTenantId}>
              <Plus className="w-4 h-4 mr-1" /> Invite
            </Button>
          )}
          {activeTab === "all" && isSuperAdmin && (
            <Button size="sm" onClick={() => { setInviteForm(f => ({ ...f, target_tenant_id: selectedTenantId || tenants[0]?.id || "" })); setInviteOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> New user
            </Button>
          )}
        </div>

        <TabsContent value="all" className="mt-0">
          <section className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">{filteredAll.length} usuários</span>
              </div>
              {renderFilters(true)}
            </div>
            {renderTable(filteredAll, null)}
          </section>
        </TabsContent>

        <TabsContent value="org" className="mt-0">
          <section className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-2">
                {isSuperAdmin && tenants.length > 1 && (
                  <Select value={selectedTenantId ?? ""} onValueChange={setSelectedTenantId}>
                    <SelectTrigger className="w-48 h-9 bg-muted/50 border-border text-xs"><SelectValue placeholder="Organização" /></SelectTrigger>
                    <SelectContent>
                      {tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {!isSuperAdmin && tenant && (
                  <span className="text-sm font-semibold text-foreground">{tenant.name} — {filteredOrg.length} membros</span>
                )}
              </div>
              {renderFilters(false)}
            </div>
            {renderTable(filteredOrg, orgTenantId)}
          </section>
        </TabsContent>
      </Tabs>

      {/* ── Invite Dialog ── */}
      <Dialog open={inviteOpen} onOpenChange={(o) => !inviting && setInviteOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Novo Usuário</DialogTitle>
            <DialogDescription>Vinculado à organização selecionada abaixo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {isSuperAdmin && tenants.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Organização *</Label>
                <Select value={inviteForm.target_tenant_id || selectedTenantId || ""} onValueChange={(v) => setInviteForm((f) => ({ ...f, target_tenant_id: v }))}>
                  <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">E-mail *</Label>
              <Input value={inviteForm.email} onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))} placeholder="admin ou usuario@empresa.com" className="bg-muted/50 border-border" />
              <p className="text-[10px] text-muted-foreground">Sem @ será completado com @flowpulse.local</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Nome de exibição</Label>
              <Input value={inviteForm.display_name} onChange={(e) => setInviteForm((f) => ({ ...f, display_name: e.target.value }))} placeholder="João Silva" className="bg-muted/50 border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Role *</Label>
              <Select value={inviteForm.role} onValueChange={(v) => setInviteForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger className="bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="tech">Técnico</SelectItem>
                  <SelectItem value="sales">Vendedor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Senha provisória</Label>
              <Input type="password" value={inviteForm.password} onChange={(e) => setInviteForm((f) => ({ ...f, password: e.target.value }))} placeholder="Mín. 6 caracteres (opcional)" className="bg-muted/50 border-border" minLength={6} />
              <p className="text-[10px] text-muted-foreground">Se vazio, uma senha aleatória será gerada.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteOpen(false)} disabled={inviting}>Cancelar</Button>
            <Button onClick={handleInvite} disabled={inviting || !inviteForm.email.trim() || !(inviteForm.target_tenant_id || selectedTenantId)}>
              {inviting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />} Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Remove Dialog ── */}
      <Dialog open={removeDialog.open} onOpenChange={(o) => !removing && setRemoveDialog((s) => ({ ...s, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover acesso</DialogTitle>
            <DialogDescription>Remover <strong>{removeDialog.name}</strong> desta organização?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoveDialog({ open: false, userId: "", name: "", tenantId: "" })} disabled={removing}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRemove} disabled={removing}>
              {removing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />} Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Link Dialog ── */}
      <Dialog open={linkDialog.open} onOpenChange={(o) => !linking && setLinkDialog((s) => ({ ...s, open: o }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular a Organização</DialogTitle>
            <DialogDescription>Adicionar <strong>{linkDialog.name}</strong> a outra organização.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Organização destino</Label>
              <Select value={linkTargetTenant} onValueChange={setLinkTargetTenant}>
                <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Role</Label>
              <Select value={linkRole} onValueChange={setLinkRole}>
                <SelectTrigger className="bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="tech">Técnico</SelectItem>
                  <SelectItem value="sales">Vendedor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLinkDialog({ open: false, userId: "", name: "", email: "" })} disabled={linking}>Cancelar</Button>
            <Button onClick={handleLink} disabled={linking || !linkTargetTenant}>
              {linking ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Building2 className="w-4 h-4 mr-1" />} Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Permission Dialog ── */}
      <Dialog open={permissionDialog.open} onOpenChange={(o) => !savingPermission && setPermissionDialog((s) => ({ ...s, open: o }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar permissões</DialogTitle>
            <DialogDescription>Defina a organização e role de <strong>{permissionDialog.name}</strong>.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Organização</Label>
              <Select
                value={permissionDialog.tenantId}
                onValueChange={(tenantId) => setPermissionDialog((s) => ({
                  ...s,
                  tenantId,
                  role: getRoleForUser(s.userId, tenantId) ?? "viewer",
                }))}
              >
                <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Role</Label>
              <Select value={permissionDialog.role} onValueChange={(role) => setPermissionDialog((s) => ({ ...s, role }))}>
                <SelectTrigger className="bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="tech">Técnico</SelectItem>
                  <SelectItem value="sales">Vendedor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPermissionDialog({ open: false, userId: "", name: "", email: "", tenantId: "", role: "viewer" })} disabled={savingPermission}>
              Cancelar
            </Button>
            <Button onClick={handlePermissionSave} disabled={savingPermission || !permissionDialog.tenantId}>
              {savingPermission ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Pencil className="w-4 h-4 mr-1" />} Salvar permissões
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete User Dialog ── */}
      <Dialog open={deleteDialog.open} onOpenChange={(o) => !deleting && setDeleteDialog((s) => ({ ...s, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir usuário permanentemente</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>{deleteDialog.name}</strong>? Esta ação é irreversível e removerá o usuário de todas as organizações.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteDialog({ open: false, userId: "", name: "" })} disabled={deleting}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteUser} disabled={deleting}>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />} Excluir permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
