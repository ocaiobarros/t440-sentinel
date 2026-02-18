/**
 * Thermal color scale with smooth RGB linear interpolation (Lerp).
 * Maps temperature values to colors grau-a-grau:
 *   ≤10°C Blue → 20°C Cyan → 25°C Yellow → 30°C Orange → ≥35°C Red
 */

interface RGBStop { temp: number; r: number; g: number; b: number }

const THERMAL_STOPS: RGBStop[] = [
  { temp: 10, r: 0,   g: 0,   b: 255 }, // Blue
  { temp: 20, r: 0,   g: 255, b: 255 }, // Cyan
  { temp: 25, r: 255, g: 255, b: 0   }, // Yellow
  { temp: 30, r: 255, g: 165, b: 0   }, // Orange
  { temp: 35, r: 255, g: 0,   b: 0   }, // Red
];

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function getRGB(tempC: number): [number, number, number] {
  if (tempC <= THERMAL_STOPS[0].temp) {
    const s = THERMAL_STOPS[0];
    return [s.r, s.g, s.b];
  }
  const last = THERMAL_STOPS[THERMAL_STOPS.length - 1];
  if (tempC >= last.temp) return [last.r, last.g, last.b];

  for (let i = 0; i < THERMAL_STOPS.length - 1; i++) {
    const a = THERMAL_STOPS[i];
    const b = THERMAL_STOPS[i + 1];
    if (tempC >= a.temp && tempC <= b.temp) {
      const t = (tempC - a.temp) / (b.temp - a.temp);
      return [lerp(a.r, b.r, t), lerp(a.g, b.g, t), lerp(a.b, b.b, t)];
    }
  }
  return [128, 128, 128];
}

/** Get interpolated thermal color as an rgb() CSS string. */
export function getThermalColor(tempC: number): string {
  const [r, g, b] = getRGB(tempC);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Get a neon glow text-shadow + box-shadow string. */
export function getThermalGlow(tempC: number): string {
  const c = getThermalColor(tempC);
  return `0 0 15px ${c}, 0 0 5px ${c}`;
}

/** Build a full inline style object for thermal neon effect. */
export function getThermalStyle(tempC: number): React.CSSProperties {
  const c = getThermalColor(tempC);
  return {
    color: c,
    textShadow: `0 0 15px ${c}80, 0 0 5px ${c}`,
    filter: `drop-shadow(0 0 10px ${c}66)`,
    transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
  };
}

/** Check if a widget title/key looks like a temperature metric. */
export function isThermalMetric(title: string, unit?: string): boolean {
  const lower = (title + " " + (unit || "")).toLowerCase();
  return /temp|°c|°f|celsius|thermal|inlet|exhaust|cpu\s*temp/i.test(lower);
}
