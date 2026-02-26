import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Search, Plus, Pencil, Shield, Server, Map,
  Activity, Calendar, Globe, Settings2, Users, ImageIcon,
  Database, Eye, EyeOff, Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

/* ── types ── */
interface Tenant {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

interface TenantStats {
  hosts: number;
  maps: number;
  users: number;
  dashboards: number;
  lastActivity: string | null;
}

type PlanLabel = "trial" | "enterprise" | "pro";

const PLAN_COLORS: Record<PlanLabel, string> = {
  trial: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  enterprise: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  pro: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
};

/* ═══════════════════════════════════════════════ */
export default function TenantsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [editDialog, setEditDialog] = useState(false);
  const [createDialog, setCreateDialog] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deletingTenantId, setDeletingTenantId] = useState<string | null>(null);
  const [deleteConfirmSlug, setDeleteConfirmSlug] = useState("");

  /* ── queries ── */
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["tenants-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Tenant[];
    },
  });

  const selectedTenant = tenants.find(t => t.id === selectedTenantId);

  const { data: stats } = useQuery({
    queryKey: ["tenant-stats", selectedTenantId],
    enabled: !!selectedTenantId,
    queryFn: async () => {
      const tid = selectedTenantId!;
      const [hostsRes, mapsRes, usersRes, dashRes] = await Promise.all([
        supabase.from("flow_map_hosts").select("id", { count: "exact", head: true }).eq("tenant_id", tid),
        supabase.from("flow_maps").select("id", { count: "exact", head: true }).eq("tenant_id", tid),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("tenant_id", tid),
        supabase.from("dashboards").select("id", { count: "exact", head: true }).eq("tenant_id", tid),
      ]);

      // Last activity from audit
      const { data: auditRows } = await supabase
        .from("audit_logs")
        .select("created_at")
        .eq("tenant_id", tid)
        .order("created_at", { ascending: false })
        .limit(1);

      return {
        hosts: hostsRes.count ?? 0,
        maps: mapsRes.count ?? 0,
        users: usersRes.count ?? 0,
        dashboards: dashRes.count ?? 0,
        lastActivity: auditRows?.[0]?.created_at ?? null,
      } as TenantStats;
    },
  });

  /* ── mutations ── */
  const updateTenant = useMutation({
    mutationFn: async ({ id, name, slug }: { id: string; name: string; slug: string }) => {
      const { error } = await supabase.from("tenants").update({ name, slug }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenants-admin"] });
      toast({ title: "Organização atualizada" });
      setEditDialog(false);
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const createTenant = useMutation({
    mutationFn: async ({ name, slug }: { name: string; slug: string }) => {
      const { error } = await supabase.from("tenants").insert({ name, slug });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenants-admin"] });
      toast({ title: "Organização criada" });
      setCreateDialog(false);
      setNewName("");
      setNewSlug("");
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteTenant = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tenants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenants-admin"] });
      toast({ title: "Organização excluída" });
      setDeleteDialog(false);
      setDeletingTenantId(null);
      setDeleteConfirmSlug("");
      if (selectedTenantId === deletingTenantId) setSelectedTenantId(null);
    },
    onError: (e: Error) => toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" }),
  });

  /* ── filter ── */
  const q = search.toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return tenants;
    return tenants.filter(t => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q));
  }, [tenants, q]);

  const openEdit = (t: Tenant) => {
    setEditName(t.name);
    setEditSlug(t.slug);
    setSelectedTenantId(t.id);
    setEditDialog(true);
  };

  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            Gerenciamento de Organizações
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Administração de tenants, planos e configurações globais</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setCreateDialog(true)}>
          <Plus className="w-3.5 h-3.5" /> Nova Organização
        </Button>
      </div>

      {/* Scorecards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Building2 className="w-4 h-4" />} label="Organizações" value={tenants.length} color="text-primary" />
        <StatCard icon={<Users className="w-4 h-4" />} label="Total Tenants" value={tenants.length} color="text-cyan-400" />
        <StatCard icon={<Shield className="w-4 h-4" />} label="Acesso" value="Admin" color="text-amber-400" isText />
        <StatCard icon={<Globe className="w-4 h-4" />} label="Multi-tenant" value="Ativo" color="text-emerald-400" isText />
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar organização..." className="pl-8 h-8 text-xs" />
      </div>

      {/* Main: Table + Detail drawer */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Table */}
        <div className="flex-1 min-h-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <ScrollArea className="h-[calc(100vh-320px)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Nome</TableHead>
                    <TableHead className="text-xs">Slug</TableHead>
                    <TableHead className="text-xs">Criado em</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs w-[120px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">
                        Nenhuma organização encontrada
                      </TableCell>
                    </TableRow>
                  ) : filtered.map(t => (
                    <TableRow
                      key={t.id}
                      className={`cursor-pointer ${selectedTenantId === t.id ? "bg-muted/50" : ""}`}
                      onClick={() => setSelectedTenantId(t.id)}
                    >
                      <TableCell className="text-xs font-medium">{t.name}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{t.slug}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(t.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">Ativo</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={e => { e.stopPropagation(); openEdit(t); }} title="Editar">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={e => { e.stopPropagation(); setSelectedTenantId(t.id); }} title="Detalhes">
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={e => { e.stopPropagation(); setDeletingTenantId(t.id); setDeleteConfirmSlug(""); setDeleteDialog(true); }} title="Excluir">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>

        {/* Detail panel */}
        {selectedTenant && (
          <Card className="w-80 flex-shrink-0 border-border/50">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                {selectedTenant.name}
              </CardTitle>
              <p className="text-[10px] font-mono text-muted-foreground">{selectedTenant.slug}</p>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-4">
              <Separator />

              {/* Stats */}
              <div className="space-y-2">
                <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Estatísticas</h4>
                <div className="grid grid-cols-2 gap-2">
                  <MiniStat icon={<Server className="w-3 h-3" />} label="Hosts" value={stats?.hosts ?? "..."} />
                  <MiniStat icon={<Map className="w-3 h-3" />} label="Mapas" value={stats?.maps ?? "..."} />
                  <MiniStat icon={<Users className="w-3 h-3" />} label="Usuários" value={stats?.users ?? "..."} />
                  <MiniStat icon={<Settings2 className="w-3 h-3" />} label="Dashboards" value={stats?.dashboards ?? "..."} />
                </div>
              </div>

              {/* Last activity */}
              <div className="space-y-1">
                <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Última Atividade</h4>
                <p className="text-xs text-muted-foreground font-mono">
                  {stats?.lastActivity
                    ? format(new Date(stats.lastActivity), "dd/MM/yyyy HH:mm", { locale: ptBR })
                    : "Sem registro"}
                </p>
              </div>

              <Separator />

              {/* Config placeholders */}
              <div className="space-y-2">
                <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Configurações</h4>

                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground">Logo URL</Label>
                  <Input placeholder="https://..." className="h-7 text-xs" disabled />
                  <p className="text-[9px] text-muted-foreground">Aparecerá no dashboard da organização</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground">Retenção de Dados</Label>
                  <Select defaultValue="90" disabled>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 dias</SelectItem>
                      <SelectItem value="60">60 dias</SelectItem>
                      <SelectItem value="90">90 dias</SelectItem>
                      <SelectItem value="180">180 dias</SelectItem>
                      <SelectItem value="365">365 dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 text-xs gap-1" onClick={() => openEdit(selectedTenant)}>
                  <Pencil className="w-3 h-3" /> Editar
                </Button>
              </div>

              <p className="text-[9px] text-muted-foreground font-mono">ID: {selectedTenant.id}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Organização</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Slug</Label>
              <Input value={editSlug} onChange={e => setEditSlug(slugify(e.target.value))} className="h-9 text-sm font-mono" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>Cancelar</Button>
            <Button
              disabled={!editName.trim() || !editSlug.trim() || updateTenant.isPending}
              onClick={() => selectedTenantId && updateTenant.mutate({ id: selectedTenantId, name: editName.trim(), slug: editSlug.trim() })}
            >
              {updateTenant.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Organização</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome da Empresa</Label>
              <Input
                value={newName}
                onChange={e => {
                  setNewName(e.target.value);
                  setNewSlug(slugify(e.target.value));
                }}
                placeholder="Ex: Minha Operadora"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Slug</Label>
              <Input value={newSlug} onChange={e => setNewSlug(slugify(e.target.value))} className="h-9 text-sm font-mono" placeholder="minha-operadora" />
              <p className="text-[9px] text-muted-foreground">Identificador único (gerado automaticamente)</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)}>Cancelar</Button>
            <Button
              disabled={!newName.trim() || !newSlug.trim() || createTenant.isPending}
              onClick={() => createTenant.mutate({ name: newName.trim(), slug: newSlug.trim() })}
            >
              {createTenant.isPending ? "Criando..." : "Criar Organização"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Excluir Organização</DialogTitle>
          </DialogHeader>
          {(() => {
            const t = tenants.find(x => x.id === deletingTenantId);
            if (!t) return null;
            return (
              <div className="space-y-3 py-2">
                <p className="text-sm text-muted-foreground">
                  Esta ação é <strong>irreversível</strong>. Todos os dados da organização <strong>{t.name}</strong> serão permanentemente excluídos.
                </p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Digite <span className="font-mono font-bold text-foreground">{t.slug}</span> para confirmar</Label>
                  <Input value={deleteConfirmSlug} onChange={e => setDeleteConfirmSlug(e.target.value)} className="h-9 text-sm font-mono" placeholder={t.slug} />
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteConfirmSlug !== tenants.find(x => x.id === deletingTenantId)?.slug || deleteTenant.isPending}
              onClick={() => deletingTenantId && deleteTenant.mutate(deletingTenantId)}
            >
              {deleteTenant.isPending ? "Excluindo..." : "Excluir Permanentemente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── sub-components ── */
function StatCard({ icon, label, value, color, isText }: { icon: React.ReactNode; label: string; value: number | string; color: string; isText?: boolean }) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className={color}>{icon}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
        </div>
        <p className="text-xl font-display font-bold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="flex items-center gap-1.5 p-2 rounded-md bg-muted/30 border border-border/30">
      <span className="text-muted-foreground">{icon}</span>
      <div>
        <p className="text-[9px] text-muted-foreground">{label}</p>
        <p className="text-xs font-bold font-mono text-foreground">{value}</p>
      </div>
    </div>
  );
}
