/**
 * Auto-suffix detection & smart formatting for Zabbix telemetry values.
 * Handles temperature, voltage, bytes, uptime, percentage, and custom units.
 */

export interface FormattedValue {
  /** The formatted numeric string (or raw label for non-numeric values) */
  display: string;
  /** The unit/suffix to render separately (e.g. "°C", "GB", "d 3h") */
  suffix: string;
  /** The raw numeric value for color interpolation (null if non-numeric) */
  numericValue: number | null;
}

// ── Byte scaling (base 1024) ──
const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

function scaleBytes(value: number, decimals: number): { scaled: string; unit: string } {
  if (value === 0) return { scaled: "0", unit: "B" };
  const abs = Math.abs(value);
  const exp = Math.min(Math.floor(Math.log(abs) / Math.log(1024)), BYTE_UNITS.length - 1);
  const scaled = value / Math.pow(1024, exp);
  return { scaled: scaled.toFixed(decimals), unit: BYTE_UNITS[exp] };
}

// ── Uptime: seconds → human-readable ──
function formatUptime(totalSeconds: number): { display: string; suffix: string } {
  const s = Math.abs(Math.floor(totalSeconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);

  if (days > 0) return { display: String(days), suffix: `d ${hours}h` };
  if (hours > 0) return { display: String(hours), suffix: `h ${minutes}m` };
  return { display: String(minutes), suffix: "m" };
}

// ── Context detection helpers ──
function matchesAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

type DetectedContext = "temperature" | "voltage" | "amperage" | "bytes" | "bps" | "uptime" | "percent" | null;

function detectContext(title: string, zabbixUnit?: string): DetectedContext {
  const u = (zabbixUnit || "").trim().toLowerCase();
  const t = title.toLowerCase();

  // Temperature
  if (u === "c" || u === "°c" || matchesAny(t, ["temperatura", "temperature", "temp"])) return "temperature";

  // Voltage
  if (u === "v" || matchesAny(t, ["voltag", "bateria", "battery", "voltage"])) return "voltage";

  // Amperage
  if (u === "a" || u === "amp" || matchesAny(t, ["amperag", "ampere", "corrente", "current", "descarga", "discharge"])) return "amperage";

  // Bytes (disk/memory)
  if (["b", "bytes"].includes(u) || matchesAny(t, ["memória", "memory", "disco", "disk", "storage", "swap"])) return "bytes";

  // Bits-per-second (network traffic)
  if (["bps", "bits/s", "b/s"].includes(u) || matchesAny(t, ["tráfego", "traffic", "network", "interface", "bandwidth"])) return "bps";

  // Uptime
  if (u === "s" || matchesAny(t, ["uptime"])) return "uptime";

  // Percentage
  if (u === "%" || matchesAny(t, ["cpu", "ram", "utilização", "utilization", "usage", "%"])) return "percent";

  return null;
}

/**
 * Core formatting function.
 *
 * @param rawValue   - The raw value from Zabbix (string or number)
 * @param title      - Widget title (used for context detection)
 * @param options    - Overrides from the Builder
 */
export function formatDynamicValue(
  rawValue: unknown,
  title: string,
  options: {
    /** Manual unit override from Builder — highest priority */
    manualUnit?: string;
    /** Zabbix-provided unit string */
    zabbixUnit?: string;
    /** Decimal places (applied after scaling) */
    decimals?: number;
    /** If true, value is already a mapped label — skip math */
    isMappedLabel?: boolean;
  } = {},
): FormattedValue {
  const { manualUnit, zabbixUnit, decimals = 2, isMappedLabel } = options;

  // ── 1. Non-numeric / mapped labels: return as-is ──
  if (rawValue === null || rawValue === undefined) {
    return { display: "—", suffix: "", numericValue: null };
  }

  const strVal = String(rawValue).trim();

  if (isMappedLabel) {
    return { display: strVal, suffix: "", numericValue: null };
  }

  const num = Number(strVal);
  if (isNaN(num)) {
    return { display: strVal, suffix: "", numericValue: null };
  }

  // ── 2. Manual unit override (highest priority) ──
  if (manualUnit) {
    // Even with manual unit, apply byte/uptime logic if the manual unit hints at it
    const mu = manualUnit.trim();
    return { display: num.toFixed(decimals), suffix: mu, numericValue: num };
  }

  // ── 3. Auto-detect context ──
  const ctx = detectContext(title, zabbixUnit);

  switch (ctx) {
    case "temperature":
      return { display: num.toFixed(decimals), suffix: "°C", numericValue: num };

    case "voltage":
      return { display: num.toFixed(decimals), suffix: "V", numericValue: num };

    case "amperage":
      return { display: num.toFixed(decimals), suffix: "A", numericValue: num };

    case "bytes": {
      const { scaled, unit } = scaleBytes(num, decimals);
      return { display: scaled, suffix: unit, numericValue: num };
    }

    case "bps": {
      // Scale bits similarly to bytes but with bps units
      const BPS_UNITS = ["bps", "Kbps", "Mbps", "Gbps", "Tbps"];
      const abs = Math.abs(num);
      if (abs === 0) return { display: "0", suffix: "bps", numericValue: num };
      const exp = Math.min(Math.floor(Math.log(abs) / Math.log(1000)), BPS_UNITS.length - 1);
      const scaled = num / Math.pow(1000, exp);
      return { display: scaled.toFixed(decimals), suffix: BPS_UNITS[exp], numericValue: num };
    }

    case "uptime": {
      const { display, suffix } = formatUptime(num);
      return { display, suffix, numericValue: num };
    }

    case "percent":
      return { display: num.toFixed(decimals), suffix: "%", numericValue: num };

    default: {
      // Fallback: if zabbixUnit exists, use it; otherwise show plain number
      const fallbackUnit = zabbixUnit?.trim() || "";
      // Auto-scale large numbers that look like bytes (>10000 with no unit)
      if (!fallbackUnit && num > 10000 && matchesAny(title, ["disco", "disk", "memória", "memory", "storage"])) {
        const { scaled, unit } = scaleBytes(num, decimals);
        return { display: scaled, suffix: unit, numericValue: num };
      }
      return { display: num.toFixed(decimals), suffix: fallbackUnit, numericValue: num };
    }
  }
}
