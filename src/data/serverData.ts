export type StatusLevel = 'ok' | 'warning' | 'critical' | 'info';

export interface ParsedStatus {
  text: string;
  level: StatusLevel;
}

/* ─── Helpers ─────────────────────────────────────── */

function clean(raw: string): string {
  return raw.replace(/\s*\(\d+\)\s*$/, '').trim();
}

function tryKeywords(lower: string): StatusLevel | null {
  if (lower.includes('ok') || lower.includes('online') || lower.includes('up') || lower.includes('presence detected') || lower === 'on' || lower === 'ready') return 'ok';
  if (lower.includes('non-critical') || lower.includes('noncritical') || lower.includes('warning') || lower.includes('attention') || lower.includes('degraded') || lower.includes('foreign')) return 'warning';
  if (lower.includes('critical') || lower.includes('non-recoverable') || lower.includes('nonrecoverable') || lower.includes('fail') || lower.includes('down') || lower.includes('error') || lower.includes('blocked') || lower.includes('offline') || lower === 'off') return 'critical';
  return null;
}

function fromMap(raw: string, map: Record<number, ParsedStatus>, fallback: StatusLevel = 'info'): ParsedStatus {
  const cleaned = clean(raw);
  if (cleaned === '' || cleaned === '—' || cleaned === '-') return { text: cleaned, level: 'info' };

  // Try text-based keywords first (Zabbix often returns "OK (3)" → cleaned to "OK")
  const lower = cleaned.toLowerCase();
  const kw = tryKeywords(lower);
  if (kw) return { text: cleaned, level: kw };

  // Try numeric lookup in specific valuemap
  const num = parseInt(cleaned, 10);
  if (!isNaN(num) && map[num]) return map[num];

  return { text: cleaned, level: fallback };
}

/* ════════════════════════════════════════════════════
   Specialized Parsers — one per Zabbix valuemap
   ════════════════════════════════════════════════════ */

/**
 * Dell Open Manage System Status / IDRAC-MIB-SMIv2::ObjectStatusEnum
 * Used for: Overall Status, Rollup, Storage, LCD, BIOS, RAID Controller,
 *           Fan Status, Temp Status, PSU Status, NIC Status, Memory Status,
 *           Processor Status, Voltage Status, Disk Status, Volume Status
 *
 * This is the DEFAULT and most common valuemap.
 */
const OBJECT_STATUS_MAP: Record<number, ParsedStatus> = {
  1:  { text: 'Other',            level: 'info' },
  2:  { text: 'Unknown',          level: 'info' },
  3:  { text: 'OK',               level: 'ok' },
  4:  { text: 'Non-critical',     level: 'warning' },
  5:  { text: 'Critical',         level: 'critical' },
  6:  { text: 'Non-recoverable',  level: 'critical' },
};
export function parseStatus(raw: string): ParsedStatus {
  return fromMap(raw, OBJECT_STATUS_MAP);
}

/**
 * IDRAC-MIB-SMIv2::StatusProbeEnum (fans, temps)
 * 3=ok, 4-6=upper thresholds, 7-9=lower thresholds, 10=failed
 */
const PROBE_STATUS_MAP: Record<number, ParsedStatus> = {
  ...OBJECT_STATUS_MAP,
  7:  { text: 'Non-critical Low', level: 'warning' },
  8:  { text: 'Critical Low',     level: 'critical' },
  9:  { text: 'Non-recoverable Low', level: 'critical' },
  10: { text: 'Failed',           level: 'critical' },
};
export function parseProbeStatus(raw: string): ParsedStatus {
  return fromMap(raw, PROBE_STATUS_MAP);
}

/**
 * DellPowerState
 * 1=Other, 2=Unknown, 3=Off, 4=On
 */
const POWER_STATE_MAP: Record<number, ParsedStatus> = {
  1: { text: 'Other',   level: 'info' },
  2: { text: 'Unknown', level: 'info' },
  3: { text: 'Off',     level: 'critical' },
  4: { text: 'On',      level: 'ok' },
};
export function parsePowerState(raw: string): ParsedStatus {
  return fromMap(raw, POWER_STATE_MAP);
}

/**
 * DellDracDiskState
 * 1=Unknown, 2=Ready, 3=Online, 4=Foreign, 5=Offline, 6=Blocked, 7=Failed, 8=Non-RAID, 9=Removed
 */
const DISK_STATE_MAP: Record<number, ParsedStatus> = {
  1: { text: 'Unknown',  level: 'info' },
  2: { text: 'Ready',    level: 'ok' },
  3: { text: 'Online',   level: 'ok' },
  4: { text: 'Foreign',  level: 'warning' },
  5: { text: 'Offline',  level: 'critical' },
  6: { text: 'Blocked',  level: 'critical' },
  7: { text: 'Failed',   level: 'critical' },
  8: { text: 'Non-RAID', level: 'info' },
  9: { text: 'Removed',  level: 'critical' },
};
export function parseDiskState(raw: string): ParsedStatus {
  return fromMap(raw, DISK_STATE_MAP);
}

/**
 * Dell iDRAC Network Connection Status
 * 1=Down, 2=Up
 */
const NET_CONN_MAP: Record<number, ParsedStatus> = {
  1: { text: 'Down', level: 'critical' },
  2: { text: 'Up',   level: 'ok' },
};
export function parseConnectionStatus(raw: string): ParsedStatus {
  return fromMap(raw, NET_CONN_MAP);
}

/**
 * DellRaidLevel
 * 1=Unknown, 2=RAID-0, 3=RAID-1, 4=RAID-5, 5=RAID-6, 6=RAID-10, 7=RAID-50, 8=RAID-60
 */
const RAID_LEVEL_MAP: Record<number, ParsedStatus> = {
  1: { text: 'Unknown', level: 'info' },
  2: { text: 'RAID-0',  level: 'ok' },
  3: { text: 'RAID-1',  level: 'ok' },
  4: { text: 'RAID-5',  level: 'ok' },
  5: { text: 'RAID-6',  level: 'ok' },
  6: { text: 'RAID-10', level: 'ok' },
  7: { text: 'RAID-50', level: 'ok' },
  8: { text: 'RAID-60', level: 'ok' },
  9: { text: 'Concat RAID-1', level: 'ok' },
  10: { text: 'Concat RAID-5', level: 'ok' },
};
export function parseRaidLevel(raw: string): ParsedStatus {
  return fromMap(raw, RAID_LEVEL_MAP);
}

/**
 * DellRaidVolumeState
 * 1=Unknown, 2=Online, 3=Failed, 4=Degraded
 */
const RAID_VOL_STATE_MAP: Record<number, ParsedStatus> = {
  1: { text: 'Unknown',  level: 'info' },
  2: { text: 'Online',   level: 'ok' },
  3: { text: 'Failed',   level: 'critical' },
  4: { text: 'Degraded', level: 'warning' },
};
export function parseRaidVolumeState(raw: string): ParsedStatus {
  return fromMap(raw, RAID_VOL_STATE_MAP);
}

/**
 * Dell PSU State Settings
 * 1=Unknown, 2=Online(disabled), 4=notReady, 8=FanFailure, 10=OnlineAndFanFailure,
 * 16=On, 242=OnlineAndOK
 */
const PSU_STATE_MAP: Record<number, ParsedStatus> = {
  1:   { text: 'Unknown',             level: 'info' },
  2:   { text: 'Online (disabled)',    level: 'warning' },
  4:   { text: 'Not Ready',           level: 'critical' },
  8:   { text: 'Fan Failure',         level: 'critical' },
  10:  { text: 'Online + Fan Failure', level: 'critical' },
  16:  { text: 'On',                  level: 'ok' },
  242: { text: 'Online and OK',       level: 'ok' },
};
export function parsePsuState(raw: string): ParsedStatus {
  return fromMap(raw, PSU_STATE_MAP);
}

/**
 * Dell PSU Sensor State
 * 1=Presence Detected, 2=PS Failure, 4=Predictive Failure, 8=PS AC lost,
 * 16=AC lost or out of range, 32=AC out of range but present
 */
const PSU_SENSOR_MAP: Record<number, ParsedStatus> = {
  1:  { text: 'Presence Detected',       level: 'ok' },
  2:  { text: 'PS Failure',              level: 'critical' },
  4:  { text: 'Predictive Failure',      level: 'warning' },
  8:  { text: 'PS AC Lost',              level: 'critical' },
  16: { text: 'AC Lost or Out of Range', level: 'critical' },
  32: { text: 'AC Out of Range',         level: 'warning' },
};
export function parsePsuSensorState(raw: string): ParsedStatus {
  return fromMap(raw, PSU_SENSOR_MAP);
}

/**
 * SNMP Agent Availability
 * 0=not available, 1=available, 2=unknown
 */
const SNMP_AVAIL_MAP: Record<number, ParsedStatus> = {
  0: { text: 'Not Available', level: 'critical' },
  1: { text: 'Available',     level: 'ok' },
  2: { text: 'Unknown',       level: 'info' },
};
export function parseSnmpAvailability(raw: string): ParsedStatus {
  return fromMap(raw, SNMP_AVAIL_MAP);
}

/**
 * IPMI Processor (Huawei 2288H)
 * 128=Presence Detected (OK), 0=no issue, >0 (excl 128)=fault
 */
export function parseIpmiProcessor(raw: string): ParsedStatus {
  const cleaned = clean(raw);
  if (cleaned === '' || cleaned === '—' || cleaned === '-') return { text: cleaned, level: 'info' };
  const kw = tryKeywords(cleaned.toLowerCase());
  if (kw) return { text: cleaned, level: kw };
  const num = parseInt(cleaned, 10);
  if (!isNaN(num)) {
    if (num === 128 || num === 0) return { text: 'OK', level: 'ok' };
    return { text: `Fault (${num})`, level: 'critical' };
  }
  return { text: cleaned, level: 'info' };
}

/**
 * IPMI Drive Slot (Huawei 2288H)
 * 0=not present, 1=Drive Present (OK), >1=fault
 */
export function parseIpmiDriveSlot(raw: string): ParsedStatus {
  const cleaned = clean(raw);
  if (cleaned === '' || cleaned === '—' || cleaned === '-') return { text: cleaned, level: 'info' };
  const kw = tryKeywords(cleaned.toLowerCase());
  if (kw) return { text: cleaned, level: kw };
  const num = parseInt(cleaned, 10);
  if (!isNaN(num)) {
    if (num === 0) return { text: 'Not Present', level: 'info' };
    if (num === 1) return { text: 'Present', level: 'ok' };
    return { text: `Fault (${num})`, level: 'critical' };
  }
  return { text: cleaned, level: 'info' };
}

/**
 * IPMI ACPI State (Huawei 2288H)
 * 1=S0/G0 Working (OK)
 */
export function parseAcpiState(raw: string): ParsedStatus {
  const cleaned = clean(raw);
  if (cleaned === '' || cleaned === '—' || cleaned === '-') return { text: cleaned, level: 'info' };
  const num = parseInt(cleaned, 10);
  if (!isNaN(num)) {
    if (num === 1) return { text: 'S0/G0 Working', level: 'ok' };
    return { text: `S${num}`, level: 'warning' };
  }
  return { text: cleaned, level: 'info' };
}

export const serverStatus = {
  overallStatus: 'OK (3)',
  rollupStatus: 'OK (3)',
  storageStatus: 'OK (3)',
  powerState: 'On (4)',
  lcdStatus: 'OK (3)',
};

export const temperatures = {
  cpu1: { value: '62 C', status: 'OK (3)', criticalHigh: '93 C', criticalLow: '3 C' },
  cpu2: { value: '58 C', status: 'OK (3)', criticalHigh: '93 C', criticalLow: '3 C' },
  inlet: { value: '24 C', status: 'OK (3)', criticalHigh: '47 C', criticalLow: '-7 C', warningHigh: '43 C', warningLow: '3 C' },
};

export const temperatureHistory = [
  { time: '14:00', cpu1: 60, cpu2: 56, inlet: 23 },
  { time: '14:30', cpu1: 61, cpu2: 57, inlet: 23 },
  { time: '15:00', cpu1: 63, cpu2: 59, inlet: 24 },
  { time: '15:30', cpu1: 62, cpu2: 58, inlet: 24 },
  { time: '16:00', cpu1: 61, cpu2: 57, inlet: 24 },
  { time: '16:30', cpu1: 62, cpu2: 58, inlet: 24 },
];

export const fans = [
  { name: 'Fan1', speed: '1320 rpm', speedNum: 1320, status: 'OK (3)' },
  { name: 'Fan2', speed: '1320 rpm', speedNum: 1320, status: 'OK (3)' },
];

export const powerSupplies = [
  { id: 1, status: 'OK (3)', voltage: '264 V', maxPower: '750 W', state: 'Online and OK (242)', sensorState: 'Presence Detected (1)' },
  { id: 2, status: 'OK (3)', voltage: '264 V', maxPower: '750 W', state: 'Online and OK (242)', sensorState: 'Presence Detected (1)' },
];

export const powerUsage = {
  minIdlePower: '376 W',
  sensorStatus: 'OK (3)',
};

export const disks = [
  { id: 1, size: '1.45 TB', state: 'Online (3)', status: 'OK (3)', manufacturer: 'LENOVO', model: 'MZILT1T6HAJQV3', name: 'Disk 0 in Backplane 1 of RAID Controller in Slot 4', serial: '' },
  { id: 2, size: '1.45 TB', state: 'Online (3)', status: 'OK (3)', manufacturer: 'LENOVO', model: 'MZILS1T6HEJHV3', name: 'Disk 1 in Backplane 1 of RAID Controller in Slot 4', serial: '' },
  { id: 3, size: '1.45 TB', state: 'Online (3)', status: 'OK (3)', manufacturer: 'LENOVO', model: 'MZILS1T6HEJHV3', name: 'Disk 2 in Backplane 1 of RAID Controller in Slot 4', serial: '' },
  { id: 4, size: '1.45 TB', state: 'Online (3)', status: 'OK (3)', manufacturer: 'LENOVO', model: 'MZILS1T6HEJHV3', name: 'Disk 3 in Backplane 1 of RAID Controller in Slot 4', serial: '' },
  { id: 5, size: '1.45 TB', state: 'Online (3)', status: 'OK (3)', manufacturer: 'LENOVO', model: 'MZILT1T6HBJRV3', name: 'Disk 4 in Backplane 1 of RAID Controller in Slot 4', serial: '' },
  { id: 6, size: '1.45 TB', state: 'Online (3)', status: 'OK (3)', manufacturer: 'LENOVO', model: 'MZILS1T6HEJHV3', name: 'Disk 5 in Backplane 1 of RAID Controller in Slot 4', serial: '' },
  { id: 7, size: '1.75 TB', state: 'Online (3)', status: 'OK (3)', manufacturer: 'SKhynix', model: 'HFS1T9G3H2X069N', name: 'Disk 6 in Backplane 1 of RAID Controller in Slot 4', serial: 'KDC2N4989I1102N0R' },
  { id: 8, size: '1.75 TB', state: 'Online (3)', status: 'OK (3)', manufacturer: 'SKhynix', model: 'HFS1T9G32FEH-BA1', name: 'Disk 7 in Backplane 1 of RAID Controller in Slot 4', serial: 'KJB3N7548I0104134' },
];

export const raidController = {
  name: 'PERC H730P Adapter (PCI Slot 4)',
  status: 'OK (3)',
  firmware: '25.5.9.0001',
};

export const volumes = [
  { id: 1, name: 'Virtual Disk 0 on RAID Controller in Slot 4', size: '4.36 TB', state: 'RAID-10 (6)', status: 'OK (3)', vdState: 'Online (2)' },
  { id: 2, name: 'Virtual Disk 1 on RAID Controller in Slot 4', size: '1.75 TB', state: 'RAID-1 (3)', status: 'OK (3)', vdState: 'Online (2)' },
];

export const nics = [
  { id: 1, name: 'Broadcom Gigabit Ethernet BCM5720 - 4C:D9:8F:AB:6A:F8', mac: '4C D9 8F AB 6A F8', connectionStatus: 'Down (1)', status: 'OK (3)' },
  { id: 2, name: 'Intel(R) Ethernet Converged Network Adapter X710 - F8:F2:1E:85:35:A1', mac: 'F8 F2 1E 85 35 A1', connectionStatus: 'Down (1)', status: 'OK (3)' },
  { id: 3, name: 'Intel(R) Ethernet Converged Network Adapter X710 - F8:F2:1E:85:35:A0', mac: 'F8 F2 1E 85 35 A0', connectionStatus: 'Down (1)', status: 'OK (3)' },
  { id: 4, name: 'Broadcom Gigabit Ethernet BCM5720 - B0:26:28:C4:99:6B', mac: 'B0 26 28 C4 99 6B', connectionStatus: 'Up (2)', status: 'OK (3)' },
  { id: 5, name: 'Broadcom Gigabit Ethernet BCM5720 - B0:26:28:C4:99:6A', mac: 'B0 26 28 C4 99 6A', connectionStatus: 'Up (2)', status: 'OK (3)' },
  { id: 6, name: 'Broadcom Gigabit Ethernet BCM5720 - 4C:D9:8F:AB:6A:F9', mac: '4C D9 8F AB 6A F9', connectionStatus: 'Up (2)', status: 'OK (3)' },
];

export const inventory = {
  model: 'PowerEdge T440',
  assetTag: '15L5423',
  serviceCode: '2514623691',
  biosVersion: '2.25.0',
  biosDate: '10/03/2025',
  dracFirmware: '7.00.00.183',
  dracUrl: 'https://172.16.10.70:443',
  dracVersion: 'iDRAC',
};
