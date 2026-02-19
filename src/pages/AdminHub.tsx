import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  // Team editing
  const [editingTeam, setEditingTeam] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [savingTeam, setSavingTeam] = useState(false);

  // Role change
  const [changingRole, setChangingRole] = useState<string | null>(null);

  // Remove user dialog
  const [removeDialog, setRemoveDialog] = useState<{ open: boolean; userId: string; name: string }>({
    open: false,
    userId: "",
    name: "",
  });
  const [removing, setRemoving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Check if current user is admin
      const { data: myRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!myRole || myRole.role !== "admin") {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      setIsAdmin(true);

      // Fetch tenant, profiles, and roles in parallel
      const [tenantRes, profilesRes, rolesRes] = await Promise.all([
        supabase.from("tenants").select("*").single(),
        supabase.from("profiles").select("*").order("created_at", { ascending: true }),
        supabase.from("user_roles").select("*"),
      ]);

      if (tenantRes.data) {
        setTenant(tenantRes.data);
        setTeamName(tenantRes.data.name);
      }
      if (profilesRes.data) setProfiles(profilesRes.data);
      if (rolesRes.data) setRoles(rolesRes.data as UserRole[]);
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Falha ao carregar dados." });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getRoleForUser = (userId: string) => {
    const r = roles.find((r) => r.user_id === userId);
    return r?.role ?? "viewer";
  };

  const getRoleBadgeVariant = (role: string) => {
    if (role === "admin") return "default";
    if (role === "editor") return "secondary";
    return "outline";
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    setChangingRole(userId);
    try {
      const existing = roles.find((r) => r.user_id === userId);
      if (existing) {
        const { error } = await supabase
          .from("user_roles")
          .update({ role: newRole as "admin" | "editor" | "viewer" })
          .eq("id", existing.id);
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
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", removeDialog.userId)
        .eq("tenant_id", tenant?.id ?? "");
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
      const { error } = await supabase
        .from("tenants")
        .update({ name: teamName.trim() })
        .eq("id", tenant.id);
      if (error) throw error;
      toast({ title: "Time atualizado", description: "Nome da organização salvo." });
      setEditingTeam(false);
      await fetchData();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro", description: err.message || "Falha ao salvar." });
    } finally {
      setSavingTeam(false);
    }
  };

  const filteredProfiles = profiles.filter((p) => {
    const term = search.toLowerCase();
    return (
      (p.display_name?.toLowerCase().includes(term) ?? false) ||
      (p.email?.toLowerCase().includes(term) ?? false)
    );
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
              <h1 className="text-lg font-bold font-[Orbitron] tracking-wider text-foreground">
                ADMIN HUB
              </h1>
              <p className="text-xs text-muted-foreground font-mono">
                FLOWPULSE INTELLIGENCE — Gerenciamento
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <>
            {/* ─── TEAM SECTION ─── */}
            <section className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Building2 className="w-5 h-5 text-primary" />
                  <h2 className="text-base font-bold font-[Orbitron] tracking-wide text-foreground">
                    ORGANIZAÇÃO
                  </h2>
                </div>
                {!editingTeam && (
                  <Button variant="ghost" size="sm" onClick={() => setEditingTeam(true)}>
                    <Pencil className="w-4 h-4 mr-1" /> Editar
                  </Button>
                )}
              </div>

              {editingTeam ? (
                <div className="flex items-center gap-3">
                  <Input
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="Nome da organização"
                    className="max-w-sm bg-muted/50 border-border"
                  />
                  <Button onClick={handleSaveTeam} disabled={savingTeam} size="sm">
                    {savingTeam ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                    Salvar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setEditingTeam(false); setTeamName(tenant?.name ?? ""); }}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Nome</p>
                    <p className="text-sm font-medium text-foreground">{tenant?.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Slug</p>
                    <p className="text-sm font-mono text-muted-foreground">{tenant?.slug}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Membros</p>
                    <p className="text-sm font-medium text-foreground">{profiles.length}</p>
                  </div>
                </div>
              )}
            </section>

            {/* ─── USERS SECTION ─── */}
            <section className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-primary" />
                  <h2 className="text-base font-bold font-[Orbitron] tracking-wide text-foreground">
                    USUÁRIOS ({filteredProfiles.length})
                  </h2>
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 bg-muted/50 border-border text-sm"
                  />
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
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() =>
                                  setRemoveDialog({
                                    open: true,
                                    userId: p.id,
                                    name: p.display_name ?? p.email ?? "usuário",
                                  })
                                }
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredProfiles.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                          Nenhum usuário encontrado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Remove confirmation dialog */}
      <Dialog open={removeDialog.open} onOpenChange={(o) => !removing && setRemoveDialog((s) => ({ ...s, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover acesso</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover <strong>{removeDialog.name}</strong> desta organização? O acesso será revogado imediatamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoveDialog({ open: false, userId: "", name: "" })} disabled={removing}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleRemoveUser} disabled={removing}>
              {removing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
