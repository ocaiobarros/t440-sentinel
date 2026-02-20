import type { IdracData } from "./useIdracLive";

/* ═══════════════════════════════════════════════════
   Virtualization Data Extractors — VMware & Proxmox
   ═══════════════════════════════════════════════════ */

export interface VirtHostInfo {
  fullName: string;
  model: string;
  vendor: string;
  version: string;
  uptime: string;
  overallStatus: string;
  ping: string;
  datacenter: string;
  cluster: string;
  nodeName: string;
  pveVersion: string;
  kernelVersion: string;
  timezone: string;
}

export interface VirtCPU {
  cores: string;
  threads: string;
  frequency: string;
  model: string;
  usagePercent: number;
  iowait?: number;
}

export interface VirtMemory {
  total: string;
  used: string;
  usedPercent: number;
  ballooned?: string;
}

export interface VirtDatastore {
  name: string;
  totalSize: string;
  usedSize?: string;
  freePercent?: number;
  type?: string;
  content?: string;
  readLatency?: string;
  writeLatency?: string;
}

export interface VirtVM {
  name: string;
  status: string;
  cpuUsage: number;
  cpuUsageHz?: string;
  memTotal: string;
  memUsed: string;
  memPercent: number;
  diskRead: string;
  diskWrite: string;
  netIn: string;
  netOut: string;
  uptime: string;
  type?: string; // qemu, lxc, vmware-guest
  // VMware Guest extras
  vCpus?: string;
  cpuLatency?: string;
  cpuReadiness?: string;
  ballooned?: string;
  swapped?: string;
  compressed?: string;
  snapshotCount?: string;
  snapshotDate?: string;
  toolsStatus?: string;
  toolsVersion?: string;
  hypervisorName?: string;
  clusterName?: string;
  datacenter?: string;
  powerState?: string;
  committedStorage?: string;
  uncommittedStorage?: string;
}

export interface VirtNetwork {
  bytesIn: string;
  bytesOut: string;
}

export interface VirtData {
  type: "vmware" | "proxmox";
  host: VirtHostInfo;
  cpu: VirtCPU;
  memory: VirtMemory;
  network: VirtNetwork;
  datastores: VirtDatastore[];
  vms: VirtVM[];
  vmCount: number;
  runningCount: number;
  powerUsage?: string;
}

/* ─── Helpers ─────────────────────────── */

function parsePercent(val: string): number {
  if (!val) return 0;
  const m = val.match(/([\d.]+)\s*%?/);
  return m ? parseFloat(m[1]) : 0;
}

function parseBytes(val: string): number {
  if (!val) return 0;
  const m = val.match(/([\d.]+)\s*(B|KB|MB|GB|TB|KiB|MiB|GiB|TiB)?/i);
  if (!m) return 0;
  const num = parseFloat(m[1]);
  const unit = (m[2] || "B").toUpperCase();
  const multipliers: Record<string, number> = {
    B: 1, KB: 1e3, KIB: 1024, MB: 1e6, MIB: 1024 ** 2,
    GB: 1e9, GIB: 1024 ** 3, TB: 1e12, TIB: 1024 ** 4,
  };
  return num * (multipliers[unit] || 1);
}

/* ─── VMware Extraction ───────────────── */

export function extractVMwareData(d: IdracData): VirtData {
  const get = (suffix: string) =>
    d.get(`VMware: ${suffix}`) || d.get(`VMware:${suffix}`);

  // Datastores
  const dsNames = new Set<string>();
  for (const [name] of d.items) {
    const m = name.match(/^VMware: (?:Free space|Total size|Average (?:read|write) latency) (?:on|of) (?:the )?datastore (.+?)(?:\s+\(percentage\))?$/);
    if (m) dsNames.add(m[1]);
  }

  const datastores: VirtDatastore[] = [];
  for (const dsName of dsNames) {
    const freeStr = get(`Free space on datastore ${dsName} (percentage)`);
    const freePct = parsePercent(freeStr);
    datastores.push({
      name: dsName,
      totalSize: get(`Total size of datastore ${dsName}`),
      freePercent: freePct,
      readLatency: get(`Average read latency of the datastore ${dsName}`),
      writeLatency: get(`Average write latency of the datastore ${dsName}`),
    });
  }

  const cpuPct = parsePercent(get("CPU usage in percents") || get("CPU utilization"));
  const memTotal = get("Total memory");
  const memUsed = get("Used memory");
  const memPct = memTotal && memUsed
    ? (parseBytes(memUsed) / parseBytes(memTotal)) * 100
    : 0;

  return {
    type: "vmware",
    host: {
      fullName: get("Full name"),
      model: get("Model"),
      vendor: get("Vendor"),
      version: get("Version"),
      uptime: get("Uptime") || d.get("VMware:Uptime"),
      overallStatus: get("Overall status"),
      ping: get("Hypervisor ping"),
      datacenter: get("Datacenter name"),
      cluster: get("Cluster name"),
      nodeName: "",
      pveVersion: "",
      kernelVersion: "",
      timezone: "",
    },
    cpu: {
      cores: get("CPU cores"),
      threads: get("CPU threads"),
      frequency: get("CPU frequency"),
      model: get("CPU model"),
      usagePercent: cpuPct,
    },
    memory: {
      total: memTotal,
      used: memUsed,
      usedPercent: Math.min(memPct, 100),
      ballooned: get("Ballooned memory"),
    },
    network: {
      bytesIn: get("Number of bytes received"),
      bytesOut: get("Number of bytes transmitted"),
    },
    datastores,
    vms: [],
    vmCount: parseInt(get("Number of guest VMs") || "0", 10),
    runningCount: parseInt(get("Number of guest VMs") || "0", 10),
    powerUsage: get("Power usage"),
  };
}

/* ─── Proxmox Extraction ──────────────── */

export function extractProxmoxData(d: IdracData): VirtData {
  // Try to extract CPU frequency from host inventory
  let inventoryFreqHz = 0;
  if (d.inventory) {
    const invStr = [d.inventory.model, d.inventory.hardware, d.inventory.hardware_full, d.inventory.type].filter(Boolean).join(" ");
    const freqMatch = invStr.match(/@?\s*([\d.]+)\s*(GHz|MHz)/i);
    if (freqMatch) {
      const mult = freqMatch[2].toLowerCase() === "ghz" ? 1e9 : 1e6;
      inventoryFreqHz = parseFloat(freqMatch[1]) * mult;
    }
    console.log(`[PVE] Inventory freq: ${inventoryFreqHz} Hz from "${invStr}"`);
  }

  // Detect node name
  let nodeName = "";
  for (const [name] of d.items) {
    const m = name.match(/^Proxmox: Node \[(.+?)\]:/);
    if (m) { nodeName = m[1]; break; }
  }

  const nodeGet = (metric: string) =>
    d.get(`Proxmox: Node [${nodeName}]: ${metric}`);

  // Storage pools
  const storageKeys = new Set<string>();
  for (const [name] of d.items) {
    const m = name.match(/^Proxmox: Storage \[(.+?)\]: (?:Size|Used|Type|Content)$/);
    if (m) storageKeys.add(m[1]);
  }

  const storages: VirtDatastore[] = [];
  for (const key of storageKeys) {
    const parts = key.split("/");
    storages.push({
      name: parts[1] || key,
      totalSize: d.get(`Proxmox: Storage [${key}]: Size`),
      usedSize: d.get(`Proxmox: Storage [${key}]: Used`),
      type: d.get(`Proxmox: Storage [${key}]: Type`),
      content: d.get(`Proxmox: Storage [${key}]: Content`),
    });
  }

  // VMs — collect unique full keys like "pve-cgr01/67-smtprelay (qemu/39102)"
  const vmFullKeys = new Set<string>();
  for (const [name] of d.items) {
    const m = name.match(/^Proxmox: VM \[(.+?\(.+?\))\]: /);
    if (m) vmFullKeys.add(m[1]);
  }

  const vms: VirtVM[] = [];
  for (const fullKey of vmFullKeys) {
    const vmGet = (metric: string) => d.get(`Proxmox: VM [${fullKey}]: ${metric}`);
    // Parse name: "pve-cgr01/67-smtprelay (qemu/39102)"
    const nameMatch = fullKey.match(/^.+?\/(.+?)\s+\((.+?)\/.+?\)$/);
    const vmName = nameMatch ? nameMatch[1] : fullKey;
    const vmType = nameMatch ? nameMatch[2] : "qemu";

    const memTotalStr = vmGet("Memory total");
    const memUsedStr = vmGet("Memory usage");
    const memPct = memTotalStr && memUsedStr
      ? (parseBytes(memUsedStr) / parseBytes(memTotalStr)) * 100
      : 0;

    // Try to find CPU usage in Hz for this VM
    let vmCpuHz = "";
    for (const [itemName, item] of d.items) {
      if (itemName.startsWith(`Proxmox: VM [${fullKey}]:`) && itemName.toLowerCase().includes("cpu")) {
        const unit = (item.units || "").toLowerCase();
        if (unit === "hz" || unit === "mhz" || unit === "ghz") {
          vmCpuHz = item.lastvalue || "";
          break;
        }
      }
    }

    // Get vCPU count for Proxmox VMs
    const vmCpus = vmGet("CPUs") || vmGet("CPU count") || vmGet("Processors") || "";

    vms.push({
      name: vmName,
      status: vmGet("Status"),
      cpuUsage: parsePercent(vmGet("CPU usage")),
      cpuUsageHz: vmCpuHz,
      vCpus: vmCpus,
      memTotal: memTotalStr,
      memUsed: memUsedStr,
      memPercent: Math.min(memPct, 100),
      diskRead: vmGet("Disk read, rate"),
      diskWrite: vmGet("Disk write, rate"),
      netIn: vmGet("Incoming data, rate"),
      netOut: vmGet("Outgoing data, rate"),
      uptime: vmGet("Uptime"),
      type: vmType,
    });
  }

  vms.sort((a, b) => a.name.localeCompare(b.name));

  const cpuPct = parsePercent(nodeGet("CPU, usage"));
  const memTotal = nodeGet("Memory, total");
  const memUsed = nodeGet("Memory, used");
  const memPct = memTotal && memUsed
    ? (parseBytes(memUsed) / parseBytes(memTotal)) * 100
    : 0;

  const runningCount = vms.filter(vm => vm.status === "running").length;

  // Try to discover CPU frequency from node items or inventory
  let cpuFrequency = nodeGet("CPU, frequency") || nodeGet("CPU frequency") || "";
  let cpuModel = nodeGet("CPU, model") || nodeGet("CPU model") || "";
  const cpuCores = nodeGet("CPU, cores") || nodeGet("Cores") || "";
  const cpuThreads = nodeGet("CPU, threads") || nodeGet("Threads") || "";
  
  // Scan node items for frequency/model
  if (!cpuFrequency || !cpuModel) {
    for (const [name, item] of d.items) {
      const nameLower = name.toLowerCase();
      if (!cpuModel && nameLower.includes("cpu") && nameLower.includes("model")) {
        cpuModel = item.lastvalue || "";
      }
    }
  }
  
  // Extract frequency from CPU model string or inventory
  if (!cpuFrequency && cpuModel) {
    const freqMatch = cpuModel.match(/@?\s*([\d.]+)\s*(GHz|MHz)/i);
    if (freqMatch) {
      const mult = freqMatch[2].toLowerCase() === "ghz" ? 1e9 : 1e6;
      cpuFrequency = String(parseFloat(freqMatch[1]) * mult);
    }
  }
  
  // Use inventory frequency as fallback
  if (!cpuFrequency && inventoryFreqHz > 0) {
    cpuFrequency = String(inventoryFreqHz);
  }

  return {
    type: "proxmox",
    host: {
      fullName: `Proxmox VE — ${nodeName}`,
      model: cpuModel,
      vendor: "Proxmox",
      version: nodeGet("PVE version"),
      uptime: nodeGet("Uptime"),
      overallStatus: nodeGet("Status"),
      ping: d.get("Proxmox: API service status"),
      datacenter: "",
      cluster: "",
      nodeName,
      pveVersion: nodeGet("PVE version"),
      kernelVersion: nodeGet("Kernel version"),
      timezone: nodeGet("Time zone"),
    },
    cpu: {
      cores: cpuCores,
      threads: cpuThreads,
      frequency: cpuFrequency,
      model: cpuModel,
      usagePercent: cpuPct,
      iowait: parsePercent(nodeGet("CPU, iowait")),
    },
    memory: {
      total: memTotal,
      used: memUsed,
      usedPercent: Math.min(memPct, 100),
    },
    network: {
      bytesIn: nodeGet("Incoming data, rate"),
      bytesOut: nodeGet("Outgoing data, rate"),
    },
    datastores: storages,
    vms,
    vmCount: vms.length,
    runningCount,
  };
}

/* ─── VMware Guest Extraction ─────────── */

export function extractVMwareGuestData(d: IdracData): VirtData {
  const get = (name: string) => d.get(name);

  const cpuPct = parsePercent(get("CPU usage in percent"));
  const memTotal = get("Memory size");
  const memUsedHost = get("Host memory usage in percent");
  const memPct = parsePercent(memUsedHost);

  // Determine VM status from "VM state" (index: 0=notRunning,1=resetting,2=running,3=shuttingDown,4=standby,5=unknown)
  const vmStateRaw = get("VM state");
  let vmStatus = "unknown";
  if (vmStateRaw === "2" || vmStateRaw?.toLowerCase() === "running") vmStatus = "running";
  else if (vmStateRaw === "0" || vmStateRaw?.toLowerCase()?.includes("not")) vmStatus = "stopped";
  else if (vmStateRaw === "3") vmStatus = "shutting down";
  else if (vmStateRaw === "4") vmStatus = "standby";
  else if (vmStateRaw === "1") vmStatus = "resetting";

  // Discover CPU usage in Hz (scan all items for Hz-unit CPU items)
  let cpuUsageHzValue = "";
  for (const [name, item] of d.items) {
    const nameLower = name.toLowerCase();
    if (nameLower.includes("cpu") && nameLower.includes("usage") && !nameLower.includes("percent") && !nameLower.includes("latency") && !nameLower.includes("readiness")) {
      const unit = (item.units || "").toLowerCase();
      if (unit === "hz" || unit === "mhz" || unit === "ghz" || (!unit && parseFloat(item.lastvalue) > 1000)) {
        cpuUsageHzValue = item.lastvalue || "";
        break;
      }
    }
  }

  // Discover network interfaces
  let totalNetIn = 0, totalNetOut = 0;
  for (const [name, item] of d.items) {
    const mIn = name.match(/^Number of bytes received on interface/);
    if (mIn && item.units?.toLowerCase()?.includes("bps")) totalNetIn += parseFloat(item.lastvalue || "0");
    const mOut = name.match(/^Number of bytes transmitted on interface/);
    if (mOut && item.units?.toLowerCase()?.includes("bps")) totalNetOut += parseFloat(item.lastvalue || "0");
  }

  // Discover disk devices
  let totalDiskRead = 0, totalDiskWrite = 0;
  for (const [name, item] of d.items) {
    if (name.match(/^Average number of bytes read from the disk/)) totalDiskRead += parseFloat(item.lastvalue || "0");
    if (name.match(/^Average number of bytes written to the disk/)) totalDiskWrite += parseFloat(item.lastvalue || "0");
  }

  // Discover filesystems as "datastores"
  const fsNames = new Set<string>();
  for (const [name] of d.items) {
    const m = name.match(/^(?:Free|Total|Used) disk space on \[(.+?)\]/);
    if (m) fsNames.add(m[1]);
  }
  const datastores: VirtDatastore[] = [];
  for (const fs of fsNames) {
    const totalStr = get(`Total disk space on [${fs}]`);
    const freeStr = get(`Free disk space on [${fs}] (percentage)`);
    datastores.push({
      name: fs,
      totalSize: totalStr,
      freePercent: parsePercent(freeStr),
    });
  }

  // Build the host name from the Zabbix host or a combination
  const hvName = get("Hypervisor name") || "";
  const clusterName = get("Cluster name") || "";
  const dcName = get("Datacenter name") || "";

  // Use the Zabbix host name — we don't have a direct "VM name" item, 
  // so we derive it from the host's visible name
  const vmName = d.items.values().next()?.value?.name?.split(":")?.[0]?.trim() || "VM";
  // Actually use cluster/hv info for context; the VM name is the host itself
  // We'll use a generic approach — the host name from config is the VM name

  const vm: VirtVM = {
    name: "This VM", // Will be overridden by the page using config.hostName
    status: vmStatus,
    cpuUsage: cpuPct,
    cpuUsageHz: cpuUsageHzValue || get("CPU usage") || "",
    memTotal,
    memUsed: get("Guest memory usage") || get("Host memory usage"),
    memPercent: Math.min(memPct, 100),
    diskRead: totalDiskRead > 0 ? String(totalDiskRead) : "",
    diskWrite: totalDiskWrite > 0 ? String(totalDiskWrite) : "",
    netIn: totalNetIn > 0 ? String(totalNetIn) : "",
    netOut: totalNetOut > 0 ? String(totalNetOut) : "",
    uptime: get("Uptime") || get("Uptime of guest OS"),
    type: "vmware-guest",
    vCpus: get("Number of virtual CPUs"),
    cpuLatency: get("CPU latency in percent"),
    cpuReadiness: get("CPU readiness latency in percent"),
    ballooned: get("Ballooned memory"),
    swapped: get("Swapped memory"),
    compressed: get("Compressed memory"),
    snapshotCount: get("Snapshot count"),
    snapshotDate: get("Snapshot latest date"),
    toolsStatus: get("VMware Tools status"),
    toolsVersion: get("VMware Tools version"),
    hypervisorName: hvName,
    clusterName,
    datacenter: dcName,
    powerState: get("Power state"),
    committedStorage: get("Committed storage space"),
    uncommittedStorage: get("Uncommitted storage space"),
  };

  return {
    type: "vmware",
    host: {
      fullName: hvName || "VMware Guest",
      model: "",
      vendor: "VMware",
      version: get("VMware Tools version") || "",
      uptime: vm.uptime,
      overallStatus: vmStatus,
      ping: "",
      datacenter: dcName,
      cluster: clusterName,
      nodeName: "",
      pveVersion: "",
      kernelVersion: "",
      timezone: "",
    },
    cpu: {
      cores: "",
      threads: "",
      frequency: "",
      model: "",
      usagePercent: cpuPct,
    },
    memory: {
      total: memTotal,
      used: vm.memUsed,
      usedPercent: vm.memPercent,
      ballooned: get("Ballooned memory"),
    },
    network: {
      bytesIn: vm.netIn,
      bytesOut: vm.netOut,
    },
    datastores,
    vms: [vm],
    vmCount: 1,
    runningCount: vmStatus === "running" ? 1 : 0,
  };
}

/* ─── Unified extractor ───────────────── */

export function extractVirtData(d: IdracData): VirtData | null {
  if (d.hostType === "vmware") return extractVMwareData(d);
  if (d.hostType === "vmware-guest") return extractVMwareGuestData(d);
  if (d.hostType === "proxmox") return extractProxmoxData(d);
  return null;
}
