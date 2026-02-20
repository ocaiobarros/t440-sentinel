import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/* ─── Types ─────────────────────────────────────── */

export interface ZabbixItem {
  itemid: string;
  name: string;
  lastvalue: string;
  lastclock: string;
  units: string;
  key_: string;
  value_type: string;
}

export interface ZabbixHost {
  hostid: string;
  host: string;
  name: string;
}

export interface IdracData {
  /** raw items keyed by name */
  items: Map<string, ZabbixItem>;
  /** convenience getters */
  get: (name: string) => string;
  getItem: (name: string) => ZabbixItem | undefined;
}

interface UseIdracLiveReturn {
  /** Available hosts for selected connection */
  hosts: ZabbixHost[];
  hostsLoading: boolean;
  /** Parsed iDRAC data */
  data: IdracData | null;
  dataLoading: boolean;
  /** Last refresh timestamp */
  lastRefresh: Date | null;
  /** Manually trigger refresh */
  refresh: () => void;
  /** Error message */
  error: string | null;
  /** Fetch hosts for a connection */
  fetchHosts: (connectionId: string) => Promise<void>;
  /** Fetch items for a host */
  fetchItems: (connectionId: string, hostId: string) => Promise<void>;
}

/* ─── Zabbix proxy call ─────────────────────────── */

async function zabbixProxy(
  connectionId: string,
  method: string,
  params: Record<string, unknown> = {}
): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke("zabbix-proxy", {
    body: { connection_id: connectionId, method, params },
  });
  if (error) throw new Error(String(error));
  if (data?.error) throw new Error(data.error);
  return data?.result;
}

/* ─── Hook ──────────────────────────────────────── */

export function useIdracLive(): UseIdracLiveReturn {
  const [hosts, setHosts] = useState<ZabbixHost[]>([]);
  const [hostsLoading, setHostsLoading] = useState(false);
  const [data, setData] = useState<IdracData | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connRef = useRef<string>("");
  const hostRef = useRef<string>("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHosts = useCallback(async (connectionId: string) => {
    setHostsLoading(true);
    setError(null);
    try {
      const result = await zabbixProxy(connectionId, "host.get", {
        output: ["hostid", "host", "name"],
        sortfield: "name",
      });
      setHosts(result as ZabbixHost[]);
    } catch (err) {
      setError(String(err));
      setHosts([]);
    } finally {
      setHostsLoading(false);
    }
  }, []);

  const fetchItems = useCallback(async (connectionId: string, hostId: string) => {
    connRef.current = connectionId;
    hostRef.current = hostId;
    setDataLoading(true);
    setError(null);
    try {
      const result = await zabbixProxy(connectionId, "item.get", {
        hostids: hostId,
        output: ["itemid", "name", "lastvalue", "lastclock", "units", "key_", "value_type"],
        sortfield: "name",
        limit: 500,
      });
      const items = result as ZabbixItem[];
      const map = new Map<string, ZabbixItem>();
      items.forEach((item) => map.set(item.name, item));

      setData({
        items: map,
        get: (name: string) => map.get(name)?.lastvalue ?? "",
        getItem: (name: string) => map.get(name),
      });
      setLastRefresh(new Date());
    } catch (err) {
      setError(String(err));
    } finally {
      setDataLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    if (connRef.current && hostRef.current) {
      fetchItems(connRef.current, hostRef.current);
    }
  }, [fetchItems]);

  // Auto-refresh every 2 minutes
  useEffect(() => {
    if (data) {
      intervalRef.current = setInterval(refresh, 120_000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [data, refresh]);

  // Refresh on focus
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  }, [refresh]);

  return { hosts, hostsLoading, data, dataLoading, lastRefresh, refresh, error, fetchHosts, fetchItems };
}

/* ─── Data extraction helpers ───────────────────── */

export function extractTemperatures(d: IdracData) {
  const parseTemp = (val: string) => {
    const m = val.match(/(\d+)/);
    return m ? parseInt(m[1]) : 0;
  };
  return {
    cpu1: {
      value: d.get("Temperature Sensor CPU1 Temp Value"),
      status: d.get("Temperature Sensor CPU1 Temp Status"),
      criticalHigh: d.get("Temperature Sensor CPU1 Temp Critical Up-Limit"),
      criticalLow: d.get("Temperature Sensor CPU1 Temp Critical Low-Limit"),
      numValue: parseTemp(d.get("Temperature Sensor CPU1 Temp Value")),
    },
    cpu2: {
      value: d.get("Temperature Sensor CPU2 Temp Value"),
      status: d.get("Temperature Sensor CPU2 Temp Status"),
      criticalHigh: d.get("Temperature Sensor CPU2 Temp Critical Up-Limit"),
      criticalLow: d.get("Temperature Sensor CPU2 Temp Critical Low-Limit"),
      numValue: parseTemp(d.get("Temperature Sensor CPU2 Temp Value")),
    },
    inlet: {
      value: d.get("Temperature Sensor System Board Inlet Temp Value"),
      status: d.get("Temperature Sensor System Board Inlet Temp Status"),
      criticalHigh: d.get("Temperature Sensor System Board Inlet Temp Critical Up-Limit"),
      criticalLow: d.get("Temperature Sensor System Board Inlet Temp Critical Low-Limit"),
      warningHigh: d.get("Temperature Sensor System Board Inlet Temp Warning Up-Limit"),
      warningLow: d.get("Temperature Sensor System Board Inlet Temp Warning Low-Limit"),
      numValue: parseTemp(d.get("Temperature Sensor System Board Inlet Temp Value")),
    },
  };
}

export function extractFans(d: IdracData) {
  const fans: { name: string; speed: string; speedNum: number; status: string }[] = [];
  for (let i = 1; i <= 10; i++) {
    const speed = d.get(`Fan System Board Fan${i} Speed`);
    if (!speed) break;
    const speedNum = parseInt(speed) || 0;
    fans.push({
      name: `Fan${i}`,
      speed: speed.includes("rpm") ? speed : `${speed} rpm`,
      speedNum,
      status: d.get(`Fan System Board Fan${i} Status`),
    });
  }
  return fans;
}

export function extractPower(d: IdracData) {
  const psus: { id: number; status: string; voltage: string; maxPower: string; state: string; sensorState: string }[] = [];
  for (let i = 1; i <= 4; i++) {
    const status = d.get(`Power Supply ${i} Status`);
    if (!status) break;
    psus.push({
      id: i,
      status,
      voltage: d.get(`Power Supply ${i} Input Voltage`),
      maxPower: d.get(`Power Supply ${i} Maximum Power`),
      state: d.get(`Power Supply ${i} State Settings`),
      sensorState: d.get(`Power Supply ${i} Sensor State`),
    });
  }
  return {
    supplies: psus,
    minIdlePower: d.get("Power Usage Minimum Idle Power"),
    sensorStatus: d.get("Power Usage Sensor Status"),
  };
}

export function extractDisks(d: IdracData) {
  const disks: { id: number; size: string; state: string; status: string; manufacturer: string; model: string; name: string; serial: string }[] = [];
  for (let i = 1; i <= 24; i++) {
    const size = d.get(`Disk ${i} : Disk Size`);
    if (!size) break;
    disks.push({
      id: i,
      size,
      state: d.get(`Disk ${i} : Disk State`),
      status: d.get(`Disk ${i} : Disk Status`),
      manufacturer: d.get(`Disk ${i} : Manufacturer`),
      model: d.get(`Disk ${i} : Model Number`),
      name: d.get(`Disk ${i} : Name`),
      serial: d.get(`Disk ${i} : Serial Number`),
    });
  }
  return disks;
}

export function extractRaid(d: IdracData) {
  const controller = {
    name: d.get("RAID Controller : Name"),
    status: d.get("RAID Controller : Status"),
    firmware: d.get("RAID Controller : Firmware Version"),
  };
  const volumes: { id: number; name: string; size: string; state: string; status: string; vdState: string }[] = [];
  for (let i = 1; i <= 10; i++) {
    const name = d.get(`Volume ${i} : Name`);
    if (!name) break;
    volumes.push({
      id: i,
      name,
      size: d.get(`Volume ${i} : Size`),
      state: d.get(`Volume ${i} : State`),
      status: d.get(`Volume ${i} : Status`),
      vdState: d.get(`Volume ${i} : Virtual Disk State`),
    });
  }
  return { controller, volumes };
}

export function extractNics(d: IdracData) {
  const nics: { id: number; name: string; mac: string; connectionStatus: string; status: string; slot: string }[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = d.get(`NIC ${i} : Name`);
    if (!name) break;
    nics.push({
      id: i,
      name,
      mac: d.get(`NIC ${i} : MAC Address`),
      connectionStatus: d.get(`NIC ${i} : Connection Status`),
      status: d.get(`NIC ${i} : Status`),
      slot: d.get(`NIC ${i} : Slot`),
    });
  }
  return nics;
}

export function extractInventory(d: IdracData) {
  return {
    model: d.get("System Model"),
    assetTag: d.get("System Asset Tag"),
    serviceCode: d.get("System Express Service Code"),
    biosVersion: d.get("BIOS Version"),
    biosDate: d.get("BIOS Date"),
    dracFirmware: d.get("DRAC Firmware version"),
    dracUrl: d.get("DRAC Access URL"),
    dracVersion: d.get("DRAC version"),
  };
}

export function extractStatus(d: IdracData) {
  return {
    overallStatus: d.get("Overall System Status"),
    rollupStatus: d.get("Overall System Rollup Status"),
    storageStatus: d.get("Overall System Storage Status"),
    powerState: d.get("Overall System Power State"),
    lcdStatus: d.get("Overall System LCD Status"),
  };
}
