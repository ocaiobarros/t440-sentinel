import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useRMSConnections, type RMSConnectionItem } from "@/hooks/useRMSConnections";
import { useZabbixConnections, type ZabbixConnectionItem } from "@/hooks/useZabbixConnections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ChevronLeft,
  Users,
  Shield,
  Building2,
  Loader2,
  Pencil,
  Trash2,
  Plus,
  Save,
  Search,
  Crown,
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
  Fuel,
  Server,
  Cable,
  Eye,
  EyeOff,
} from "lucide-react";

interface Profile {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  tenant_id: string;
  created_at: string;
}

interface UserRole {
  id: string;
  user_id: string;
  role: "admin" | "editor" | "viewer";
  tenant_id: string;
}

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export default function AdminHub() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // Team editing
  const [editingTeam, setEditingTeam] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamSlug, setTeamSlug] = useState("");
  const [savingTeam, setSavingTeam] = useState(false);

  // Invite user
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", display_name: "", role: "viewer" });
  const [inviting, setInviting] = useState(false);

  // Role change
  const [changingRole, setChangingRole] = useState<string | null>(null);

  // Remove user dialog
  const [removeDialog, setRemoveDialog] = useState<{ open: boolean; userId: string; name: string }>({
    open: false, userId: "", name: "",
  });
  const [removing, setRemoving] = useState(false);

  // RMS connections
  const rms = useRMSConnections();
  const [rmsDialogOpen, setRmsDialogOpen] = useState(false);
  const [rmsEditing, setRmsEditing] = useState<RMSConnectionItem | null>(null);
  const [rmsForm, setRmsForm] = useState({ name: "", url: "", api_token: "" });
  const [showRmsToken, setShowRmsToken] = useState(false);

  // Zabbix connections
  const zabbix = useZabbixConnections();
  const [zabbixDialogOpen, setZabbixDialogOpen] = useState(false);
  const [zabbixEditing, setZabbixEditing] = useState<ZabbixConnectionItem | null>(null);
  const [zabbixForm, setZabbixForm] = useState({ name: "", url: "", username: "", password: "" });
  const [showZabbixPass, setShowZabbixPass] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: myRole } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (!myRole || myRole.role !== "admin") {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      setIsAdmin(true);
      const [tenantRes, profilesRes, rolesRes] = await Promise.all([
        supabase.from("tenants").select("*").single(),
        supabase.from("profiles").select("*").order("created_at", { ascending: true }),
        supabase.from("user_roles").select("*"),
      ]);
      if (tenantRes.data) { setTenant(tenantRes.data); setTeamName(tenantRes.data.name); setTeamSlug(tenantRes.data.slug); }
      if (profilesRes.data) setProfiles(profilesRes.data);
      if (rolesRes.data) setRoles(rolesRes.data as UserRole[]);
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Falha ao carregar dados." });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getRoleForUser = (userId: string) => roles.find((r) => r.user_id === userId)?.role ?? "viewer";

  const getRoleBadgeVariant = (role: string) => {
    if (role === "admin") return "default";
    if (role === "editor") return "secondary";
    return "outline" as const;
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    setChangingRole(userId);
    try {
      const existing = roles.find((r) => r.user_id === userId);
      if (existing) {
        const { error } = await supabase.from("user_roles")
          .update({ role: newRole as "admin" | "editor" | "viewer" }).eq("id", existing.id);
        if (error) throw error;
      }
      toast({ title: "Role atualizada", description: `Usuário agora é ${newRole}.` });
      await fetchData();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro", description: err.message || "Falha ao atualizar role." });
    } finally {
      setChangingRole(null);
    }
  };

  const handleRemoveUser = async () => {
    setRemoving(true);
    try {
      const { error } = await supabase.from("user_roles")
        .delete().eq("user_id", removeDialog.userId).eq("tenant_id", tenant?.id ?? "");
      if (error) throw error;
      toast({ title: "Acesso removido", description: `${removeDialog.name} foi removido do time.` });
      setRemoveDialog({ open: false, userId: "", name: "" });
      await fetchData();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro", description: err.message || "Falha ao remover." });
    } finally {
      setRemoving(false);
    }
  };

  const handleSaveTeam = async () => {
    if (!tenant || !teamName.trim()) return;
    setSavingTeam(true);
    try {
      const slugValue = teamSlug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
      if (!slugValue) {
        toast({ variant: "destructive", title: "Erro", description: "Slug inválido." });
        setSavingTeam(false);
        return;
      }
      const { error } = await supabase.from("tenants").update({ name: teamName.trim(), slug: slugValue }).eq("id", tenant.id);
      if (error) throw error;
      toast({ title: "Organização atualizada", description: "Nome e slug salvos." });
      setEditingTeam(false);
      await fetchData();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro", description: err.message || "Falha ao salvar." });
    } finally {
      setSavingTeam(false);
    }
  };

  const handleInviteUser = async () => {
    if (!inviteForm.email.trim()) return;
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { email: inviteForm.email.trim(), display_name: inviteForm.display_name.trim(), role: inviteForm.role },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Usuário adicionado", description: `${inviteForm.email} foi adicionado ao time.` });
      setInviteOpen(false);
      setInviteForm({ email: "", display_name: "", role: "viewer" });
      await fetchData();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro", description: err.message || "Falha ao convidar." });
    } finally {
      setInviting(false);
    }
  };

  // ─── RMS handlers ───
  const openRmsCreate = () => {
    setRmsEditing(null);
    setRmsForm({ name: "", url: "https://supabase.rmsgroup.app/functions/v1/fueling-entries-api", api_token: "" });
    rms.clearTestResult();
    setShowRmsToken(false);
    setRmsDialogOpen(true);
  };
  const openRmsEdit = (c: RMSConnectionItem) => {
    setRmsEditing(c);
    setRmsForm({ name: c.name, url: c.url, api_token: "" });
    rms.clearTestResult();
    setShowRmsToken(false);
    setRmsDialogOpen(true);
  };
  const handleRmsSave = async () => {
    if (rmsEditing) {
      await rms.update({ id: rmsEditing.id, name: rmsForm.name, url: rmsForm.url, ...(rmsForm.api_token ? { api_token: rmsForm.api_token } : {}) });
    } else {
      await rms.create(rmsForm);
    }
    setRmsDialogOpen(false);
  };
  const handleRmsTest = () => {
    if (rmsEditing) {
      rms.testConnection({ id: rmsEditing.id, ...(rmsForm.api_token ? { api_token: rmsForm.api_token } : {}) });
    } else {
      rms.testConnection({ url: rmsForm.url, api_token: rmsForm.api_token });
    }
  };

  // ─── Zabbix handlers ───
  const openZabbixCreate = () => {
    setZabbixEditing(null);
    setZabbixForm({ name: "", url: "", username: "", password: "" });
    zabbix.clearTestResult();
    setShowZabbixPass(false);
    setZabbixDialogOpen(true);
  };
  const openZabbixEdit = (c: ZabbixConnectionItem) => {
    setZabbixEditing(c);
    setZabbixForm({ name: c.name, url: c.url, username: c.username, password: "" });
    zabbix.clearTestResult();
    setShowZabbixPass(false);
    setZabbixDialogOpen(true);
  };
  const handleZabbixSave = async () => {
    if (zabbixEditing) {
      await zabbix.update({ id: zabbixEditing.id, name: zabbixForm.name, url: zabbixForm.url, username: zabbixForm.username, ...(zabbixForm.password ? { password: zabbixForm.password } : {}) });
    } else {
      await zabbix.create(zabbixForm);
    }
    setZabbixDialogOpen(false);
  };
  const handleZabbixTest = () => {
    if (zabbixEditing) {
      zabbix.testConnection({ id: zabbixEditing.id, ...(zabbixForm.password ? { password: zabbixForm.password } : {}) });
    } else {
      zabbix.testConnection({ url: zabbixForm.url, username: zabbixForm.username, password: zabbixForm.password });
    }
  };

  const filteredProfiles = profiles.filter((p) => {
    const term = search.toLowerCase();
    const matchesSearch = (p.display_name?.toLowerCase().includes(term) ?? false) ||
      (p.email?.toLowerCase().includes(term) ?? false);
    const matchesRole = roleFilter === "all" || getRoleForUser(p.id) === roleFilter;
    return matchesSearch && matchesRole;
  });

  // Access denied
  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Shield className="w-16 h-16 text-destructive mx-auto opacity-60" />
          <h1 className="text-2xl font-bold text-foreground font-[Orbitron]">Acesso Negado</h1>
          <p className="text-muted-foreground">Apenas administradores podem acessar esta área.</p>
          <Button variant="outline" onClick={() => navigate("/")}>
            <ChevronLeft className="w-4 h-4 mr-2" /> Voltar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Crown className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold font-[Orbitron] tracking-wider text-foreground">ADMIN HUB</h1>
              <p className="text-xs text-muted-foreground font-mono">FLOWPULSE INTELLIGENCE — Gerenciamento</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : (
          <Tabs defaultValue="users" className="space-y-6">
            <TabsList className="bg-card border border-border">
              <TabsTrigger value="users" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                <Users className="w-4 h-4 mr-2" /> Usuários
              </TabsTrigger>
              <TabsTrigger value="team" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                <Building2 className="w-4 h-4 mr-2" /> Organização
              </TabsTrigger>
              <TabsTrigger value="connections" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                <Cable className="w-4 h-4 mr-2" /> Conexões de Dados
              </TabsTrigger>
            </TabsList>

            {/* ─── USERS TAB ─── */}
            <TabsContent value="users">
              <section className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-primary" />
                    <h2 className="text-base font-bold font-[Orbitron] tracking-wide text-foreground">
                      USUÁRIOS ({filteredProfiles.length})
                    </h2>
                    <Button size="sm" onClick={() => setInviteOpen(true)}>
                      <Plus className="w-4 h-4 mr-1" /> Novo Usuário
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                      <SelectTrigger className="w-32 h-9 bg-muted/50 border-border text-xs">
                        <SelectValue placeholder="Filtrar role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas Roles</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="relative w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input placeholder="Buscar por nome ou email..." value={search}
                        onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-muted/50 border-border text-sm" />
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Usuário</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">E-mail</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Desde</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProfiles.map((p) => {
                        const role = getRoleForUser(p.id);
                        const isSelf = p.id === user?.id;
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
                            <td className="px-4 py-3 text-center">
                              {changingRole === p.id ? (
                                <Loader2 className="w-4 h-4 animate-spin mx-auto text-primary" />
                              ) : isSelf ? (
                                <Badge variant={getRoleBadgeVariant(role)}>{role}</Badge>
                              ) : (
                                <Select value={role} onValueChange={(v) => handleRoleChange(p.id, v)}>
                                  <SelectTrigger className="w-28 h-8 mx-auto bg-muted/50 border-border text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="editor">Editor</SelectItem>
                                    <SelectItem value="viewer">Viewer</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                              {new Date(p.created_at).toLocaleDateString("pt-BR")}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {!isSelf && (
                                <Button variant="ghost" size="icon"
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => setRemoveDialog({ open: true, userId: p.id, name: p.display_name ?? p.email ?? "usuário" })}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredProfiles.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nenhum usuário encontrado.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </TabsContent>

            {/* ─── TEAM TAB ─── */}
            <TabsContent value="team">
              <section className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-primary" />
                    <h2 className="text-base font-bold font-[Orbitron] tracking-wide text-foreground">ORGANIZAÇÃO</h2>
                  </div>
                  {!editingTeam && (
                    <Button variant="ghost" size="sm" onClick={() => setEditingTeam(true)}>
                      <Pencil className="w-4 h-4 mr-1" /> Editar
                    </Button>
                  )}
                </div>
                {editingTeam ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Nome</Label>
                        <Input value={teamName} onChange={(e) => setTeamName(e.target.value)}
                          placeholder="Nome da organização" className="bg-muted/50 border-border" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Slug</Label>
                        <Input value={teamSlug} onChange={(e) => setTeamSlug(e.target.value)}
                          placeholder="minha-org" className="bg-muted/50 border-border font-mono text-xs" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button onClick={handleSaveTeam} disabled={savingTeam} size="sm">
                        {savingTeam ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                        Salvar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setEditingTeam(false); setTeamName(tenant?.name ?? ""); setTeamSlug(tenant?.slug ?? ""); }}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Nome</p>
                      <p className="text-sm font-medium text-foreground">{tenant?.name}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Slug</p>
                      <p className="text-sm font-mono text-muted-foreground">{tenant?.slug}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Membros</p>
                      <p className="text-sm font-medium text-foreground">{profiles.length}</p>
                    </div>
                  </div>
                )}

                {/* Member breakdown by role */}
                <div className="mt-8">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Membros por Role</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {(["admin", "editor", "viewer"] as const).map((r) => {
                      const members = profiles.filter((p) => getRoleForUser(p.id) === r);
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
              </section>
            </TabsContent>

            {/* ─── CONNECTIONS TAB ─── */}
            <TabsContent value="connections" className="space-y-6">
              {/* RMS Section */}
              <section className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Fuel className="w-5 h-5 text-primary" />
                    <h2 className="text-base font-bold font-[Orbitron] tracking-wide text-foreground">RMS FUELING</h2>
                  </div>
                  <Button size="sm" onClick={openRmsCreate}>
                    <Plus className="w-4 h-4 mr-1" /> Nova Conexão
                  </Button>
                </div>
                {rms.isLoading ? (
                  <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : rms.connections.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Cable className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Nenhuma conexão RMS configurada.</p>
                    <p className="text-xs mt-1">Clique em "Nova Conexão" para começar.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {rms.connections.map((c) => (
                      <div key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
                        <div className="flex items-center gap-3">
                          {c.is_active ? <Wifi className="w-4 h-4 text-primary" /> : <WifiOff className="w-4 h-4 text-muted-foreground" />}
                          <div>
                            <p className="text-sm font-medium text-foreground">{c.name}</p>
                            <p className="text-xs text-muted-foreground font-mono truncate max-w-[300px]">{c.url}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={c.is_active ? "default" : "outline"} className="text-xs">
                            {c.is_active ? "Ativa" : "Inativa"}
                          </Badge>
                          <Button variant="ghost" size="icon" onClick={() => openRmsEdit(c)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={async () => { await rms.remove(c.id); }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Zabbix Section */}
              <section className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Server className="w-5 h-5 text-primary" />
                    <h2 className="text-base font-bold font-[Orbitron] tracking-wide text-foreground">ZABBIX</h2>
                  </div>
                  <Button size="sm" onClick={openZabbixCreate}>
                    <Plus className="w-4 h-4 mr-1" /> Nova Conexão
                  </Button>
                </div>
                {zabbix.isLoading ? (
                  <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : zabbix.connections.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Cable className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Nenhuma conexão Zabbix configurada.</p>
                    <p className="text-xs mt-1">Clique em "Nova Conexão" para começar.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {zabbix.connections.map((c) => (
                      <div key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
                        <div className="flex items-center gap-3">
                          {c.is_active ? <Wifi className="w-4 h-4 text-primary" /> : <WifiOff className="w-4 h-4 text-muted-foreground" />}
                          <div>
                            <p className="text-sm font-medium text-foreground">{c.name}</p>
                            <p className="text-xs text-muted-foreground font-mono truncate max-w-[300px]">{c.url}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={c.is_active ? "default" : "outline"} className="text-xs">
                            {c.is_active ? "Ativa" : "Inativa"}
                          </Badge>
                          <Button variant="ghost" size="icon" onClick={() => openZabbixEdit(c)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={async () => { await zabbix.remove(c.id); }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </TabsContent>
          </Tabs>
        )}
      </main>

      {/* ─── REMOVE USER DIALOG ─── */}
      <Dialog open={removeDialog.open} onOpenChange={(o) => !removing && setRemoveDialog((s) => ({ ...s, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover acesso</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover <strong>{removeDialog.name}</strong> desta organização?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoveDialog({ open: false, userId: "", name: "" })} disabled={removing}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRemoveUser} disabled={removing}>
              {removing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── RMS CONNECTION DIALOG ─── */}
      <Dialog open={rmsDialogOpen} onOpenChange={setRmsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{rmsEditing ? "Editar Conexão RMS" : "Nova Conexão RMS"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Nome</Label>
              <Input value={rmsForm.name} onChange={(e) => setRmsForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex: RMS Produção" className="bg-muted/50 border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">URL da API</Label>
              <Input value={rmsForm.url} onChange={(e) => setRmsForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://..." className="bg-muted/50 border-border font-mono text-xs" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                API Token {rmsEditing && <span className="text-muted-foreground/60">(deixe vazio para manter)</span>}
              </Label>
              <div className="relative">
                <Input type={showRmsToken ? "text" : "password"}
                  value={rmsForm.api_token} onChange={(e) => setRmsForm((f) => ({ ...f, api_token: e.target.value }))}
                  placeholder="••••••••" className="bg-muted/50 border-border pr-10" />
                <Button variant="ghost" size="icon" type="button"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowRmsToken(!showRmsToken)}>
                  {showRmsToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            {rms.testResult && (
              <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${rms.testResult.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                {rms.testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {rms.testResult.ok ? "Conexão bem-sucedida!" : rms.testResult.error ?? "Falha na conexão."}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleRmsTest} disabled={rms.testing || (!rmsForm.url && !rmsEditing)}>
              {rms.testing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Wifi className="w-4 h-4 mr-1" />}
              Testar
            </Button>
            <Button onClick={handleRmsSave} disabled={rms.isCreating || rms.isUpdating || !rmsForm.name}>
              {(rms.isCreating || rms.isUpdating) ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── ZABBIX CONNECTION DIALOG ─── */}
      <Dialog open={zabbixDialogOpen} onOpenChange={setZabbixDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{zabbixEditing ? "Editar Conexão Zabbix" : "Nova Conexão Zabbix"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Nome</Label>
              <Input value={zabbixForm.name} onChange={(e) => setZabbixForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Zabbix DC1" className="bg-muted/50 border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">URL do Zabbix</Label>
              <Input value={zabbixForm.url} onChange={(e) => setZabbixForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://zabbix.example.com" className="bg-muted/50 border-border font-mono text-xs" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Usuário</Label>
              <Input value={zabbixForm.username} onChange={(e) => setZabbixForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="Admin" className="bg-muted/50 border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Senha {zabbixEditing && <span className="text-muted-foreground/60">(deixe vazio para manter)</span>}
              </Label>
              <div className="relative">
                <Input type={showZabbixPass ? "text" : "password"}
                  value={zabbixForm.password} onChange={(e) => setZabbixForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••" className="bg-muted/50 border-border pr-10" />
                <Button variant="ghost" size="icon" type="button"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowZabbixPass(!showZabbixPass)}>
                  {showZabbixPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            {zabbix.testResult && (
              <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${zabbix.testResult.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                {zabbix.testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {zabbix.testResult.ok ? `Conectado — v${zabbix.testResult.version}` : zabbix.testResult.error ?? "Falha na conexão."}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleZabbixTest}
              disabled={zabbix.testing || (!zabbixForm.url && !zabbixEditing)}>
              {zabbix.testing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Wifi className="w-4 h-4 mr-1" />}
              Testar
            </Button>
            <Button onClick={handleZabbixSave} disabled={zabbix.isCreating || zabbix.isUpdating || !zabbixForm.name}>
              {(zabbix.isCreating || zabbix.isUpdating) ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── INVITE USER DIALOG ─── */}
      <Dialog open={inviteOpen} onOpenChange={(o) => !inviting && setInviteOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Novo Usuário</DialogTitle>
            <DialogDescription>
              O usuário será criado e adicionado à sua organização com a role selecionada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">E-mail *</Label>
              <Input type="email" value={inviteForm.email}
                onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="usuario@empresa.com" className="bg-muted/50 border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Nome de exibição</Label>
              <Input value={inviteForm.display_name}
                onChange={(e) => setInviteForm((f) => ({ ...f, display_name: e.target.value }))}
                placeholder="João Silva" className="bg-muted/50 border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Role *</Label>
              <Select value={inviteForm.role} onValueChange={(v) => setInviteForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger className="bg-muted/50 border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteOpen(false)} disabled={inviting}>Cancelar</Button>
            <Button onClick={handleInviteUser} disabled={inviting || !inviteForm.email.trim()}>
              {inviting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
