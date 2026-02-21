import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, ArrowDownUp, Trash2, Plus, Loader2, Search,
  ChevronLeft, ChevronRight, X, Cable,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useFlowMapLinkItems, type FlowMapLinkItem, type FlowMapHost, type FlowMapLink } from "@/hooks/useFlowMaps";

/* ── Zabbix item type ── */
interface ZabbixItem {
  itemid: string;
  key_: string;
  name: string;
  lastvalue: string;
  units: string;
  hostid: string;
}

async function zabbixProxy(connectionId: string, method: string, params: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke("zabbix-proxy", {
    body: { connection_id: connectionId, method, params },
  });
  if (error) throw new Error(String(error));
  if (data?.error) throw new Error(data.error);
  return data?.result;
}

type Metric = "BPS" | "STATUS" | "ERRORS";
type Side = "A" | "B";
type Direction = "IN" | "OUT";

interface Props {
  link: FlowMapLink;
  hosts: FlowMapHost[];
  connectionId: string;
  tenantId: string;
  onAddItem: (item: Omit<FlowMapLinkItem, "id" | "created_at">) => void;
  onRemoveItem: (id: string, linkId: string) => void;
  onClose: () => void;
}

export default function LinkItemsEditor({ link, hosts, connectionId, tenantId, onAddItem, onRemoveItem, onClose }: Props) {
  const { data: existingItems, isLoading: loadingItems } = useFlowMapLinkItems(link.id);

  const [step, setStep] = useState<"list" | "browse">("list");
  const [side, setSide] = useState<Side>("A");
  const [direction, setDirection] = useState<Direction>("IN");
  const [metric, setMetric] = useState<Metric>("BPS");
  const [items, setItems] = useState<ZabbixItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const originHost = hosts.find((h) => h.id === link.origin_host_id);
  const destHost = hosts.find((h) => h.id === link.dest_host_id);
  const sideHost = side === "A" ? originHost : destHost;

  const fetchItems = useCallback(async () => {
    if (!sideHost || !connectionId) return;
    setLoading(true);
    try {
      const searchPatterns: Record<Metric, string[]> = {
        BPS: ["bits", "bps", "octets", "net.if", "ifHC", "traffic", "bandwidth"],
        STATUS: ["ifOperStatus", "ifAdmin", "net.if.status", "status"],
        ERRORS: ["if.errors", "ifError", "error", "discard", "net.if.in.errors"],
      };
      const patterns = searchPatterns[metric];
      let allItems: ZabbixItem[] = [];
      const seenIds = new Set<string>();

      for (const pattern of patterns) {
        try {
          const result = await zabbixProxy(connectionId, "item.get", {
            hostids: sideHost.zabbix_host_id,
            search: { key_: pattern },
            output: ["itemid", "key_", "name", "lastvalue", "units", "hostid"],
            sortfield: "name",
            limit: 200,
          });
          for (const item of (result as ZabbixItem[])) {
            if (!seenIds.has(item.itemid)) {
              seenIds.add(item.itemid);
              allItems.push(item);
            }
          }
          if (allItems.length > 0) break; // Found items with this pattern, stop
        } catch { /* try next pattern */ }
      }

      // If nothing found, try searching by name as well
      if (allItems.length === 0) {
        try {
          const nameSearch = metric === "BPS" ? "traffic" : metric === "STATUS" ? "status" : "error";
          const result = await zabbixProxy(connectionId, "item.get", {
            hostids: sideHost.zabbix_host_id,
            search: { name: nameSearch },
            output: ["itemid", "key_", "name", "lastvalue", "units", "hostid"],
            sortfield: "name",
            limit: 200,
          });
          allItems = result as ZabbixItem[];
        } catch { /* ignore */ }
      }

      setItems(allItems);
    } catch (err) {
      console.error("Failed to fetch items:", err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [sideHost, connectionId, metric]);

  useEffect(() => {
    if (step === "browse") {
      setSearch("");
      fetchItems();
    }
  }, [step, fetchItems]);

  const handleAddItem = (zbxItem: ZabbixItem) => {
    if (!sideHost) return;
    onAddItem({
      tenant_id: tenantId,
      link_id: link.id,
      side,
      direction,
      metric,
      zabbix_host_id: sideHost.zabbix_host_id,
      zabbix_item_id: zbxItem.itemid,
      key_: zbxItem.key_,
      name: zbxItem.name,
    });
    setStep("list");
  };

  const filteredItems = search
    ? items.filter((i) => (i.name + i.key_).toLowerCase().includes(search.toLowerCase()))
    : items;

  const usedItemIds = new Set((existingItems ?? []).map((i) => i.zabbix_item_id));

  const sideColor = (s: string) => s === "A" ? "text-neon-green" : "text-neon-blue";
  const metricBadge = (m: string) => {
    if (m === "BPS") return "bg-neon-blue/10 text-neon-blue border-neon-blue/30";
    if (m === "STATUS") return "bg-neon-green/10 text-neon-green border-neon-green/30";
    return "bg-neon-amber/10 text-neon-amber border-neon-amber/30";
  };

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden"
    >
      <div className="p-2 rounded-lg border border-neon-blue/20 bg-neon-blue/5 space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Cable className="w-3 h-3 text-neon-blue" />
            <span className="text-[10px] font-display uppercase text-neon-blue tracking-wider">
              Telemetria do Link
            </span>
          </div>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onClose}>
            <X className="w-3 h-3" />
          </Button>
        </div>

        {/* Link info */}
        <div className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground">
          <span className="text-neon-green">{originHost?.host_name ?? "?"}</span>
          <span>→</span>
          <span className="text-neon-blue">{destHost?.host_name ?? "?"}</span>
          <span className="ml-1 text-[8px]">({link.capacity_mbps} Mbps)</span>
        </div>

        <AnimatePresence mode="wait">
          {step === "list" && (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
              {/* Existing items */}
              {loadingItems ? (
                <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 text-neon-blue animate-spin" /></div>
              ) : (existingItems ?? []).length === 0 ? (
                <p className="text-[10px] text-muted-foreground text-center py-2">Nenhum item associado</p>
              ) : (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {(existingItems ?? []).map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-1.5 rounded bg-muted/20 text-[9px]">
                      <div className="flex items-center gap-1 min-w-0">
                        <Activity className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className={`font-bold ${sideColor(item.side)}`}>{item.side}</span>
                        <span className="text-muted-foreground">{item.direction}</span>
                        <Badge variant="outline" className={`text-[8px] h-4 px-1 ${metricBadge(item.metric)}`}>
                          {item.metric}
                        </Badge>
                        <span className="font-mono text-foreground truncate">{item.name || item.key_}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => onRemoveItem(item.id, link.id)}>
                        <Trash2 className="w-2.5 h-2.5 text-muted-foreground hover:text-neon-red" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add button + config */}
              <div className="space-y-1.5">
                <div className="flex gap-1">
                  <Select value={side} onValueChange={(v) => setSide(v as Side)}>
                    <SelectTrigger className="h-6 text-[10px] w-16"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A" className="text-xs">Lado A</SelectItem>
                      <SelectItem value="B" className="text-xs">Lado B</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={direction} onValueChange={(v) => setDirection(v as Direction)}>
                    <SelectTrigger className="h-6 text-[10px] w-16"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IN" className="text-xs">IN</SelectItem>
                      <SelectItem value="OUT" className="text-xs">OUT</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={metric} onValueChange={(v) => setMetric(v as Metric)}>
                    <SelectTrigger className="h-6 text-[10px] flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BPS" className="text-xs">BPS (Tráfego)</SelectItem>
                      <SelectItem value="STATUS" className="text-xs">STATUS (Oper.)</SelectItem>
                      <SelectItem value="ERRORS" className="text-xs">ERRORS (Erros)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" variant="outline" className="w-full h-6 text-[10px] gap-1" onClick={() => setStep("browse")}>
                  <Plus className="w-3 h-3" /> Buscar Item Zabbix
                </Button>
              </div>
            </motion.div>
          )}

          {step === "browse" && (
            <motion.div key="browse" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-mono">
                  <span className={sideColor(side)}>Lado {side}</span>
                  {" · "}
                  <span className="text-muted-foreground">{sideHost?.host_name}</span>
                  {" · "}
                  <span className="text-muted-foreground">{direction} {metric}</span>
                </p>
                <button onClick={() => setStep("list")} className="text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                  <ChevronLeft className="w-2.5 h-2.5" />Voltar
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input placeholder="Filtrar itens..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-7 text-xs pl-7" />
              </div>

              {loading ? (
                <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 text-neon-blue animate-spin" /></div>
              ) : filteredItems.length === 0 ? (
                <p className="text-[10px] text-muted-foreground text-center py-3">Nenhum item encontrado</p>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {filteredItems.map((item) => {
                    const used = usedItemIds.has(item.itemid);
                    return (
                      <button
                        key={item.itemid}
                        onClick={() => !used && handleAddItem(item)}
                        disabled={used}
                        className={`w-full rounded p-1.5 border transition-all text-left ${
                          used
                            ? "border-neon-green/20 bg-neon-green/5 opacity-50 cursor-not-allowed"
                            : "border-border/20 hover:border-neon-blue/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="text-[10px] font-mono text-foreground truncate">{item.name}</p>
                            <p className="text-[8px] text-muted-foreground font-mono truncate">{item.key_}</p>
                          </div>
                          {used ? (
                            <span className="text-[8px] text-neon-green/60 shrink-0">✓</span>
                          ) : (
                            <ChevronRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
