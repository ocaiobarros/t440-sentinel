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
  items: Map<string, ZabbixItem>;
  get: (name: string) => string;
  getItem: (name: string) => ZabbixItem | undefined;
  getAny: (...names: string[]) => string;
  prefix: string;
  /** Detected host type */
  hostType: "idrac" | "linux" | "unknown";
}

interface UseIdracLiveReturn {
  hosts: ZabbixHost[];
  hostsLoading: boolean;
  data: IdracData | null;
  dataLoading: boolean;
  lastRefresh: Date | null;
  refresh: () => void;
  error: string | null;
  fetchHosts: (connectionId: string) => Promise<void>;
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

/* ─── Detect model prefix & host type ──────────── */

function detectPrefix(items: Map<string, ZabbixItem>): string {
  for (const name of items.keys()) {
    const m = name.match(/^(Dell [^:]+:\s)/);
    if (m) return m[1];
  }
  return "";
}

function detectHostType(items: Map<string, ZabbixItem>): "idrac" | "linux" | "unknown" {
  for (const name of items.keys()) {
    if (name.startsWith("Dell ") || name.includes("Temperature Sensor") || name.includes("Fan System Board") || name.includes("Power Supply") || name.includes("RAID Controller") || name.startsWith("Disk ") || name.startsWith("NIC ")) {
      return "idrac";
    }
    if (name.startsWith("Linux: ") || name.startsWith("Interface ") || name.includes(": Total space") || name.includes(": Used space")) {
      return "linux";
    }
  }
  return "unknown";
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

      const prefix = detectPrefix(map);
      const hostType = detectHostType(map);

      const getAny = (...names: string[]): string => {
        for (const n of names) {
          const v = map.get(n)?.lastvalue;
          if (v !== undefined && v !== "") return v;
        }
        return "";
      };

      setData({
        items: map,
        get: (name: string) => map.get(name)?.lastvalue ?? "",
        getItem: (name: string) => map.get(name),
        getAny,
        prefix,
        hostType,
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

  useEffect(() => {
    if (data) {
      intervalRef.current = setInterval(refresh, 120_000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [data, refresh]);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  }, [refresh]);

  return { hosts, hostsLoading, data, dataLoading, lastRefresh, refresh, error, fetchHosts, fetchItems };
}

/* ─── Multi-pattern helpers ─────────────────────── */

const parseTemp = (val: string) => {
  const m = val.match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
};

const parseNum = (val: string) => {
  const m = val.match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
};

function findValue(d: IdracData, ...candidates: string[]): string {
  for (const c of candidates) {
    const v = d.get(c);
    if (v) return v;
  }
  if (d.prefix) {
    for (const c of candidates) {
      const v = d.get(d.prefix + c);
      if (v) return v;
    }
  }
  // Also try "Linux: " prefix
  for (const c of candidates) {
    const v = d.get(`Linux: ${c}`);
    if (v) return v;
  }
  for (const c of candidates) {
    for (const [name, item] of d.items) {
      if (name.endsWith(c) && item.lastvalue) return item.lastvalue;
    }
  }
  return "";
}

/* ─── Data extraction helpers ───────────────────── */

export function extractTemperatures(d: IdracData) {
  return {
    cpu1: {
      value: findValue(d, "Temperature Sensor CPU1 Temp Value", "CPU1 Temp Value"),
      status: findValue(d, "Temperature Sensor CPU1 Temp Status", "CPU1 Temp Status"),
      criticalHigh: findValue(d, "Temperature Sensor CPU1 Temp Critical Up-Limit"),
      criticalLow: findValue(d, "Temperature Sensor CPU1 Temp Critical Low-Limit"),
      numValue: parseTemp(findValue(d, "Temperature Sensor CPU1 Temp Value", "CPU1 Temp Value")),
    },
    cpu2: {
      value: findValue(d, "Temperature Sensor CPU2 Temp Value", "CPU2 Temp Value"),
      status: findValue(d, "Temperature Sensor CPU2 Temp Status", "CPU2 Temp Status"),
      criticalHigh: findValue(d, "Temperature Sensor CPU2 Temp Critical Up-Limit"),
      criticalLow: findValue(d, "Temperature Sensor CPU2 Temp Critical Low-Limit"),
      numValue: parseTemp(findValue(d, "Temperature Sensor CPU2 Temp Value", "CPU2 Temp Value")),
    },
    inlet: {
      value: findValue(d, "Temperature Sensor System Board Inlet Temp Value", "System Board Inlet Temp Value"),
      status: findValue(d, "Temperature Sensor System Board Inlet Temp Status", "System Board Inlet Temp Status"),
      criticalHigh: findValue(d, "Temperature Sensor System Board Inlet Temp Critical Up-Limit"),
      criticalLow: findValue(d, "Temperature Sensor System Board Inlet Temp Critical Low-Limit"),
      warningHigh: findValue(d, "Temperature Sensor System Board Inlet Temp Warning Up-Limit"),
      warningLow: findValue(d, "Temperature Sensor System Board Inlet Temp Warning Low-Limit"),
      numValue: parseTemp(findValue(d, "Temperature Sensor System Board Inlet Temp Value", "System Board Inlet Temp Value")),
    },
    exhaust: {
      value: findValue(d, "System Board Exhaust Temp Value"),
      status: findValue(d, "System Board Exhaust Temp Status"),
      numValue: parseTemp(findValue(d, "System Board Exhaust Temp Value")),
    },
  };
}

export function extractFans(d: IdracData) {
  const fans: { name: string; speed: string; speedNum: number; status: string }[] = [];
  for (let i = 1; i <= 10; i++) {
    const speed = findValue(d, `Fan System Board Fan${i} Speed`, `System Board Fan${i} Speed`);
    if (!speed) break;
    const speedNum = parseNum(speed);
    fans.push({
      name: `Fan${i}`,
      speed: speed.includes("rpm") ? speed : `${speed} rpm`,
      speedNum,
      status: findValue(d, `Fan System Board Fan${i} Status`, `System Board Fan${i} Status`),
    });
  }
  return fans;
}

export function extractPower(d: IdracData) {
  const psus: { id: number; status: string; voltage: string; maxPower: string; state: string; sensorState: string }[] = [];
  for (let i = 1; i <= 4; i++) {
    const status = findValue(d, `Power Supply ${i} Status`, `PS${i} Status`);
    if (!status) break;
    psus.push({
      id: i,
      status,
      voltage: findValue(d, `Power Supply ${i} Input Voltage`),
      maxPower: findValue(d, `Power Supply ${i} Maximum Power`),
      state: findValue(d, `Power Supply ${i} State Settings`),
      sensorState: findValue(d, `Power Supply ${i} Sensor State`),
    });
  }
  return {
    supplies: psus,
    minIdlePower: findValue(d, "Power Usage Minimum Idle Power"),
    sensorStatus: findValue(d, "Power Usage Sensor Status"),
  };
}

export function extractDisks(d: IdracData) {
  const disks: { id: number; size: string; state: string; status: string; manufacturer: string; model: string; name: string; serial: string; mediaType: string; smartStatus: string }[] = [];

  // Pattern 1: T440 — "Disk N : ..."
  for (let i = 1; i <= 24; i++) {
    const size = findValue(d, `Disk ${i} : Disk Size`);
    if (!size) break;
    disks.push({
      id: i, size,
      state: findValue(d, `Disk ${i} : Disk State`),
      status: findValue(d, `Disk ${i} : Disk Status`),
      manufacturer: findValue(d, `Disk ${i} : Manufacturer`),
      model: findValue(d, `Disk ${i} : Model Number`),
      name: findValue(d, `Disk ${i} : Name`),
      serial: findValue(d, `Disk ${i} : Serial Number`),
      mediaType: "", smartStatus: "",
    });
  }

  // Pattern 2: R720 — "Physical Disk 0:1:N" / "Solid State Disk 0:1:N"
  if (disks.length === 0) {
    const prefix = d.prefix;
    const diskMap = new Map<string, Record<string, string>>();
    for (const [name] of d.items) {
      let cleanName = name;
      if (prefix && cleanName.startsWith(prefix)) cleanName = cleanName.slice(prefix.length);
      const match = cleanName.match(/^(Physical Disk|Solid State Disk)\s+([\d:]+)\s+(.+)$/);
      if (match) {
        const diskId = `${match[1]} ${match[2]}`;
        if (!diskMap.has(diskId)) diskMap.set(diskId, { type: match[1] });
        const fields = diskMap.get(diskId)!;
        const field = match[3];
        const value = d.get(name);
        if (field === "Size") fields.size = value;
        else if (field === "Status") fields.status = value;
        else if (field === "Model name") fields.model = value;
        else if (field === "Serial number") fields.serial = value;
        else if (field === "Media type") fields.mediaType = value;
        else if (field === "S.M.A.R.T. Status") fields.smartStatus = value;
      }
    }
    let idx = 1;
    for (const [diskId, fields] of diskMap) {
      disks.push({
        id: idx++, size: fields.size || "", state: "", status: fields.status || "",
        manufacturer: "", model: fields.model || "", name: diskId,
        serial: fields.serial || "", mediaType: fields.mediaType || "", smartStatus: fields.smartStatus || "",
      });
    }
  }

  return disks;
}

export function extractRaid(d: IdracData) {
  const controller = {
    name: findValue(d, "RAID Controller : Name", "Integrated RAID Controller 1 Model"),
    status: findValue(d, "RAID Controller : Status", "Integrated RAID Controller 1 Status"),
    firmware: findValue(d, "RAID Controller : Firmware Version"),
    batteryStatus: findValue(d, "Battery on Integrated RAID Controller 1 Status"),
  };

  const volumes: { id: number; name: string; size: string; state: string; status: string; vdState: string; layoutType: string; readPolicy: string; writePolicy: string }[] = [];

  // Pattern 1: T440 — "Volume N : ..."
  for (let i = 1; i <= 10; i++) {
    const name = findValue(d, `Volume ${i} : Name`);
    if (!name) break;
    volumes.push({
      id: i, name,
      size: findValue(d, `Volume ${i} : Size`),
      state: findValue(d, `Volume ${i} : State`),
      status: findValue(d, `Volume ${i} : Status`),
      vdState: findValue(d, `Volume ${i} : Virtual Disk State`),
      layoutType: "", readPolicy: "", writePolicy: "",
    });
  }

  // Pattern 2: R720/R740 — virtual disks by name
  if (volumes.length === 0) {
    const prefix = d.prefix;
    const vdNames = new Set<string>();
    const vdFields = ["Size", "Status", "Layout type", "Read policy", "Write policy", "Current state"];
    // Patterns to exclude (not virtual disks)
    const excludePatterns = [
      /Temp/i, /Fan/i, /^PS\d/, /Power Supply/i, /System Board/i,
      /Inlet/i, /Exhaust/i, /CPU\d/i, /SNMP/i, /ICMP/i, /Firmware/i,
      /Hardware/i, /Battery/i, /Physical Disk/i, /Solid State Disk/i,
      /^NIC/i, /Processor/i, /BIOS/i, /CMOS/i, /Voltage/i, /LCD/i,
      /^Overall/i, /^RAID Controller/i, /^Integrated RAID/i,
      /Operating system/i, /Uptime/i, /System name/i, /System location/i,
      /System contact/i, /System description/i, /System object/i,
    ];
    for (const [name] of d.items) {
      let cleanName = name;
      if (prefix && cleanName.startsWith(prefix)) cleanName = cleanName.slice(prefix.length);
      for (const field of vdFields) {
        if (cleanName.endsWith(` ${field}`)) {
          const vdName = cleanName.slice(0, -(field.length + 1));
          if (vdName && !excludePatterns.some(p => p.test(vdName))) {
            vdNames.add(vdName);
          }
        }
      }
    }
    let idx = 1;
    for (const vdName of vdNames) {
      const size = findValue(d, `${vdName} Size`);
      const status = findValue(d, `${vdName} Status`);
      if (!size && !status) continue;
      volumes.push({
        id: idx++, name: vdName, size, state: findValue(d, `${vdName} Current state`),
        status, vdState: status,
        layoutType: findValue(d, `${vdName} Layout type`),
        readPolicy: findValue(d, `${vdName} Read policy`),
        writePolicy: findValue(d, `${vdName} Write policy`),
      });
    }
  }

  return { controller, volumes };
}

export function extractNics(d: IdracData) {
  const nics: { id: number; name: string; mac: string; connectionStatus: string; status: string; slot: string; speed?: string; bitsIn?: string; bitsOut?: string }[] = [];

  // Pattern 1: iDRAC — "NIC N : Name"
  for (let i = 1; i <= 20; i++) {
    const name = findValue(d, `NIC ${i} : Name`);
    if (!name) break;
    nics.push({
      id: i, name,
      mac: findValue(d, `NIC ${i} : MAC Address`),
      connectionStatus: findValue(d, `NIC ${i} : Connection Status`),
      status: findValue(d, `NIC ${i} : Status`),
      slot: findValue(d, `NIC ${i} : Slot`),
    });
  }

  // Pattern 2: Linux/SNMP — "Interface ethN(): ..."
  if (nics.length === 0) {
    const ifaceMap = new Map<string, Record<string, string>>();
    for (const [name] of d.items) {
      const match = name.match(/^Interface\s+(.+?)(?:\(.*?\))?:\s+(.+)$/);
      if (match) {
        const ifName = match[1];
        if (!ifaceMap.has(ifName)) ifaceMap.set(ifName, {});
        const fields = ifaceMap.get(ifName)!;
        const field = match[2];
        const value = d.get(name);
        if (field === "Operational status") fields.opStatus = value;
        else if (field === "Speed") fields.speed = value;
        else if (field === "Bits received") fields.bitsIn = value;
        else if (field === "Bits sent") fields.bitsOut = value;
        else if (field === "Interface type") fields.ifType = value;
      }
    }
    let idx = 1;
    for (const [ifName, fields] of ifaceMap) {
      nics.push({
        id: idx++, name: ifName, mac: "",
        connectionStatus: fields.opStatus || "",
        status: fields.opStatus || "",
        slot: fields.ifType || "",
        speed: fields.speed || "",
        bitsIn: fields.bitsIn || "",
        bitsOut: fields.bitsOut || "",
      });
    }
  }

  return nics;
}

export function extractInventory(d: IdracData) {
  return {
    model: findValue(d, "System Model", "Hardware model name"),
    assetTag: findValue(d, "System Asset Tag"),
    serviceCode: findValue(d, "System Express Service Code", "Hardware serial number"),
    biosVersion: findValue(d, "BIOS Version"),
    biosDate: findValue(d, "BIOS Date"),
    dracFirmware: findValue(d, "DRAC Firmware version", "Firmware version"),
    dracUrl: findValue(d, "DRAC Access URL"),
    dracVersion: findValue(d, "DRAC version"),
    systemName: findValue(d, "System name"),
    uptime: findValue(d, "Uptime (network)"),
    systemDescription: findValue(d, "System description"),
    systemLocation: findValue(d, "System location"),
    systemContact: findValue(d, "System contact details"),
    os: findValue(d, "Operating system"),
  };
}

export function extractStatus(d: IdracData) {
  return {
    overallStatus: findValue(d, "Overall System Status", "Overall system health status"),
    rollupStatus: findValue(d, "Overall System Rollup Status", "Overall system health status"),
    storageStatus: findValue(d, "Overall System Storage Status"),
    powerState: findValue(d, "Overall System Power State"),
    lcdStatus: findValue(d, "Overall System LCD Status"),
    cmosStatus: findValue(d, "CMOS Battery Status"),
    processor1Status: findValue(d, "Processor 1 Status"),
    processor2Status: findValue(d, "Processor 2 Status"),
    biosStatus: findValue(d, "System BIOS Status"),
    voltageStatus: findValue(d, "Voltage Status Combined"),
    snmpAvailability: findValue(d, "SNMP agent availability"),
    icmpPing: findValue(d, "ICMP ping"),
    icmpLoss: findValue(d, "ICMP loss"),
    icmpResponseTime: findValue(d, "ICMP response time"),
  };
}

/* ─── Memory extraction (T440 DIMMs) ────────────── */

export function extractMemory(d: IdracData) {
  const slots: { name: string; size: string; speed: string; manufacturer: string; partNumber: string; serial: string; status: string }[] = [];
  const prefix = d.prefix;
  const slotMap = new Map<string, Record<string, string>>();

  for (const [name] of d.items) {
    let cleanName = name;
    if (prefix && cleanName.startsWith(prefix)) cleanName = cleanName.slice(prefix.length);
    const match = cleanName.match(/^Memory Slot\s+(.+?)\s+(Size|Speed|Manufacturer|Part Number|Serial Number|Status)$/);
    if (match) {
      const slotName = match[1];
      if (!slotMap.has(slotName)) slotMap.set(slotName, {});
      slotMap.get(slotName)![match[2]] = d.get(name);
    }
  }

  for (const [slotName, fields] of slotMap) {
    if (!fields["Size"]) continue;
    slots.push({
      name: slotName, size: fields["Size"] || "", speed: fields["Speed"] || "",
      manufacturer: fields["Manufacturer"] || "", partNumber: fields["Part Number"] || "",
      serial: fields["Serial Number"] || "", status: fields["Status"] || "",
    });
  }

  return slots;
}

/* ─── Linux CPU extraction ──────────────────────── */

export function extractCpu(d: IdracData) {
  return {
    utilization: findValue(d, "CPU utilization"),
    idle: findValue(d, "CPU idle time"),
    user: findValue(d, "CPU user time"),
    system: findValue(d, "CPU system time"),
    iowait: findValue(d, "CPU iowait time"),
    steal: findValue(d, "CPU steal time"),
    interrupt: findValue(d, "CPU interrupt time"),
    softirq: findValue(d, "CPU softirq time"),
    nice: findValue(d, "CPU nice time"),
    guest: findValue(d, "CPU guest time"),
    loadAvg1: findValue(d, "Load average (1m avg)"),
    loadAvg5: findValue(d, "Load average (5m avg)"),
    loadAvg15: findValue(d, "Load average (15m avg)"),
    numCpus: findValue(d, "Number of CPUs"),
    contextSwitches: findValue(d, "Context switches per second"),
    interrupts: findValue(d, "Interrupts per second"),
  };
}

/* ─── Linux Memory extraction ───────────────────── */

export function extractLinuxMemory(d: IdracData) {
  return {
    total: findValue(d, "Total memory"),
    free: findValue(d, "Free memory"),
    cached: findValue(d, "Memory (cached)"),
    buffers: findValue(d, "Memory (buffers)"),
    totalSwap: findValue(d, "Total swap space"),
    freeSwap: findValue(d, "Free swap space"),
  };
}

/* ─── Filesystem extraction ─────────────────────── */

export function extractFilesystems(d: IdracData) {
  const filesystems: { mountpoint: string; total: string; used: string; }[] = [];
  const mountpoints = new Set<string>();

  for (const [name] of d.items) {
    const match = name.match(/^(.+?):\s+Total space$/);
    if (match) {
      mountpoints.add(match[1]);
    }
  }

  for (const mp of mountpoints) {
    filesystems.push({
      mountpoint: mp,
      total: d.get(`${mp}: Total space`),
      used: d.get(`${mp}: Used space`),
    });
  }

  return filesystems;
}
