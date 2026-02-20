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
  memTotal: string;
  memUsed: string;
  memPercent: number;
  diskRead: string;
  diskWrite: string;
  netIn: string;
  netOut: string;
  uptime: string;
  type?: string; // qemu, lxc
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

    vms.push({
      name: vmName,
      status: vmGet("Status"),
      cpuUsage: parsePercent(vmGet("CPU usage")),
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

  return {
    type: "proxmox",
    host: {
      fullName: `Proxmox VE — ${nodeName}`,
      model: "",
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
      cores: "",
      threads: "",
      frequency: "",
      model: "",
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

/* ─── Unified extractor ───────────────── */

export function extractVirtData(d: IdracData): VirtData | null {
  if (d.hostType === "vmware") return extractVMwareData(d);
  if (d.hostType === "proxmox") return extractProxmoxData(d);
  return null;
}
