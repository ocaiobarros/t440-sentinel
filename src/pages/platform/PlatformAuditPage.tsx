import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileSearch, Search, Clock, User, ChevronRight } from "lucide-react";
import { format } from "date-fns";

interface AuditLog {
  id: string;
  tenant_id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export default function PlatformAuditPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Fetch tenants for name resolution
  const { data: tenantMap = {} } = useQuery({
    queryKey: ["platform-audit-tenants"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("tenant-admin", { body: { action: "list" } });
      const tenants = (data?.tenants ?? []) as { id: string; name: string }[];
      return Object.fromEntries(tenants.map((t) => [t.id, t.name]));
    },
  });

  // Fetch all audit logs across tenants (platform admin uses service role via edge function)
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["platform-audit-logs", actionFilter],
    queryFn: async () => {
      // Platform admins can see all audit logs thanks to is_super_admin() in RLS
      let query = supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (actionFilter !== "all") {
        query = query.eq("action", actionFilter);
      }

      const { data, error } = await query;
      if (error) {
        console.warn("[PlatformAuditPage] Error:", error.message);
        return [];
      }
      return (data ?? []) as AuditLog[];
    },
  });

  const { data: profileMap = {} } = useQuery({
    queryKey: ["platform-audit-profiles"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("tenant-admin", { body: { action: "members" } });
      const profiles = (data?.profiles ?? []) as { id: string; display_name: string | null; email: string | null }[];
      return Object.fromEntries(profiles.map((p) => [p.id, p.display_name ?? p.email ?? p.id.slice(0, 8)]));
    },
  });

  const uniqueActions = [...new Set(logs.map((l) => l.action))].sort();

  const filtered = logs.filter((log) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      log.action.toLowerCase().includes(term) ||
      (log.entity_type ?? "").toLowerCase().includes(term) ||
      JSON.stringify(log.details ?? {}).toLowerCase().includes(term) ||
      (tenantMap[log.tenant_id] ?? "").toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground font-[Orbitron] tracking-wide">Platform Audit Logs</h2>
        <p className="text-sm text-muted-foreground mt-1">Trilha de auditoria cross-tenant da plataforma.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar em logs..."
            className="pl-9 bg-muted/50 border-border"
          />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-48 bg-muted/50 border-border">
            <SelectValue placeholder="Ação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as ações</SelectItem>
            {uniqueActions.map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileSearch className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhum log encontrado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((log) => (
            <button
              key={log.id}
              onClick={() => setSelectedLog(log)}
              className="w-full text-left rounded-lg border border-border bg-card/60 p-4 hover:bg-muted/40 transition-colors flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px] font-mono">{log.action}</Badge>
                  {log.entity_type && <Badge variant="secondary" className="text-[10px]">{log.entity_type}</Badge>}
                  <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                    {tenantMap[log.tenant_id] ?? log.tenant_id.slice(0, 8)}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {format(new Date(log.created_at), "dd/MM HH:mm:ss")}
                  </span>
                  {log.user_id && (
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {profileMap[log.user_id] ?? log.user_id.slice(0, 8)}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Detail Drawer */}
      <Sheet open={!!selectedLog} onOpenChange={(o) => !o && setSelectedLog(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-[Orbitron] tracking-wide">Detalhes do Evento</SheetTitle>
          </SheetHeader>
          {selectedLog && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Ação</p>
                  <Badge variant="outline" className="font-mono">{selectedLog.action}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Organização</p>
                  <p className="text-foreground font-medium">{tenantMap[selectedLog.tenant_id] ?? selectedLog.tenant_id.slice(0, 8)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Ator</p>
                  <p className="text-foreground">{selectedLog.user_id ? (profileMap[selectedLog.user_id] ?? selectedLog.user_id.slice(0, 8)) : "Sistema"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Data/Hora</p>
                  <p className="text-foreground font-mono text-xs">{format(new Date(selectedLog.created_at), "dd/MM/yyyy HH:mm:ss")}</p>
                </div>
                {selectedLog.entity_type && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Tipo do Alvo</p>
                    <p className="text-foreground">{selectedLog.entity_type}</p>
                  </div>
                )}
                {selectedLog.entity_id && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">ID do Alvo</p>
                    <p className="text-foreground font-mono text-xs">{selectedLog.entity_id}</p>
                  </div>
                )}
              </div>
              {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Metadata</p>
                  <pre className="text-xs bg-muted/50 rounded-lg p-3 overflow-x-auto text-foreground font-mono">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
