import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Server, FolderTree, Activity } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ZabbixItemBrowserProps {
  connectionId: string | null;
  /** Current selected item key / telemetry key */
  selectedItemId?: string;
  onSelectItem: (item: { itemid: string; key_: string; name: string; lastvalue?: string; units?: string }) => void;
}

interface ZabbixGroup {
  groupid: string;
  name: string;
}

interface ZabbixHost {
  hostid: string;
  host: string;
  name: string;
}

interface ZabbixItem {
  itemid: string;
  key_: string;
  name: string;
  lastvalue?: string;
  units?: string;
  value_type?: string;
}

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
    const result = await zabbixProxy(connectionId, method, {
      ...baseParams,
      limit: pageSize,
      offset,
    });
    const items = (result as unknown[]) || [];
    allResults.push(...items);
    if (items.length < pageSize) break;
    offset += pageSize;
  }

  return allResults;
}

export default function ZabbixItemBrowser({ connectionId, selectedItemId, onSelectItem }: ZabbixItemBrowserProps) {
  const [groups, setGroups] = useState<ZabbixGroup[]>([]);
  const [hosts, setHosts] = useState<ZabbixHost[]>([]);
  const [items, setItems] = useState<ZabbixItem[]>([]);

  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [selectedHost, setSelectedHost] = useState<string>("");
  const [itemSearch, setItemSearch] = useState("");

  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingHosts, setLoadingHosts] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load host groups
  useEffect(() => {
    if (!connectionId) return;
    setLoadingGroups(true);
    setError(null);
    zabbixProxyPaginated(connectionId, "hostgroup.get", { output: ["groupid", "name"], sortfield: "name" })
      .then((result) => setGroups((result as ZabbixGroup[]) || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoadingGroups(false));
  }, [connectionId]);

  // Load hosts when group changes
  useEffect(() => {
    if (!connectionId || !selectedGroup) { setHosts([]); return; }
    setLoadingHosts(true);
    setSelectedHost("");
    setItems([]);
    zabbixProxyPaginated(connectionId, "host.get", {
      output: ["hostid", "host", "name"],
      groupids: [selectedGroup],
      sortfield: "name",
    })
      .then((result) => setHosts((result as ZabbixHost[]) || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoadingHosts(false));
  }, [connectionId, selectedGroup]);

  // Load items when host changes
  useEffect(() => {
    if (!connectionId || !selectedHost) { setItems([]); return; }
    setLoadingItems(true);
    zabbixProxyPaginated(connectionId, "item.get", {
      output: ["itemid", "key_", "name", "lastvalue", "units", "value_type"],
      hostids: [selectedHost],
      sortfield: "name",
    })
      .then((result) => setItems((result as ZabbixItem[]) || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoadingItems(false));
  }, [connectionId, selectedHost]);

  const filteredItems = itemSearch
    ? items.filter((i) =>
        i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
        i.key_.toLowerCase().includes(itemSearch.toLowerCase())
      )
    : items;

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
        <div className="text-[9px] text-neon-red p-2 border border-neon-red/30 rounded-md bg-neon-red/5">
          {error}
        </div>
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
                <SelectItem key={g.groupid} value={g.groupid} className="text-xs whitespace-nowrap">
                  {g.name}
                </SelectItem>
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
                <SelectItem key={h.hostid} value={h.hostid} className="text-xs whitespace-nowrap">
                  {h.name || h.host}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {/* Items */}
      {selectedHost && (
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Activity className="w-3 h-3" /> Item ({filteredItems.length})
          </Label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Buscar item…"
              className="h-7 text-xs pl-7"
            />
          </div>

          {loadingItems ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-neon-green" />
            </div>
          ) : (
            <ScrollArea className="max-h-[220px] border border-border/30 rounded-md overflow-x-auto">
              <div className="p-1 space-y-0.5 min-w-0">
                {filteredItems.map((item) => (
                  <button
                    key={item.itemid}
                    onClick={() => onSelectItem(item)}
                    className={`w-full text-left p-1.5 rounded transition-all text-[9px] ${
                      selectedItemId === item.itemid
                        ? "bg-neon-green/15 border border-neon-green/40 text-neon-green"
                        : "hover:bg-accent/40 border border-transparent"
                    }`}
                  >
                    <div className="font-medium whitespace-nowrap overflow-x-auto">{item.name}</div>
                    <div className="flex items-center justify-between text-muted-foreground mt-0.5 whitespace-nowrap">
                      <span className="font-mono overflow-x-auto max-w-[60%]">{item.key_}</span>
                      <span className="font-mono text-neon-green/70">
                        {item.lastvalue !== undefined ? `${item.lastvalue}${item.units || ""}` : "—"}
                      </span>
                    </div>
                  </button>
                ))}
                {filteredItems.length === 0 && !loadingItems && (
                  <p className="text-[9px] text-muted-foreground text-center py-3">Nenhum item encontrado</p>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}
