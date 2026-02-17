import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import Fuse from "fuse.js";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Search, Server, FolderTree, Activity, ChevronDown, Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getNavCache, setNavCache } from "@/lib/metadata-cache";

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
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session.access_token}` },
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
const FUSE_NAME_OPTIONS = { keys: ["name"], threshold: 0.3, ignoreLocation: true };

// ── Virtualized Select Dropdown ──

function VirtualSelect<T extends { id: string; label: string }>({
  items,
  value,
  onChange,
  placeholder,
  isLoading,
  icon: Icon,
  label,
}: {
  items: T[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  isLoading: boolean;
  icon: React.ElementType;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fuse = useMemo(() => new Fuse(items, { keys: ["label"], threshold: 0.35, ignoreLocation: true }), [items]);
  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    return fuse.search(search).map((r) => r.item);
  }, [fuse, items, search]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 30,
    overscan: 10,
  });

  const selectedLabel = items.find((i) => i.id === value)?.label;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
        <Icon className="w-3 h-3" /> {label}
      </Label>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => { if (!isLoading) setOpen(!open); }}
          disabled={isLoading}
          className="flex items-center justify-between w-full h-7 px-2 text-xs border border-border/50 rounded-md bg-background hover:bg-accent/30 transition-colors disabled:opacity-50"
        >
          <span className={`truncate ${selectedLabel ? "text-foreground" : "text-muted-foreground"}`}>
            {isLoading ? "Carregando…" : selectedLabel || placeholder}
          </span>
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0 ml-1" />
        </button>

        {open && (
          <div className="absolute z-50 top-[calc(100%+4px)] left-0 w-full bg-popover border border-border rounded-md shadow-lg overflow-hidden" style={{ maxHeight: 280 }}>
            {/* Search inside dropdown */}
            <div className="p-1.5 border-b border-border/30">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filtrar…"
                  className="w-full h-6 text-[10px] pl-6 pr-2 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </div>

            <div ref={listRef} className="overflow-auto" style={{ maxHeight: 230 }}>
              {filtered.length === 0 ? (
                <p className="text-[9px] text-muted-foreground text-center py-3">Nenhum resultado</p>
              ) : (
                <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                  {virtualizer.getVirtualItems().map((vRow) => {
                    const item = filtered[vRow.index];
                    const isSelected = item.id === value;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`absolute left-0 w-full text-left px-2 py-1 text-[10px] flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                          isSelected ? "bg-primary/15 text-primary" : "hover:bg-accent/40 text-foreground"
                        }`}
                        style={{ top: vRow.start, height: vRow.size }}
                        onClick={() => { onChange(item.id); setOpen(false); setSearch(""); }}
                      >
                        {isSelected && <Check className="w-3 h-3 shrink-0" />}
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──

export default function ZabbixItemBrowser({ connectionId, selectedItemId, onSelectItem }: ZabbixItemBrowserProps) {
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedHost, setSelectedHost] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [showItems, setShowItems] = useState(true);
  const parentRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // ── Groups with IndexedDB SWR ──
  const groupsCacheKey = `groups:${connectionId}`;
  const { data: groups = [], isLoading: loadingGroups, error: groupsError } = useQuery({
    queryKey: ["zabbix-groups", connectionId],
    queryFn: async () => {
      const result = await zabbixProxyPaginated(connectionId!, "hostgroup.get", { output: ["groupid", "name"], sortfield: "name" });
      // Persist to IndexedDB
      setNavCache(groupsCacheKey, result).catch(() => {});
      return result;
    },
    enabled: !!connectionId,
    staleTime: 5 * 60 * 1000,
    placeholderData: () => {
      // Try IndexedDB instant load — will be replaced by fresh data
      return undefined;
    },
    select: (d) => (d as ZabbixGroup[]) || [],
  });

  // Seed from IndexedDB on mount
  useEffect(() => {
    if (!connectionId) return;
    getNavCache(groupsCacheKey).then((cached) => {
      if (cached && cached.length > 0) {
        queryClient.setQueryData(["zabbix-groups", connectionId], cached);
      }
    }).catch(() => {});
  }, [connectionId]);

  // ── Hosts with IndexedDB SWR ──
  const hostsCacheKey = `hosts:${connectionId}:${selectedGroup}`;
  const { data: hosts = [], isLoading: loadingHosts } = useQuery({
    queryKey: ["zabbix-hosts", connectionId, selectedGroup],
    queryFn: async () => {
      const result = await zabbixProxyPaginated(connectionId!, "host.get", { output: ["hostid", "host", "name"], groupids: [selectedGroup], sortfield: "name" });
      setNavCache(hostsCacheKey, result).catch(() => {});
      return result;
    },
    enabled: !!connectionId && !!selectedGroup,
    staleTime: 5 * 60 * 1000,
    select: (d) => (d as ZabbixHost[]) || [],
  });

  // Seed hosts from IndexedDB
  useEffect(() => {
    if (!connectionId || !selectedGroup) return;
    getNavCache(hostsCacheKey).then((cached) => {
      if (cached && cached.length > 0) {
        queryClient.setQueryData(["zabbix-hosts", connectionId, selectedGroup], cached);
      }
    }).catch(() => {});
  }, [connectionId, selectedGroup]);

  // ── Items ──
  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ["zabbix-items", connectionId, selectedHost],
    queryFn: () => zabbixProxyPaginated(connectionId!, "item.get", { output: ["itemid", "key_", "name", "lastvalue", "units", "value_type"], hostids: [selectedHost], sortfield: "name" }),
    enabled: !!connectionId && !!selectedHost,
    staleTime: 5 * 60 * 1000,
    select: (d) => (d as ZabbixItem[]) || [],
  });

  // Reset downstream
  useEffect(() => { setSelectedHost(""); }, [selectedGroup]);
  useEffect(() => { setShowItems(true); setItemSearch(""); }, [selectedHost]);

  // Fuzzy search for items
  const fuse = useMemo(() => new Fuse(items, FUSE_OPTIONS), [items]);
  const filteredItems = useMemo(() => {
    if (!itemSearch.trim()) return items;
    return fuse.search(itemSearch).map((r) => r.item);
  }, [fuse, items, itemSearch]);

  // Virtual scrolling for items
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

  // Map to VirtualSelect format
  const groupOptions = useMemo(() => groups.map((g) => ({ id: g.groupid, label: g.name })), [groups]);
  const hostOptions = useMemo(() => hosts.map((h) => ({ id: h.hostid, label: h.name || h.host })), [hosts]);

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

      {/* Host Group — Virtualized */}
      <VirtualSelect
        items={groupOptions}
        value={selectedGroup}
        onChange={setSelectedGroup}
        placeholder="Selecionar grupo"
        isLoading={loadingGroups && groups.length === 0}
        icon={FolderTree}
        label="Grupo de Hosts"
      />

      {/* Host — Virtualized */}
      <VirtualSelect
        items={hostOptions}
        value={selectedHost}
        onChange={setSelectedHost}
        placeholder={!selectedGroup ? "Selecione um grupo primeiro" : "Selecionar host"}
        isLoading={loadingHosts && hosts.length === 0}
        icon={Server}
        label="Host"
      />

      {/* Items — Virtualized List with Fuzzy Search */}
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
              <div style={{ height: `${virtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}>
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
                          ? "bg-primary/15 border border-primary/40 text-primary"
                          : "hover:bg-accent/40 border border-transparent"
                      }`}
                      style={{ top: `${vRow.start}px`, height: `${vRow.size}px` }}
                    >
                      <div className="font-medium whitespace-nowrap overflow-hidden text-ellipsis">{item.name}</div>
                      <div className="flex items-center justify-between text-muted-foreground mt-0.5 whitespace-nowrap">
                        <span className="font-mono overflow-hidden text-ellipsis max-w-[60%]">{item.key_}</span>
                        <span className="font-mono text-primary/70">
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
