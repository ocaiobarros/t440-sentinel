import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import Fuse from "fuse.js";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Server, FolderTree, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface ZabbixItemBrowserProps {
  connectionId: string | null;
  selectedItemId?: string;
  onSelectItem: (item: { itemid: string; key_: string; name: string; lastvalue?: string; units?: string }) => void;
}

interface ZabbixGroup { groupid: string; name: string; }
interface ZabbixHost { hostid: string; host: string; name: string; }
interface ZabbixItem { itemid: string; key_: string; name: string; lastvalue?: string; units?: string; value_type?: string; }

async function zabbixProxy(connectionId: string, method: string, params: Record<string, unknown>) {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.access_token) throw new Error("Not authenticated");
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/zabbix-proxy`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.session.access_token}`,
      },
      body: JSON.stringify({ connection_id: connectionId, method, params }),
    },
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

async function zabbixProxyPaginated(connectionId: string, method: string, baseParams: Record<string, unknown>) {
  const pageSize = 500;
  let offset = 0;
  const allResults: unknown[] = [];
  while (true) {
    const result = await zabbixProxy(connectionId, method, { ...baseParams, limit: pageSize, offset });
    const items = (result as unknown[]) || [];
    allResults.push(...items);
    if (items.length < pageSize) break;
    offset += pageSize;
  }
  return allResults;
}

const FUSE_OPTIONS = { keys: ["name", "key_"], threshold: 0.4, ignoreLocation: true };

export default function ZabbixItemBrowser({ connectionId, selectedItemId, onSelectItem }: ZabbixItemBrowserProps) {
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedHost, setSelectedHost] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [showItems, setShowItems] = useState(true);
  const parentRef = useRef<HTMLDivElement>(null);

  // SWR cache for groups
  const { data: groups = [], isLoading: loadingGroups, error: groupsError } = useQuery({
    queryKey: ["zabbix-groups", connectionId],
    queryFn: () => zabbixProxyPaginated(connectionId!, "hostgroup.get", { output: ["groupid", "name"], sortfield: "name" }),
    enabled: !!connectionId,
    staleTime: 5 * 60 * 1000, // 5min SWR
    select: (d) => (d as ZabbixGroup[]) || [],
  });

  // SWR cache for hosts
  const { data: hosts = [], isLoading: loadingHosts } = useQuery({
    queryKey: ["zabbix-hosts", connectionId, selectedGroup],
    queryFn: () => zabbixProxyPaginated(connectionId!, "host.get", { output: ["hostid", "host", "name"], groupids: [selectedGroup], sortfield: "name" }),
    enabled: !!connectionId && !!selectedGroup,
    staleTime: 5 * 60 * 1000,
    select: (d) => (d as ZabbixHost[]) || [],
  });

  // SWR cache for items
  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ["zabbix-items", connectionId, selectedHost],
    queryFn: () => zabbixProxyPaginated(connectionId!, "item.get", { output: ["itemid", "key_", "name", "lastvalue", "units", "value_type"], hostids: [selectedHost], sortfield: "name" }),
    enabled: !!connectionId && !!selectedHost,
    staleTime: 5 * 60 * 1000,
    select: (d) => (d as ZabbixItem[]) || [],
  });

  // Reset downstream when parent changes
  useEffect(() => { setSelectedHost(""); }, [selectedGroup]);
  useEffect(() => { setShowItems(true); setItemSearch(""); }, [selectedHost]);

  // Fuzzy search
  const fuse = useMemo(() => new Fuse(items, FUSE_OPTIONS), [items]);
  const filteredItems = useMemo(() => {
    if (!itemSearch.trim()) return items;
    return fuse.search(itemSearch).map((r) => r.item);
  }, [fuse, items, itemSearch]);

  // Virtual scrolling
  const virtualizer = useVirtualizer({
    count: filteredItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 5,
  });

  const handleSelect = useCallback((item: ZabbixItem) => {
    onSelectItem(item);
    setShowItems(false);
  }, [onSelectItem]);

  const error = groupsError ? (groupsError as Error).message : null;

  if (!connectionId) {
    return (
      <div className="text-[9px] text-neon-amber p-2 border border-neon-amber/30 rounded-md bg-neon-amber/5">
        ⚠ Selecione uma conexão Zabbix nas configurações do dashboard primeiro.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-[9px] text-neon-red p-2 border border-neon-red/30 rounded-md bg-neon-red/5">{error}</div>
      )}

      {/* Host Group */}
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
          <FolderTree className="w-3 h-3" /> Grupo de Hosts
        </Label>
        <Select value={selectedGroup} onValueChange={setSelectedGroup} disabled={loadingGroups}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder={loadingGroups ? "Carregando…" : "Selecionar grupo"} />
          </SelectTrigger>
          <SelectContent>
            {groups.map((g) => (
              <SelectItem key={g.groupid} value={g.groupid} className="text-xs whitespace-nowrap">{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Host */}
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Server className="w-3 h-3" /> Host
        </Label>
        <Select value={selectedHost} onValueChange={setSelectedHost} disabled={!selectedGroup || loadingHosts}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder={loadingHosts ? "Carregando…" : "Selecionar host"} />
          </SelectTrigger>
          <SelectContent>
            {hosts.map((h) => (
              <SelectItem key={h.hostid} value={h.hostid} className="text-xs whitespace-nowrap">{h.name || h.host}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Items - Virtualized */}
      {selectedHost && showItems && (
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Activity className="w-3 h-3" /> Item ({filteredItems.length})
          </Label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Busca fuzzy…"
              className="h-7 text-xs pl-7"
            />
          </div>

          {loadingItems ? (
            <div className="space-y-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded bg-muted/30" />
              ))}
            </div>
          ) : (
            <div
              ref={parentRef}
              className="h-[400px] border border-border/30 rounded-md overflow-auto"
            >
              <div
                style={{ height: `${virtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}
              >
                {virtualizer.getVirtualItems().map((vRow) => {
                  const item = filteredItems[vRow.index];
                  return (
                    <button
                      key={item.itemid}
                      ref={virtualizer.measureElement}
                      data-index={vRow.index}
                      onClick={() => handleSelect(item)}
                      className={`absolute left-0 w-full text-left p-1.5 transition-all text-[9px] ${
                        selectedItemId === item.itemid
                          ? "bg-neon-green/15 border border-neon-green/40 text-neon-green"
                          : "hover:bg-accent/40 border border-transparent"
                      }`}
                      style={{
                        top: `${vRow.start}px`,
                        height: `${vRow.size}px`,
                      }}
                    >
                      <div className="font-medium whitespace-nowrap overflow-hidden text-ellipsis">{item.name}</div>
                      <div className="flex items-center justify-between text-muted-foreground mt-0.5 whitespace-nowrap">
                        <span className="font-mono overflow-hidden text-ellipsis max-w-[60%]">{item.key_}</span>
                        <span className="font-mono text-neon-green/70">
                          {item.lastvalue !== undefined ? `${item.lastvalue}${item.units || ""}` : "—"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {filteredItems.length === 0 && !loadingItems && (
                <p className="text-[9px] text-muted-foreground text-center py-3">Nenhum item encontrado</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
