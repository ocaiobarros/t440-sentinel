import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Plus, Trash2, Pencil, Loader2, Users, UserPlus, X, Save, Search,
} from "lucide-react";

interface Team {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  color: string;
  created_at: string;
}

interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
}

interface Profile {
  id: string;
  display_name: string | null;
  email: string | null;
}

interface Props {
  tenantId: string | null;
  profiles: Profile[];
}

export default function TeamsPanel({ tenantId, profiles }: Props) {
  const { toast } = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [form, setForm] = useState({ name: "", description: "", color: "#10b981" });
  const [saving, setSaving] = useState(false);

  // Members dialog
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [memberSearch, setMemberSearch] = useState("");

  const fetchTeams = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      // Try edge function first (bypasses RLS for cross-tenant Super Admin access)
      const { data: efData, error: efErr } = await supabase.functions.invoke("tenant-admin", {
        body: { action: "tenant_teams", tenant_id: tenantId },
      });

      if (!efErr && !efData?.error && efData?.teams) {
        setTeams((efData.teams as Team[]) ?? []);
        setMembers((efData.members as TeamMember[]) ?? []);
      } else {
        // Fallback to direct query (works when JWT tenant matches)
        const [teamsRes, membersRes] = await Promise.all([
          supabase.from("teams").select("*").eq("tenant_id", tenantId).order("name"),
          supabase.from("team_members").select("*").eq("tenant_id", tenantId),
        ]);
        setTeams((teamsRes.data as Team[]) ?? []);
        setMembers((membersRes.data as TeamMember[]) ?? []);
      }
    } catch {
      // Fallback to direct query
      const [teamsRes, membersRes] = await Promise.all([
        supabase.from("teams").select("*").eq("tenant_id", tenantId).order("name"),
        supabase.from("team_members").select("*").eq("tenant_id", tenantId),
      ]);
      setTeams((teamsRes.data as Team[]) ?? []);
      setMembers((membersRes.data as TeamMember[]) ?? []);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchTeams(); }, [fetchTeams]);

  const openCreate = () => {
    setEditingTeam(null);
    setForm({ name: "", description: "", color: "#10b981" });
    setDialogOpen(true);
  };

  const openEdit = (t: Team) => {
    setEditingTeam(t);
    setForm({ name: t.name, description: t.description, color: t.color });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !tenantId) return;
    setSaving(true);
    try {
      if (editingTeam) {
        const { error } = await supabase.from("teams").update({
          name: form.name.trim(),
          description: form.description.trim(),
          color: form.color,
        }).eq("id", editingTeam.id);
        if (error) throw error;
        toast({ title: "Time atualizado" });
      } else {
        const { error } = await supabase.from("teams").insert({
          tenant_id: tenantId,
          name: form.name.trim(),
          description: form.description.trim(),
          color: form.color,
        });
        if (error) throw error;
        toast({ title: "Time criado", description: `"${form.name.trim()}" foi criado.` });
      }
      setDialogOpen(false);
      await fetchTeams();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (teamId: string) => {
    try {
      const { error } = await supabase.from("teams").delete().eq("id", teamId);
      if (error) throw error;
      toast({ title: "Time excluído" });
      await fetchTeams();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    }
  };

  const openMembers = (t: Team) => {
    setSelectedTeam(t);
    setMemberSearch("");
    setMembersDialogOpen(true);
  };

  const teamMembers = (teamId: string) => members.filter((m) => m.team_id === teamId);

  const addMember = async (userId: string) => {
    if (!selectedTeam || !tenantId) return;
    try {
      const { error } = await supabase.from("team_members").insert({
        tenant_id: tenantId,
        team_id: selectedTeam.id,
        user_id: userId,
      });
      if (error) throw error;
      toast({ title: "Membro adicionado" });
      await fetchTeams();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    }
  };

  const removeMember = async (memberId: string) => {
    try {
      const { error } = await supabase.from("team_members").delete().eq("id", memberId);
      if (error) throw error;
      toast({ title: "Membro removido" });
      await fetchTeams();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    }
  };

  const getProfile = (userId: string) => profiles.find((p) => p.id === userId);

  const currentTeamMemberIds = selectedTeam ? teamMembers(selectedTeam.id).map((m) => m.user_id) : [];
  const availableProfiles = profiles.filter((p) =>
    !currentTeamMemberIds.includes(p.id) &&
    (memberSearch === "" ||
      p.display_name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
      p.email?.toLowerCase().includes(memberSearch.toLowerCase()))
  );

  if (!tenantId) {
    return <p className="text-sm text-muted-foreground p-6">Selecione uma organização primeiro.</p>;
  }

  const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

  return (
    <section className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="text-base font-bold font-[Orbitron] tracking-wide text-foreground">
            TIMES ({teams.length})
          </h2>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> Novo Time
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : teams.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum time criado ainda.</p>
          <p className="text-xs text-muted-foreground mt-1">Crie times para organizar o acesso aos recursos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((t) => {
            const mems = teamMembers(t.id);
            return (
              <div key={t.id} className="rounded-lg border border-border bg-muted/20 p-4 hover:border-primary/30 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                    <h3 className="text-sm font-bold text-foreground">{t.name}</h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)} title="Editar">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(t.id)} title="Excluir">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                {t.description && <p className="text-xs text-muted-foreground mb-3">{t.description}</p>}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {mems.length} membro{mems.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => openMembers(t)}>
                    <UserPlus className="w-3 h-3" /> Gerenciar
                  </Button>
                </div>
                {mems.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {mems.slice(0, 5).map((m) => {
                      const p = getProfile(m.user_id);
                      return (
                        <div key={m.id} className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[9px] font-bold text-primary" title={p?.display_name ?? p?.email ?? ""}>
                          {(p?.display_name?.[0] ?? "?").toUpperCase()}
                        </div>
                      );
                    })}
                    {mems.length > 5 && <span className="text-[10px] text-muted-foreground self-center">+{mems.length - 5}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTeam ? "Editar Time" : "Novo Time"}</DialogTitle>
            <DialogDescription>
              {editingTeam ? "Atualize as informações do time." : "Crie um novo time dentro da organização."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Nome do Time</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Suporte, Rede, Comercial" className="bg-muted/50 border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Descrição</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Descrição opcional" className="bg-muted/50 border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Cor</Label>
              <div className="flex items-center gap-2">
                {COLORS.map((c) => (
                  <button key={c} className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }} onClick={() => setForm((f) => ({ ...f, color: c }))} />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
              {editingTeam ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members Dialog */}
      <Dialog open={membersDialogOpen} onOpenChange={setMembersDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedTeam && <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedTeam.color }} />}
              Membros — {selectedTeam?.name}
            </DialogTitle>
            <DialogDescription>Adicione ou remova membros deste time.</DialogDescription>
          </DialogHeader>

          {/* Current members */}
          <div className="space-y-2 max-h-40 overflow-y-auto">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Membros atuais</p>
            {selectedTeam && teamMembers(selectedTeam.id).length === 0 && (
              <p className="text-xs text-muted-foreground italic">Nenhum membro neste time.</p>
            )}
            {selectedTeam && teamMembers(selectedTeam.id).map((m) => {
              const p = getProfile(m.user_id);
              return (
                <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/30 border border-border/50">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                      {(p?.display_name?.[0] ?? "?").toUpperCase()}
                    </div>
                    <span className="text-sm text-foreground">{p?.display_name ?? p?.email ?? "—"}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={() => removeMember(m.id)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Add members */}
          <div className="space-y-2 mt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Adicionar membros</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="Buscar usuário..." value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)} className="pl-9 bg-muted/50 border-border text-sm h-8" />
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {availableProfiles.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => addMember(p.id)}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-muted/50 border border-border flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                      {(p.display_name?.[0] ?? "?").toUpperCase()}
                    </div>
                    <div>
                      <span className="text-sm text-foreground">{p.display_name ?? "Sem nome"}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">{p.email}</span>
                    </div>
                  </div>
                  <UserPlus className="w-3.5 h-3.5 text-primary" />
                </div>
              ))}
              {availableProfiles.length === 0 && (
                <p className="text-xs text-muted-foreground italic py-2 text-center">Nenhum usuário disponível.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
