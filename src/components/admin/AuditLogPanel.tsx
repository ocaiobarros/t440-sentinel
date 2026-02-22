import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  RefreshCw,
  MapPin,
  Cable,
  Bookmark,
  ArrowRight,
  User,
  Clock,
  CalendarDays,
} from "lucide-react";

interface AuditLogEntry {
  id: string;
  tenant_id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
}

const TABLE_LABELS: Record<string, { label: string; icon: typeof MapPin }> = {
  flow_map_ctos: { label: "CTO", icon: MapPin },
  flow_map_cables: { label: "Cabo", icon: Cable },
  flow_map_reservas: { label: "Reserva", icon: Bookmark },
  flow_map_hosts: { label: "Host", icon: MapPin },
  flow_map_links: { label: "Link", icon: Cable },
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  INSERT: { label: "Criou", color: "text-green-500 bg-green-500/10 border-green-500/30" },
  UPDATE: { label: "Alterou", color: "text-amber-500 bg-amber-500/10 border-amber-500/30" },
  DELETE: { label: "Removeu", color: "text-destructive bg-destructive/10 border-destructive/30" },
};

function formatFieldChange(key: string, oldVal: unknown, newVal: unknown): string | null {
  if (oldVal === newVal) return null;
  if (key === "updated_at" || key === "created_at") return null;

  const format = (v: unknown) => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "number") return Number.isInteger(v) ? String(v) : Number(v).toFixed(2);
    if (typeof v === "object") return JSON.stringify(v).slice(0, 60);
    return String(v).slice(0, 60);
  };

  return `${key}: ${format(oldVal)} → ${format(newVal)}`;
}

function getChangedFields(oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null): string[] {
  if (!oldData || !newData) return [];
  const changes: string[] = [];
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  for (const key of allKeys) {
    const result = formatFieldChange(key, oldData[key], newData[key]);
    if (result) changes.push(result);
  }
  return changes.slice(0, 5);
}

function getRecordName(data: Record<string, unknown> | null): string {
  if (!data) return "";
  return String(data.name ?? data.label ?? data.host_name ?? "").slice(0, 40);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function AuditLogPanel() {
  const [tableFilter, setTableFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("7d");
  const [searchTerm, setSearchTerm] = useState("");

  const periodStart = useMemo(() => {
    const now = new Date();
    switch (periodFilter) {
      case "1h": return new Date(now.getTime() - 3600_000).toISOString();
      case "24h": return new Date(now.getTime() - 86400_000).toISOString();
      case "7d": return new Date(now.getTime() - 7 * 86400_000).toISOString();
      case "30d": return new Date(now.getTime() - 30 * 86400_000).toISOString();
      default: return new Date(now.getTime() - 7 * 86400_000).toISOString();
    }
  }, [periodFilter]);

  const { data: logs, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["audit-logs", tableFilter, actionFilter, periodFilter],
    queryFn: async () => {
      let query = supabase
        .from("flow_audit_logs")
        .select("*")
        .gte("created_at", periodStart)
        .order("created_at", { ascending: false })
        .limit(200);

      if (tableFilter !== "all") query = query.eq("table_name", tableFilter);
      if (actionFilter !== "all") query = query.eq("action", actionFilter);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AuditLogEntry[];
    },
    refetchInterval: 30_000,
  });

  const uniqueUsers = useMemo(() => {
    const emails = new Set<string>();
    (logs ?? []).forEach((l) => { if (l.user_email) emails.add(l.user_email); });
    return Array.from(emails).sort();
  }, [logs]);

  const filtered = (logs ?? []).filter((log) => {
    if (userFilter !== "all" && log.user_email !== userFilter) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      log.user_email?.toLowerCase().includes(term) ||
      getRecordName(log.new_data ?? log.old_data).toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por usuário ou recurso..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-muted/50 border-border text-sm h-9"
          />
        </div>
        <Select value={tableFilter} onValueChange={setTableFilter}>
          <SelectTrigger className="w-36 h-9 bg-muted/50 border-border text-xs">
            <SelectValue placeholder="Tabela" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas tabelas</SelectItem>
            <SelectItem value="flow_map_ctos">CTOs</SelectItem>
            <SelectItem value="flow_map_cables">Cabos</SelectItem>
            <SelectItem value="flow_map_reservas">Reservas</SelectItem>
            <SelectItem value="flow_map_hosts">Hosts</SelectItem>
            <SelectItem value="flow_map_links">Links</SelectItem>
          </SelectContent>
        </Select>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-32 h-9 bg-muted/50 border-border text-xs">
            <SelectValue placeholder="Ação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas ações</SelectItem>
            <SelectItem value="INSERT">Criação</SelectItem>
            <SelectItem value="UPDATE">Alteração</SelectItem>
            <SelectItem value="DELETE">Remoção</SelectItem>
          </SelectContent>
        </Select>
        <Select value={userFilter} onValueChange={setUserFilter}>
          <SelectTrigger className="w-44 h-9 bg-muted/50 border-border text-xs">
            <SelectValue placeholder="Usuário" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos usuários</SelectItem>
            {uniqueUsers.map((email) => (
              <SelectItem key={email} value={email}>{email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="w-28 h-9 bg-muted/50 border-border text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">Última hora</SelectItem>
            <SelectItem value="24h">24 horas</SelectItem>
            <SelectItem value="7d">7 dias</SelectItem>
            <SelectItem value="30d">30 dias</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Log entries */}
      <ScrollArea className="h-[500px]">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Search className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">Nenhum log encontrado</p>
            <p className="text-xs mt-1">Ações no FlowMap aparecerão aqui automaticamente.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((log) => {
              const tableInfo = TABLE_LABELS[log.table_name] ?? { label: log.table_name, icon: MapPin };
              const actionInfo = ACTION_LABELS[log.action] ?? { label: log.action, color: "text-muted-foreground" };
              const TableIcon = tableInfo.icon;
              const recordName = getRecordName(log.new_data ?? log.old_data);
              const changes = log.action === "UPDATE" ? getChangedFields(log.old_data, log.new_data) : [];

              return (
                <div
                  key={log.id}
                  className="rounded-lg border border-border bg-card/40 px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {/* Icon */}
                      <div className="w-8 h-8 rounded-lg bg-muted/50 border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
                        <TableIcon className="w-4 h-4 text-muted-foreground" />
                      </div>

                      <div className="min-w-0 flex-1">
                        {/* Header row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={`text-[10px] ${actionInfo.color}`}>
                            {actionInfo.label}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {tableInfo.label}
                          </Badge>
                          {recordName && (
                            <span className="text-xs font-medium text-foreground truncate">
                              {recordName}
                            </span>
                          )}
                        </div>

                        {/* User */}
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <User className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground font-mono">
                            {log.user_email ?? "sistema"}
                          </span>
                        </div>

                        {/* Changes (UPDATE only) */}
                        {changes.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {changes.map((change, i) => (
                              <div key={i} className="flex items-center gap-1.5 text-[11px]">
                                <ArrowRight className="w-3 h-3 text-amber-500 flex-shrink-0" />
                                <span className="text-muted-foreground font-mono truncate">
                                  {change}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* INSERT summary */}
                        {log.action === "INSERT" && recordName && (
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Recurso <span className="text-foreground font-medium">{recordName}</span> criado
                          </p>
                        )}

                        {/* DELETE summary */}
                        {log.action === "DELETE" && recordName && (
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Recurso <span className="text-foreground font-medium">{recordName}</span> removido
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Timestamp */}
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground flex-shrink-0">
                      <Clock className="w-3 h-3" />
                      <span title={new Date(log.created_at).toLocaleString("pt-BR")}>
                        {timeAgo(log.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
