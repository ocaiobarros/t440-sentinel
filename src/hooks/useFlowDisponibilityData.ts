import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FlowDispConfig {
  connectionId: string;
  connectionName: string;
  groupId: string;
  groupName: string;
  hostIds: string[];
}

export interface HostAvailability {
  hostId: string;
  hostName: string;
  displayName: string;
  group: string;
  // ICMP data
  icmpPing: number | null;       // 1=up 0=down
  icmpLoss: number | null;       // % packet loss
  icmpResponse: number | null;   // ms
  // Computed
  isOnline: boolean;
  sla: number;                   // % uptime derived from loss
  drops: number;                 // count of loss events
  lastUpdated: Date | null;
}

async function zabbixProxy(connectionId: string, method: string, params: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("zabbix-proxy", {
    body: { connection_id: connectionId, method, params },
  });
  if (error) throw new Error(String(error));
  if (data?.error) throw new Error(data.error);
  return data?.result;
}

export function useFlowDisponibilityData(config: FlowDispConfig | null, pollIntervalMs = 30_000) {
  const [hosts, setHosts] = useState<HostAvailability[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dropCounterRef = useRef<Map<string, number>>(new Map());

  const fetchData = useCallback(async () => {
    if (!config) return;
    setLoading(true);
    setError(null);
    try {
      // Get ICMP items for selected hosts
      const items = await zabbixProxy(config.connectionId, "item.get", {
        output: ["itemid", "hostid", "key_", "lastvalue", "lastclock", "name"],
        hostids: config.hostIds,
        search: { key_: "icmpping" },
        searchWildcardsEnabled: true,
        monitored: true,
      });

      // Also get host info (name)
      const hostInfo = await zabbixProxy(config.connectionId, "host.get", {
        output: ["hostid", "host", "name"],
        hostids: config.hostIds,
        selectGroups: ["name"],
      });

      const hostMap = new Map<string, { host: string; name: string; group: string }>();
      (hostInfo as any[]).forEach((h) => {
        const groupName = h.groups?.[0]?.name || config.groupName;
        hostMap.set(h.hostid, { host: h.host, name: h.name || h.host, group: groupName });
      });

      // Group items by hostid
      const itemsByHost = new Map<string, Record<string, string>>();
      (items as any[]).forEach((item) => {
        if (!itemsByHost.has(item.hostid)) itemsByHost.set(item.hostid, {});
        itemsByHost.get(item.hostid)![item.key_] = item.lastvalue ?? "";
      });

      const now = new Date();
      const result: HostAvailability[] = config.hostIds.map((hostId) => {
        const info = hostMap.get(hostId);
        const itms = itemsByHost.get(hostId) || {};

        const ping = itms["icmpping"] !== undefined ? parseFloat(itms["icmpping"]) : null;
        const loss = itms["icmppingloss"] !== undefined ? parseFloat(itms["icmppingloss"]) : null;
        const resp = itms["icmppingresponse"] !== undefined ? parseFloat(itms["icmppingresponse"]) : null;

        const isOnline = ping === 1;
        const sla = loss !== null ? Math.max(0, 100 - loss) : isOnline ? 100 : 0;

        // Track drops: if went offline, increment counter
        const prevEntry = hosts.find((h) => h.hostId === hostId);
        const prevOnline = prevEntry?.isOnline ?? true;
        if (prevOnline && !isOnline) {
          dropCounterRef.current.set(hostId, (dropCounterRef.current.get(hostId) || 0) + 1);
        }
        const drops = dropCounterRef.current.get(hostId) || 0;

        return {
          hostId,
          hostName: info?.host || hostId,
          displayName: info?.name || info?.host || hostId,
          group: info?.group || config.groupName,
          icmpPing: ping,
          icmpLoss: loss,
          icmpResponse: resp,
          isOnline,
          sla,
          drops,
          lastUpdated: now,
        };
      });

      setHosts(result);
      setLastPoll(now);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    if (!config) return;
    fetchData();
    timerRef.current = setInterval(fetchData, pollIntervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [config, fetchData, pollIntervalMs]);

  const totalOnline = hosts.filter((h) => h.isOnline).length;
  const totalOffline = hosts.filter((h) => !h.isOnline).length;

  const slaGeral = hosts.length > 0
    ? hosts.reduce((acc, h) => acc + h.sla, 0) / hosts.length
    : 100;

  // Group SLA
  const groupMap = new Map<string, HostAvailability[]>();
  hosts.forEach((h) => {
    if (!groupMap.has(h.group)) groupMap.set(h.group, []);
    groupMap.get(h.group)!.push(h);
  });
  const groupStats = Array.from(groupMap.entries()).map(([name, hs]) => ({
    name,
    online: hs.filter((h) => h.isOnline).length,
    total: hs.length,
    sla: hs.reduce((acc, h) => acc + h.sla, 0) / hs.length,
  }));

  return {
    hosts,
    loading,
    error,
    lastPoll,
    totalOnline,
    totalOffline,
    slaGeral,
    groupStats,
    refresh: fetchData,
  };
}
