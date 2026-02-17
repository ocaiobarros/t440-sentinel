/**
 * Translates raw Zabbix values into visual states using user-defined color maps.
 * NO automatic assumptions - the user controls ALL mappings.
 */

export interface MappedStatus {
  color: string;
  label: string;
  isCritical: boolean;
}

/**
 * Pure lookup: value → color from the user's color_map.
 * If no match, returns the fallback color + "UNKNOWN" label.
 * Never assumes what 0 or 1 means — that's the user's decision.
 */
export function getMappedStatus(
  value: unknown,
  colorMap: Record<string, string> | undefined,
  defaultColor = "#A0A0A0",
  defaultLabel = "N/A",
): MappedStatus {
  if (value === null || value === undefined) {
    return { color: defaultColor, label: defaultLabel, isCritical: false };
  }

  const normalized = String(value).trim();

  if (colorMap) {
    const matchedColor = colorMap[normalized];
    if (matchedColor) {
      return {
        color: matchedColor,
        label: normalized,
        isCritical: matchedColor.toLowerCase() === "#ff4444" || matchedColor.toLowerCase() === "#8b0000",
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
