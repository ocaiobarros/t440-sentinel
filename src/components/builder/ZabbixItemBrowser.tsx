import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import Fuse from "fuse.js";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Search, Server, FolderTree, Activity, ChevronDown, Check, ChevronRight, Plus, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getNavCache, setNavCache } from "@/lib/metadata-cache";

interface ZabbixItemBrowserProps {
  connectionId: string | null;
  selectedItemId?: string;
  initialGroupId?: string;
  initialHostId?: string;
  initialGroupName?: string;
  initialHostName?: string;
  initialItemName?: string;
  multiSelect?: boolean;
  selectedSeries?: string[];
  onSelectItem: (item: { itemid: string; key_: string; name: string; lastvalue?: string; units?: string }, context: { groupId: string; hostId: string; groupName: string; hostName: string }) => void;
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

// ── Virtualized Select Dropdown ──

function VirtualSelect<T extends { id: string; label: string }>({
  items, value, onChange, placeholder, isLoading, icon: Icon, label,
}: {
  items: T[]; value: string; onChange: (id: string) => void; placeholder: string; isLoading: boolean; icon: React.ElementType; label: string;
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

// ── Constants ──
const PAGE_SIZE = 50;
const DEFAULT_SEARCH_NAMES = ["Bits sent", "Bits received", "Traffic"];

// ── Main Component ──

export default function ZabbixItemBrowser({ connectionId, selectedItemId, initialGroupId, initialHostId, initialGroupName, initialHostName, initialItemName, multiSelect, selectedSeries, onSelectItem }: ZabbixItemBrowserProps) {
  const [selectedGroup, setSelectedGroup] = useState(initialGroupId || "");
  const [selectedHost, setSelectedHost] = useState(initialHostId || "");
  const [itemSearch, setItemSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loadedItems, setLoadedItems] = useState<ZabbixItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);
  const parentRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const initializedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (initialGroupId && !initializedRef.current) {
      setSelectedGroup(initialGroupId);
      if (initialHostId) setSelectedHost(initialHostId);
      initializedRef.current = true;
    }
  }, [initialGroupId, initialHostId]);

  // Debounce search input
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(itemSearch);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [itemSearch]);

  // ── Groups with IndexedDB SWR ──
  const groupsCacheKey = `groups:${connectionId}`;
  const { data: groups = [], isLoading: loadingGroups, error: groupsError } = useQuery({
    queryKey: ["zabbix-groups", connectionId],
    queryFn: async () => {
      const result = await zabbixProxyPaginated(connectionId!, "hostgroup.get", { output: ["groupid", "name"], sortfield: "name" });
      setNavCache(groupsCacheKey, result).catch(() => {});
      return result;
    },
    enabled: !!connectionId,
    staleTime: 5 * 60 * 1000,
    select: (d) => (d as ZabbixGroup[]) || [],
  });

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

  useEffect(() => {
    if (!connectionId || !selectedGroup) return;
    getNavCache(hostsCacheKey).then((cached) => {
      if (cached && cached.length > 0) {
        queryClient.setQueryData(["zabbix-hosts", connectionId, selectedGroup], cached);
      }
    }).catch(() => {});
  }, [connectionId, selectedGroup]);

  // ── Items — Server-side search + pagination ──
  const buildItemParams = useCallback((offset: number, searchTerm: string) => {
    const params: Record<string, unknown> = {
      output: ["itemid", "key_", "name", "lastvalue", "units", "value_type"],
      hostids: [selectedHost],
      sortfield: "name",
      limit: PAGE_SIZE,
      offset,
    };

    if (searchTerm.trim()) {
      // Server-side search by name
      params.search = { name: searchTerm.trim() };
      params.startSearch = true;
    } else {
      // Default: show bandwidth-related items first
      params.search = { name: DEFAULT_SEARCH_NAMES[0] };
      params.searchByAny = true;
      // We'll do multiple calls for default filters
    }

    return params;
  }, [selectedHost]);

  const { isLoading: loadingItems, isFetching: fetchingItems } = useQuery({
    queryKey: ["zabbix-items-ss", connectionId, selectedHost, debouncedSearch],
    queryFn: async () => {
      if (!connectionId || !selectedHost) return [];

      let allItems: ZabbixItem[] = [];

      if (debouncedSearch.trim()) {
        // User typed something — single server-side search
        const result = await zabbixProxy(connectionId, "item.get", {
          output: ["itemid", "key_", "name", "lastvalue", "units", "value_type"],
          hostids: [selectedHost],
          sortfield: "name",
          limit: PAGE_SIZE,
          search: { name: debouncedSearch.trim() },
          startSearch: true,
        });
        allItems = (result as ZabbixItem[]) || [];
        setHasMore(allItems.length >= PAGE_SIZE);
      } else {
        // No search — fetch default bandwidth items in parallel
        const searches = DEFAULT_SEARCH_NAMES.map((term) =>
          zabbixProxy(connectionId, "item.get", {
            output: ["itemid", "key_", "name", "lastvalue", "units", "value_type"],
            hostids: [selectedHost],
            sortfield: "name",
            limit: PAGE_SIZE,
            search: { name: term },
            startSearch: true,
          })
        );
        const results = await Promise.all(searches);
        const seen = new Set<string>();
        for (const batch of results) {
          for (const item of (batch as ZabbixItem[]) || []) {
            if (!seen.has(item.itemid)) {
              seen.add(item.itemid);
              allItems.push(item);
            }
          }
        }
        allItems.sort((a, b) => a.name.localeCompare(b.name));
        setHasMore(false); // default view shows curated list
      }

      setLoadedItems(allItems);
      setCurrentOffset(allItems.length);
      return allItems;
    },
    enabled: !!connectionId && !!selectedHost,
    staleTime: 5 * 60 * 1000,
  });

  // ── Load More ──
  const handleLoadMore = useCallback(async () => {
    if (!connectionId || !selectedHost || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await zabbixProxy(connectionId, "item.get", {
        output: ["itemid", "key_", "name", "lastvalue", "units", "value_type"],
        hostids: [selectedHost],
        sortfield: "name",
        limit: PAGE_SIZE,
        offset: currentOffset,
        ...(debouncedSearch.trim()
          ? { search: { name: debouncedSearch.trim() }, startSearch: true }
          : {}),
      });
      const newItems = (result as ZabbixItem[]) || [];
      const seen = new Set(loadedItems.map((i) => i.itemid));
      const unique = newItems.filter((i) => !seen.has(i.itemid));
      setLoadedItems((prev) => [...prev, ...unique]);
      setCurrentOffset((prev) => prev + PAGE_SIZE);
      setHasMore(newItems.length >= PAGE_SIZE);
    } catch (err) {
      console.error("Load more failed:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [connectionId, selectedHost, currentOffset, debouncedSearch, loadedItems, loadingMore]);

  const handleGroupChange = useCallback((groupId: string) => {
    setSelectedGroup(groupId);
    setSelectedHost("");
    setItemSearch("");
    setLoadedItems([]);
  }, []);

  const handleHostChange = useCallback((hostId: string) => {
    setSelectedHost(hostId);
    setItemSearch("");
    setLoadedItems([]);
    setCurrentOffset(0);
    setHasMore(false);
  }, []);

  const virtualizer = useVirtualizer({
    count: loadedItems.length + (hasMore ? 1 : 0), // +1 for load-more row
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 5,
  });

  const groupName = groups.find(g => g.groupid === selectedGroup)?.name || initialGroupName || "";
  const hostName = hosts.find(h => h.hostid === selectedHost)?.name || initialHostName || "";

  const handleSelect = useCallback((item: ZabbixItem) => {
    onSelectItem(item, {
      groupId: selectedGroup,
      hostId: selectedHost,
      groupName,
      hostName,
    });
  }, [onSelectItem, selectedGroup, selectedHost, groupName, hostName]);

  const groupOptions = useMemo(() => groups.map((g) => ({ id: g.groupid, label: g.name })), [groups]);
  const hostOptions = useMemo(() => hosts.map((h) => ({ id: h.hostid, label: h.name || h.host })), [hosts]);

  const selectedSeriesSet = useMemo(() => new Set(selectedSeries || []), [selectedSeries]);

  const error = groupsError ? (groupsError as Error).message : null;
  const isSearching = fetchingItems && !loadingItems;

  if (!connectionId) {
    return (
      <div className="text-[9px] text-neon-amber p-2 border border-neon-amber/30 rounded-md bg-neon-amber/5">
        ⚠ Selecione uma conexão Zabbix nas configurações do dashboard primeiro.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="text-[9px] text-neon-red p-2 border border-neon-red/30 rounded-md bg-neon-red/5">{error}</div>
      )}

      {/* Breadcrumb */}
      {(groupName || hostName) && (
        <div className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground overflow-hidden">
          <span className="text-primary/60">📍</span>
          {groupName && <span className="truncate max-w-[40%]">{groupName}</span>}
          {hostName && <><ChevronRight className="w-2.5 h-2.5 shrink-0 text-muted-foreground/40" /><span className="text-foreground truncate max-w-[40%]">{hostName}</span></>}
        </div>
      )}

      {/* Dropdowns */}
      <VirtualSelect items={groupOptions} value={selectedGroup} onChange={handleGroupChange} placeholder="Selecionar grupo" isLoading={loadingGroups && groups.length === 0} icon={FolderTree} label="Grupo de Hosts" />
      <VirtualSelect items={hostOptions} value={selectedHost} onChange={handleHostChange} placeholder={!selectedGroup ? "Selecione um grupo primeiro" : "Selecionar host"} isLoading={loadingHosts && hosts.length === 0} icon={Server} label="Host" />

      {/* Items — Server-side Search + Paginated List */}
      {selectedHost && (
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Activity className="w-3 h-3" /> Itens ({loadedItems.length})
            {isSearching && <Loader2 className="w-3 h-3 animate-spin text-primary ml-1" />}
          </Label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Buscar no servidor…"
              className="h-7 text-xs pl-7"
            />
          </div>

          {!itemSearch.trim() && loadedItems.length > 0 && (
            <p className="text-[8px] text-muted-foreground/60 px-1">
              Mostrando itens de banda. Digite para buscar outros itens.
            </p>
          )}

          {loadingItems ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-[9px] text-muted-foreground">Buscando itens do Zabbix…</span>
            </div>
          ) : (
            <div ref={parentRef} className="h-[320px] border border-border/30 rounded-md overflow-auto">
              <div style={{ height: `${virtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}>
                {virtualizer.getVirtualItems().map((vRow) => {
                  // Last row = load more button
                  if (hasMore && vRow.index === loadedItems.length) {
                    return (
                      <div
                        key="load-more"
                        className="absolute left-0 w-full flex items-center justify-center py-2"
                        style={{ top: `${vRow.start}px`, height: `${vRow.size}px` }}
                      >
                        <button
                          type="button"
                          onClick={handleLoadMore}
                          disabled={loadingMore}
                          className="text-[9px] text-primary hover:text-primary/80 font-medium flex items-center gap-1 disabled:opacity-50"
                        >
                          {loadingMore ? (
                            <><Loader2 className="w-3 h-3 animate-spin" /> Carregando…</>
                          ) : (
                            "Carregar mais itens"
                          )}
                        </button>
                      </div>
                    );
                  }

                  const item = loadedItems[vRow.index];
                  if (!item) return null;
                  const isInSeries = multiSelect && selectedSeriesSet.has(item.itemid);
                  const isSingleSelected = !multiSelect && selectedItemId === item.itemid;

                  return (
                    <button
                      key={item.itemid}
                      ref={virtualizer.measureElement}
                      data-index={vRow.index}
                      onClick={() => handleSelect(item)}
                      className={`absolute left-0 w-full text-left px-2 py-1 transition-colors text-[9px] flex items-center gap-2 group ${
                        isInSeries || isSingleSelected
                          ? "border-l-2 border-l-primary bg-transparent"
                          : "border-l-2 border-l-transparent hover:bg-accent/20"
                      }`}
                      style={{ top: `${vRow.start}px`, height: `${vRow.size}px` }}
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-medium truncate block">{item.name}</span>
                        <span className="font-mono text-muted-foreground/60 truncate block text-[8px]">
                          {item.lastvalue !== undefined ? `${item.lastvalue}${item.units || ""}` : "—"}
                        </span>
                      </div>
                      {multiSelect && (
                        isInSeries ? (
                          <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                        ) : (
                          <Plus className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary shrink-0 transition-colors" />
                        )
                      )}
                    </button>
                  );
                })}
              </div>
              {loadedItems.length === 0 && !loadingItems && !fetchingItems && (
                <p className="text-[9px] text-muted-foreground text-center py-3">
                  {debouncedSearch ? "Nenhum item encontrado" : "Nenhum item de banda encontrado. Digite para buscar."}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
