export type StatusLevel = 'ok' | 'warning' | 'critical' | 'info';

/**
 * IDRAC-MIB-SMIv2::ObjectStatusEnum mapping:
 *   1=Other, 2=Unknown, 3=OK, 4=Non-critical, 5=Critical, 6=Non-recoverable
 *
 * StatusProbeEnum (fans, temps):
 *   3=ok, 4=nonCriticalUpper, 5=criticalUpper, 6=nonRecoverableUpper,
 *   7=nonCriticalLower, 8=criticalLower, 9=nonRecoverableLower, 10=failed
 */

const IDRAC_STATUS_LABELS: Record<number, { label: string; level: StatusLevel }> = {
  1:  { label: 'Other',            level: 'info' },
  2:  { label: 'Unknown',          level: 'info' },
  3:  { label: 'OK',               level: 'ok' },
  4:  { label: 'Non-critical',     level: 'warning' },
  5:  { label: 'Critical',         level: 'critical' },
  6:  { label: 'Non-recoverable',  level: 'critical' },
  7:  { label: 'Non-critical Low', level: 'warning' },
  8:  { label: 'Critical Low',     level: 'critical' },
  9:  { label: 'Non-recoverable Low', level: 'critical' },
  10: { label: 'Failed',           level: 'critical' },
};

export function parseStatus(raw: string): { text: string; level: StatusLevel } {
  const cleaned = raw.replace(/\s*\(\d+\)\s*$/, '').trim();
  const lower = cleaned.toLowerCase();

  // Dash/empty = info
  if (cleaned === '—' || cleaned === '' || cleaned === '-') {
    return { text: cleaned, level: 'info' };
  }

  // Match known OK keywords
  if (lower.includes('ok') || lower.includes('online') || lower.includes('up') || lower.includes('presence detected') || lower === 'on') {
    return { text: cleaned, level: 'ok' };
  }
  if (lower.includes('non-critical') || lower.includes('noncritical') || lower.includes('warning') || lower.includes('attention')) {
    return { text: cleaned, level: 'warning' };
  }
  if (lower.includes('critical') || lower.includes('non-recoverable') || lower.includes('nonrecoverable') || lower.includes('fail') || lower.includes('down') || lower.includes('error') || lower === 'off') {
    return { text: cleaned, level: 'critical' };
  }

  // Zabbix/iDRAC numeric codes (ObjectStatusEnum / StatusProbeEnum)
  const num = parseInt(cleaned, 10);
  if (!isNaN(num)) {
    const mapped = IDRAC_STATUS_LABELS[num];
    if (mapped) return { text: mapped.label, level: mapped.level };
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
