import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useResourceAccess } from "@/hooks/useResourceAccess";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Shield, UserPlus, Users, Trash2, Eye, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface AccessControlPanelProps {
  resourceType: string;
  resourceId: string | undefined;
  compact?: boolean;
}

interface TenantUser {
  id: string;
  display_name: string | null;
  email: string | null;
}

interface TenantTeam {
  id: string;
  name: string;
  color?: string;
}

function AccessControlContent({ resourceType, resourceId }: { resourceType: string; resourceId: string }) {
  const { tenantId: fallbackTenantId } = useUserRole();
  const { toast } = useToast();
  const [granteeType, setGranteeType] = useState<"user" | "team">("user");
  const [granteeId, setGranteeId] = useState("");
  const [accessLevel, setAccessLevel] = useState<"viewer" | "editor">("viewer");

  // Resolve tenant_id of the resource
  const { data: resourceTenantId = fallbackTenantId } = useQuery({
    queryKey: ["resource-tenant", resourceType, resourceId, fallbackTenantId],
    enabled: !!resourceId,
    queryFn: async () => {
      if (resourceType === "dashboard") {
        const { data, error } = await supabase
          .from("dashboards")
          .select("tenant_id")
          .eq("id", resourceId)
          .maybeSingle();
        if (error) throw error;
        return data?.tenant_id ?? fallbackTenantId;
      }
      if (resourceType === "flow_map") {
        const { data, error } = await supabase
          .from("flow_maps")
          .select("tenant_id")
          .eq("id", resourceId)
          .maybeSingle();
        if (error) throw error;
        return data?.tenant_id ?? fallbackTenantId;
      }
      return fallbackTenantId;
    },
  });

  // Load users and teams via edge function (bypasses RLS)
  const { data: tenantData, isLoading: tenantDataLoading } = useQuery({
    queryKey: ["tenant-users-teams", resourceTenantId],
    enabled: !!resourceTenantId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("tenant-admin", {
        body: { action: "tenant_users", tenant_id: resourceTenantId },
      });

      if (error || data?.error) {
        console.error("[AccessControlPanel] tenant_users error:", error || data?.error);
        // Fallback to direct query
        const [usersRes, teamsRes] = await Promise.all([
          supabase.from("profiles").select("id, display_name, email").eq("tenant_id", resourceTenantId!),
          supabase.from("teams").select("id, name, color").eq("tenant_id", resourceTenantId!),
        ]);
        return {
          users: (usersRes.data ?? []) as TenantUser[],
          teams: (teamsRes.data ?? []) as TenantTeam[],
        };
      }

      return {
        users: (data?.users ?? []) as TenantUser[],
        teams: (data?.teams ?? []) as TenantTeam[],
      };
    },
  });

  const users = tenantData?.users ?? [];
  const teams = tenantData?.teams ?? [];

  // Build name map from tenantData for grant name resolution
  const nameMap = useMemo(() => {
    const map: Record<string, string> = {};
    users.forEach((u) => {
      map[u.id] = u.display_name || u.email || u.id;
    });
    teams.forEach((t) => {
      map[t.id] = t.name;
    });
    return map;
  }, [users, teams]);

  // Filter out users without name AND email (phantom users)
  const validUsers = useMemo(
    () => users.filter((u) => u.display_name || u.email),
    [users],
  );

  const { grants, isLoading, addGrant, removeGrant, updateLevel } = useResourceAccess(
    resourceType,
    resourceId,
    nameMap,
  );

  const handleAdd = async () => {
    if (!granteeId) return;
    if (!resourceTenantId) {
      toast({ variant: "destructive", title: "Erro", description: "Tenant do recurso não identificado." });
      return;
    }
    try {
      await addGrant.mutateAsync({ grantee_type: granteeType, grantee_id: granteeId, access_level: accessLevel });
      toast({ title: "Acesso concedido" });
      setGranteeId("");
    } catch (e: any) {
      console.error("[AccessControlPanel] handleAdd error:", e);
      toast({ variant: "destructive", title: "Erro ao conceder acesso", description: e.message });
    }
  };

  const options = granteeType === "user" ? validUsers : teams;
  const alreadyGranted = new Set(grants.filter((g) => g.grantee_type === granteeType).map((g) => g.grantee_id));
  const available = options.filter((o) => !alreadyGranted.has(o.id));

  return (
    <div className="space-y-4">
      {/* Add grant form */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Select value={granteeType} onValueChange={(v) => { setGranteeType(v as "user" | "team"); setGranteeId(""); }}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user"><span className="flex items-center gap-1"><UserPlus className="w-3 h-3" /> Usuário</span></SelectItem>
              <SelectItem value="team"><span className="flex items-center gap-1"><Users className="w-3 h-3" /> Time</span></SelectItem>
            </SelectContent>
          </Select>

          <Select value={granteeId} onValueChange={setGranteeId}>
            <SelectTrigger className="flex-1 min-w-0">
              <SelectValue placeholder={granteeType === "user" ? "Selecione usuário..." : "Selecione time..."} />
            </SelectTrigger>
            <SelectContent>
              {available.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {"display_name" in o ? (o.display_name || o.email || o.id) : (o as TenantTeam).name}
                </SelectItem>
              ))}
              {available.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">Todos já têm acesso</div>
              )}
            </SelectContent>
          </Select>

          <Select value={accessLevel} onValueChange={(v) => setAccessLevel(v as "viewer" | "editor")}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer"><span className="flex items-center gap-1"><Eye className="w-3 h-3" /> Viewer</span></SelectItem>
              <SelectItem value="editor"><span className="flex items-center gap-1"><Pencil className="w-3 h-3" /> Editor</span></SelectItem>
            </SelectContent>
          </Select>

          <Button size="sm" onClick={handleAdd} disabled={!granteeId || addGrant.isPending || !resourceTenantId}>
            Conceder
          </Button>
        </div>
      </div>

      {/* Current grants */}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground font-medium">Acessos concedidos:</p>
        {isLoading && <p className="text-xs text-muted-foreground">Carregando...</p>}
        {!isLoading && grants.length === 0 && (
          <p className="text-xs text-muted-foreground italic">Nenhum acesso concedido. Somente admins e o criador podem ver este recurso.</p>
        )}
        {grants.map((g) => (
          <div key={g.id} className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-card/50 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              {g.grantee_type === "team" ? <Users className="w-3.5 h-3.5 text-primary shrink-0" /> : <UserPlus className="w-3.5 h-3.5 text-primary shrink-0" />}
              <span className="text-sm truncate">{g.grantee_name}</span>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {g.grantee_type === "team" ? "Time" : "Usuário"}
              </Badge>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Select
                value={g.access_level}
                onValueChange={(v) => updateLevel.mutate({ grantId: g.id, access_level: v as "viewer" | "editor" })}
              >
                <SelectTrigger className="h-7 w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeGrant.mutate(g.id)}>
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AccessControlPanel({ resourceType, resourceId, compact }: AccessControlPanelProps) {
  if (!resourceId) return null;

  if (compact) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Shield className="w-4 h-4" />
            Permissões
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Controle de Acesso
            </DialogTitle>
          </DialogHeader>
          <AccessControlContent resourceType={resourceType} resourceId={resourceId} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Shield className="w-4 h-4 text-primary" />
        Controle de Acesso
      </h3>
      <AccessControlContent resourceType={resourceType} resourceId={resourceId} />
    </div>
  );
}
