/**
 * Global Unit Library — Grafana-parity unit formatting with smart scaling.
 * Each unit category contains units with scaling steps for dynamic prefix switching.
 */

export interface ScaleStep {
  factor: number;   // divide raw value by this
  suffix: string;   // display suffix
}

export interface UnitDef {
  id: string;        // unique key e.g. "data_rate/bps"
  label: string;     // human display label
  category: string;  // category id
  steps: ScaleStep[];// ordered ascending by factor — formatter picks best fit
}

export interface UnitCategory {
  id: string;
  label: string;
  icon: string;      // emoji
  units: UnitDef[];
}

// ── Helper to build linear scale steps ──
function linearSteps(base: number, suffixes: string[]): ScaleStep[] {
  return suffixes.map((s, i) => ({ factor: Math.pow(base, i), suffix: s }));
}

// ────────────────────────── CATEGORIES ──────────────────────────

export const UNIT_CATEGORIES: UnitCategory[] = [
  {
    id: "none",
    label: "Sem unidade",
    icon: "🔢",
    units: [
      { id: "none/number", label: "Número", category: "none", steps: [{ factor: 1, suffix: "" }] },
      { id: "none/short", label: "Short (K/M/B)", category: "none", steps: linearSteps(1000, ["", " K", " M", " B", " T"]) },
      { id: "none/percent", label: "Percentual (%)", category: "none", steps: [{ factor: 1, suffix: "%" }] },
      { id: "none/percent01", label: "Percentual (0.0-1.0)", category: "none", steps: [{ factor: 0.01, suffix: "%" }] },
    ],
  },
  {
    id: "data_rate",
    label: "Data Rate",
    icon: "📶",
    units: [
      { id: "data_rate/bps", label: "bits/sec", category: "data_rate", steps: linearSteps(1000, [" bps", " Kbps", " Mbps", " Gbps", " Tbps"]) },
      { id: "data_rate/Bps", label: "bytes/sec", category: "data_rate", steps: linearSteps(1024, [" B/s", " KB/s", " MB/s", " GB/s", " TB/s"]) },
      { id: "data_rate/pps", label: "packets/sec", category: "data_rate", steps: linearSteps(1000, [" pps", " Kpps", " Mpps"]) },
    ],
  },
  {
    id: "data",
    label: "Data (bytes)",
    icon: "💾",
    units: [
      { id: "data/bytes_iec", label: "bytes (IEC)", category: "data", steps: linearSteps(1024, [" B", " KiB", " MiB", " GiB", " TiB", " PiB"]) },
      { id: "data/bytes_si", label: "bytes (SI)", category: "data", steps: linearSteps(1000, [" B", " KB", " MB", " GB", " TB", " PB"]) },
      { id: "data/bits_iec", label: "bits (IEC)", category: "data", steps: linearSteps(1024, [" b", " Kib", " Mib", " Gib"]) },
      { id: "data/bits_si", label: "bits (SI)", category: "data", steps: linearSteps(1000, [" b", " Kb", " Mb", " Gb"]) },
    ],
  },
  {
    id: "time",
    label: "Time",
    icon: "⏱️",
    units: [
      { id: "time/ns", label: "nanosegundos (ns)", category: "time", steps: [{ factor: 1, suffix: " ns" }, { factor: 1e3, suffix: " µs" }, { factor: 1e6, suffix: " ms" }, { factor: 1e9, suffix: " s" }] },
      { id: "time/us", label: "microssegundos (µs)", category: "time", steps: [{ factor: 1, suffix: " µs" }, { factor: 1e3, suffix: " ms" }, { factor: 1e6, suffix: " s" }] },
      { id: "time/ms", label: "milissegundos (ms)", category: "time", steps: [{ factor: 1, suffix: " ms" }, { factor: 1e3, suffix: " s" }, { factor: 60e3, suffix: " min" }] },
      { id: "time/s", label: "segundos (s)", category: "time", steps: [{ factor: 1, suffix: " s" }, { factor: 60, suffix: " min" }, { factor: 3600, suffix: " h" }, { factor: 86400, suffix: " d" }] },
      { id: "time/min", label: "minutos", category: "time", steps: [{ factor: 1, suffix: " min" }, { factor: 60, suffix: " h" }, { factor: 1440, suffix: " d" }] },
      { id: "time/hour", label: "horas", category: "time", steps: [{ factor: 1, suffix: " h" }, { factor: 24, suffix: " d" }] },
      { id: "time/day", label: "dias", category: "time", steps: [{ factor: 1, suffix: " d" }] },
      { id: "time/uptime", label: "uptime (Xd Yh)", category: "time", steps: [] },  // special
    ],
  },
  {
    id: "temperature",
    label: "Temperature",
    icon: "🌡️",
    units: [
      { id: "temperature/celsius", label: "Celsius (°C)", category: "temperature", steps: [{ factor: 1, suffix: " °C" }] },
      { id: "temperature/fahrenheit", label: "Fahrenheit (°F)", category: "temperature", steps: [{ factor: 1, suffix: " °F" }] },
      { id: "temperature/kelvin", label: "Kelvin (K)", category: "temperature", steps: [{ factor: 1, suffix: " K" }] },
    ],
  },
  {
    id: "voltage",
    label: "Voltage",
    icon: "⚡",
    units: [
      { id: "voltage/mV", label: "millivolts (mV)", category: "voltage", steps: [{ factor: 1, suffix: " mV" }, { factor: 1e3, suffix: " V" }, { factor: 1e6, suffix: " kV" }] },
      { id: "voltage/V", label: "volts (V)", category: "voltage", steps: [{ factor: 1, suffix: " V" }, { factor: 1e3, suffix: " kV" }] },
      { id: "voltage/kV", label: "kilovolts (kV)", category: "voltage", steps: [{ factor: 1, suffix: " kV" }] },
    ],
  },
  {
    id: "current",
    label: "Current",
    icon: "🔌",
    units: [
      { id: "current/mA", label: "milliamps (mA)", category: "current", steps: [{ factor: 1, suffix: " mA" }, { factor: 1e3, suffix: " A" }] },
      { id: "current/A", label: "amperes (A)", category: "current", steps: [{ factor: 1, suffix: " A" }, { factor: 1e3, suffix: " kA" }] },
    ],
  },
  {
    id: "power",
    label: "Power / Energy",
    icon: "🔋",
    units: [
      { id: "power/W", label: "watts (W)", category: "power", steps: [{ factor: 1, suffix: " W" }, { factor: 1e3, suffix: " kW" }, { factor: 1e6, suffix: " MW" }] },
      { id: "power/kW", label: "kilowatts (kW)", category: "power", steps: [{ factor: 1, suffix: " kW" }, { factor: 1e3, suffix: " MW" }] },
      { id: "power/VA", label: "volt-amperes (VA)", category: "power", steps: [{ factor: 1, suffix: " VA" }, { factor: 1e3, suffix: " kVA" }] },
      { id: "power/Wh", label: "watt-hours (Wh)", category: "power", steps: [{ factor: 1, suffix: " Wh" }, { factor: 1e3, suffix: " kWh" }, { factor: 1e6, suffix: " MWh" }] },
      { id: "power/dBm", label: "decibel-milliwatts (dBm)", category: "power", steps: [{ factor: 1, suffix: " dBm" }] },
    ],
  },
  {
    id: "frequency",
    label: "Frequency / RPM",
    icon: "🔄",
    units: [
      { id: "frequency/Hz", label: "hertz (Hz)", category: "frequency", steps: [{ factor: 1, suffix: " Hz" }, { factor: 1e3, suffix: " kHz" }, { factor: 1e6, suffix: " MHz" }, { factor: 1e9, suffix: " GHz" }] },
      { id: "frequency/rpm", label: "RPM", category: "frequency", steps: [{ factor: 1, suffix: " RPM" }, { factor: 1e3, suffix: " kRPM" }] },
    ],
  },
  {
    id: "pressure",
    label: "Pressure",
    icon: "🌊",
    units: [
      { id: "pressure/Pa", label: "pascals (Pa)", category: "pressure", steps: [{ factor: 1, suffix: " Pa" }, { factor: 1e3, suffix: " kPa" }, { factor: 1e6, suffix: " MPa" }] },
      { id: "pressure/bar", label: "bar", category: "pressure", steps: [{ factor: 1, suffix: " bar" }, { factor: 1e3, suffix: " kbar" }] },
      { id: "pressure/psi", label: "PSI", category: "pressure", steps: [{ factor: 1, suffix: " PSI" }] },
      { id: "pressure/hPa", label: "hectopascals (hPa)", category: "pressure", steps: [{ factor: 1, suffix: " hPa" }] },
    ],
  },
  {
    id: "flow",
    label: "Flow",
    icon: "💧",
    units: [
      { id: "flow/lpm", label: "litros/min (L/min)", category: "flow", steps: [{ factor: 1, suffix: " L/min" }] },
      { id: "flow/m3h", label: "m³/h", category: "flow", steps: [{ factor: 1, suffix: " m³/h" }] },
      { id: "flow/cfm", label: "CFM", category: "flow", steps: [{ factor: 1, suffix: " CFM" }] },
      { id: "flow/gpm", label: "gal/min (GPM)", category: "flow", steps: [{ factor: 1, suffix: " GPM" }] },
    ],
  },
  {
    id: "force",
    label: "Force / Mass",
    icon: "⚖️",
    units: [
      { id: "force/N", label: "newtons (N)", category: "force", steps: [{ factor: 1, suffix: " N" }, { factor: 1e3, suffix: " kN" }] },
      { id: "force/g", label: "gramas (g)", category: "force", steps: [{ factor: 1, suffix: " g" }, { factor: 1e3, suffix: " kg" }, { factor: 1e6, suffix: " t" }] },
      { id: "force/kg", label: "quilogramas (kg)", category: "force", steps: [{ factor: 1, suffix: " kg" }, { factor: 1e3, suffix: " t" }] },
      { id: "force/lb", label: "pounds (lb)", category: "force", steps: [{ factor: 1, suffix: " lb" }] },
    ],
  },
  {
    id: "length",
    label: "Length / Distance",
    icon: "📏",
    units: [
      { id: "length/mm", label: "milímetros (mm)", category: "length", steps: [{ factor: 1, suffix: " mm" }, { factor: 1e3, suffix: " m" }, { factor: 1e6, suffix: " km" }] },
      { id: "length/m", label: "metros (m)", category: "length", steps: [{ factor: 1, suffix: " m" }, { factor: 1e3, suffix: " km" }] },
      { id: "length/km", label: "quilômetros (km)", category: "length", steps: [{ factor: 1, suffix: " km" }] },
      { id: "length/ft", label: "feet (ft)", category: "length", steps: [{ factor: 1, suffix: " ft" }, { factor: 5280, suffix: " mi" }] },
    ],
  },
  {
    id: "velocity",
    label: "Velocity",
    icon: "🏎️",
    units: [
      { id: "velocity/ms", label: "m/s", category: "velocity", steps: [{ factor: 1, suffix: " m/s" }] },
      { id: "velocity/kmh", label: "km/h", category: "velocity", steps: [{ factor: 1, suffix: " km/h" }] },
      { id: "velocity/mph", label: "mph", category: "velocity", steps: [{ factor: 1, suffix: " mph" }] },
      { id: "velocity/kn", label: "knots", category: "velocity", steps: [{ factor: 1, suffix: " kn" }] },
    ],
  },
  {
    id: "humidity",
    label: "Humidity / Environment",
    icon: "💦",
    units: [
      { id: "humidity/rh", label: "% Umidade Relativa", category: "humidity", steps: [{ factor: 1, suffix: "% RH" }] },
      { id: "humidity/dB", label: "decibéis (dB)", category: "humidity", steps: [{ factor: 1, suffix: " dB" }] },
      { id: "humidity/lux", label: "lux", category: "humidity", steps: [{ factor: 1, suffix: " lux" }, { factor: 1e3, suffix: " klux" }] },
    ],
  },
];

// ── Flat lookup maps ──
const _unitMap = new Map<string, UnitDef>();
for (const cat of UNIT_CATEGORIES) {
  for (const u of cat.units) _unitMap.set(u.id, u);
}

export function getUnitById(id: string): UnitDef | undefined {
  return _unitMap.get(id);
}

export function getAllUnitsFlat(): UnitDef[] {
  return Array.from(_unitMap.values());
}

// ── Zabbix unit → library unit mapping ──
const ZABBIX_UNIT_MAP: Record<string, string> = {
  // Data rate
  "bps": "data_rate/bps", "bits/s": "data_rate/bps", "b/s": "data_rate/bps",
  "Bps": "data_rate/Bps", "bytes/s": "data_rate/Bps", "B/s": "data_rate/Bps",
  // Data
  "B": "data/bytes_iec", "bytes": "data/bytes_iec",
  // Time
  "s": "time/s", "ms": "time/ms", "us": "time/us", "µs": "time/us", "ns": "time/ns",
  "uptime": "time/uptime",
  // Temperature
  "°C": "temperature/celsius", "C": "temperature/celsius",
  "°F": "temperature/fahrenheit", "F": "temperature/fahrenheit",
  "K": "temperature/kelvin",
  // Voltage
  "V": "voltage/V", "mV": "voltage/mV", "kV": "voltage/kV",
  // Current
  "A": "current/A", "mA": "current/mA", "amp": "current/A",
  // Power
  "W": "power/W", "kW": "power/kW", "VA": "power/VA",
  "Wh": "power/Wh", "kWh": "power/Wh",
  "dBm": "power/dBm",
  // Frequency
  "Hz": "frequency/Hz", "rpm": "frequency/rpm", "RPM": "frequency/rpm",
  // Pressure
  "Pa": "pressure/Pa", "hPa": "pressure/hPa", "bar": "pressure/bar", "psi": "pressure/psi", "PSI": "pressure/psi",
  // Percent
  "%": "none/percent",
  // dB
  "dB": "humidity/dB",
};

/** Map a Zabbix unit string to the best matching library unit ID */
export function mapZabbixUnit(zabbixUnit: string): string | null {
  const trimmed = (zabbixUnit || "").trim();
  return ZABBIX_UNIT_MAP[trimmed] ?? null;
}

// ── Smart formatter ──

export interface SmartFormatResult {
  display: string;
  suffix: string;
  numericValue: number | null;
}

/**
 * Format a value using a unit from the library with dynamic scaling.
 * Special handling for uptime (Xd Yh Zm).
 */
export function formatWithUnit(
  rawValue: unknown,
  unitId: string,
  decimals = 2,
): SmartFormatResult {
  if (rawValue === null || rawValue === undefined) {
    return { display: "—", suffix: "", numericValue: null };
  }

  const str = String(rawValue).trim();
  const num = Number(str);
  if (isNaN(num)) {
    return { display: str, suffix: "", numericValue: null };
  }

  // Special: uptime
  if (unitId === "time/uptime") {
    return formatUptime(num);
  }

  // Special: percent 0-1 → multiply by 100
  if (unitId === "none/percent01") {
    return { display: (num * 100).toFixed(decimals), suffix: "%", numericValue: num };
  }

  const unit = getUnitById(unitId);
  if (!unit || unit.steps.length === 0) {
    return { display: num.toFixed(decimals), suffix: "", numericValue: num };
  }

  // Single step → no scaling
  if (unit.steps.length === 1) {
    return { display: num.toFixed(decimals), suffix: unit.steps[0].suffix, numericValue: num };
  }

  // Pick best step: largest factor where abs(value/factor) >= 1
  const abs = Math.abs(num);
  let bestStep = unit.steps[0];
  for (let i = unit.steps.length - 1; i >= 0; i--) {
    if (unit.steps[i].factor <= 0) continue;
    if (abs / unit.steps[i].factor >= 1 || i === 0) {
      bestStep = unit.steps[i];
      break;
    }
  }

  const scaled = num / bestStep.factor;
  return { display: scaled.toFixed(decimals), suffix: bestStep.suffix, numericValue: num };
}

function formatUptime(totalSeconds: number): SmartFormatResult {
  const s = Math.abs(Math.floor(totalSeconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);

  if (days > 0) return { display: String(days), suffix: `d ${hours}h`, numericValue: totalSeconds };
  if (hours > 0) return { display: String(hours), suffix: `h ${minutes}m`, numericValue: totalSeconds };
  return { display: String(minutes), suffix: "m", numericValue: totalSeconds };
}
