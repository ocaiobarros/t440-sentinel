/**
 * Translates raw Zabbix values into visual states using user-defined color maps.
 * NO automatic assumptions - the user controls ALL mappings.
 */

export interface MappedStatus {
  color: string;
  label: string;
  isCritical: boolean;
}

/** Color map entry with optional label */
export interface ColorMapEntry {
  color: string;
  label?: string;
}

/**
 * Parse color_map which can be:
 * - Record<string, string>  (legacy: value → hex color)
 * - Record<string, { color: string; label?: string }>  (new: value → { color, label })
 */
function parseColorMap(colorMap: Record<string, unknown>): Record<string, ColorMapEntry> {
  const result: Record<string, ColorMapEntry> = {};
  for (const [key, val] of Object.entries(colorMap)) {
    if (typeof val === "string") {
      result[key] = { color: val };
    } else if (val && typeof val === "object" && "color" in (val as Record<string, unknown>)) {
      result[key] = val as ColorMapEntry;
    }
  }
  return result;
}

/**
 * Pure lookup: value → color from the user's color_map.
 * If no match, returns the fallback color + "UNKNOWN" label.
 * Never assumes what 0 or 1 means — that's the user's decision.
 */
export function getMappedStatus(
  value: unknown,
  colorMap: Record<string, unknown> | undefined,
  defaultColor = "#A0A0A0",
  defaultLabel = "N/A",
): MappedStatus {
  if (value === null || value === undefined) {
    return { color: defaultColor, label: defaultLabel, isCritical: false };
  }

  const normalized = String(value).trim();

  if (colorMap) {
    const parsed = parseColorMap(colorMap);
    const entry = parsed[normalized];
    if (entry) {
      return {
        color: entry.color,
        label: entry.label || normalized,
        isCritical: entry.color.toLowerCase() === "#ff4444" || entry.color.toLowerCase() === "#8b0000",
      };
    }
  }

  return {
    color: defaultColor,
    label: normalized || defaultLabel,
    isCritical: false,
  };
}

/**
 * Extracts the raw value from a telemetry cache entry.
 * Handles both { value: X } objects and plain values.
 */
export function extractRawValue(data: unknown): string | null {
  if (data === null || data === undefined) return null;
  if (typeof data === "object" && data !== null && "value" in (data as Record<string, unknown>)) {
    return String((data as Record<string, unknown>).value);
  }
  return String(data);
}
